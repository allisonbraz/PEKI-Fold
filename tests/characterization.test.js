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

test("XML em blocos preserva subgrupo após 64 KiB", async () => {
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
  assert.equal(streamed.local.subgruposLidos, 1);
  assert.deepStrictEqual(json(streamed), json(direct));
});

test("XML público de 1CRN maior que 64 KiB é lido inteiro e reutilizado no cache", async () => {
  const QM = models().get("QualityModel");
  const original = fs.readFileSync(path.join(__dirname, "fixtures/qualidade/1CRN_validation.xml"), "utf8");
  const xml = original.replace("<ModelledSubgroup", "<!--" + "é".repeat(70000) + "--><ModelledSubgroup");
  const bytes = Buffer.from(xml);
  let offset = 0, pedidos = 0;
  const cache = QM.criarCache();
  const resultado = await QM.consultarRelatorio("1CRN", { cache, fetch: async (url) => {
    pedidos += 1;
    assert.match(url, /1crn_validation\.xml$/);
    return { status: 200, body: { getReader: () => ({
      read: async () => {
        if (offset === bytes.length) return { done: true };
        const value = bytes.subarray(offset, offset + 65535);
        offset += value.length;
        return { done: false, value };
      },
      cancel: async () => assert.fail("XML abaixo do limite não deve ser cortado"),
    }) } };
  } });
  assert(bytes.length > 65536);
  assert.equal(offset, bytes.length);
  assert.equal(resultado.consulta, "xml");
  assert.equal(resultado.local.subgruposLidos, 46);
  assert.deepStrictEqual(json(resultado), json(QM.lerXml(xml, { id: "1CRN" })));
  assert.strictEqual(await QM.consultarRelatorio("1CRN", { cache }), resultado);
  assert.equal(pedidos, 1, "XML completo dispensa a alternativa JSON");
});

test("limite explícito de 5 MiB aceita a fronteira e rejeita excesso sem cache parcial", async () => {
  const QM = models().get("QualityModel");
  assert.equal(QM.LIMITE_BYTES, 5 * 1024 * 1024);
  const original = fs.readFileSync(path.join(__dirname, "fixtures/qualidade/1CRN_validation.xml"), "utf8");
  const xmlNoLimite = original.replace("<ModelledSubgroup", "<!--"
    + "x".repeat(QM.LIMITE_BYTES - Buffer.byteLength(original) - 7) + "--><ModelledSubgroup");
  assert.equal(Buffer.byteLength(xmlNoLimite), QM.LIMITE_BYTES);
  for (const emBlocos of [false, true]) {
    for (const excesso of [false, true]) {
      const xml = excesso ? xmlNoLimite.replace("<!--", "<!--é") : xmlNoLimite;
      const bytes = Buffer.from(xml), cache = QM.criarCache();
      let offset = 0, cancelamentos = 0, pedidos = 0;
      const resultado = await QM.consultarRelatorio("1CRN", { cache, fetch: async () => {
        pedidos += 1;
        if (pedidos === 2) {
          assert.equal(cache.lerRelatorio("1CRN"), null);
          return { status: 503 };
        }
        return emBlocos ? { status: 200, body: { getReader: () => ({
          read: async () => {
            if (offset === bytes.length) return { done: true };
            const value = bytes.subarray(offset, offset + 65536);
            offset += value.length;
            return { done: false, value };
          },
          cancel: async () => { cancelamentos += 1; },
        }) } } : { status: 200, text: async () => xml };
      } });
      assert.equal(pedidos, excesso ? 2 : 1);
      assert.equal(cancelamentos, emBlocos && excesso ? 1 : 0);
      if (excesso) {
        assert.equal(resultado.codigo, "xml_grande_demais");
        assert.match(resultado.mensagem, /grande demais.*5242880 bytes/);
        assert.deepStrictEqual(json(resultado.metricas), []);
        assert.equal(cache.lerRelatorio("1CRN"), null);
      } else {
        assert.equal(resultado.estado, "ok");
        assert.equal(resultado.local.subgruposLidos, 46);
        assert.strictEqual(cache.lerRelatorio("1CRN"), resultado);
      }
    }
  }
});

test("XML acima do limite tenta JSON e só mantém o erro de tamanho se a alternativa falhar", async () => {
  const { context, get } = models();
  const QM = get("QualityModel");
  const xml = fs.readFileSync(path.join(__dirname, "fixtures/qualidade/1CRN_validation.xml"), "utf8");
  const entry = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/qualidade/rcsb_1CRN_entry.json"), "utf8"));
  for (const cenario of ["ok", 404, 429, 503, "rede", "timeout", "invalido", "id_divergente", "cancelado"]) {
    const cache = QM.criarCache(), ctrl = new AbortController(), pedidos = [], timers = [];
    let serial = 0;
    context.setTimeout = (_fn, ms) => { const id = ++serial; timers.push(["agendar", id, ms]); return id; };
    context.clearTimeout = (id) => timers.push(["limpar", id]);
    const resultado = await QM.consultarRelatorio("1CRN", { cache, signal: ctrl.signal, limite: 80, fetch: async (url) => {
      pedidos.push(url);
      if (pedidos.length === 1) return { status: 200, text: async () => xml };
      assert.equal(cache.lerRelatorio("1CRN"), null, "XML parcial nunca entra no cache");
      if (cenario === "rede") throw new TypeError("rede simulada");
      if (cenario === "cancelado") ctrl.abort();
      if (cenario === "timeout" || cenario === "cancelado") throw Object.assign(new Error("abort"), { name: "AbortError" });
      if (typeof cenario === "number") return { status: cenario };
      return { status: 200, json: async () => {
        if (cenario === "invalido") throw new SyntaxError("JSON inválido");
        return cenario === "id_divergente" ? { rcsb_entry_container_identifiers: { entry_id: "4HHB" } } : entry;
      } };
    } });
    assert.deepStrictEqual(pedidos, [QM.urlsDe("1CRN").xml, QM.urlsDe("1CRN").json]);
    const timersEsperados = [["agendar", 1, 12000], ["limpar", 1],
      ["agendar", 2, 12000], ["limpar", 2], ["agendar", 3, 8000], ["limpar", 3]];
    if (["ok", "invalido", "id_divergente"].includes(cenario)) timersEsperados.push(["agendar", 4, 8000], ["limpar", 4]);
    assert.deepStrictEqual(timers, timersEsperados);
    assert(resultado.tentativas.some((t) => t.fonte === "pdbe-xml" && t.codigo === "xml_grande_demais"));
    if (cenario !== "cancelado") assert(resultado.tentativas.some((t) => t.fonte === "rcsb-json"));
    if (cenario === "ok") {
      assert.equal(resultado.consulta, "rcsb-json");
      const esperado = QM.lerResumoRcsb(entry, { id: "1CRN" });
      esperado.tentativas = resultado.tentativas;
      assert.deepStrictEqual(json(resultado), json(esperado));
      assert.strictEqual(cache.lerRelatorio("1CRN"), resultado);
    } else {
      assert.equal(resultado.codigo, cenario === "cancelado" ? "cancelado" : "xml_grande_demais");
      assert.deepStrictEqual(json(resultado.metricas), []);
      assert.equal(cache.lerRelatorio("1CRN"), null);
    }
  }
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

test("prazo cobre o corpo sem alterar o cancelamento externo do relatório", async () => {
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
  assert.deepStrictEqual(result.timers, [["agendar", 1, 12000], ["limpar", 1], ["agendar", 2, 12000], ["limpar", 2]]);
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


async function compararArquivosLocais(arquivos) {
  const { context, get } = browser(["pdb-analysis", "structure-model", "dogsite-client", "viewer", "comparison", "export", "app"]);
  const erros = [], pedidos = [], loading = [], urls = [], downloads = [];
  Object.assign(context, {
    estado: get("estado"), iniciadas: 0, downloads,
    prepararAcao() {},
    limparErro() {}, mostrarErro: (erro) => erros.push(erro), setLoading: (valor) => loading.push(valor),
    atualizarURL: (...args) => urls.push(args),
    baixarRCSB: async (id) => { pedidos.push(id); return arquivos[id]; },
  });
  get('estado.cmpPockets = [{ id: "ANTIGO" }];');
  get("iniciarComparacao = async () => { iniciadas += 1; }; baixarTexto = (nome, conteudo, tipo) => downloads.push({ nome, conteudo, tipo });");
  await get("compararProteinas")(Object.keys(arquivos).join(","));
  assert.deepStrictEqual(erros, []);
  assert.deepStrictEqual(pedidos, Object.keys(arquivos));
  assert.deepStrictEqual(loading, [false, true, false]);
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


function viewerComInsercoes() {
  const { context, get } = browser(["pdb-analysis", "structure-model", "dogsite-client", "viewer"]);
  const linha = (serial, chain, seq, icode, nome) => "ATOM  " + String(serial).padStart(5)
    + " " + nome.padStart(4) + " GLY " + chain + String(seq).padStart(4) + (icode || " ")
    + "      0.000   0.000   0.000  1.00 20.00           C  ";
  const pdb = ["HEADER    SYNTHETIC INSERTION SELECTION TEST", linha(1, "A", 10, "", "CA"),
    linha(2, "A", 10, "", "N"), linha(3, "A", 10, "A", "CA"), linha(4, "A", 10, "A", "N"),
    linha(5, "A", 10, "B", "CA"), linha(6, "B", 10, "A", "CA"), linha(7, "B", 10, "", "CA"),
    linha(8, "A", 11, "", "CA"), "END", ""].join("\n");
  const atomos = pdb.split("\n").filter((l) => l.startsWith("ATOM  ")).map((l) => ({
    serial: Number(l.slice(6, 11)), chain: l[21], resi: Number(l.slice(22, 26)), icode: l[26], atom: l.slice(12, 16).trim(),
  }));
  const calls = [];
  // Correspondência de propriedades do AtomSelectionSpec: AND entre campos,
  // qualquer valor do array. O número resi e o campo icode são independentes.
  const selecionados = (sel) => atomos.filter((a) => Object.entries(sel).every(([k, v]) =>
    Array.isArray(v) ? v.includes(a[k]) : a[k] === v)).map((a) => a.serial);
  const estado = { viewerFormato: "pdb", dados: { cadeias: ["A", "B"] }, cadeiasOcultas: new Set(), viewer: {
    setStyle: (sel, spec) => calls.push({ op: "estilo", sel, spec, atomos: selecionados(sel) }),
    addSurface: (_type, _opts, sel) => calls.push({ op: "superficie", sel, atomos: selecionados(sel) }),
    removeAllSurfaces() {}, render() {},
  } };
  Object.assign(context, { estado, $3Dmol: { SurfaceType: { SAS: "SAS" } } });
  return { context, get, estado, pdb, atomos, calls };
}

test("pocket e motivo distinguem cadeia, número e inserção em PDB sintético pequeno", () => {
  const { get, estado, pdb, calls } = viewerComInsercoes();
  const linhas = pdb.split("\n").filter((l) => l.startsWith("ATOM  "));
  for (const [cadeia, codigo, esperados] of [["A", "", [1, 2]], ["A", "A", [3, 4]], ["A", "B", [5]], ["B", "A", [6]], ["B", "", [7]]]) {
    const trecho = linhas.filter((l) => l[21] === cadeia && Number(l.slice(22, 26)) === 10 && l[26].trim() === codigo).join("\n");
    const sels = get("selecoesDosResiduos")(trecho);
    assert.deepStrictEqual(json(sels), [{ chain: cadeia, resi: [10], icode: codigo || " " }]);
    calls.length = 0;
    get("pintarResiduosPocket")(sels);
    assert.deepStrictEqual(calls.filter((c) => c.op === "estilo").flatMap((c) => c.atomos), esperados);
    estado.superficie = { sels, color: "magenta", opacity: 0.8 };
    get("aplicarSuperficie")();
    assert.deepStrictEqual(calls.filter((c) => c.op === "superficie").flatMap((c) => c.atomos), esperados);
    calls.length = 0;
    get("pintarMotivo")([{ cadeia, residuos: ["10" + codigo] }]);
    assert.deepStrictEqual(calls.flatMap((c) => c.atomos), esperados);
  }
  calls.length = 0;
  get("pintarMotivo")([{ cadeia: "A", residuos: ["10", "10A"] }]);
  assert.deepStrictEqual(calls.flatMap((c) => c.atomos), [1, 2, 3, 4]);
  assert.equal(get("selecoesDosResiduos")(pdb).reduce((n, s) => n + s.resi.length, 0), 6, "átomos repetidos não duplicam o resíduo");
});

test("destaque do preparo preserva inserção e nome do átomo", () => {
  const { get, estado, calls } = viewerComInsercoes();
  const marcador = "  return { ativo, temFicha, invalidarConsultas, reiniciar, aoCarregar, aposEstilo, aoMostrar, markdown, anexarPdf, resumoAnalise };";
  const fonte = fs.readFileSync(path.join(__dirname, "../docs/prep-ui.js"), "utf8");
  assert.equal(fonte.split(marcador).length, 2);
  get(fonte.replace(marcador, "  globalThis.destaqueTeste = (itens) => { destaque = itens; };\n" + marcador));
  for (const [icode, esperados] of [["", [1]], ["A", [3]], ["B", [5]]]) {
    calls.length = 0;
    get("destaqueTeste")([{ cadeia: "A", resseq: 10, icode, atom: "CA", color: "yellow", radius: 0.5 }]);
    get("PrepUI").aposEstilo(estado);
    assert.deepStrictEqual(calls.flatMap((c) => c.atomos), esperados);
  }
});

test("motivo sem inserção mantém a seleção numérica em mmCIF", () => {
  const { get, estado, atomos, calls } = viewerComInsercoes();
  estado.viewerFormato = "cif";
  for (const a of atomos) delete a.icode;
  get("pintarMotivo")([{ cadeia: "A", residuos: ["10", "11"] }]);
  assert.deepStrictEqual(json(calls[0].sel), { chain: "A", resi: [10, 11] });
});


test("PDB sem inserções mantém os mesmos átomos no pocket e no motivo", () => {
  const { get, pdb, atomos, calls } = viewerComInsercoes();
  atomos.splice(0, atomos.length, ...atomos.filter((a) => a.icode === " "));
  const semInsercoes = pdb.split("\n").filter((l) => l.startsWith("ATOM  ") && l[26] === " ").join("\n");
  get("pintarResiduosPocket")(get("selecoesDosResiduos")(semInsercoes));
  assert.deepStrictEqual(calls.flatMap((c) => c.atomos), [1, 2, 8, 7]);
  calls.length = 0;
  get("pintarMotivo")([{ cadeia: "A", residuos: ["10", "11"] }]);
  assert.deepStrictEqual(calls.flatMap((c) => c.atomos), [1, 2, 8]);
});


test("destaque do preparo em mmCIF sem icode encontra os átomos", () => {
  const { get, estado, atomos, calls } = viewerComInsercoes();
  estado.viewerFormato = "cif";
  atomos.splice(0, atomos.length, ...atomos.filter((a) => a.icode === " "));
  for (const a of atomos) delete a.icode;
  const marcador = "  return { ativo, temFicha, invalidarConsultas, reiniciar, aoCarregar, aposEstilo, aoMostrar, markdown, anexarPdf, resumoAnalise };";
  const fonte = fs.readFileSync(path.join(__dirname, "../docs/prep-ui.js"), "utf8");
  assert.equal(fonte.split(marcador).length, 2);
  get(fonte.replace(marcador, "  globalThis.destaqueTeste = (itens) => { destaque = itens; };\n" + marcador));
  for (const icode of [undefined, "", " "]) {
    calls.length = 0;
    get("destaqueTeste")([{ cadeia: "A", resseq: 10, icode, atom: "CA", color: "yellow", radius: 0.5 }]);
    get("PrepUI").aposEstilo(estado);
    assert.deepStrictEqual(json(calls[0].sel), { chain: "A", resi: 10, atom: "CA" });
    assert.deepStrictEqual(calls[0].atomos, [1], "encontra CA de A10 sem incluir N, A11 ou B10");
  }
});
