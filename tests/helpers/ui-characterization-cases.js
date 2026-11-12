"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const ROOT = path.resolve(__dirname, "../..");
const NOW = "2026-11-12T15:00:00.000Z";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n?/g, "\n");
const plain = (value) => JSON.parse(JSON.stringify(value, (_key, item) => {
  if (Object.prototype.toString.call(item) === "[object Set]") return [...item];
  if (Object.prototype.toString.call(item) === "[object Map]") return [...item];
  return item;
}));
const digest = (text) => ({ bytes: Buffer.byteLength(text, "utf8"), sha256: createHash("sha256").update(text).digest("hex") });

class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return Date.parse(NOW); }
  toLocaleString() { return "12/11/2026, 12:00:00"; }
}

function harness() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: "", textContent: "", value: "", dataset: {},
      addEventListener() {},
    });
    return elements.get(id);
  };
  // Deliberately no HTML parser: capture the exact returned string, not a
  // normalized DOM. No DOMContentLoaded handlers, layout or WebGL run here.
  const context = vm.createContext({
    Date: FixedDate, console,
    document: {
      readyState: "loading", addEventListener() {},
      getElementById: (id) => elements.get(id) || null,
      querySelector: () => null, querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem() { throw new Error("fixture: quota"); } },
    fetch() { throw new Error("Rede real proibida na caracterização da interface."); },
    setTimeout() { throw new Error("Timer inesperado na captura da interface."); },
  });
  function load(file, marker, bridge) {
    let source = read("docs/" + file + ".js");
    if (marker) {
      assert.equal(source.split(marker).length, 2, "ponte privada inequívoca: " + file);
      // Only add a test bridge at the module's return, in memory. No production
      // body is replaced and nothing is exported or written back into docs/.
      source = source.replace(marker, bridge + "\n" + marker);
    }
    vm.runInContext(source, context, { filename: file + ".js" });
  }
  for (const file of ["pdb-analysis", "structure-model", "prep-analysis", "ensemble-analysis"]) load(file);
  return { context, element, load, get: (expression) => vm.runInContext(expression, context) };
}

const PREP_RETURN = "  return { ativo, temFicha, invalidarConsultas, reiniciar, aoCarregar, aposEstilo, aoMostrar, markdown, anexarPdf, resumoAnalise };";
const PREP_BRIDGE = `  globalThis.prepTest = {
    montar, sugerirCaixa, aplicarTextoVina, onChange, onInput,
    state: () => ({ estado, resultado, selecao, destaque, caixaDesenhada,
      ouvintes, decisoes, cacheRes, raios, vina }),
  };`;
const ENSEMBLE_RETURN = "  return { ativo, invalidarConsultas, aoFechar, abrirPorUrl, abrirExemplo };";
const ENSEMBLE_BRIDGE = `  globalThis.ensembleTest = {
    htmlRelatorio, gravarCache,
    setSession(value) { sessao = value; },
    state: () => ({ sessao, geracao, cancelado, ouvintes, avisoCache, memoria, modeloId }),
    aliases: (rel) => ({ editEnsSugEns: sessao.editEns === sessao.sugEns,
      sugEnsRelatorio: sessao.sugEns === rel.caixaEnsemble,
      editEstSugEst: sessao.editEst === sessao.sugEst }),
  };`;

function source(id) { return read("tests/fixtures/ui-render/" + id + ".pdb"); }

// These are simulated DoGSite pockets, built from public coordinate records.
// Their names/descriptors and the cross-protein grouping have no biological
// meaning; no DoGSite result or equivalence of these proteins is asserted.
function residues(text, numbers) {
  return text.split("\n").filter((line) => line.startsWith("ATOM  ")
    && line[21] === "A" && numbers.includes(Number(line.slice(22, 26)))).join("\n") + "\nEND\n";
}

function prepState(bridge) {
  const state = plain(bridge.state());
  // Large immutable coordinate/analysis inputs are fingerprinted. All mutable
  // selection, decision, cache, radii and Vina fields remain explicit.
  state.estado = digest(JSON.stringify(state.estado));
  state.resultado = state.resultado && digest(JSON.stringify(state.resultado));
  state.cacheRes = state.cacheRes.map(([url, text]) => [url, digest(text)]);
  state.vina.residuosTxt = digest(state.vina.residuosTxt);
  return state;
}

async function prepUi() {
  const h = harness();
  h.element("tab-preparo");
  h.element("prep-previa");
  h.load("prep-ui", PREP_RETURN, PREP_BRIDGE);
  const UI = h.get("PrepUI"), bridge = h.context.prepTest;
  const steps = [], requests = [];
  function capture(name) {
    const before = prepState(bridge);
    const html = bridge.montar();
    const after = prepState(bridge);
    steps.push({ nome: name, antes: before, html, depois: after });
  }
  function open(id, options = {}) {
    const pdb = source(id), parsed = h.get("StructureModel").ler(pdb);
    assert.equal(parsed.ok, true, id);
    const state = { nome: id + ".pdb", pdbId: id, pdbText: pdb,
      estrutura: parsed.estrutura, dados: parsed.analise,
      meta: h.get("ProtAnalysis").extrairMetadados(pdb), ...options };
    UI.aoCarregar(state);
    assert.equal(UI.temFicha(), true, "ficha real " + id);
    assert.equal(h.element("tab-preparo").innerHTML, bridge.montar());
    return state;
  }
  open("1CRN");
  capture("1CRN-inicial");
  const state = open("4HHB", { pockets: [
    { name: "FIX-P_0", residuosUrl: "https://fixture.invalid/4HHB/P_0" },
    { name: 'FIX-<P_1>&"', residuosUrl: "https://fixture.invalid/4HHB/P_1" },
  ] });
  capture("4HHB-inicial");
  for (const chain of ["B", "C", "D"]) bridge.onChange({ target: { dataset: { sel: "cadeia", chave: chain }, checked: false } });
  const het = [...bridge.state().selecao.hets][0];
  bridge.onChange({ target: { dataset: { sel: "het", chave: het }, checked: false } });
  bridge.onChange({ target: { dataset: { sel: "altloc" }, value: "ocupacao" } });
  bridge.onChange({ target: { dataset: { sel: "aguas" }, checked: false } });
  bridge.onInput({ target: { dataset: { decisao: "inventario" }, value: 'Conferir <HEM> & "água"\nsegunda linha' } });
  capture("4HHB-selecao-e-decisao");

  const pocketText = residues(state.pdbText, [1, 2, 3]);
  h.context.fetch = async (url) => {
    assert.equal(url, state.pockets[1].residuosUrl);
    requests.push(url);
    return { ok: true, text: async () => pocketText };
  };
  h.element("prep-pocket").value = "1";
  h.element("prep-margem").value = "4";
  h.element("prep-vina-status");
  await bridge.sugerirCaixa();
  await bridge.sugerirCaixa(); // second request uses the real cache
  capture("4HHB-caixa-sugerida-cache");

  h.element("prep-vina-cfg").value = "center_x=1\ncenter_y=2\ncenter_z=3\nsize_x=-5\nsize_y=0\nsize_z=-2\n";
  bridge.aplicarTextoVina(); // existing parser accepts nonpositive sizes
  capture("4HHB-caixa-negativa-aceita");
  state.pockets = [];
  capture("4HHB-pockets-removidos-caixa-antiga");
  open("1CRN", { pdbId: null });
  capture("1CRN-arquivo-local");

  // A blocked mmCIF load currently retains selection/cache/radii from the
  // preceding PDB although it clears resultado and the edited Vina box.
  const cif = h.get("StructureModel").ler(read("tests/fixtures/estrutura/1CRN.cif"));
  const before = prepState(bridge);
  UI.aoCarregar({ nome: "1CRN.cif", pdbId: "1CRN", estrutura: cif.estrutura, pdbText: null });
  const blocked = { antes: before, html: h.element("tab-preparo").innerHTML, depois: prepState(bridge) };
  return { fontes: ["1CRN.pdb", "4HHB.pdb", "1CRN.cif"], pocketsSimulados: true, etapas: steps, bloqueadoMmcif: blocked, pedidos: requests };
}

function ensembleUi() {
  const h = harness();
  h.load("ensemble-ui", ENSEMBLE_RETURN, ENSEMBLE_BRIDGE);
  const EA = h.get("EnsembleAnalysis"), bridge = h.context.ensembleTest;
  const input = {
    estruturas: [
      { id: "1CRN", rotulo: "1CRN público", texto: source("1CRN") },
      { id: "4HHB", rotulo: '4HHB <público> & "local"', texto: source("4HHB") },
      { id: "FALHA", rotulo: "Consulta simulada indisponível", erro: "Falha simulada <rede>", texto: "" },
    ],
    bolsos: [], nPedidas: 3, nDisponiveis: 4,
    params: { usarCentroide: true, modoAlinhamento: "numero", jaccardMin: 0.5 },
  };
  for (const id of ["1CRN", "4HHB"]) {
    for (const [i, numbers] of [[1, 2, 3], [10, 11]].entries()) {
      const parsed = EA.parseArquivoResiduos(residues(source(id), numbers));
      input.bolsos.push({ estruturaId: id, name: i ? 'FIX-<P_1>&"' : "FIX-P_0",
        residuos: parsed.residuos, extensao: parsed.extensao,
        volume: i ? null : 100, drugScore: i ? null : 0.5 });
    }
  }
  const report = EA.montarRelatorio(input);
  bridge.setSession({ referenciaId: null, grupoId: null, estruturaCaixa: null,
    bolsaoCaixa: null, sigEns: null, sigEst: null });
  const steps = [];
  function capture(name, rel = report) {
    const before = plain(bridge.state());
    const reportBefore = digest(JSON.stringify(rel));
    const html = bridge.htmlRelatorio(rel);
    steps.push({ nome: name, antes: before, html, depois: plain(bridge.state()),
      aliases: plain(bridge.aliases(rel)), relatorioAntes: reportBefore, relatorioDepois: digest(JSON.stringify(rel)) });
  }
  capture("primeira-renderizacao");
  const session = bridge.state().sessao;
  session.editEns = { center_x: 90, center_y: 91, center_z: 92, size_x: 10, size_y: 11, size_z: 12 };
  session.editEst = { center_x: 80, center_y: 81, center_z: 82, size_x: 13, size_y: 14, size_z: 15 };
  session.grupoId = "G2";
  capture("edicoes-preservadas-mesma-assinatura");
  session.referenciaId = "4HHB";
  session.estruturaCaixa = "4HHB";
  session.bolsaoCaixa = 'FIX-<P_1>&"';
  bridge.gravarCache("fixture", []); // real quota-failure path, no browser storage
  capture("referencia-e-caixa-4HHB", EA.montarRelatorio({ ...input, params: { ...input.params, referenciaId: "4HHB" } }));
  session.bolsaoCaixa = "POCKET_REMOVIDO";
  session.grupoId = "GRUPO_REMOVIDO";
  capture("pocket-e-grupo-obsoletos");
  const crnOnly = { ...input, estruturas: input.estruturas.filter((e) => e.id === "1CRN"),
    bolsos: input.bolsos.filter((b) => b.estruturaId === "1CRN"), nPedidas: 1, nDisponiveis: 1 };
  capture("4HHB-removido-referencia-corrigida-caixa-obsoleta", EA.montarRelatorio(crnOnly));
  capture("sem-bolso", EA.montarRelatorio({ ...crnOnly, bolsos: [] }));
  capture("ensemble-vazio", EA.montarRelatorio({ estruturas: [], bolsos: [] }));
  return { fontes: ["1CRN.pdb", "4HHB.pdb"], pocketsSimulados: true,
    nota: "Proteínas diferentes: cenário de interface, sem interpretação biológica do agrupamento.", etapas: steps };
}

module.exports = { cases: { "prep-ui": prepUi, "ensemble-ui": ensembleUi } };
