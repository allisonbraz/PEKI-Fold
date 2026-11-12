"use strict";

// Bibliotecas grandes só na hora do uso. O parser da entrada não espera por elas.
const PEKI_LIBS = {
  mol: "https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.4.0/3Dmol-min.js",
  plotly: "https://cdn.plot.ly/plotly-2.35.2.min.js",
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  autotable: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
};
const pekiScript = new Map();
function carregarScript(src) {
  if (pekiScript.has(src)) return pekiScript.get(src);
  const prom = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    let encerrado = false;
    const falhar = (e) => {
      if (encerrado) return;
      encerrado = true;
      prazo.fim();
      pekiScript.delete(src);
      reject(e);
    };
    const prazo = PekiRede.iniciarPrazo((e) => {
      if (s.remove) s.remove();
      falhar(e);
    });
    s.onload = () => { if (!encerrado) { encerrado = true; prazo.fim(); resolve(); } };
    s.onerror = () => falhar(new Error("Não foi possível carregar uma biblioteca externa. Verifique a conexão e tente de novo."));
    document.head.appendChild(s);
  });
  pekiScript.set(src, prom);
  return prom;
}
function lib3D() {
  if (window.$3Dmol) return Promise.resolve();
  return carregarScript(PEKI_LIBS.mol);
}
function libPlotly() {
  if (window.Plotly) return Promise.resolve();
  return carregarScript(PEKI_LIBS.plotly);
}
function libPdf() {
  const pronto = window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF.API.autoTable === "function";
  if (pronto) return Promise.resolve();
  return carregarScript(PEKI_LIBS.jspdf).then(() => carregarScript(PEKI_LIBS.autotable));
}
window.pekiCarregarPdf = libPdf;
