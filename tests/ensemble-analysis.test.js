// Testes da lógica de ensemble. Dados sintéticos; não chamam o DoGSite.
"use strict";

const fs = require("fs");
const path = require("path");
const EA = require("../docs/ensemble-analysis.js");

let falhas = 0;
let ok = 0;

function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}

function assertEq(a, b, msg) {
  if (Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg + "\n  obtido: " + JSON.stringify(a) + "\n  esperado: " + JSON.stringify(b));
}

function grupo(rel, id) {
  return rel.grupos.find((g) => g.id === id);
}

function testeIdsELimite() {
  const p = EA.parseIds("4eyl, 1GZM\n1gzm;xxxx 2ABC ABCD");
  assertEq(p.ids, ["4EYL", "1GZM", "2ABC"], "ids únicos e em ordem");
  assert(p.invalidos.indexOf("xxxx") >= 0 && p.invalidos.indexOf("ABCD") >= 0, "ids inválidos");
  const lim = EA.aplicarLimite([1, 2, 3, 4], 2);
  assertEq(lim.aceitos, [1, 2], "limite corta a lista");
  assert(lim.excedeu && lim.limite === 2, "limite informa o corte");
  const duro = EA.aplicarLimite(Array.from({ length: 25 }, (_, i) => i), 50);
  assertEq(duro.aceitos.length, 20, "teto de 20 estruturas");
  assert(EA.hashTexto("abc") === EA.hashTexto("abc") && EA.hashTexto("abc") !== EA.hashTexto("abd"), "hash estável");
}

function testeModelosELigante() {
  const a = EA.escreverAtomo({ serial: 1, seq: 1, x: 1, y: 2, z: 3 });
  const b = EA.escreverAtomo({ serial: 2, seq: 2, x: 4, y: 5, z: 6 });
  const texto = "HEADER TEST\nMODEL        1\n" + a + "\nENDMDL\nMODEL        2\n" + b + "\nENDMDL\nEND\n";
  const mods = EA.separarModelos(texto);
  assertEq(mods.length, 2, "dois modelos");
  assertEq(mods[0].indice, 1, "índice do primeiro modelo");
  assertEq(mods[1].indice, 2, "índice do segundo modelo");
  assertEq(EA.separarModelos(a + "\nEND\n").length, 1, "arquivo sem MODEL continua um bloco");
  const parsed = EA.parseArquivoResiduos(a + "\n" + a.replace("   1", "   9"));
  assertEq(parsed.residuos.length, 1, "mesmo resíduo não duplica");
  assert(parsed.extensao && Math.abs(parsed.extensao.cx - 1) < 1e-6, "centróide do arquivo de resíduos");

  const lig = EA.escreverAtomo({ rec: "HETATM", nome: " C1 ", res: "LIG", seq: 9, el: " C" });
  const hoh = EA.escreverAtomo({ rec: "HETATM", nome: " O  ", res: "HOH", seq: 8, el: " O" });
  const gol = EA.escreverAtomo({ rec: "HETATM", nome: " C1 ", res: "GOL", seq: 7, el: " C" });
  const zn = EA.escreverAtomo({ rec: "HETATM", nome: "ZN  ", res: "ZN", seq: 6, el: "ZN" });
  assertEq(EA.detectarLigante(lig).classe, "holo", "HETATM de ligante é indício holo");
  assertEq(EA.detectarLigante(hoh + "\n" + gol).classe, "apo", "água e aditivo não contam como ligante");
  assertEq(EA.detectarLigante(zn).classe, "apo-com-ion", "íon não conta como ligante orgânico");
  assertEq(EA.detectarLigante(lig + "\n" + hoh).classe, "holo", "água não apaga o ligante");
}

function testeExemplo() {
  const rel = EA.montarRelatorio(EA.exemploSintetico());
  assert(rel.exemplo, "exemplo marcado");
  assertEq(rel.nEfetivo, 3, "N efetivo do exemplo");
  const g1 = grupo(rel, "G1");
  const g2 = grupo(rel, "G2");
  const g3 = grupo(rel, "G3");
  assert(g1 && g2 && g3, "três grupos no exemplo");
  assertEq(g1.persistencia.texto, "3 de 3", "G1 é 3 de 3");
  assertEq(g1.persistencia.n, 3, "denominador é N efetivo");
  assertEq(g1.persistencia.faixa, 75, "3 de 3 cai na faixa 75");
  assertEq(g2.persistencia.texto, "2 de 3", "G2 é 2 de 3");
  assertEq(g2.persistencia.faixa, 50, "2 de 3 cai na faixa 50");
  assertEq(g3.persistencia.texto, "1 de 3", "G3 é 1 de 3");
  assertEq(g3.persistencia.faixa, 25, "1 de 3 cai na faixa 25");
  const r3 = g1.residuos.todos.find((r) => r.chave === "A|3|");
  const r1 = g1.residuos.todos.find((r) => r.chave === "A|1|");
  assert(r1 && r1.texto === "3 de 3" && r1.faixa === 75, "resíduo 1 em 3 de 3");
  assert(r3 && r3.texto === "2 de 3" && r3.pct === 66.7 && r3.faixa === 50, "resíduo 3 em 2 de 3");
  const r12 = g2.residuos.todos.find((r) => r.chave === "A|12|");
  assert(r12 && r12.texto === "1 de 3" && r12.faixa === 25, "resíduo 12 em 1 de 3");
  assertEq(g1.drugScore.media, 0.7, "média do drugScore");
  assertEq(g1.drugScore.min, 0.6, "mínimo do drugScore");
  assertEq(g1.drugScore.max, 0.8, "máximo do drugScore");
  assertEq(g1.volume.media, 100, "média do volume");
  assertEq(g1.volume.min, 90, "mínimo do volume");
  assertEq(g1.volume.max, 110, "máximo do volume");
  assert(g1.misturaApoHolo, "G1 mistura apo e holo");
  assertEq(rel.estruturas[1].ligante.classe, "holo", "EX2 tem ligante");
  assertEq(rel.estruturas[0].ligante.classe, "apo", "EX1 sem ligante");
  assertEq(rel.matriz.linhas.length, 3, "matriz tem uma linha por estrutura");
  assertEq(rel.matriz.colunas.length, 3, "matriz tem uma coluna por grupo");
  assertEq(rel.matriz.linhas[0].celulas[0].bolsao, "P_0", "EX1 × G1 é P_0");
  assertEq(rel.matriz.linhas[2].celulas[1].presente, false, "EX3 não entra em G2");
  assert(rel.caixaEnsemble.ok, "caixa do ensemble existe");
  assertEq(rel.caixaEnsemble.center_x, 5, "centro do envelope");
  assertEq(rel.caixaEnsemble.size_x, 18, "largura do envelope");
  assertEq(rel.caixaEnsemble.size_y, 8, "altura do envelope com margem");
  assertEq(rel.caixaEnsemble.grupos.slice().sort(), ["G1", "G2"], "caixa usa G1 e G2");
  assertEq(g1.centroideReferencia.x, 0, "centróide de G1 na referência EX1");
  assertEq(g1.centroideReferencia.fonte, "bolsao-desta-estrutura", "fonte do centróide");
}

function testeJaccardECentroide() {
  const base = EA.exemploSintetico();
  const alto = EA.montarRelatorio({ ...base, params: { jaccardMin: 0.9 } });
  const g1 = grupo(alto, "G1");
  assertEq(g1.persistencia.texto, "2 de 3", "Jaccard 0,9 não junta o bolsão parcial");
  assertEq(alto.grupos.length, 5, "Jaccard alto deixa de fora os bolsões parciais");
  const longe = EA.exemploSintetico();
  longe.bolsos[2].extensao = { n: 8, cx: 100, cy: 0, cz: 0, minx: 99, miny: -1, minz: -1, maxx: 101, maxy: 1, maxz: 1 };
  const comDist = EA.montarRelatorio({
    ...longe,
    mesmoReferencial: true,
    params: { jaccardMin: 0.5, usarCentroide: true, distanciaMax: 6 },
  });
  assert(comDist.centroideAplicado, "distância entra no mesmo referencial");
  assertEq(grupo(comDist, "G1").persistencia.texto, "2 de 3", "centróide distante impede o terceiro");
  const semQuadro = EA.montarRelatorio({
    ...base,
    mesmoReferencial: false,
    params: { usarCentroide: true, distanciaMax: 0.1 },
  });
  assert(!semQuadro.centroideAplicado, "sem referencial comum a distância não entra");
  assert(semQuadro.avisoCentroide, "o relatório registra que a distância foi recusada");
  assertEq(grupo(semQuadro, "G1").persistencia.texto, "3 de 3", "o Jaccard continua valendo");
}

function testeSequenciaENumero() {
  const atomo = (res, seq, chain) => EA.escreverAtomo({ res, seq, chain: chain || "A", x: seq, y: 0, z: 0 });
  const ref = [atomo("ALA", 1), atomo("ARG", 2), atomo("ASN", 3), "END"].join("\n");
  const outro = [atomo("ALA", 1), atomo("GLY", 2), atomo("ARG", 3), atomo("ASN", 4), "END"].join("\n");
  const residuos = (pares) => pares.map(([resname, resseq]) => ({ chain: "A", resseq, icode: "", resname }));
  const entrada = {
    estruturas: [
      { id: "R", texto: ref },
      { id: "O", texto: outro },
    ],
    bolsos: [
      { estruturaId: "R", name: "P_0", residuos: residuos([["ALA", 1], ["ARG", 2], ["ASN", 3]]), drugScore: 0.5, volume: 10, extensao: null },
      { estruturaId: "O", name: "P_0", residuos: residuos([["ALA", 1], ["GLY", 2], ["ARG", 3], ["ASN", 4]]), drugScore: 0.4, volume: 11, extensao: null },
    ],
  };
  const porNumero = EA.montarRelatorio({ ...entrada, params: { modoAlinhamento: "numero", jaccardMin: 0.5 } });
  const chave2n = grupo(porNumero, "G1").residuos.todos.find((r) => r.chave === "A|2|");
  assert(chave2n && chave2n.nomesDivergem, "pelo número, o resíduo 2 junta ARG e GLY");
  const porSeq = EA.montarRelatorio({ ...entrada, params: { modoAlinhamento: "sequencia", jaccardMin: 0.5 } });
  const chave2s = grupo(porSeq, "G1").residuos.todos.find((r) => r.chave === "A|2|");
  assert(chave2s && !chave2s.nomesDivergem && chave2s.nomes[0] === "ARG", "pela sequência, a coluna 2 continua ARG");
  assert(grupo(porSeq, "G1").residuos.todos.some((r) => String(r.chave).indexOf("local:") === 0), "a inserção não cruza estruturas");
  const map = EA.alinharIndices("ARN", "AGRN");
  assertEq(map, [0, -1, 1, 2], "buraco na sequência de referência");
}

function testeNEfetivoEExportacao() {
  const base = EA.exemploSintetico();
  base.estruturas.push({ id: "RUIM", rotulo: "RUIM", texto: "", origem: "pdb", erro: "PDB não encontrado." });
  base.nPedidas = 4;
  base.nDisponiveis = 6;
  const rel = EA.montarRelatorio(base);
  assertEq(rel.nEfetivo, 3, "erro fica fora do N efetivo");
  assertEq(rel.nPedidas, 4, "pedidas incluem a que falhou");
  assertEq(grupo(rel, "G1").persistencia.texto, "3 de 3", "a falha não entra no denominador");
  assertEq(rel.matriz.linhas.length, 4, "a matriz ainda mostra a estrutura que falhou");
  assert(rel.matriz.linhas[3].celulas.every((c) => !c.presente), "estrutura com erro não marca bolsão");
  const dup = EA.exemploSintetico();
  dup.estruturas.push({ id: "EX1", texto: dup.estruturas[0].texto });
  const relDup = EA.montarRelatorio(dup);
  assertEq(relDup.nEfetivo, 3, "cópia com o mesmo id não infla N");
  const json = JSON.parse(EA.exportarJSON(rel, { decisaoPesquisador: "conferir o sítio", geradoEm: "2026-01-01" }));
  assertEq(json.trabalhoRelacionado.doi, "10.1093/nar/gkag453", "DOI no JSON");
  assertEq(json.decisaoPesquisador, "conferir o sítio", "decisão do pesquisador");
  assert(json.frases.redundancia.indexOf("Estruturas redundantes inflam a contagem") === 0, "aviso de redundância");
  assert(json.frases.motor.indexOf("Resultados de motores diferentes não devem ser misturados") === 0, "aviso de motor");
  assert(!/superior|melhor que o PockFlex/i.test(JSON.stringify(json.frases)), "sem afirmar superioridade");
  const csv = EA.exportarCSV(rel, { decisaoPesquisador: "=cmd" });
  assert(csv.grupos.indexOf("3 de 3") >= 0, "CSV traz k de N");
  assert(csv.grupos.indexOf("'=cmd") >= 0, "CSV neutraliza fórmula");
  assert(csv.matriz.indexOf("EX1") >= 0 && csv.matriz.indexOf("P_0") >= 0, "CSV da matriz");
  assert(csv.grupos.indexOf("10.1093/nar/gkag453") >= 0, "DOI no CSV");
  const cfg = EA.formatarConfigVina(rel.caixaEnsemble);
  const lido = EA.lerConfigVina(cfg);
  assert(lido.ok && lido.caixa.center_x === rel.caixaEnsemble.center_x, "texto da caixa faz a volta");
  const ref2 = EA.montarRelatorio({ ...EA.exemploSintetico(), params: { referenciaId: "EX2" } });
  assertEq(grupo(ref2, "G1").centroideReferencia.x, 0.5, "referência EX2 usa o centróide dela");
  assertEq(ref2.caixaEnsemble.center_x, 5.5, "envelope acompanha a referência");
}

function testeCaixaECentroideDeResiduos() {
  const ext = { n: 4, cx: 1, cy: 2, cz: 3, minx: 0, miny: 1, minz: 2, maxx: 2, maxy: 3, maxz: 4 };
  const caixa = EA.caixaDeExtensao(ext, 4);
  assertEq(caixa.center_x, 1, "centro da caixa por estrutura");
  assertEq(caixa.size_x, 10, "tamanho com margem dos dois lados");
  assertEq(caixa.formula, "media-dos-atomos", "fórmula da caixa por estrutura");
  const vazio = EA.envelopeCentroides([], 4);
  assert(!vazio.ok, "envelope vazio não vira caixa");
  const atomo = EA.escreverAtomo({ nome: " CA ", res: "ALA", seq: 4, x: 2, y: 4, z: 6 });
  const c = EA.centroideNaReferencia(atomo, ["A|4|"]);
  assert(c && c.x === 2 && c.y === 4 && c.z === 6, "centróide dos CA na referência");
  const params = EA.normalizarParams({ jaccardMin: 2, faixaCaixa: 40, limite: 0, margemVina: -3 });
  assertEq(params.jaccardMin, 1, "Jaccard não passa de 1");
  assertEq(params.faixaCaixa, 50, "faixa da caixa fora de 25/50/75 volta a 50");
  assertEq(params.limite, 1, "limite mínimo é 1");
  assertEq(params.margemVina, 0, "margem negativa vira zero");
}

function testeInterfaceTemFrases() {
  const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "../docs/ensemble-ui.js"), "utf8");
  for (const chave of ["persistencia", "dinamica", "exploratorio", "docking", "redundancia", "motor", "nEfetivo", "relacionado", "vina"]) {
    assert(html.indexOf(EA.FRASES[chave]) >= 0, "interface contém a frase " + chave);
  }
  assert(html.indexOf("10.1093/nar/gkag453") >= 0, "DOI na interface");
  assert(html.indexOf("ensemble-analysis.js") >= 0 && html.indexOf("ensemble-ui.js") >= 0, "scripts do ensemble");
  assert(/const ATIVO = (true|false);/.test(ui), "flag ATIVO presente");
  assert(!/superior ao PockFlex|melhor que o PockFlex/i.test(html + ui), "interface sem superioridade");
  const prep = fs.readFileSync(path.join(__dirname, "../docs/prep-analysis.js"), "utf8");
  assert(prep.indexOf("ensemble-1") < 0, "prep-analysis.js não foi acoplado ao ensemble");
}

function main() {
  testeIdsELimite();
  testeModelosELigante();
  testeExemplo();
  testeJaccardECentroide();
  testeSequenciaENumero();
  testeNEfetivoEExportacao();
  testeCaixaECentroideDeResiduos();
  testeInterfaceTemFrases();
  console.log(ok + " asserções ok, " + falhas + " falhas");
  if (falhas) process.exit(1);
}

main();
