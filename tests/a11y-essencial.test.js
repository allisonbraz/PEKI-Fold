"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { read } = require("./helpers/characterization-cases.js");
const { harness } = require("./helpers/ui-flow-harness.js");

const html = read("docs/index.html");

test("exportação usa dialog nativo nomeado, foca o primeiro controle e devolve foco nos dois contextos", () => {
  const h = harness();
  h.get("init()");
  const modal = h.el("export-modal");
  assert.equal(modal.tag, "dialog");
  assert.equal(modal.getAttribute("aria-labelledby"), "exp-titulo");
  assert.equal(modal.hidden, false);
  for (const id of ["btn-export", "btn-cmp-export"]) {
    h.get(id === "btn-export" ? 'abrirTela("workspace", "ws-nome")' : 'abrirTela("comparacao", "cmp-titulo")');
    const opener = h.el(id);
    opener.focus(); opener.click();
    assert.equal(modal.open, true);
    assert.equal(modal.getAttribute("data-fallback"), null);
    assert.equal(h.context.document.activeElement.getAttribute("name"), "exp-fmt");
    h.el("exp-cancelar").click();
    assert.equal(modal.open, false);
    assert.equal(h.context.document.activeElement, opener);
  }
});

test("modal sem showModal/close: open, ciclo de foco, Esc, Cancelar e retorno ao acionador", () => {
  const h = harness(); h.get("init()");
  const modal = h.el("export-modal"), [pdf, md] = modal.children, last = h.el("exp-confirmar");
  modal.showModal = undefined;
  modal.close = undefined;
  for (const el of [pdf, md, last]) el.getClientRects = () => [{}];
  for (const el of [pdf, md]) { el.type = "radio"; el.name = "exp-fmt"; }
  modal.querySelectorAll = () => [pdf, md, last];
  for (const id of ["btn-export", "btn-cmp-export"]) {
    h.get(id === "btn-export" ? 'abrirTela("workspace", "ws-nome")' : 'abrirTela("comparacao", "cmp-titulo")');
    const opener = h.el(id);
    opener.focus(); opener.click();
    assert.equal(modal.getAttribute("open"), "");
    assert.equal(modal.getAttribute("role"), "dialog");
    assert.equal(modal.getAttribute("aria-modal"), "true");
    assert.equal(h.context.document.activeElement, pdf);
    pdf.focus(); modal.dispatch("keydown", { key: "Tab", shiftKey: true });
    assert.equal(h.context.document.activeElement, last);
    modal.dispatch("keydown", { key: "Tab", shiftKey: false });
    assert.equal(h.context.document.activeElement, pdf);
    opener.focus(); h.context.document.dispatch("focusin", { target: opener });
    assert.equal(h.context.document.activeElement, pdf);
    let prevented = false;
    modal.dispatch("keydown", { key: "Escape", preventDefault() { prevented = true; } });
    assert.ok(prevented);
    assert.equal(modal.getAttribute("open"), null);
    assert.equal(modal.getAttribute("role"), null);
    assert.equal(modal.getAttribute("aria-modal"), null);
    assert.equal(modal.getAttribute("data-fallback"), null);
    assert.equal(h.context.document.activeElement, opener);
    assert.equal(h.docListeners.focusin.length, 0);
    opener.click();
    h.el("exp-cancelar").click();
    assert.equal(modal.getAttribute("open"), null);
    assert.equal(h.context.document.activeElement, opener);
    assert.equal(h.docListeners.focusin.length, 0);
  }
});

test("modal: Tab e Shift+Tab fecham o ciclo, respeitando o rádio marcado", () => {
  const h = harness(); h.get("init()");
  const modal = h.el("export-modal"), [pdf, md] = modal.children, last = h.el("exp-confirmar");
  for (const el of [pdf, md, last]) el.getClientRects = () => [{}];
  for (const el of [pdf, md]) { el.type = "radio"; el.name = "exp-fmt"; }
  modal.querySelectorAll = () => [pdf, md, last];
  pdf.focus(); modal.dispatch("keydown", { key: "Tab", shiftKey: true });
  assert.equal(h.context.document.activeElement, last);
  last.focus(); modal.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(h.context.document.activeElement, pdf);
  pdf.checked = false; md.checked = true;
  md.focus(); modal.dispatch("keydown", { key: "Tab", shiftKey: true });
  assert.equal(h.context.document.activeElement, last);
  modal.dispatch("keydown", { key: "Tab", shiftKey: false });
  assert.equal(h.context.document.activeElement, md);
});

test("abas: seleção, Tab único, setas cíclicas, Home/End e exclusão da aba oculta nas duas telas", () => {
  const h = harness(); h.get("init()");
  for (const [selector, first, last] of [["#workspace .abas", "aba-visao", "aba-pockets"], ["#comparacao .abas", "caba-stats", "caba-pockets"]]) {
    const list = h.nodes.get(selector), active = () => list.tabs.filter((t) => t.getAttribute("tabindex") === "0");
    h.el(first).focus();
    list.dispatch("keydown", { key: "End" });
    assert.equal(h.context.document.activeElement.id, last);
    assert.equal(active().length, 1);
    assert.equal(active()[0].getAttribute("aria-selected"), "true");
    list.dispatch("keydown", { key: "ArrowRight" });
    assert.equal(h.context.document.activeElement.id, first);
    list.dispatch("keydown", { key: "ArrowLeft" });
    assert.equal(h.context.document.activeElement.id, last);
    list.dispatch("keydown", { key: "Home" });
    assert.equal(h.context.document.activeElement.id, first);
    for (const tab of list.tabs) {
      const panel = h.el(tab.getAttribute("aria-controls"));
      assert.equal(panel.getAttribute("role"), "tabpanel");
      assert.equal(panel.getAttribute("aria-labelledby"), tab.id);
      assert.equal(panel.hidden, tab.id !== first);
      if (tab.id !== first) assert.equal(tab.getAttribute("tabindex"), "-1");
    }
  }
});

test("uploads: botões nativos acionam os inputs, preservando handlers de importação", () => {
  const h = harness();
  h.load("analysis-snapshot"); h.load("analysis-ui"); h.load("ensemble-analysis"); h.load("ensemble-ui");
  for (const fn of h.ready) fn();
  for (const [button, input] of [["btn-an-arquivo", "an-arquivo"], ["btn-ens-file", "ens-file"]]) {
    let clicks = 0;
    h.el(input).addEventListener("click", () => clicks++);
    assert.equal(h.el(button).tag, "button");
    assert.equal(h.el(button).getAttribute("type"), "button");
    h.el(button).click();
    assert.equal(clicks, 1);
    assert.ok(h.el(input).listeners.change.length);
  }
});

test("pockets: botões ordenam, aria-sort alterna e foco é recuperado após recriar o cabeçalho", async () => {
  const h = harness();
  h.get('estado.pockets = [{ name: "P_0", volume: 20 }, { name: "P_1", volume: 10 }]; renderTabelaPockets(estado.pockets)');
  const original = h.el("pocket-sort-volume");
  assert.equal(original.tag, "button");
  assert.match(h.el("pockets-resultado").innerHTML, /<th class="th-sort-cell" scope="col" aria-sort="none"><button[^>]+id="pocket-sort-volume"/);
  original.focus(); original.click();
  assert.notEqual(h.el("pocket-sort-volume"), original);
  assert.equal(h.context.document.activeElement, h.el("pocket-sort-volume"));
  assert.match(h.el("pockets-resultado").innerHTML, /aria-sort="ascending"><button[^>]+id="pocket-sort-volume"/);
  assert.ok(h.el("pockets-resultado").innerHTML.indexOf("<strong>P_1") < h.el("pockets-resultado").innerHTML.indexOf("<strong>P_0"));
  h.el("pocket-sort-volume").click();
  assert.match(h.el("pockets-resultado").innerHTML, /aria-sort="descending"><button[^>]+id="pocket-sort-volume"/);
  assert.equal(h.context.document.activeElement, h.el("pocket-sort-volume"));
  await Promise.resolve();
});

test("cabeçalho de pockets: botão ocupa a célula e recebe seu padding, inclusive nos cantos", () => {
  const css = read("docs/style.css");
  const cell = css.match(/\.th-sort-cell\s*\{([^}]+)\}/)[1];
  const button = css.match(/\.th-sort\s*\{([^}]+)\}/)[1];
  assert.match(cell, /padding:\s*0\s*;/);
  assert.match(button, /display:\s*block\s*;/);
  for (const dimension of ["width", "height"]) assert.match(button, new RegExp(dimension + ":\\s*100%\\s*;"));
  assert.match(button, /padding:\s*var\(--cell-padding\)\s*;/);
  assert.match(button, /text-align:\s*inherit\s*;/);
  assert.match(button, /border-radius:\s*0\s*;/);
});

test("aminoácidos: tabela acompanha escopo, valores e ordenação do gráfico sem mudar os dados", async () => {
  const h = harness(); h.get("init()");
  h.context.pdb = read("tests/fixtures/ui-render/4HHB.pdb");
  h.get('estado.dados = ProtAnalysis.analisarCompleto(pdb); estado.nome = "4HHB"; estado.corPorCadeia = {}');
  const before = h.get("JSON.stringify(estado.dados)");
  for (const scope of ["*", "A"]) {
    h.el("aa-cadeia").value = scope;
    h.el("aa-ordem").value = "cont";
    await h.get("plotAA()");
    const rows = [...h.el("aa-tabela").innerHTML.matchAll(/<td>([^<]*)<\/td><td>([^<]*)<\/td>\s*<td>([^<]*)<\/td><td>([^<]*)<\/td>/g)];
    assert.equal(rows.length, 20);
    const graph = h.plots.at(-1)[1][0];
    assert.deepEqual(rows.map((r) => r[2]), Array.from(graph.x));
    assert.deepEqual(rows.map((r) => Number(r[3])), Array.from(graph.customdata));
    assert.deepEqual(rows.map((r) => Number(r[4])), Array.from(graph.y));
    assert.ok(rows.every((r) => r[1] === (scope === "*" ? "Todas as cadeias" : "Cadeia A")));
  }
  const toggle = h.el("btn-aa-tabela"); toggle.click();
  assert.equal(h.el("aa-tabela").hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  toggle.click(); assert.equal(h.el("aa-tabela").hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(h.get("JSON.stringify(estado.dados)"), before);
  assert.ok(h.el("btn-aa-csv").listeners.click.length);
});

test("comparação: tabela contém os 20 aminoácidos, contagens e percentuais de cada estrutura", async () => {
  const h = harness();
  h.context.sources = ["4HHB", "1CRN"].map((id) => ({ id, pdbText: read("tests/fixtures/ui-render/" + id + ".pdb") }));
  h.get("estado.comparacao = sources; renderCmpAA()");
  await h.get("plotCmpAA()");
  const table = h.el("cmp-aa-tabela");
  assert.equal((table.innerHTML.match(/scope="row"/g) || []).length, 40);
  for (const id of ["4HHB", "1CRN"]) assert.equal((table.innerHTML.match(new RegExp('scope="row">' + id, "g")) || []).length, 20);
  const rows = [...table.innerHTML.matchAll(/scope="row">([^<]+)<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td>\s*<td>([^<]+)<\/td><td>([^<]+)<\/td>/g)];
  const traces = h.plots.at(-1)[1];
  for (const trace of traces) {
    const group = rows.filter((r) => r[1] === trace.name);
    assert.deepEqual(group.map((r) => r[3]), Array.from(trace.x));
    assert.deepEqual(group.map((r) => Number(r[5])), Array.from(trace.y));
    const expected = h.get('ProtAnalysis.frequenciaAminoacidos(estado.comparacao.find(p => p.id === "' + trace.name + '").pdbText).itens');
    assert.deepEqual(group.map((r) => Number(r[4])), Array.from(expected, (i) => i.contagem));
  }
  assert.match(table.innerHTML, /Todas as cadeias/);
  const before = table.innerHTML;
  h.el("btn-cmp-aa-tabela").click();
  assert.equal(table.hidden, false);
  assert.equal(h.el("btn-cmp-aa-tabela").getAttribute("aria-expanded"), "true");
  await h.get("plotCmpAA()");
  assert.equal(table.innerHTML, before);
  assert.equal(table.hidden, false);
});

function luminance(hex) {
  const rgb = hex.match(/../g).map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
function blend(fg, bg, alpha) {
  return fg.match(/../g).map((v, i) => Math.round(parseInt(v, 16) * alpha + parseInt(bg.slice(i * 2, i * 2 + 2), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

test("contraste: texto secundário e títulos passam de 4,5:1 nos fundos e avisos dos dois temas", () => {
  const css = read("docs/style.css");
  const blocks = [css.match(/:root\s*\{([^}]+)\}/)[1], css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]];
  for (const block of blocks) {
    const vars = Object.fromEntries([...block.matchAll(/--([\w-]+): #([0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
    for (const base of [vars.bg, vars.card]) {
      const surfaces = [base, blend("2a5599", base, .1), blend("e0a800", base, .16), blend("2ea05a", base, .12), blend("e8513a", base, .12)];
      for (const surface of surfaces) {
        assert.ok(contrast(vars.muted, surface) >= 4.5, "texto secundário sobre " + surface);
        assert.ok(contrast(vars["primary-dark"], surface) >= 4.5, "título sobre " + surface);
        assert.ok(contrast(vars.primary, surface) >= 4.5, "texto azul sobre " + surface);
      }
      assert.ok(contrast(vars.primary, blend("2a5599", base, .25)) >= 4.5, "hover dos chips e downloads");
      assert.ok(contrast(vars.text, blend("7f7f7f", base, .1)) >= 4.5, "hover dos botões secundários");
      assert.ok(contrast(vars.primary, base) >= 3, "indicador de foco");
    }
  }
  assert.ok(contrast("ffffff", "3a6fd6") >= 4.5, "botão primário escuro");
  assert.ok(contrast("ffffff", "2a5599") >= 4.5, "botão primário e hover escuro");
});

test("pocket 3D: hover escuro usa tom distinto e mantém contraste sobre cartão e linha destacada", () => {
  const css = read("docs/style.css");
  const dark = css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/)[1];
  const vars = Object.fromEntries([...dark.matchAll(/--([\w-]+): #([0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  assert.notEqual(vars.primary, vars["primary-dark"]);
  assert.match(css, /\.pocket-3d:hover\s*\{\s*color:\s*var\(--primary-dark\)/);
  for (const bg of [vars.bg, vars.card, blend("2ea05a", vars.card, .12)]) {
    assert.ok(contrast(vars["primary-dark"], bg) >= 4.5);
  }
});
