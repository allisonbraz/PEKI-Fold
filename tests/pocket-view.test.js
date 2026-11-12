// Botão 3D da lista de pockets: mostrar e ocultar no clique repetido.
"use strict";

const fs = require("fs");
const path = require("path");

let falhas = 0;
let ok = 0;
function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}

class El {
  constructor(tag) {
    this.tag = tag || "div";
    this.id = "";
    this.className = "";
    this.attrs = {};
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.value = "";
    this.checked = false;
    this.hidden = false;
    this._text = "";
    this._html = "";
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this._html = this._text; }
  get innerHTML() { return this._html; }
  set innerHTML(html) {
    this._html = String(html);
    this.children = parseFragment(this._html, this);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  click() {
    for (const fn of this.listeners.click || []) fn({ target: this, currentTarget: this });
  }
  focus() { document.activeElement = this; }
  setAttribute(nome, valor) {
    this.attrs[nome] = String(valor);
    if (nome === "id") this.id = String(valor);
    if (nome === "class") this.className = String(valor);
    if (nome.startsWith("data-")) this.dataset[nome.slice(5)] = String(valor);
  }
  getAttribute(nome) { return Object.prototype.hasOwnProperty.call(this.attrs, nome) ? this.attrs[nome] : null; }
  closest(sel) {
    let n = this;
    while (n) {
      if (combina(n, sel)) return n;
      n = n.parent;
    }
    return null;
  }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  get classList() { return classListOf(this); }
}

function classListOf(el) {
  const ler = () => (el.className || "").split(/\s+/).filter(Boolean);
  const gravar = (lista) => {
    el.className = lista.join(" ");
    el.attrs.class = el.className;
  };
  return {
    contains(c) { return ler().includes(c); },
    add(...cs) {
      const lista = ler();
      for (const c of cs) if (!lista.includes(c)) lista.push(c);
      gravar(lista);
    },
    remove(...cs) { gravar(ler().filter((c) => !cs.includes(c))); },
    toggle(c, force) {
      const tem = ler().includes(c);
      const ligar = force === undefined ? !tem : !!force;
      if (ligar) this.add(c);
      else this.remove(c);
      return ligar;
    },
  };
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(s || ""))) attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  return attrs;
}

function aplicarAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

function parseFragment(html, parent) {
  const roots = [];
  const stack = [];
  const re = /<\/?([a-zA-Z0-9:-]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[3] != null) {
      const top = stack[stack.length - 1];
      if (top) top._text += m[3];
      continue;
    }
    const tag = m[1].toLowerCase();
    const fecha = html[m.index + 1] === "/";
    if (fecha) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.splice(i, 1); break; }
      }
      continue;
    }
    const el = new El(tag);
    aplicarAttrs(el, parseAttrs(m[2]));
    const pai = stack[stack.length - 1] || parent;
    el.parent = pai;
    if (pai === parent) roots.push(el);
    else pai.children.push(el);
    const vazio = /\/\s*$/.test(m[0]) || ["br", "img", "input", "hr"].includes(tag);
    if (!vazio) stack.push(el);
  }
  return roots;
}

function combina(el, sel) {
  if (!(el instanceof El)) return false;
  let tag = null;
  let id = null;
  const classes = [];
  const re = /([.#])?([^\s.#]+)/g;
  let m;
  while ((m = re.exec(sel))) {
    if (m[1] === "#") id = m[2];
    else if (m[1] === ".") classes.push(m[2]);
    else tag = m[2].toLowerCase();
  }
  if (tag && el.tag !== tag) return false;
  if (id && el.id !== id) return false;
  const tem = (el.className || "").split(/\s+/);
  return classes.every((c) => tem.includes(c));
}

function descendentes(el) {
  const out = [];
  for (const filho of el.children || []) {
    out.push(filho);
    out.push(...descendentes(filho));
  }
  return out;
}

function queryAll(root, sel) {
  const grupos = sel.trim().split(/\s+/);
  let atuais = [root];
  for (const g of grupos) {
    const prox = [];
    for (const base of atuais) {
      for (const el of descendentes(base)) if (combina(el, g)) prox.push(el);
    }
    atuais = prox;
  }
  return atuais;
}

const registro = [];
function registrar(id, tag) {
  const el = new El(tag || "div");
  el.id = id;
  registro.push(el);
  return el;
}

const document = {
  activeElement: null,
  body: { dataset: { theme: "" } },
  head: { appendChild() {} },
  addEventListener() {},
  createElement() { return new El("script"); },
  get children() { return registro; },
  querySelector(sel) { return queryAll(this, sel)[0] || null; },
  querySelectorAll(sel) { return queryAll(this, sel); },
};

global.document = document;
global.window = global;
global.$3Dmol = { SurfaceType: { SAS: "SAS" } };
window.Plotly = { newPlot() {}, Plots: { resize() {} } };

require("node:vm").runInThisContext(fs.readFileSync(path.join(__dirname, "../docs/dogsite-client.js"), "utf8"), { filename: "dogsite-client.js" });
require("node:vm").runInThisContext(fs.readFileSync(path.join(__dirname, "../docs/libs-loader.js"), "utf8"), { filename: "libs-loader.js" });
const App = require("./helpers/viewer-app.js");

function viewerFalso() {
  const calls = [];
  return {
    calls,
    setStyle(sel, spec) { calls.push({ op: "setStyle", sel, spec }); },
    render() { calls.push({ op: "render" }); },
    removeAllSurfaces() { calls.push({ op: "removeAllSurfaces" }); },
    addSurface(type, opts, sel) { calls.push({ op: "addSurface", type, opts, sel }); },
    removeAllShapes() { calls.push({ op: "removeAllShapes" }); },
    spin() { calls.push({ op: "spin" }); },
  };
}

function atomo(chain, resi) {
  return "ATOM  ".padEnd(21, " ") + chain + String(resi).padStart(4, " ");
}

function drenar() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let prepChamadas = 0;
global.PrepUI = {
  aoMostrar() {},
  aposEstilo() { prepChamadas += 1; },
  ativo() { return false; },
};

const pockets = [
  { name: "P_0", volume: 100, surface: 80, depth: 1.2, hydrophobicity: 0.2, accept: 3, donor: 1, drugScore: 0.5, residuosUrl: "mem://p0" },
  { name: "P_1", volume: 40, surface: 30, depth: 0.4, hydrophobicity: 0.9, accept: 1, donor: 2, drugScore: 0.8, residuosUrl: "mem://p1" },
  { name: "P_2", volume: 10, surface: 8, depth: 0.2, hydrophobicity: 0.1, accept: 0, donor: 0, drugScore: 0.1, residuosUrl: null },
];

const residuos = {
  "mem://p0": [atomo("A", 10), atomo("A", 11), atomo("B", 3)].join("\n"),
  "mem://p1": atomo("A", 20),
};

function instalarFetchImediato() {
  global.fetch = async (url) => ({
    ok: true,
    async text() { return residuos[url] || ""; },
  });
}

function preparar() {
  prepChamadas = 0;
  instalarFetchImediato();
  App.estado.pockets = pockets.map((p) => ({ ...p }));
  App.estado.pocketSort = null;
  App.estado.vistaPocket = null;
  App.estado.superficie = null;
  App.estado.ultimoMotivo = null;
  App.estado.pdbId = "1CRN";
  App.estado.dados = { cadeias: ["A", "B"] };
  App.estado.corPorCadeia = { A: "#2a5599", B: "#e8513a" };
  App.estado.meta = { ligantes: [{ id: "HEM" }] };
  App.estado.viewer = viewerFalso();
  App.invalidarVistaPocket();
  const surf = document.querySelector("#surf-toggle");
  const lig = document.querySelector("#lig-toggle");
  const estilo = document.querySelector("#estilo-3d");
  surf.checked = false;
  lig.checked = true;
  estilo.value = "cartoon";
  document.querySelector("#pockets-status").textContent = "";
  document.activeElement = null;
}

function botoes() {
  return document.querySelectorAll("#pockets-resultado .pocket-3d");
}

function botao(idx) {
  return botoes().find((b) => Number(b.dataset.idx) === idx);
}

function aposLimpeza(calls) {
  let corte = -1;
  calls.forEach((c, i) => {
    if (c.op === "setStyle" && c.sel && Object.keys(c.sel).length === 0) corte = i;
  });
  return calls.slice(corte + 1);
}

function temMagenta(calls) {
  return calls.some((c) => c.op === "setStyle" && c.spec && c.spec.stick && c.spec.stick.color === "magenta");
}

function temLigante(calls) {
  return calls.some((c) => c.op === "setStyle" && c.sel && Array.isArray(c.sel.resn) && c.sel.resn.includes("HEM"));
}

function temCadeia(calls) {
  return calls.some((c) => c.op === "setStyle" && c.sel && c.sel.chain === "A" && c.spec && c.spec.cartoon);
}

function superficies(calls) {
  return calls.filter((c) => c.op === "addSurface");
}

async function clicar(btn) {
  btn.click();
  await drenar();
}

async function testeEstadoInicialEDrugScore() {
  preparar();
  App.renderTabelaPockets(App.estado.pockets);
  const html = document.querySelector("#pockets-resultado").innerHTML;
  assert(html.includes("O drugScore e o volume são descritores geométricos da cavidade, não previsão de ligação."), "aviso de drugScore permanece na análise");
  assert(html.includes("Não é afinidade nem previsão de ligação"), "dica do drugScore permanece");
  assert(botoes().length === 2, "só pockets com resíduos ganham botão 3D");
  const p0 = botao(0);
  const p2 = html.includes(">P_2<");
  assert(p2, "P_2 continua na tabela");
  assert(!html.includes('data-idx="2"'), "pocket sem resíduos não vira botão");
  assert(p0.textContent.includes("ver") && !p0.textContent.includes("ocultar"), "rótulo inicial é ver");
  assert(p0.getAttribute("aria-pressed") === "false", "aria-pressed falso quando oculto");
  assert(p0.getAttribute("aria-label") === "Mostrar P_0 no 3D", "nome acessível de mostrar");
  assert(p0.getAttribute("type") === "button" || p0.attrs.type === "button", "botão não é submit");
  assert(p0.classList.contains("link-btn") && p0.classList.contains("pocket-3d"), "classes do link permanecem");
  assert(!p0.classList.contains("ativo"), "não nasce ativo");
  const tr = p0.closest("tr");
  assert(tr.classList.contains("destaque-maior"), "destaque do maior volume permanece");
  assert(!tr.classList.contains("pocket-visto"), "linha ainda não está marcada como vista");
}

async function testeCliqueRepetido() {
  preparar();
  App.renderTabelaPockets(App.estado.pockets);
  const p0 = botao(0);
  document.activeElement = p0;
  const antes = prepChamadas;

  await clicar(p0);
  assert(p0 === botao(0), "o clique não recria o botão e o foco permanece no mesmo nó");
  assert(document.activeElement === p0, "o clique não move o foco");
  assert(p0.textContent.includes("ocultar"), "visível: o botão passa a dizer ocultar");
  assert(p0.getAttribute("aria-pressed") === "true", "aria-pressed verdadeiro quando visível");
  assert(p0.getAttribute("aria-label") === "Ocultar P_0 no 3D", "nome acessível de ocultar");
  assert(p0.classList.contains("link-btn"), "hover/link não perde a classe no estado ativo");
  assert(p0.classList.contains("ativo"), "estado visual ativo");
  const tr = p0.closest("tr");
  assert(tr.classList.contains("pocket-visto") && tr.classList.contains("destaque-maior"), "marca o pocket visto sem tirar o destaque de volume");
  assert(botao(1).getAttribute("aria-pressed") === "false", "o outro pocket continua oculto");
  assert(document.querySelector("#surf-toggle").checked === true, "a superfície do pocket liga o controle");
  assert(document.querySelector("#lig-toggle").checked === true, "ligantes continuam ligados");
  const apos = aposLimpeza(App.estado.viewer.calls);
  assert(temCadeia(apos), "o estilo por cadeia continua");
  assert(temLigante(apos), "o ligante HEM continua desenhado ao mostrar");
  assert(temMagenta(apos), "resíduos do pocket ficam em magenta");
  const surf = superficies(App.estado.viewer.calls);
  assert(surf.length === 2, "superfície nas duas cadeias do pocket: " + surf.length);
  assert(surf.every((s) => s.opts.color === "#ff5cd0" && s.opts.opacity === 0.8), "cor e opacidade planejadas da cavidade");
  assert(surf.some((s) => s.sel.chain === "A" && s.sel.resi.includes(10) && s.sel.resi.includes(11)), "seleção da cadeia A");
  assert(surf.some((s) => s.sel.chain === "B" && s.sel.resi.includes(3)), "seleção da cadeia B");
  assert(prepChamadas > antes, "o preparo reaplica o destaque depois do estilo");
  assert(!App.estado.viewer.calls.some((c) => c.op === "removeAllShapes"), "não apaga formas de outro overlay");
  assert(!App.estado.viewer.calls.some((c) => c.op === "spin"), "girar não é alterado");
  assert(document.querySelector("#pockets-status").textContent.includes("P_0"), "status confirma o pocket mostrado");

  await clicar(p0);
  assert(p0 === botao(0), "ocultar também não troca o nó do botão");
  assert(p0.textContent.includes("ver") && !p0.textContent.includes("ocultar"), "segundo clique volta a ver");
  assert(p0.getAttribute("aria-pressed") === "false", "aria-pressed falso depois de ocultar");
  assert(!p0.closest("tr").classList.contains("pocket-visto"), "a linha deixa de estar marcada");
  assert(p0.closest("tr").classList.contains("destaque-maior"), "o maior volume segue destacado");
  assert(document.querySelector("#surf-toggle").checked === false, "sem superfície anterior, o controle desliga");
  assert(App.estado.superficie == null, "a superfície do pocket sai");
  const aposOcultar = aposLimpeza(App.estado.viewer.calls);
  assert(temLigante(aposOcultar), "ocultar devolve os ligantes");
  assert(temCadeia(aposOcultar), "ocultar devolve o estilo das cadeias");
  assert(!temMagenta(aposOcultar), "ocultar tira o magenta");
  assert(document.querySelector("#lig-toggle").checked === true, "o controle de ligantes não é desligado");
  assert(document.querySelector("#pockets-status").textContent.includes("oculto"), "status confirma que ocultou");

  await clicar(p0);
  await clicar(p0);
  await clicar(p0);
  assert(p0.getAttribute("aria-pressed") === "true", "três cliques depois de um par deixam o pocket visível");
  await clicar(p0);
  assert(p0.getAttribute("aria-pressed") === "false", "quatro cliques fecham o ciclo em oculto");
}

async function testeOutroPocketESuperficieAnterior() {
  preparar();
  App.estado.superficie = { sels: [{}], color: "#9ec5ff", opacity: 0.65, origem: "proteina" };
  document.querySelector("#surf-toggle").checked = true;
  App.renderTabelaPockets(App.estado.pockets);
  await clicar(botao(0));
  assert(superficies(App.estado.viewer.calls).at(-1).opts.color === "#ff5cd0", "mostrar troca a superfície para a cavidade");
  await clicar(botao(1));
  assert(botao(0).getAttribute("aria-pressed") === "false", "o pocket anterior deixa de ser o visível");
  assert(botao(1).getAttribute("aria-pressed") === "true" && botao(1).textContent.includes("ocultar"), "o segundo pocket fica visível");
  const cores = superficies(App.estado.viewer.calls).map((s) => s.opts.color);
  assert(cores.at(-1) === "#ff5cd0", "a superfície visível é a do pocket atual");
  const ultima = superficies(App.estado.viewer.calls).at(-1);
  assert(ultima.sel.chain === "A" && ultima.sel.resi.includes(20) && !ultima.sel.resi.includes(10), "a seleção acompanha o pocket novo");
  assert(botao(0).closest("tr").classList.contains("destaque-maior"), "trocar de pocket não apaga o destaque de volume");
  await clicar(botao(1));
  assert(botao(1).getAttribute("aria-pressed") === "false", "ocultar o segundo pocket");
  assert(App.estado.superficie && App.estado.superficie.color === "#9ec5ff", "volta a superfície da proteína que já estava ligada");
  assert(App.estado.superficie.origem === "proteina", "a superfície restaurada não fica marcada como pocket");
  assert(document.querySelector("#surf-toggle").checked === true, "o controle de superfície permanece ligado");
  assert(temLigante(aposLimpeza(App.estado.viewer.calls)), "ligantes seguem depois de trocar e ocultar");
}

async function testeSuperficieDoUsuarioDuranteAVista() {
  preparar();
  App.estado.superficie = { sels: [{}], color: "#9ec5ff", opacity: 0.65, origem: "proteina" };
  document.querySelector("#surf-toggle").checked = true;
  App.renderTabelaPockets(App.estado.pockets);
  await clicar(botao(0));
  App.aoAlternarSuperficie(false);
  assert(App.estado.superficie == null, "desligar a superfície enquanto o pocket está aberto obedece o controle");
  assert(temMagenta(aposLimpeza(App.estado.viewer.calls)), "os resíduos do pocket continuam quando só a superfície muda");
  await clicar(botao(0));
  assert(App.estado.superficie == null, "ocultar não religa a superfície que o usuário desligou");
  assert(document.querySelector("#surf-toggle").checked === false, "o checkbox permanece desligado");
  assert(!temMagenta(aposLimpeza(App.estado.viewer.calls)), "os resíduos saem no ocultar");
  assert(temLigante(aposLimpeza(App.estado.viewer.calls)), "ligantes ficam");
}

async function testeEstiloEMotivo() {
  preparar();
  App.renderTabelaPockets(App.estado.pockets);
  await clicar(botao(0));
  App.estado.viewer.calls.length = 0;
  document.querySelector("#estilo-3d").value = "stick";
  App.aplicarEstiloMantendoPocket();
  const aposEstilo = aposLimpeza(App.estado.viewer.calls);
  assert(aposEstilo.some((c) => c.spec && c.spec.stick && c.spec.stick.color === "#2a5599" && c.sel && c.sel.chain === "A"), "o estilo stick da cadeia é aplicado");
  assert(temMagenta(aposEstilo), "mudar o estilo não apaga o pocket aberto");
  assert(temLigante(aposEstilo), "mudar o estilo não apaga o ligante");
  assert(botao(0).getAttribute("aria-pressed") === "true", "o botão continua ocultar");

  const motivo = [{ cadeia: "A", residuos: ["10"] }];
  App.estado.ultimoMotivo = { motivo: "ALA", ocorrencias: motivo };
  App.destacarMotivo(motivo);
  assert(aposLimpeza(App.estado.viewer.calls).some((c) => c.spec && c.spec.stick && c.spec.stick.color === "yellow"), "o motivo ainda é pintado de amarelo");
  await clicar(botao(0));
  const apos = aposLimpeza(App.estado.viewer.calls);
  assert(apos.some((c) => c.spec && c.spec.stick && c.spec.stick.color === "yellow"), "ocultar o pocket não apaga o motivo que foi posto por cima");
  assert(!temMagenta(apos), "o magenta do pocket sai");
  assert(temLigante(apos), "ligantes continuam com o motivo");
  assert(App.estado.superficie == null, "a superfície do pocket sai mesmo com motivo");
}

async function testeOrdenacao() {
  preparar();
  App.renderTabelaPockets(App.estado.pockets);
  await clicar(botao(1));
  const th = document.querySelectorAll("#pockets-resultado .th-sort").find((el) => el.dataset.col === "volume");
  th.click();
  assert(botao(1).textContent.includes("ocultar") && botao(1).getAttribute("aria-pressed") === "true", "ordenar não esquece qual pocket está visível");
  assert(botao(0).getAttribute("aria-pressed") === "false", "o outro continua ver depois de ordenar");
  assert(botao(0).closest("tr").classList.contains("destaque-maior"), "o maior volume segue marcado depois de ordenar");
  await clicar(botao(1));
  assert(botao(1).getAttribute("aria-pressed") === "false", "o botão recriado pela ordenação ainda oculta no clique");
}

async function testeCliqueDuranteCarregamento() {
  preparar();
  let resolver = null;
  global.fetch = (url) => new Promise((resolve) => { resolver = () => resolve({ async text() { return residuos[url]; } }); });
  App.renderTabelaPockets(App.estado.pockets);
  App.estado.superficie = { sels: [{}], color: "#9ec5ff", opacity: 0.65, origem: "proteina" };
  document.querySelector("#surf-toggle").checked = true;
  const p0 = botao(0);
  p0.click();
  assert(p0.textContent.includes("ocultar"), "enquanto carrega, o botão já oferece ocultar");
  p0.click();
  assert(p0.textContent.includes("ver"), "clicar de novo cancela antes da resposta");
  resolver();
  await drenar();
  assert(p0.getAttribute("aria-pressed") === "false", "a resposta atrasada não religa o pocket");
  assert(!temMagenta(App.estado.viewer.calls), "a resposta atrasada não pinta resíduos");
  assert(!superficies(App.estado.viewer.calls).some((s) => s.opts.color === "#ff5cd0"), "a resposta atrasada não troca a superfície");
  assert(App.estado.superficie.color === "#9ec5ff", "a superfície da proteína permanece");
  assert(document.querySelector("#surf-toggle").checked === true, "o controle da superfície não pisca");
}

async function testeTrocaDuranteCarregamento() {
  preparar();
  const pendentes = {};
  global.fetch = (url) => new Promise((resolve) => { pendentes[url] = resolve; });
  App.renderTabelaPockets(App.estado.pockets);
  botao(0).click();
  botao(1).click();
  assert(botao(0).getAttribute("aria-pressed") === "false", "ao pedir outro pocket, o primeiro deixa o estado pressionado");
  assert(botao(1).textContent.includes("ocultar"), "o pedido novo fica como ocultar");
  pendentes["mem://p0"]({ async text() { return residuos["mem://p0"]; } });
  await drenar();
  assert(!temMagenta(App.estado.viewer.calls), "o pocket abandonado não pinta por cima");
  pendentes["mem://p1"]({ async text() { return residuos["mem://p1"]; } });
  await drenar();
  assert(botao(1).getAttribute("aria-pressed") === "true", "só o pocket pedido por último fica visível");
  assert(superficies(App.estado.viewer.calls).every((s) => s.sel.resi.includes(20)), "a superfície é a do segundo pocket");
}

async function testeFalhaNaoApagaVistaAnterior() {
  preparar();
  instalarFetchImediato();
  App.renderTabelaPockets(App.estado.pockets);
  await clicar(botao(0));
  global.fetch = async () => { throw new Error("rede caiu"); };
  await clicar(botao(1));
  assert(botao(0).getAttribute("aria-pressed") === "true", "se o próximo pocket falha, o que estava visível continua selecionado");
  assert(botao(1).textContent.includes("ver"), "o pocket que falhou volta a ver");
  assert(document.querySelector("#pockets-status").innerHTML.includes("rede caiu"), "o erro aparece no status");
  assert(App.estado.superficie && App.estado.superficie.origem === "pocket", "a cavidade que já estava na tela permanece");
  assert(temMagenta(aposLimpeza(App.estado.viewer.calls)), "os resíduos do pocket anterior continuam");
}

async function testeInvalidarCancelaPedido() {
  preparar();
  let resolver = null;
  global.fetch = () => new Promise((resolve) => { resolver = resolve; });
  App.renderTabelaPockets(App.estado.pockets);
  botao(0).click();
  App.invalidarVistaPocket();
  assert(botao(0).getAttribute("aria-pressed") === "false", "nova análise limpa o estado do botão");
  resolver({ async text() { return residuos["mem://p0"]; } });
  await drenar();
  assert(!temMagenta(App.estado.viewer.calls), "pedido antigo não pinta a estrutura nova");
}

async function testeComparacaoNaoGanhaToggle() {
  preparar();
  const cont = document.querySelector("#cmp-pockets-resultado");
  App.renderCmpPockets([{
    id: "1CRN",
    pockets: [{ name: "P_0", volume: 12, depth: 0.5, hydrophobicity: 0.2, drugScore: 0.4, residuosUrl: "mem://p0" }],
  }]);
  await drenar();
  assert(!cont.innerHTML.includes("pocket-3d"), "a comparação não ganha botão Ver no viewer único");
  assert(cont.innerHTML.includes("descritor geométrico"), "o aviso de drugScore da comparação permanece");
}

function testeCss() {
  const css = fs.readFileSync(path.join(__dirname, "..", "docs", "style.css"), "utf8");
  assert(css.includes(".pocket-3d:hover"), "hover do botão 3D continua definido");
  assert(css.includes(".pocket-3d:focus-visible"), "foco visível do botão 3D continua definido");
  assert(css.includes("tr.destaque-maior td"), "destaque de seleção da linha permanece");
}

async function main() {
  registrar("pockets-resultado", "div");
  registrar("pockets-status", "div");
  registrar("surf-toggle", "input");
  registrar("lig-toggle", "input");
  registrar("estilo-3d", "select");
  registrar("cmp-pockets-resultado", "div");
  await testeEstadoInicialEDrugScore();
  await testeCliqueRepetido();
  await testeOutroPocketESuperficieAnterior();
  await testeSuperficieDoUsuarioDuranteAVista();
  await testeEstiloEMotivo();
  await testeOrdenacao();
  await testeCliqueDuranteCarregamento();
  await testeTrocaDuranteCarregamento();
  await testeFalhaNaoApagaVistaAnterior();
  await testeInvalidarCancelaPedido();
  await testeComparacaoNaoGanhaToggle();
  testeCss();
  console.log(ok + " asserções ok, " + falhas + " falhas");
  if (falhas) process.exit(1);
}

main();
