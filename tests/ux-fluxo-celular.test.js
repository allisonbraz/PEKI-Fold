"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers/characterization-cases.js");
const { harness } = require("./helpers/ui-flow-harness.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sources = Object.fromEntries(["4HHB", "1CRN"].map((id) => [id, read("tests/fixtures/ui-render/" + id + ".pdb")]));

function flow(url = "https://peki.test/") {
  const h = harness(), listeners = {}, entries = [];
  let index = 0;
  h.context.URL = URL;
  function location(value) { const u = new URL(value); h.context.location = { href: u.href, search: u.search }; }
  location(url);
  h.context.history = {
    get state() { return entries[index]?.state; },
    replaceState(state, _title, value) { entries[index] = { state, url: String(value) }; location(value); },
    pushState(state, _title, value) { entries.splice(++index); entries.push({ state, url: String(value) }); location(value); },
  };
  h.context.window.addEventListener = (type, fn) => { listeners[type] = fn; };
  h.context.lib3D = async () => { throw new Error("3D indisponível no teste"); };
  const requests = [];
  h.context.fetch = async (value) => {
    requests.push(String(value));
    const id = String(value).match(/\/(4HHB|1CRN)\.pdb$/)?.[1];
    if (!id) throw new Error("URL inesperada no teste");
    return { ok: true, status: 200, text: async () => sources[id] };
  };
  h.get("enriquecerMetaRCSB = async () => {}");
  return { ...h, entries, requests, async pop(delta) {
    index += delta; location(entries[index].url);
    await listeners.popstate({ state: entries[index].state });
    await tick();
  } };
}

test("entrada coloca o campo antes das explicações e mantém mensagens junto da ação", async () => {
  const html = read("docs/index.html"), css = read("docs/style.css");
  assert.ok(html.indexOf('id="pdb-id"') < html.indexOf("Sobre a busca e os limites"));
  assert.ok(html.indexOf('id="feedback-busca"') < html.indexOf('id="dropzone"'));
  assert.match(css, /\.hero-logo\s*\{\s*width:\s*64px/);
  const h = flow(); h.get("init()");
  await h.get('compararProteinas("4HHB")');
  assert.equal(h.el("erro").parent.id, "feedback-comparacao");
  assert.equal(h.el("cmp-ids").getAttribute("aria-invalid"), "true");
  assert.match(h.el("cmp-ids").getAttribute("aria-describedby"), /erro loading sucesso/);
  assert.doesNotMatch(h.el("pdb-id").getAttribute("aria-describedby"), /erro/);
  h.get('acaoCampo("")');
  assert.equal(h.el("erro").parent.id, "feedback-busca");
  assert.equal(h.el("pdb-id").getAttribute("aria-invalid"), "true");
  h.el("pdb-id").dispatch("input");
  assert.equal(h.el("pdb-id").getAttribute("aria-invalid"), "false");
});

test("upload inválido recebe feedback local, enquanto erro de rede não invalida o código", async () => {
  const h = flow(); h.get("init()");
  h.get('lerArquivo = async () => "sem coordenadas"');
  await h.get('analisar({ file: { name: "4HHB.pdb" } })');
  assert.equal(h.el("erro").parent.id, "feedback-arquivo");
  assert.equal(h.el("file-input").getAttribute("aria-invalid"), "true");
  assert.match(h.el("btn-file").getAttribute("aria-describedby"), /erro/);
  h.context.fetch = async () => { throw new Error("rede indisponível"); };
  await h.get('analisar({ pdbId: "4HHB" })');
  assert.equal(h.el("erro").parent.id, "feedback-busca");
  assert.equal(h.el("pdb-id").getAttribute("aria-invalid"), "false");
  assert.equal(h.el("loading").hidden, true);
});

test("carregamento e sucesso são anunciados perto da ação e no título da estrutura", async () => {
  const h = flow(); h.get("init()");
  let resolve;
  h.context.fetch = () => new Promise((r) => { resolve = r; });
  const pending = h.get('analisar({ pdbId: "4HHB" })');
  assert.equal(h.el("loading").hidden, false);
  assert.equal(h.el("loading").parent.id, "feedback-busca");
  assert.equal(h.el("pdb-id").getAttribute("aria-busy"), "true");
  assert.equal(h.el("loading").getAttribute("role"), "status");
  resolve({ ok: true, status: 200, text: async () => sources["4HHB"] });
  await pending; await tick();
  assert.equal(h.el("loading").hidden, true);
  assert.equal(h.context.document.activeElement, h.el("ws-nome"));
  assert.match(h.el("ws-status").textContent, /Resultados disponíveis/);
});

test("3D pode ser recolhido por botão e o atalho leva aos resultados nas duas telas", () => {
  const h = flow(); h.get("init()");
  for (const [button, content, link, title] of [
    ["btn-recolher-3d", "viewer-conteudo", "ir-resultados", "resultados-titulo"],
    ["btn-cmp-recolher-3d", "cmp-viewer-conteudo", "ir-cmp-resultados", "cmp-resultados-titulo"],
  ]) {
    h.el(button).click();
    assert.equal(h.el(content).hidden, true);
    assert.equal(h.el(button).getAttribute("aria-expanded"), "false");
    h.el(button).click();
    assert.equal(h.el(content).hidden, false);
    assert.equal(h.el(button).getAttribute("aria-expanded"), "true");
    h.el(link).click();
    assert.equal(h.context.document.activeElement, h.el(title));
  }
  assert.match(read("docs/style.css"), /#viewer\.viewer, \.cmp-viewer\s*\{\s*height: 45vh !important; min-height: 260px/);
});

test("3D pendente ou falho não bloqueia texto; tentar de novo não recalcula os dados", async () => {
  const h = flow(); h.get("init()");
  let reject;
  h.context.lib3D = () => new Promise((_resolve, r) => { reject = r; });
  await h.get('analisar({ pdbId: "4HHB" })');
  assert.equal(h.el("workspace").hidden, false);
  assert.match(h.el("tab-stats").innerHTML, /<table>/);
  assert.equal(h.el("viewer-status").dataset.estado, "carregando");
  const original = h.get("JSON.stringify(estado.dados)");
  reject(new Error("CDN indisponível")); await tick();
  assert.equal(h.el("viewer-status").dataset.estado, "erro");
  assert.match(h.el("viewer-status").innerHTML, /Tentar de novo/);
  h.context.lib3D = async () => {};
  h.get("renderViewer = () => { estado.viewer = { resize() {}, render() {} }; }");
  h.el("viewer-status").querySelector("button").click(); await tick();
  assert.equal(h.el("viewer-status").dataset.estado, "ok");
  assert.equal(h.context.document.activeElement, h.el("viewer-status"));
  assert.equal(h.el("viewer-status").textContent, "Visualização carregada.");
  assert.equal(h.get("JSON.stringify(estado.dados)"), original);
});

test("falha de gráfico abre a tabela equivalente; retry recupera o gráfico sem perder escopo", async () => {
  const h = flow(); h.get("init()");
  h.context.libPlotly = async () => { throw new Error("gráfico indisponível"); };
  await h.get('analisar({ pdbId: "4HHB" })'); await tick();
  assert.equal(h.el("aa-grafico-status").dataset.estado, "erro");
  assert.equal(h.el("aa-tabela").hidden, false);
  assert.equal(h.el("btn-aa-tabela").getAttribute("aria-expanded"), "true");
  assert.equal((h.el("aa-tabela").innerHTML.match(/scope="row"/g) || []).length, 20);
  h.el("aa-cadeia").value = "A";
  await h.get("plotAA()");
  const table = h.el("aa-tabela").innerHTML;
  h.context.libPlotly = async () => {};
  h.el("aa-grafico-status").querySelector("button").click(); await tick();
  assert.equal(h.el("aa-grafico-status").dataset.estado, "ok");
  assert.equal(h.context.document.activeElement, h.el("aa-grafico-status"));
  assert.equal(h.el("aa-tabela").innerHTML, table);
  assert.equal(h.el("aa-cadeia").value, "A");
});

test("comparação abre tabelas e texto apesar das duas bibliotecas indisponíveis", async () => {
  const h = flow(); h.get("init()");
  h.context.libPlotly = async () => { throw new Error("gráfico indisponível"); };
  await h.get('compararProteinas("4HHB 1CRN")'); await tick();
  assert.equal(h.el("comparacao").hidden, false);
  assert.equal(h.context.document.activeElement, h.el("cmp-titulo"));
  assert.match(h.el("ctab-stats").innerHTML, /<table>/);
  assert.equal(h.el("cmp-aa-tabela").hidden, false);
  assert.equal((h.el("cmp-aa-tabela").innerHTML.match(/scope="row"/g) || []).length, 40);
  for (const id of ["cmp-viewers-status", "cmp-graf-aa-status", "cmp-graf-stats-status"]) {
    assert.equal(h.el(id).dataset.estado, "erro");
    assert.match(h.el(id).innerHTML, /Tentar de novo/);
  }
});

test("ensemble mantém o relatório e oferece retry quando a biblioteca 3D falha", async () => {
  const h = flow(); h.get("init()"); h.load("ensemble-analysis");
  const marker = "  return { ativo, invalidarConsultas, aoFechar, abrirPorUrl, abrirExemplo };";
  const source = read("docs/ensemble-ui.js");
  assert.equal(source.split(marker).length, 2);
  h.get(source.replace(marker, "  globalThis.uxEnsemble = { desenhar, relatorio: () => JSON.stringify(sessao.relatorio) };\n" + marker));
  h.get("EnsembleUI.abrirExemplo()");
  const before = h.get("uxEnsemble.relatorio()");
  await h.get("uxEnsemble.desenhar({})");
  assert.match(h.el("ens-viewer-status").innerHTML, /Tentar de novo/);
  assert.equal(h.get("uxEnsemble.relatorio()"), before);
  assert.equal(h.el("ens-viewer").hidden, true);
});

test("Voltar e Avançar restauram busca, estrutura e comparação sem novos downloads", async () => {
  const h = flow(); h.get("init()");
  h.el("pdb-id").value = "4HHB";
  await h.get('analisar({ pdbId: "4HHB" })');
  h.get("irParaHome()");
  h.el("cmp-ids").value = "4HHB 1CRN";
  await h.get('compararProteinas("4HHB 1CRN")');
  assert.equal(h.entries.length, 4);
  const downloads = h.requests.length;
  await h.pop(-1);
  assert.equal(h.el("entrada").hidden, false);
  assert.equal(h.el("cmp-ids").value, "4HHB 1CRN");
  assert.equal(h.context.document.activeElement, h.el("entrada-titulo"));
  await h.pop(-1);
  assert.equal(h.el("workspace").hidden, false);
  assert.equal(h.get("estado.pdbId"), "4HHB");
  assert.equal(h.context.document.activeElement, h.el("ws-nome"));
  await h.pop(-1);
  assert.equal(h.el("pdb-id").value, "4HHB");
  await h.pop(1); await h.pop(1); await h.pop(1);
  assert.equal(h.el("comparacao").hidden, false);
  assert.equal(h.context.document.activeElement, h.el("cmp-titulo"));
  assert.equal(h.requests.length, downloads);
  assert.equal(h.entries.length, 4, "popstate não cria entradas novas");
});

test("link direto usa replaceState inicial e arquivo local explica a seleção após recarregar", async () => {
  const h = flow("https://peki.test/?pdb=4HHB");
  h.get("init()"); await tick();
  assert.equal(h.entries.length, 1);
  assert.equal(h.get("estado.pdbId"), "4HHB");
  assert.equal(h.el("workspace").hidden, false);
  const local = flow("https://peki.test/?pdb=arquivo");
  local.get("init()");
  assert.match(local.el("erro").textContent, /arquivo local/);
  assert.equal(local.requests.length, 0);
});

test("Voltar recupera o nome pesquisado e a lista de resultados escolhida", async () => {
  const h = flow(); h.get("init()"); h.load("busca-nome");
  h.el("pdb-id").value = "hemoglobin";
  h.get('buscaNomeAtual = { nome: "hemoglobin", total: 1, resultados: [{ id: "4HHB", titulo: "hemoglobin" }] }');
  await h.get('analisar({ pdbId: "4HHB" })');
  await h.pop(-1);
  assert.equal(h.el("pdb-id").value, "hemoglobin");
  assert.equal(h.el("busca-nome").hidden, false);
  assert.match(h.el("busca-nome").innerHTML, /data-busca-id="4HHB"/);
  assert.equal(h.context.document.activeElement, h.el("entrada-titulo"));
});

test("Voltar com exportação aberta fecha o diálogo sem roubar o foco do título", async () => {
  const h = flow(); h.get("init()");
  await h.get('analisar({ pdbId: "4HHB" })');
  h.el("btn-export").click();
  assert.equal(h.el("export-modal").open, true);
  await h.pop(-1);
  assert.equal(h.el("export-modal").open, false);
  assert.equal(h.context.document.activeElement, h.el("entrada-titulo"));
});

test("popstate invalida resposta de download antiga sem reabrir a tela abandonada", async () => {
  const h = flow(); h.get("init()");
  await h.get('analisar({ pdbId: "4HHB" })'); h.get("irParaHome()");
  let resolve;
  h.context.fetch = () => new Promise((r) => { resolve = r; });
  const pending = h.get('analisar({ pdbId: "1CRN" })');
  await h.pop(-1);
  resolve({ ok: true, status: 200, text: async () => sources["1CRN"] });
  await pending;
  assert.equal(h.get("estado.pdbId"), "4HHB");
  assert.equal(h.el("workspace").hidden, false);
  assert.equal(h.context.document.activeElement, h.el("ws-nome"));
});
