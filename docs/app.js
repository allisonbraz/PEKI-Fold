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
  meta: null,         // metadados da estrutura (PDB + RCSB) para o card "Sobre"
  viewer: null,
  corPorCadeia: {},
  pockets: null,      // pockets ja calculados (array de objetos)
  pocketsRaw: null,   // resposta bruta da API (inclui URLs de residuos)
  comparacao: null,   // [{id, pdbText, dados}] das proteinas comparadas
  cmpPockets: null,   // [{id, pockets:[...]}] resultado dos pockets na comparacao
  ultimoMotivo: null, // {motivo, ocorrencias} da ultima busca (para exportacao)
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
    if (id) enriquecerMetaRCSB(id); // enriquece o card de metadados (assíncrono)
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
  estado.ultimoMotivo = null;
  estado.meta = ProtAnalysis.extrairMetadados(dados.pdb_text);

  estado.corPorCadeia = {};
  dados.cadeias.forEach((cid, i) => {
    estado.corPorCadeia[cid] = CORES_CADEIA[i % CORES_CADEIA.length];
  });

  $("#entrada").hidden = true;
  $("#workspace").hidden = false;
  $("#ws-nome").textContent = dados.nome;

  const totalRes = dados.estatisticas.cadeias.reduce((s, c) => s + c.residuos, 0);
  $("#ws-resumo").textContent = `${dados.cadeias.length} cadeia(s) · ${totalRes} resíduos no total`;

  renderMeta();
  renderViewer();
  renderCadeias();
  renderStats();
  renderAA();
  renderPockets();
  $("#motivo-resultado").innerHTML = "";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ----- metadados (card "Sobre a estrutura") -----
async function buscarMetaRCSB(id) {
  try {
    const r = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      titulo: d.struct?.title || null,
      metodo: d.exptl?.[0]?.method || null,
      resolucao: d.rcsb_entry_info?.resolution_combined?.[0] ?? null,
      peso: d.rcsb_entry_info?.molecular_weight ?? null,
      data: d.rcsb_accession_info?.deposit_date ? d.rcsb_accession_info.deposit_date.slice(0, 10) : null,
      classificacao: d.struct_keywords?.pdbx_keywords || null,
    };
  } catch (e) { return null; }
}

async function enriquecerMetaRCSB(id) {
  const rcsb = await buscarMetaRCSB(id);
  if (!rcsb || !estado.meta || estado.pdbId !== id) return; // ignora se já trocou de análise
  for (const k of ["titulo", "metodo", "resolucao", "peso", "data", "classificacao"]) {
    if (rcsb[k] != null) estado.meta[k] = rcsb[k];
  }
  estado.meta.rcsbId = id;
  renderMeta();
}

function renderMeta() {
  const m = estado.meta;
  const el = $("#ws-meta");
  if (!m || !(m.titulo || m.classificacao || m.organismos?.length || m.ligantes?.length)) { el.hidden = true; return; }

  const tags = [];
  if (m.metodo) tags.push(m.metodo);
  if (m.resolucao) tags.push(`${m.resolucao} Å`);
  if (m.organismos?.length) tags.push(`<em>${m.organismos.join(", ")}</em>`);
  if (m.peso) tags.push(`${Math.round(m.peso)} kDa`);
  if (m.data) tags.push(m.data);
  if (m.rcsbId) tags.push(`<a href="https://www.rcsb.org/structure/${m.rcsbId}" target="_blank" rel="noopener">Ver no RCSB ↗</a>`);

  const ligs = (m.ligantes || []).map((l) => `${l.id}${l.count > 1 ? ` ×${l.count}` : ""}`).join(", ");

  el.innerHTML =
    `<div class="meta-titulo">${m.titulo || m.classificacao || estado.nome}</div>` +
    (m.classificacao && m.titulo ? `<div class="muted small">${m.classificacao}</div>` : "") +
    (tags.length ? `<div class="meta-tags">${tags.map((t) => `<span class="meta-tag">${t}</span>`).join("")}</div>` : "") +
    (ligs ? `<div class="muted small">Ligantes: ${ligs}</div>` : "");
  el.hidden = false;
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

  const acoes = document.createElement("div");
  acoes.className = "cadeias-acoes";
  acoes.innerHTML = `<button id="btn-fasta-todas" class="fasta-btn">⬇ FASTA (todas)</button>`;
  cont.appendChild(acoes);

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
      <div class="cadeia-btns">
        <button class="dl-btn" data-chain="${c.cadeia}">⬇ PDB</button>
        <button class="fasta-btn" data-chain="${c.cadeia}">⬇ FASTA</button>
      </div>`;
    cont.appendChild(div);
  }

  $$("#tab-cadeias .dl-btn").forEach((btn) => {
    btn.addEventListener("click", () => baixarCadeia(btn.dataset.chain));
  });
  $$("#tab-cadeias .fasta-btn[data-chain]").forEach((btn) => {
    btn.addEventListener("click", () => baixarArquivo(`${baseNome()}_${btn.dataset.chain}.fasta`, seqFasta(btn.dataset.chain)));
  });
  $("#btn-fasta-todas").addEventListener("click", () =>
    baixarArquivo(`${baseNome()}.fasta`, estado.dados.cadeias.map(seqFasta).join("")));
}

function baseNome() { return (estado.nome || "protein").replace(/\.[^.]+$/, ""); }

// Sequência da cadeia em formato FASTA (quebrada em linhas de 60 caracteres).
function seqFasta(cid) {
  const seq = estado.dados.sequencias[cid] || "";
  const linhas = seq.match(/.{1,60}/g) || [""];
  return `>${baseNome()}_${cid}\n${linhas.join("\n")}\n`;
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
    estado.ultimoMotivo = null;
    cont.innerHTML = `<p class="muted">Nenhuma ocorrência de <code>${motivo.join("-")}</code>.</p>`;
    aplicarEstilo();
    return;
  }

  estado.ultimoMotivo = { motivo: motivo.join("-"), ocorrencias };

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
// Cache de pockets por sessão, por ID do PDB — evita re-chamar a API (e o rate limit)
// ao reanalisar a mesma proteína ou ao usá-la na comparação.
const POCKETS_CACHE = {};

async function obterPockets(id, onTick) {
  const chave = id.toUpperCase();
  if (POCKETS_CACHE[chave]) return POCKETS_CACHE[chave];
  const location = await dogsiteSubmit(id);
  const resultado = await dogsitePoll(location, onTick);
  const txt = await (await fetch(resultado.result_table)).text();
  const pockets = parseTabelaPockets(txt);
  pockets.forEach((p, i) => { p.residuosUrl = (resultado.residues || [])[i] || null; });
  POCKETS_CACHE[chave] = { pockets, residues: resultado.residues || [] };
  return POCKETS_CACHE[chave];
}

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
  // auto-carrega do cache se esta proteína já teve pockets calculados na sessão
  if (!estado.pockets && POCKETS_CACHE[estado.pdbId.toUpperCase()]) {
    estado.pockets = POCKETS_CACHE[estado.pdbId.toUpperCase()].pockets;
  }
  if (estado.pockets) {
    status.textContent = `✓ ${estado.pockets.length} pocket(s) para ${estado.pdbId}.`;
    renderTabelaPockets(estado.pockets);
  }
}

async function detectarPockets() {
  if (!estado.pdbId) return;
  const btn = $("#btn-pockets");
  const status = $("#pockets-status");
  const cont = $("#pockets-resultado");
  const cacheado = !!POCKETS_CACHE[estado.pdbId.toUpperCase()];

  btn.disabled = true;
  cont.innerHTML = "";
  status.innerHTML = cacheado ? "" : `<span class="spinner"></span> Enviando ${estado.pdbId} ao DoGSiteScorer…`;

  try {
    const { pockets } = await obterPockets(estado.pdbId, (n) => {
      status.innerHTML = `<span class="spinner"></span> Calculando pockets no servidor… (verificação ${n})`;
    });
    if (!pockets.length) throw new Error("Nenhum pocket retornado pela API.");

    estado.pockets = pockets;
    status.textContent = `✓ ${pockets.length} pocket(s)${cacheado ? " (do cache)" : ""} para ${estado.pdbId}.`;
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
      const cacheado = !!POCKETS_CACHE[p.id.toUpperCase()];
      status.innerHTML = `<span class="spinner"></span> ${cacheado ? "Carregando" : "Calculando"} pockets de ${p.id} (${i + 1}/${estado.comparacao.length})…`;
      const { pockets } = await obterPockets(p.id);
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

// ----- exportação (PDF / Markdown) -----
// As seções disponíveis dependem do contexto (proteína única ou comparação)
// e do que já foi calculado. Imagens vêm do viewer 3D (3Dmol) e dos gráficos
// (Plotly.toImage a partir de specs, para não depender da aba estar visível).
let exportContexto = "single";

const EXPORT_SECOES = {
  single: () => [
    { id: "meta", label: "Sobre a estrutura", on: () => !!(estado.meta && (estado.meta.titulo || estado.meta.classificacao || estado.meta.organismos?.length)) },
    { id: "viewer", label: "Estrutura 3D (imagem)", on: () => !!estado.viewer },
    { id: "cadeias", label: "Cadeias", on: () => !!estado.dados },
    { id: "stats", label: "Estatísticas", on: () => !!estado.dados },
    { id: "aa", label: "Aminoácidos (gráficos)", on: () => !!estado.dados },
    { id: "sequencias", label: "Sequências (FASTA)", on: () => !!estado.dados },
    { id: "motivos", label: "Motivos", on: () => !!estado.ultimoMotivo },
    { id: "pockets", label: "Pockets", on: () => !!estado.pockets },
  ],
  cmp: () => [
    { id: "stats", label: "Estatísticas", on: () => !!estado.comparacao },
    { id: "aa", label: "Aminoácidos (gráfico)", on: () => !!estado.comparacao },
    { id: "pockets", label: "Pockets", on: () => !!estado.cmpPockets },
  ],
};

function abrirExport(ctx) {
  exportContexto = ctx;
  const itens = EXPORT_SECOES[ctx]().filter((s) => s.on());
  $("#exp-itens").innerHTML = itens.map((s) =>
    `<label><input type="checkbox" class="exp-item" value="${s.id}" checked /> ${s.label}</label>`
  ).join("");
  $("#exp-full").checked = true;
  $("#exp-status").textContent = "";
  $("#export-modal").hidden = false;
}

function fecharExport() { $("#export-modal").hidden = true; }

async function confirmarExport() {
  const fmt = document.querySelector('input[name="exp-fmt"]:checked').value;
  const secoes = $$(".exp-item").filter((c) => c.checked).map((c) => c.value);
  if (!secoes.length) { $("#exp-status").textContent = "Selecione ao menos uma seção."; return; }
  $("#exp-status").innerHTML = `<span class="spinner"></span> Gerando ${fmt.toUpperCase()}…`;
  try {
    if (exportContexto === "single") {
      fmt === "pdf" ? await exportarPdfSingle(secoes) : await exportarMdSingle(secoes);
    } else {
      fmt === "pdf" ? await exportarPdfCmp(secoes) : await exportarMdCmp(secoes);
    }
    $("#exp-status").textContent = "✓ Arquivo gerado.";
    setTimeout(fecharExport, 800);
  } catch (e) {
    $("#exp-status").innerHTML = `❌ ${e.message}`;
  }
}

// --- helpers de imagem e arquivo ---
function imgViewer() {
  try { return estado.viewer ? estado.viewer.pngURI() : null; } catch (e) { return null; }
}
async function imgPlotly(spec, w = 760, h = 400) {
  return await Plotly.toImage(spec, { format: "png", width: w, height: h });
}
function baixarTexto(nome, conteudo, mime) {
  const blob = new Blob([conteudo], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
function mdTabela(head, rows) {
  let s = "| " + head.join(" | ") + " |\n| " + head.map(() => "---").join(" | ") + " |\n";
  for (const r of rows) s += "| " + r.map((c) => String(c)).join(" | ") + " |\n";
  return s + "\n";
}
function exportBase() {
  const nome = exportContexto === "cmp"
    ? "comparacao_" + estado.comparacao.map((p) => p.id).join("-")
    : (estado.nome || "analise").replace(/\.[^.]+$/, "");
  return "PEKI-Fold_" + nome;
}
const CREDITO = "Desenvolvido por Allison Braz · Universidade Federal de Jataí (UFJ) · orientação do Prof. Dr. Roosevelt Alves da Silva.";

function metaLinhas() {
  const m = estado.meta || {}; const out = [];
  if (m.classificacao) out.push(["Classificação", m.classificacao]);
  if (m.metodo) out.push(["Método", m.metodo]);
  if (m.resolucao) out.push(["Resolução", `${m.resolucao} Å`]);
  if (m.organismos?.length) out.push(["Organismo", m.organismos.join(", ")]);
  if (m.peso) out.push(["Peso molecular", `${Math.round(m.peso)} kDa`]);
  if (m.data) out.push(["Depósito", m.data]);
  if (m.ligantes?.length) out.push(["Ligantes", m.ligantes.map((l) => `${l.id}${l.count > 1 ? ` ×${l.count}` : ""}${l.nome ? ` (${l.nome})` : ""}`).join(", ")]);
  if (m.rcsbId) out.push(["RCSB", `https://www.rcsb.org/structure/${m.rcsbId}`]);
  return out;
}

// --- specs de gráficos (reutilizados na exportação) ---
function specAAChain(cid) {
  const freq = estado.dados.frequencias[cid];
  const cor = estado.corPorCadeia[cid] || "#2a5599";
  return { data: [{ x: freq.itens.map((i) => i.aa), y: freq.itens.map((i) => i.porcentagem), type: "bar", marker: { color: cor } }],
    layout: { title: `Frequência de aminoácidos — cadeia ${cid}`, xaxis: { title: "Aminoácido" }, yaxis: { title: "Porcentagem (%)" } } };
}
function specPocketBar(pockets, chave, titulo, ytit, cor) {
  return { data: [{ x: pockets.map((p) => p.name), y: pockets.map((p) => p[chave]), type: "bar", marker: { color: cor } }],
    layout: { title: titulo, xaxis: { title: "Pocket" }, yaxis: { title: ytit } } };
}
function specCmpStats() {
  const res = estado.comparacao.map(resumoProteina);
  return { data: [{ x: res.map((r) => r.id), y: res.map((r) => r.residuos), type: "bar", marker: { color: res.map((_, i) => CORES_CADEIA[i % CORES_CADEIA.length]) } }],
    layout: { title: "Resíduos por proteína", xaxis: { title: "Proteína" }, yaxis: { title: "Resíduos" } } };
}
function specCmpAA() {
  const aas = ProtAnalysis.AMINOACIDOS_PADRAO;
  const data = estado.comparacao.map((p, i) => {
    const f = ProtAnalysis.frequenciaAminoacidos(p.pdbText); const m = {};
    f.itens.forEach((it) => (m[it.aa] = it.porcentagem));
    return { x: aas, y: aas.map((a) => m[a] || 0), type: "bar", name: p.id, marker: { color: CORES_CADEIA[i % CORES_CADEIA.length] } };
  });
  return { data, layout: { title: "Composição de aminoácidos por proteína", barmode: "group", xaxis: { title: "Aminoácido" }, yaxis: { title: "%" } } };
}
function specCmpPocketBar(principais, chave, titulo, ytit, cor) {
  return { data: [{ x: principais.map((p) => p.prot), y: principais.map((p) => p[chave]), type: "bar", marker: { color: cor } }],
    layout: { title: titulo, xaxis: { title: "Proteína" }, yaxis: { title: ytit } } };
}

// --- textos analíticos ---
function corrTexto(corr) {
  if (corr == null) return "dados insuficientes para avaliar.";
  const f = Math.abs(corr) >= 0.7 ? "forte" : Math.abs(corr) >= 0.4 ? "moderada" : "fraca";
  return `correlação ${corr >= 0 ? "positiva" : "negativa"} ${f} (r = ${corr.toFixed(2)}).`;
}
function textoAnalisePocketsSingle(pk) {
  const mv = maxPor(pk, "volume"), mp = maxPor(pk, "depth"), mh = maxPor(pk, "hydrophobicity"), md = maxPor(pk, "drugScore");
  return [
    `Maior volume: ${mv ? `${mv.name} (${fmt(mv.volume)} Å³)` : "—"}`,
    `Mais profundo: ${mp ? `${mp.name} (${fmt(mp.depth)})` : "—"}`,
    `Volume × profundidade: ${corrTexto(pearson(pk.map((p) => p.volume), pk.map((p) => p.depth)))}`,
    `Mais hidrofóbico: ${mh ? `${mh.name} (${fmt(mh.hydrophobicity)})` : "—"}`,
    `Sugestão para docking: ${md ? `${md.name} (drugScore ${fmt(md.drugScore, 3)})` : "—"}`,
  ];
}
function textoAnalisePocketsCmp(resultado) {
  const principais = [], todos = [];
  for (const r of resultado) {
    const o = [...r.pockets].filter((p) => p.volume != null).sort((a, b) => b.volume - a.volume);
    if (o.length) principais.push({ prot: r.id, ...o[0] });
    for (const pk of r.pockets) todos.push({ prot: r.id, ...pk });
  }
  const mv = maxPor(todos, "volume"), mp = maxPor(todos, "depth"), md = maxPor(todos, "drugScore");
  const rh = [...principais].filter((p) => p.hydrophobicity != null).sort((a, b) => b.hydrophobicity - a.hydrophobicity)
    .slice(0, 2).map((p) => `${p.prot} (${fmt(p.hydrophobicity)})`).join(", ");
  return { principais, linhas: [
    `Proteína com pocket de maior volume: ${mv ? `${mv.prot} — ${mv.name} (${fmt(mv.volume)} Å³)` : "—"}`,
    `Proteína com pocket mais profundo: ${mp ? `${mp.prot} — ${mp.name} (${fmt(mp.depth)})` : "—"}`,
    `Volume × profundidade: ${corrTexto(pearson(principais.map((p) => p.volume), principais.map((p) => p.depth)))}`,
    `Proteínas mais hidrofóbicas: ${rh || "—"}`,
    `Pocket sugerido para docking: ${md ? `${md.prot} — ${md.name} (drugScore ${fmt(md.drugScore, 3)})` : "—"}`,
  ] };
}

// --- Markdown ---
async function exportarMdSingle(secoes) {
  const d = estado.dados, st = d.estatisticas;
  const totalAt = st.cadeias.reduce((s, c) => s + c.atomos, 0);
  const totalRes = st.cadeias.reduce((s, c) => s + c.residuos, 0);
  let md = `# PEKI Fold — Análise de ${estado.nome}\n\n*Protein Exploration Kit for Insights*\n\n`;
  md += `Gerado em ${new Date().toLocaleString("pt-BR")} · ${d.cadeias.length} cadeia(s) · ${totalRes} resíduos · ${totalAt} átomos.\n\n`;
  if (secoes.includes("meta") && estado.meta) {
    md += `## Sobre a estrutura\n\n`;
    if (estado.meta.titulo) md += `**${estado.meta.titulo}**\n\n`;
    md += metaLinhas().map(([k, v]) => `- ${k}: ${v}`).join("\n") + `\n\n`;
  }
  if (secoes.includes("viewer")) { const im = imgViewer(); if (im) md += `## Estrutura 3D\n\n![Estrutura 3D](${im})\n\n`; }
  if (secoes.includes("cadeias")) md += `## Cadeias\n\n` + mdTabela(["Cadeia", "Resíduos", "Átomos", "Aa diferentes"], st.cadeias.map((c) => [c.cadeia, c.residuos, c.atomos, c.aminoacidos_diferentes]));
  if (secoes.includes("stats")) {
    md += `## Estatísticas\n\n- Cadeias: ${st.cadeias.length}\n- Átomos: ${totalAt}\n- Resíduos: ${totalRes}\n`;
    if (st.maior && st.menor) md += `- Maior cadeia: ${st.maior.cadeia} (${st.maior.residuos} resíduos)\n- Menor cadeia: ${st.menor.cadeia} (${st.menor.residuos} resíduos)\n`;
    md += `\n`;
  }
  if (secoes.includes("aa")) { md += `## Aminoácidos\n\n`; for (const cid of d.cadeias) md += `**Cadeia ${cid}**\n\n![Aminoácidos cadeia ${cid}](${await imgPlotly(specAAChain(cid))})\n\n`; }
  if (secoes.includes("sequencias")) md += `## Sequências (FASTA)\n\n\`\`\`\n` + d.cadeias.map(seqFasta).join("") + `\`\`\`\n\n`;
  if (secoes.includes("motivos") && estado.ultimoMotivo) {
    const m = estado.ultimoMotivo;
    md += `## Motivos\n\nMotivo \`${m.motivo}\` — ${m.ocorrencias.length} ocorrência(s):\n\n` + mdTabela(["Cadeia", "Posição", "Resíduos"], m.ocorrencias.map((o) => [o.cadeia, o.posicao, o.residuos.join(", ")]));
  }
  if (secoes.includes("pockets") && estado.pockets) {
    const pk = estado.pockets;
    md += `## Pockets\n\n` + mdTabela(["Pocket", "Volume (Å³)", "Superfície (Å²)", "Profundidade", "Hidrofob.", "Aceptores", "Doadores", "DrugScore"],
      pk.map((p) => [p.name, fmt(p.volume), fmt(p.surface), fmt(p.depth), fmt(p.hydrophobicity), p.accept ?? "—", p.donor ?? "—", fmt(p.drugScore, 3)]));
    md += `**Análise:**\n\n` + textoAnalisePocketsSingle(pk).map((s) => `- ${s}`).join("\n") + `\n\n`;
    md += `![Volume por pocket](${await imgPlotly(specPocketBar(pk, "volume", "Volume por pocket", "Volume (Å³)", "#2a5599"))})\n\n`;
    md += `![Profundidade por pocket](${await imgPlotly(specPocketBar(pk, "depth", "Profundidade por pocket", "Profundidade", "#e8513a"))})\n\n`;
  }
  md += `---\n${CREDITO}\n`;
  baixarTexto(exportBase() + ".md", md, "text/markdown;charset=utf-8");
}

async function exportarMdCmp(secoes) {
  const ps = estado.comparacao;
  let md = `# PEKI Fold — Comparação\n\n*Protein Exploration Kit for Insights*\n\nProteínas: ${ps.map((p) => p.id).join(", ")} · gerado em ${new Date().toLocaleString("pt-BR")}.\n\n`;
  if (secoes.includes("stats")) {
    const res = ps.map(resumoProteina);
    md += `## Estatísticas\n\n` + mdTabela(["Proteína", "Cadeias", "Átomos", "Resíduos", "Aa diferentes"], res.map((r) => [r.id, r.cadeias, r.atomos, r.residuos, r.aaDiferentes]));
    md += `![Resíduos por proteína](${await imgPlotly(specCmpStats())})\n\n`;
  }
  if (secoes.includes("aa")) md += `## Aminoácidos\n\n![Composição de aminoácidos](${await imgPlotly(specCmpAA(), 900, 420)})\n\n`;
  if (secoes.includes("pockets") && estado.cmpPockets) {
    const an = textoAnalisePocketsCmp(estado.cmpPockets);
    md += `## Pockets\n\n### Pocket principal por proteína\n\n` + mdTabela(["Proteína", "Pocket", "Volume (Å³)", "Profundidade", "Hidrofob.", "DrugScore"],
      an.principais.map((p) => [p.prot, p.name, fmt(p.volume), fmt(p.depth), fmt(p.hydrophobicity), fmt(p.drugScore, 3)]));
    md += `**Comparação (perguntas do trabalho):**\n\n` + an.linhas.map((s) => `- ${s}`).join("\n") + `\n\n`;
    md += `![Volume](${await imgPlotly(specCmpPocketBar(an.principais, "volume", "Volume do pocket principal", "Volume (Å³)", "#2a5599"))})\n\n`;
    md += `![Profundidade](${await imgPlotly(specCmpPocketBar(an.principais, "depth", "Profundidade do pocket principal", "Profundidade", "#e8513a"))})\n\n`;
    md += `![Hidrofobicidade](${await imgPlotly(specCmpPocketBar(an.principais, "hydrophobicity", "Hidrofobicidade do pocket principal", "Hidrofobicidade", "#9b59b6"))})\n\n`;
  }
  md += `---\n${CREDITO}\n`;
  baixarTexto(exportBase() + ".md", md, "text/markdown;charset=utf-8");
}

// --- PDF ---
function pdfHelper(doc) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;
  const ensure = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  return {
    titulo(t) { ensure(34); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(14, 58, 46); doc.text(t, M, y); y += 26; doc.setTextColor(40); doc.setFont("helvetica", "normal"); },
    sub(t) { ensure(26); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(14, 58, 46); doc.text(t, M, y); y += 18; doc.setTextColor(40); doc.setFont("helvetica", "normal"); },
    par(t) { doc.setFontSize(10); const lines = doc.splitTextToSize(t, W - 2 * M); ensure(lines.length * 13 + 4); doc.text(lines, M, y); y += lines.length * 13 + 6; },
    img(dataUri, maxW) {
      if (!dataUri) return;
      const props = doc.getImageProperties(dataUri);
      const w = Math.min(maxW || (W - 2 * M), W - 2 * M);
      const h = w * props.height / props.width;
      ensure(h + 10); doc.addImage(dataUri, "PNG", M, y, w, h); y += h + 12;
    },
    tabela(head, body) {
      doc.autoTable({ startY: y, head: [head], body, margin: { left: M, right: M }, styles: { fontSize: 9 }, headStyles: { fillColor: [14, 58, 46] } });
      y = doc.lastAutoTable.finalY + 14;
    },
    espaco(n) { y += (n || 8); },
  };
}

async function exportarPdfSingle(secoes) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const h = pdfHelper(doc);
  const d = estado.dados, st = d.estatisticas;
  const totalAt = st.cadeias.reduce((s, c) => s + c.atomos, 0);
  const totalRes = st.cadeias.reduce((s, c) => s + c.residuos, 0);
  h.titulo(`PEKI Fold — ${estado.nome}`);
  h.par(`Protein Exploration Kit for Insights · gerado em ${new Date().toLocaleString("pt-BR")}`);
  h.par(`${d.cadeias.length} cadeia(s) · ${totalRes} resíduos · ${totalAt} átomos.`);
  if (secoes.includes("meta") && estado.meta) {
    h.sub("Sobre a estrutura");
    if (estado.meta.titulo) h.par(estado.meta.titulo);
    const ml = metaLinhas(); if (ml.length) h.tabela(["Campo", "Valor"], ml);
  }
  if (secoes.includes("viewer")) { const im = imgViewer(); if (im) { h.sub("Estrutura 3D"); h.img(im, 320); } }
  if (secoes.includes("cadeias")) { h.sub("Cadeias"); h.tabela(["Cadeia", "Resíduos", "Átomos", "Aa diferentes"], st.cadeias.map((c) => [c.cadeia, c.residuos, c.atomos, c.aminoacidos_diferentes])); }
  if (secoes.includes("stats")) {
    h.sub("Estatísticas");
    const rows = [["Cadeias", st.cadeias.length], ["Átomos", totalAt], ["Resíduos", totalRes]];
    if (st.maior && st.menor) { rows.push(["Maior cadeia", `${st.maior.cadeia} (${st.maior.residuos} res.)`]); rows.push(["Menor cadeia", `${st.menor.cadeia} (${st.menor.residuos} res.)`]); }
    h.tabela(["Métrica", "Valor"], rows);
  }
  if (secoes.includes("aa")) { h.sub("Aminoácidos"); for (const cid of d.cadeias) h.img(await imgPlotly(specAAChain(cid))); }
  if (secoes.includes("sequencias")) {
    h.sub("Sequências (FASTA)");
    doc.setFont("courier", "normal");
    for (const cid of d.cadeias) h.par(seqFasta(cid).trim());
    doc.setFont("helvetica", "normal");
  }
  if (secoes.includes("motivos") && estado.ultimoMotivo) {
    const m = estado.ultimoMotivo; h.sub("Motivos"); h.par(`Motivo ${m.motivo} — ${m.ocorrencias.length} ocorrência(s).`);
    h.tabela(["Cadeia", "Posição", "Resíduos"], m.ocorrencias.map((o) => [o.cadeia, o.posicao, o.residuos.join(", ")]));
  }
  if (secoes.includes("pockets") && estado.pockets) {
    const pk = estado.pockets; h.sub("Pockets");
    h.tabela(["Pocket", "Vol (Å³)", "Sup (Å²)", "Prof", "Hidr.", "Acc", "Don", "Drug"],
      pk.map((p) => [p.name, fmt(p.volume), fmt(p.surface), fmt(p.depth), fmt(p.hydrophobicity), p.accept ?? "—", p.donor ?? "—", fmt(p.drugScore, 3)]));
    textoAnalisePocketsSingle(pk).forEach((s) => h.par("• " + s));
    h.img(await imgPlotly(specPocketBar(pk, "volume", "Volume por pocket", "Volume (Å³)", "#2a5599")));
    h.img(await imgPlotly(specPocketBar(pk, "depth", "Profundidade por pocket", "Profundidade", "#e8513a")));
  }
  h.espaco(6); doc.setFontSize(8); doc.setTextColor(120); h.par(CREDITO);
  doc.save(exportBase() + ".pdf");
}

async function exportarPdfCmp(secoes) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const h = pdfHelper(doc);
  const ps = estado.comparacao;
  h.titulo("PEKI Fold — Comparação");
  h.par(`Protein Exploration Kit for Insights · ${ps.map((p) => p.id).join(", ")} · gerado em ${new Date().toLocaleString("pt-BR")}`);
  if (secoes.includes("stats")) {
    const res = ps.map(resumoProteina); h.sub("Estatísticas");
    h.tabela(["Proteína", "Cadeias", "Átomos", "Resíduos", "Aa diferentes"], res.map((r) => [r.id, r.cadeias, r.atomos, r.residuos, r.aaDiferentes]));
    h.img(await imgPlotly(specCmpStats()));
  }
  if (secoes.includes("aa")) { h.sub("Aminoácidos"); h.img(await imgPlotly(specCmpAA(), 900, 420)); }
  if (secoes.includes("pockets") && estado.cmpPockets) {
    const an = textoAnalisePocketsCmp(estado.cmpPockets); h.sub("Pockets — pocket principal por proteína");
    h.tabela(["Proteína", "Pocket", "Volume (Å³)", "Profundidade", "Hidrofob.", "DrugScore"],
      an.principais.map((p) => [p.prot, p.name, fmt(p.volume), fmt(p.depth), fmt(p.hydrophobicity), fmt(p.drugScore, 3)]));
    an.linhas.forEach((s) => h.par("• " + s));
    h.img(await imgPlotly(specCmpPocketBar(an.principais, "volume", "Volume do pocket principal", "Volume (Å³)", "#2a5599")));
    h.img(await imgPlotly(specCmpPocketBar(an.principais, "depth", "Profundidade do pocket principal", "Profundidade", "#e8513a")));
    h.img(await imgPlotly(specCmpPocketBar(an.principais, "hydrophobicity", "Hidrofobicidade do pocket principal", "Hidrofobicidade", "#9b59b6")));
  }
  h.espaco(6); doc.setFontSize(8); doc.setTextColor(120); h.par(CREDITO);
  doc.save(exportBase() + ".pdf");
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

  // exportação
  $("#btn-export").addEventListener("click", () => abrirExport("single"));
  $("#btn-cmp-export").addEventListener("click", () => abrirExport("cmp"));
  $("#exp-cancelar").addEventListener("click", fecharExport);
  $("#exp-confirmar").addEventListener("click", confirmarExport);
  $("#exp-full").addEventListener("change", (e) => { $$(".exp-item").forEach((c) => (c.checked = e.target.checked)); });
  $("#exp-itens").addEventListener("change", () => { $("#exp-full").checked = $$(".exp-item").every((c) => c.checked); });
  $("#export-modal").addEventListener("click", (e) => { if (e.target.id === "export-modal") fecharExport(); });
}

document.addEventListener("DOMContentLoaded", init);
