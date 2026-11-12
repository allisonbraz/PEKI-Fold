"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { cases, GOLDENS, json, models } = require("./helpers/characterization-cases.js");

// Expected files are checked in. A normal test run never writes or updates them.
for (const [name, capture] of Object.entries(cases)) {
  test("saída atual: " + name, async () => {
    const expected = JSON.parse(fs.readFileSync(path.join(GOLDENS, name + ".json"), "utf8"));
    assert.deepStrictEqual(json(await capture()), expected);
  });
}

test("snapshot preserva valores ausentes sem inventar zero", () => {
  const { nulosAtuais } = cases.snapshots();
  assert.equal(nulosAtuais.pockets.itens[0].drugScore, null);
  assert.deepStrictEqual(json(nulosAtuais.qualidade.metricas), []);
});

test("decimal no snapshot aceita apenas números finitos e strings numéricas", () => {
  const { get } = models();
  const AS = get("AnalysisSnapshot");
  const estrutura = get("StructureModel").ler(fs.readFileSync(path.join(__dirname, "fixtures/ui-render/1CRN.pdb"), "utf8")).estrutura;
  const invalidos = [null, undefined, "", " \t", "texto", "NaN", "Infinity", NaN, Infinity, -Infinity,
    false, true, [], [0], {}, { valueOf: () => 0 }];
  const validos = [[0, 0], [1.25, 1.25], [-2.5, -2.5], ["0", 0], [" 2.5 ", 2.5], ["1e2", 100]];
  for (const [valor, esperado] of [...invalidos.map((v) => [v, null]), ...validos]) {
    const snap = AS.montarDeWorkspace({ estrutura, pdbId: "1CRN", pockets: [{ name: "P_0",
      volume: valor, surface: valor, depth: valor, hydrophobicity: valor, drugScore: valor }],
      qualidade: { relatorio: { estado: "ok", metricas: [{ id: "rfree", valor }] } },
    }, { agora: "2026-11-12T15:00:00.000Z", id: "CRN-DECIMAL" });
    assert.deepStrictEqual(json(snap.pockets.itens[0]), {
      name: "P_0", volume: esperado, surface: esperado, depth: esperado, hydrophobicity: esperado, drugScore: esperado,
    });
    assert.deepStrictEqual(json(snap.qualidade.metricas.map((m) => m.valor)), esperado === null ? [] : [esperado]);
    assert.equal(JSON.parse(JSON.stringify(snap)).pockets.itens[0].drugScore, esperado);
  }
});

test("snapshots antigos e export de referência continuam sendo reimportados sem alteração", () => {
  const AS = models().get("AnalysisSnapshot");
  const exportLegado = JSON.parse(fs.readFileSync(path.join(GOLDENS, "exports.json"), "utf8")).snapshot;
  // Zeros já gravados pela versão anterior continuam sendo dados importados.
  Object.assign(exportLegado.pockets.itens[1], { volume: 0, hydrophobicity: 0, drugScore: 0 });
  const antigos = [
    JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/analises/4HHB-analise.json"), "utf8")),
    JSON.parse(fs.readFileSync(path.join(GOLDENS, "snapshots.json"), "utf8")).snapshot,
    exportLegado,
  ];
  for (const antigo of antigos) {
    const resultado = AS.importar(JSON.stringify(antigo), []);
    assert.equal(resultado.ok, true, resultado.erro);
    assert.deepStrictEqual(json(resultado.analise), antigo);
    assert.deepStrictEqual(json(resultado.colecao), [antigo]);
  }
});

// These are deliberate records of existing defects, not desired behavior.
// A future bug fix should change these tests in its own reviewed change.
test("comportamento conhecido: validação interna aceita métricas com tipo incorreto", () => {
  const AS = models().get("AnalysisSnapshot");
  const snapshot = cases.snapshots().snapshot;
  snapshot.qualidade = { estado: "ok", metricas: {} };
  assert.equal(AS.validarObjeto(snapshot).ok, true);
  assert.throws(() => AS.comparar([snapshot, { ...snapshot, id: "SIN-OUTRO" }], {}), /lista\.find is not a function/);
});

test("comportamento conhecido: XML em blocos perde subgrupo após 64 KiB", async () => {
  const QM = models().get("QualityModel");
  const xml = '<wwPDB-validation-information><Entry pdbid="1ABC" percentilebins="xray" clashscore="1"/><!--'
    + "x".repeat(70000)
    + '--><ModelledSubgroup chain="A" resnum="1" model="1" resname="GLY"/></wwPDB-validation-information>';
  const chunks = [Buffer.from(xml.slice(0, 65536)), Buffer.from(xml.slice(65536))];
  let index = 0;
  const response = { status: 200, body: { getReader: () => ({
    read: async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true },
    cancel: async () => {},
  }) } };
  const direct = QM.lerXml(xml, { id: "1ABC" });
  const streamed = await QM.consultarRelatorio("1ABC", { fetch: async () => response });
  assert.equal(direct.local.subgruposLidos, 1);
  assert.equal(streamed.estado, "ok");
  assert.equal(streamed.local.subgruposLidos, 0);
});

test("comportamento conhecido: preparo aceita e renderiza caixa com tamanhos não positivos", async () => {
  const output = await cases["prep-ui"]();
  const step = output.etapas.find((s) => s.nome === "4HHB-caixa-negativa-aceita");
  assert.deepStrictEqual(step.depois.vina.editada, {
    center_x: 1, center_y: 2, center_z: 3, size_x: -5, size_y: 0, size_z: -2,
  });
  assert.match(step.html, /id="prep-sx"[^>]*value="-5"/);
  assert.match(step.html, /id="prep-sy"[^>]*value="0"/);
  assert.match(step.html, /id="prep-sz"[^>]*value="-2"/);
});

test("comportamento conhecido: remover pockets não invalida a caixa antiga do preparo", async () => {
  const output = await cases["prep-ui"]();
  const step = output.etapas.find((s) => s.nome === "4HHB-pockets-removidos-caixa-antiga");
  assert.match(step.html, /Nenhum pocket detectado ainda/);
  assert.match(step.html, /id="prep-sx"[^>]*value="-5"/);
  assert.equal(step.depois.vina.pocketIdx, "1");
  assert.equal(step.depois.cacheRes.length, 1);
  assert.equal(output.pedidos.length, 1, "dois pedidos de sugestão compartilham o cache");
});

test("comportamento conhecido: mmCIF bloqueado mantém seleção e cache anteriores do preparo", async () => {
  const step = (await cases["prep-ui"]()).bloqueadoMmcif;
  assert.match(step.html, /mmCIF não foi enviado/);
  assert.equal(step.depois.resultado, null);
  assert.deepStrictEqual(step.depois.selecao, step.antes.selecao);
  assert.deepStrictEqual(step.depois.cacheRes, step.antes.cacheRes);
  assert.equal(step.depois.cacheRes.length, 1);
});

test("comportamento conhecido: ensemble corrige referência mas conserva caixa, pocket e grupo obsoletos", () => {
  const output = cases["ensemble-ui"]();
  const pocket = output.etapas.find((s) => s.nome === "pocket-e-grupo-obsoletos");
  assert.equal(pocket.depois.sessao.bolsaoCaixa, "POCKET_REMOVIDO");
  assert.match(pocket.html, /<option value="FIX-P_0" selected>/);
  const step = output.etapas.find((s) => s.nome === "4HHB-removido-referencia-corrigida-caixa-obsoleta");
  assert.equal(step.depois.sessao.referenciaId, "1CRN");
  assert.equal(step.depois.sessao.estruturaCaixa, "4HHB");
  assert.equal(step.depois.sessao.bolsaoCaixa, "POCKET_REMOVIDO");
  assert.equal(step.depois.sessao.grupoId, "GRUPO_REMOVIDO");
  assert.match(step.html, /Esta estrutura não tem bolsão neste agrupamento/);
  for (const rendered of output.etapas) {
    assert.deepStrictEqual(rendered.relatorioDepois, rendered.relatorioAntes, "render não altera o relatório: " + rendered.nome);
  }
});

test("diagnóstico adicional: inserção não é fundida ao número inteiro e salto não vira ausência", () => {
  const result = cases["diagnosticar-caminhos"]();
  const unknown = result["insercao-e-saltos-sem-fonte"];
  assert.deepStrictEqual(json(unknown.residuos.A.map((r) => r[1])), ["1", "2", "2A", "5", "8"]);
  assert.equal(unknown.lacunas.determinado, false);
  assert.deepStrictEqual(json(unknown.lacunas.naoResolvidos), []);
  assert.deepStrictEqual(json(unknown.lacunas.saltosNumeracao.map((s) => s.inteirosSemResiduoDeclarado)), [[3, 4], [6, 7]]);
  const declared = result["remark-duplicado-insercao-conflito-modelo"].lacunas;
  assert.equal(declared.naoResolvidos.filter((r) => r.authSeq === 3).length, 1);
  assert(declared.naoResolvidos.some((r) => r.authSeq === 4 && r.icode === "A"));
  assert(!declared.naoResolvidos.some((r) => r.authSeq === 6), "REMARK do modelo 2 não entra no modelo 1");
});

test("comportamento conhecido: tolerância de empate gera posição 1 sem incluir todos os líderes", () => {
  const result = cases["comparar-caminhos"]().toleranciaNaoTransitiva;
  assert.deepStrictEqual(json(result.candidatos.map((c) => [c.id, c.posicao])), [["CRN-A", 1], ["CRN-B", 1], ["CRN-C", 1], ["CRN-D", 4]]);
  assert.deepStrictEqual(json(result.lideres.map((c) => c.id)), ["CRN-A", "CRN-B"]);
});

test("comportamento conhecido: inserção mascara posição sem diagnóstico na cobertura da região", () => {
  const result = cases["comparar-caminhos"]().insercaoMascaraSalto;
  assert.equal(result.avaliacao.segmentos[0].insercoes, 1);
  assert.equal(result.avaliacao.indeterminado, false);
  assert.equal(result.resultado.ranqueado, true);
  assert(result.resultado.candidatos.every((c) => c.pontuacao === 1));
});

test("comportamento conhecido: maior ocupação mistura altLoc por átomo no mesmo resíduo", () => {
  const result = cases["limpar-pdb-caminhos"]();
  const lines = result.casos.ocupacao.resultado.pdb.split("\n").filter((l) => l.startsWith("ATOM  ") && l[21] === "A" && l.slice(22, 27).trim() === "1");
  assert.deepStrictEqual(lines.map((l) => [l.slice(12, 16).trim(), l[16]]), [["CA", "B"], ["N", "A"]]);
  assert.equal(result.casos.cadeiasVazias.resultado.vazio, true);
  assert.deepStrictEqual(json(result.casos.padrao.resultado.contagens.residuosSumiramAltloc), ["LEU|A|2|"]);
});

test("comportamento conhecido: cache precede cancelamento e não remapeia novo contexto estrutural", async () => {
  const result = (await cases["consultar-relatorio-caminhos"]()).cache;
  assert.equal(result.mesmaReferencia, true);
  assert.equal(result.pedidosAntesDeForcar, 1);
  assert.equal(result.pedidos.length, 2);
  assert.equal(result.canceladoComHit.estado, "ok");
  assert.equal(result.hit.local.itens[0].mapeamento, "sem_residuo");
  assert.equal(result.forcado.local.itens[0].mapeamento, "modelo");
});

test("comportamento conhecido: timeout e listener são removidos antes da leitura do corpo XML", async () => {
  const captured = await cases["consultar-relatorio-caminhos"]();
  const jsonBody = captured.canceladoDuranteJsonAceito;
  assert.equal(jsonBody.cancelado, true);
  assert.equal(jsonBody.resultado.estado, "ok");
  assert.equal(jsonBody.cache.relatorios, 1);
  assert.equal(jsonBody.pedidos[1].cancelamentos, 0);
  const result = captured.canceladoDuranteCorpoAceito;
  assert.equal(result.cancelado, true);
  assert.equal(result.resultado.estado, "ok");
  assert.equal(result.cache.relatorios, 1);
  assert.equal(result.pedidos[0].cancelamentos, 0);
  assert.deepStrictEqual(result.timers, [["agendar", 1, 12000], ["limpar", 1]]);
});

test("consulta adicional: cancelamento, timeout, alternativa JSON e erros têm fronteiras simuladas", async () => {
  const result = await cases["consultar-relatorio-caminhos"]();
  assert.equal(result.canceladoAntes.pedidos.length, 0);
  assert.equal(result.canceladoNoXml.resultado.codigo, "cancelado");
  assert.equal(result.canceladoNoJson.resultado.codigo, "cancelado");
  assert.equal(result.alternativaJson.resultado.consulta, "rcsb-json");
  assert.equal(result.timeoutXml.resultado.consulta, "rcsb-json");
  assert(result.timeoutXml.timers.some((t) => t[0] === "disparar"));
  for (const status of [404, 429, 503]) {
    assert.equal(result["http" + status].resultado.metricas.length, 0);
    assert.equal(result["http" + status].cache.relatorios, 0);
  }
  assert.equal(result.rede.resultado.estado, "rede");
  assert.equal(result.jsonInvalido.resultado.estado, "rede");
});
