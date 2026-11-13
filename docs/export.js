"use strict";

function baseNome() { return (estado.nome || "protein").replace(/\.[^.]+$/, ""); }

// Sequência da cadeia em formato FASTA (quebrada em linhas de 60 caracteres).
function seqFasta(cid) {
  const seq = estado.dados.sequencias[cid] || "";
  const linhas = seq.match(/.{1,60}/g) || [""];
  return `>${baseNome()}_${cid}\n${linhas.join("\n")}\n`;
}

function baixarCadeia(chain) {
  if (!estado.pdbText || (estado.estrutura && estado.estrutura.recursos.cadeiaPdb === "bloqueado")) {
    alert((estado.estrutura && estado.estrutura.recursos.cadeiaPdbMotivo) || "Esta versão não grava a cadeia em PDB para este formato.");
    return;
  }
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

function baixarCsvAA() {
  const freq = frequenciaDoEscopo(estado.dados, $("#aa-cadeia").value);
  if (!freq) return;
  let csv = "Aminoacido,Contagem,Porcentagem\n";
  for (const i of itensAAOrdenados(freq)) csv += `${i.aa},${i.contagem},${i.porcentagem}\n`;
  const sufixo = freq.escopo === "todas" ? "todas" : freq.cadeia;
  baixarTexto(`${baseNome()}_${sufixo}_aminoacidos.csv`, csv, "text/csv;charset=utf-8");
}

// ----- exportação (PDF / Markdown) -----
// As seções disponíveis dependem do contexto (proteína única ou comparação)
// e do que já foi calculado. Imagens vêm do viewer 3D (3Dmol) e dos gráficos
// (Plotly.toImage a partir de specs, para não depender da aba estar visível).
let exportContexto = "single";
let exportAcionador = null;
let exportFecharTimer = null;
let exportFallback = false;

const EXPORT_SECOES = {
  single: () => [
    { id: "visao", label: "Visão geral", on: () => !!estado.estrutura },
    { id: "qualidade", label: "Qualidade e componentes", on: () => !!estado.estrutura },
    { id: "meta", label: "Sobre a estrutura", on: () => !!(estado.meta && (estado.meta.titulo || estado.meta.classificacao || estado.meta.organismos?.length)) },
    { id: "viewer", label: "Estrutura 3D (imagem)", on: () => !!estado.viewer },
    { id: "cadeias", label: "Cadeias", on: () => !!estado.dados },
    { id: "stats", label: "Estatísticas", on: () => !!estado.dados },
    { id: "aa", label: "Aminoácidos (gráficos)", on: () => !!estado.dados },
    { id: "sequencias", label: "Sequências (FASTA)", on: () => !!estado.dados },
    { id: "motivos", label: "Motivos", on: () => !!estado.ultimoMotivo },
    { id: "pockets", label: "Pockets", on: () => !!estado.pockets },
    { id: "preparo", label: "Ficha de preparo", on: () => typeof PrepUI !== "undefined" && PrepUI.ativo() && PrepUI.temFicha() },
  ],
  cmp: () => [
    { id: "stats", label: "Estatísticas", on: () => !!estado.comparacao },
    { id: "aa", label: "Aminoácidos (gráfico)", on: () => !!estado.comparacao },
    { id: "pockets", label: "Pockets", on: () => !!estado.cmpPockets },
  ],
};

function abrirExport(ctx, acionador = document.activeElement) {
  clearTimeout(exportFecharTimer);
  exportAcionador = acionador;
  exportContexto = ctx;
  const itens = EXPORT_SECOES[ctx]().filter((s) => s.on());
  $("#exp-itens").innerHTML = itens.map((s) =>
    `<label><input type="checkbox" class="exp-item" value="${s.id}" checked /> ${s.label}</label>`
  ).join("");
  $("#exp-full").checked = true;
  $("#exp-so-pockets").hidden = !itens.some((s) => s.id === "pockets");
  $("#exp-status").textContent = "";
  const dialogo = $("#export-modal");
  if (!dialogo.open) {
    exportFallback = typeof dialogo.showModal !== "function";
    if (exportFallback) {
      dialogo.setAttribute("open", "");
      dialogo.setAttribute("data-fallback", "");
      dialogo.setAttribute("role", "dialog");
      dialogo.setAttribute("aria-modal", "true");
      document.addEventListener("focusin", manterFocoExportFallback);
    } else dialogo.showModal();
  }
  dialogo.querySelector("input").focus();
}

function fecharExport(devolverFoco = true) {
  if (devolverFoco === false) exportAcionador = null;
  const dialogo = $("#export-modal");
  if (exportFallback) {
    dialogo.removeAttribute("open");
    aoFecharExport();
  } else dialogo.close();
}

function aoFecharExport() {
  clearTimeout(exportFecharTimer);
  if (exportFallback) {
    document.removeEventListener("focusin", manterFocoExportFallback);
    const dialogo = $("#export-modal");
    ["data-fallback", "role", "aria-modal"].forEach((atributo) => dialogo.removeAttribute(atributo));
    exportFallback = false;
  }
  if (exportAcionador && exportAcionador.isConnected) exportAcionador.focus();
  exportAcionador = null;
}

function manterFocoExportFallback(ev) {
  const dialogo = $("#export-modal");
  if (exportFallback && !dialogo.contains(ev.target)) dialogo.querySelector("input").focus();
}

function conterFocoExport(ev) {
  if (ev.key === "Escape" && exportFallback) {
    ev.preventDefault();
    fecharExport();
    return;
  }
  if (ev.key !== "Tab") return;
  const visiveis = Array.from(ev.currentTarget.querySelectorAll("input, select, textarea, button, a[href], [tabindex]"))
    .filter((el) => !el.disabled && el.tabIndex !== -1 && el.getClientRects().length > 0);
  // Um grupo de rádio ocupa uma única posição na navegação por Tab.
  const controles = visiveis.filter((el) => el.type !== "radio" || el.checked
    || !visiveis.some((outro) => outro.type === "radio" && outro.name === el.name && outro.checked));
  const i = controles.indexOf(document.activeElement);
  if (!controles.length) return;
  if (ev.shiftKey && i <= 0) {
    ev.preventDefault();
    controles[controles.length - 1].focus();
  } else if (!ev.shiftKey && (i < 0 || i === controles.length - 1)) {
    ev.preventDefault();
    controles[0].focus();
  }
}

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
    exportFecharTimer = setTimeout(fecharExport, 800);
  } catch (e) {
    $("#exp-status").innerHTML = `❌ ${e.message}`;
  }
}

// --- helpers de imagem e arquivo ---
async function imgPlotly(spec, w = 760, h = 400) {
  await libPlotly();
  return await Plotly.toImage(spec, { format: "png", width: w, height: h });
}
function guardarAnalise() {
  const status = $("#guardar-status");
  if (typeof AnalysisUI === "undefined" || typeof AnalysisSnapshot === "undefined") {
    if (status) status.textContent = "O módulo de análise guardada não carregou.";
    return;
  }
  try {
    const preparo = typeof PrepUI !== "undefined" && PrepUI.resumoAnalise ? PrepUI.resumoAnalise() : null;
    const salvo = AnalysisUI.guardarWorkspace(estado, (nome, texto) => {
      baixarTexto(nome, texto, "application/json;charset=utf-8");
    }, { preparo });
    if (status) {
      status.textContent = "Arquivo " + salvo.nome + " baixado neste computador. Ele não foi enviado a um servidor. Para comparar, reabra o JSON em Comparar análises guardadas.";
    }
  } catch (e) {
    if (status) status.textContent = e.message;
  }
}

function baixarTexto(nome, conteudo, mime) {
  const blob = new Blob([conteudo], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
function toCsv(headers, rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
function baixarCsvStats() {
  const st = estado.dados.estatisticas;
  const rows = st.cadeias.map((c) => [c.cadeia, c.atomos, c.residuos, c.aminoacidos_diferentes]);
  baixarTexto(`${baseNome()}_estatisticas.csv`, toCsv(["Cadeia", "Atomos", "Residuos", "Aminoacidos_diferentes"], rows), "text/csv;charset=utf-8");
}
function baixarCsvPockets() {
  if (!estado.pockets) return;
  const rows = pocketsOrdenados(estado.pockets).map(({ p }) => [p.name, p.volume ?? "", p.surface ?? "", p.depth ?? "", p.hydrophobicity ?? "", p.accept ?? "", p.donor ?? "", p.drugScore ?? ""]);
  baixarTexto(`${baseNome()}_pockets.csv`, toCsv(["Pocket", "Volume_A3", "Superficie_A2", "Profundidade", "Hidrofobicidade", "Aceptores", "Doadores", "DrugScore"], rows), "text/csv;charset=utf-8");
}
function baixarCsvCmpStats() {
  const rows = estado.comparacao.map(resumoProteina).map((r) => [r.id, r.cadeias, r.atomos, r.residuos, r.aaDiferentes]);
  baixarTexto(`PEKI-Fold_comparacao_${estado.comparacao.map((p) => p.id).join("-")}_estatisticas.csv`, toCsv(["Proteina", "Cadeias", "Atomos", "Residuos", "Aminoacidos_diferentes"], rows), "text/csv;charset=utf-8");
}
function baixarCsvCmpPockets() {
  if (!estado.cmpPockets) return;
  const rows = [];
  for (const r of estado.cmpPockets) for (const p of r.pockets) rows.push([r.id, p.name, p.volume ?? "", p.surface ?? "", p.depth ?? "", p.hydrophobicity ?? "", p.accept ?? "", p.donor ?? "", p.drugScore ?? ""]);
  baixarTexto(`PEKI-Fold_comparacao_${estado.cmpPockets.map((r) => r.id).join("-")}_pockets.csv`, toCsv(["Proteina", "Pocket", "Volume_A3", "Superficie_A2", "Profundidade", "Hidrofobicidade", "Aceptores", "Doadores", "DrugScore"], rows), "text/csv;charset=utf-8");
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
    `Maior drugScore (descritor geométrico, não é afinidade): ${md ? `${md.name} (${fmt(md.drugScore, 3)})` : "—"}`,
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
    `Maior drugScore (descritor geométrico, não é afinidade): ${md ? `${md.prot} — ${md.name} (${fmt(md.drugScore, 3)})` : "—"}`,
  ] };
}

// --- Markdown ---
async function exportarMdSingle(secoes) {
  const d = estado.dados, st = d.estatisticas;
  const totalAt = st.cadeias.reduce((s, c) => s + c.atomos, 0);
  const totalRes = st.cadeias.reduce((s, c) => s + c.residuos, 0);
  let md = `# PEKI Fold — Análise de ${estado.nome}\n\n*Protein Exploration Kit for Insights*\n\n`;
  md += `Gerado em ${new Date().toLocaleString("pt-BR")} · ${d.cadeias.length} cadeia(s) · ${totalRes} resíduos ATOM · ${totalAt} átomos ATOM.\n\n`;
  if (secoes.includes("visao") && estado.estrutura) md += `## Visão geral\n\n${StructureModel.textoVisao(estado.estrutura)}\n\n`;
  if (secoes.includes("qualidade") && estado.estrutura) {
    const texto = typeof QualityModel !== "undefined" ? QualityModel.textoDossie(estado.qualidade) : "Módulo de qualidade indisponível.";
    md += `## Qualidade e componentes\n\n${texto}\n\n`;
  }
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
    md += `> ${AVISO_DESCRITOR}\n\n`;
  }
  if (secoes.includes("preparo") && typeof PrepUI !== "undefined" && PrepUI.temFicha()) md += PrepUI.markdown();
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
    md += `> ${AVISO_DESCRITOR}\n\n`;
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
  await libPdf();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const h = pdfHelper(doc);
  const d = estado.dados, st = d.estatisticas;
  const totalAt = st.cadeias.reduce((s, c) => s + c.atomos, 0);
  const totalRes = st.cadeias.reduce((s, c) => s + c.residuos, 0);
  h.titulo(`PEKI Fold — ${estado.nome}`);
  h.par(`Protein Exploration Kit for Insights · gerado em ${new Date().toLocaleString("pt-BR")}`);
  h.par(`${d.cadeias.length} cadeia(s) · ${totalRes} resíduos ATOM · ${totalAt} átomos ATOM.`);
  if (secoes.includes("visao") && estado.estrutura) {
    h.sub("Visão geral");
    StructureModel.textoVisao(estado.estrutura).split("\n").forEach((linha) => { if (linha.trim()) h.par(linha); });
  }
  if (secoes.includes("qualidade") && estado.estrutura) {
    h.sub("Qualidade e componentes");
    const texto = typeof QualityModel !== "undefined" ? QualityModel.textoDossie(estado.qualidade) : "Módulo de qualidade indisponível.";
    texto.split("\n").forEach((linha) => { if (linha.trim()) h.par(linha); });
  }
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
    h.par(AVISO_DESCRITOR);
    h.img(await imgPlotly(specPocketBar(pk, "volume", "Volume por pocket", "Volume (Å³)", "#2a5599")));
    h.img(await imgPlotly(specPocketBar(pk, "depth", "Profundidade por pocket", "Profundidade", "#e8513a")));
  }
  if (secoes.includes("preparo") && typeof PrepUI !== "undefined" && PrepUI.temFicha()) PrepUI.anexarPdf(h);
  h.espaco(6); doc.setFontSize(8); doc.setTextColor(120); h.par(CREDITO);
  doc.save(exportBase() + ".pdf");
}

async function exportarPdfCmp(secoes) {
  await libPdf();
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
    h.par(AVISO_DESCRITOR);
    h.img(await imgPlotly(specCmpPocketBar(an.principais, "volume", "Volume do pocket principal", "Volume (Å³)", "#2a5599")));
    h.img(await imgPlotly(specCmpPocketBar(an.principais, "depth", "Profundidade do pocket principal", "Profundidade", "#e8513a")));
    h.img(await imgPlotly(specCmpPocketBar(an.principais, "hydrophobicity", "Hidrofobicidade do pocket principal", "Hidrofobicidade", "#9b59b6")));
  }
  h.espaco(6); doc.setFontSize(8); doc.setTextColor(120); h.par(CREDITO);
  doc.save(exportBase() + ".pdf");
}
