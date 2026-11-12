"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loader(window = {}) {
  const scripts = [];
  const context = vm.createContext({ window, document: {
    createElement(tag) { assert.equal(tag, "script"); return {}; },
    head: { appendChild(script) { scripts.push(script); } },
  } });
  const source = fs.readFileSync(path.join(__dirname, "../docs/libs-loader.js"), "utf8");
  vm.runInContext(source, context, { filename: "libs-loader.js" });
  return { scripts, window, get: (expression) => vm.runInContext(expression, context) };
}

test("bibliotecas continuam sob demanda, com as mesmas URLs e versões", () => {
  const { scripts, get } = loader();
  assert.equal(scripts.length, 0);
  assert.deepStrictEqual(JSON.parse(get("JSON.stringify(PEKI_LIBS)")), {
    mol: "https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.4.0/3Dmol-min.js",
    plotly: "https://cdn.plot.ly/plotly-2.35.2.min.js",
    jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
  });
});

test("3Dmol e Plotly reutilizam a Promise pendente e concluída por URL", async () => {
  const { scripts, get } = loader();
  for (const name of ["lib3D", "libPlotly"]) {
    const load = get(name);
    const before = scripts.length;
    const promise = load();
    assert.strictEqual(load(), promise);
    assert.equal(scripts.length, before + 1);
    scripts[before].onload();
    await promise;
    assert.strictEqual(load(), promise);
    assert.equal(scripts.length, before + 1);
  }
});

test("jsPDF carrega antes do AutoTable, compartilhando os pedidos simultâneos", async () => {
  const { scripts, window, get } = loader();
  const load = get("libPdf");
  assert.strictEqual(window.pekiCarregarPdf, load);
  const first = load(), second = load();
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /jspdf\/2\.5\.1\/jspdf\.umd\.min\.js$/);
  scripts[0].onload();
  await Promise.resolve();
  assert.equal(scripts.length, 2);
  assert.match(scripts[1].src, /jspdf-autotable\/3\.8\.2\//);
  scripts[1].onload();
  await Promise.all([first, second]);
  await load();
  assert.equal(scripts.length, 2);
});

test("bibliotecas prontas não criam novas tags de script", async () => {
  const { scripts, get } = loader({
    $3Dmol: {}, Plotly: {}, jspdf: { jsPDF: { API: { autoTable() {} } } },
  });
  await Promise.all([get("lib3D")(), get("libPlotly")(), get("libPdf")()]);
  assert.equal(scripts.length, 0);
});

test("falha mantém a mensagem existente e permite uma nova tentativa", async () => {
  const { scripts, get } = loader();
  const load = get("lib3D");
  const failed = load();
  const rejection = assert.rejects(failed, {
    message: "Não foi possível carregar uma biblioteca externa. Verifique a conexão e tente de novo.",
  });
  scripts[0].onerror();
  await rejection;
  const retry = load();
  assert.notStrictEqual(retry, failed);
  assert.equal(scripts.length, 2);
  scripts[1].onload();
  await retry;
});

test("index.html carrega o loader uma vez, imediatamente antes do app", () => {
  const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(scripts.filter((src) => src === "libs-loader.js").length, 1);
  assert.equal(scripts[scripts.indexOf("app.js") - 1], "libs-loader.js");
});
