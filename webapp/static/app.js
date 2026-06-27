// ProtAnalyzer - frontend (MVP)
// Conecta a tela de entrada, o viewer 3D (3Dmol.js), as abas de analise
// e os graficos (Plotly) ao backend FastAPI.

"use strict";

// Cores por cadeia (consistentes entre viewer e tabelas)
const CORES_CADEIA = [
  "#2a5599", "#e8513a", "#2ea05a", "#9b59b6", "#e0a800",
  "#17a2b8", "#d63384", "#fd7e14", "#20c997", "#6610f2",
];

// Estado da sessao atual
const estado = {
  pdbText: null,
  nome: null,
  dados: null,
  viewer: null,
  corPorCadeia: {},
};

// ----- utilidades de DOM -----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function mostrarErro(msg) {
  const el = $("#erro");
  el.textContent = msg;
  el.hidden = false;
}
function limparErro() { $("#erro").hidden = true; }
function setLoading(on) { $("#loading").hidden = !on; }

// ----- chamada de analise -----
async function analisar({ pdbId, file }) {
  limparErro();
  setLoading(true);
  try {
    const fd = new FormData();
    if (file) fd.append("file", file);
    if (pdbId) fd.append("pdb_id", pdbId);

    const resp = await fetch("/api/analyze", { method: "POST", body: fd });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "Erro desconhecido" }));
      throw new Error(err.detail || "Falha na analise");
    }
    const dados = await resp.json();
    iniciarWorkspace(dados);
  } catch (e) {
    mostrarErro(e.message);
  } finally {
    setLoading(false);
  }
}

// ----- workspace -----
function iniciarWorkspace(dados) {
  estado.pdbText = dados.pdb_text;
  estado.nome = dados.nome;
  estado.dados = dados;

  // mapeia cor para cada cadeia
  estado.corPorCadeia = {};
  dados.cadeias.forEach((cid, i) => {
    estado.corPorCadeia[cid] = CORES_CADEIA[i % CORES_CADEIA.length];
  });

  $("#entrada").hidden = true;
  $("#workspace").hidden = false;
  $("#ws-nome").textContent = dados.nome;

  const st = dados.estatisticas;
  const nCad = dados.cadeias.length;
  const totalRes = st.cadeias.reduce((s, c) => s + c.residuos, 0);
  $("#ws-resumo").textContent =
    `${nCad} cadeia(s) · ${totalRes} resíduos no total`;

  renderViewer();
  renderCadeias();
  renderStats();
  renderAA();
  $("#motivo-resultado").innerHTML = "";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ----- viewer 3D -----
function renderViewer() {
  const div = $("#viewer");
  div.innerHTML = "";
  estado.viewer = $3Dmol.createViewer(div, { backgroundColor: "#0b1020" });
  const v = estado.viewer;
  v.addModel(estado.pdbText, "pdb");
  aplicarEstilo();
  v.zoomTo();
  v.render();
}

function aplicarEstilo() {
  const v = estado.viewer;
  if (!v) return;
  const estilo = $("#estilo-3d").value;
  v.setStyle({}, {}); // limpa
  for (const cid of estado.dados.cadeias) {
    const cor = estado.corPorCadeia[cid];
    const sel = cid === "_" ? { chain: "" } : { chain: cid };
    const spec = {};
    spec[estilo] = { color: cor };
    v.setStyle(sel, spec);
  }
  v.render();
}

function destacarMotivo(ocorrencias) {
  const v = estado.viewer;
  if (!v) return;
  aplicarEstilo(); // reseta
  for (const oc of ocorrencias) {
    const sel = { chain: oc.cadeia === "_" ? "" : oc.cadeia, resi: oc.residuos.map(Number) };
    v.setStyle(sel, { stick: { color: "yellow" }, sphere: { color: "yellow", radius: 0.5 } });
  }
  v.render();
}

// ----- aba: cadeias (Programa 01) -----
function renderCadeias() {
  const cont = $("#tab-cadeias");
  const leg = $("#cadeias-legenda");
  cont.innerHTML = "";
  leg.innerHTML = "";

  for (const c of estado.dados.estatisticas.cadeias) {
    const cor = estado.corPorCadeia[c.cadeia] || "#888";

    // legenda no viewer
    const item = document.createElement("span");
    item.className = "item";
    item.innerHTML = `<span class="swatch" style="background:${cor}"></span> Cadeia ${c.cadeia}`;
    leg.appendChild(item);

    // item na lista
    const div = document.createElement("div");
    div.className = "cadeia-item";
    div.innerHTML = `
      <div class="info">
        <span class="swatch" style="background:${cor}"></span>
        <div>
          <strong>Cadeia ${c.cadeia}</strong>
          <div class="muted small">${c.residuos} resíduos · ${c.atomos} átomos</div>
        </div>
      </div>
      <button class="dl-btn" data-chain="${c.cadeia}">⬇ Baixar PDB</button>`;
    cont.appendChild(div);
  }

  $$("#tab-cadeias .dl-btn").forEach((btn) => {
    btn.addEventListener("click", () => baixarCadeia(btn.dataset.chain));
  });
}

async function baixarCadeia(chain) {
  const fd = new FormData();
  fd.append("chain", chain);
  fd.append("file", new Blob([estado.pdbText], { type: "text/plain" }), estado.nome);
  const resp = await fetch("/api/chain", { method: "POST", body: fd });
  if (!resp.ok) { alert("Erro ao gerar a cadeia."); return; }
  const texto = await resp.text();
  const base = estado.nome.replace(/\.[^.]+$/, "");
  baixarArquivo(`${chain}_${base}.pdb`, texto);
}

function baixarArquivo(nome, conteudo) {
  const blob = new Blob([conteudo], { type: "chemical/x-pdb" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

// ----- aba: estatisticas (Programa 03) -----
function renderStats() {
  const st = estado.dados.estatisticas;
  const cont = $("#tab-stats");

  const totalAt = st.cadeias.reduce((s, c) => s + c.atomos, 0);
  const totalRes = st.cadeias.reduce((s, c) => s + c.residuos, 0);

  let html = `
    <div class="resumo-cards">
      <div class="resumo-card"><div class="num">${st.cadeias.length}</div><div class="lbl">cadeias</div></div>
      <div class="resumo-card"><div class="num">${totalAt}</div><div class="lbl">átomos</div></div>
      <div class="resumo-card"><div class="num">${totalRes}</div><div class="lbl">resíduos</div></div>
    </div>
    <table><thead><tr>
      <th>Cadeia</th><th>Átomos</th><th>Resíduos</th><th>Aa diferentes</th>
    </tr></thead><tbody>`;

  for (const c of st.cadeias) {
    let cls = "";
    if (st.maior && c.cadeia === st.maior.cadeia) cls = "destaque-maior";
    if (st.menor && c.cadeia === st.menor.cadeia && st.maior.cadeia !== st.menor.cadeia) cls = "destaque-menor";
    html += `<tr class="${cls}"><td><strong>${c.cadeia}</strong></td><td>${c.atomos}</td><td>${c.residuos}</td><td>${c.aminoacidos_diferentes}</td></tr>`;
  }
  html += `</tbody></table>`;

  if (st.maior && st.menor) {
    html += `<p class="muted small" style="margin-top:10px">
      🟢 Maior: cadeia ${st.maior.cadeia} (${st.maior.residuos} resíduos) ·
      🔴 Menor: cadeia ${st.menor.cadeia} (${st.menor.residuos} resíduos)</p>`;
  }
  cont.innerHTML = html;
}

// ----- aba: aminoacidos (Programa 04) -----
function renderAA() {
  const sel = $("#aa-cadeia");
  sel.innerHTML = "";
  for (const cid of estado.dados.cadeias) {
    const opt = document.createElement("option");
    opt.value = cid;
    opt.textContent = `Cadeia ${cid}`;
    sel.appendChild(opt);
  }
  sel.onchange = plotAA;
  plotAA();
}

function plotAA() {
  const cid = $("#aa-cadeia").value;
  const freq = estado.dados.frequencias[cid];
  if (!freq) return;

  const x = freq.itens.map((i) => i.aa);
  const y = freq.itens.map((i) => i.porcentagem);
  const cor = estado.corPorCadeia[cid] || "#2a5599";
  const escuro = document.body.dataset.theme === "dark";

  Plotly.newPlot("aa-grafico", [{
    x, y, type: "bar", marker: { color: cor },
    hovertemplate: "%{x}: %{y}%<extra></extra>",
  }], {
    title: `Frequência de aminoácidos — cadeia ${cid}`,
    xaxis: { title: "Aminoácido" },
    yaxis: { title: "Porcentagem (%)" },
    margin: { t: 40, r: 10, b: 50, l: 50 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { color: escuro ? "#e7edf7" : "#1c2433" },
  }, { responsive: true, displayModeBar: false });
}

// ----- aba: motivos (Programa 05) -----
async function buscarMotivo() {
  const valor = $("#motivo-input").value.trim();
  const cont = $("#motivo-resultado");
  if (!valor) { cont.innerHTML = `<p class="muted">Digite um motivo.</p>`; return; }

  const fd = new FormData();
  fd.append("motif", valor);
  fd.append("file", new Blob([estado.pdbText], { type: "text/plain" }), estado.nome);

  cont.innerHTML = `<p class="muted">Buscando…</p>`;
  const resp = await fetch("/api/motif", { method: "POST", body: fd });
  if (!resp.ok) { cont.innerHTML = `<p class="erro">Erro na busca.</p>`; return; }
  const dados = await resp.json();

  if (!dados.ocorrencias.length) {
    cont.innerHTML = `<p class="muted">Nenhuma ocorrência de <code>${dados.motivo.join("-")}</code>.</p>`;
    aplicarEstilo();
    return;
  }

  let html = `<p><strong>${dados.ocorrencias.length}</strong> ocorrência(s) de <code>${dados.motivo.join("-")}</code>:</p>`;
  for (const oc of dados.ocorrencias) {
    html += `<div class="ocorrencia">Cadeia <strong>${oc.cadeia}</strong> · posição <strong>${oc.posicao}</strong> (resíduos ${oc.residuos.join(", ")})</div>`;
  }
  html += `<p class="muted small">Resíduos destacados em amarelo no viewer 3D.</p>`;
  cont.innerHTML = html;

  destacarMotivo(dados.ocorrencias);
}

// ----- troca de abas -----
function trocarAba(nome) {
  $$(".aba").forEach((a) => a.classList.toggle("ativa", a.dataset.tab === nome));
  $$(".aba-conteudo").forEach((c) => (c.hidden = c.id !== `tab-${nome}`));
  if (nome === "aa") setTimeout(() => Plotly.Plots.resize("aa-grafico"), 50);
}

// ----- tema -----
function alternarTema() {
  const atual = document.body.dataset.theme === "dark" ? "" : "dark";
  document.body.dataset.theme = atual;
  $("#theme-toggle").textContent = atual === "dark" ? "☀️" : "🌙";
  if (estado.dados) plotAA();
}

// ----- inicializacao -----
function init() {
  // entrada por ID
  $("#btn-id").addEventListener("click", () => {
    const id = $("#pdb-id").value.trim();
    if (!id) { mostrarErro("Informe um ID de PDB."); return; }
    analisar({ pdbId: id });
  });
  $("#pdb-id").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-id").click(); });

  // exemplos
  $$(".chip").forEach((c) => c.addEventListener("click", () => analisar({ pdbId: c.dataset.id })));

  // upload
  $("#btn-file").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (e) => {
    if (e.target.files.length) analisar({ file: e.target.files[0] });
  });
  const dz = $("#dropzone");
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("hover"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("hover"); }));
  dz.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) analisar({ file: e.dataTransfer.files[0] });
  });

  // workspace
  $("#btn-novo").addEventListener("click", () => {
    $("#workspace").hidden = true;
    $("#entrada").hidden = false;
    $("#pdb-id").value = "";
    $("#file-input").value = "";
  });
  $$(".aba").forEach((a) => a.addEventListener("click", () => trocarAba(a.dataset.tab)));
  $("#estilo-3d").addEventListener("change", aplicarEstilo);
  $("#spin").addEventListener("change", (e) => { if (estado.viewer) { estado.viewer.spin(e.target.checked ? "y" : false); } });
  $("#btn-motivo").addEventListener("click", buscarMotivo);
  $("#motivo-input").addEventListener("keydown", (e) => { if (e.key === "Enter") buscarMotivo(); });

  $("#theme-toggle").addEventListener("click", alternarTema);
}

document.addEventListener("DOMContentLoaded", init);
