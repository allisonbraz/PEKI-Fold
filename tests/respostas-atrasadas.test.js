"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { browser, read, json } = require("./helpers/characterization-cases.js");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const pdb = read("tests/fixtures/ui-render/1CRN.pdb");
const response = (text) => ({ ok: true, status: 200, text: async () => text });

function harness() {
  const h = browser(["pdb-analysis", "structure-model", "dogsite-client", "viewer", "comparison", "app"]);
  const elements = new Map();
  h.element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, disabled: false, textContent: "", innerHTML: "", value: "", dataset: {}, style: {}, options: [],
      appendChild(node) { this.options.push(node); return node; },
      addEventListener() {}, removeEventListener() {}, setAttribute() {},
      querySelector: (selector) => h.element(selector.replace(/^#/, "")),
      querySelectorAll() { return []; },
    });
    return elements.get(id);
  };
  h.context.document.createElement = () => h.element(Symbol("node"));
  h.context.document.getElementById = h.element;
  h.context.document.querySelector = (selector) => h.element(selector.replace(/^#/, ""));
  h.context.document.body = { dataset: {}, addEventListener() {} };
  h.context.window.scrollTo = () => {};
  h.context.localStorage = { getItem: () => null, setItem() {} };
  h.context.lib3D = async () => {};
  h.context.libPlotly = async () => {};
  h.context.urls = [];
  h.get('atualizarURL = (...args) => urls.push(args)');
  for (const name of ["renderMeta", "renderVisao", "renderViewer", "renderCadeias", "renderStats",
    "renderAA", "renderPockets", "renderMotivos", "trocarAba", "renderCmpViewers", "trocarAbaCmp",
    "renderCmpStats", "renderCmpAA", "renderTabelaPockets", "renderCmpPockets"]) {
    h.get(name + " = () => {}");
  }
  h.context.rendered = [];
  h.get('renderTabelaPockets = (p) => rendered.push(p); renderCmpPockets = (p) => rendered.push(p)');
  h.get('enriquecerMetaRCSB = async () => {}');
  h.load = (file, bridge) => {
    let source = read("docs/" + file + ".js");
    if (bridge) {
      const marker = file === "quality-ui" ? "  return {\n    aoCarregar," : "  return { ativo,";
      assert.equal(source.split(marker).length, 2);
      source = source.replace(marker, bridge + "\n" + marker);
    }
    vm.runInContext(source, h.context, { filename: file + ".js" });
  };
  return h;
}

for (const lateError of [false, true]) test("RCSB: resposta " + (lateError ? "com erro" : "válida") + " antiga não substitui a estrutura recente", async () => {
  const h = harness(), first = deferred(), second = deferred();
  h.context.fetch = (url) => url.includes("1CRN") ? first.promise : second.promise;
  const old = h.get('analisar({ pdbId: "1CRN" })');
  const recent = h.get('analisar({ pdbId: "4HHB" })');
  second.resolve(response(pdb));
  await recent;
  assert.equal(h.get("estado.pdbId"), "4HHB");
  assert.equal(h.element("ws-nome").textContent, "4HHB.pdb");
  const before = json(h.context.urls);
  if (lateError) first.reject(new Error("erro antigo")); else first.resolve(response(pdb));
  await old;
  assert.equal(h.get("estado.pdbId"), "4HHB");
  assert.equal(h.element("ws-nome").textContent, "4HHB.pdb");
  assert.equal(h.element("erro").hidden, true);
  assert.deepEqual(json(h.context.urls), before);
});

test("RCSB: resposta substituída não desliga o indicador da consulta pendente", async () => {
  const h = harness(), oldBody = deferred(), recentBody = deferred();
  let n = 0;
  h.context.fetch = async () => ({ ...response(pdb), text: () => (++n === 1 ? oldBody : recentBody).promise });
  const old = h.get('analisar({ pdbId: "1CRN" })');
  await tick();
  const recent = h.get('analisar({ pdbId: "4HHB" })');
  await tick();
  oldBody.resolve(pdb);
  await old;
  assert.equal(h.element("loading").hidden, false);
  assert.equal(h.get("estado.pdbId"), null);
  recentBody.resolve(pdb);
  await recent;
  assert.equal(h.get("estado.pdbId"), "4HHB");
  assert.equal(h.element("loading").hidden, true);
});

test("biblioteca 3D atrasada e retorno à home não reabrem a estrutura antiga", async () => {
  const h = harness(), lib = deferred();
  h.context.fetch = async () => response(pdb);
  h.context.lib3D = () => lib.promise;
  const old = h.get('analisar({ pdbId: "1CRN" })');
  await tick();
  assert.equal(h.get("estado.pdbId"), "1CRN", "texto abre antes da biblioteca 3D");
  assert.equal(h.element("workspace").hidden, false);
  h.get("irParaHome()");
  lib.resolve();
  await old;
  assert.equal(h.get("estado.pdbId"), "1CRN");
  assert.equal(h.element("workspace").hidden, true);
  assert.equal(h.element("entrada").hidden, false);
  assert.equal(h.element("loading").hidden, true);
});

test("comparação: resposta antiga não altera a comparação mais recente nem sua URL", async () => {
  const h = harness(), first = deferred();
  h.context.fetch = (url) => url.includes("1CRN") ? first.promise : Promise.resolve(response(pdb));
  const old = h.get('compararProteinas("1CRN 4HHB")');
  await h.get('compararProteinas("4HHB 1A00")');
  const before = h.element("cmp-titulo").textContent;
  first.resolve(response(pdb));
  await old;
  assert.deepEqual(json(h.get("estado.comparacao.map(p => p.id)")), ["4HHB", "1A00"]);
  assert.equal(h.element("cmp-titulo").textContent, before);
  assert.deepEqual(json(h.context.urls), [["compare", "4HHB,1A00"]]);
});

test("comparação e análise individual compartilham a geração de navegação", async () => {
  const h = harness(), oldFetch = deferred();
  h.context.fetch = (url) => url.includes("4HHB") ? oldFetch.promise : Promise.resolve(response(pdb));
  const old = h.get('compararProteinas("4HHB 1A00")');
  await h.get('analisar({ pdbId: "1CRN" })');
  oldFetch.resolve(response(pdb));
  await old;
  assert.equal(h.get("estado.pdbId"), "1CRN");
  assert.equal(h.get("estado.comparacao"), null);
  assert.equal(h.element("workspace").hidden, false);
  assert.deepEqual(json(h.context.urls), [["pdb", "1CRN"]]);
});

test("metadados: repetição do mesmo ID descarta tanto a consulta quanto a geração anterior", async () => {
  const h = harness();
  // Restore this consumer, which the workspace harness normally disables.
  const source = read("docs/app.js");
  vm.runInContext(source.slice(source.indexOf("async function enriquecerMetaRCSB("), source.indexOf("\nfunction renderMeta()")), h.context);
  const requests = [];
  h.context.fetch = () => { const d = deferred(); requests.push(d); return d.promise; };
  h.get('estado.pdbId = "1CRN"; estado.meta = {}');
  const old = h.get('enriquecerMetaRCSB("1CRN")');
  const recent = h.get('enriquecerMetaRCSB("1CRN")');
  const meta = (title) => ({ ok: true, json: async () => ({ struct: { title } }) });
  requests[1].resolve(meta("recente")); await recent;
  requests[0].resolve(meta("antiga")); await old;
  assert.equal(h.get("estado.meta.titulo"), "recente");
  const olderGeneration = h.get('enriquecerMetaRCSB("1CRN")');
  h.get('invalidarConsultasEstrutura(); estado.meta = { titulo: "nova geração" }');
  requests[2].resolve(meta("geração antiga")); await olderGeneration;
  assert.equal(h.get("estado.meta.titulo"), "nova geração");
});

for (const lateError of [false, true]) test("pockets: progresso e " + (lateError ? "erro" : "resultado") + " substituídos são silenciosos", async () => {
  const h = harness(), requests = [];
  h.context.queuePockets = (id, onTick, stop) => {
    const d = deferred(); requests.push({ ...d, onTick, stop }); return d.promise;
  };
  h.get('estado.pdbId = "1CRN"; obterPockets = queuePockets');
  const old = h.get("detectarPockets()");
  const recent = h.get("detectarPockets()");
  const pockets = [{ name: "recente" }];
  requests[1].resolve({ pockets }); await recent;
  const status = h.element("pockets-status").innerHTML;
  requests[0].onTick(99);
  assert.equal(h.element("pockets-status").innerHTML, status);
  assert.equal(requests[0].stop(), true);
  if (lateError) requests[0].reject(new Error("erro antigo"));
  else requests[0].resolve({ pockets: [{ name: "antigo" }] });
  await old;
  assert.deepEqual(json(h.get("estado.pockets")), pockets);
  assert.equal(h.get("estado.pocketsInfo.estado"), "ok");
  assert.equal(h.context.rendered.length, 1);
});

test("pockets da comparação: a fila substituída para após a resposta e não publica erro", async () => {
  const h = harness(), requests = [];
  h.context.queuePockets = (id) => {
    const d = deferred(); requests.push({ ...d, id }); return d.promise;
  };
  h.get('estado.comparacao = [{ id: "1CRN" }, { id: "4HHB" }]; obterPockets = queuePockets');
  const old = h.get("detectarPocketsComparacao()");
  const recent = h.get("detectarPocketsComparacao()");
  requests[1].resolve({ pockets: [{ name: "novo A" }] }); await tick();
  requests[2].resolve({ pockets: [{ name: "novo B" }] }); await recent;
  const before = json(h.get("estado.cmpPockets"));
  requests[0].reject(new Error("falha antiga")); await old;
  assert.deepEqual(json(h.get("estado.cmpPockets")), before);
  assert.equal(h.context.rendered.length, 1);
  assert.equal(requests.length, 3);
});

test("trocar estrutura invalida bolsões e resíduos de um destaque ainda pendentes", async () => {
  const h = harness(), pockets = deferred(), residues = deferred();
  h.context.queuePockets = () => pockets.promise;
  h.context.fetch = () => residues.promise;
  h.get('estado.pdbId = "1CRN"; estado.pockets = [{ name: "P_0", residuosUrl: "https://fixture.invalid/res" }]; obterPockets = queuePockets');
  const oldPockets = h.get("detectarPockets()");
  h.get('estado.viewer = {}');
  const oldHighlight = h.get("destacarPocket(0)");
  const generation = h.get("geracaoVistaPocket");
  h.get('invalidarConsultasEstrutura(); estado.pdbId = "4HHB"; estado.pockets = null');
  pockets.resolve({ pockets: [{ name: "antigo" }] }); await oldPockets;
  residues.resolve(response(pdb)); await oldHighlight;
  assert.equal(h.get("estado.pockets"), null);
  assert.equal(h.get('vistaAindaVale(' + generation + ', 0)'), false);
});

test("DoGSite: corpo atrasado não entra no cache da sessão", async () => {
  const h = harness(), body = deferred();
  h.context.body = body.promise;
  h.get('dogsiteSubmit = async () => "job"; dogsitePoll = async () => ({ result_table: "table" })');
  h.context.fetch = async () => ({ text: () => body.promise });
  h.context.stopped = false;
  const old = h.get('obterPockets("1CRN", null, () => stopped)');
  const rejected = assert.rejects(old, /Cálculo cancelado/);
  await tick();
  h.context.stopped = true;
  body.resolve("name\tvolume\tsurface\tdepth\taccept\tdonor\thydrophobicity\tdrugScore\nP_0\t12\t10\t2\t1\t1\t0.2\t0.5\n");
  await rejected;
  assert.equal(h.get('POCKETS_CACHE["1CRN"]'), undefined);
  h.context.stopped = false;
  const current = await h.get('obterPockets("1CRN", null, () => stopped)');
  assert.equal(current.pockets[0].name, "P_0");
  assert.equal(h.get('POCKETS_CACHE["1CRN"]'), current);
});

test("busca por nome: apenas a última resposta aparece, e navegar descarta a pendente", async () => {
  const h = harness(), requests = [];
  h.load("busca-nome");
  h.get('BuscaNome.pesquisar = (nome) => queueName(nome); BuscaNome.htmlResultados = r => r.html');
  h.context.queueName = (nome) => { const d = deferred(); requests.push({ ...d, nome }); return d.promise; };
  h.element("pdb-id").value = "crambin";
  const old = h.get('listarPorNome("crambin")');
  const recent = h.get('listarPorNome("crambin")');
  requests[1].resolve({ ok: true, html: "resultado recente" }); await recent;
  requests[0].resolve({ ok: true, html: "resultado antigo" }); await old;
  assert.equal(h.element("busca-nome").innerHTML, "resultado recente");
  const pending = h.get('listarPorNome("crambin")');
  h.get("irParaHome()");
  requests[2].reject(new Error("erro atrasado")); await pending;
  assert.equal(h.element("busca-nome").innerHTML, "");
  assert.equal(h.element("erro").hidden, true);
});

test("qualidade: repetição e invalidação protegem publicação e cache mesmo se a rede ignora abort", async () => {
  const h = harness(), requests = [];
  h.load("quality-model");
  h.load("quality-ui", '  globalThis.qualityTest = { consultarRelatorio, consultarComponentes, cache };');
  const QM = h.get("QualityModel"), UI = h.get("QualityUI"), bridge = h.context.qualityTest;
  const app = { pdbId: "1CRN", estrutura: null };
  UI.definirParaTeste({ app });
  QM.consultarRelatorio = async (id, options) => {
    const d = deferred(); requests.push({ ...d, options });
    const result = await d.promise;
    options.cache.gravarRelatorio(id, result);
    return result;
  };
  const report = (message) => ({ id: "1CRN", estado: "ok",
    metricas: [{ grupo: "geometria", rotulo: "simulada", texto: message }], residuos: [], mensagem: message });
  const old = bridge.consultarRelatorio(false), recent = bridge.consultarRelatorio(false);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve(report("recente")); await recent;
  const html = h.element("ql-rel").innerHTML;
  requests[0].resolve(report("antigo")); await old;
  assert.equal(app.qualidade.relatorio.mensagem, "recente");
  assert.equal(bridge.cache.lerRelatorio("1CRN").mensagem, "recente");
  assert.equal(h.element("ql-rel").innerHTML, html);
  const pending = bridge.consultarRelatorio(false);
  UI.invalidar();
  requests[2].resolve(report("geração antiga")); await pending;
  assert.equal(bridge.cache.lerRelatorio("1CRN").mensagem, "recente");
});

test("preparo: resíduos fora de ordem não trocam caixa Vina, texto ou cache", async () => {
  const h = harness(), requests = [];
  h.load("prep-analysis");
  h.load("prep-ui", '  globalThis.prepTest = { sugerirCaixa, state: () => ({ vina, cacheRes }) };');
  const UI = h.get("PrepUI"), bridge = h.context.prepTest;
  const parsed = h.get("StructureModel").ler(pdb);
  const state = { pdbId: "1CRN", nome: "1CRN.pdb", pdbText: pdb, estrutura: parsed.estrutura,
    dados: parsed.analise, meta: h.get("ProtAnalysis").extrairMetadados(pdb),
    pockets: [0, 1].map(i => ({ name: "P_" + i, residuosUrl: "https://fixture.invalid/" + i })) };
  UI.aoCarregar(state);
  h.element("prep-margem").value = "4";
  h.context.fetch = (url) => { const d = deferred(); requests.push({ ...d, url }); return d.promise; };
  h.element("prep-pocket").value = "0";
  const old = bridge.sugerirCaixa();
  h.element("prep-pocket").value = "1";
  const recent = bridge.sugerirCaixa();
  requests[1].resolve(response(pdb)); await recent;
  const before = json(bridge.state().vina);
  const status = h.element("prep-vina-status").textContent;
  requests[0].reject(new Error("erro antigo")); await old;
  assert.deepEqual(json(bridge.state().vina), before);
  assert.equal(h.element("prep-vina-status").textContent, status);
  assert.equal(bridge.state().cacheRes.has(requests[0].url), false);
  h.element("prep-pocket").value = "0";
  const pending = bridge.sugerirCaixa();
  h.get("invalidarConsultasEstrutura()");
  requests[2].resolve(response(pdb)); await pending;
  assert.deepEqual(json(bridge.state().vina), before);
  assert.equal(bridge.state().cacheRes.has(requests[2].url), false);
});

test("ensemble: coordenadas e progresso atrasados não alteram a nova fila", async () => {
  const h = harness(), requests = [];
  h.load("ensemble-analysis");
  h.load("ensemble-ui", '  globalThis.ensembleTest = { calcular, chamarUm, state: () => sessao };');
  const UI = h.get("EnsembleUI"), bridge = h.context.ensembleTest;
  h.context.fetch = () => { const d = deferred(); requests.push(d); return d.promise; };
  h.get('obterPockets = async (id, tick) => { tick(1); return { pockets: [] }; }');
  UI.abrirPorUrl("1CRN");
  const oldItem = bridge.state().disponiveis[0];
  const old = bridge.calcular();
  UI.abrirPorUrl("4HHB");
  const recent = bridge.calcular();
  requests[1].resolve(response(pdb)); await recent;
  const before = json(bridge.state());
  const html = h.element("ens-progresso-txt").textContent;
  requests[0].resolve(response(pdb)); await old;
  assert.equal(oldItem.texto, null);
  assert.deepEqual(json(bridge.state()), before);
  assert.equal(h.element("ens-progresso-txt").textContent, html);
});


test("qualidade: XML real recebido fora de ordem não publica nem sobrescreve o cache", async () => {
  const h = harness(), bodies = [];
  h.load("quality-model");
  h.load("quality-ui", '  globalThis.qualityTest = { consultarRelatorio, cache };');
  const UI = h.get("QualityUI"), bridge = h.context.qualityTest;
  const app = { pdbId: "1CRN", estrutura: null };
  UI.definirParaTeste({ app });
  h.context.fetch = async () => {
    const d = deferred(); bodies.push(d);
    return { ok: true, status: 200, text: () => d.promise };
  };
  const xml = (resolution) => '<wwPDB-validation-information><Entry pdbid="1CRN" percentilebins="all,xray" PDB-resolution="' + resolution + '"/></wwPDB-validation-information>';
  const old = bridge.consultarRelatorio(false); await tick();
  const recent = bridge.consultarRelatorio(false); await tick();
  bodies[1].resolve(xml("2.00")); await recent;
  assert.equal(app.qualidade.relatorio.estado, "ok");
  const report = app.qualidade.relatorio;
  const html = h.element("ql-rel").innerHTML;
  bodies[0].resolve(xml("9.00")); await old;
  assert.equal(app.qualidade.relatorio, report);
  assert.equal(bridge.cache.lerRelatorio("1CRN"), report);
  assert.equal(h.element("ql-rel").innerHTML, html);
});

for (const lateError of [false, true]) test("gráficos: biblioteca atrasada " + (lateError ? "com erro" : "carregada") + " não desenha a consulta anterior", async () => {
  const h = harness(), libraries = [], plots = [];
  h.load("comparison");
  h.context.libPlotly = () => { const d = deferred(); libraries.push(d); return d.promise; };
  h.context.Plotly = { newPlot: (...args) => plots.push(args) };
  h.get('estado.comparacao = [{ id: "1CRN", pdbText: "" }]');
  const old = h.get("plotCmpAA()");
  h.get('estado.comparacao = [{ id: "4HHB", pdbText: "" }]');
  const recent = h.get("plotCmpAA()");
  libraries[1].resolve(); await recent;
  if (lateError) libraries[0].reject(new Error("biblioteca antiga")); else libraries[0].resolve();
  await old;
  assert.equal(plots.length, 1);
  assert.equal(plots[0][1][0].name, "4HHB");
});

test("abrir ensemble ou análises guardadas descarta um RCSB pendente", async () => {
  for (const destination of ["ensemble", "analysis"]) {
    const h = harness(), network = deferred();
    h.load("ensemble-analysis");
    h.load("ensemble-ui");
    h.load("analysis-snapshot");
    h.load("analysis-ui");
    h.context.fetch = () => network.promise;
    const pending = h.get('analisar({ pdbId: "1CRN" })');
    if (destination === "ensemble") h.get('EnsembleUI.abrirPorUrl("4HHB")');
    else h.get("AnalysisUI.abrir()");
    network.resolve(response(pdb)); await pending;
    assert.equal(h.get("estado.pdbId"), null);
    assert.equal(h.element(destination === "ensemble" ? "ensemble" : "analises").hidden, false);
    assert.deepEqual(json(h.context.urls), destination === "ensemble" ? [["ensemble", "4HHB"]] : []);
  }
});


test("componentes de qualidade: JSON atrasado não sobrescreve ficha nem cache CCD", async () => {
  const h = harness(), bodies = [];
  h.load("quality-model");
  h.load("quality-ui", '  globalThis.qualityTest = { consultarComponentes, cache };');
  const QM = h.get("QualityModel"), UI = h.get("QualityUI"), bridge = h.context.qualityTest;
  const parsed = h.get("StructureModel").ler(read("tests/fixtures/ui-render/4HHB.pdb"));
  const app = { pdbId: "4HHB", estrutura: parsed.estrutura };
  QM.codigosParaConsulta = () => [{ codigo: "HEM" }];
  UI.definirParaTeste({ app });
  h.context.fetch = async () => {
    const d = deferred(); bodies.push(d);
    return { ok: true, status: 200, json: () => d.promise };
  };
  const old = bridge.consultarComponentes(false); await tick();
  const recent = bridge.consultarComponentes(false); await tick();
  bodies[1].resolve({ chem_comp: { id: "HEM", name: "ficha recente" } }); await recent;
  const panel = app.qualidade.componentes;
  const html = h.element("ql-comp").innerHTML;
  assert.match(html, /ficha recente/);
  bodies[0].resolve({ chem_comp: { id: "HEM", name: "ficha antiga" } }); await old;
  assert.equal(app.qualidade.componentes, panel);
  assert.equal(h.element("ql-comp").innerHTML, html);
  assert.equal(bridge.cache.lerComponente("HEM").nome, "ficha recente");
});
