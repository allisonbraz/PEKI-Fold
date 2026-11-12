"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const ROOT = path.resolve(__dirname, "../..");
const NOW = "2026-11-12T15:00:00.000Z";
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8").replace(/\r\n?/g, "\n");
const clone = (value) => JSON.parse(JSON.stringify(value));
const fingerprint = (text) => ({ bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") });
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return Date.parse(NOW); }
}

function models(extra = {}) {
  const context = vm.createContext({ Date: FixedDate, console, AbortController, TextDecoder, TextEncoder,
    fetch() { throw new Error("Rede real proibida nas caracterizações adicionais."); },
    setTimeout() { throw new Error("Timer real proibido nesta suíte."); }, clearTimeout() {}, ...extra });
  for (const name of ["pdb-analysis", "structure-model", "prep-analysis", "analysis-snapshot", "quality-model"]) {
    vm.runInContext(read("docs/" + name + ".js"), context, { filename: name + ".js" });
  }
  return (name) => vm.runInContext(name, context);
}
const pdb = (id) => read("tests/fixtures/ui-render/" + id + ".pdb");
const atoms = (id) => pdb(id).split("\n").filter((l) => /^(ATOM  |HETATM)/.test(l));
const patch = (line, column, text) => line.slice(0, column - 1) + text + line.slice(column - 1 + text.length);
const seq = (line) => Number(line.slice(22, 26));
const ca = (id, number, chain = "A") => atoms(id).find((l) => l.startsWith("ATOM  ") && l[21] === chain && seq(l) === number && l.slice(12, 16).trim() === "CA");
function record(fields) {
  let line = " ".repeat(80);
  for (const [column, text] of fields) line = patch(line, column, text);
  return line;
}
function remark(number, resname, icode = "", model = "") {
  return record([[1, "REMARK 465"], [13, String(model).padStart(3)], [16, resname], [20, "A"], [22, String(number).padStart(5)], [27, icode || " "]]);
}
// Deliberate derivatives of public coordinate records, not deposited models.
// Only numbering, metadata, altLoc/occupancy and record order are changed.
function insertionPdb() {
  return [ca("1CRN", 1), ca("1CRN", 2), patch(patch(ca("1CRN", 3), 23, "   2"), 27, "A"),
    ca("1CRN", 5), ca("1CRN", 8), "END", ""].join("\n");
}
function diagnosticEdges() {
  const SM = models()("StructureModel");
  const inserted = insertionPdb();
  const missing = [19, 29];
  const cut = pdb("1CRN").split("\n").filter((l) => !l.startsWith("ATOM  ") || !missing.includes(seq(l))).join("\n");
  const declared = missing.map((n) => remark(n, ca("1CRN", n).slice(17, 20)));
  const metadata = ["REMARK 465 MISSING RESIDUES", remark(3, "CYS"), remark(3, "CYS"),
    remark(4, "CYS", "A"), remark(2, "THR"), remark(6, "SER", "", 2)].join("\n");
  const unobs = ["#", "loop_", ...["PDB_model_num", "occupancy_flag", "auth_asym_id", "auth_comp_id", "auth_seq_id", "PDB_ins_code", "label_asym_id", "label_seq_id"]
    .map((tag) => "_pdbx_unobs_or_zero_occ_residues." + tag),
  "1 1 A CYS 3 A A 3", "1 0 A THR 2 ? A 2", "1 2 A PRO 99 ? A 99",
  "1 1 A SER ? ? A 6", "2 1 A SER 6 ? A 6", "#", ""].join("\n");
  const variants = {
    "1CRN-publico": pdb("1CRN"), "4HHB-publico": pdb("4HHB"),
    "insercao-e-saltos-sem-fonte": inserted,
    "remark-duplicado-insercao-conflito-modelo": metadata + "\n" + inserted,
    "seqres-sem-19-e-29": cut,
    "seqres-remark-concordantes": "REMARK 465 MISSING RESIDUES\n" + declared.join("\n") + "\n" + cut,
    "remark-sem-secao-exaustiva": declared.join("\n") + "\n" + cut.split("\n").filter((l) => !l.startsWith("SEQRES")).join("\n"),
    "insercao-modelos-multiplos": "MODEL        1\n" + inserted + "ENDMDL\nMODEL        2\n" + ca("1CRN", 6) + "\nENDMDL\n",
    "mmcif-publico": read("tests/fixtures/estrutura/1CRN.cif"),
    "mmcif-metadados-derivados": read("tests/fixtures/estrutura/1CRN.cif") + unobs,
  };
  return Object.fromEntries(Object.entries(variants).map(([name, text]) => {
    const result = SM.ler(text);
    assert.equal(result.ok, true, name);
    return [name, { entrada: fingerprint(text), modelo: result.estrutura.modelo,
      residuos: result.analise.residuosPorCadeia, lacunas: result.estrutura.lacunas,
      diagnosticos: result.estrutura.diagnosticos }];
  }));
}

function rankingEdges() {
  const get = models(), AS = get("AnalysisSnapshot"), SM = get("StructureModel");
  function snapshot(id, sourceId = "1CRN") {
    return clone(AS.montarDeWorkspace({ nome: sourceId + ".pdb", pdbId: sourceId, estrutura: SM.ler(pdb(sourceId)).estrutura }, { agora: NOW, id }));
  }
  function candidate(id, score, state = "ok", sourceId) {
    const snap = snapshot(id, sourceId);
    snap.qualidade = { estado: "pendente", classe: "xray", metricas: [] };
    snap.pockets = { estado: state, itens: score == null ? [] : [{ name: "FIX-P_0", drugScore: score, volume: 100 }] };
    return snap;
  }
  const pocketOnly = { pesos: { cobertura: 0, qualidade: 0, componente: 0, pocket: 1 } };
  const a = candidate("CRN-A", 1), b = candidate("CRN-B", 0.5), c = candidate("CRN-C", 0.5), d = candidate("CRN-D", 0);
  const out = {
    empateForaDoTopo: AS.comparar([d, c, b, a], pocketOnly),
    empateTotal: AS.comparar([candidate("CRN-Z", 0.5), candidate("CRN-A", 0.5)], pocketOnly),
    toleranciaNaoTransitiva: AS.comparar([a, candidate("CRN-B", 1 - 0.75e-9), candidate("CRN-C", 1 - 1.5e-9), d], pocketOnly),
    umUnicoDrugScore: AS.comparar([b, candidate("CRN-PENDENTE", null, "pendente")], pocketOnly),
    nenhumDadoDisponivel: AS.comparar([candidate("CRN-P", null, "pendente"), candidate("HHB-E", null, "erro", "4HHB")], pocketOnly),
    eliminatorio: AS.comparar([a, candidate("CRN-P", null, "pendente"), candidate("HHB-E", null, "erro", "4HHB")], { ...pocketOnly, pocketEliminatorio: true }),
    fontesDistintas: AS.comparar([snapshot("CRN"), snapshot("HHB", "4HHB")], { regiao: "A:1-3", regiaoEssencial: true }),
    pesoInvalido: AS.comparar([a, b], { pesos: { cobertura: -1 } }),
    umCandidato: AS.comparar([a], pocketOnly),
  };
  out.estadosPendentes = {};
  for (const state of ["pendente", "erro", "rede", "ausente", "nao_solicitado"]) {
    const pending = candidate("CRN-" + state, null, state);
    out.estadosPendentes[state] = AS.comparar([a, b, pending], { pesos: { cobertura: 1, qualidade: 2, componente: 0, pocket: 3 } });
  }
  const inserted = snapshot("CRN-INS-A");
  const derived = SM.ler(insertionPdb());
  inserted.cadeias = clone(AS.montarDeWorkspace({ estrutura: derived.estrutura, nome: "derivado-1CRN.pdb" }, { agora: NOW, id: "DERIVADO" }).cadeias);
  inserted.lacunas = { ...inserted.lacunas, determinado: false, naoResolvidos: [] };
  const inserted2 = { ...clone(inserted), id: "CRN-INS-B" };
  const region = AS.parseRegiao("A:1-3");
  out.insercaoMascaraSalto = { avaliacao: AS.avaliarRegiao(inserted, region), resultado: AS.comparar([inserted, inserted2], { regiao: "A:1-3", regiaoEssencial: true, pesos: { cobertura: 1, qualidade: 0, componente: 0, pocket: 0 } }) };
  return out;
}

function cleaningInput() {
  const first = ca("4HHB", 1), second = ca("4HHB", 2), third = ca("4HHB", 3);
  const alt = (line, code, occ) => patch(patch(line, 17, code || " "), 55, occ == null ? "      " : occ.toFixed(2).padStart(6));
  const n = atoms("4HHB").find((l) => l[21] === "A" && seq(l) === 1 && l.slice(12, 16).trim() === "N");
  const water = atoms("4HHB").filter((l) => l.slice(17, 20) === "HOH").slice(0, 2);
  const hem = atoms("4HHB").filter((l) => l[21] === "A" && l.slice(17, 20) === "HEM");
  const iron = hem.find((l) => l.slice(76, 78).trim() === "FE");
  const lines = [alt(first, "", 0.5), alt(first, "A", 0.5), alt(first, "B", 0.8), alt(first, "C", 0.8),
    alt(n, "A", 0.9), alt(n, "B", 0.1), alt(second, "B", 0.7), alt(third, "", null), alt(third, "A", 0),
    alt(patch(first, 27, "A"), "A", 0.4), alt(patch(first, 27, "A"), "B", 0.6),
    ca("4HHB", 1, "B"), patch(ca("1CRN", 1), 22, " "), iron, iron, hem.find((l) => l !== iron), ...water,
    patch(first, 1, "ANISOU"), "END", ""];
  return lines.join("\n");
}
function cleaningEdges() {
  const Prep = models()("PrepAnalysis"), text = cleaningInput();
  const parsed = Prep.parseAtomos(text), water = parsed.find((a) => a.agua).chaveRes;
  const hem = parsed.find((a) => a.resname === "HEM").chaveRes;
  const options = {
    padrao: {}, ocupacao: { altloc: "ocupacao" },
    cadeiaAAltA: { cadeias: ["A"], altloc: "A" }, cadeiaAOcupacao: { cadeias: ["A"], altloc: "ocupacao" },
    cadeiaBAltA: { cadeias: ["B"], altloc: "A" }, cadeiaBOcupacao: { cadeias: ["B"], altloc: "ocupacao" },
    cadeiaSemId: { cadeias: ["_"] }, cadeiasVazias: { cadeias: [] }, cadeiaInexistente: { cadeias: ["Z"] },
    todasAguas: { removerAguas: false, altloc: "ocupacao" },
    aguaMarcadaSemHets: { removerAguas: true, aguasManter: [water], hets: [], altloc: "ocupacao" },
    somenteHem: { cadeias: ["A"], hets: [hem], altloc: "ocupacao" },
    ordemCadeiasInvertida: { cadeias: ["B", "A"], altloc: "ocupacao" },
    modoDesconhecido: { altloc: "B" },
  };
  const out = { entradaDerivada: text, casos: Object.fromEntries(Object.entries(options).map(([name, opcoes]) => [name, { opcoes, resultado: Prep.limparPdb(text, opcoes) }])) };
  out.primeiroModelo = Prep.limparPdb("MODEL        1\n" + text + "ENDMDL\nMODEL        2\n" + ca("1CRN", 10) + "\nENDMDL\n", { altloc: "ocupacao" });
  out.publicos = { "1CRN": Prep.limparPdb(pdb("1CRN"), {}), "4HHB-cadeia-A": Prep.limparPdb(pdb("4HHB"), { cadeias: ["A"], altloc: "ocupacao", hets: [] }) };
  return out;
}

function clock() {
  let serial = 0;
  const active = new Map(), events = [];
  return {
    events, active,
    setTimeout(fn, ms) { const id = ++serial; active.set(id, { fn, ms }); events.push(["agendar", id, ms]); return id; },
    clearTimeout(id) { active.delete(id); events.push(["limpar", id]); },
    fire() { const [id, task] = active.entries().next().value; active.delete(id); events.push(["disparar", id, task.ms]); task.fn(); },
  };
}
const abortError = () => Object.assign(new Error("cancelamento simulado"), { name: "AbortError" });
async function consultationEdges() {
  const xml = read("tests/fixtures/qualidade/1CRN_validation.xml");
  const entry = JSON.parse(read("tests/fixtures/qualidade/rcsb_1CRN_entry.json"));
  const context = (() => { const SM = models()("StructureModel"), est = SM.ler(pdb("1CRN")).estrutura;
    return { modeloSelecionado: est.modelo.selecionado, residuos: est.residuos, lacunas: est.lacunas }; })();
  function environment() {
    const timers = clock(), QM = models({ setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout })("QualityModel");
    const requests = [], ctrl = new AbortController(), cache = QM.criarCache();
    return { timers, QM, requests, ctrl, cache };
  }
  async function run(name, route, options = {}) {
    const env = environment(), { QM, timers, ctrl, cache, requests } = env;
    if (options.preAbort) ctrl.abort();
    const result = await QM.consultarRelatorio(options.id || "1CRN", { cache, signal: ctrl.signal, contexto: context, metodoArquivo: "X-RAY DIFFRACTION", ...options,
      fetch: async (url, request) => {
        const call = { url, headers: request.headers, abortadoNaEntrada: request.signal.aborted, cancelamentos: 0 };
        requests.push(call);
        request.signal.addEventListener("abort", () => { call.cancelamentos += 1; });
        return route({ ...env, url, request, index: requests.length });
      } });
    assert.equal(timers.active.size, 0, name + ": sem timers pendentes");
    return { resultado: result, pedidos: requests, timers: timers.events, cancelado: ctrl.signal.aborted, cache: cache.tamanho() };
  }
  const xmlResponse = () => ({ status: 200, text: async () => xml });
  const jsonResponse = () => ({ status: 200, json: async () => clone(entry) });
  const out = {};
  out.xml = await run("XML", xmlResponse);
  out.canceladoAntes = await run("cancelado antes", xmlResponse, { preAbort: true });
  out.canceladoNoXml = await run("cancelado XML", ({ ctrl }) => { ctrl.abort(); throw abortError(); });
  out.canceladoNoJson = await run("cancelado JSON", ({ index, ctrl }) => { if (index === 1) return { status: 404 }; ctrl.abort(); throw abortError(); });
  out.alternativaJson = await run("alternativa JSON", ({ index }) => index === 1 ? { status: 404 } : jsonResponse());
  out.timeoutXml = await run("timeout XML", ({ index, request, timers }) => {
    if (index > 1) return jsonResponse();
    return new Promise((_resolve, reject) => { request.signal.addEventListener("abort", () => reject(abortError()), { once: true }); timers.fire(); });
  });
  out.canceladoDuranteCorpoAceito = await run("cancelamento durante corpo", ({ ctrl, timers }) => ({ status: 200, text: async () => {
    assert.equal(timers.active.size, 0, "o timeout atual termina antes da leitura do corpo"); ctrl.abort(); return xml;
  } }));
  out.canceladoDuranteJsonAceito = await run("cancelamento durante corpo JSON", ({ index, ctrl, timers }) => index === 1 ? { status: 404 } : { status: 200, json: async () => {
    assert.equal(timers.active.size, 0); ctrl.abort(); return clone(entry);
  } });
  out.xmlTruncado = await run("XML truncado", xmlResponse, { limite: 80 });
  out.idDivergente = await run("ID divergente", ({ index }) => index === 1 ? { status: 200, text: async () => xml.replace('pdbid="1CRN"', 'pdbid="4HHB"') } : jsonResponse());
  for (const status of [404, 429, 503]) out["http" + status] = await run("HTTP " + status, () => ({ status }));
  out.rede = await run("rede", () => { throw new TypeError("Falha de rede simulada"); });
  out.jsonInvalido = await run("JSON inválido", ({ index }) => index === 1 ? { status: 404 } : { status: 200, json: async () => { throw new SyntaxError("fixture JSON inválido"); } });
  out.idLocal = await run("ID local", xmlResponse, { id: "1CRN.pdb" });
  out.semFetch = environment().QM.consultarRelatorio("1CRN", {});
  out.semFetch = await out.semFetch;

  const { QM, cache, ctrl, timers } = environment();
  const requests = [];
  const fetch = async (url) => { requests.push(url); return xmlResponse(); };
  const first = await QM.consultarRelatorio("1crn", { fetch, cache });
  const hit = await QM.consultarRelatorio("1CRN", { cache, contexto: context });
  ctrl.abort();
  const abortedHit = await QM.consultarRelatorio("1CRN", { fetch, cache, signal: ctrl.signal });
  const beforeForce = requests.length;
  const forced = await QM.consultarRelatorio("1CRN", { fetch, cache, forcar: true, contexto: context });
  out.cache = { primeiro: first, hit, canceladoComHit: abortedHit, forcado: forced,
    mesmaReferencia: first === hit && hit === abortedHit, pedidosAntesDeForcar: beforeForce,
    pedidos: requests, timers: timers.events, tamanho: cache.tamanho(), outraChave: cache.lerRelatorio("4HHB") };
  assert.equal(timers.active.size, 0);
  return out;
}

module.exports = { cases: { "diagnosticar-caminhos": diagnosticEdges, "comparar-caminhos": rankingEdges,
  "limpar-pdb-caminhos": cleaningEdges, "consultar-relatorio-caminhos": consultationEdges } };
