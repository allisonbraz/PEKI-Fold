"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { cases, GOLDENS, json, models, browser } = require("./helpers/characterization-cases.js");

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


async function compararArquivosLocais(arquivos) {
  const { context, get } = browser(["pdb-analysis", "structure-model", "comparison", "export"]);
  const erros = [], pedidos = [], loading = [], urls = [], downloads = [];
  Object.assign(context, {
    estado: { comparacao: null, cmpPockets: [{ id: "ANTIGO" }] }, iniciadas: 0, downloads,
    limparErro() {}, mostrarErro: (erro) => erros.push(erro), setLoading: (valor) => loading.push(valor),
    atualizarURL: (...args) => urls.push(args),
    baixarRCSB: async (id) => { pedidos.push(id); return arquivos[id]; },
  });
  get("iniciarComparacao = async () => { iniciadas += 1; }; baixarTexto = (nome, conteudo, tipo) => downloads.push({ nome, conteudo, tipo });");
  await get("compararProteinas")(Object.keys(arquivos).join(","));
  assert.deepStrictEqual(erros, []);
  assert.deepStrictEqual(pedidos, Object.keys(arquivos));
  assert.deepStrictEqual(loading, [true, false]);
  assert.deepStrictEqual(urls, [["compare", Object.keys(arquivos).join(",")]]);
  assert.equal(context.iniciadas, 1);
  assert.equal(context.estado.cmpPockets, null);
  return { context, get, downloads };
}

test("comparação usa só o primeiro MODEL de um PDB pequeno e sintético", async () => {
  const atomo = (serial, nome, resname, chain, seq) => "ATOM  " + String(serial).padStart(5)
    + " " + nome.padStart(4) + " " + resname + " " + chain + String(seq).padStart(4)
    + "       0.000   0.000   0.000  1.00 20.00           C  ";
  // Geometria artificial: o primeiro modelo é 7, não o MODEL 1.
  const selecionado = ["HEADER    SYNTHETIC COMPARISON TEST", "MODEL        7",
    atomo(1, "N", "ALA", "A", 1), atomo(2, "CA", "ALA", "A", 1),
    atomo(3, "CA", "GLY", "A", 2), "ENDMDL", ""].join("\n");
  const varios = selecionado + ["MODEL        1", atomo(1, "CA", "ALA", "A", 1),
    atomo(2, "CA", "VAL", "A", 9), atomo(3, "CA", "SER", "B", 1), "ENDMDL", "END", ""].join("\n");
  const unico = ["HEADER    SYNTHETIC COMPARISON TEST", "MODEL        3", atomo(1, "CA", "SER", "A", 1), "ENDMDL", "END", ""].join("\n");
  const { context, get, downloads } = await compararArquivosLocais({ "1ABC": varios, "2ABC": unico });
  const PA = get("ProtAnalysis"), SM = get("StructureModel");
  assert.deepStrictEqual(json(context.estado.comparacao[1].dados), json(PA.analisarCompleto(unico)));
  const p = context.estado.comparacao[0];
  assert.equal(p.pdbText, selecionado);
  assert.equal(PA.contarModelos(p.pdbText), 1);
  const referencia = SM.ler(varios);
  assert.equal(referencia.estrutura.modelo.selecionado, 7);
  assert.deepStrictEqual(json(p.dados.estatisticas), json(referencia.analise.estatisticas));
  assert.deepStrictEqual(json(p.dados.cadeias), ["A"]);
  assert.deepStrictEqual(json(p.dados.sequencias), { A: "AG" });
  assert.equal(p.dados.frequencias.A.total, 2);
  assert.equal(p.dados.frequencias.A.itens.find((i) => i.aa === "VAL").contagem, 0);
  assert.deepStrictEqual(json(get("resumoProteina")(p)), { id: "1ABC", cadeias: 1, atomos: 3, residuos: 2, aaDiferentes: 2 });
  const todos = PA.analisarCompleto(varios);
  assert.equal(todos.cadeias.length, 2, "o modelo seguinte acrescentaria outra cadeia");
  assert.equal(todos.estatisticas.cadeias.reduce((s, c) => s + c.residuos, 0), 4, "o modelo seguinte acrescentaria outros resíduos");
  get("baixarCsvCmpStats")();
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].conteudo, /^1ABC,1,3,2,2$/m);
});

test("comparação preserva arquivos sem MODEL e suas contagens", async () => {
  const arquivos = Object.fromEntries(["1CRN", "4HHB"].map((id) => [id,
    fs.readFileSync(path.join(__dirname, "fixtures/ui-render/" + id + ".pdb"), "utf8")]));
  const { context, get } = await compararArquivosLocais(arquivos);
  const PA = get("ProtAnalysis");
  for (const p of context.estado.comparacao) {
    assert.equal(p.pdbText, arquivos[p.id]);
    assert.deepStrictEqual(json(p.dados), json(PA.analisarCompleto(arquivos[p.id])));
  }
});
