"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { read, json } = require("./helpers/characterization-cases.js");
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const never = () => new Promise(() => {});
const response = (status = 200, data = {}) => ({ status, ok: status >= 200 && status < 300,
  text: async () => typeof data === "string" ? data : JSON.stringify(data), json: async () => data });

function clock() {
  let now = 0, serial = 0;
  const tasks = new Map();
  return { tasks, get now() { return now; },
    setTimeout(fn, ms) { const id = ++serial; tasks.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    async advance(ms) {
      const end = now + ms;
      await flush();
      for (;;) {
        const next = [...tasks].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        now = next[1].at; tasks.delete(next[0]); next[1].fn(); await flush();
      }
      now = end; await flush();
    },
  };
}

function harness() {
  const time = clock(), elements = new Map(), scripts = [];
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: "", textContent: "", innerHTML: "", dataset: {},
      addEventListener() {}, querySelectorAll: () => [] });
    return elements.get(id);
  };
  class ClockDate extends Date { static now() { return time.now; } }
  const context = vm.createContext({ console, Date: ClockDate, AbortController, TextDecoder, FormData, Blob,
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    window: { scrollTo() {} }, localStorage: { getItem: () => null, setItem() {} },
    document: { readyState: "loading", addEventListener() {}, querySelectorAll: () => [],
      getElementById: element, querySelector: s => element(s.replace(/^#/, "")),
      createElement() { return { remove() { this.removed = true; } }; },
      head: { appendChild(s) { scripts.push(s); } }, body: { dataset: {} } },
    fetch: () => { throw new Error("Rede real proibida."); },
  });
  const get = expression => vm.runInContext(expression, context);
  const load = (file, bridge = "") => {
    let source = read("docs/" + file + ".js");
    if (bridge) {
      const marker = "  return { ativo,";
      assert.equal(source.split(marker).length, 2);
      source = source.replace(marker, bridge + "\n" + marker);
    }
    vm.runInContext(source, context, { filename: file + ".js" });
  };
  for (const f of ["network", "pdb-analysis", "structure-model", "quality-model", "prep-analysis", "ensemble-analysis",
    "busca-nome", "dogsite-client", "viewer", "comparison", "libs-loader", "app"]) load(f);
  get('PekiRede.config.padraoMs = 7; PekiRede.config.excecoes.qualidadeXml.ms = 11; PekiRede.config.excecoes.qualidadeJson.ms = 5; PekiRede.config.excecoes.dogsiteJob.ms = 31; PekiRede.config.excecoes.uploadJob.ms = 23; PekiRede.config.polling.dogsite = { tentativas: 100, passos: 1, intervaloMs: 2 }; PekiRede.config.polling.upload = { tentativas: 100, intervaloMs: 2 }');
  return { time, context, element, scripts, get, load, rede: get("PekiRede") };
}

async function expires(h, operation, ms, verify) {
  let settled = false;
  const pending = operation();
  pending.then(() => { settled = true; }, () => { settled = true; });
  const checked = verify(pending);
  await flush();
  await h.time.advance(ms - 1);
  assert.equal(settled, false, "continua pendente antes do prazo");
  await h.time.advance(1);
  assert.equal(settled, true, "termina exatamente no prazo configurado");
  await checked;
}
function timeout(h) {
  return e => { assert.equal(e.codigo, "timeout"); assert.equal(e.estado, "erro");
    assert.equal(e.message, h.rede.TIMEOUT.mensagem); return true; };
}
const rejectTimeout = h => p => assert.rejects(p, timeout(h));

const directQueries = [
  ["download PDB da comparação", h => h.get('baixarRCSB("1CRN")')],
  ["download PDB da análise individual", h => h.get('baixarEntrada("1CRN")')],
  ["download mmCIF alternativo", h => {
    const base = h.context.fetch;
    h.context.fetch = (url, opts) => String(url).endsWith(".pdb") ? Promise.resolve(response(404)) : base(url, opts);
    return h.get('baixarEntrada("1CRN")');
  }],
  ["metadados RCSB", h => h.get('buscarMetaRCSB("1CRN")')],
  ["envio DoGSite", h => h.get('dogsiteSubmit("1CRN")')],
  ["status DoGSite", h => h.get('dogsitePoll("https://fixture.invalid/job", null, () => false)')],
  ["tabela de pockets", h => {
    h.get('dogsiteSubmit = async () => "job"; dogsitePoll = async () => ({ result_table: "https://fixture.invalid/table" })');
    return h.get('obterPockets("1CRN")');
  }],
  ["envio de modelo ProteinsPlus", h => {
    h.load("ensemble-ui", '  globalThis.ensTimeout = { enviarModelo, comResiduos, chamarUm };');
    return h.context.ensTimeout.enviarModelo("ATOM", () => false);
  }],
  ["status do envio de modelo", h => {
    h.load("ensemble-ui", '  globalThis.ensTimeout = { enviarModelo };');
    const base = h.context.fetch;
    h.context.fetch = (url, opts) => String(url).endsWith("pdb_files_rest")
      ? Promise.resolve(response(202, { location: "https://fixture.invalid/upload" })) : base(url, opts);
    return h.context.ensTimeout.enviarModelo("ATOM", () => false);
  }, 9], // a consulta começa depois dos 2 ms do polling, que não são prazo de rede
  ["resíduos do ensemble", h => {
    h.load("ensemble-ui", '  globalThis.ensTimeout = { comResiduos };');
    return h.context.ensTimeout.comResiduos([{ name: "P_0", residuosUrl: "https://fixture.invalid/res" }], () => false);
  }],
  ["tabela do ensemble com modelo enviado", h => {
    h.load("ensemble-ui", '  globalThis.ensTimeout = { chamarUm, enviarModelo }; enviarModelo = async () => "id";');
    h.get('dogsiteSubmit = async () => "job"; dogsitePoll = async () => ({ result_table: "https://fixture.invalid/table" })');
    const item = { origem: "modelo", id: "M1", texto: read("tests/fixtures/ui-render/1CRN.pdb") };
    return h.context.ensTimeout.chamarUm(item, 0, () => {});
  }],
];
for (const [name, operation, deadline = 7] of directQueries) test(name + ": respeita o prazo padrão mesmo se fetch ignora abort", async () => {
  const h = harness(); h.context.fetch = never;
  await expires(h, () => operation(h), deadline, rejectTimeout(h));
  await h.time.advance(3);
  assert.equal(h.time.tasks.size, 0);
});

test("configuração única: padrão e exceções possuem valores e motivos explícitos", () => {
  const ctx = vm.createContext({});
  vm.runInContext(read("docs/network.js"), ctx);
  const config = vm.runInContext("PEKI_REDE_CONFIG", ctx);
  assert.equal(config.padraoMs, 20000);
  assert.deepEqual(json(Object.fromEntries(Object.entries(config.excecoes).map(([k, v]) => [k, v.ms]))),
    { qualidadeXml: 12000, qualidadeJson: 8000, dogsiteJob: 180000, uploadJob: 60000 });
  for (const value of Object.values(config.excecoes)) assert(value.motivo.length > 20);
  const html = read("docs/index.html");
  assert.equal((html.match(/src="network.js"/g) || []).length, 1);
  assert(html.indexOf('src="network.js"') < html.indexOf('src="quality-model.js"'));
});

test("o prazo inclui cabeçalhos e corpo, sem reiniciar a contagem no text()", async () => {
  const h = harness(); let release;
  h.context.fetch = () => new Promise(resolve => { release = resolve; });
  let done = false;
  const pending = h.rede.fetch("https://fixture.invalid/data").then(r => r.text());
  pending.finally(() => { done = true; }).catch(() => {});
  const check = assert.rejects(pending, timeout(h));
  await h.time.advance(4);
  release({ text: never }); await flush();
  await h.time.advance(2); assert.equal(done, false);
  await h.time.advance(1); await check;
  assert.equal(done, true);
  assert.equal(h.time.tasks.size, 0);
});

test("XML → JSON: o timeout de 11 ms inicia a alternativa JSON e mantém o cache", async () => {
  const h = harness(), requests = [], QM = h.get("QualityModel"), cache = QM.criarCache();
  const entry = JSON.parse(read("tests/fixtures/qualidade/rcsb_1CRN_entry.json"));
  const fetch = (url) => { requests.push([url, h.time.now]); return url.endsWith(".xml") ? never() : Promise.resolve(response(200, entry)); };
  await expires(h, () => QM.consultarRelatorio("1CRN", { fetch, cache }), 11, async p => {
    const result = await p;
    assert.equal(result.consulta, "rcsb-json"); assert.equal(result.estado, "ok");
    assert.equal(result.tentativas[0].status, "timeout"); assert.equal(cache.lerRelatorio("1CRN"), result);
  });
  assert(requests[0][0].endsWith(".xml")); assert(requests[1][0].endsWith("/1CRN"));
  assert.deepEqual(requests.map(r => r[1]), [0, 11]);
  const ctrl = new AbortController(); ctrl.abort();
  assert.equal(await QM.consultarRelatorio("1CRN", { fetch: () => assert.fail("cache deve preceder cancelamento"), cache, signal: ctrl.signal }), cache.lerRelatorio("1CRN"));
  assert.equal(h.time.tasks.size, 0);
});

for (const body of [false, true]) test("JSON alternativo: prazo configurado e estado uniforme no " + (body ? "corpo" : "fetch"), async () => {
  const h = harness(), QM = h.get("QualityModel"), cache = QM.criarCache(), requests = [];
  const fetch = url => { requests.push(url); return url.endsWith(".xml") ? Promise.resolve(response(404))
    : body ? Promise.resolve({ status: 200, json: never }) : never(); };
  await expires(h, () => QM.consultarRelatorio("1CRN", { fetch, cache }), 5, async p => {
    const result = await p;
    assert.equal(result.codigo, "timeout"); assert.equal(result.estado, "erro");
    assert.equal(result.mensagem, h.rede.TIMEOUT.mensagem); assert.equal(result.tentativas.at(-1).status, "timeout");
  });
  assert.equal(requests.length, 2); assert.equal(cache.tamanho().relatorios, 0); assert.equal(h.time.tasks.size, 0);
});

test("XML em blocos: cada read usa o restante do prazo, sem cache parcial", async () => {
  const h = harness(), QM = h.get("QualityModel"), cache = QM.criarCache(); let release, n = 0;
  const fetch = url => url.endsWith(".xml") ? Promise.resolve({ status: 200, body: { getReader: () => ({
    read: () => ++n === 1 ? new Promise(resolve => { release = resolve; }) : never(), cancel: async () => {},
  }) } }) : never();
  const pending = QM.consultarRelatorio("1CRN", { fetch, cache }); let result;
  pending.then(r => { result = r; });
  await flush(); await h.time.advance(6);
  release({ done: false, value: new TextEncoder().encode('<Entry pdbid="1CRN"') }); await flush();
  await h.time.advance(4); assert.equal(result, undefined);
  await h.time.advance(1); // XML venceu aos 11 ms; JSON começa agora.
  await h.time.advance(4); assert.equal(result, undefined);
  await h.time.advance(1); await pending;
  assert.equal(result.codigo, "timeout"); assert.equal(n, 2);
  assert.equal(cache.tamanho().relatorios, 0); assert.equal(h.time.tasks.size, 0);
});

for (const endpoint of ["rcsb", "pdbe"]) test("CCD " + endpoint + ": prazo padrão preserva alternativa e estado de erro", async () => {
  const h = harness(), QM = h.get("QualityModel"), cache = QM.criarCache(), urls = [];
  const fetch = url => {
    urls.push(url);
    if (endpoint === "rcsb") return url.includes("rcsb.org") ? never() : Promise.resolve(response(200, { HEM: [{ name: "public fixture" }] }));
    return url.includes("rcsb.org") ? Promise.resolve(response(404)) : never();
  };
  await expires(h, () => QM.consultarComponente("HEM", { fetch, cache }), 7, async p => {
    const result = await p;
    if (endpoint === "rcsb") { assert.equal(result.estado, "ok"); assert.equal(cache.lerComponente("HEM"), result); }
    else { assert.equal(result.estado, "erro"); assert.equal(result.codigoErro, "timeout"); assert.equal(result.codigo, "HEM"); assert.equal(result.mensagem, h.rede.TIMEOUT.mensagem); }
  });
  assert.equal(urls.length, 2); assert.equal(h.time.tasks.size, 0);
});

for (const phase of ["busca", "metadados", "corpo"]) test("busca por nome: timeout uniforme em " + phase, async () => {
  const h = harness(), BN = h.get("BuscaNome");
  const search = response(200, { total_count: 1, result_set: [{ identifier: "1CRN" }] });
  h.context.fetch = url => phase === "busca" ? never() : url.includes("rcsbsearch")
    ? phase === "corpo" ? Promise.resolve({ status: 200, text: never }) : Promise.resolve(search) : never();
  await expires(h, () => BN.pesquisar("crambin"), 7, async p => {
    const result = await p;
    if (phase === "metadados") { assert.equal(result.ok, true); assert.equal(result.avisoMetadados, h.rede.TIMEOUT.mensagem); assert.deepEqual(json(result.metadados), json(h.rede.TIMEOUT)); }
    else { assert.equal(result.ok, false); assert.equal(result.codigo, "timeout"); assert.equal(result.estado, "erro"); assert.equal(result.mensagem, h.rede.TIMEOUT.mensagem); }
  });
  assert.equal(h.time.tasks.size, 0);
});

test("viewer e preparo: consultas de resíduos encerram no prazo e mostram a mensagem comum", async () => {
  for (const target of ["viewer", "preparo"]) {
    const h = harness(); h.context.fetch = never;
    if (target === "viewer") {
      h.get('estado.viewer = {}; estado.pockets = [{ name: "P_0", residuosUrl: "https://fixture.invalid/res" }]; sincronizarBotoesPocket = () => {}');
      await expires(h, () => h.get("destacarPocket(0)"), 7, async p => { await p; assert.equal(h.get("estado.vistaPocket"), null); });
      assert.equal(h.element("pockets-status").innerHTML, "❌ " + h.rede.TIMEOUT.mensagem);
    } else {
      h.load("prep-ui", '  globalThis.prepTimeout = { sugerirCaixa };');
      const text = read("tests/fixtures/ui-render/1CRN.pdb"), parsed = h.get("StructureModel").ler(text);
      h.get("PrepUI").aoCarregar({ pdbId: "1CRN", nome: "1CRN.pdb", pdbText: text, estrutura: parsed.estrutura,
        dados: parsed.analise, meta: {}, pockets: [{ name: "P_0", residuosUrl: "https://fixture.invalid/res" }] });
      h.element("prep-pocket").value = "0";
      await expires(h, () => h.context.prepTimeout.sugerirCaixa(), 7, rejectTimeout(h));
    }
    assert.equal(h.time.tasks.size, 0);
  }
});

test("metadados e pockets: timeout é publicado com mensagem e estado comuns", async () => {
  const h = harness(); h.context.fetch = never;
  h.get('estado.pdbId = "1CRN"; estado.meta = { titulo: "1CRN" };');
  await expires(h, () => h.get('enriquecerMetaRCSB("1CRN")'), 7, async p => { await p; });
  assert.deepEqual(json(h.get("estado.meta.consultaRcsb")), json(h.rede.TIMEOUT));
  assert(h.element("ws-meta").innerHTML.includes(h.rede.TIMEOUT.mensagem));
  h.context.fetch = async () => response(200, { struct: { title: "1CRN" } });
  await h.get('enriquecerMetaRCSB("1CRN")');
  assert.equal(h.get("estado.meta.consultaRcsb"), undefined);
  assert(!h.element("ws-meta").innerHTML.includes(h.rede.TIMEOUT.mensagem));
  h.context.fetch = never;
  await expires(h, () => h.get("detectarPockets()"), 7, async p => { await p; });
  assert.equal(h.get("estado.pocketsInfo.estado"), "erro"); assert.equal(h.get("estado.pocketsInfo.codigo"), "timeout");
  assert.equal(h.get("estado.pocketsInfo.motivo"), h.rede.TIMEOUT.mensagem);
});

for (const kind of ["dogsite", "upload"]) test("job " + kind + ": respeita exceção de duração total sem renovar o prazo no polling", async () => {
  const h = harness();
  h.context.fetch = url => Promise.resolve(response(202, String(url).endsWith("pdb_files_rest") ? { location: "https://fixture.invalid/upload" } : {}));
  let operation, limit;
  if (kind === "dogsite") { operation = () => h.get('dogsitePoll("job", null, () => false)'); limit = 31; }
  else { h.load("ensemble-ui", '  globalThis.ensTimeout = { enviarModelo };'); operation = () => h.context.ensTimeout.enviarModelo("ATOM", () => false); limit = 23; }
  await expires(h, operation, limit, rejectTimeout(h));
  await h.time.advance(3); assert.equal(h.time.tasks.size, 0);
});

for (const name of ["lib3D", "libPlotly", "libPdf"]) test(name + ": biblioteca usa prazo padrão e permite retry com Promise compartilhada", async () => {
  const h = harness(), load = h.get(name);
  const old = load(), same = load();
  // libPdf wraps the shared script Promise, as it already did before this change.
  if (name !== "libPdf") assert.equal(old, same);
  const check = assert.rejects(old, timeout(h)), other = assert.rejects(same, timeout(h));
  await h.time.advance(6); assert.equal(h.scripts.length, 1);
  await h.time.advance(1); await Promise.all([check, other]);
  assert.equal(h.scripts[0].removed, true);
  const retry = load();
  const second = name === "libPdf" ? null : load(); if (second) assert.equal(second, retry);
  h.scripts[0].onload(); // callback atrasado não conclui a nova Promise
  h.scripts[1].onload(); await flush();
  if (name === "libPdf") h.scripts[2].onload();
  await retry; assert.equal(h.time.tasks.size, 0);
});

test("cancelamento continua distinto de timeout, e cache DoGSite continua precedendo o cancelamento", async () => {
  const h = harness(), QM = h.get("QualityModel"), ctrl = new AbortController();
  const abort = () => Object.assign(new Error("cancelado"), { name: "AbortError" });
  const fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(abort()), { once: true }));
  const pending = QM.consultarRelatorio("1CRN", { fetch, signal: ctrl.signal });
  await flush(); ctrl.abort(); await flush();
  const result = await pending;
  assert.equal(result.codigo, "cancelado"); assert.equal(h.time.tasks.size, 0);
  h.get('POCKETS_CACHE["1CRN"] = { pockets: [] }');
  assert.equal(await h.get('obterPockets("1CRN", null, () => true)'), h.get('POCKETS_CACHE["1CRN"]'));
  assert.equal(h.time.tasks.size, 0);
});


test("AutoTable: o segundo script tem prazo próprio e a nova tentativa continua sob demanda", async () => {
  const h = harness(), load = h.get("libPdf");
  const pending = load(), check = assert.rejects(pending, timeout(h));
  await h.time.advance(3);
  h.scripts[0].onload(); await flush();
  assert.equal(h.scripts.length, 2);
  await h.time.advance(6); assert.equal(h.scripts[1].removed, undefined);
  await h.time.advance(1); await check;
  assert.equal(h.scripts[1].removed, true);
  const retry = load(); await flush();
  assert.equal(h.scripts.length, 3, "jsPDF concluído é reutilizado; apenas AutoTable é solicitado novamente");
  h.scripts[2].onload(); await retry;
  assert.equal(h.time.tasks.size, 0);
});

test("Response e ReadableStream nativos funcionam sem rede e sem timers remanescentes", async () => {
  const h = harness();
  h.context.fetch = async () => new Response(JSON.stringify({ id: "1CRN" }), { headers: { "Content-Type": "application/json" } });
  const res = await h.rede.fetch("https://fixture.invalid/json");
  assert.equal(res.headers.get("Content-Type"), "application/json");
  assert.deepEqual(await res.json(), { id: "1CRN" });
  h.context.fetch = async () => new Response("1CRN");
  const stream = (await h.rede.fetch("https://fixture.invalid/text")).body.getReader();
  const first = await stream.read(), end = await stream.read();
  assert.equal(new TextDecoder().decode(first.value), "1CRN"); assert.equal(end.done, true);
  stream.releaseLock();
  assert.equal(h.time.tasks.size, 0);
});
