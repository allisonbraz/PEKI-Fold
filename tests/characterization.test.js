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

// These are deliberate records of existing defects, not desired behavior.
// A future bug fix should change these tests in its own reviewed change.
test("comportamento conhecido: null vira zero no JSON salvo", () => {
  const { nulosAtuais } = cases.snapshots();
  assert.equal(nulosAtuais.pockets.itens[0].drugScore, 0);
  assert.equal(nulosAtuais.qualidade.metricas[0].valor, 0);
});

test("validação interna rejeita métricas com tipo incorreto antes da importação", () => {
  const AS = models().get("AnalysisSnapshot");
  const snapshot = cases.snapshots().snapshot;
  snapshot.qualidade = { estado: "ok", metricas: {} };
  const validacao = AS.validarObjeto(snapshot);
  assert.equal(validacao.ok, false);
  assert.match(validacao.erro, /qualidade\.metricas.*array/);
  const antigo = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/analises/4HHB-analise.json"), "utf8"));
  const importacao = AS.importar(JSON.stringify(snapshot), [antigo]);
  assert.equal(importacao.ok, false);
  assert.deepStrictEqual(json(importacao.colecao), [antigo]);
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


// Derivados da referência sintética existente, apenas para validar tipos.
function snapshotParaValidacao() {
  const snap = JSON.parse(fs.readFileSync(path.join(GOLDENS, "exports.json"), "utf8")).snapshot;
  snap.qualidade.metricas = [{ id: "rfree", valor: 0.2 }];
  snap.lacunas.naoResolvidos = [{ cadeia: "A", resname: "SER", seq: 3, icode: "A" }];
  snap.lacunas.saltosNumeracao = [{ cadeia: "A", de: 2, para: 4, interpretacao: "salto_de_numeracao" }];
  snap.componentes.modificados = [{ codigo: "MSE", instancias: 1, nome: null }];
  snap.componentes.anotacoesCcd = [{ codigo: "ZN", instancias: 1, estado: "ok" }];
  snap.preparo.caixaVina = { editada: true, center_x: 0, center_y: 1, center_z: 2, size_x: -5, size_y: 0, size_z: 3 };
  snap.uniprot.declaracoes = [{ cadeia: "A", accession: "FIXTURE", db: "UNP", pdbInicio: 1, pdbFim: 11 }];
  return snap;
}

function alterarCampoValidacao(snap, caminho, valor) {
  const partes = caminho.split(".");
  const chave = partes.pop();
  const alvo = partes.reduce((item, parte) => item[parte], snap);
  alvo[chave] = valor;
}

function conferirTipoInvalido(AS, caminho, valor) {
  const snap = snapshotParaValidacao();
  alterarCampoValidacao(snap, caminho, valor);
  const resultado = AS.validarObjeto(snap);
  assert.equal(resultado.ok, false, caminho + " não pode aceitar " + String(valor));
  assert.equal(resultado.analise, null);
  const campo = caminho.replace(/\.(\d+)/g, "[$1]");
  assert(resultado.erro.includes(campo), resultado.erro);
}

test("validação rejeita listas e elementos com tipo incorreto", () => {
  const AS = models().get("AnalysisSnapshot");
  const listas = ["cadeias", "cadeias.0.residuos", "lacunas.naoResolvidos", "lacunas.saltosNumeracao",
    "componentes.hetero", "componentes.ions", "componentes.modificados", "componentes.anotacoesCcd",
    "qualidade.metricas", "qualidade.omitidos", "pockets.itens", "uniprot.declaracoes",
    "preparo.selecao.cadeias", "preparo.selecao.codigosHetMantidos", "limitacoes"];
  for (const campo of listas) {
    for (const valor of [{}, "lista", 0, false, null]) conferirTipoInvalido(AS, campo, valor);
  }
  for (const campo of ["cadeias.0", "cadeias.0.residuos.0", "lacunas.naoResolvidos.0",
    "lacunas.saltosNumeracao.0", "componentes.hetero.0", "componentes.ions.0", "componentes.modificados.0",
    "componentes.anotacoesCcd.0", "qualidade.metricas.0", "pockets.itens.0", "uniprot.declaracoes.0",
    "preparo.selecao.cadeias.0", "preparo.selecao.codigosHetMantidos.0", "limitacoes.0"]) {
    for (const valor of [null, 0, []]) conferirTipoInvalido(AS, campo, valor);
  }
});

test("validação exige números finitos ou null sem converter strings", () => {
  const AS = models().get("AnalysisSnapshot");
  const numeros = ["modelo.selecionado", "modelo.total", "origem.resolucaoArquivo.valor", "cadeias.0.residuos.0.seq",
    "cobertura.polimerosModelados", "lacunas.naoResolvidos.0.seq", "lacunas.saltosNumeracao.0.de", "lacunas.saltosNumeracao.0.para",
    "componentes.proteinas.posicoes", "componentes.proteinas.padrao", "componentes.proteinas.modificadas",
    "componentes.hetero.0.instancias", "componentes.ions.0.instancias", "componentes.modificados.0.instancias",
    "componentes.anotacoesCcd.0.instancias", "componentes.aguas.instancias", "qualidade.metricas.0.valor",
    "pockets.itens.0.volume", "pockets.itens.0.surface", "pockets.itens.0.depth", "pockets.itens.0.hydrophobicity", "pockets.itens.0.drugScore",
    "preparo.contagens.dissulfetos", "preparo.contagens.glicosilacao", "preparo.contagens.ions", "preparo.contagens.histidinas", "preparo.contagens.aguas",
    "preparo.caixaVina.center_x", "preparo.caixaVina.center_y", "preparo.caixaVina.center_z",
    "preparo.caixaVina.size_x", "preparo.caixaVina.size_y", "preparo.caixaVina.size_z",
    "uniprot.declaracoes.0.pdbInicio", "uniprot.declaracoes.0.pdbFim", "anotacoes.motivoSequencia.ocorrencias"];
  for (const campo of numeros) {
    for (const valor of ["0", "2.5", false, {}, [], undefined, NaN, Infinity, -Infinity]) conferirTipoInvalido(AS, campo, valor);
    if (campo === "cobertura.polimerosModelados") continue;
    const snap = snapshotParaValidacao();
    alterarCampoValidacao(snap, campo, null);
    assert.equal(AS.validarObjeto(snap).ok, true, campo + " aceita null");
  }
});

test("validação rejeita strings obrigatórias ausentes, vazias ou com outro tipo", () => {
  const AS = models().get("AnalysisSnapshot");
  for (const campo of ["schema", "id", "rotulo", "geradoEm", "cadeias.0.id", "cadeias.0.residuos.0.resname",
    "componentes.hetero.0.codigo", "qualidade.metricas.0.id", "pockets.itens.0.name", "preparo.estado"]) {
    for (const valor of [undefined, null, "", " ", 42, false, [], {}]) conferirTipoInvalido(AS, campo, valor);
  }
  for (const valor of [undefined, null, 42, [], {}]) conferirTipoInvalido(AS, "cadeias.0.sequencia", valor);
  for (const campo of ["qualidade.metricas.0.id", "pockets.itens.0.name", "componentes.hetero.0.codigo"]) {
    const snap = snapshotParaValidacao(), partes = campo.split("."), chave = partes.pop();
    delete partes.reduce((item, parte) => item[parte], snap)[chave];
    assert.equal(AS.validarObjeto(snap).ok, false, campo + " é obrigatório");
  }
});

test("validação rejeita objetos e booleanos com outro tipo", () => {
  const AS = models().get("AnalysisSnapshot");
  for (const campo of ["origem", "modelo", "cobertura", "lacunas", "componentes", "componentes.proteinas",
    "componentes.aguas", "componentes.holo", "qualidade", "qualidade.fonte", "qualidade.local", "pockets",
    "preparo", "preparo.contagens", "preparo.selecao", "preparo.anotacoes", "preparo.caixaVina", "uniprot", "anotacoes"]) {
    for (const valor of [[], "objeto", false]) conferirTipoInvalido(AS, campo, valor);
  }
  for (const campo of ["origem.sintetico", "lacunas.determinado", "preparo.selecao.removerAguas", "preparo.caixaVina.editada"]) {
    for (const valor of ["false", 0, null, {}]) conferirTipoInvalido(AS, campo, valor);
  }
});

test("snapshots antigos válidos são reimportados sem conversões nem defaults", () => {
  const AS = models().get("AnalysisSnapshot");
  const exports = JSON.parse(fs.readFileSync(path.join(GOLDENS, "exports.json"), "utf8"));
  const antigos = [
    JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/analises/4HHB-analise.json"), "utf8")),
    JSON.parse(fs.readFileSync(path.join(GOLDENS, "snapshots.json"), "utf8")).snapshot,
    exports.snapshot, JSON.parse(exports.downloads.find((d) => d.nome.endsWith("-analise.json")).conteudo),
    snapshotParaValidacao(),
  ];
  const semOpcionais = snapshotParaValidacao();
  delete semOpcionais.qualidade.omitidos;
  delete semOpcionais.componentes.anotacoesCcd;
  delete semOpcionais.uniprot.declaracoes;
  antigos.push(semOpcionais);
  for (const antigo of antigos) {
    const texto = JSON.stringify(antigo);
    assert.strictEqual(AS.validarObjeto(antigo).analise, antigo);
    const resultado = AS.importar(texto, []);
    assert.equal(resultado.ok, true, resultado.erro);
    assert.equal(JSON.stringify(resultado.analise), texto);
    assert.deepStrictEqual(json(resultado.colecao), [antigo]);
  }
});
