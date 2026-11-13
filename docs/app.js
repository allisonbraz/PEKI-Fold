// PEKI Fold (Protein Exploration Kit for Insights) - frontend estatico (GitHub Pages).
// Toda a analise roda no navegador (ProtAnalysis). Nao ha backend:
// - upload e lido com FileReader;
// - busca por ID baixa o PDB direto do RCSB (CORS habilitado).

"use strict";

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
  cmpViewers: [],     // viewers 3D (um por proteina) no modo comparacao
  ultimoMotivo: null, // {motivo, ocorrencias} da ultima busca (para exportacao)
  motivoNo3D: null,   // ocorrencias amarelas ainda desenhadas; o estilo zera este destaque
  cadeiasOcultas: null, // Set de cadeias fora do desenho 3D; nao entra em contagem nem arquivo
  superficie: null,   // estado da superficie 3D: null | {sels, color, opacity, origem}
  vistaPocket: null,  // pocket no 3D: null | {idx, nome, visivel, sels, superficieAnterior}
  pocketSort: null,   // {col, dir} de ordenacao da tabela de pockets
  textoViewer: null,
  viewerFormato: "pdb",
  estrutura: null,    // contrato peki-estrutura-1
  qualidade: null,    // contrato peki-qualidade-1, preenchido pela aba Qualidade
};

// Cada consulta guarda a geração da estrutura e sua própria sequência.
let geracaoEstrutura = 0;
const sequenciasConsulta = new Map();
function novaConsulta(chave) {
  const g = geracaoEstrutura;
  const seq = (sequenciasConsulta.get(chave) || 0) + 1;
  sequenciasConsulta.set(chave, seq);
  return () => g === geracaoEstrutura && seq === sequenciasConsulta.get(chave);
}

function invalidarConsultasEstrutura() {
  geracaoEstrutura += 1;
  setLoading(false);
  buscaNomeSeq += 1;
  if (typeof geracaoVistaPocket !== "undefined") geracaoVistaPocket += 1;
  if (typeof QualityUI !== "undefined") QualityUI.invalidar();
  if (typeof PrepUI !== "undefined" && PrepUI.invalidarConsultas) PrepUI.invalidarConsultas();
  if (typeof EnsembleUI !== "undefined" && EnsembleUI.invalidarConsultas) EnsembleUI.invalidarConsultas();
  return geracaoEstrutura;
}

// Volta para a tela inicial (home), limpando a análise e a URL.
function irParaHome() {
  invalidarConsultasEstrutura();
  if (typeof EnsembleUI !== "undefined" && EnsembleUI.aoFechar) EnsembleUI.aoFechar();
  const ens = $("#ensemble");
  if (ens) ens.hidden = true;
  const analises = $("#analises");
  if (analises) analises.hidden = true;
  if (typeof AnalysisUI !== "undefined" && AnalysisUI.aoFechar) AnalysisUI.aoFechar();
  $("#workspace").hidden = true;
  $("#comparacao").hidden = true;
  $("#entrada").hidden = false;
  $("#pdb-id").value = "";
  $("#file-input").value = "";
  $("#cmp-ids").value = "";
  limparPainelBusca();
  atualizarRotuloEntrada();
  limparErro();
  atualizarURL();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Atualiza a query string para permitir compartilhar/recarregar a análise por link.
function atualizarURL(chave, valor) {
  const u = new URL(location.href);
  u.search = valor ? `?${chave}=${valor}` : "";
  history.replaceState(null, "", u);
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
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
    resp = await PekiRede.fetch(url);
  } catch (e) {
    if (PekiRede.ehTimeout(e)) throw e;
    throw new Error("Sem conexão com o RCSB (ou bloqueio de rede).");
  }
  if (resp.status === 404) throw new Error(`PDB '${pdbId}' não encontrado no RCSB.`);
  if (!resp.ok) throw new Error(`Erro ao acessar o RCSB (${resp.status}).`);
  return await resp.text();
}

// A análise individual prefere o PDB. O mmCIF só entra quando o PDB não traz
// coordenadas. Comparação e Ensemble continuam em baixarRCSB, que devolve PDB.
async function baixarEntrada(pdbId) {
  pdbId = pdbId.trim().toUpperCase();
  if (typeof StructureModel === "undefined" || !StructureModel.idClassico(pdbId)) {
    throw new Error("ID de PDB inválido (ex.: 1A00). Esta versão não aceita ID estendido.");
  }
  let pdbTexto = "";
  let pdbStatus = 0;
  try {
    const resp = await PekiRede.fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);
    pdbStatus = resp.status;
    if (resp.ok) pdbTexto = await resp.text();
  } catch (e) {
    if (PekiRede.ehTimeout(e)) throw e;
    throw new Error("Sem conexão com o RCSB (ou bloqueio de rede).");
  }
  if (StructureModel.pareceCoordenadaPdb(pdbTexto)) return { texto: pdbTexto, nome: `${pdbId}.pdb` };
  let cifTexto = "";
  let cifStatus = 0;
  try {
    const resp = await PekiRede.fetch(`https://files.rcsb.org/download/${pdbId}.cif`);
    cifStatus = resp.status;
    if (resp.ok) cifTexto = await resp.text();
  } catch (e) {
    if (PekiRede.ehTimeout(e)) throw e;
    throw new Error("Sem conexão com o RCSB (ou bloqueio de rede).");
  }
  const escolha = StructureModel.escolherEntrada("", cifTexto);
  if (!escolha) {
    if (pdbStatus === 404 && cifStatus === 404) throw new Error(`PDB '${pdbId}' não encontrado no RCSB.`);
    throw new Error(`O RCSB não devolveu coordenadas PDB nem mmCIF para '${pdbId}'.`);
  }
  return { texto: escolha.texto, nome: `${pdbId}.cif` };
}

async function analisar({ pdbId, file }) {
  const g = invalidarConsultasEstrutura();
  limparErro();
  setLoading(true);
  try {
    let texto, nome, id = null;
    if (file) {
      texto = await lerArquivo(file);
      nome = file.name || "estrutura.pdb";
    } else if (pdbId) {
      id = pdbId.trim().toUpperCase();
      const baixado = await baixarEntrada(id);
      texto = baixado.texto;
      nome = baixado.nome;
    } else {
      throw new Error("Envie um arquivo ou informe um ID.");
    }

    if (g !== geracaoEstrutura) return;
    if (typeof StructureModel === "undefined") throw new Error("Leitor de estrutura indisponível.");
    const lido = StructureModel.ler(texto);
    if (!lido.ok) throw new Error(lido.erro.mensagem);
    const dados = lido.analise;
    dados.nome = nome;
    dados.pdb_text = lido.textoPdb;
    dados.pdb_id = id;
    dados.nModelos = lido.estrutura.modelo.total;
    dados.estrutura = lido.estrutura;
    dados.textoViewer = lido.textoViewer;
    dados.viewerFormato = lido.viewerFormato;
    await iniciarWorkspace(dados, g);
    if (g !== geracaoEstrutura) return;
    if (id) { enriquecerMetaRCSB(id); atualizarURL("pdb", id); } // enriquece + URL compartilhável
  } catch (e) {
    if (g === geracaoEstrutura) mostrarErro(e.message);
  } finally {
    if (g === geracaoEstrutura) setLoading(false);
  }
}

// ----- workspace -----
async function iniciarWorkspace(dados, g = geracaoEstrutura) {
  await lib3D();
  if (g !== geracaoEstrutura) return;
  estado.pdbText = dados.pdb_text;
  estado.textoViewer = dados.textoViewer || dados.pdb_text;
  estado.viewerFormato = dados.viewerFormato || "pdb";
  estado.estrutura = dados.estrutura || null;
  estado.qualidade = null;
  estado.nome = dados.nome;
  estado.pdbId = dados.pdb_id || null;
  estado.dados = dados;
  estado.pockets = null;
  estado.pocketsRaw = null;
  estado.pocketsInfo = null;
  estado.ultimoMotivo = null;
  estado.motivoNo3D = null;
  estado.cadeiasOcultas = new Set();
  estado.superficie = null;
  invalidarVistaPocket();
  estado.pocketSort = null;
  estado.meta = dados.pdb_text ? ProtAnalysis.extrairMetadados(dados.pdb_text) : metaVazio();
  if (dados.nModelos > 1) estado.meta.modelos = dados.nModelos;
  completarMeta(estado.meta, estado.estrutura);

  estado.corPorCadeia = {};
  dados.cadeias.forEach((cid, i) => {
    estado.corPorCadeia[cid] = CORES_CADEIA[i % CORES_CADEIA.length];
  });

  $("#entrada").hidden = true;
  $("#workspace").hidden = false;
  const painelAnalises = $("#analises");
  if (painelAnalises) painelAnalises.hidden = true;
  $("#ws-nome").textContent = dados.nome;

  const totalRes = dados.estatisticas.cadeias.reduce((s, c) => s + c.residuos, 0);
  $("#ws-resumo").textContent = resumoCabecalho(dados, totalRes);

  renderMeta();
  renderVisao();
  if (typeof PrepUI !== "undefined") PrepUI.reiniciar();
  renderViewer();
  renderCadeias();
  if (estado.viewer) { estado.viewer.resize(); estado.viewer.render(); }
  renderStats();
  renderAA();
  renderPockets();
  const campoMotivo = $("#motivo-input");
  if (campoMotivo) campoMotivo.value = "";
  const avisoMotivo = $("#motivo-aviso");
  if (avisoMotivo) { avisoMotivo.hidden = true; avisoMotivo.textContent = ""; }
  $("#motivo-resultado").innerHTML = "";
  renderMotivos();
  if (typeof PrepUI !== "undefined" && PrepUI.ativo()) {
    try { PrepUI.aoCarregar(estado); }
    catch (e) {
      const el = document.getElementById("tab-preparo");
      if (el) el.textContent = "Não foi possível montar a ficha de preparo.";
    }
  }

  trocarAba("visao");
  if (typeof QualityUI !== "undefined") {
    try {
      QualityUI.aoCarregar(estado, () => {
        if (!$("#workspace").hidden && estado.estrutura) renderVisao();
      });
    } catch (e) { /* a aba Qualidade permanece utilizável nas outras seções */ }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function metaVazio() {
  return {
    id: null, classificacao: null, data: null, titulo: null, metodo: null,
    resolucao: null, organismos: [], moleculas: [], ligantes: [],
  };
}

function completarMeta(meta, est) {
  if (!est) return meta;
  const idn = est.identidade || {};
  if (!meta.titulo && idn.titulo) meta.titulo = idn.titulo;
  if (!meta.metodo && idn.metodo) meta.metodo = idn.metodo;
  if (meta.resolucao == null && idn.resolucao != null) meta.resolucao = idn.resolucao;
  if (!meta.classificacao && idn.classificacao) meta.classificacao = idn.classificacao;
  if (!meta.id && idn.id) meta.id = idn.id;
  if ((!meta.organismos || !meta.organismos.length) && idn.organismos && idn.organismos.length) {
    meta.organismos = idn.organismos.slice();
  }
  if (!meta.ligantes || !meta.ligantes.length) {
    const ligs = [];
    for (const h of (est.componentes && est.componentes.hetero) || []) {
      ligs.push({ id: h.codigo, count: h.instancias, nome: h.nome || null });
    }
    for (const ion of (est.componentes && est.componentes.ions) || []) {
      ligs.push({ id: ion.codigo, count: ion.instancias, nome: null });
    }
    meta.ligantes = ligs;
  }
  return meta;
}

function conta(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

function rotuloFormato(fmt) {
  if (fmt === "mmcif") return "mmCIF";
  if (fmt === "pdb") return "PDB";
  return fmt || "";
}

function resumoCabecalho(dados, totalRes) {
  const est = dados.estrutura;
  const base = `${dados.cadeias.length} cadeia(s) · ${totalRes} resíduos ATOM no modelo`;
  if (!est) return base;
  const lac = est.lacunas;
  let extra = lac.determinado
    ? (lac.naoResolvidos.length ? `${lac.naoResolvidos.length} não resolvido(s)` : "sem resíduo não resolvido na fonte lida")
    : "resíduos ausentes não determinados";
  if (lac.saltosNumeracao.length) extra += " · há salto de numeração";
  return `${rotuloFormato(est.formato)} · ${base} · ${extra}`;
}

// ----- metadados (card "Sobre a estrutura") -----
async function buscarMetaRCSB(id) {
  try {
    const r = await PekiRede.fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`, { headers: { Accept: "application/json" } });
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
  } catch (e) { if (PekiRede.ehTimeout(e)) throw e; return null; }
}

async function enriquecerMetaRCSB(id) {
  const atual = novaConsulta("metadados");
  let rcsb;
  try { rcsb = await buscarMetaRCSB(id); }
  catch (e) {
    if (atual() && PekiRede.ehTimeout(e) && estado.meta && estado.pdbId === id) {
      estado.meta.consultaRcsb = { ...PekiRede.TIMEOUT };
      renderMeta();
    }
    return;
  }
  if (!atual() || !rcsb || !estado.meta || estado.pdbId !== id) return; // ignora se já trocou de análise
  delete estado.meta.consultaRcsb;
  for (const k of ["titulo", "metodo", "resolucao", "peso", "data", "classificacao"]) {
    if (rcsb[k] != null) estado.meta[k] = rcsb[k];
  }
  estado.meta.rcsbId = id;
  renderMeta();
}

function renderMeta() {
  const m = estado.meta;
  const el = $("#ws-meta");
  const avisoPrevTopo = (typeof PrepAnalysis !== "undefined" && estado.pdbText)
    ? PrepAnalysis.avisoPredita(estado.pdbText, m) : null;
  const temClassico = !!(m && (m.titulo || m.classificacao || m.organismos?.length || m.ligantes?.length || avisoPrevTopo));
  if (!temClassico && !estado.estrutura && !m?.consultaRcsb) { el.hidden = true; return; }

  const tags = [];
  if (m.metodo) tags.push(esc(m.metodo));
  if (m.resolucao) tags.push(`${esc(m.resolucao)} Å`);
  if (m.modelos > 1) tags.push(`modelo 1 de ${m.modelos}`);
  if (m.organismos?.length) tags.push(`<em>${esc(m.organismos.join(", "))}</em>`);
  if (m.peso) tags.push(`${Math.round(m.peso)} kDa`);
  if (m.data) tags.push(m.data);
  if (m.rcsbId) tags.push(`<a href="https://www.rcsb.org/structure/${m.rcsbId}" target="_blank" rel="noopener">Ver no RCSB ↗</a>`);

  const ligs = (m.ligantes || []).map((l) => `${l.id}${l.count > 1 ? ` ×${l.count}` : ""}`).join(", ");
  const avisoPrev = (typeof PrepAnalysis !== "undefined" && estado.pdbText)
    ? PrepAnalysis.avisoPredita(estado.pdbText, m) : null;

  const est = estado.estrutura;
  const leitura = est
    ? `<p class="ov-resumo">${esc(est.lacunas.resumo)}</p><p class="muted small">${esc(est.componentes.holo.motivo)} Formato lido: ${esc(rotuloFormato(est.formato))}. Contrato ${esc(est.schema)}.</p>`
    : "";
  el.innerHTML =
    `<div class="meta-titulo">${esc(m.titulo || m.classificacao || estado.nome)}</div>` +
    (m.classificacao && m.titulo ? `<div class="muted small">${esc(m.classificacao)}</div>` : "") +
    (tags.length ? `<div class="meta-tags">${tags.map((t) => `<span class="meta-tag">${t}</span>`).join("")}</div>` : "") +
    (ligs ? `<div class="muted small">Heterocomponentes no modelo: ${esc(ligs)}. A presença deles não estabelece estado holo.</div>` : "") +
    (avisoPrev ? `<p class="aviso-predita">${esc(avisoPrev)}</p>` : "") +
    leitura + (m.consultaRcsb ? `<p class="muted small">${esc(m.consultaRcsb.mensagem)}</p>` : "");
  el.hidden = false;
}

function resumoQualidade() {
  if (!estado.pdbId) return "Sem ID de depósito, o relatório wwPDB não é consultado. Nenhum indicador remoto foi preenchido com zero.";
  const q = estado.qualidade && estado.qualidade.relatorio;
  if (!q) return "A consulta ao relatório wwPDB segue em paralelo e não trava o viewer. Os números, quando a fonte responder, ficam na aba Qualidade.";
  if (q.estado === "ok" || q.estado === "parcial") {
    const data = q.fonte && q.fonte.data ? q.fonte.data : "data não informada";
    return `Relatório consultado para ${q.id}. Fonte: ${q.fonte && q.fonte.nome ? q.fonte.nome : "wwPDB"}. Data: ${data}. Os números ficam na aba Qualidade e não são repetidos aqui.`;
  }
  return q.mensagem || "A consulta ao relatório não devolveu indicadores. Nada foi preenchido com zero.";
}

function rotuloCadeiaVisao(c) {
  if (c.label && c.auth && c.label !== c.auth) return `author ${c.auth} · label ${c.label}`;
  return c.auth || c.id;
}

function irAba(nome) {
  const botao = document.querySelector(`#workspace .aba[data-tab="${nome}"]`);
  if (botao && !botao.hidden) botao.click();
}

function renderVisao() {
  const cont = $("#tab-visao");
  const est = estado.estrutura;
  if (!cont) return;
  if (!est) {
    cont.innerHTML = `<p class="muted">A visão geral não está disponível para esta leitura.</p>`;
    return;
  }
  const idn = est.identidade || {};
  const linhas = [];
  if (idn.id) linhas.push(["Identificador no arquivo", idn.id]);
  if (idn.titulo) linhas.push(["Título", idn.titulo]);
  if (idn.metodo) linhas.push(["Método", idn.metodo]);
  if (idn.resolucao != null) linhas.push(["Resolução", `${idn.resolucao} Å (${idn.resolucaoOrigem})`]);
  if (idn.classificacao) linhas.push(["Classificação do arquivo", idn.classificacao]);
  if (idn.organismos && idn.organismos.length) linhas.push(["Organismo citado no arquivo", idn.organismos.join("; ")]);
  linhas.push(["Modelo", `${est.modelo.selecionado} de ${est.modelo.total}. ${est.modelo.criterio}`]);

  const lac = est.lacunas;
  const comp = est.componentes;
  const faltam = lac.naoResolvidos.slice(0, 12).map((r) => {
    const num = r.numeracaoAuthor === "nao_depositada"
      ? `posição ${r.seqIndex} na SEQRES, numeração author não depositada`
      : `${r.authSeq}${r.icode || ""}`;
    return `<li>${esc(r.resname)} ${esc(r.cadeiaAuth)} ${esc(num)} <span class="muted">(${esc(r.origem.join(", "))})</span></li>`;
  }).join("");
  const resto = lac.naoResolvidos.length > 12 ? `<p class="muted small">E mais ${lac.naoResolvidos.length - 12} resíduo(s) na mesma lista.</p>` : "";
  const saltos = lac.saltosNumeracao.slice(0, 6).map((s) =>
    `<li>Cadeia ${esc(s.cadeia)}, entre ${esc(s.de.seq)} e ${esc(s.para.seq)}: ${esc(s.interpretacao === "salto_de_numeracao" ? "salto de numeração" : "não determinado")} (${esc(s.inteirosSemResiduoDeclarado.join(", "))})</li>`
  ).join("");
  const prox = lac.proximidadeFlanqueadores.slice(0, 4).map((p) =>
    `<li>${esc(p.distanciaA)} Å entre ${esc(p.flanqueadorAnterior.atomo)} de ${esc(p.flanqueadorAnterior.resname)} ${esc(p.flanqueadorAnterior.authSeq)} e ${esc(p.flanqueadorPosterior.atomo)} de ${esc(p.flanqueadorPosterior.resname)} ${esc(p.flanqueadorPosterior.authSeq)}. ${esc(p.rotulo)}</li>`
  ).join("");
  const cadeias = est.cadeias.map((c) =>
    `<li><strong>Cadeia ${esc(rotuloCadeiaVisao(c))}</strong> — ${conta(c.posicoesPolimero, "posição", "posições")} de polímero com coordenadas, ${c.atomosAtom} átomos ATOM, ${c.atomosHet} HETATM${c.posicoesComAltLoc ? `, ${c.posicoesComAltLoc} com altLoc` : ""}.</li>`
  ).join("");
  const modsTxt = comp.proteinas.modificadas
    ? ` Inclui ${comp.proteinas.modificadas} resíduo(s) modificado(s) na cadeia${comp.modificados && comp.modificados.length ? ` (${comp.modificados.map((m) => `${m.codigo} ×${m.instancias}`).join(", ")})` : ""}, que não são ligantes livres.`
    : "";
  const ions = comp.ions.length ? comp.ions.map((i) => `${i.codigo} ×${i.instancias}`).join(", ") : "nenhum código da lista parcial";
  const hetero = comp.hetero.length ? comp.hetero.map((h) => `${h.codigo} ×${h.instancias}`).join(", ") : "nenhum além de polímero, água, íon da lista parcial e grupo terminal";
  const outros = comp.outrosPolimeros.length
    ? comp.outrosPolimeros.map((o) => `${o.posicoes} posição(ões). ${o.criterio}`).join(" ")
    : "nenhum nucleotídeo ou outro polímero identificado";
  const decls = est.uniprot.declaracoes.length
    ? est.uniprot.declaracoes.map((d) => `<li>${esc(d.fonte)}: ${esc(d.db || "banco")} ${esc(d.accession || "sem acesso")}, cadeia ${esc(d.cadeiaAuth || "não indicada")}, PDB ${esc(d.pdbInicio)}–${esc(d.pdbFim)}, banco ${esc(d.dbInicio)}–${esc(d.dbFim)}. ${d.nota ? esc(d.nota) : ""}</li>`).join("")
    : `<li>Nenhuma declaração DBREF ou _struct_ref neste arquivo.</li>`;
  const avisos = (est.diagnosticos || []).map((d) => `<li>${esc(d.mensagem)}</li>`).join("");
  const prep = est.recursos.preparo === "bloqueado" ? `<p class="aviso-ov">${esc(est.recursos.preparoMotivo)}</p>` : "";

  cont.innerHTML = `
    <section class="ov" aria-labelledby="ov-titulo">
      <h3 id="ov-titulo">Visão geral do modelo lido</h3>
      <p class="muted small">Contrato ${esc(est.schema)}. Os números abaixo saem do arquivo; campo ausente não aparece como zero.</p>
      <dl class="ov-dl">
        ${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}
      </dl>
      <h3>Cadeias</h3>
      <ul class="ov-lista">${cadeias || "<li>Nenhuma cadeia no modelo selecionado.</li>"}</ul>
      <h3>Resíduos sem coordenadas</h3>
      <p>${esc(lac.resumo)}</p>
      <p class="muted small">${esc(lac.foraDoConstructo.motivo)}</p>
      ${faltam ? `<ul class="ov-lista">${faltam}</ul>${resto}` : ""}
      ${saltos ? `<h3>Saltos de numeração</h3><ul class="ov-lista">${saltos}</ul>` : ""}
      ${prox ? `<h3>Proxies dos flanqueadores</h3><ul class="ov-lista">${prox}</ul>` : `<p class="muted small">Não há distância de flanqueadores: ou não existe resíduo não resolvido entre dois resíduos com coordenadas, ou a fonte não fechou esse diagnóstico.</p>`}
      ${lac.ocupacaoZero && lac.ocupacaoZero.length ? `<p class="muted small">${lac.ocupacaoZero.length} resíduo(s) com ocupação zero na categoria mmCIF. Eles não entram na lista de ausentes.</p>` : ""}
      <h3>Componentes no modelo selecionado</h3>
      <ul class="ov-lista">
        <li>Proteína: ${conta(comp.proteinas.posicoes, "posição", "posições")} com coordenadas${comp.proteinas.cadeias.length ? ` nas cadeias ${esc(comp.proteinas.cadeias.join(", "))}` : ""}. ${esc(comp.proteinas.criterio)}.${esc(modsTxt)}</li>
        <li>Outros polímeros: ${esc(outros)}.</li>
        <li>Águas registradas no modelo: ${comp.aguas.instancias}. ${esc(comp.aguas.nota)}</li>
        <li>Íons: ${esc(ions)}.</li>
        <li>Outros HETATM: ${esc(hetero)}. Classificação biológica incerta.</li>
      </ul>
      <p class="aviso-ov">${esc(comp.holo.motivo)}</p>
      <h3>Qualidade</h3>
      <p>${esc(resumoQualidade())}</p>
      <h3>PDB e UniProt</h3>
      <p>Correspondência resíduo a resíduo: não estabelecida.</p>
      <p>${esc(est.uniprot.motivo)}</p>
      <ul class="ov-lista">${decls}</ul>
      ${prep}
      <p class="muted small">Resíduos sem coordenadas não são destacados no viewer. Eles não têm átomos para selecionar.</p>
      ${avisos ? `<h3>Avisos desta leitura</h3><ul class="ov-lista">${avisos}</ul>` : ""}
      <details class="ov-detalhe">
        <summary>Limites desta versão</summary>
        <ul class="ov-lista">${est.limitacoes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </details>
      <div class="ov-nav">
        <button type="button" class="ghost-btn" data-ir="qualidade">Qualidade</button>
        <button type="button" class="ghost-btn" data-ir="cadeias">Abrir cadeias</button>
        <button type="button" class="ghost-btn" data-ir="stats">Estatísticas</button>
        <button type="button" class="ghost-btn" data-ir="aa">Aminoácidos</button>
        <button type="button" class="ghost-btn" data-ir="motivos">Motivos</button>
        <button type="button" class="ghost-btn" data-ir="pockets">Pockets</button>
        <button type="button" class="ghost-btn" data-ir="preparo">Preparo</button>
      </div>
    </section>`;
  cont.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => irAba(b.dataset.ir)));
}

// ----- aba: cadeias -----
// O botão ver/ocultar segue o mesmo par do pocket: pressionado = desenhado.
// Esconder a cadeia não a tira de estatisticas, FASTA, PDB nem da exportação.
function renderCadeias() {
  const cont = $("#tab-cadeias");
  const leg = $("#cadeias-legenda");
  cont.innerHTML = "";
  leg.innerHTML = "";
  if (!estado.cadeiasOcultas) estado.cadeiasOcultas = new Set();

  const notas = document.createElement("div");
  notas.className = "vis-notas";
  const temSemId = estado.dados.cadeias.includes("_");
  notas.innerHTML = `
    <p class="vis-nota">Ocultar ou mostrar uma cadeia muda só o desenho 3D. A cadeia continua nas contagens, no FASTA, no download e na exportação. O arquivo lido não é alterado.</p>
    <p class="vis-nota">Estilo, ligantes, superfície e motivo mantêm os próprios controles. O botão Ver/Ocultar do pocket não muda. Com a cadeia oculta, o cartoon, a superfície, o magenta do pocket e o amarelo do motivo não são desenhados nela; ao mostrar de novo, essas camadas voltam se ainda estiverem ligadas. Heteroátomos seguem o controle Ligantes, também numa cadeia oculta. Marca da ficha de preparo nessa cadeia sai do desenho e volta junto.</p>
    ${temSemId ? `<p class="vis-nota">A cadeia _ é a que o arquivo não identificou na coluna de cadeia.</p>` : ""}`;
  cont.appendChild(notas);

  const acoes = document.createElement("div");
  acoes.className = "cadeias-acoes";
  acoes.innerHTML = `
    <button type="button" id="btn-cadeias-mostrar" class="ghost-btn">Mostrar todas no 3D</button>
    <button type="button" id="btn-fasta-todas" class="fasta-btn">⬇ FASTA (todas)</button>`;
  cont.appendChild(acoes);

  const status = document.createElement("p");
  status.id = "cadeias-vis-status";
  status.className = "muted small";
  status.setAttribute("aria-live", "polite");
  cont.appendChild(status);

  for (const c of estado.dados.estatisticas.cadeias) {
    const cor = estado.corPorCadeia[c.cadeia] || "#888";

    const item = document.createElement("span");
    item.className = "item";
    item.dataset.chain = c.cadeia;
    item.innerHTML = `<span class="swatch" style="background:${cor}"></span> <span class="leg-txt">Cadeia ${esc(c.cadeia)}</span>`;
    leg.appendChild(item);

    const div = document.createElement("div");
    div.className = "cadeia-item";
    div.dataset.chain = c.cadeia;
    div.innerHTML = `
      <div class="info">
        <span class="swatch" style="background:${cor}"></span>
        <div>
          <strong>Cadeia ${esc(c.cadeia)}</strong>
          <div class="muted small">${c.residuos} resíduos · ${c.atomos} átomos</div>
          <div class="cadeia-vis-tag muted small"></div>
        </div>
      </div>
      <div class="cadeia-btns">
        <button type="button" class="link-btn cadeia-3d" data-chain="${esc(c.cadeia)}"></button>
        ${estado.estrutura && estado.estrutura.recursos.cadeiaPdb === "bloqueado"
          ? `<button type="button" class="dl-btn" disabled aria-disabled="true" aria-label="${esc(estado.estrutura.recursos.cadeiaPdbMotivo)}">PDB indisponível</button>`
          : `<button type="button" class="dl-btn" data-chain="${esc(c.cadeia)}">⬇ PDB</button>`}
        <button type="button" class="fasta-btn" data-chain="${c.cadeia}">⬇ FASTA</button>
      </div>`;
    cont.appendChild(div);
  }

  $$("#tab-cadeias .cadeia-3d").forEach((btn) => {
    btn.addEventListener("click", () => alternarVisibilidadeCadeia(btn.dataset.chain));
  });
  $$("#tab-cadeias .dl-btn").forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener("click", () => baixarCadeia(btn.dataset.chain));
  });
  $$("#tab-cadeias .fasta-btn[data-chain]").forEach((btn) => {
    btn.addEventListener("click", () => baixarArquivo(`${baseNome()}_${btn.dataset.chain}.fasta`, seqFasta(btn.dataset.chain)));
  });
  $("#btn-fasta-todas").addEventListener("click", () =>
    baixarArquivo(`${baseNome()}.fasta`, estado.dados.cadeias.map(seqFasta).join("")));
  $("#btn-cadeias-mostrar").addEventListener("click", mostrarTodasCadeias3D);
  sincronizarVisibilidadeCadeias();
}

function sincronizarVisibilidadeCadeias() {
  $$("#tab-cadeias .cadeia-3d").forEach((btn) => {
    const cid = btn.dataset.chain;
    const visivel = !cadeiaOcultaNo3D(cid);
    btn.textContent = visivel ? "👁 ocultar" : "👁 ver";
    btn.setAttribute("aria-pressed", visivel ? "true" : "false");
    btn.setAttribute("aria-label", visivel ? `Ocultar cadeia ${cid} no 3D` : `Mostrar cadeia ${cid} no 3D`);
    btn.classList.toggle("ativo", visivel);
    const item = btn.closest(".cadeia-item");
    if (item) {
      item.classList.toggle("oculta", !visivel);
      const tag = item.querySelector(".cadeia-vis-tag");
      if (tag) tag.textContent = visivel ? "Visível no 3D. Os dados desta cadeia não mudam." : "Oculta no 3D. Os dados desta cadeia não mudam.";
    }
  });
  $$("#cadeias-legenda .item").forEach((item) => {
    const cid = item.dataset.chain;
    const visivel = !cadeiaOcultaNo3D(cid);
    item.classList.toggle("oculta", !visivel);
    const txt = item.querySelector(".leg-txt");
    if (txt) txt.textContent = visivel ? `Cadeia ${cid}` : `Cadeia ${cid} · oculta no 3D`;
  });
  const todas = $("#btn-cadeias-mostrar");
  if (todas) {
    const alguma = algumaCadeiaOculta();
    todas.disabled = !alguma;
    todas.setAttribute("aria-disabled", alguma ? "false" : "true");
  }
}

function alternarVisibilidadeCadeia(cid) {
  if (!estado.dados || !estado.dados.cadeias.includes(cid)) return;
  if (!estado.cadeiasOcultas) estado.cadeiasOcultas = new Set();
  if (estado.cadeiasOcultas.has(cid)) estado.cadeiasOcultas.delete(cid);
  else estado.cadeiasOcultas.add(cid);
  sincronizarVisibilidadeCadeias();
  aplicarVisaoCadeias();
  const status = $("#cadeias-vis-status");
  if (status) {
    status.textContent = cadeiaOcultaNo3D(cid)
      ? `Cadeia ${cid} oculta no 3D. Contagens, FASTA, PDB e exportação não mudaram.`
      : `Cadeia ${cid} visível no 3D.`;
  }
}

function mostrarTodasCadeias3D() {
  if (!algumaCadeiaOculta()) return;
  estado.cadeiasOcultas.clear();
  sincronizarVisibilidadeCadeias();
  aplicarVisaoCadeias();
  const status = $("#cadeias-vis-status");
  if (status) status.textContent = "Todas as cadeias visíveis no 3D. Os dados não mudaram.";
}

// ----- aba: estatisticas -----
function renderStats() {
  const st = estado.dados.estatisticas;
  const cont = $("#tab-stats");

  const totalAt = st.cadeias.reduce((s, c) => s + c.atomos, 0);
  const totalRes = st.cadeias.reduce((s, c) => s + c.residuos, 0);

  const notaFormato = estado.estrutura && estado.estrutura.formato === "mmcif"
    ? `<p class="muted small">Contagens do modelo selecionado na leitura mmCIF. O texto CIF não passou pelo leitor de colunas PDB.</p>`
    : "";
  let html = `
    ${notaFormato}
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
    html += `<tr class="${cls}"><td><strong>${esc(c.cadeia)}</strong></td><td>${c.atomos}</td><td>${c.residuos}</td><td>${c.aminoacidos_diferentes}</td></tr>`;
  }
  html += `</tbody></table>`;

  if (st.maior && st.menor) {
    html += `<p class="muted small" style="margin-top:10px">
      🟢 Maior: cadeia ${esc(st.maior.cadeia)} (${st.maior.residuos} resíduos) ·
      🔴 Menor: cadeia ${esc(st.menor.cadeia)} (${st.menor.residuos} resíduos)</p>`;
  }
  html += `<div class="tab-acoes"><button id="btn-stats-csv" class="dl-btn">⬇ CSV</button></div>`;
  cont.innerHTML = html;
  $("#btn-stats-csv").addEventListener("click", baixarCsvStats);
}

// ----- aba: aminoacidos -----
// "*" soma as contagens por cadeia e só então recalcula a porcentagem.
function frequenciaDoEscopo(dados, escopo) {
  if (!dados || !dados.frequencias) return null;
  if (escopo === "*" || escopo === "todas") {
    const freq = ProtAnalysis.frequenciaConsolidada(dados.frequencias, dados.cadeias);
    return { escopo: "todas", cadeia: null, cadeias: freq.cadeias.slice(), total: freq.total, itens: freq.itens };
  }
  const freq = dados.frequencias[escopo];
  if (!freq) return null;
  return { escopo: "cadeia", cadeia: escopo, cadeias: [escopo], total: freq.total, itens: freq.itens };
}

function textoEscopoAA(freq) {
  if (!freq) return "";
  const regra = "Só entram resíduos modelados dos 20 aminoácidos padrão. Resíduo ausente, modificado ou fora dessa lista não é somado. A porcentagem sai dessa soma, não da média entre cadeias e não da SEQRES.";
  if (freq.escopo === "todas") {
    const ids = freq.cadeias.join(", ");
    const uma = freq.cadeias.length === 1
      ? `Há uma cadeia no modelo (${ids}); o consolidado coincide com ela.`
      : `Cadeias somadas: ${ids}. ${freq.total} resíduos padrão com coordenadas.`;
    return `Escopo: molécula inteira. ${regra} ${uma}`;
  }
  const nome = freq.cadeia === "_" ? "_ (sem identificador no arquivo)" : freq.cadeia;
  return `Escopo: uma cadeia (${nome}). ${regra} ${freq.total} resíduos padrão com coordenadas nesta cadeia. As outras cadeias ficam de fora deste gráfico.`;
}

function renderAA() {
  const sel = $("#aa-cadeia");
  if (!sel) return;
  const anterior = sel.value;
  sel.innerHTML = "";
  const optTodas = document.createElement("option");
  optTodas.value = "*";
  optTodas.textContent = "Todas as cadeias";
  sel.appendChild(optTodas);
  for (const cid of estado.dados.cadeias) {
    const opt = document.createElement("option");
    opt.value = cid;
    opt.textContent = cid === "_" ? "Cadeia _" : `Cadeia ${cid}`;
    sel.appendChild(opt);
  }
  const valores = ["*", ...estado.dados.cadeias];
  sel.value = valores.includes(anterior) ? anterior : "*";
  sel.onchange = plotAA;
  plotAA();
}

// Ordena os itens de frequência conforme o seletor (alfabética/percentual/contagem).
function itensAAOrdenados(freq) {
  const itens = freq.itens.slice();
  const ordem = $("#aa-ordem")?.value || "alpha";
  if (ordem === "perc") itens.sort((a, b) => b.porcentagem - a.porcentagem);
  else if (ordem === "cont") itens.sort((a, b) => b.contagem - a.contagem);
  return itens; // "alpha" = ordem natural (já alfabética)
}

// Usa as mesmas contagens e porcentagens do gráfico, sem outra análise.
function htmlTabelaAA(grupos) {
  const linhas = grupos.flatMap((g) => g.itens.map((i) => `<tr>
    <th scope="row">${esc(g.nome)}</th><td>${esc(g.escopo)}</td><td>${esc(i.aa)}</td>
    <td>${i.contagem}</td><td>${i.porcentagem}</td></tr>`)).join("");
  return `<table><caption>Frequência de aminoácidos por escopo</caption>
    <thead><tr><th scope="col">Proteína</th><th scope="col">Escopo</th><th scope="col">Aminoácido</th>
    <th scope="col">Contagem</th><th scope="col">Percentual (%)</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function alternarTabelaAA(botao, tabela) {
  tabela.hidden = !tabela.hidden;
  botao.setAttribute("aria-expanded", tabela.hidden ? "false" : "true");
}

function renderTabelaAA(freq) {
  const tabela = $("#aa-tabela");
  if (!tabela) return;
  tabela.innerHTML = freq ? htmlTabelaAA([{
    nome: estado.nome,
    escopo: freq.escopo === "todas" ? "Todas as cadeias" : `Cadeia ${freq.cadeia}`,
    itens: itensAAOrdenados(freq),
  }]) : "";
}

async function plotAA() {
  const atual = novaConsulta("graficoAA");
  const sel = $("#aa-cadeia");
  const escopo = sel ? sel.value : "*";
  const freq = frequenciaDoEscopo(estado.dados, escopo);
  const painel = $("#tab-aa");
  const faixa = $("#aa-escopo");
  if (painel) painel.dataset.escopo = freq && freq.escopo === "cadeia" ? "cadeia" : "todas";
  if (faixa) {
    faixa.dataset.escopo = painel ? painel.dataset.escopo : "todas";
    faixa.textContent = textoEscopoAA(freq);
  }
  renderAtalhoMotivo(freq);
  renderTabelaAA(freq);
  if (!freq) return;
  try { await libPlotly(); }
  catch (e) { if (!atual()) return; throw e; }
  if (!atual()) return;

  const itens = itensAAOrdenados(freq);
  const x = itens.map((i) => i.aa);
  const y = itens.map((i) => i.porcentagem);
  const cor = freq.escopo === "todas" ? "#5c6b82" : (estado.corPorCadeia[freq.cadeia] || "#2a5599");
  const escuro = document.body.dataset.theme === "dark";
  const titulo = freq.escopo === "todas"
    ? "Frequência de aminoácidos — todas as cadeias"
    : `Frequência de aminoácidos — cadeia ${freq.cadeia}`;

  await Plotly.newPlot("aa-grafico", [{
    x, y, customdata: itens.map((i) => i.contagem), type: "bar", marker: { color: cor },
    hovertemplate: "%{x}: %{y}% (%{customdata} resíduos)<extra></extra>",
  }], {
    title: titulo,
    xaxis: { title: "Aminoácido" },
    yaxis: { title: "Porcentagem (%)" },
    margin: { t: 40, r: 10, b: 50, l: 50 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { color: escuro ? "#e7edf7" : "#1c2433" },
  }, { responsive: true, displayModeBar: false });

  if (!atual()) return;
  const graf = document.getElementById("aa-grafico");
  if (graf && graf.on && !graf._pekiAaClick) {
    graf._pekiAaClick = true;
    graf.on("plotly_click", (ev) => {
      const aa = ev && ev.points && ev.points[0] && ev.points[0].x;
      if (aa) adicionarAaAoMotivo(aa);
    });
  }
}

function renderAtalhoMotivo(freq) {
  const box = $("#aa-atalho");
  const nota = $("#aa-atalho-nota");
  if (!box) return;
  box.innerHTML = "";
  if (!freq) return;
  const presentes = freq.itens.filter((i) => i.contagem > 0);
  for (const item of presentes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "motivo-chip aa-atalho";
    btn.dataset.aa = item.aa;
    const rotulo = ProtAnalysis.NOMES_AA[item.aa];
    const letra = ProtAnalysis.TRES_PARA_UMA[item.aa] || "";
    btn.textContent = letra ? `${letra} ${item.aa}` : item.aa;
    btn.setAttribute("aria-label", rotulo
      ? `Adicionar ${rotulo} ao motivo, código ${item.aa}, letra ${letra}`
      : `Adicionar ${item.aa} ao motivo`);
    btn.addEventListener("click", () => adicionarAaAoMotivo(item.aa));
    box.appendChild(btn);
  }
  if (nota) {
    nota.textContent = presentes.length
      ? "Atalho: estes botões acrescentam um aminoácido do escopo ao motivo, na ordem dos cliques. A busca continua na aba Motivos e percorre todas as cadeias do modelo."
      : "Neste escopo não há aminoácido padrão com coordenadas para acrescentar ao motivo.";
  }
}

function adicionarAaAoMotivo(codigo) {
  const freq = frequenciaDoEscopo(estado.dados, ($("#aa-cadeia") && $("#aa-cadeia").value) || "*");
  const item = freq && freq.itens.find((i) => i.aa === codigo);
  const nota = $("#aa-atalho-nota");
  if (!item || item.contagem <= 0) {
    if (nota) nota.textContent = `${codigo} não tem resíduo modelado neste escopo e não entra no motivo.`;
    return;
  }
  acrescentarCodigoMotivo(codigo);
  if (nota) nota.textContent = `${codigo} entrou no motivo, na ordem. A busca percorre todas as cadeias e fica na aba Motivos.`;
}

// ----- aba: motivos -----
// Motivo = janela contígua de resíduos, na ordem. Não é sítio, pocket nem elemento de estrutura secundária.
function textoFormacaoMotivo(texto, temResultado) {
  const tokens = ProtAnalysis.tokensMotivo(texto);
  const guarda = temResultado ? " A lista da última busca permanece até a próxima busca válida." : "";
  if (!tokens.length) return "Motivo em formação: vazio. Nenhum resíduo vem selecionado." + guarda;
  const v = ProtAnalysis.validarMotivoTexto(texto);
  if (!v.ok) return `Motivo em formação: ${tokens.join("-")}. ${v.erro}${guarda}`;
  const janela = tokens.length === 1
    ? "1 resíduo: a busca acha essa posição. Para um motivo, acrescente o próximo na ordem."
    : `${tokens.length} resíduos nesta ordem, em janela contígua.`;
  return `Motivo em formação: ${tokens.join("-")}. ${janela}${guarda}`;
}

function temResultadoMotivo() {
  const cont = $("#motivo-resultado");
  return !!(cont && cont.innerHTML && cont.innerHTML.trim());
}

function atualizarFormacaoMotivo() {
  const el = $("#motivo-formacao");
  if (!el) return;
  el.textContent = textoFormacaoMotivo(($("#motivo-input") && $("#motivo-input").value) || "", temResultadoMotivo());
}

function escreverMotivoCampo(texto) {
  const el = $("#motivo-input");
  if (el) el.value = texto;
  atualizarFormacaoMotivo();
}

function acrescentarCodigoMotivo(codigo) {
  const bruto = String(codigo || "").trim().toUpperCase();
  if (!bruto) return;
  const tokens = ProtAnalysis.tokensMotivo(($("#motivo-input") && $("#motivo-input").value) || "");
  tokens.push(bruto);
  escreverMotivoCampo(tokens.join("-"));
}

function removerUltimoMotivo() {
  const tokens = ProtAnalysis.tokensMotivo(($("#motivo-input") && $("#motivo-input").value) || "");
  tokens.pop();
  escreverMotivoCampo(tokens.join("-"));
}

function limparMotivoCampo() {
  escreverMotivoCampo("");
}

function mostrarAvisoMotivo(msg) {
  const el = $("#motivo-aviso");
  if (!el) return;
  if (!msg) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = msg;
}

function renderMotivos() {
  const box = $("#motivo-chips");
  const escopo = $("#motivo-escopo");
  if (!box || !estado.dados) return;
  const catalogo = ProtAnalysis.catalogoResiduos(estado.dados.residuosPorCadeia);
  if (escopo) {
    escopo.textContent = catalogo.length
      ? "Os botões são os resíduos com coordenadas neste modelo. Resíduo ausente não aparece e não vem selecionado."
      : "Este modelo não tem resíduos com coordenadas para montar um motivo.";
  }
  box.innerHTML = "";
  for (const item of catalogo) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "motivo-chip";
    btn.dataset.aa = item.codigo;
    if (item.padrao && item.nome) {
      btn.innerHTML = `<span class="motivo-letra">${esc(item.letra)}</span><span class="motivo-cod">${esc(item.codigo)}</span><span class="motivo-nome">${esc(item.nome)}</span>`;
      btn.setAttribute("aria-label", `Adicionar ${item.nome} ao motivo, código ${item.codigo}, letra ${item.letra}`);
    } else {
      btn.innerHTML = `<span class="motivo-cod">${esc(item.codigo)}</span><span class="motivo-nome">no modelo, fora dos 20</span>`;
      btn.setAttribute("aria-label", `Adicionar ${item.codigo} ao motivo. Resíduo com coordenadas, fora da lista dos 20 aminoácidos padrão.`);
    }
    btn.addEventListener("click", () => acrescentarCodigoMotivo(item.codigo));
    box.appendChild(btn);
  }
  atualizarFormacaoMotivo();
}

function buscarMotivo() {
  const valor = ($("#motivo-input") && $("#motivo-input").value) || "";
  const cont = $("#motivo-resultado");
  const checagem = ProtAnalysis.validarMotivoTexto(valor);
  if (!checagem.ok) {
    mostrarAvisoMotivo(checagem.erro);
    atualizarFormacaoMotivo();
    return;
  }
  mostrarAvisoMotivo("");
  const motivo = checagem.motivo;
  const ocorrencias = estado.pdbText
    ? ProtAnalysis.buscarMotivo(estado.pdbText, motivo)
    : StructureModel.buscarMotivo(estado.dados.residuosPorCadeia, motivo);

  const motivoTxt = esc(motivo.join("-"));
  if (!ocorrencias.length) {
    estado.ultimoMotivo = null;
    estado.motivoNo3D = null;
    if (estado.vistaPocket) estado.vistaPocket.motivoPorCima = null;
    cont.innerHTML = `<p class="muted">Nenhuma ocorrência contígua de <code>${motivoTxt}</code>, nessa ordem. Resíduos iguais em posições separadas não contam.</p>`;
    aplicarEstiloMantendoPocket();
    atualizarFormacaoMotivo();
    return;
  }

  estado.ultimoMotivo = { motivo: motivo.join("-"), ocorrencias };

  let html = `<p><strong>${ocorrencias.length}</strong> ocorrência(s) de <code>${motivoTxt}</code>, janela contígua nessa ordem:</p>`;
  if (!estado.pdbText) html += `<p class="muted small">Busca na sequência lida do mmCIF. O texto CIF não passou pelo leitor de colunas PDB.</p>`;
  for (const oc of ocorrencias) {
    html += `<div class="ocorrencia">Cadeia <strong>${esc(oc.cadeia)}</strong> · posição <strong>${esc(oc.posicao)}</strong> (resíduos ${esc(oc.residuos.join(", "))})</div>`;
  }
  html += `<p class="muted small">O amarelo no 3D marca resíduos com coordenadas. Cadeia oculta no 3D continua nesta lista; o amarelo dela volta quando a cadeia é mostrada. Resíduo sem coordenada não é desenhado e não entrou na busca.</p>`;
  cont.innerHTML = html;

  destacarMotivo(ocorrencias);
  atualizarFormacaoMotivo();
}

// ----- aba: pockets (DoGSiteScorer via ProteinsPlus) -----
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
    const descartadas = POCKETS_CACHE[estado.pdbId.toUpperCase()]?.descartadas;
    estado.pocketsInfo = { estado: "ok", motivo: null };
    status.textContent = `✓ ${estado.pockets.length} pocket(s) para ${estado.pdbId}.` + avisoLinhasPocket(descartadas);
    renderTabelaPockets(estado.pockets);
  }
}

async function detectarPockets() {
  if (!estado.pdbId) return;
  const atual = novaConsulta("pockets");
  const btn = $("#btn-pockets");
  const status = $("#pockets-status");
  const cont = $("#pockets-resultado");
  const cacheado = !!POCKETS_CACHE[estado.pdbId.toUpperCase()];

  btn.disabled = true;
  cont.innerHTML = "";
  status.innerHTML = cacheado ? "" : `<span class="spinner"></span> Enviando ${estado.pdbId} ao DoGSiteScorer…`;

  try {
    const { pockets, descartadas } = await obterPockets(estado.pdbId, (n) => {
      if (atual()) status.innerHTML = `<span class="spinner"></span> Calculando pockets no servidor… (verificação ${n})`;
    }, () => !atual());
    if (!atual()) return;
    if (!pockets.length) throw new Error("Nenhum pocket retornado pela API." + avisoLinhasPocket(descartadas));

    estado.pockets = pockets;
    estado.pocketsInfo = { estado: "ok", motivo: null };
    status.textContent = `✓ ${pockets.length} pocket(s)${cacheado ? " (do cache)" : ""} para ${estado.pdbId}.` + avisoLinhasPocket(descartadas);
    renderTabelaPockets(pockets);
  } catch (e) {
    if (!atual()) return;
    estado.pockets = null;
    estado.pocketsInfo = { estado: "erro", motivo: e.message };
    if (PekiRede.ehTimeout(e)) estado.pocketsInfo.codigo = PekiRede.TIMEOUT.codigo;
    status.innerHTML = `❌ ${e.message}`;
    btn.disabled = false;
  }
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

// Colunas da tabela de pockets (ordenáveis ao clicar no cabeçalho).
const AVISO_DESCRITOR = "O drugScore e o volume são descritores geométricos da cavidade, não previsão de ligação. Escore de docking não é afinidade. Contato geométrico não é contribuição energética.";

const POCKET_TABELA = [
  { key: "name", label: "Pocket", dica: "Identificador do pocket (P_0 é o de maior volume)" },
  { key: "volume", label: "Volume (Å³)", dica: "Volume da cavidade, em Å³ — quanto maior, mais espaço para um ligante" },
  { key: "surface", label: "Superfície (Å²)", dica: "Área da superfície do pocket, em Å²" },
  { key: "depth", label: "Profundidade", dica: "Quão fundo é a cavidade, em uma escala do DoGSiteScorer" },
  { key: "hydrophobicity", label: "Hidrofob.", dica: "Hidrofobicidade (0–1) — caráter apolar da cavidade" },
  { key: "accept", label: "Aceptores", dica: "Número de aceptores de ligação de hidrogênio" },
  { key: "donor", label: "Doadores", dica: "Número de doadores de ligação de hidrogênio" },
  { key: "drugScore", label: "DrugScore", dica: "Descritor geométrico do DoGSiteScorer (0–1). Não é afinidade nem previsão de ligação" },
];

// Aplica a ordenação atual (estado.pocketSort) preservando o índice original.
function pocketsOrdenados(pockets) {
  const arr = pockets.map((p, i) => ({ p, i }));
  const s = estado.pocketSort;
  if (s) {
    arr.sort((a, b) => {
      if (s.col === "name") return s.dir * String(a.p.name).localeCompare(String(b.p.name));
      const va = a.p[s.col] == null ? -Infinity : a.p[s.col];
      const vb = b.p[s.col] == null ? -Infinity : b.p[s.col];
      return s.dir * (va - vb);
    });
  }
  return arr;
}

function renderTabelaPockets(pockets) {
  const cont = $("#pockets-resultado");
  const maiorVol = maxPor(pockets, "volume");
  const maisProf = maxPor(pockets, "depth");
  const maisHidro = maxPor(pockets, "hydrophobicity");
  const melhorDrug = maxPor(pockets, "drugScore");

  const s = estado.pocketSort;
  const th = POCKET_TABELA.map((c) => {
    const seta = s && s.col === c.key ? (s.dir === 1 ? " ▲" : " ▼") : "";
    const ordem = s && s.col === c.key ? (s.dir === 1 ? "ascending" : "descending") : "none";
    return `<th scope="col" aria-sort="${ordem}"><button type="button" id="pocket-sort-${c.key}" class="th-sort" data-col="${c.key}" title="${c.dica}" aria-label="Ordenar por ${c.label}">${c.label}<span aria-hidden="true">${seta}</span></button></th>`;
  }).join("");

  let html = `<div class="tab-acoes"><button id="btn-pockets-csv" class="dl-btn">⬇ CSV</button></div>`;
  html += `<table class="pockets-tabela"><thead><tr>${th}<th>3D</th></tr></thead><tbody>`;
  for (const { p, i } of pocketsOrdenados(pockets)) {
    const classes = [
      maiorVol && p.name === maiorVol.name ? "destaque-maior" : "",
      vistaPocketCobre(i) ? "pocket-visto" : "",
    ].filter(Boolean).join(" ");
    html += `<tr class="${classes}">
      <td><strong>${p.name}</strong></td>
      <td>${fmt(p.volume)}</td><td>${fmt(p.surface)}</td><td>${fmt(p.depth)}</td>
      <td>${fmt(p.hydrophobicity)}</td><td>${p.accept ?? "—"}</td><td>${p.donor ?? "—"}</td>
      <td>${fmt(p.drugScore, 3)}</td>
      <td>${htmlBotaoPocket3d(p, i)}</td>
    </tr>`;
  }
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
      <li><strong>Maior drugScore:</strong> ${melhorDrug
        ? `${melhorDrug.name} — maior <em>drugScore</em> (${fmt(melhorDrug.drugScore, 3)}), que é um descritor geométrico; volume ${fmt(melhorDrug.volume)} Å³ e profundidade ${fmt(melhorDrug.depth)}.`
        : "—"}</li>
    </ol>
    <details class="legenda-desc">
      <summary>O que significam os descritores?</summary>
      <ul>
        <li><strong>Volume / Superfície:</strong> tamanho da cavidade (Å³) e área da sua superfície (Å²).</li>
        <li><strong>Profundidade:</strong> quão fundo é a cavidade, na escala do DoGSiteScorer.</li>
        <li><strong>Hidrofobicidade (0–1):</strong> caráter apolar da cavidade.</li>
        <li><strong>Aceptores / Doadores:</strong> nº de aceptores e doadores de ligação de hidrogênio.</li>
        <li><strong>DrugScore (0–1):</strong> descritor geométrico do DoGSiteScorer. Não é afinidade nem previsão de ligação.</li>
      </ul>
    </details>
    <p class="rotulo-fixo">${AVISO_DESCRITOR}</p>
  </div>
  <div id="pockets-graf-volume" class="grafico"></div>
  <div id="pockets-graf-depth" class="grafico"></div>`;

  cont.innerHTML = html;

  $$("#pockets-resultado .pocket-3d").forEach((btn) => {
    btn.addEventListener("click", () => destacarPocket(Number(btn.dataset.idx)));
  });
  $$("#pockets-resultado .th-sort").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      const cur = estado.pocketSort;
      estado.pocketSort = cur && cur.col === col ? { col, dir: -cur.dir } : { col, dir: 1 };
      renderTabelaPockets(estado.pockets);
      $(`#pocket-sort-${col}`).focus();
    });
  });
  $("#btn-pockets-csv").addEventListener("click", baixarCsvPockets);
  if (typeof PrepUI !== "undefined") PrepUI.aoMostrar();

  plotPockets(pockets);
}

async function plotPockets(pockets) {
  const atual = novaConsulta("graficoPockets");
  try { await libPlotly(); }
  catch (e) { if (!atual()) return; throw e; }
  if (!atual()) return;
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

// ----- abas / tema -----
function selecionarAbas(seletor, atributo, nome) {
  $$(seletor).forEach((aba) => {
    const ativa = aba.dataset[atributo] === nome;
    aba.classList.toggle("ativa", ativa);
    aba.setAttribute("aria-selected", ativa ? "true" : "false");
    aba.setAttribute("tabindex", ativa ? "0" : "-1");
  });
}

function configurarTecladoAbas(seletor) {
  const lista = $(seletor);
  if (!lista) return;
  lista.addEventListener("keydown", (ev) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(ev.key)) return;
    const abas = Array.from(lista.querySelectorAll(".aba")).filter((a) => !a.hidden && !a.disabled);
    const i = abas.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const n = ev.key === "Home" ? 0 : ev.key === "End" ? abas.length - 1
      : (i + (ev.key === "ArrowRight" ? 1 : -1) + abas.length) % abas.length;
    abas[n].focus();
    abas[n].click();
  });
}

function trocarAba(nome) {
  selecionarAbas("#workspace .aba", "tab", nome);
  $$("#workspace .aba-conteudo").forEach((c) => (c.hidden = c.id !== `tab-${nome}`));
  if (nome === "aa" && window.Plotly) setTimeout(() => Plotly.Plots.resize("aa-grafico"), 50);
  if (nome === "preparo" && typeof PrepUI !== "undefined") PrepUI.aoMostrar();
  if (nome === "pockets" && estado.pockets && window.Plotly) {
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
  try { localStorage.setItem("peki-tema", atual); } catch (e) { /* modo privado */ }
  if (estado.dados) plotAA();
  if (estado.pockets) plotPockets(estado.pockets);
  if (estado.comparacao && !$("#comparacao").hidden) {
    renderCmpStats();
    plotCmpAA();
    if (estado.cmpPockets) renderCmpPockets(estado.cmpPockets);
  }
}

// ----- código PDB ou nome da proteína -----
let buscaNomeSeq = 0;
let buscaNomeAtual = null;

function limparPainelBusca() {
  buscaNomeSeq += 1;
  buscaNomeAtual = null;
  const btn = $("#btn-id");
  if (btn) btn.disabled = false;
  const painel = $("#busca-nome");
  if (!painel) return;
  painel.hidden = true;
  painel.innerHTML = "";
}

function campoAindaBusca(nome) {
  const campo = $("#pdb-id");
  if (!campo || typeof BuscaNome === "undefined") return false;
  const d = BuscaNome.decidir(campo.value);
  return d.acao === "listar" && d.nome === nome;
}

function atualizarRotuloEntrada() {
  const btn = $("#btn-id");
  const campo = $("#pdb-id");
  if (!btn || !campo) return;
  if (typeof BuscaNome === "undefined") {
    btn.textContent = "Analisar código";
    return;
  }
  const d = BuscaNome.decidir(campo.value);
  btn.textContent = d.acao === "listar" ? "Buscar nome" : "Analisar código";
}

function acaoCampo(valor) {
  if (typeof BuscaNome === "undefined") {
    const id = String(valor || "").trim().toUpperCase();
    if (/^[0-9][A-Z0-9]{3}$/.test(id)) {
      limparPainelBusca();
      analisar({ pdbId: id });
      return;
    }
    mostrarErro("Informe um código PDB de 4 caracteres (ex.: 1A00).");
    return;
  }
  const d = BuscaNome.decidir(valor);
  if (d.acao === "erro") {
    mostrarErro(d.mensagem);
    return;
  }
  if (d.acao === "carregar") {
    limparPainelBusca();
    analisar({ pdbId: d.id });
    return;
  }
  listarPorNome(d.nome);
}

async function listarPorNome(nome) {
  invalidarConsultasEstrutura();
  const seq = ++buscaNomeSeq;
  limparErro();
  const painel = $("#busca-nome");
  const btn = $("#btn-id");
  if (painel) {
    painel.hidden = false;
    painel.innerHTML = `<p class="busca-status"><span class="spinner"></span> Consultando depósitos experimentais no RCSB para “${esc(nome)}”…</p>`;
  }
  if (btn) btn.disabled = true;
  let resp;
  try {
    resp = await BuscaNome.pesquisar(nome);
  } catch (e) {
    resp = { ok: false, mensagem: "Sem conexão com o RCSB (ou bloqueio de rede)." };
  } finally {
    if (btn && seq === buscaNomeSeq) btn.disabled = false;
  }
  if (seq !== buscaNomeSeq) return;
  if (!campoAindaBusca(nome)) {
    buscaNomeAtual = null;
    if (painel) {
      painel.hidden = true;
      painel.innerHTML = "";
    }
    return;
  }
  if (!resp || !resp.ok) {
    buscaNomeAtual = null;
    if (painel) {
      painel.hidden = true;
      painel.innerHTML = "";
    }
    mostrarErro((resp && resp.mensagem) || "A busca no RCSB não completou.");
    return;
  }
  buscaNomeAtual = resp;
  if (painel) {
    painel.hidden = false;
    painel.innerHTML = BuscaNome.htmlResultados(resp);
  }
}

function aoClicarResultadoBusca(ev) {
  const alvo = ev.target && ev.target.closest ? ev.target.closest("[data-busca-id]") : null;
  if (!alvo) return;
  const lista = buscaNomeAtual && buscaNomeAtual.resultados;
  const item = typeof BuscaNome !== "undefined" ? BuscaNome.selecionar(lista, alvo.getAttribute("data-busca-id")) : null;
  if (!item) {
    mostrarErro("Esse código não está na lista atual. Busque de novo e escolha um resultado.");
    return;
  }
  analisar({ pdbId: item.id });
}

// ----- init -----
function syncAbaPreparo() {
  const ligada = typeof PrepUI !== "undefined" && PrepUI.ativo();
  const botao = document.querySelector('#workspace .aba[data-tab="preparo"]');
  if (botao) botao.hidden = !ligada;
}

function init() {
  syncAbaPreparo();
  // restaura o tema salvo
  try {
    if (localStorage.getItem("peki-tema") === "dark") {
      document.body.dataset.theme = "dark";
      $("#theme-toggle").textContent = "☀️";
    }
  } catch (e) { /* modo privado */ }

  $("#btn-id").addEventListener("click", () => acaoCampo($("#pdb-id").value));
  $("#pdb-id").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-id").click(); });
  $("#pdb-id").addEventListener("input", atualizarRotuloEntrada);
  const painelBusca = $("#busca-nome");
  if (painelBusca) painelBusca.addEventListener("click", aoClicarResultadoBusca);
  atualizarRotuloEntrada();

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

  $("#brand-home").addEventListener("click", irParaHome);
  $("#btn-novo").addEventListener("click", irParaHome);

  // comparação
  $("#btn-cmp").addEventListener("click", () => compararProteinas($("#cmp-ids").value));
  $("#cmp-ids").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btn-cmp").click(); });
  $("#btn-cmp-pockets").addEventListener("click", detectarPocketsComparacao);
  $("#btn-cmp-novo").addEventListener("click", irParaHome);
  $$("#comparacao .aba").forEach((a) => a.addEventListener("click", () => trocarAbaCmp(a.dataset.ctab)));
  $$("#workspace .aba").forEach((a) => a.addEventListener("click", () => trocarAba(a.dataset.tab)));
  configurarTecladoAbas("#workspace .abas");
  configurarTecladoAbas("#comparacao .abas");
  $("#estilo-3d").addEventListener("change", aplicarEstiloMantendoPocket);
  $("#spin").addEventListener("change", (e) => { if (estado.viewer) estado.viewer.spin(e.target.checked ? "y" : false); });
  $("#lig-toggle").addEventListener("change", aplicarEstiloMantendoPocket);
  $("#surf-toggle").addEventListener("change", (e) => aoAlternarSuperficie(e.target.checked));
  $("#viewer-tam").addEventListener("change", ajustarTamViewer);
  $("#cmp-tam").addEventListener("change", ajustarTamCmp);
  let timerTam = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timerTam);
    timerTam = setTimeout(() => {
      if (!$("#workspace").hidden && estado.viewer && $("#viewer").clientHeight) {
        estado.viewer.resize();
        estado.viewer.render();
      }
      if (!$("#comparacao").hidden) {
        for (const { v, div } of estado.cmpViewers || []) {
          if (div.isConnected && div.clientHeight) { v.resize(); v.render(); }
        }
      }
    }, 120);
  });
  $("#aa-ordem").addEventListener("change", plotAA);
  $("#btn-aa-csv").addEventListener("click", baixarCsvAA);
  $("#btn-aa-tabela").addEventListener("click", (ev) => alternarTabelaAA(ev.currentTarget, $("#aa-tabela")));
  $("#btn-motivo").addEventListener("click", buscarMotivo);
  $("#motivo-input").addEventListener("keydown", (e) => { if (e.key === "Enter") buscarMotivo(); });
  $("#motivo-input").addEventListener("input", atualizarFormacaoMotivo);
  const btnUltimo = $("#btn-motivo-ultimo");
  const btnLimpar = $("#btn-motivo-limpar");
  if (btnUltimo) btnUltimo.addEventListener("click", removerUltimoMotivo);
  if (btnLimpar) btnLimpar.addEventListener("click", limparMotivoCampo);
  $("#btn-pockets").addEventListener("click", detectarPockets);
  $("#theme-toggle").addEventListener("click", alternarTema);

  // exportação e análise guardada
  $("#btn-guardar-analise").addEventListener("click", guardarAnalise);
  const voltarAnalises = $("#btn-an-voltar");
  if (voltarAnalises) voltarAnalises.addEventListener("click", irParaHome);
  $("#btn-export").addEventListener("click", (ev) => abrirExport("single", ev.currentTarget));
  $("#btn-cmp-export").addEventListener("click", (ev) => abrirExport("cmp", ev.currentTarget));
  $("#export-modal").addEventListener("close", aoFecharExport);
  $("#export-modal").addEventListener("keydown", conterFocoExport);
  $("#exp-cancelar").addEventListener("click", fecharExport);
  $("#exp-confirmar").addEventListener("click", confirmarExport);
  $("#exp-full").addEventListener("change", (e) => { $$(".exp-item").forEach((c) => (c.checked = e.target.checked)); });
  $("#exp-itens").addEventListener("change", () => { $("#exp-full").checked = $$(".exp-item").every((c) => c.checked); });
  $("#exp-so-pockets").addEventListener("click", () => {
    $$(".exp-item").forEach((c) => (c.checked = c.value === "pockets"));
    $("#exp-full").checked = false;
  });
  $("#export-modal").addEventListener("click", (e) => {
    // Só o backdrop fecha: espaços vazios dentro do diálogo continuam interativos.
    if (e.target.id !== "export-modal") return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fecharExport();
  });

  // deep-link: abre direto a análise a partir da URL (?pdb=1A00 ou ?compare=1A00,4HHB)
  const params = new URLSearchParams(location.search);
  const ensParam = params.get("ensemble");
  const cmpParam = params.get("compare");
  const pdbParam = params.get("pdb");
  if (ensParam && typeof EnsembleUI !== "undefined" && EnsembleUI.ativo()) EnsembleUI.abrirPorUrl(ensParam);
  else if (cmpParam) compararProteinas(cmpParam);
  else if (pdbParam) {
    if ($("#pdb-id")) $("#pdb-id").value = pdbParam;
    atualizarRotuloEntrada();
    acaoCampo(pdbParam);
  }
}

document.addEventListener("DOMContentLoaded", init);

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    estado,
    renderTabelaPockets,
    destacarPocket,
    aplicarEstilo,
    aplicarEstiloMantendoPocket,
    aplicarVisaoCadeias,
    aplicarSuperficie,
    aoAlternarSuperficie,
    renderCmpPockets,
    invalidarVistaPocket,
    sincronizarBotoesPocket,
    destacarMotivo,
    renderCadeias,
    alternarVisibilidadeCadeia,
    mostrarTodasCadeias3D,
    sincronizarVisibilidadeCadeias,
    cadeiaOcultaNo3D,
    frequenciaDoEscopo,
    textoEscopoAA,
    renderAA,
    plotAA,
    renderMotivos,
    buscarMotivo,
    acrescentarCodigoMotivo,
    removerUltimoMotivo,
    limparMotivoCampo,
    adicionarAaAoMotivo,
    textoFormacaoMotivo,
    atualizarFormacaoMotivo,
  };
}
