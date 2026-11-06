// Cadeias no 3D, escopo de aminoácidos e montagem de motivo.
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
    this.disabled = false;
    this.type = "";
    this._text = "";
    this._html = "";
  }
  get textContent() {
    const proprio = this._text || "";
    if (this.children && this.children.length) return proprio + this.children.map((c) => c.textContent).join("");
    return proprio;
  }
  set textContent(v) {
    this._text = String(v);
    this._html = this._text;
    this.children = [];
  }
  get innerHTML() { return this._html; }
  set innerHTML(html) {
    this._html = String(html);
    this.children = parseFragment(this._html, this);
  }
  appendChild(filho) {
    filho.parent = this;
    this.children.push(filho);
    return filho;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() {
    for (const fn of this.listeners.click || []) fn({ target: this, currentTarget: this });
  }
  focus() { document.activeElement = this; }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  setAttribute(nome, valor) {
    this.attrs[nome] = String(valor);
    if (nome === "id") this.id = String(valor);
    if (nome === "class") this.className = String(valor);
    if (nome === "type") this.type = String(valor);
    if (nome === "disabled") this.disabled = true;
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
    for (const [k, v] of Object.entries(parseAttrs(m[2]))) el.setAttribute(k, v);
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
  createElement(tag) { return new El(tag || "div"); },
  get children() { return registro; },
  querySelector(sel) { return queryAll(this, sel)[0] || null; },
  querySelectorAll(sel) { return queryAll(this, sel); },
  getElementById(id) { return this.querySelector("#" + id); },
};

global.document = document;
global.window = global;
global.$3Dmol = { SurfaceType: { SAS: "SAS" } };

const plots = [];
window.Plotly = {
  newPlot(id, data, layout) { plots.push({ id, data, layout }); return Promise.resolve(); },
  Plots: { resize() {} },
};

const ProtAnalysis = require("../docs/pdb-analysis.js");
const StructureModel = require("../docs/structure-model.js");
global.ProtAnalysis = ProtAnalysis;
global.StructureModel = StructureModel;

let prepEsferas = 0;
global.PrepUI = {
  aoMostrar() {},
  aposEstilo(est) {
    prepEsferas += 1;
    if (est && est.viewer && est._prep) {
      est.viewer.setStyle({ chain: "A", atom: "SG" }, { sphere: { color: "orange", radius: 0.6 } });
    }
  },
  ativo() { return false; },
};

const App = require("../docs/app.js");

function viewerFalso() {
  const calls = [];
  return {
    calls,
    setStyle(sel, spec) { calls.push({ op: "setStyle", sel, spec }); },
    render() { calls.push({ op: "render" }); },
    removeAllSurfaces() { calls.push({ op: "removeAllSurfaces" }); },
    addSurface(type, opts, sel) { calls.push({ op: "addSurface", type, opts, sel }); },
    removeAllShapes() {},
    spin() {},
    resize() {},
  };
}

function aposLimpeza(calls) {
  let corte = -1;
  calls.forEach((c, i) => {
    if (c.op === "setStyle" && c.sel && Object.keys(c.sel).length === 0) corte = i;
  });
  return calls.slice(corte + 1);
}

function estilosDaCadeia(calls, chain) {
  return calls.filter((c) => c.op === "setStyle" && c.sel && c.sel.chain === chain);
}

function atom(resname, chain, resi) {
  const ch = chain === "_" ? " " : chain;
  // Colunas PDB: o leitor ignora ATOM com menos de 27 caracteres.
  return ("ATOM".padEnd(17, " ") + resname.slice(0, 3).padEnd(3, " ") + " " + ch + String(resi).padStart(4, " ")).padEnd(66, " ");
}

function freqDe(mapa) {
  const total = Object.values(mapa).reduce((s, n) => s + n, 0);
  return {
    total,
    itens: ProtAnalysis.AMINOACIDOS_PADRAO.map((aa) => ({
      aa,
      contagem: mapa[aa] || 0,
      porcentagem: total ? Math.round((10000 * (mapa[aa] || 0)) / total) / 100 : 0,
    })),
  };
}

function prepararDom() {
  registro.length = 0;
  registrar("tab-cadeias", "div");
  registrar("cadeias-legenda", "div");
  registrar("tab-aa", "div");
  registrar("aa-cadeia", "select");
  registrar("aa-ordem", "select").value = "alpha";
  registrar("aa-escopo", "p");
  registrar("aa-grafico", "div");
  registrar("aa-atalho", "div");
  registrar("aa-atalho-nota", "p");
  registrar("motivo-chips", "div");
  registrar("motivo-escopo", "p");
  registrar("motivo-formacao", "p");
  registrar("motivo-input", "input");
  registrar("motivo-aviso", "p").hidden = true;
  registrar("motivo-resultado", "div");
  registrar("estilo-3d", "select").value = "cartoon";
  registrar("lig-toggle", "input").checked = true;
  registrar("surf-toggle", "input").checked = true;
  registrar("pockets-resultado", "div");
  const pocket = new El("button");
  pocket.className = "link-btn pocket-3d";
  pocket.dataset.idx = "0";
  pocket.setAttribute("aria-pressed", "true");
  pocket.textContent = "👁 ocultar";
  document.querySelector("#pockets-resultado").appendChild(pocket);
  plots.length = 0;
  prepEsferas = 0;
  document.activeElement = null;
}

function dadosBase() {
  const frequencias = {
    A: freqDe({ ALA: 1, GLY: 1, VAL: 5 }),
    B: freqDe({ ALA: 3 }),
  };
  return {
    cadeias: ["A", "B"],
    frequencias,
    sequencias: { A: "AGV", B: "AAA" },
    residuosPorCadeia: {
      A: [["ALA", "1"], ["GLY", "2"], ["VAL", "3"], ["MSE", "4"]],
      B: [["ALA", "1"], ["ALA", "2"], ["ALA", "3"]],
    },
    estatisticas: {
      cadeias: [
        { cadeia: "A", atomos: 40, residuos: 4, aminoacidos_diferentes: 3 },
        { cadeia: "B", atomos: 24, residuos: 3, aminoacidos_diferentes: 1 },
      ],
      maior: { cadeia: "A", residuos: 4 },
      menor: { cadeia: "B", residuos: 3 },
    },
  };
}

function preparar(extra) {
  prepararDom();
  const dados = dadosBase();
  App.estado.dados = dados;
  App.estado.pdbText = [
    atom("ALA", "A", 1), atom("GLY", "A", 2), atom("VAL", "A", 3), atom("MSE", "A", 4),
    atom("ALA", "B", 1), atom("ALA", "B", 2), atom("ALA", "B", 3),
  ].join("\n") + "\n";
  App.estado.nome = "fixture.pdb";
  App.estado.corPorCadeia = { A: "#2a5599", B: "#e8513a" };
  App.estado.meta = { ligantes: [{ id: "HEM" }] };
  App.estado.viewer = viewerFalso();
  App.estado.cadeiasOcultas = new Set();
  App.estado.ultimoMotivo = null;
  App.estado.motivoNo3D = null;
  App.estado.superficie = { sels: [{}], color: "#9ec5ff", opacity: 0.65, origem: "proteina" };
  App.estado.vistaPocket = {
    idx: 0, nome: "P_0", visivel: true,
    sels: [{ chain: "A", resi: [1] }, { chain: "B", resi: [1] }],
    motivoPorCima: null,
  };
  App.estado.estrutura = extra && extra.estrutura ? extra.estrutura : null;
  App.estado._prep = true;
  document.querySelector("#motivo-input").value = "";
  document.querySelector("#motivo-resultado").innerHTML = "";
  return dados;
}

function botoesCadeia() {
  return document.querySelectorAll("#tab-cadeias .cadeia-3d");
}

function botaoCadeia(cid) {
  return botoesCadeia().find((b) => b.dataset.chain === cid);
}

function testeConsolidacaoNaoInventa() {
  const dados = dadosBase();
  const todas = ProtAnalysis.frequenciaConsolidada(dados.frequencias, dados.cadeias);
  const ala = todas.itens.find((i) => i.aa === "ALA");
  const gly = todas.itens.find((i) => i.aa === "GLY");
  const val = todas.itens.find((i) => i.aa === "VAL");
  const trp = todas.itens.find((i) => i.aa === "TRP");
  assert(ala.contagem === 4 && gly.contagem === 1 && val.contagem === 5, "soma as contagens, " + ala.contagem + "/" + gly.contagem + "/" + val.contagem);
  assert(todas.total === 10, "total 10, não a SEQRES: " + todas.total);
  assert(ala.porcentagem === 40 && val.porcentagem === 50 && gly.porcentagem === 10, "porcentagem da soma: " + ala.porcentagem + "/" + val.porcentagem);
  const mediaAla = (dados.frequencias.A.itens.find((i) => i.aa === "ALA").porcentagem + dados.frequencias.B.itens.find((i) => i.aa === "ALA").porcentagem) / 2;
  assert(Math.abs(mediaAla - ala.porcentagem) > 1, "não é a média das porcentagens (" + mediaAla + ")");
  assert(trp.contagem === 0 && trp.porcentagem === 0, "TRP ausente continua 0");
  assert(!todas.itens.some((i) => i.aa === "MSE"), "MSE não entra nos 20");
  const uma = App.frequenciaDoEscopo(dados, "A");
  assert(uma.escopo === "cadeia" && uma.total === dados.frequencias.A.total, "cadeia A reusa a frequência já calculada");
  assert(uma.itens === dados.frequencias.A.itens, "não copia nem recalcula a cadeia individual");
  const textoTodas = App.textoEscopoAA(App.frequenciaDoEscopo(dados, "*"));
  const textoA = App.textoEscopoAA(uma);
  assert(textoTodas.includes("molécula inteira") && textoTodas.includes("A, B"), "escopo consolidado nomeia as cadeias: " + textoTodas);
  assert(textoA.includes("uma cadeia") && textoA.includes("outras cadeias ficam de fora"), "escopo individual se distingue");
  assert(textoTodas.includes("não da SEQRES") && textoA.includes("não da média"), "a regra de contagem aparece nos dois");
  const soA = {
    cadeias: ["A"],
    frequencias: { A: dados.frequencias.A },
  };
  assert(App.textoEscopoAA(App.frequenciaDoEscopo(soA, "*")).includes("coincide com ela"), "uma cadeia só: o consolidado avisa que coincide");
}

function testeCatalogoEValidacao() {
  const cat = ProtAnalysis.catalogoResiduos(dadosBase().residuosPorCadeia);
  const codigos = cat.map((c) => c.codigo);
  assert(codigos.join(",") === "ALA,GLY,MSE,VAL", "só resíduos modelados, em ordem: " + codigos.join(","));
  const ala = cat.find((c) => c.codigo === "ALA");
  assert(ala.letra === "A" && ala.nome === "alanina" && ala.contagem === 4 && ala.padrao, "ALA traz letra, nome e contagem do modelo");
  const mse = cat.find((c) => c.codigo === "MSE");
  assert(mse.nome == null && mse.letra === "" && mse.padrao === false && mse.contagem === 1, "MSE não ganha nome inventado");
  assert(ProtAnalysis.catalogoResiduos(null).length === 0, "sem coordenadas não há catálogo");
  const vazio = ProtAnalysis.validarMotivoTexto("  ");
  assert(!vazio.ok && /não começa preenchido/.test(vazio.erro), "vazio explica que nada vem selecionado");
  const letra = ProtAnalysis.validarMotivoTexto("A-G");
  assert(!letra.ok && /letra isolada/.test(letra.erro) && /ALA-GLY/.test(letra.erro), "letra isolada é recusada");
  const ruim = ProtAnalysis.validarMotivoTexto("GLY-1-SER");
  assert(!ruim.ok && /GLY-1-SER|1/.test(ruim.erro) && /3 letras/.test(ruim.erro), "número é código inválido");
  const okm = ProtAnalysis.validarMotivoTexto(" ala, gly ");
  assert(okm.ok && okm.motivo.join("-") === "ALA-GLY", "separadores e caixa viram a ordem digitada");
  const pdb = [atom("ALA", "A", 1), atom("GLY", "A", 2), atom("SER", "A", 3), atom("ALA", "A", 4), atom("SER", "B", 1), atom("ALA", "B", 2)].join("\n");
  const hit = ProtAnalysis.buscarMotivo(pdb, ["ALA", "GLY", "SER"]);
  assert(hit.length === 1 && hit[0].cadeia === "A" && hit[0].posicao === "1" && hit[0].residuos.join(",") === "1,2,3", "janela contígua na ordem");
  const espalhado = ProtAnalysis.buscarMotivo(pdb, ["ALA", "SER", "GLY"]);
  assert(espalhado.length === 0, "os mesmos resíduos fora de ordem e de janela não contam");
  const reverso = ProtAnalysis.buscarMotivo(pdb, ["SER", "GLY", "ALA"]);
  assert(reverso.length === 0, "a ordem invertida não é a mesma janela");
  const porCadeia = { A: [["ALA", "10"], ["GLY", "11"]], B: [["GLY", "2"], ["ALA", "3"]] };
  const cif = StructureModel.buscarMotivo(porCadeia, "GLY-ALA");
  assert(cif.length === 1 && cif[0].cadeia === "B" && cif[0].posicao === "2", "sem texto PDB a busca usa a sequência lida");
  assert(StructureModel.buscarMotivo(porCadeia, ["ALA", "ALA"]).length === 0, "ALA existe nas duas cadeias e não forma janela");
}

function testeCadeiasVisibilidade() {
  const dados = preparar();
  const foto = JSON.stringify({
    pdb: App.estado.pdbText,
    est: dados.estatisticas,
    freq: dados.frequencias,
    seq: dados.sequencias,
    res: dados.residuosPorCadeia,
  });
  App.renderCadeias();
  const a = botaoCadeia("A");
  const b = botaoCadeia("B");
  assert(a && b, "cada cadeia tem controle 3D");
  assert(a.getAttribute("type") === "button" && a.classList.contains("link-btn"), "o controle é botão, não submit");
  assert(a.getAttribute("aria-pressed") === "true" && a.textContent.includes("ocultar"), "cadeia nasce visível, no mesmo par ver/ocultar do pocket");
  assert(a.getAttribute("aria-label") === "Ocultar cadeia A no 3D", "nome acessível de ocultar");
  assert(document.querySelector("#tab-cadeias").textContent.includes("muda só o desenho 3D"), "a aba separa visualização e dados");
  assert(document.querySelector("#tab-cadeias").textContent.includes("botão Ver/Ocultar do pocket não muda"), "o limite com o pocket está escrito");
  assert(document.querySelector("#btn-cadeias-mostrar").disabled === true, "mostrar todas fica inativo quando nenhuma está oculta");
  const pocketBtn = document.querySelector("#pockets-resultado .pocket-3d");
  document.activeElement = a;
  a.click();
  assert(document.activeElement === a, "ocultar não troca o botão de lugar");
  assert(a.getAttribute("aria-pressed") === "false" && a.textContent.includes("ver"), "oculta: o botão passa a ver");
  assert(a.getAttribute("aria-label") === "Mostrar cadeia A no 3D", "nome acessível de mostrar");
  assert(a.closest(".cadeia-item").classList.contains("oculta"), "a linha marca a cadeia oculta");
  assert(a.closest(".cadeia-item").textContent.includes("40 átomos"), "a contagem da linha permanece");
  assert(b.getAttribute("aria-pressed") === "true", "a outra cadeia não muda");
  assert(pocketBtn.getAttribute("aria-pressed") === "true" && pocketBtn.textContent.includes("ocultar"), "o pocket Ver/Ocultar não é apagado");
  assert(document.querySelector("#lig-toggle").checked === true, "ligantes continuam no próprio controle");
  assert(document.querySelector("#surf-toggle").checked === true, "a superfície continua ligada");
  assert(document.querySelector("#estilo-3d").value === "cartoon", "o estilo não é trocado");
  assert(App.estado.superficie.sels.length === 1 && Object.keys(App.estado.superficie.sels[0]).length === 0, "a seleção guardada da superfície não é reescrita");
  const desenho = aposLimpeza(App.estado.viewer.calls);
  assert(!estilosDaCadeia(desenho, "A").some((c) => c.spec && c.spec.cartoon), "a cadeia A não recebe cartoon");
  assert(estilosDaCadeia(desenho, "B").some((c) => c.spec && c.spec.cartoon), "a cadeia B continua no estilo");
  assert(desenho.some((c) => c.op === "setStyle" && c.sel && c.sel.chain === "A" && c.spec && Object.keys(c.spec).length === 0), "A é limpa depois da ficha de preparo");
  assert(desenho.some((c) => c.op === "setStyle" && c.sel && Array.isArray(c.sel.resn) && c.sel.resn.includes("HEM")), "o ligante HEM continua, inclusive com a cadeia oculta");
  assert(desenho.some((c) => c.spec && c.spec.stick && c.spec.stick.color === "magenta" && c.sel.chain === "B"), "o magenta do pocket fica na cadeia visível");
  assert(!desenho.some((c) => c.spec && c.spec.stick && c.spec.stick.color === "magenta" && c.sel.chain === "A"), "o magenta não redesenha a cadeia oculta");
  const surf = App.estado.viewer.calls.filter((c) => c.op === "addSurface");
  assert(surf.length === 1 && surf[0].sel.chain === "B", "a superfície desenhada sai só na cadeia visível");
  assert(surf[0].opts.color === "#9ec5ff", "a cor da superfície de proteína permanece");
  assert(document.querySelector("#cadeias-vis-status").textContent.includes("não mudaram"), "o status confirma que os dados ficaram");
  assert(JSON.stringify({
    pdb: App.estado.pdbText,
    est: dados.estatisticas,
    freq: dados.frequencias,
    seq: dados.sequencias,
    res: dados.residuosPorCadeia,
  }) === foto, "PDB, contagens, frequências e sequência não mudam");
  assert(document.querySelector("#cadeias-legenda .item.oculta").textContent.includes("oculta no 3D"), "a legenda repete o estado");

  document.querySelector("#estilo-3d").value = "stick";
  App.estado.viewer.calls.length = 0;
  App.aplicarEstiloMantendoPocket();
  assert(App.cadeiaOcultaNo3D("A") && !App.cadeiaOcultaNo3D("B"), "trocar o estilo não devolve a cadeia oculta");
  const aposEstilo = aposLimpeza(App.estado.viewer.calls);
  assert(aposEstilo.some((c) => c.spec && c.spec.stick && c.spec.stick.color === "#e8513a" && c.sel.chain === "B"), "o stick vale para a cadeia visível");
  assert(!aposEstilo.some((c) => c.spec && c.spec.stick && c.sel && c.sel.chain === "A" && c.spec.stick.color), "a cadeia oculta não ganha o estilo novo");
  assert(aposEstilo.some((c) => c.spec && c.spec.stick && c.spec.stick.color === "magenta" && c.sel.chain === "B"), "o pocket aberto sobrevive à troca de estilo");
  assert(App.estado.motivoNo3D == null, "trocar o estilo continua tirando o amarelo do motivo");

  App.estado.motivoNo3D = [{ cadeia: "A", residuos: ["1"] }, { cadeia: "B", residuos: ["1"] }];
  App.estado.ultimoMotivo = { motivo: "ALA", ocorrencias: App.estado.motivoNo3D };
  App.estado.viewer.calls.length = 0;
  b.click();
  assert(b.getAttribute("aria-pressed") === "false", "B oculta de forma independente");
  let surf0 = App.estado.viewer.calls.filter((c) => c.op === "addSurface");
  assert(surf0.length === 0, "sem cadeia visível não há superfície");
  assert(!aposLimpeza(App.estado.viewer.calls).some((c) => c.spec && c.spec.cartoon), "nenhuma cadeia recebe estilo");
  assert(aposLimpeza(App.estado.viewer.calls).some((c) => c.sel && c.sel.resn), "os ligantes ainda seguem o controle deles");
  assert(App.estado.ultimoMotivo.ocorrencias.length === 2, "ocultar não apaga o resultado do motivo");
  b.click();
  a.click();
  assert(a.getAttribute("aria-pressed") === "true" && b.getAttribute("aria-pressed") === "true", "mostrar de novo é independente");
  const voltou = aposLimpeza(App.estado.viewer.calls);
  assert(estilosDaCadeia(voltou, "A").some((c) => c.spec && c.spec.stick), "A volta no estilo que estava selecionado");
  assert(voltou.some((c) => c.spec && c.spec.stick && c.spec.stick.color === "yellow" && c.sel.chain === "A"), "o amarelo do motivo volta com a cadeia");
  assert(voltou.some((c) => c.spec && c.spec.stick && c.spec.stick.color === "magenta" && c.sel.chain === "A"), "o magenta do pocket volta com a cadeia");
  a.click();
  document.querySelector("#btn-cadeias-mostrar").click();
  assert(App.estado.cadeiasOcultas.size === 0 && !App.cadeiaOcultaNo3D("A") && a.getAttribute("aria-pressed") === "true", "mostrar todas devolve as cadeias");
  assert(document.querySelector("#btn-cadeias-mostrar").disabled === true, "o botão geral volta a ficar inativo");
}

function testeMuitasCadeiasESemId() {
  preparar();
  const ids = "ABCDEFGHIJKL".split("");
  App.estado.dados = {
    cadeias: ids,
    frequencias: {},
    sequencias: {},
    residuosPorCadeia: {},
    estatisticas: { cadeias: ids.map((cadeia) => ({ cadeia, atomos: 1, residuos: 1, aminoacidos_diferentes: 1 })) },
  };
  ids.forEach((cid) => {
    App.estado.corPorCadeia[cid] = "#2a5599";
    App.estado.dados.frequencias[cid] = freqDe({ ALA: 1 });
    App.estado.dados.sequencias[cid] = "A";
    App.estado.dados.residuosPorCadeia[cid] = [["ALA", "1"]];
  });
  App.estado.vistaPocket = null;
  App.estado.superficie = null;
  App.renderCadeias();
  assert(botoesCadeia().length === 12, "doze cadeias, doze controles");
  for (const cid of ids) {
    const btn = botaoCadeia(cid);
    btn.click();
    btn.click();
    btn.click();
    assert(btn.getAttribute("aria-pressed") === "false", "alternar três vezes deixa " + cid + " oculta");
  }
  assert(App.estado.cadeiasOcultas.size === 12, "cada cadeia guarda o próprio estado");
  document.querySelector("#btn-cadeias-mostrar").click();
  assert(App.estado.cadeiasOcultas.size === 0, "mostrar todas limpa só a visibilidade");
  assert(ids.every((cid) => App.estado.dados.sequencias[cid] === "A"), "as sequências das doze cadeias ficam");

  App.estado.dados = {
    cadeias: ["_"],
    frequencias: { _: freqDe({ GLY: 2 }) },
    sequencias: { _: "GG" },
    residuosPorCadeia: { _: [["GLY", "7"], ["GLY", "8"]] },
    estatisticas: { cadeias: [{ cadeia: "_", atomos: 8, residuos: 2, aminoacidos_diferentes: 1 }] },
  };
  App.estado.corPorCadeia = { _: "#2a5599" };
  App.estado.meta = { ligantes: [] };
  App.estado.viewer = viewerFalso();
  App.estado.cadeiasOcultas = new Set();
  App.estado.superficie = null;
  App.estado.vistaPocket = null;
  App.renderCadeias();
  assert(document.querySelector("#tab-cadeias").textContent.includes("não identificou"), "a cadeia sem id é explicada");
  const btn = botaoCadeia("_");
  assert(btn && btn.getAttribute("aria-label") === "Ocultar cadeia _ no 3D", "o controle usa o mesmo id _");
  btn.click();
  const limpou = App.estado.viewer.calls.some((c) => c.op === "setStyle" && c.sel && c.sel.chain === "" && c.spec && Object.keys(c.spec).length === 0);
  assert(limpou, "sem id, o 3Dmol recebe chain vazio");
  assert(App.estado.dados.sequencias._ === "GG", "a sequência da cadeia _ permanece");
}

function testeAminoacidosEscopo() {
  preparar();
  App.renderAA();
  return App.plotAA().then(() => {
    const sel = document.querySelector("#aa-cadeia");
    assert(sel.value === "*", "o padrão é todas as cadeias");
    assert(document.querySelector("#aa-escopo").dataset.escopo === "todas", "o painel marca o escopo consolidado");
    assert(document.querySelector("#tab-aa").dataset.escopo === "todas", "a aba inteira muda de escopo");
    assert(plots.at(-1).layout.title.includes("todas as cadeias"), "o gráfico diz o escopo");
    assert(plots.at(-1).data[0].marker.color === "#5c6b82", "a molécula inteira não usa a cor de uma cadeia");
    const ala = plots.at(-1).data[0];
    const iAla = ala.x.indexOf("ALA");
    assert(ala.y[iAla] === 40 && ala.customdata[iAla] === 4, "o gráfico consolidado usa a soma");
    const atalhos = document.querySelectorAll("#aa-atalho .aa-atalho").map((b) => b.dataset.aa);
    assert(atalhos.join(",") === "ALA,GLY,VAL", "o atalho só lista aminoácidos com contagem neste escopo: " + atalhos.join(","));
    assert(!atalhos.includes("TRP") && !atalhos.includes("MSE"), "ausente e modificado não viram atalho");
    const antes = document.querySelector("#motivo-input").value;
    document.querySelector("#aa-atalho .aa-atalho").click();
    assert(document.querySelector("#motivo-input").value === "ALA", "o atalho acrescenta um código, não a lista inteira: " + antes);
    App.adicionarAaAoMotivo("TRP");
    assert(document.querySelector("#motivo-input").value === "ALA", "clique num ausente não entra no motivo");
    assert(document.querySelector("#aa-atalho-nota").textContent.includes("não entra no motivo"), "o atalho explica a recusa");

    sel.value = "B";
    return sel.onchange().then(() => {
      assert(document.querySelector("#aa-escopo").textContent.includes("uma cadeia (B)"), "trocar para B muda o texto");
      assert(document.querySelector("#aa-escopo").dataset.escopo === "cadeia", "a faixa individual é outra");
      assert(plots.at(-1).data[0].marker.color === "#e8513a", "a cor é a da cadeia B");
      assert(plots.at(-1).data[0].customdata[plots.at(-1).data[0].x.indexOf("ALA")] === 3, "B não herda a soma");
      const soB = document.querySelectorAll("#aa-atalho .aa-atalho").map((b) => b.dataset.aa);
      assert(soB.join(",") === "ALA", "no escopo B o atalho não oferece GLY");
      sel.value = "A";
      return sel.onchange();
    }).then(() => {
      sel.value = "*";
      return sel.onchange();
    }).then(() => {
      sel.value = "A";
      return sel.onchange();
    }).then(() => {
      sel.value = "*";
      return sel.onchange();
    }).then(() => {
      assert(document.querySelector("#aa-escopo").dataset.escopo === "todas", "voltar para todas depois de várias trocas");
      assert(App.estado.dados.frequencias.A.itens.find((i) => i.aa === "ALA").porcentagem !== 40, "a porcentagem gravada da cadeia A não vira a da soma");
      document.querySelector("#aa-ordem").value = "cont";
      return App.plotAA();
    }).then(() => {
      assert(plots.at(-1).data[0].x[0] === "VAL", "ordenar por contagem não inventa resíduo: " + plots.at(-1).data[0].x.slice(0, 3).join(","));
      assert(App.estado.dados.frequencias.A.itens[0].aa === "ALA", "ordenar o gráfico não reordena a frequência guardada");
      const graf = document.querySelector("#aa-grafico");
      graf.listeners.plotly_click[0]({ points: [{ x: "TRP" }] });
      assert(!document.querySelector("#motivo-input").value.split("-").includes("TRP"), "barra sem resíduo modelado não entra");
      graf.listeners.plotly_click[0]({ points: [{ x: "GLY" }] });
      assert(document.querySelector("#motivo-input").value.endsWith("GLY"), "a barra com contagem acrescenta ao motivo: " + document.querySelector("#motivo-input").value);
    });
  });
}

function testeMotivosUi() {
  preparar();
  App.renderMotivos();
  const chips = document.querySelectorAll("#motivo-chips .motivo-chip");
  assert(chips.length === 4, "quatro resíduos presentes, não os 20");
  assert(chips.every((c) => c.getAttribute("aria-pressed") !== "true"), "nenhum chip começa pressionado");
  assert(document.querySelector("#motivo-input").value === "", "o campo começa vazio");
  assert(document.querySelector("#motivo-formacao").textContent.includes("Nenhum resíduo vem selecionado"), "a formação avisa que está vazia");
  const ala = chips.find((c) => c.dataset.aa === "ALA");
  assert(ala.textContent.includes("A") && ala.textContent.includes("ALA") && ala.textContent.includes("alanina"), "o rótulo junta letra, código e nome");
  assert(/Adicionar alanina/.test(ala.getAttribute("aria-label")), "o nome acessível traz o aminoácido");
  const mse = chips.find((c) => c.dataset.aa === "MSE");
  assert(mse.textContent.includes("fora dos 20") && /fora da lista/.test(mse.getAttribute("aria-label")), "MSE fica explícito como fora dos 20");
  ala.click();
  mse.click();
  chips.find((c) => c.dataset.aa === "GLY").click();
  assert(document.querySelector("#motivo-input").value === "ALA-MSE-GLY", "a ordem dos cliques é a ordem do motivo");
  document.querySelector("#motivo-resultado").innerHTML = "<p>resultado anterior</p>";
  App.removerUltimoMotivo();
  assert(document.querySelector("#motivo-input").value === "ALA-MSE", "remove só o último");
  assert(document.querySelector("#motivo-resultado").innerHTML.includes("resultado anterior"), "remover o último não apaga a lista");
  App.limparMotivoCampo();
  assert(document.querySelector("#motivo-input").value === "", "limpar esvazia o campo");
  assert(document.querySelector("#motivo-resultado").innerHTML.includes("resultado anterior"), "limpar preserva a última busca");
  document.querySelector("#motivo-input").value = "gly-lys";
  App.atualizarFormacaoMotivo();
  assert(document.querySelector("#motivo-formacao").textContent.includes("GLY-LYS"), "editar o campo atualiza a sequência em formação");
  const calls = App.estado.viewer.calls.length;
  const motivoAntes = App.estado.ultimoMotivo;
  document.querySelector("#motivo-input").value = "A";
  App.buscarMotivo();
  assert(document.querySelector("#motivo-aviso").hidden === false, "letra inválida aparece no alerta");
  assert(/letra isolada/.test(document.querySelector("#motivo-aviso").textContent), "o alerta explica a letra");
  assert(document.querySelector("#motivo-resultado").innerHTML.includes("resultado anterior"), "busca inválida preserva o resultado");
  assert(App.estado.ultimoMotivo === motivoAntes, "busca inválida não zera o motivo exportado");
  assert(App.estado.viewer.calls.length === calls, "busca inválida não mexe no 3D");
  document.querySelector("#motivo-input").value = "ALA-SER-GLY";
  App.buscarMotivo();
  assert(document.querySelector("#motivo-aviso").hidden === true, "busca válida limpa o alerta");
  assert(/Nenhuma ocorrência contígua/.test(document.querySelector("#motivo-resultado").textContent), "sem janela, a mensagem não fala em resíduos espalhados como acerto");
  assert(App.estado.ultimoMotivo == null, "sem ocorrência não fica motivo para exportar");
  document.querySelector("#motivo-input").value = "ALA-GLY";
  App.estado.cadeiasOcultas = new Set(["A"]);
  App.buscarMotivo();
  assert(App.estado.ultimoMotivo && App.estado.ultimoMotivo.ocorrencias.length === 1, "a ocorrência na cadeia oculta continua nos dados");
  assert(document.querySelector("#motivo-resultado").textContent.includes("Cadeia") && document.querySelector("#motivo-resultado").textContent.includes("A"), "a lista mostra a cadeia mesmo oculta");
  const amarelo = aposLimpeza(App.estado.viewer.calls).filter((c) => c.spec && c.spec.stick && c.spec.stick.color === "yellow");
  assert(amarelo.length === 0, "o amarelo não desenha a cadeia oculta");
  const html = document.querySelector("#motivo-resultado").innerHTML;
  document.querySelector("#motivo-input").value = "ALA-GLY-VAL";
  App.atualizarFormacaoMotivo();
  assert(document.querySelector("#motivo-resultado").innerHTML === html, "editar depois da busca não troca a lista");
  assert(document.querySelector("#motivo-formacao").textContent.includes("permanece"), "a formação avisa que a lista antiga segue valendo");
  App.estado.pdbText = null;
  document.querySelector("#motivo-input").value = "ALA-ALA";
  App.buscarMotivo();
  assert(App.estado.ultimoMotivo && App.estado.ultimoMotivo.ocorrencias[0].cadeia === "B", "sem PDB a busca usa os resíduos lidos e acha ALA-ALA na cadeia B");
  assert(/mmCIF|texto CIF/.test(document.querySelector("#motivo-resultado").textContent), "a busca sem PDB declara a fonte");
}

function testeTextosPublicos() {
  const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../docs/style.css"), "utf8");
  assert(html.includes("O drugScore e o volume são descritores geométricos da cavidade, não previsão de ligação."), "o aviso de drugScore permanece");
  assert(html.includes("Allison Gustavo Braz") && html.includes("Roosevelt Alves da Silva"), "os créditos do rodapé permanecem");
  assert(html.includes("PPGCAS"), "o programa de pós-graduação permanece");
  assert(html.includes("sequência curta de resíduos"), "a aba Motivos define o que é motivo");
  assert(html.includes("exata e contígua"), "a aba explica a janela");
  assert(html.includes("Não é motivo estrutural"), "a diferença para motivo estrutural, sítio e pocket está na aba");
  assert(css.includes(".cadeia-3d:focus-visible") && css.includes(".motivo-chip:focus-visible"), "foco visível dos controles novos");
  assert(css.includes(".cadeia-item.oculta") && css.includes("min-height: 44px"), "estado oculto e alvo de toque");
  assert(css.includes('[data-escopo="todas"]') && css.includes('[data-escopo="cadeia"]'), "os dois escopos de aminoácidos têm estilo próprio");
  const motivos = html.slice(html.indexOf('id="tab-motivos"'), html.indexOf('id="tab-pockets"'));
  assert(!motivos.includes("NLRP3"), "a aba Motivos não usa exemplo de nome de proteína");
}

async function main() {
  testeConsolidacaoNaoInventa();
  testeCatalogoEValidacao();
  testeCadeiasVisibilidade();
  testeMuitasCadeiasESemId();
  await testeAminoacidosEscopo();
  testeMotivosUi();
  testeTextosPublicos();
  if (falhas) {
    console.error(falhas + " falha(s), " + ok + " ok");
    process.exit(1);
  }
  console.log(ok + " asserções ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
