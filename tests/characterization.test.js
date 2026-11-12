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

test("comportamento conhecido: validação interna aceita métricas com tipo incorreto", () => {
  const AS = models().get("AnalysisSnapshot");
  const snapshot = cases.snapshots().snapshot;
  snapshot.qualidade = { estado: "ok", metricas: {} };
  assert.equal(AS.validarObjeto(snapshot).ok, true);
  assert.throws(() => AS.comparar([snapshot, { ...snapshot, id: "SIN-OUTRO" }], {}), /lista\.find is not a function/);
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
    assert.deepStrictEqual(timers, [["agendar", 1, 12000], ["limpar", 1], ["agendar", 2, 8000], ["limpar", 2]]);
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
