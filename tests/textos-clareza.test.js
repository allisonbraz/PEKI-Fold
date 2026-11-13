"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers/characterization-cases.js");
const { harness } = require("./helpers/ui-flow-harness.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const source = read("tests/fixtures/ui-render/4HHB.pdb");

function flow() {
  const h = harness(), entries = [], listeners = {};
  let index = 0;
  h.context.URL = URL;
  function location(value) { const u = new URL(value); h.context.location = { href: u.href, search: u.search }; }
  location("https://peki.test/");
  h.context.history = {
    get state() { return entries[index]?.state; },
    replaceState(state, _title, value) { entries[index] = { state, url: String(value) }; location(value); },
    pushState(state, _title, value) { entries.splice(++index); entries.push({ state, url: String(value) }); location(value); },
  };
  h.context.window.addEventListener = (type, fn) => { listeners[type] = fn; };
  h.context.lib3D = async () => { throw new Error("3D indisponível no teste"); };
  h.context.fetch = async () => ({ ok: true, status: 200, text: async () => source });
  h.get("enriquecerMetaRCSB = async () => {}");
  h.get("init()");
  return { ...h, async back() {
    index--; location(entries[index].url);
    await listeners.popstate({ state: entries[index].state }); await tick();
  } };
}

for (const fallback of [false, true]) {
  test("Voltar fecha exportação e restaura o acionador visível: " + (fallback ? "fallback" : "nativo"), async () => {
    const h = flow(), modal = h.el("export-modal");
    if (fallback) { modal.showModal = undefined; modal.close = undefined; }
    await h.get('analisar({ pdbId: "4HHB" })');
    await h.get('analisar({ pdbId: "1CRN" })');
    h.el("btn-export").click();
    assert.equal(modal.open, true);
    await h.back();
    assert.equal(modal.open, false);
    assert.equal(h.get("estado.pdbId"), "4HHB");
    assert.equal(h.context.document.activeElement, h.el("btn-export"));
    assert.equal(h.get("exportAcionador"), null);
    modal.dispatch("close");
    assert.equal(h.context.document.activeElement, h.el("btn-export"));
  });

  test("Voltar usa o título quando o acionador fica oculto: " + (fallback ? "fallback" : "nativo"), async () => {
    const h = flow(), modal = h.el("export-modal");
    if (fallback) { modal.showModal = undefined; modal.close = undefined; }
    await h.get('analisar({ pdbId: "4HHB" })');
    h.el("btn-export").click();
    await h.back();
    assert.equal(modal.open, false);
    assert.equal(h.el("workspace").hidden, true);
    assert.equal(h.context.document.activeElement, h.el("entrada-titulo"));
    modal.dispatch("close");
    assert.equal(h.context.document.activeElement, h.el("entrada-titulo"));
  });
}

test("fechar exportação usa o título para acionador removido, desabilitado ou sem área visível", () => {
  for (const situation of ["removido", "desabilitado", "sem área", "ancestral oculto"]) {
    const h = flow(), button = h.el("btn-export");
    h.get('abrirTela("workspace", "ws-nome")');
    button.click();
    if (situation === "removido") button.isConnected = false;
    if (situation === "desabilitado") button.disabled = true;
    if (situation === "sem área") button.getClientRects = () => [];
    if (situation === "ancestral oculto") button.parentElement.hidden = true;
    h.get("fecharExport()");
    assert.equal(h.context.document.activeElement, h.el("ws-nome"), situation);
  }
});

test("upload espelha descrições, invalidez e ocupação no botão visível", async () => {
  const h = flow(), input = h.el("file-input"), button = h.el("btn-file");
  let resolve;
  h.context.lerArquivo = () => new Promise((r) => { resolve = r; });
  const pending = h.get('analisar({ file: { name: "4HHB.pdb" } })');
  for (const el of [input, button]) {
    assert.equal(el.getAttribute("aria-busy"), "true");
    assert.equal(el.getAttribute("aria-invalid"), "false");
    assert.match(el.getAttribute("aria-describedby"), /upload-dica erro loading sucesso/);
  }
  assert.equal(h.el("loading").parentElement.id, "feedback-arquivo");
  resolve("sem coordenadas"); await pending;
  for (const el of [input, button]) {
    assert.equal(el.getAttribute("aria-invalid"), "true");
    assert.equal(el.getAttribute("aria-busy"), "false");
  }
  h.context.lerArquivo = async () => source;
  await h.get('analisar({ file: { name: "4HHB.pdb" } })'); await tick();
  for (const el of [input, button]) {
    assert.equal(el.getAttribute("aria-invalid"), "false");
    assert.equal(el.getAttribute("aria-busy"), "false");
  }
});

test("ações distinguem JSON local e relatório; a navegação usa nomes consistentes", () => {
  const html = read("docs/index.html");
  const h = flow();
  assert.match(html, /id="btn-guardar-analise"[^>]+>Salvar JSON<\/button>/);
  for (const id of ["btn-export", "btn-cmp-export"]) {
    assert.match(html, new RegExp('id="' + id + '"[^>]+>Exportar relatório<\\/button>'));
    assert.ok(h.el(h.el(id).getAttribute("aria-describedby")));
  }
  assert.match(html, /id="arquivos-dica"[^>]*>JSON: salve no seu computador para reabrir depois\. Relatório: compartilhe em PDF ou Markdown\./);
  for (const id of ["btn-novo", "btn-cmp-novo", "btn-an-voltar", "ens-novo"]) {
    assert.match(html, new RegExp('id="' + id + '"[^>]+>Início<\\/button>'));
  }
  assert.match(html, /id="btn-abrir-analises"[^>]+>Comparar JSONs<\/button>/);
  assert.match(html, /id="an-titulo"[^>]+>Comparar JSONs<\/h2>/);
  assert.match(html, /id="ens-calcular"[^>]+>Detectar pockets \(DoGSiteScorer\)<\/button>/);
  assert.match(read("docs/export.js"), /reabrir em Comparar JSONs/);
  assert.doesNotMatch(html, />[^<]*(?:Guardar análise|Nova análise|Importar JSON|Obter bolsões)[^<]*</);
});

test("revisão científica fica separada da publicação e conserva os avisos existentes", () => {
  const html = read("docs/index.html"), review = read("docs-revisao/textos-para-revisao.md");
  assert.equal(review.split("\n").filter((line) => line.startsWith("| docs/")).length, 20);
  assert.match(review, /Nenhuma proposta desta tabela foi aplicada/);
  assert.match(html, /PEKI Fold não é ferramenta de docking\./);
  assert.match(html, /Escore de docking não é afinidade\./);
  assert.match(html, /Estruturas redundantes inflam a contagem\./);
  assert.match(html, /Métrica ausente não vira zero\./);
});

test("celulares e tablets têm alvos de 44 px, rótulos clicáveis e controles que quebram linha", () => {
  const css = read("docs/style.css");
  const mobile = css.slice(css.lastIndexOf("@media (max-width: 980px)"));
  assert.match(mobile, /button, a\[href\], summary, \[role="button"\]/);
  assert.match(mobile, /min-width: 44px;\s*min-height: 44px;/);
  assert.match(mobile, /input:not\(\[type="hidden"\]\):not\(\[type="file"\]\):not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(mobile, /select, textarea/);
  assert.match(mobile, /label:has\(> input\[type="checkbox"\]\), label:has\(> input\[type="radio"\]\)/);
  assert.match(mobile, /min-width: 44px; min-height: 44px; max-width: 100%/);
  assert.match(mobile, /\.radio-row, \.viewer-controls \{ flex-wrap: wrap; \}/);
  assert.match(mobile, /\.exemplos \{[^}]*flex-wrap: wrap/);
  assert.match(mobile, /\.entrada-row \.primary-btn \{ white-space: normal; \}/);
});
