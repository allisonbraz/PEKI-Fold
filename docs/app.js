// PEKI Fold (Protein Exploration Kit for Insights) - frontend estatico (GitHub Pages).
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
  pdbId: null,
  dados: null,
  viewer: null,
  corPorCadeia: {},
  pockets: null,      // pockets ja calculados (array de objetos)
  pocketsRaw: null,   // resposta bruta da API (inclui URLs de residuos)
  comparacao: null,   // [{id, pdbText, dados}] das proteinas comparadas
  cmpPockets: null,   // [{id, pockets:[...]}] resultado dos pockets na comparacao
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
    let texto, nome, id = null;
    if (file) {
      texto = await lerArquivo(file);
      nome = file.name || "estrutura.pdb";
    } else if (pdbId) {
      id = pdbId.trim().toUpperCase();
      texto = await baixarRCSB(pdbId);
      nome = `${id}.pdb`;
    } else {
      throw new Error("Envie um arquivo ou informe um ID.");
    }

    ProtAnalysis.validar(texto);
    const dados = ProtAnalysis.analisarCompleto(texto);
    dados.nome = nome;
    dados.pdb_text = texto;
    dados.pdb_id = id;
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
  estado.pdbId = dados.pdb_id || null;
  estado.dados = dados;
  estado.pockets = null;
  estado.pocketsRaw = null;

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
  renderPockets();
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

// ----- aba: pockets (DoGSiteScorer via ProteinsPlus) -----
// Toda a deteccao roda no navegador: POST cria o job, faz-se polling ate o
// resultado ficar pronto e a tabela de descritores (TSV) e baixada e parseada.
const DOGSITE_API = "https://proteins.plus/api/dogsite_rest";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Colunas usadas da tabela de descritores do DoGSiteScorer.
const POCKET_COLS = {
  name: "name", volume: "volume", surface: "surface", depth: "depth",
  accept: "accept", donor: "donor", hydrophobicity: "hydrophobicity",
  drugScore: "drugScore",
};

function renderPockets() {
  const btn = $("#btn-pockets");
  const status = $("#pockets-status");
  const cont = $("#pockets-resultado");
  cont.innerHTML = "";

  if (!estado.pdbId) {
    btn.disabled = true;
    status.innerHTML =
      "⚠️ A detecção de pockets usa a API do DoGSiteScorer, que trabalha por " +
      "<strong>ID do PDB</strong>. Para analisar pockets, refaça a análise " +
      "informando o ID (ex.: <code>1A00</code>) em vez de enviar o arquivo.";
    return;
  }

  btn.disabled = false;
  status.textContent = "";
  if (estado.pockets) {
    renderTabelaPockets(estado.pockets);
  }
}

async function detectarPockets() {
  if (!estado.pdbId) return;
  const btn = $("#btn-pockets");
  const status = $("#pockets-status");
  const cont = $("#pockets-resultado");

  btn.disabled = true;
  cont.innerHTML = "";
  status.innerHTML = `<span class="spinner"></span> Enviando ${estado.pdbId} ao DoGSiteScorer…`;

  try {
    const location = await dogsiteSubmit(estado.pdbId);
    const resultado = await dogsitePoll(location, (n) => {
      status.innerHTML = `<span class="spinner"></span> Calculando pockets no servidor… (verificação ${n})`;
    });

    const txt = await (await fetch(resultado.result_table)).text();
    const pockets = parseTabelaPockets(txt);
    if (!pockets.length) throw new Error("Nenhum pocket retornado pela API.");

    // guarda URLs de residuos por indice (para destaque 3D)
    pockets.forEach((p, i) => { p.residuosUrl = (resultado.residues || [])[i] || null; });

    estado.pockets = pockets;
    estado.pocketsRaw = resultado;
    status.textContent = `✓ ${pockets.length} pocket(s) detectado(s) para ${estado.pdbId}.`;
    renderTabelaPockets(pockets);
  } catch (e) {
    status.innerHTML = `❌ ${e.message}`;
    btn.disabled = false;
  }
}

async function dogsiteSubmit(pdbId) {
  let resp;
  try {
    resp = await fetch(DOGSITE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        dogsite: {
          pdbCode: pdbId.toLowerCase(),
          analysisDetail: "0",                  // 0 = pockets (sem subpockets)
          bindingSitePredictionGranularity: "1", // 1 = propriedades + druggability
          ligand: "", chain: "",
        },
      }),
    });
  } catch (e) {
    throw new Error("Sem conexão com a API ProteinsPlus (ou bloqueio de rede).");
  }
  if (resp.status === 429) throw new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
  if (!resp.ok && resp.status !== 202 && resp.status !== 200) {
    throw new Error(`Erro ao enviar à API DoGSite (${resp.status}).`);
  }
  const data = await resp.json();
  if (!data.location) throw new Error("Resposta inesperada da API DoGSite (sem 'location').");
  return data.location;
}

async function dogsitePoll(location, onTick) {
  for (let i = 0; i < 45; i++) { // ~3 min no maximo (45 x 4s)
    let r;
    try { r = await fetch(location, { headers: { Accept: "application/json" } }); }
    catch (e) { throw new Error("Conexão perdida durante o cálculo dos pockets."); }
    if (r.status === 429) throw new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
    if (r.status === 200) {
      const d = await r.json();
      if (d.result_table) return d;
    }
    if (onTick) onTick(i + 1);
    await sleep(4000);
  }
  throw new Error("Tempo esgotado aguardando o DoGSiteScorer.");
}

// Converte o TSV de descritores num array de objetos {name, volume, ...}.
function parseTabelaPockets(txt) {
  const linhas = txt.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const header = linhas[0].split("\t").map((h) => h.trim());
  const idx = {};
  for (const [k, col] of Object.entries(POCKET_COLS)) idx[k] = header.indexOf(col);

  const num = (v) => { const n = parseFloat(String(v).trim()); return Number.isFinite(n) ? n : null; };
  const pockets = [];
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split("\t");
    const nome = (c[idx.name] || `P_${i - 1}`).trim();
    // analysisDetail=0 ja retorna so pockets, mas filtramos subpockets por seguranca
    if (/_\d+_\d+$/.test(nome)) continue;
    pockets.push({
      name: nome,
      volume: num(c[idx.volume]),
      surface: num(c[idx.surface]),
      depth: num(c[idx.depth]),
      accept: num(c[idx.accept]),
      donor: num(c[idx.donor]),
      hydrophobicity: num(c[idx.hydrophobicity]),
      drugScore: num(c[idx.drugScore]),
    });
  }
  return pockets;
}

// Coeficiente de correlacao de Pearson (para a pergunta volume x profundidade).
function pearson(xs, ys) {
  const pares = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => a != null && b != null);
  const n = pares.length;
  if (n < 2) return null;
  const mx = pares.reduce((s, p) => s + p[0], 0) / n;
  const my = pares.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pares) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function fmt(v, casas = 2) { return v == null ? "—" : v.toFixed(casas); }

function maxPor(pockets, chave) {
  let melhor = null;
  for (const p of pockets) if (p[chave] != null && (!melhor || p[chave] > melhor[chave])) melhor = p;
  return melhor;
}

function renderTabelaPockets(pockets) {
  const cont = $("#pockets-resultado");
  const maiorVol = maxPor(pockets, "volume");
  const maisProf = maxPor(pockets, "depth");
  const maisHidro = maxPor(pockets, "hydrophobicity");
  const melhorDrug = maxPor(pockets, "drugScore");

  let html = `<table class="pockets-tabela"><thead><tr>
    <th>Pocket</th><th>Volume (Å³)</th><th>Superfície (Å²)</th><th>Profundidade</th>
    <th>Hidrofob.</th><th>Aceptores</th><th>Doadores</th><th>DrugScore</th><th>3D</th>
  </tr></thead><tbody>`;
  pockets.forEach((p, i) => {
    let cls = "";
    if (maiorVol && p.name === maiorVol.name) cls = "destaque-maior";
    html += `<tr class="${cls}">
      <td><strong>${p.name}</strong></td>
      <td>${fmt(p.volume)}</td><td>${fmt(p.surface)}</td><td>${fmt(p.depth)}</td>
      <td>${fmt(p.hydrophobicity)}</td><td>${p.accept ?? "—"}</td><td>${p.donor ?? "—"}</td>
      <td>${fmt(p.drugScore, 3)}</td>
      <td>${p.residuosUrl ? `<button class="link-btn pocket-3d" data-idx="${i}">👁 ver</button>` : "—"}</td>
    </tr>`;
  });
  html += `</tbody></table>`;

  // Respostas analiticas (adaptadas: por pocket dentro desta proteina)
  const corr = pearson(pockets.map((p) => p.volume), pockets.map((p) => p.depth));
  let corrTxt;
  if (corr == null) corrTxt = "não há pockets suficientes para avaliar.";
  else {
    const forca = Math.abs(corr) >= 0.7 ? "forte" : Math.abs(corr) >= 0.4 ? "moderada" : "fraca";
    const sinal = corr >= 0 ? "positiva" : "negativa";
    corrTxt = `correlação ${sinal} ${forca} (r = ${corr.toFixed(2)}) entre volume e profundidade.`;
  }

  html += `<div class="pockets-analise">
    <h4>Análise dos pockets</h4>
    <ol>
      <li><strong>Maior volume:</strong> ${maiorVol ? `${maiorVol.name} (${fmt(maiorVol.volume)} Å³)` : "—"}</li>
      <li><strong>Mais profundo:</strong> ${maisProf ? `${maisProf.name} (profundidade ${fmt(maisProf.depth)})` : "—"}</li>
      <li><strong>Volume × profundidade:</strong> ${corrTxt}</li>
      <li><strong>Mais hidrofóbico:</strong> ${maisHidro ? `${maisHidro.name} (hidrofobicidade ${fmt(maisHidro.hydrophobicity)})` : "—"}</li>
      <li><strong>Sugestão para docking:</strong> ${melhorDrug
        ? `${melhorDrug.name} — maior <em>drugScore</em> (${fmt(melhorDrug.drugScore, 3)}), indicando melhor "drugabilidade"; volume ${fmt(melhorDrug.volume)} Å³ e profundidade ${fmt(melhorDrug.depth)} favorecem o encaixe de um ligante.`
        : "—"}</li>
    </ol>
    <p class="muted small">Descritores do DoGSiteScorer; o <em>drugScore</em> estima a drugabilidade (0–1).</p>
  </div>
  <div id="pockets-graf-volume" class="grafico"></div>
  <div id="pockets-graf-depth" class="grafico"></div>`;

  cont.innerHTML = html;

  $$("#pockets-resultado .pocket-3d").forEach((btn) => {
    btn.addEventListener("click", () => destacarPocket(Number(btn.dataset.idx)));
  });

  plotPockets(pockets);
}

function plotPockets(pockets) {
  const escuro = document.body.dataset.theme === "dark";
  const nomes = pockets.map((p) => p.name);
  const layoutBase = (titulo, ytitulo) => ({
    title: titulo,
    xaxis: { title: "Pocket" },
    yaxis: { title: ytitulo },
    margin: { t: 40, r: 10, b: 50, l: 60 },
    paper_bgcolor: "transparent", plot_bgcolor: "transparent",
    font: { color: escuro ? "#e7edf7" : "#1c2433" },
  });
  Plotly.newPlot("pockets-graf-volume", [{
    x: nomes, y: pockets.map((p) => p.volume), type: "bar", name: "Volume",
    marker: { color: "#2a5599" }, hovertemplate: "%{x}: %{y:.1f} Å³<extra></extra>",
  }], layoutBase("Volume por pocket — " + estado.pdbId, "Volume (Å³)"), { responsive: true, displayModeBar: false });

  Plotly.newPlot("pockets-graf-depth", [{
    x: nomes, y: pockets.map((p) => p.depth), type: "bar", name: "Profundidade",
    marker: { color: "#e8513a" }, hovertemplate: "%{x}: %{y:.2f}<extra></extra>",
  }], layoutBase("Profundidade por pocket — " + estado.pdbId, "Profundidade"), { responsive: true, displayModeBar: false });
}

// Destaca, no viewer 3D, os residuos que revestem um pocket.
async function destacarPocket(idx) {
  const p = estado.pockets[idx];
  const status = $("#pockets-status");
  if (!p || !p.residuosUrl || !estado.viewer) return;
  status.innerHTML = `<span class="spinner"></span> Carregando resíduos do ${p.name}…`;
  try {
    const txt = await (await fetch(p.residuosUrl)).text();
    const selPorCadeia = {};
    for (const linha of txt.split("\n")) {
      if (!linha.startsWith("ATOM") && !linha.startsWith("HETATM")) continue;
      const cadeia = linha[21].trim() || "";
      const resi = parseInt(linha.slice(22, 26), 10);
      if (Number.isNaN(resi)) continue;
      (selPorCadeia[cadeia] = selPorCadeia[cadeia] || new Set()).add(resi);
    }
    aplicarEstilo();
    for (const [cadeia, resis] of Object.entries(selPorCadeia)) {
      estado.viewer.setStyle(
        { chain: cadeia, resi: [...resis] },
        { stick: { color: "magenta" }, sphere: { color: "magenta", radius: 0.4 } }
      );
    }
    estado.viewer.render();
    status.textContent = `✓ ${p.name} destacado em magenta no viewer 3D.`;
  } catch (e) {
    status.innerHTML = `❌ Falha ao destacar o pocket: ${e.message}`;
  }
}

// ----- comparação de proteínas (2 a 4 PDBs) -----
async function compararProteinas(idsRaw) {
  limparErro();
  const ids = [...new Set(
    idsRaw.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
  )];

  if (ids.length < 2) { mostrarErro("Informe pelo menos 2 IDs de PDB para comparar."); return; }
  if (ids.length > 4) { mostrarErro("Compare no máximo 4 proteínas por vez."); return; }
  const invalido = ids.find((id) => !/^[0-9][A-Z0-9]{3}$/.test(id));
  if (invalido) { mostrarErro(`ID de PDB inválido: '${invalido}' (ex.: 1A00).`); return; }

  setLoading(true);
  try {
    const proteinas = [];
    for (const id of ids) {
      const texto = await baixarRCSB(id);
      ProtAnalysis.validar(texto);
      proteinas.push({ id, pdbText: texto, dados: ProtAnalysis.analisarCompleto(texto) });
    }
    estado.comparacao = proteinas;
    estado.cmpPockets = null;
    iniciarComparacao();
  } catch (e) {
    mostrarErro(e.message);
  } finally {
    setLoading(false);
  }
}

function iniciarComparacao() {
  const ps = estado.comparacao;
  $("#entrada").hidden = true;
  $("#workspace").hidden = true;
  $("#comparacao").hidden = false;

  $("#cmp-titulo").textContent = "Comparação: " + ps.map((p) => p.id).join(" · ");
  $("#cmp-resumo").textContent = `${ps.length} proteínas`;

  trocarAbaCmp("stats");
  renderCmpStats();
  renderCmpAA();
  $("#cmp-pockets-status").textContent = "";
  $("#cmp-pockets-resultado").innerHTML = "";
  $("#btn-cmp-pockets").disabled = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// estatística agregada da proteína inteira
function resumoProteina(p) {
  const st = p.dados.estatisticas;
  const freq = ProtAnalysis.frequenciaAminoacidos(p.pdbText); // todas as cadeias
  return {
    id: p.id,
    cadeias: p.dados.cadeias.length,
    atomos: st.cadeias.reduce((s, c) => s + c.atomos, 0),
    residuos: st.cadeias.reduce((s, c) => s + c.residuos, 0),
    aaDiferentes: freq.itens.filter((i) => i.contagem > 0).length,
  };
}

function renderCmpStats() {
  const cont = $("#ctab-stats");
  const resumos = estado.comparacao.map(resumoProteina);
  const maxRes = Math.max(...resumos.map((r) => r.residuos));

  let html = `<table><thead><tr>
    <th>Proteína</th><th>Cadeias</th><th>Átomos</th><th>Resíduos</th><th>Aa diferentes</th>
  </tr></thead><tbody>`;
  for (const r of resumos) {
    const cls = r.residuos === maxRes ? "destaque-maior" : "";
    html += `<tr class="${cls}"><td><strong>${r.id}</strong></td><td>${r.cadeias}</td>
      <td>${r.atomos}</td><td>${r.residuos}</td><td>${r.aaDiferentes}</td></tr>`;
  }
  html += `</tbody></table><div id="cmp-graf-stats" class="grafico"></div>`;
  cont.innerHTML = html;

  const escuro = document.body.dataset.theme === "dark";
  Plotly.newPlot("cmp-graf-stats", [
    { x: resumos.map((r) => r.id), y: resumos.map((r) => r.residuos), type: "bar",
      marker: { color: resumos.map((_, i) => CORES_CADEIA[i % CORES_CADEIA.length]) },
      hovertemplate: "%{x}: %{y} resíduos<extra></extra>" },
  ], {
    title: "Resíduos por proteína",
    xaxis: { title: "Proteína" },
    yaxis: { title: "Resíduos" },
    margin: { t: 50, r: 10, b: 50, l: 60 },
    paper_bgcolor: "transparent", plot_bgcolor: "transparent",
    font: { color: escuro ? "#e7edf7" : "#1c2433" },
  }, { responsive: true, displayModeBar: false });
}

function renderCmpAA() {
  const cont = $("#ctab-aa");
  cont.innerHTML = `<p class="muted small">Porcentagem dos 20 aminoácidos por proteína (todas as cadeias).</p>
    <div id="cmp-graf-aa" class="grafico" style="height:420px"></div>`;
  plotCmpAA();
}

function plotCmpAA() {
  const escuro = document.body.dataset.theme === "dark";
  const aas = ProtAnalysis.AMINOACIDOS_PADRAO;
  const traces = estado.comparacao.map((p, i) => {
    const freq = ProtAnalysis.frequenciaAminoacidos(p.pdbText);
    const mapa = {};
    freq.itens.forEach((it) => (mapa[it.aa] = it.porcentagem));
    return {
      x: aas, y: aas.map((a) => mapa[a] || 0), type: "bar", name: p.id,
      marker: { color: CORES_CADEIA[i % CORES_CADEIA.length] },
      hovertemplate: `${p.id} — %{x}: %{y}%<extra></extra>`,
    };
  });
  Plotly.newPlot("cmp-graf-aa", traces, {
    title: "Composição de aminoácidos por proteína",
    barmode: "group",
    xaxis: { title: "Aminoácido" },
    yaxis: { title: "Porcentagem (%)" },
    legend: { orientation: "h", y: 1.12 },
    margin: { t: 50, r: 10, b: 50, l: 50 },
    paper_bgcolor: "transparent", plot_bgcolor: "transparent",
    font: { color: escuro ? "#e7edf7" : "#1c2433" },
  }, { responsive: true, displayModeBar: false });
}

async function detectarPocketsComparacao() {
  const btn = $("#btn-cmp-pockets");
  const status = $("#cmp-pockets-status");
  const cont = $("#cmp-pockets-resultado");
  btn.disabled = true;
  cont.innerHTML = "";

  try {
    const resultado = [];
    for (let i = 0; i < estado.comparacao.length; i++) {
      const p = estado.comparacao[i];
      status.innerHTML = `<span class="spinner"></span> Calculando pockets de ${p.id} (${i + 1}/${estado.comparacao.length})…`;
      const location = await dogsiteSubmit(p.id);
      const res = await dogsitePoll(location);
      const txt = await (await fetch(res.result_table)).text();
      const pockets = parseTabelaPockets(txt);
      resultado.push({ id: p.id, pockets });
    }
    estado.cmpPockets = resultado;
    status.textContent = `✓ Pockets detectados para ${resultado.length} proteínas.`;
    renderCmpPockets(resultado);
  } catch (e) {
    status.innerHTML = `❌ ${e.message}`;
    btn.disabled = false;
  }
}

function renderCmpPockets(resultado) {
  const cont = $("#cmp-pockets-resultado");

  // pocket principal (maior volume) de cada proteína + lista achatada com a proteina
  const principais = [];
  const todos = []; // {prot, ...pocket}
  for (const r of resultado) {
    const ordenados = [...r.pockets].filter((p) => p.volume != null).sort((a, b) => b.volume - a.volume);
    if (ordenados.length) principais.push({ prot: r.id, ...ordenados[0] });
    for (const pk of r.pockets) todos.push({ prot: r.id, ...pk });
  }

  // tabela: pocket principal por proteina
  const maxVolPrinc = Math.max(...principais.map((p) => p.volume ?? -Infinity));
  let html = `<h4 style="margin-top:14px">Pocket principal por proteína</h4>
    <table class="pockets-tabela"><thead><tr>
    <th>Proteína</th><th>Pocket</th><th>Volume (Å³)</th><th>Profundidade</th><th>Hidrofob.</th><th>DrugScore</th>
    </tr></thead><tbody>`;
  for (const p of principais) {
    const cls = p.volume === maxVolPrinc ? "destaque-maior" : "";
    html += `<tr class="${cls}"><td><strong>${p.prot}</strong></td><td>${p.name}</td>
      <td>${fmt(p.volume)}</td><td>${fmt(p.depth)}</td><td>${fmt(p.hydrophobicity)}</td><td>${fmt(p.drugScore, 3)}</td></tr>`;
  }
  html += `</tbody></table>`;

  // respostas cross-protein (sobre TODOS os pockets de todas as proteínas)
  const maiorVol = maxPor(todos, "volume");
  const maisProf = maxPor(todos, "depth");
  const melhorDrug = maxPor(todos, "drugScore");
  const corr = pearson(principais.map((p) => p.volume), principais.map((p) => p.depth));
  let corrTxt;
  if (corr == null) corrTxt = "não há dados suficientes para avaliar.";
  else {
    const forca = Math.abs(corr) >= 0.7 ? "forte" : Math.abs(corr) >= 0.4 ? "moderada" : "fraca";
    corrTxt = `correlação ${corr >= 0 ? "positiva" : "negativa"} ${forca} (r = ${corr.toFixed(2)}) entre volume e profundidade dos pockets principais.`;
  }
  // proteínas ordenadas por hidrofobicidade do pocket principal
  const rankHidro = [...principais].filter((p) => p.hydrophobicity != null)
    .sort((a, b) => b.hydrophobicity - a.hydrophobicity);
  const topHidro = rankHidro.slice(0, Math.min(2, rankHidro.length))
    .map((p) => `${p.prot} (${fmt(p.hydrophobicity)})`).join(", ");

  html += `<div class="pockets-analise">
    <h4>Comparação dos pockets (perguntas do trabalho)</h4>
    <ol>
      <li><strong>Proteína com pocket de maior volume:</strong> ${maiorVol ? `${maiorVol.prot} — ${maiorVol.name} (${fmt(maiorVol.volume)} Å³)` : "—"}</li>
      <li><strong>Proteína com pocket mais profundo:</strong> ${maisProf ? `${maisProf.prot} — ${maisProf.name} (profundidade ${fmt(maisProf.depth)})` : "—"}</li>
      <li><strong>Relação volume × profundidade:</strong> ${corrTxt}</li>
      <li><strong>Proteínas com pockets mais hidrofóbicos:</strong> ${topHidro || "—"}</li>
      <li><strong>Pocket sugerido para docking:</strong> ${melhorDrug
        ? `${melhorDrug.prot} — ${melhorDrug.name}, maior <em>drugScore</em> (${fmt(melhorDrug.drugScore, 3)}); volume ${fmt(melhorDrug.volume)} Å³ e profundidade ${fmt(melhorDrug.depth)} favorecem o encaixe de um ligante.`
        : "—"}</li>
    </ol>
  </div>
  <div id="cmp-graf-pvol" class="grafico"></div>
  <div id="cmp-graf-pdepth" class="grafico"></div>
  <div id="cmp-graf-phydro" class="grafico"></div>`;

  cont.innerHTML = html;
  plotCmpPockets(principais);
}

function plotCmpPockets(principais) {
  const escuro = document.body.dataset.theme === "dark";
  const ids = principais.map((p) => p.prot);
  const barra = (div, ys, titulo, ytit, cor, hint) => Plotly.newPlot(div, [{
    x: ids, y: ys, type: "bar", marker: { color: cor }, hovertemplate: `%{x}: %{y}${hint}<extra></extra>`,
  }], {
    title: titulo, xaxis: { title: "Proteína" }, yaxis: { title: ytit },
    margin: { t: 40, r: 10, b: 50, l: 60 },
    paper_bgcolor: "transparent", plot_bgcolor: "transparent",
    font: { color: escuro ? "#e7edf7" : "#1c2433" },
  }, { responsive: true, displayModeBar: false });

  barra("cmp-graf-pvol", principais.map((p) => p.volume), "Volume do pocket principal por proteína", "Volume (Å³)", "#2a5599", " Å³");
  barra("cmp-graf-pdepth", principais.map((p) => p.depth), "Profundidade do pocket principal por proteína", "Profundidade", "#e8513a", "");
  barra("cmp-graf-phydro", principais.map((p) => p.hydrophobicity), "Hidrofobicidade do pocket principal por proteína", "Hidrofobicidade", "#9b59b6", "");
}

function trocarAbaCmp(nome) {
  $$("#comparacao .aba").forEach((a) => a.classList.toggle("ativa", a.dataset.ctab === nome));
  $$("#comparacao .aba-conteudo").forEach((c) => (c.hidden = c.id !== `ctab-${nome}`));
  setTimeout(() => {
    if (nome === "stats") Plotly.Plots.resize("cmp-graf-stats");
    if (nome === "aa") Plotly.Plots.resize("cmp-graf-aa");
    if (nome === "pockets" && estado.cmpPockets) {
      ["cmp-graf-pvol", "cmp-graf-pdepth", "cmp-graf-phydro"].forEach((d) => Plotly.Plots.resize(d));
    }
  }, 50);
}

// ----- abas / tema -----
function trocarAba(nome) {
  $$("#workspace .aba").forEach((a) => a.classList.toggle("ativa", a.dataset.tab === nome));
  $$("#workspace .aba-conteudo").forEach((c) => (c.hidden = c.id !== `tab-${nome}`));
  if (nome === "aa") setTimeout(() => Plotly.Plots.resize("aa-grafico"), 50);
  if (nome === "pockets" && estado.pockets) {
    setTimeout(() => {
      Plotly.Plots.resize("pockets-graf-volume");
      Plotly.Plots.resize("pockets-graf-depth");
    }, 50);
  }
}

function alternarTema() {
  const atual = document.body.dataset.theme === "dark" ? "" : "dark";
  document.body.dataset.theme = atual;
  $("#theme-toggle").textContent = atual === "dark" ? "☀️" : "🌙";
  if (estado.dados) plotAA();
  if (estado.pockets) plotPockets(estado.pockets);
  if (estado.comparacao && !$("#comparacao").hidden) {
    renderCmpStats();
    plotCmpAA();
    if (estado.cmpPockets) renderCmpPockets(estado.cmpPockets);
  }
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

  // comparação
  $("#btn-cmp").addEventListener("click", () => compararProteinas($("#cmp-ids").value));
  $("#cmp-ids").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-cmp").click(); });
  $("#btn-cmp-pockets").addEventListener("click", detectarPocketsComparacao);
  $("#btn-cmp-novo").addEventListener("click", () => {
    $("#comparacao").hidden = true;
    $("#entrada").hidden = false;
    $("#cmp-ids").value = "";
  });
  $$("#comparacao .aba").forEach((a) => a.addEventListener("click", () => trocarAbaCmp(a.dataset.ctab)));
  $$("#workspace .aba").forEach((a) => a.addEventListener("click", () => trocarAba(a.dataset.tab)));
  $("#estilo-3d").addEventListener("change", aplicarEstilo);
  $("#spin").addEventListener("change", (e) => { if (estado.viewer) estado.viewer.spin(e.target.checked ? "y" : false); });
  $("#btn-motivo").addEventListener("click", buscarMotivo);
  $("#motivo-input").addEventListener("keydown", (e) => { if (e.key === "Enter") buscarMotivo(); });
  $("#btn-pockets").addEventListener("click", detectarPockets);
  $("#theme-toggle").addEventListener("click", alternarTema);
}

document.addEventListener("DOMContentLoaded", init);
