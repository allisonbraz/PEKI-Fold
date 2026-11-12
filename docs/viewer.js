"use strict";

const CORES_CADEIA = [
  "#2a5599", "#e8513a", "#2ea05a", "#9b59b6", "#e0a800",
  "#17a2b8", "#d63384", "#fd7e14", "#20c997", "#6610f2",
];

// ----- viewer 3D -----
function renderViewer() {
  syncTamViewer();
  const div = $("#viewer");
  div.innerHTML = "";
  estado.viewer = $3Dmol.createViewer(div, { backgroundColor: "#0b1020" });
  estado.viewer.addModel(estado.textoViewer || estado.pdbText, estado.viewerFormato || "pdb");
  $("#lig-controle").hidden = !(estado.meta?.ligantes?.length);
  $("#surf-toggle").checked = false;
  aplicarEstilo();
  estado.viewer.zoomTo();
  estado.viewer.render();
}

function selCadeia(cid) {
  return cid === "_" ? { chain: "" } : { chain: cid };
}

function idCadeiaSelecao(chain) {
  return chain == null || chain === "" ? "_" : chain;
}

function cadeiaOcultaNo3D(cid) {
  if (!estado.cadeiasOcultas || cid == null) return false;
  return estado.cadeiasOcultas.has(idCadeiaSelecao(cid));
}

function algumaCadeiaOculta() {
  return !!(estado.cadeiasOcultas && estado.cadeiasOcultas.size);
}

function copiarSel(sel) {
  const copia = { ...sel };
  if (Array.isArray(sel.resi)) copia.resi = sel.resi.slice();
  return copia;
}

// Sem cadeia oculta, a seleção original segue intacta (superfície da proteína continua [{}]).
function selsVisiveis(sels) {
  if (!sels || !algumaCadeiaOculta()) return sels || [];
  const out = [];
  for (const sel of sels) {
    if (!sel || Object.keys(sel).length === 0) {
      for (const cid of estado.dados.cadeias) {
        if (!cadeiaOcultaNo3D(cid)) out.push(selCadeia(cid));
      }
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(sel, "chain")) {
      out.push(copiarSel(sel));
      continue;
    }
    if (cadeiaOcultaNo3D(sel.chain)) continue;
    out.push(copiarSel(sel));
  }
  return out;
}

function ocorrenciasVisiveis(ocorrencias) {
  if (!ocorrencias || !algumaCadeiaOculta()) return ocorrencias || [];
  return ocorrencias.filter((oc) => !cadeiaOcultaNo3D(oc.cadeia));
}

function pintarLigantes() {
  const v = estado.viewer;
  if (!v) return;
  const ligs = (estado.meta?.ligantes || []).map((l) => l.id);
  if (ligs.length && $("#lig-toggle")?.checked) {
    v.setStyle({ resn: ligs }, { stick: { radius: 0.18 }, sphere: { scale: 0.28 } });
  }
}

function aplicarEstilo() {
  const v = estado.viewer;
  if (!v || !estado.dados) return;
  const estilo = ($("#estilo-3d") && $("#estilo-3d").value) || "cartoon";
  v.setStyle({}, {});
  for (const cid of estado.dados.cadeias) {
    if (cadeiaOcultaNo3D(cid)) continue;
    const spec = {};
    spec[estilo] = { color: estado.corPorCadeia[cid] };
    v.setStyle(selCadeia(cid), spec);
  }
  pintarLigantes();
  v.render();
  if (typeof PrepUI !== "undefined") PrepUI.aposEstilo(estado);
  // A ficha pode redesenhar átomo de cadeia oculta. O estilo vazio tira esse desenho;
  // o controle de ligantes é reaplicado em seguida e não depende da cadeia.
  let limpou = false;
  for (const cid of estado.dados.cadeias) {
    if (!cadeiaOcultaNo3D(cid)) continue;
    v.setStyle(selCadeia(cid), {});
    limpou = true;
  }
  if (limpou) {
    pintarLigantes();
    v.render();
  }
}

// Estilo, ligantes e preparo continuam valendo com um pocket aberto.
// Trocar o estilo tira o amarelo do motivo, como antes. Não mexe nas cadeias ocultas.
function aplicarEstiloMantendoPocket() {
  const vista = estado.vistaPocket && estado.vistaPocket.visivel ? estado.vistaPocket : null;
  if (vista) vista.motivoPorCima = null;
  estado.motivoNo3D = null;
  aplicarEstilo();
  if (!vista || estado.vistaPocket !== vista || !vista.sels) return;
  pintarResiduosPocket(vista.sels);
}

// Ocultar cadeia redesenha o que já estava ligado, sem apagar o estado dessas camadas.
function aplicarVisaoCadeias() {
  aplicarEstilo();
  const vista = estado.vistaPocket && estado.vistaPocket.visivel ? estado.vistaPocket : null;
  if (vista && vista.sels) pintarResiduosPocket(vista.sels);
  if (estado.motivoNo3D && estado.motivoNo3D.length) pintarMotivo(estado.motivoNo3D);
  aplicarSuperficie();
}

function syncTamViewer() {
  const px = parseInt($("#viewer-tam").value, 10) || 460;
  const viewer = $("#viewer");
  viewer.style.height = `${px}px`;
  viewer.dataset.tam = px >= 620 ? "g" : px <= 360 ? "p" : "m";
  const grid = $("#workspace .ws-grid");
  if (grid) grid.classList.toggle("viewer-largo", viewer.dataset.tam === "g");
}

function ajustarTamViewer() {
  syncTamViewer();
  if (estado.viewer) { estado.viewer.resize(); estado.viewer.render(); }
}

function marcarTamCmp(px) {
  const card = document.querySelector(".cmp-estruturas");
  if (card) card.dataset.tam = px >= 380 ? "g" : px <= 180 ? "p" : "m";
}

// Superfície molecular: estado.superficie = null | { sels:[...], color, opacity }.
// sels é uma lista de seleções (toda a proteína = [{}]; pocket = uma por cadeia).
function aplicarSuperficie() {
  const v = estado.viewer;
  if (!v) return;
  v.removeAllSurfaces();
  const s = estado.superficie;
  if (s) {
    for (const sel of selsVisiveis(s.sels)) {
      try {
        const p = v.addSurface($3Dmol.SurfaceType.SAS, { opacity: s.opacity, color: s.color }, sel);
        if (p && p.then) p.then(() => v.render());
      } catch (e) { /* ignora falhas de geração de superfície */ }
    }
  }
  v.render();
}

function destacarMotivo(ocorrencias) {
  const v = estado.viewer;
  if (!v) return;
  estado.motivoNo3D = ocorrencias;
  if (estado.vistaPocket && estado.vistaPocket.visivel) estado.vistaPocket.motivoPorCima = ocorrencias;
  aplicarEstilo();
  pintarMotivo(ocorrencias);
}

function pintarMotivo(ocorrencias) {
  const v = estado.viewer;
  if (!v || !ocorrencias) return;
  for (const oc of ocorrenciasVisiveis(ocorrencias)) {
    const sel = { chain: oc.cadeia === "_" ? "" : oc.cadeia, resi: oc.residuos.map(Number) };
    v.setStyle(sel, { stick: { color: "yellow" }, sphere: { color: "yellow", radius: 0.5 } });
  }
  v.render();
}

// Um pocket por vez. O botão 3D alterna mostrar/ocultar; outro pocket substitui o atual.
let geracaoVistaPocket = 0;

function invalidarVistaPocket() {
  geracaoVistaPocket += 1;
  estado.vistaPocket = null;
  sincronizarBotoesPocket();
}

function vistaPocketCobre(idx) {
  return !!(estado.vistaPocket && estado.vistaPocket.idx === idx);
}

function htmlBotaoPocket3d(p, i) {
  if (!p.residuosUrl) return "—";
  const ativo = vistaPocketCobre(i);
  const texto = ativo ? "👁 ocultar" : "👁 ver";
  const label = esc(ativo ? `Ocultar ${p.name} no 3D` : `Mostrar ${p.name} no 3D`);
  return `<button type="button" class="link-btn pocket-3d${ativo ? " ativo" : ""}" data-idx="${i}" aria-pressed="${ativo ? "true" : "false"}" aria-label="${label}">${texto}</button>`;
}

function sincronizarBotoesPocket() {
  if (!$("#pockets-resultado")) return;
  $$("#pockets-resultado .pocket-3d").forEach((btn) => {
    const i = Number(btn.dataset.idx);
    const p = estado.pockets && estado.pockets[i];
    const ativo = vistaPocketCobre(i);
    const nome = p && p.name ? p.name : "pocket";
    btn.textContent = ativo ? "👁 ocultar" : "👁 ver";
    btn.setAttribute("aria-pressed", ativo ? "true" : "false");
    btn.setAttribute("aria-label", ativo ? `Ocultar ${nome} no 3D` : `Mostrar ${nome} no 3D`);
    btn.classList.toggle("ativo", ativo);
    const tr = btn.closest("tr");
    if (tr) tr.classList.toggle("pocket-visto", ativo);
  });
}

function clonarSuperficie(s) {
  if (!s) return null;
  return {
    sels: (s.sels || []).map((sel) => {
      const copia = { ...sel };
      if (Array.isArray(sel.resi)) copia.resi = sel.resi.slice();
      return copia;
    }),
    color: s.color,
    opacity: s.opacity,
    origem: s.origem || null,
  };
}

function superficieAntesDaVista(anterior) {
  if (anterior && !anterior.superficieUsuario) return clonarSuperficie(anterior.superficieAnterior);
  if (estado.superficie && estado.superficie.origem === "pocket") {
    return anterior ? clonarSuperficie(anterior.superficieAnterior) : null;
  }
  return clonarSuperficie(estado.superficie);
}

function pintarResiduosPocket(sels) {
  const v = estado.viewer;
  if (!v || !sels) return;
  for (const sel of selsVisiveis(sels)) {
    v.setStyle(sel, { stick: { color: "magenta" }, sphere: { color: "magenta", radius: 0.4 } });
  }
  v.render();
}

function selecoesDosResiduos(txt, diagnostico) {
  txt = filtrarResiduosPocket(txt, diagnostico);
  const selPorCadeia = {};
  for (const linha of String(txt).split("\n")) {
    if (!linha.startsWith("ATOM") && !linha.startsWith("HETATM")) continue;
    const cadeia = linha[21].trim() || "";
    const resi = parseInt(linha.slice(22, 26), 10);
    if (Number.isNaN(resi)) continue;
    (selPorCadeia[cadeia] = selPorCadeia[cadeia] || new Set()).add(resi);
  }
  return Object.entries(selPorCadeia).map(([cadeia, resis]) => ({ chain: cadeia, resi: [...resis] }));
}

function vistaAindaVale(geracao, idx) {
  return geracao === geracaoVistaPocket && !!(estado.vistaPocket && estado.vistaPocket.idx === idx);
}

function restaurarSuperficieDaVista(vista) {
  if (!vista || vista.superficieUsuario) return;
  if (!estado.superficie || estado.superficie.origem !== "pocket") return;
  estado.superficie = clonarSuperficie(vista.superficieAnterior);
  const toggle = $("#surf-toggle");
  if (toggle) toggle.checked = !!estado.superficie;
  aplicarSuperficie();
}

function ocultarVistaPocket() {
  const vista = estado.vistaPocket;
  geracaoVistaPocket += 1;
  estado.vistaPocket = null;
  const status = $("#pockets-status");
  if (!vista) {
    sincronizarBotoesPocket();
    return;
  }
  if (!vista.visivel) {
    if (vista.anteriorVista && vista.anteriorVista.visivel) estado.vistaPocket = vista.anteriorVista;
    if (status) {
      status.textContent = estado.vistaPocket
        ? `✓ ${estado.vistaPocket.nome}: resíduos destacados e superfície exibida no 3D.`
        : "";
    }
    sincronizarBotoesPocket();
    return;
  }
  if (estado.viewer) {
    const motivo = vista.motivoPorCima;
    aplicarEstilo();
    if (motivo && motivo.length) pintarMotivo(motivo);
    restaurarSuperficieDaVista(vista);
  }
  if (status) status.textContent = `✓ ${vista.nome} oculto no 3D.`;
  sincronizarBotoesPocket();
}

function aoAlternarSuperficie(ligada) {
  estado.superficie = ligada ? { sels: [{}], color: "#9ec5ff", opacity: 0.65, origem: "proteina" } : null;
  if (estado.vistaPocket) estado.vistaPocket.superficieUsuario = true;
  const toggle = $("#surf-toggle");
  if (toggle) toggle.checked = !!ligada;
  aplicarSuperficie();
}

// Mostra o pocket no 3D, ou oculta se o mesmo botão for clicado de novo.
async function destacarPocket(idx) {
  const p = estado.pockets && estado.pockets[idx];
  const status = $("#pockets-status");
  if (!p || !p.residuosUrl || !estado.viewer) return;
  if (vistaPocketCobre(idx)) {
    ocultarVistaPocket();
    return;
  }

  const geracao = ++geracaoVistaPocket;
  const anterior = estado.vistaPocket;
  estado.vistaPocket = {
    idx,
    nome: p.name,
    visivel: false,
    sels: null,
    superficieAnterior: superficieAntesDaVista(anterior),
    superficieUsuario: false,
    motivoPorCima: null,
    anteriorVista: anterior && anterior.visivel ? anterior : null,
  };
  sincronizarBotoesPocket();
  if (status) status.innerHTML = `<span class="spinner"></span> Carregando resíduos do ${esc(p.name)}…`;
  try {
    const txt = await (await fetch(p.residuosUrl)).text();
    if (!vistaAindaVale(geracao, idx)) return;
    const diagnostico = {};
    const sels = selecoesDosResiduos(txt, diagnostico);
    if (!sels.length && diagnostico.descartadas) throw new Error("Nenhum resíduo válido no arquivo do pocket." + avisoLinhasPocket(diagnostico.descartadas));
    if (!vistaAindaVale(geracao, idx)) return;
    aplicarEstilo();
    estado.vistaPocket.sels = sels;
    estado.vistaPocket.visivel = true;
    pintarResiduosPocket(sels);
    estado.superficie = { sels, color: "#ff5cd0", opacity: 0.8, origem: "pocket", idx };
    const toggle = $("#surf-toggle");
    if (toggle) toggle.checked = true;
    aplicarSuperficie();
    if (status) status.textContent = `✓ ${p.name}: resíduos destacados e superfície exibida no 3D.` + avisoLinhasPocket(diagnostico.descartadas);
    sincronizarBotoesPocket();
  } catch (e) {
    if (geracao !== geracaoVistaPocket) return;
    const falha = estado.vistaPocket;
    estado.vistaPocket = falha && falha.anteriorVista ? falha.anteriorVista : null;
    sincronizarBotoesPocket();
    if (status) status.innerHTML = `❌ Falha ao destacar o pocket: ${e.message}`;
  }
}

// Viewers 3D (um por proteína) no modo comparação, coloridos por cadeia.
function renderCmpViewers() {
  const cont = $("#cmp-viewers");
  cont.innerHTML = "";
  estado.cmpViewers = [];
  const h = parseInt($("#cmp-tam").value, 10);
  marcarTamCmp(h);
  for (const p of estado.comparacao) {
    const card = document.createElement("div");
    card.className = "cmp-viewer-item";
    card.innerHTML = `<div class="cmp-viewer-label">${p.id}</div><div class="cmp-viewer" style="height:${h}px"></div>`;
    cont.appendChild(card);
    const div = card.querySelector(".cmp-viewer");
    const v = $3Dmol.createViewer(div, { backgroundColor: "#0b1020" });
    v.addModel(p.pdbText, "pdb");
    p.dados.cadeias.forEach((cid, i) => {
      const sel = cid === "_" ? { chain: "" } : { chain: cid };
      v.setStyle(sel, { cartoon: { color: CORES_CADEIA[i % CORES_CADEIA.length] } });
    });
    v.zoomTo();
    v.render();
    estado.cmpViewers.push({ v, div });
  }
}

function ajustarTamCmp() {
  const h = parseInt($("#cmp-tam").value, 10);
  marcarTamCmp(h);
  for (const { v, div } of estado.cmpViewers || []) {
    div.style.height = `${h}px`;
    v.resize();
    v.render();
  }
}

function imgViewer() {
  try { return estado.viewer ? estado.viewer.pngURI() : null; } catch (e) { return null; }
}
