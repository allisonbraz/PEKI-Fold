// Aba Qualidade. A consulta é independente do viewer e do preparo.
// Um erro de rede não zera métrica e não bloqueia a leitura do arquivo.

"use strict";

const QualityUI = (() => {
  const cache = typeof QualityModel !== "undefined" ? QualityModel.criarCache() : null;
  let geracao = 0;
  let ctrlRel = null;
  let ctrlComp = null;
  let raizAtual = null;
  let clickFn = null;
  let changeFn = null;
  let appRef = null;
  let onMudou = null;
  let relatorio = null;
  let painel = null;
  let compEstado = "idle";
  let compMensagem = "";
  let cadeiaSel = "";
  let mostrarTodos = false;
  let seqRel = 0;
  let seqComp = 0;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function idAtual() {
    if (!appRef || !appRef.pdbId) return "";
    return QualityModel.normalizarId(appRef.pdbId);
  }

  function ticketAtual() {
    return { geracao, id: idAtual() };
  }

  function aindaVale(ticket) {
    return QualityModel.respostaAtual(ticket, ticketAtual());
  }

  function vincular(raiz) {
    desvincular();
    if (!raiz || typeof raiz.addEventListener !== "function") return;
    clickFn = (ev) => {
      const alvo = ev.target && ev.target.closest ? ev.target.closest("[data-ql]") : null;
      if (!alvo) return;
      const acao = alvo.getAttribute("data-ql");
      if (acao === "retry-relatorio") consultarRelatorio(true);
      if (acao === "retry-comp") consultarComponentes(true);
    };
    changeFn = (ev) => {
      const t = ev.target;
      if (!t) return;
      if (t.id === "ql-cadeia") {
        cadeiaSel = t.value;
        render();
        const deNovo = raizAtual && raizAtual.querySelector ? raizAtual.querySelector("#ql-cadeia") : null;
        if (deNovo && deNovo.focus) deNovo.focus();
      } else if (t.id === "ql-todos") {
        mostrarTodos = !!t.checked;
        render();
        const deNovo = raizAtual && raizAtual.querySelector ? raizAtual.querySelector("#ql-todos") : null;
        if (deNovo && deNovo.focus) deNovo.focus();
      }
    };
    raiz.addEventListener("click", clickFn);
    raiz.addEventListener("change", changeFn);
    raizAtual = raiz;
  }

  function desvincular() {
    if (raizAtual && clickFn) {
      raizAtual.removeEventListener("click", clickFn);
      raizAtual.removeEventListener("change", changeFn);
    }
    raizAtual = null;
    clickFn = null;
    changeFn = null;
  }

  function abortar(ctrl) {
    if (!ctrl) return;
    try { ctrl.abort(); } catch (e) { /* já abortado */ }
  }

  function invalidar() {
    geracao += 1;
    abortar(ctrlRel);
    abortar(ctrlComp);
    ctrlRel = null;
    ctrlComp = null;
    desvincular();
  }

  function sinalDe(qual) {
    const ctrl = new AbortController();
    if (qual === "rel") {
      abortar(ctrlRel);
      ctrlRel = ctrl;
    } else {
      abortar(ctrlComp);
      ctrlComp = ctrl;
    }
    return ctrl.signal;
  }

  function contagemOuvintes(raiz) {
    const alvo = raiz || raizAtual;
    if (!alvo || !alvo.map) return clickFn && raizAtual ? 1 : 0;
    const n = (tipo) => (alvo.map[tipo] || []).length;
    return n("click") + n("change");
  }

  function publicar() {
    if (appRef) {
      appRef.qualidade = {
        schema: QualityModel.SCHEMA,
        relatorio,
        componentes: painel,
      };
    }
    render();
    if (typeof onMudou === "function") onMudou();
  }

  function contexto() {
    const est = appRef && appRef.estrutura;
    if (!est) return null;
    return {
      modeloSelecionado: est.modelo ? est.modelo.selecionado : null,
      residuos: est.residuos || [],
      lacunas: est.lacunas || null,
    };
  }

  function metodoArquivo() {
    const est = appRef && appRef.estrutura;
    return est && est.identidade ? est.identidade.metodo : null;
  }

  async function consultarRelatorio(forcar) {
    if (typeof QualityModel === "undefined" || !appRef) return;
    const seq = ++seqRel;
    const g = geracao;
    const id = idAtual();
    const ticket = { geracao: g, id };
    if (forcar && cache && id) cache.apagarRelatorio(id);
    relatorio = null;
    render();
    const sinal = sinalDe("rel");
    const rel = await QualityModel.consultarRelatorio(id, {
      fetch: typeof fetch === "function" ? fetch : null,
      cache,
      signal: sinal,
      forcar: false,
      metodoArquivo: metodoArquivo(),
      contexto: contexto(),
    });
    if (!aindaVale(ticket) || seq !== seqRel) return;
    relatorio = rel;
    publicar();
  }

  async function consultarComponentes(forcar) {
    if (typeof QualityModel === "undefined" || !appRef || !appRef.estrutura) return;
    const seq = ++seqComp;
    const g = geracao;
    const id = idAtual();
    const ticket = { geracao: g, id };
    const codigos = QualityModel.codigosParaConsulta(appRef.estrutura);
    if (forcar && cache) {
      for (const c of codigos) cache.apagarComponente(c.codigo);
    }
    compEstado = "carregando";
    compMensagem = "";
    render();
    const sinal = sinalDe("comp");
    const fila = codigos.slice(0, 24);
    const resto = codigos.slice(24);
    const anotacoes = new Array(fila.length);
    let cursor = 0;
    async function worker() {
      while (cursor < fila.length) {
        if (sinal && sinal.aborted) return;
        const i = cursor;
        cursor += 1;
        const item = fila[i];
        anotacoes[i] = await QualityModel.consultarComponente(item.codigo, {
          fetch: typeof fetch === "function" ? fetch : null,
          cache,
          signal: sinal,
        });
      }
    }
    try {
      await Promise.all([worker(), worker(), worker()]);
    } catch (e) {
      if (!aindaVale(ticket) || seq !== seqComp) return;
      compEstado = "erro";
      compMensagem = "A consulta dos componentes parou. As fichas já lidas foram mantidas; o restante não virou zero.";
    }
    if (!aindaVale(ticket) || seq !== seqComp) return;
    painel = QualityModel.montarPainelComponentes(appRef.estrutura, anotacoes.filter(Boolean));
    painel.naoConsultados = resto.map((c) => c.codigo);
    if (sinal.aborted) {
      compEstado = "erro";
      compMensagem = "O tempo da consulta dos componentes acabou. As fichas já lidas foram mantidas; as demais não foram preenchidas com zero.";
    } else {
      compEstado = "ok";
    }
    publicar();
  }

  function aoCarregar(app, mudou) {
    invalidar();
    appRef = app || null;
    onMudou = mudou || null;
    relatorio = null;
    painel = null;
    compEstado = "idle";
    compMensagem = "";
    cadeiaSel = "";
    mostrarTodos = false;
    if (appRef) {
      appRef.qualidade = { schema: QualityModel.SCHEMA, relatorio: null, componentes: null };
    }
    const raiz = typeof document !== "undefined" ? document.getElementById("tab-qualidade") : null;
    vincular(raiz);
    render();
    consultarRelatorio(false);
    consultarComponentes(false);
  }

  function linksHtml(links) {
    if (!links) return "";
    const itens = [
      ["Ficha RCSB", links.rcsb],
      ["Entrada PDBe", links.pdbe],
      ["XML do relatório (PDBe)", links.xml],
      ["PDF do relatório (arquivo wwPDB no RCSB)", links.pdf],
    ].filter((par) => par[1]);
    return `<ul class="ov-lista">${itens.map(([rotulo, url]) =>
      `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(rotulo)}</a></li>`
    ).join("")}</ul>`;
  }

  function htmlRelatorio() {
    if (!appRef || !appRef.pdbId) {
      return `<p>Esta leitura não tem ID de depósito. O relatório wwPDB não foi consultado. Nenhum indicador remoto foi preenchido com zero.</p>
        <p class="muted small">O arquivo gzip em files.rcsb.org não envia CORS; por isso o navegador não leria esse endereço mesmo com ID. A cópia usada, quando há ID, é o XML da PDBe.</p>`;
    }
    if (!relatorio) {
      return `<p role="status"><span class="spinner" aria-hidden="true"></span> Consultando o relatório wwPDB de ${esc(idAtual())}. O viewer continua disponível.</p>
        <button type="button" class="ghost-btn" data-ql="retry-relatorio">Interromper e tentar de novo</button>`;
    }
    if (relatorio.estado !== "ok" && relatorio.estado !== "parcial") {
      return `<p class="erro" role="alert">${esc(relatorio.mensagem || "A consulta não devolveu indicadores.")}</p>
        ${linksHtml(relatorio.links)}
        <button type="button" class="ghost-btn" data-ql="retry-relatorio">Tentar de novo</button>`;
    }
    const fonte = relatorio.fonte || {};
    const grupos = ["experimento", "ajuste", "geometria", "em", "nmr"];
    const nomes = {
      experimento: "Experimento citado",
      ajuste: "Ajuste aos dados",
      geometria: "Geometria",
      em: "Microscopia eletrônica",
      nmr: "Ensemble de NMR",
    };
    let blocos = "";
    for (const g of grupos) {
      const lista = (relatorio.metricas || []).filter((m) => m.grupo === g);
      if (!lista.length) continue;
      blocos += `<h4>${nomes[g]}</h4><dl class="ql-grade">${lista.map((m) =>
        `<dt>${esc(m.rotulo)}</dt><dd>${esc(m.texto)}${m.unidade ? " " + esc(m.unidade) : ""}</dd>`
      ).join("")}</dl>`;
    }
    const omitidos = (relatorio.omitidos || []).slice(0, 12);
    const omit = omitidos.length
      ? `<p class="muted small">Sem valor nesta consulta, e por isso não aparecem como zero: ${esc(omitidos.map((o) => o.rotulo + " — " + o.motivo).join("; "))}.</p>`
      : "";
    const nao = (relatorio.naoAplicaveis || []).length
      ? `<p class="muted small">Fora deste método: ${esc(relatorio.naoAplicaveis.map((o) => o.rotulo).join("; "))}.</p>`
      : "";
    const avisos = (relatorio.avisos || []).map((a) => `<p class="aviso-ov">${esc(a)}</p>`).join("");
    const metodo = relatorio.metodo ? relatorio.metodo.classe : "desconhecido";
    return `<p>ID ${esc(relatorio.id)}. Classe usada para filtrar métricas: <strong>${esc(metodo)}</strong>. ${relatorio.metodo && relatorio.metodo.conflito ? "Há divergência entre o arquivo e a fonte consultada." : ""}</p>
      <p class="muted small">Fonte: ${esc(fonte.nome || "relatório wwPDB")}. ${fonte.data ? "Data: " + esc(fonte.data) + "." : "Data não informada."} ${fonte.url ? `<a href="${esc(fonte.url)}" target="_blank" rel="noopener">Abrir a fonte</a>` : ""}</p>
      ${blocos || "<p>O relatório foi lido, mas não trouxe métrica aplicável a este método.</p>"}
      ${omit}${nao}${avisos}
      <p class="aviso-ov">${esc(relatorio.avisoGlobal || QualityModel.AVISO_GLOBAL)}</p>
      ${linksHtml(relatorio.links)}
      <p class="muted small">O PDF no files.rcsb.org abre como download. Esse endereço gzip não envia CORS, então o aplicativo não o lê por script.</p>
      <button type="button" class="ghost-btn" data-ql="retry-relatorio">Consultar de novo</button>`;
  }

  function htmlLocal() {
    const local = relatorio && relatorio.local;
    if (!appRef || !appRef.pdbId) {
      return `<p class="muted small">Sem ID, não há relatório por resíduo. Lacunas sem coordenada continuam sem nota local.</p>`;
    }
    if (!relatorio) return `<p class="muted small">Aguardando o relatório para montar a cobertura local.</p>`;
    if (!local || local.estado !== "ok") {
      return `<p>${esc((local && local.motivo) || "Indicadores por resíduo pendentes. Não há painel simulado.")}</p>
        <p class="aviso-ov">${esc(QualityModel.AVISO_LOCAL)}</p>`;
    }
    const cadeias = Object.keys(local.porCadeia || {});
    if (!cadeiaSel || !local.porCadeia[cadeiaSel]) cadeiaSel = cadeias[0] || "";
    const cobertura = local.porCadeia[cadeiaSel];
    const opcoes = cadeias.map((c) => `<option value="${esc(c)}"${c === cadeiaSel ? " selected" : ""}>Cadeia ${esc(c)}</option>`).join("");
    const daCadeia = (local.itens || []).filter((it) => it.chain === cadeiaSel && it.mapeamento !== "campo_ausente");
    const visiveisBase = mostrarTodos ? daCadeia : daCadeia.filter((it) => it.outlier || it.mapeamento !== "modelo");
    const limite = 200;
    const visiveis = visiveisBase.slice(0, limite);
    const mapa = {
      modelo: "no modelo selecionado",
      sem_residuo: "sem posição correspondente",
      sem_coordenada: "sem coordenada no modelo",
      resname_divergente: "nome do resíduo diferente do relatório",
      altloc_ausente: "altLoc ausente no modelo",
      ambiguo: "posição ambígua",
      campo_ausente: "falta chain, resnum ou model",
    };
    const linhas = visiveis.map((it) => `<tr>
      <td>${esc(it.resname || "")} ${esc(it.resnum)}${esc(it.icode || "")}</td>
      <td>${it.altcode ? esc(it.altcode) : "—"}</td>
      <td>${it.rama ? esc(it.rama) : "—"}</td>
      <td>${it.rota ? esc(it.rota) : "—"}</td>
      <td>${Number(it.bondOutliers) || 0}</td>
      <td>${Number(it.angleOutliers) || 0}</td>
      <td>${Number(it.clashes) || 0}</td>
      <td>${esc(mapa[it.mapeamento] || it.mapeamento)}</td>
    </tr>`).join("");
    const cov = cobertura
      ? `<p>Cadeia author ${esc(cadeiaSel)}, modelo ${esc(local.modeloSelecionado)}: ${cobertura.comIndicador} de ${cobertura.residuosComCoordenadas} posições com coordenada e numeração author têm indicador neste relatório. ${cobertura.semIndicador} posição(ões) com coordenada não aparecem no relatório e não recebem nota. Lacunas sem coordenada nesta cadeia: ${cobertura.lacunasSemCoordenada}. Elas não têm qualidade local.</p>`
      : `<p>Não há cadeia author para cruzar com o modelo.</p>`;
    const semAuth = local.semIdentidadeAuthor
      ? `<p class="muted small">${local.semIdentidadeAuthor} posição(ões) com coordenada não têm cadeia e número author. Elas não recebem indicador e não foram colocadas em outra cadeia.</p>`
      : "";
    return `${cov}
      ${semAuth}
      <p class="muted small">Subgrupos lidos: ${local.subgruposLidos}. Ignorados por serem de outro modelo: ${local.subgruposOutroModelo}. Sem chain, resnum ou model: ${local.campoAusente}.</p>
      <div class="ql-controles">
        <label>Cadeia <select id="ql-cadeia">${opcoes}</select></label>
        <label><input id="ql-todos" type="checkbox"${mostrarTodos ? " checked" : ""}/> Mostrar todos os resíduos com indicador, não só outliers e falhas de mapeamento</label>
      </div>
      <div class="ql-scroll" tabindex="0" aria-label="Indicadores por resíduo">
        <table>
          <thead><tr><th>Resíduo</th><th>altLoc</th><th>Ramachandran</th><th>Rotâmero</th><th>Ligações</th><th>Ângulos</th><th>Clashes</th><th>Mapeamento</th></tr></thead>
          <tbody>${linhas || `<tr><td colspan="8">Nada a listar neste filtro. Isso não significa nota zero para o restante da cadeia.</td></tr>`}</tbody>
        </table>
      </div>
      ${visiveisBase.length > limite ? `<p class="muted small">Mostrando ${limite} de ${visiveisBase.length} linhas.</p>` : ""}
      <p class="aviso-ov">${esc(local.aviso || QualityModel.AVISO_LOCAL)}</p>
      <p class="muted small">${esc(QualityModel.AVISO_VIZINHO)}</p>`;
  }

  function htmlFicha(f) {
    const oficial = f.oficial;
    const pos = (f.posicoes || []).slice(0, 8).map((p) => {
      const alt = p.altlocs && p.altlocs.length ? `, altLoc ${p.altlocs.join("/")}` : "";
      return `${p.chain} ${p.seq}${p.icode || ""}${alt}`;
    }).join("; ");
    const mais = (f.posicoes || []).length > 8 ? ` e mais ${(f.posicoes || []).length - 8}` : "";
    let oficialHtml = "<p>Ficha oficial ainda não chegou.</p>";
    if (oficial) {
      const partes = [];
      if (oficial.nome) partes.push(["Nome", oficial.nome]);
      if (oficial.tipo) partes.push(["Tipo no dicionário", oficial.tipo]);
      if (oficial.formula) partes.push(["Fórmula", oficial.formula]);
      if (oficial.massaTexto != null) partes.push(["Massa", oficial.massaTexto]);
      oficialHtml = `<dl class="ql-grade">${partes.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        <ul class="ov-lista">${(oficial.links || []).map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.rotulo)}</a></li>`).join("")}</ul>
        <p class="muted small">Fonte: ${esc(oficial.fonte && oficial.fonte.nome ? oficial.fonte.nome : "CCD")}. ${oficial.fonte && oficial.fonte.url ? `<a href="${esc(oficial.fonte.url)}" target="_blank" rel="noopener">Registro</a>` : ""}</p>`;
    } else if (f.consulta && f.consulta.mensagem) {
      oficialHtml = `<p class="erro" role="alert">${esc(f.consulta.mensagem)}</p>`;
    }
    return `<article class="ql-comp">
      <h4>${esc(f.codigo)} ×${esc(f.instancias)}</h4>
      <p>${pos ? "Posições no modelo selecionado: " + esc(pos + mais) + "." : "Sem posição listada no modelo selecionado."}</p>
      <p>${esc(f.hipotese)}</p>
      ${oficialHtml}
    </article>`;
  }

  function htmlComponentes() {
    const est = appRef && appRef.estrutura;
    if (!est) return `<p>Sem modelo lido.</p>`;
    const prot = est.componentes && est.componentes.proteinas;
    const poli = prot
      ? `<p>Polímero peptídico no modelo: ${prot.posicoes} posição(ões) com coordenadas${prot.cadeias && prot.cadeias.length ? " nas cadeias " + esc(prot.cadeias.join(", ")) : ""}. ${prot.modificadas ? esc(String(prot.modificadas)) + " são resíduo modificado na cadeia, não ligante livre." : "Nenhum resíduo modificado da lista foi separado."} ${esc(prot.criterio || "")}</p>
        <p class="muted small">Os 20 aminoácidos padrão não são consultados um a um no CCD nesta versão.</p>`
      : "";
    if (compEstado === "carregando" || compEstado === "idle") {
      return `${poli}<p role="status"><span class="spinner" aria-hidden="true"></span> Consultando o dicionário químico dos componentes que não são aminoácido padrão.</p>`;
    }
    if (compEstado === "erro" && !painel) {
      return `${poli}<p class="erro" role="alert">${esc(compMensagem || "A consulta dos componentes falhou.")}</p>
        <button type="button" class="ghost-btn" data-ql="retry-comp">Tentar de novo</button>`;
    }
    const ordem = ["modificado", "agua", "ion", "hetero", "terminal", "outro-polimero"];
    const titulos = {
      modificado: "Modificações na cadeia",
      agua: "Água registrada",
      ion: "Íons da lista parcial",
      hetero: "Outros HETATM",
      terminal: "Grupos terminais",
      "outro-polimero": "Outros polímeros",
    };
    let corpo = "";
    for (const g of ordem) {
      const lista = painel && painel.grupos && painel.grupos[g];
      if (!lista || !lista.length) continue;
      corpo += `<h4>${titulos[g]}</h4>${lista.map(htmlFicha).join("")}`;
    }
    if (!corpo) corpo = `<p>Nenhum componente fora do polímero padrão foi encontrado no modelo selecionado. Isso não afirma que a amostra não tinha água, íon ou ligante.</p>`;
    const holo = est.componentes && est.componentes.holo ? est.componentes.holo.motivo : "";
    const nao = painel && painel.naoConsultados && painel.naoConsultados.length
      ? `<p class="muted small">Não consultados nesta rodada, para limitar o número de pedidos: ${esc(painel.naoConsultados.join(", "))}.</p>`
      : "";
    return `${poli}${corpo}
      <p class="aviso-ov">${esc(holo)} ${esc(QualityModel.AVISO_PAPEL)}</p>
      ${compMensagem ? `<p class="aviso-ov">${esc(compMensagem)}</p>` : ""}
      ${nao}
      <button type="button" class="ghost-btn" data-ql="retry-comp">Consultar componentes de novo</button>`;
  }

  function render() {
    const raiz = raizAtual || (typeof document !== "undefined" ? document.getElementById("tab-qualidade") : null);
    if (!raiz) return;
    if (!raiz.querySelector || !raiz.querySelector(".ql")) {
      raiz.innerHTML = `<section class="ql" aria-labelledby="ql-titulo">
        <h3 id="ql-titulo">Qualidade e componentes</h3>
        <p class="muted small">Contrato ${esc(QualityModel.SCHEMA)}. Valores só entram quando a fonte os devolve. Campo ausente não vira zero.</p>
        <p class="aviso-ov">${esc(QualityModel.AVISO_GLOBAL)}</p>
        <h3>Relatório wwPDB</h3>
        <div id="ql-rel" aria-live="polite"></div>
        <h3>Qualidade local</h3>
        <div id="ql-loc"></div>
        <h3>Componentes do modelo selecionado</h3>
        <div id="ql-comp" aria-live="polite"></div>
      </section>`;
    }
    const rel = raiz.querySelector("#ql-rel");
    const loc = raiz.querySelector("#ql-loc");
    const comp = raiz.querySelector("#ql-comp");
    if (rel) rel.innerHTML = htmlRelatorio();
    if (loc) loc.innerHTML = htmlLocal();
    if (comp) comp.innerHTML = htmlComponentes();
  }

  function definirParaTeste(estado) {
    relatorio = estado.relatorio || null;
    painel = estado.painel || null;
    appRef = estado.app || null;
    compEstado = estado.compEstado || "ok";
    if (estado.raiz) vincular(estado.raiz);
    render();
  }

  return {
    aoCarregar,
    invalidar,
    vincular,
    desvincular,
    contagemOuvintes,
    aindaVale,
    render,
    escapar: esc,
    definirParaTeste,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QualityUI;
