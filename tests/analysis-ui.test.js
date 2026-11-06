// Interface da comparação guardada: importação, limites, XSS e relatório.
"use strict";

const AnalysisSnapshot = require("../docs/analysis-snapshot.js");

let falhas = 0;
let ok = 0;
function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}

function escapar(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

class El {
  constructor(tag) {
    this.tag = tag || "div";
    this.id = "";
    this.className = "";
    this.type = "";
    this.hidden = false;
    this.checked = false;
    this.value = "";
    this.files = [];
    this.children = [];
    this.listeners = {};
    this._text = "";
  }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join("");
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  get innerHTML() {
    if (this.children.length) return this.children.map((c) => c.outerHTML).join("");
    return escapar(this._text);
  }
  get outerHTML() {
    return "<" + this.tag + ">" + this.innerHTML + "</" + this.tag + ">";
  }
  appendChild(filho) {
    filho.parent = this;
    this.children.push(filho);
    return filho;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  addEventListener(tipo, fn) { (this.listeners[tipo] ||= []).push(fn); }
  click() {
    for (const fn of this.listeners.click || []) fn({ target: this, currentTarget: this });
  }
  get options() { return this.children.filter((c) => c.tag === "option"); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const tag = sel.replace(/^[.#]/, "");
    const porTag = !sel.startsWith("#") && !sel.startsWith(".");
    const achados = [];
    const visita = (no) => {
      if (sel.startsWith("#") && no.id === tag) achados.push(no);
      else if (sel.startsWith(".") && no.className.split(/\s+/).includes(tag)) achados.push(no);
      else if (porTag && no.tag === tag) achados.push(no);
      for (const f of no.children) visita(f);
    };
    visita(this);
    return achados;
  }
}

const registro = new Map();
function registrar(id, tag) {
  const el = new El(tag || "div");
  el.id = id;
  registro.set(id, el);
  return el;
}

const document = {
  readyState: "complete",
  body: new El("body"),
  addEventListener() {},
  createElement(tag) { return new El(tag); },
  getElementById(id) { return registro.get(id) || null; },
};
global.document = document;
global.window = global;
global.URL = { createObjectURL() { return "blob:teste"; }, revokeObjectURL() {} };
global.Blob = class Blob { constructor(partes) { this.partes = partes; } };

[
  ["btn-abrir-analises", "button"],
  ["analises", "main"],
  ["entrada", "section"],
  ["workspace", "main"],
  ["comparacao", "main"],
  ["ensemble", "main"],
  ["an-arquivo", "input"],
  ["an-erro", "p"],
  ["an-lista", "div"],
  ["an-ficha", "div"],
  ["an-contagem", "p"],
  ["an-limpar", "button"],
  ["an-regiao", "input"],
  ["an-regiao-essencial", "input"],
  ["an-componente", "input"],
  ["an-componente-elim", "input"],
  ["an-pocket-elim", "input"],
  ["an-peso-cobertura", "input"],
  ["an-peso-qualidade", "input"],
  ["an-peso-componente", "input"],
  ["an-peso-pocket", "input"],
  ["an-atualizar", "button"],
  ["an-resultado", "div"],
  ["an-escolha", "select"],
  ["an-justificativa", "textarea"],
  ["an-registrar", "button"],
  ["an-escolha-status", "p"],
  ["an-md", "button"],
  ["an-json", "button"],
].forEach(([id, tag]) => registrar(id, tag));
document.getElementById("an-peso-cobertura").value = "0";
document.getElementById("an-peso-qualidade").value = "0";
document.getElementById("an-peso-componente").value = "0";
document.getElementById("an-peso-pocket").value = "1";
document.getElementById("an-erro").hidden = true;

global.AnalysisSnapshot = AnalysisSnapshot;
const AnalysisUI = require("../docs/analysis-ui.js");

function snap(id, rotulo, drug) {
  return {
    schema: "peki-analise-1",
    versaoApp: "peki-fold-web",
    geradoEm: "2026-11-06T12:00:00.000Z",
    id, rotulo,
    origem: {
      tipo: "arquivo", pdbId: null, nomeArquivo: "sintetico.pdb", formato: "pdb",
      fonte: "dados sintéticos de teste", url: null, titulo: rotulo, metodo: "X-RAY DIFFRACTION",
      resolucaoArquivo: null, sintetico: true, nota: "sintético",
    },
    modelo: { selecionado: 1, total: 1, criterio: "fixture" },
    cadeias: [{ id: "A", auth: "A", label: "A", sequencia: "A", residuos: [{ resname: "ALA", seq: 1, icode: "", classe: "proteina" }] }],
    cobertura: { polimerosModelados: 1 },
    lacunas: { determinado: true, resumo: "fixture", naoResolvidos: [], saltosNumeracao: [], foraDoConstructo: "não" },
    componentes: {
      proteinas: { posicoes: 1, padrao: 1, modificadas: 0 }, hetero: [], ions: [], modificados: [],
      aguas: { instancias: 0, nota: "fixture" }, holo: { estado: "nao_determinado", motivo: "não prova holo" },
      anotacoesCcd: [], ccdEstado: "nao_consultado",
    },
    qualidade: { estado: "ausente", motivo: null, classe: null, consulta: null, fonte: null, metricas: [], omitidos: [], local: { estado: "ausente", motivo: null } },
    pockets: {
      estado: "ok", motivo: null, fonte: "DoGSiteScorer/ProteinsPlus", aviso: "não é sítio",
      itens: [{ name: "P_0", volume: 1, surface: 1, depth: 1, hydrophobicity: 0, drugScore: drug }],
    },
    preparo: { estado: "nao_calculado", motivo: null, versao: null, predita: null, contagens: null, selecao: null, anotacoes: null, caixaVina: null },
    uniprot: { correspondenciaResiduo: "nao_estabelecida", motivo: "fixture", declaracoes: [] },
    anotacoes: { motivoSequencia: null },
    limitacoes: ["fixture sintética"],
  };
}

function testeFluxo() {
  AnalysisUI.abrir();
  assert(document.getElementById("analises").hidden === false, "abre o painel");
  assert(document.getElementById("entrada").hidden === true, "a entrada sai");
  const xss = snap("SIN-XSS", "<img src=x onerror=alert(1)>", 0.2);
  let r = AnalysisUI.importarTexto("xss.json", JSON.stringify(xss));
  assert(r.ok, "importa rótulo hostil");
  const lista = document.getElementById("an-lista");
  assert(lista.querySelector("img") == null, "o rótulo não vira elemento");
  assert(!lista.innerHTML.includes("<img"), "o HTML da lista escapa o sinal de tag");
  assert(lista.textContent.includes("<img src=x onerror=alert(1)>"), "o texto hostil continua visível como texto");
  document.getElementById("an-atualizar").click();
  assert(/2 a 5/.test(document.getElementById("an-erro").textContent), "uma análise é recusada na interface");
  assert(document.getElementById("an-resultado").textContent.includes("2 a 5") || document.getElementById("an-erro").textContent.includes("1"), "a mensagem cita a contagem");

  r = AnalysisUI.importarTexto("b.json", JSON.stringify(snap("SIN-B", "SIN-B", 0.9)));
  assert(r.ok, "a segunda entra");
  document.getElementById("an-peso-pocket").value = "1";
  document.getElementById("an-peso-cobertura").value = "0";
  document.getElementById("an-atualizar").click();
  const primeiro = AnalysisUI.resultado();
  assert(primeiro.ranqueado && primeiro.lideres[0].id === "SIN-B", "a interface ranqueia dois candidatos");
  assert(document.getElementById("an-resultado").textContent.includes("SIN-B"), "a tabela mostra o líder em texto");
  const baixo = document.getElementById("an-escolha");
  baixo.value = "SIN-XSS";
  document.getElementById("an-justificativa").value = "x";
  document.getElementById("an-registrar").click();
  assert(/justificativa/.test(document.getElementById("an-escolha-status").textContent), "justificativa curta é recusada");
  document.getElementById("an-justificativa").value = "Prefiro o descritor menor nesta pergunta sintética.";
  document.getElementById("an-registrar").click();
  const md = AnalysisUI.exportar("md");
  const json = AnalysisUI.exportar("json");

  document.getElementById("an-peso-pocket").value = "0";
  document.getElementById("an-peso-cobertura").value = "1";
  document.getElementById("an-atualizar").click();
  const segundo = AnalysisUI.resultado();
  assert(segundo.ranqueado && segundo.empateNoTopo, "peso zero no pocket e cobertura igual empatam");
  assert(segundo.mudanca && /mudou|permanece|empate/i.test(segundo.mudanca + segundo.motivo), "a mudança de critério é explicada: " + segundo.mudanca);
  assert(md.includes("Prefiro o descritor menor"), "o Markdown leva a justificativa da tela");
  assert(md.includes("SIN-B") && md.includes(segundo.candidatos[0].rotulo), "o Markdown lista as análises da tela");
  assert(md.includes("<img src=x onerror=alert(1)>"), "o Markdown guarda o texto, sem executá-lo");
  assert(JSON.parse(json).escolha.rotulo.includes("<img"), "o JSON estruturado guarda a mesma escolha");

  for (let i = 0; i < 3; i++) {
    const id = "SIN-" + i;
    const imp = AnalysisUI.importarTexto(id + ".json", JSON.stringify(snap(id, id, 0.3 + i / 10)));
    assert(imp.ok, "entra a análise " + id);
  }
  assert(AnalysisUI.itens().length === 5, "cinco análises na interface");
  const sexta = AnalysisUI.importarTexto("SIN-6.json", JSON.stringify(snap("SIN-6", "SIN-6", 0.1)));
  assert(!sexta.ok && AnalysisUI.itens().length === 5, "a sexta é recusada na interface");
  assert(/5/.test(document.getElementById("an-erro").textContent), "a mensagem da sexta é visível");
  document.getElementById("an-atualizar").click();
  assert(AnalysisUI.resultado().candidatos.length === 5, "o ranking aceita as cinco");
  AnalysisUI.limpar();
  assert(AnalysisUI.itens().length === 0, "limpar esvazia a comparação local");
}

function testeWorkspace() {
  let erro = "";
  try {
    AnalysisUI.guardarWorkspace({ estrutura: null }, () => {});
  } catch (e) { erro = e.message; }
  assert(/leitura estrutural/.test(erro), "guardar sem estrutura explica o motivo");
}

testeFluxo();
testeWorkspace();
if (falhas) {
  console.error(falhas + " falha(s), " + ok + " ok");
  process.exit(1);
}
console.log(ok + " asserções ok");
