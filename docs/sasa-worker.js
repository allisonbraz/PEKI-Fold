// Worker da exposição ao solvente. O cálculo pesado fica fora da página.
"use strict";

importScripts("sasa.js");

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.tipo !== "calcular") return;
  const api = self.Sasa;
  try {
    const resultado = api.calcularExposicao(msg.texto, {
      formato: msg.formato,
      passo: 200,
      onProgresso(feito, total) {
        self.postMessage({ tipo: "progresso", id: msg.id, feito, total });
      },
    });
    self.postMessage({ tipo: "resultado", id: msg.id, resultado });
  } catch (err) {
    self.postMessage({
      tipo: "erro",
      id: msg.id,
      mensagem: err && err.message ? err.message : "Falha no cálculo da exposição.",
    });
  }
};
