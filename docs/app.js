// ProtAnalyzer - frontend estatico (GitHub Pages).
// Toda a analise roda no navegador (ProtAnalysis). Nao ha backend:
// - upload e lido com FileReader;
// - busca por ID baixa o PDB direto do RCSB (CORS habilitado).

"use strict";

const CORES_CADEIA = [
  "#2a5599", "#e8513a", "#2ea05a", "#9b59b6", "#e0a800",
  "#17a2b8", "#d63384", "#fd7e14", "#20c997", "#6610f2",
];

const estado = {
  pdbText: null,
  nome: null,
  dados: null,
  viewer: null,
  corPorCadeia: {},
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function mostrarErro(msg) { const el = $("#erro"); el.textContent = msg; el.hidden = false; }
function limparErro() { $("#erro").hidden = true; }
function setLoading(on) { $("#loading").hidden = !on; }

// ----- entrada de dados -----
function lerArquivo(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    fr.readAsText(file);
  });
}

async function baixarRCSB(pdbId) {
  pdbId = pdbId.trim().toUpperCase();
  if (!/^[0-9][A-Z0-9]{3}$/.test(pdbId)) {
    throw new Error("ID de PDB inválido (ex.: 1A00).");
  }
  const url = `https://files.rcsb.org/download/${pdbId}.pdb`;
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error("Sem conexão com o RCSB (ou bloqueio de rede).");
  }
  if (resp.status === 404) throw new Error(`PDB '${pdbId}' não encontrado no RCSB.`);
  if (!resp.ok) throw new Error(`Erro ao acessar o RCSB (${resp.status}).`);
  return await resp.text();
}

async function analisar({ pdbId, file }) {
  limparErro();
  setLoading(true);
  try {
    let texto, nome;
    if (file) {
      texto = await lerArquivo(file);
      nome = file.name || "estrutura.pdb";
    } else if (pdbId) {
      texto = await baixarRCSB(pdbId);
      nome = `${pdbId.trim().toUpperCase()}.pdb`;
    } else {
      throw new Error("Envie um arquivo ou informe um ID.");
    }

    ProtAnalysis.validar(texto);
    const dados = ProtAnalysis.analisarCompleto(texto);
    dados.nome = nome;
    dados.pdb_text = texto;
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

  estado.corPorCadeia = {};
  dados.cadeias.forEach((cid, i) => {
    estado.corPorCadeia[cid] = CORES_CADEIA[i % CORES_CADEIA.length];
  });

  $("#entrada").hidden = true;
  $("#workspace").hidden = false;
  $("#ws-nome").textContent = dados.nome;

  const totalRes = dados.estatisticas.cadeias.reduce((s, c) => s + c.residuos, 0);
  $("#ws-resumo").textContent = `${dados.cadeias.length} cadeia(s) · ${totalRes} resíduos no total`;

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
  estado.viewer.addModel(estado.pdbText, "pdb");
  aplicarEstilo();
  estado.viewer.zoomTo();
  estado.viewer.render();
}

function aplicarEstilo() {
  const v = estado.viewer;
  if (!v) return;
  const estilo = $("#estilo-3d").value;
  v.setStyle({}, {});
  for (const cid of estado.dados.cadeias) {
    const sel = cid === "_" ? { chain: "" } : { chain: cid };
    const spec = {};
    spec[estilo] = { color: estado.corPorCadeia[cid] };
    v.setStyle(sel, spec);
  }
  v.render();
}

function destacarMotivo(ocorrencias) {
  const v = estado.viewer;
  if (!v) return;
  aplicarEstilo();
  for (const oc of ocorrencias) {
    const sel = { chain: oc.cadeia === "_" ? "" : oc.cadeia, resi: oc.residuos.map(Number) };
    v.setStyle(sel, { stick: { color: "yellow" }, sphere: { color: "yellow", radius: 0.5 } });
  }
  v.render();
}

// ----- aba: cadeias -----
function renderCadeias() {
  const cont = $("#tab-cadeias");
  const leg = $("#cadeias-legenda");
  cont.innerHTML = "";
  leg.innerHTML = "";

  for (const c of estado.dados.estatisticas.cadeias) {
    const cor = estado.corPorCadeia[c.cadeia] || "#888";

    const item = document.createElement("span");
    item.className = "item";
    item.innerHTML = `<span class="swatch" style="background:${cor}"></span> Cadeia ${c.cadeia}`;
    leg.appendChild(item);

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

function baixarCadeia(chain) {
  const cadeias = ProtAnalysis.separarCadeias(estado.pdbText);
  const texto = cadeias[chain];
  if (!texto) { alert("Cadeia não encontrada."); return; }
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

// ----- aba: estatisticas -----
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

// ----- aba: aminoacidos -----
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

// ----- aba: motivos -----
function buscarMotivo() {
  const valor = $("#motivo-input").value.trim();
  const cont = $("#motivo-resultado");
  if (!valor) { cont.innerHTML = `<p class="muted">Digite um motivo.</p>`; return; }

  const lista = valor.split(/[-,\s]+/).filter(Boolean);
  const motivo = lista.map((m) => m.toUpperCase());
  const ocorrencias = ProtAnalysis.buscarMotivo(estado.pdbText, lista);

  if (!ocorrencias.length) {
    cont.innerHTML = `<p class="muted">Nenhuma ocorrência de <code>${motivo.join("-")}</code>.</p>`;
    aplicarEstilo();
    return;
  }

  let html = `<p><strong>${ocorrencias.length}</strong> ocorrência(s) de <code>${motivo.join("-")}</code>:</p>`;
  for (const oc of ocorrencias) {
    html += `<div class="ocorrencia">Cadeia <strong>${oc.cadeia}</strong> · posição <strong>${oc.posicao}</strong> (resíduos ${oc.residuos.join(", ")})</div>`;
  }
  html += `<p class="muted small">Resíduos destacados em amarelo no viewer 3D.</p>`;
  cont.innerHTML = html;

  destacarMotivo(ocorrencias);
}

// ----- abas / tema -----
function trocarAba(nome) {
  $$(".aba").forEach((a) => a.classList.toggle("ativa", a.dataset.tab === nome));
  $$(".aba-conteudo").forEach((c) => (c.hidden = c.id !== `tab-${nome}`));
  if (nome === "aa") setTimeout(() => Plotly.Plots.resize("aa-grafico"), 50);
}

function alternarTema() {
  const atual = document.body.dataset.theme === "dark" ? "" : "dark";
  document.body.dataset.theme = atual;
  $("#theme-toggle").textContent = atual === "dark" ? "☀️" : "🌙";
  if (estado.dados) plotAA();
}

// ----- init -----
function init() {
  $("#btn-id").addEventListener("click", () => {
    const id = $("#pdb-id").value.trim();
    if (!id) { mostrarErro("Informe um ID de PDB."); return; }
    analisar({ pdbId: id });
  });
  $("#pdb-id").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-id").click(); });

  $$(".chip").forEach((c) => c.addEventListener("click", () => analisar({ pdbId: c.dataset.id })));

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

  $("#btn-novo").addEventListener("click", () => {
    $("#workspace").hidden = true;
    $("#entrada").hidden = false;
    $("#pdb-id").value = "";
    $("#file-input").value = "";
  });
  $$(".aba").forEach((a) => a.addEventListener("click", () => trocarAba(a.dataset.tab)));
  $("#estilo-3d").addEventListener("change", aplicarEstilo);
  $("#spin").addEventListener("change", (e) => { if (estado.viewer) estado.viewer.spin(e.target.checked ? "y" : false); });
  $("#btn-motivo").addEventListener("click", buscarMotivo);
  $("#motivo-input").addEventListener("keydown", (e) => { if (e.key === "Enter") buscarMotivo(); });
  $("#theme-toggle").addEventListener("click", alternarTema);
}

document.addEventListener("DOMContentLoaded", init);
