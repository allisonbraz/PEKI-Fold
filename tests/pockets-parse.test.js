"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { browser, read, json } = require("./helpers/characterization-cases.js");
const { parseTabelaPockets, filtrarResiduosPocket } = require("../docs/dogsite-client.js");
const Prep = require("../docs/prep-analysis.js");
const Ensemble = require("../docs/ensemble-analysis.js");

const tsv = read("tests/fixtures/pockets/mistos.tsv");
const pdb = read("tests/fixtures/pockets/mistos.pdb");
const atomosValidos = read("tests/fixtures/ui-render/1CRN.pdb").split("\n")
  .filter((l) => l.startsWith("ATOM  ")).slice(0, 3);
const valido = atomosValidos.join("\n") + "\nEND\n";
const expectedPockets = [
  { name: "P_0", volume: 100, surface: 50, depth: 8, accept: 2, donor: 3, hydrophobicity: 0.4, drugScore: 0.7 },
  { name: "P_1", volume: 20, surface: 10, depth: 4, accept: 0, donor: 1, hydrophobicity: 0.2, drugScore: 0.8 },
];

function harness() {
  const h = browser(["pdb-analysis", "structure-model", "prep-analysis", "ensemble-analysis", "dogsite-client", "viewer", "comparison", "app"]);
  const elements = new Map();
  h.element = (id) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", textContent: "", value: "", dataset: {},
      addEventListener() {}, querySelectorAll: () => [] });
    return elements.get(id);
  };
  h.context.document.getElementById = h.element;
  h.context.document.querySelector = (sel) => h.element(sel.replace(/^#/, ""));
  h.context.window.scrollTo = () => {};
  h.context.localStorage = { getItem: () => null, setItem() {} };
  h.context.downloads = [];
  h.context.fetch = async (url) => {
    h.context.downloads.push(url);
    return { ok: true, status: 200, json: async () => String(url).endsWith("dogsite_rest")
      ? { location: "https://fixture.invalid/job" }
      : { result_table: "https://fixture.invalid/table", residues: Array.from({ length: 8 }, (_, i) => "res-" + i) },
    text: async () => url === "https://fixture.invalid/table" ? tsv : pdb };
  };
  h.loadUi = (file, bridge) => {
    const source = read("docs/" + file + ".js");
    const marker = "  return { ativo,";
    assert.equal(source.split(marker).length, 2);
    vm.runInContext(source.replace(marker, bridge + "\n" + marker), h.context, { filename: file + ".js" });
  };
  return h;
}

test("TSV misto: descarta cada linha inválida e mantém valores e ordem das válidas", () => {
  const diagnostico = {};
  assert.deepEqual(parseTabelaPockets(tsv, diagnostico), expectedPockets);
  assert.equal(diagnostico.descartadas, 6);
  assert.deepEqual(diagnostico.indices, [0, 7]);
});

test("TSV: cabeçalho incompleto, campos vazios, números parciais e não finitos não viram zero ou null", () => {
  const header = tsv.split("\n")[0], row = tsv.split("\n")[1].split("\t");
  for (const bad of ["", " ", "12x", "NaN", "Infinity", "1e999", "0x10", "1,5"]) {
    const fields = row.slice(); fields[1] = bad;
    const d = {};
    assert.deepEqual(parseTabelaPockets(header + "\n" + fields.join("\t"), d), [], bad);
    assert.equal(d.descartadas, 1, bad);
  }
  for (let col = 0; col < row.length; col++) {
    const labels = header.split("\t"), values = row.slice();
    labels.splice(col, 1); values.splice(col, 1);
    const d = {};
    assert.deepEqual(parseTabelaPockets(labels.join("\t") + "\n" + values.join("\t"), d), []);
    assert.equal(d.descartadas, 1);
  }
  const d = {};
  assert.deepEqual(parseTabelaPockets(header + "\n" + row.join("\t") + "\textra", d), []);
  assert.equal(d.descartadas, 1);
});

test("TSV válido: zeros, negativos, notação científica e subpockets mantêm o resultado anterior", () => {
  const header = tsv.split("\n")[0], d = {};
  const input = header + "\r\nP_0\t1e2\t+50.0\t.8e1\t0\t-1\t-.2\t7e-1\r\nP_0_0\t1\t2\t3\t4\t5\t6\t7\r\n";
  assert.deepEqual(parseTabelaPockets(input, d), [{ name: "P_0", volume: 100, surface: 50,
    depth: 8, accept: 0, donor: -1, hydrophobicity: -0.2, drugScore: 0.7 }]);
  assert.equal(d.descartadas, 0);
});

test("obterPockets: preserva URLs após descartes, informa a contagem e reutiliza o cache", async () => {
  const h = harness(), result = await h.get('obterPockets("1CRN")');
  assert.deepEqual(json(result.pockets), expectedPockets.map((p, i) => ({ ...p, residuosUrl: "res-" + (i ? 7 : 0) })));
  assert.equal(result.descartadas, 6);
  const calls = h.context.downloads.length;
  assert.equal(await h.get('obterPockets("1crn")'), result);
  assert.equal(h.context.downloads.length, calls);
});

test("obterPockets válido: mesmo objeto serializado e mesmo vínculo de subpockets da versão anterior", async () => {
  const h = harness(), header = tsv.split("\n")[0];
  const input = [header, tsv.split("\n")[1], "P_0_0\t1\t2\t3\t4\t5\t6\t7", tsv.split("\n")[8]].join("\n");
  const network = h.context.fetch;
  h.context.fetch = async (url) => {
    const res = await network(url);
    if (url === "https://fixture.invalid/table") res.text = async () => input;
    return res;
  };
  const result = await h.get('obterPockets("1CRN")');
  assert.deepEqual(json(result), { pockets: expectedPockets.map((p, i) => ({ ...p, residuosUrl: "res-" + i })),
    residues: Array.from({ length: 8 }, (_, i) => "res-" + i) });
});

test("PDB misto: cadeia/resíduo vazios, registro curto e números inválidos são contados uma vez", () => {
  const d = {};
  const filtered = filtrarResiduosPocket(pdb, d);
  assert.equal(d.descartadas, 8);
  assert.equal(filtered.split("\n").filter(l => l.startsWith("ATOM")).length, 3);
  assert.match(filtered, /^REMARK /);
  assert.match(filtered, /\nEND\n$/);
  assert.equal(Prep.parseAtomos(pdb).length, 11, "leitor geral continua independente da validação de pockets");
  const ensembleD = {}, prepD = {};
  assert.deepEqual(Ensemble.parseArquivoResiduos(pdb, ensembleD), Ensemble.parseArquivoResiduos(valido));
  assert.deepEqual(Prep.caixaPocket(pdb, 4, prepD), Prep.caixaPocket(valido, 4));
  assert.equal(ensembleD.descartadas, 8);
  assert.equal(prepD.descartadas, 8);
  assert.equal(Prep.caixaPocket(pdb, 4).nAtomos, 3);
});

test("dados válidos de 1CRN e 4HHB preservados com seleção por icode", () => {
  // Referências anteriores ao parse rigoroso; apenas o novo icode é comparado à parte.
  const hashes = { "1CRN": "bddda9bad1881343085a60521c965b6e4787603b20f9f4a088816eb806c7c287",
    "4HHB": "cf3137b238ad47e30ac8866b91f293e3812bff633fb505d78a76c048161bac1f" };
  const h = harness();
  for (const [id, hash] of Object.entries(hashes)) {
    const text = read("tests/fixtures/ui-render/" + id + ".pdb"), d = {};
    assert.equal(filtrarResiduosPocket(text, d), text);
    assert.equal(d.descartadas, 0);
    const selecoes = h.get("selecoesDosResiduos")(text);
    for (const sel of selecoes) assert.equal(sel.icode, " ", "código explícito para resíduo PDB sem inserção");
    const result = { residuos: Ensemble.parseArquivoResiduos(text), caixa: Prep.caixaPocket(text, 4),
      selecoes: selecoes.map(({ icode, ...sel }) => sel) };
    assert.equal(createHash("sha256").update(JSON.stringify(result)).digest("hex"), hash, id);
  }
});

test("PDB válido: delimitadores MODEL/ENDMDL e escolha do primeiro modelo no preparo permanecem", () => {
  const text = "MODEL        1\n" + valido.replace("END\n", "ENDMDL\n") + "MODEL        2\n" + valido.replace("END\n", "ENDMDL\nEND\n");
  const d = {};
  assert.equal(filtrarResiduosPocket(text, d), text);
  assert.equal(d.descartadas, 0);
  assert.equal(Prep.caixaPocket(text, 4).nAtomos, 3);
});

test("tela individual e comparação: aviso discreto sem perder pockets válidos, inclusive no cache", async () => {
  const h = harness();
  h.context.rendered = [];
  h.get('renderTabelaPockets = p => rendered.push(p); renderCmpPockets = p => rendered.push(p); estado.pdbId = "1CRN"');
  await h.get("detectarPockets()");
  assert.equal(h.get("estado.pockets.length"), 2);
  assert.equal(h.get("estado.pocketsInfo.estado"), "ok");
  assert.match(h.element("pockets-status").textContent, /Aviso: 6 linha/);
  await h.get("detectarPockets()");
  assert.match(h.element("pockets-status").textContent, /do cache.*Aviso: 6 linha/);
  h.get("renderPockets()");
  assert.match(h.element("pockets-status").textContent, /Aviso: 6 linha/);
  h.get('estado.comparacao = [{ id: "1CRN" }, { id: "4HHB" }]');
  await h.get("detectarPocketsComparacao()");
  assert.equal(h.get("estado.cmpPockets.length"), 2);
  assert.match(h.element("cmp-pockets-status").textContent, /Aviso: 12 linha/);
});

test("viewer: destaca só resíduos válidos e informa os descartes sem lançar erro", async () => {
  const h = harness();
  h.get('estado.viewer = {}; estado.pockets = [{ name: "P_0", residuosUrl: "res-0" }]; aplicarEstilo = () => {}; pintarResiduosPocket = () => {}; aplicarSuperficie = () => {}; sincronizarBotoesPocket = () => {}');
  await h.get("destacarPocket(0)");
  assert.deepEqual(json(h.get("estado.vistaPocket.sels")), [{ chain: "A", resi: [1], icode: " " }]);
  assert.equal(h.get("estado.vistaPocket.visivel"), true);
  assert.match(h.element("pockets-status").textContent, /Aviso: 8 linha/);
});

test("preparo: caixa usa só coordenadas válidas e repete o aviso ao ler do cache", async () => {
  const h = harness();
  h.loadUi("prep-ui", '  globalThis.prepPocketTest = { sugerirCaixa, state: () => vina };');
  const UI = h.get("PrepUI"), bridge = h.context.prepPocketTest;
  const text = read("tests/fixtures/ui-render/1CRN.pdb"), parsed = h.get("StructureModel").ler(text);
  UI.aoCarregar({ pdbId: "1CRN", nome: "1CRN.pdb", pdbText: text, estrutura: parsed.estrutura,
    dados: parsed.analise, meta: {}, pockets: [{ name: "P_0", residuosUrl: "res-0" }] });
  h.element("prep-pocket").value = "0";
  h.element("prep-margem").value = "4";
  await bridge.sugerirCaixa();
  assert.deepEqual(json(bridge.state().sugerida), Prep.caixaPocket(valido, 4));
  assert.match(h.element("prep-vina-status").textContent, /Aviso: 8 linha/);
  const n = h.context.downloads.length;
  await bridge.sugerirCaixa();
  assert.equal(h.context.downloads.length, n);
  assert.match(h.element("prep-vina-status").textContent, /Aviso: 8 linha/);
});

test("ensemble: guarda contagem de tabela e resíduos, mantém os válidos e exibe aviso no relatório", async () => {
  const h = harness();
  h.loadUi("ensemble-ui", '  globalThis.ensemblePocketTest = { chamarUm, htmlResumoRelatorio, setSession(s) { sessao = s; } };');
  const bridge = h.context.ensemblePocketTest;
  const item = { origem: "pdb", id: "1CRN", rotulo: "1CRN", texto: read("tests/fixtures/ui-render/1CRN.pdb") };
  const result = await bridge.chamarUm(item, 0, () => {});
  assert.equal(result.length, 2);
  assert.equal(result.reduce((n, p) => n + (p.descartadas || 0), 0), 22);
  assert.deepEqual(json(result[0].residuos), Ensemble.parseArquivoResiduos(valido).residuos);
  const input = h.get("EnsembleAnalysis.exemploSintetico()"), rel = h.get("EnsembleAnalysis").montarRelatorio(input);
  bridge.setSession({ bolsos: result });
  assert.match(bridge.htmlResumoRelatorio(rel, h.get("EnsembleAnalysis.FRASES")), /class="ens-nota">Aviso: 22 linha/);
  const n = h.context.downloads.length;
  assert.equal(await bridge.chamarUm(item, 0, () => {}), result);
  assert.equal(h.context.downloads.length, n);
});


test("PDB: serial, átomo, ocupação e fator B malformados são rejeitados por linha", () => {
  const atom = atomosValidos[0];
  for (const [start, end, value] of [[6, 11, "1x"], [12, 16, ""], [54, 60, "1x"], [60, 66, "NaN"]]) {
    const text = atom.slice(0, start) + value.padEnd(end - start) + atom.slice(end);
    const d = {};
    assert.equal(filtrarResiduosPocket(text, d), "");
    assert.equal(d.descartadas, 1);
  }
  const d = {};
  assert.equal(filtrarResiduosPocket("ATOM\nATOMXX\nHETATM\nEND\n", d), "END\n");
  assert.equal(d.descartadas, 3);
});

test("arquivo sem registros válidos: aviso inclui todos os descartes e o viewer não desenha", async () => {
  const h = harness();
  h.context.fetch = async () => ({ ok: true, text: async () => "ATOM\nHETATM\nEND\n" });
  h.get('estado.viewer = {}; estado.pockets = [{ name: "P_0", residuosUrl: "res-0" }]; sincronizarBotoesPocket = () => {}');
  await h.get("destacarPocket(0)");
  assert.equal(h.get("estado.vistaPocket"), null);
  assert.match(h.element("pockets-status").innerHTML, /Nenhum resíduo válido.*Aviso: 2 linha/);
  const d = {};
  assert.deepEqual(Prep.caixaPocket("ATOM\nHETATM\n", 4, d),
    { ok: false, erro: "Nenhum átomo no arquivo de resíduos do pocket." });
  assert.equal(d.descartadas, 2);
});
