"use strict";

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
      if (typeof StructureModel !== "undefined" && !StructureModel.pareceCoordenadaPdb(texto)) {
        throw new Error(`A comparação desta versão só lê PDB. O arquivo de ${id} não foi interpretado como colunas PDB.`);
      }
      ProtAnalysis.validar(texto);
      proteinas.push({ id, pdbText: texto, dados: ProtAnalysis.analisarCompleto(texto) });
    }
    estado.comparacao = proteinas;
    estado.cmpPockets = null;
    await iniciarComparacao();
    atualizarURL("compare", ids.join(","));
  } catch (e) {
    mostrarErro(e.message);
  } finally {
    setLoading(false);
  }
}

async function iniciarComparacao() {
  await lib3D();
  const ps = estado.comparacao;
  $("#entrada").hidden = true;
  $("#workspace").hidden = true;
  $("#comparacao").hidden = false;
  const painelAnalises = $("#analises");
  if (painelAnalises) painelAnalises.hidden = true;

  $("#cmp-titulo").textContent = "Comparação: " + ps.map((p) => p.id).join(" · ");
  $("#cmp-resumo").textContent = `${ps.length} proteínas`;

  renderCmpViewers();
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

async function renderCmpStats() {
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
  html += `</tbody></table><div class="tab-acoes"><button id="btn-cmp-stats-csv" class="dl-btn">⬇ CSV</button></div><div id="cmp-graf-stats" class="grafico"></div>`;
  cont.innerHTML = html;
  $("#btn-cmp-stats-csv").addEventListener("click", baixarCsvCmpStats);

  await libPlotly();
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

async function plotCmpAA() {
  await libPlotly();
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
    let descartadas = 0;
    for (let i = 0; i < estado.comparacao.length; i++) {
      const p = estado.comparacao[i];
      const cacheado = !!POCKETS_CACHE[p.id.toUpperCase()];
      status.innerHTML = `<span class="spinner"></span> ${cacheado ? "Carregando" : "Calculando"} pockets de ${p.id} (${i + 1}/${estado.comparacao.length})…`;
      const pacote = await obterPockets(p.id);
      const { pockets } = pacote;
      descartadas += pacote.descartadas || 0;
      resultado.push({ id: p.id, pockets });
    }
    estado.cmpPockets = resultado;
    status.textContent = `✓ Pockets detectados para ${resultado.length} proteínas.` + avisoLinhasPocket(descartadas);
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
  let html = `<div class="tab-acoes"><button id="btn-cmp-pockets-csv" class="dl-btn">⬇ CSV (todos os pockets)</button></div>`;
  html += `<h4 style="margin-top:14px">Pocket principal por proteína</h4>
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
      <li><strong>Maior drugScore:</strong> ${melhorDrug
        ? `${melhorDrug.prot} — ${melhorDrug.name} (${fmt(melhorDrug.drugScore, 3)}). O drugScore é um descritor geométrico; volume ${fmt(melhorDrug.volume)} Å³ e profundidade ${fmt(melhorDrug.depth)}.`
        : "—"}</li>
    </ol>
    <p class="rotulo-fixo">${AVISO_DESCRITOR}</p>
  </div>
  <div id="cmp-graf-pvol" class="grafico"></div>
  <div id="cmp-graf-pdepth" class="grafico"></div>
  <div id="cmp-graf-phydro" class="grafico"></div>`;

  cont.innerHTML = html;
  $("#btn-cmp-pockets-csv").addEventListener("click", baixarCsvCmpPockets);
  plotCmpPockets(principais);
}

async function plotCmpPockets(principais) {
  await libPlotly();
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
    if (!window.Plotly) return;
    if (nome === "stats") Plotly.Plots.resize("cmp-graf-stats");
    if (nome === "aa") Plotly.Plots.resize("cmp-graf-aa");
    if (nome === "pockets" && estado.cmpPockets) {
      ["cmp-graf-pvol", "cmp-graf-pdepth", "cmp-graf-phydro"].forEach((d) => Plotly.Plots.resize(d));
    }
  }, 50);
}
