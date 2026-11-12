"use strict";

// Test-only harness: production scripts are evaluated unchanged in an isolated
// browser-like scope. No DOM initialization, real network or downloads run.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const ROOT = path.resolve(__dirname, "../..");
const GOLDENS = path.join(ROOT, "tests/fixtures/characterization");
const NOW = "2026-11-12T15:00:00.000Z";
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8").replace(/\r\n?/g, "\n");
const json = (value) => JSON.parse(JSON.stringify(value));
const digest = (text) => text == null ? null : {
  bytes: Buffer.byteLength(text, "utf8"),
  sha256: createHash("sha256").update(text).digest("hex"),
};

class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return Date.parse(NOW); }
  toLocaleString() { return "12/11/2026, 12:00:00"; }
}

function browser(files = []) {
  const context = vm.createContext({
    Date: FixedDate, console, setTimeout, clearTimeout, AbortController, TextDecoder,
    window: {},
    document: {
      readyState: "loading", addEventListener() {},
      getElementById() { return null; }, querySelectorAll() { return []; },
    },
    fetch() { throw new Error("Rede real proibida nos testes de caracterização."); },
  });
  for (const file of files) vm.runInContext(read("docs/" + file + ".js"), context, { filename: file + ".js" });
  return { context, get: (expression) => vm.runInContext(expression, context) };
}

function models() {
  return browser(["pdb-analysis", "structure-model", "quality-model", "prep-analysis", "ensemble-analysis", "analysis-snapshot"]);
}

function record(fields) {
  const line = Array(80).fill(" ");
  for (const [column, value] of fields) {
    for (const [i, char] of [...String(value)].entries()) line[column - 1 + i] = char;
  }
  return line.join("");
}

// Synthetic geometry, not a real deposit: metal contacts, SG-SG, ASN-NAG,
// water, blank chain, insertion, numbering gap, ANISOU and competing altLocs.
function syntheticPdb() {
  let serial = 0;
  const atom = (res, seq, name, x, y = 0, opts = {}) => record([
    [1, opts.het ? "HETATM" : "ATOM  "], [7, String(++serial).padStart(5)],
    [13, name], [17, opts.alt || " "], [18, res.padEnd(3)], [22, opts.chain ?? "A"],
    [23, String(seq).padStart(4)], [27, opts.ic || " "],
    [31, x.toFixed(3).padStart(8)], [39, y.toFixed(3).padStart(8)], [47, "   0.000"],
    [55, (opts.occ ?? 1).toFixed(2).padStart(6)], [61, " 20.00"],
    [77, (opts.el || name.trim()[0]).padStart(2)],
  ]);
  return [
    record([[1, "HEADER"], [11, "SYNTHETIC CHARACTERIZATION"], [51, "12-NOV-26"]]),
    "TITLE     SYNTHETIC GEOMETRY; NOT AN EXPERIMENTAL DEPOSIT",
    "EXPDTA    X-RAY DIFFRACTION", "REMARK   2 RESOLUTION.    2.00 ANGSTROMS.",
    "HETNAM     NAG N-ACETYL-D-GLUCOSAMINE",
    record([[1, "SSBOND"], [8, "  1"], [12, "CYS"], [16, "A"], [18, "   1"], [26, "CYS"], [30, "A"], [32, "   2"], [60, "  1555"], [67, "  1555"], [74, " 2.00"]]),
    atom("CYS", 1, " SG ", 0, 0, { el: "S" }),
    atom("CYS", 2, " SG ", 2, 0, { el: "S" }),
    atom("ASN", 4, " ND2", 10, 0, { el: "N" }),
    atom("HIS", 5, " ND1", 0, 2, { el: "N" }),
    atom("HIS", 5, " NE2", 0, 6, { el: "N" }),
    atom("GLY", 10, " CA ", 14, 0, { ic: "A" }),
    atom("ALA", 11, " CB ", 16, 0, { alt: "A", occ: 0.25 }),
    atom("ALA", 11, " CB ", 17, 0, { alt: "B", occ: 0.75 }),
    atom("GLY", 1, " CA ", 20, 0, { chain: " " }),
    atom("ZN", 100, "ZN  ", 0, 1, { het: true, el: "ZN" }),
    atom("NAG", 101, " C1 ", 11.4, 0, { het: true }),
    atom("HOH", 102, " O  ", 1, 1, { het: true, el: "O" }),
    record([[1, "ANISOU"], [7, "    1"], [13, " SG "], [18, "CYS"], [22, "A"], [23, "   1"]]),
    "TER", "END", "",
  ].join("\n");
}

const STRUCTURES = {
  "1A00": "pdbproteins/pdb1a00.pdb",
  "1A1C": "pdbproteins/pdb1a1c.pdb",
  "1A0N": "pdbproteins/pdb1a0n.pdb",
  "1CRN": "tests/fixtures/estrutura/1CRN.cif",
};

function structures() {
  const { get } = models();
  const SM = get("StructureModel");
  const out = {};
  for (const [id, source] of Object.entries(STRUCTURES)) {
    const result = SM.ler(read(source));
    out[id] = { ...result, textoPdb: digest(result.textoPdb), textoViewer: digest(result.textoViewer) };
  }
  out.sintetica = SM.ler(syntheticPdb());
  out.invalidos = ["texto solto", "#\\#CIF_2.0\ndata_exemplo\n", "data_exemplo\n_entry.id TEST\n"].map((s) => SM.ler(s));
  return out;
}

function classic() {
  const { get } = models();
  const PA = get("ProtAnalysis"), SM = get("StructureModel");
  const multi = read(STRUCTURES["1A0N"]), pdb = syntheticPdb();
  const chains = PA.separarCadeias(pdb);
  return {
    individualMultimodelo: SM.ler(multi).analise,
    comparacaoMultimodelo: PA.analisarCompleto(multi),
    sintetica: PA.analisarCompleto(pdb), metadados: PA.extrairMetadados(pdb), cadeias: chains,
    motivoPdb: PA.buscarMotivo(pdb, ["CYS", "CYS"]),
    motivoInsercao: SM.buscarMotivo(SM.ler(pdb).analise.residuosPorCadeia, ["GLY"]),
    frequenciaConsolidada: PA.frequenciaConsolidada(PA.analisarCompleto(pdb).frequencias, PA.listarCadeias(pdb)),
  };
}

function quality() {
  const { get } = models();
  const SM = get("StructureModel"), QM = get("QualityModel");
  const out = {};
  for (const id of ["1A00", "1A0N", "1CRN", "3DWU"]) {
    const est = id === "3DWU" ? null : SM.ler(read(STRUCTURES[id])).estrutura;
    const relatorio = QM.lerXml(read("tests/fixtures/qualidade/" + id + (id === "1CRN" ? "_validation.xml" : "_excerpt.xml")), {
      id, metodoArquivo: est?.identidade.metodo,
      contexto: est && { modeloSelecionado: est.modelo.selecionado, residuos: est.residuos, lacunas: est.lacunas },
    });
    out[id] = { relatorio, texto: QM.textoDossie({ relatorio }),
      alternativa: QM.lerResumoRcsb(JSON.parse(read("tests/fixtures/qualidade/rcsb_" + id + "_entry.json")), { id, metodoArquivo: est?.identidade.metodo }) };
  }
  out.componentes = ["ZN", "HEM", "MSE", "GOL", "HOH"].map((code) => QM.anotarChemCompRcsb(JSON.parse(read("tests/fixtures/qualidade/chemcomp_" + code + ".json")), code));
  return out;
}

function preparation() {
  const { get } = models();
  const PA = get("PrepAnalysis"), pdb = syntheticPdb();
  const resultado = PA.analisar(pdb);
  return { resultado,
    limpaA: PA.limparPdb(pdb, { removerAguas: true, altloc: "A" }),
    limpaOcupacao: PA.limparPdb(pdb, { removerAguas: false, altloc: "ocupacao", cadeias: ["A"] }),
    caixa: PA.caixaPocket(pdb, 4), config: PA.formatarConfigVina(PA.caixaPocket(pdb, 4)),
  };
}

function snapshotFixtures() {
  const { get } = models();
  const SM = get("StructureModel"), AS = get("AnalysisSnapshot");
  const estado = { estrutura: SM.ler(syntheticPdb()).estrutura, nome: "sintetica.pdb", pdbId: "1ABC" };
  const options = { agora: NOW, id: "SIN-CARACTERIZACAO" };
  const snapshot = AS.montarDeWorkspace(estado, options);
  const status = {};
  for (const state of ["pendente", "erro", "ausente", "rede", "parcial", "ok", "nao_aplica"]) {
    const saved = AS.montarDeWorkspace({ ...estado, qualidade: { relatorio: { estado: state, mensagem: "fixture " + state, metricas: [] } },
      pocketsInfo: { estado: state, motivo: "fixture " + state } }, options);
    status[state] = { qualidade: saved.qualidade, pockets: saved.pockets };
  }
  const nulls = AS.montarDeWorkspace({ ...estado, pockets: [{ name: "P_0", volume: null, surface: null, depth: null, hydrophobicity: null, drugScore: null }],
    qualidade: { relatorio: { estado: "ok", metricas: [{ id: "rfree", valor: null }] } } }, options);
  const cif = AS.montarDeWorkspace({ estrutura: SM.ler(read(STRUCTURES["1CRN"])).estrutura, nome: "1CRN.cif" }, { agora: NOW });
  const oldText = read("tests/fixtures/analises/4HHB-analise.json");
  const old = AS.validarTexto(oldText);
  const collection = [old.analise];
  const future = AS.importar(JSON.stringify({ ...snapshot, schema: "peki-analise-2" }), collection);
  return { snapshot, arquivo: AS.nomeArquivo(snapshot), jsonSalvo: digest(JSON.stringify(snapshot, null, 2) + "\n"), status,
    nulosAtuais: { pockets: nulls.pockets, qualidade: nulls.qualidade }, mmcifLocal: cif,
    legado: { ok: old.ok, erro: old.erro, analise: digest(JSON.stringify(old.analise)) },
    versaoFutura: { ok: future.ok, erro: future.erro, colecao: future.colecao.map((a) => a.id) },
  };
}

function ranking() {
  const { get } = models(), AS = get("AnalysisSnapshot");
  const a = snapshotFixtures().snapshot;
  const b = json(a); b.id = "SIN-B"; b.rotulo = "SIN-B";
  a.qualidade = { estado: "ok", classe: "xray", metricas: [{ id: "rfree", valor: 0.2 }, { id: "clashscore", valor: 4 }] };
  b.qualidade = { estado: "ok", classe: "xray", metricas: [{ id: "rfree", valor: 0.3 }, { id: "clashscore", valor: 8 }] };
  a.pockets = { estado: "ok", itens: [{ name: "P_0", drugScore: 0.4, volume: 40 }] };
  b.pockets = { estado: "ok", itens: [{ name: "P_0", drugScore: 0.8, volume: 100 }] };
  a.uniprot.declaracoes = b.uniprot.declaracoes = [{ cadeia: "A", accession: "SYNTHETIC", db: "UNP" }];
  const regular = AS.comparar([a, b], { componente: "ZN", pesos: { cobertura: 1, qualidade: 2, componente: 1, pocket: 1 } });
  const choice = AS.comEscolha(regular, { id: b.id, justificativa: "Decisão sintética | com\nquebra e *ênfase*." }).resultado;
  const pending = json(b); pending.qualidade = { estado: "pendente", metricas: [] }; pending.pockets = { estado: "erro", itens: [] };
  return { regular, semPesos: AS.comparar([a, b], { pesos: { cobertura: 0, qualidade: 0, componente: 0, pocket: 0 } }),
    empateReal: AS.comparar([a, { ...json(a), id: "SIN-EMPATE", rotulo: "SIN-EMPATE" }], { componente: "ZN", pesos: { cobertura: 0, qualidade: 0, componente: 1, pocket: 0 } }),
    pendente: AS.comparar([a, pending, { ...json(a), id: "SIN-C", rotulo: "SIN-C" }], { componente: "ZN" }),
    eliminatorio: AS.comparar([a, pending], { pocketEliminatorio: true }),
    regiao: AS.comparar([a, b], { regiao: "A:1-5", regiaoEssencial: true }),
    legado: AS.comparar([a, AS.validarTexto(read("tests/fixtures/analises/4HHB-analise.json")).analise], {}),
    escolha: choice, markdown: AS.relatorioMarkdown(choice), json: AS.relatorioJson(choice),
  };
}

function ensemble() {
  const { get } = models(), EA = get("EnsembleAnalysis");
  const input = EA.exemploSintetico();
  const relatorio = EA.montarRelatorio(input);
  const extras = { geradoEm: NOW, decisaoPesquisador: "Decisão sintética, sem validação biológica." };
  return { relatorio, sequencia: EA.montarRelatorio({ ...input, params: { modoAlinhamento: "sequencia" } }),
    ordemInvertida: EA.montarRelatorio({ ...input, bolsos: [...input.bolsos].reverse() }),
    csv: EA.exportarCSV(relatorio, extras), json: EA.exportarJSON(relatorio, extras),
  };
}

function appBrowser() {
  return browser(["pdb-analysis", "structure-model", "quality-model", "prep-analysis", "prep-ui", "analysis-snapshot", "analysis-ui", "busca-nome", "dogsite-client", "viewer", "comparison", "libs-loader", "app"]);
}

async function pockets() {
  const { context, get } = appBrowser();
  const tsv = "name\tvolume\tsurface\tdepth\taccept\tdonor\thydrophobicity\tdrugScore\nP_0\t100\t50\t8\t2\t3\t0.4\t0.7\nP_0_0\t10\t5\t2\t1\t1\t0.2\t0.1\nP_1\t\t20\t4\t0\t1\t\t\n";
  const requests = [];
  context.fetch = async (url, options) => {
    requests.push({ url, options: options || null });
    return { ok: true, status: 200, text: async () => tsv, json: async () => url.endsWith("dogsite_rest")
      ? { location: "https://fixture.invalid/job" }
      : { result_table: "https://fixture.invalid/table", residues: ["url-P0", "url-subpocket", "url-P1"] } };
  };
  const result = await get("obterPockets")("1ABC");
  const calls = requests.length;
  await get("obterPockets")("1abc");
  return { result, requests, cacheNaoRepetePedido: requests.length === calls,
    analise: get("textoAnalisePocketsSingle")(result.pockets),
    selecaoInsercao: get("selecoesDosResiduos")(syntheticPdb()),
  };
}

async function exportsCase() {
  const { context, get } = appBrowser();
  const SM = get("StructureModel"), PA = get("ProtAnalysis");
  const pdb = syntheticPdb(), result = SM.ler(pdb), estado = get("estado");
  Object.assign(estado, { nome: "sintetica.pdb", pdbId: "1ABC", pdbText: pdb, estrutura: result.estrutura,
    dados: result.analise, meta: PA.extrairMetadados(pdb), corPorCadeia: { A: "#2a5599", _: "#e8513a" },
    viewer: { pngURI: () => "data:image/png;base64,FIXTURE" }, pockets: (await pockets()).result.pockets,
    ultimoMotivo: { motivo: "CYS-CYS", ocorrencias: PA.buscarMotivo(pdb, ["CYS", "CYS"]) },
  });
  get("PrepUI").aoCarregar(estado);
  const downloads = [], charts = [], pdf = [];
  context.captureDownload = (nome, conteudo, mime) => downloads.push({ nome, conteudo, mime });
  context.captureChart = async (spec, w = 760, h = 400) => { charts.push({ spec, w, h }); return "data:image/png;base64,GRAPH"; };
  // Intercept just the external PDF boundary; retain production section order,
  // paragraphs, tables, image specs and filenames. This is not a PDF renderer.
  const helper = Object.fromEntries(["titulo", "sub", "par", "img", "tabela", "espaco"].map((method) => [method, (...args) => pdf.push([method, ...args])]));
  context.capturePdfHelper = () => helper;
  context.window.jspdf = { jsPDF: class {
    setFont(...args) { pdf.push(["setFont", ...args]); }
    setFontSize(...args) { pdf.push(["setFontSize", ...args]); }
    setTextColor(...args) { pdf.push(["setTextColor", ...args]); }
    save(name) { pdf.push(["save", name]); }
  } };
  vm.runInContext("baixarTexto = captureDownload; imgPlotly = captureChart; pdfHelper = capturePdfHelper; libPdf = async () => {};", context);
  const sections = ["visao", "qualidade", "meta", "viewer", "cadeias", "stats", "aa", "sequencias", "motivos", "pockets", "preparo"];
  await get("exportarMdSingle")(sections); await get("exportarPdfSingle")(sections);
  get("baixarCsvStats")(); get("baixarCsvPockets")();
  estado.comparacao = ["1ABC", "2ABC"].map((id) => ({ id, pdbText: pdb, dados: result.analise }));
  estado.cmpPockets = estado.comparacao.map((p) => ({ id: p.id, pockets: estado.pockets }));
  vm.runInContext('exportContexto = "cmp"', context);
  await get("exportarMdCmp")(["stats", "aa", "pockets"]); await get("exportarPdfCmp")(["stats", "aa", "pockets"]);
  get("baixarCsvCmpStats")(); get("baixarCsvCmpPockets")();
  const saved = get("AnalysisUI").guardarWorkspace(estado, (nome, conteudo) => downloads.push({ nome, conteudo }), { agora: NOW, id: "SIN-SALVO", preparo: get("PrepUI").resumoAnalise() });
  return { downloads, charts, pdf, fasta: estado.dados.cadeias.map(get("seqFasta")), snapshot: saved.snap };
}

module.exports = { ROOT, GOLDENS, NOW, read, json, browser, models, syntheticPdb,
  cases: { structures, classic, quality, preparation, snapshots: snapshotFixtures, ranking, ensemble, pockets, exports: exportsCase } };
