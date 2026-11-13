// Interface da comparação de análises guardadas.
// Textos importados entram por textContent. O JSON não sai do navegador.

"use strict";

const AnalysisUI = (() => {
  const Snap = typeof AnalysisSnapshot !== "undefined"
    ? AnalysisSnapshot
    : require("./analysis-snapshot.js");
  let itens = [];
  let resultado = null;
  let ligado = false;
  let fichaId = "";

  function $(id) { return document.getElementById(id); }

  function abrir() {
    if (typeof memorizarEntrada === "function") memorizarEntrada();
    if (typeof invalidarConsultasEstrutura === "function") invalidarConsultasEstrutura();
    const entrada = $("entrada");
    const workspace = $("workspace");
    const comparacao = $("comparacao");
    const ensemble = $("ensemble");
    const painel = $("analises");
    if (entrada) entrada.hidden = true;
    if (workspace) workspace.hidden = true;
    if (comparacao) comparacao.hidden = true;
    if (ensemble) ensemble.hidden = true;
    if (painel) painel.hidden = false;
    render();
    if (typeof atualizarURL === "function" && typeof history !== "undefined") atualizarURL("analises", "1");
    if (typeof abrirTela === "function") abrirTela("analises", "an-titulo");
    else if (typeof window !== "undefined" && window.scrollTo) window.scrollTo({ top: 0, behavior: "auto" });
  }

  function aoFechar() {
    const painel = $("analises");
    if (painel) painel.hidden = true;
  }

  function msg(texto, erro) {
    const el = $("an-erro");
    if (!el) return;
    el.hidden = !texto;
    el.textContent = texto || "";
    el.className = erro ? "erro" : "muted small";
  }

  function lerPergunta() {
    const campo = (id) => {
      const el = $(id);
      return el ? el.value : "";
    };
    const marcado = (id) => {
      const el = $(id);
      return !!(el && el.checked);
    };
    return {
      regiao: campo("an-regiao"),
      regiaoEssencial: marcado("an-regiao-essencial"),
      componente: campo("an-componente"),
      componenteEliminatorio: marcado("an-componente-elim"),
      pocketEliminatorio: marcado("an-pocket-elim"),
      pesos: {
        cobertura: campo("an-peso-cobertura"),
        qualidade: campo("an-peso-qualidade"),
        componente: campo("an-peso-componente"),
        pocket: campo("an-peso-pocket"),
      },
    };
  }

  function definirPergunta(p) {
    const set = (id, valor) => { const el = $(id); if (el) el.value = valor == null ? "" : String(valor); };
    const chk = (id, valor) => { const el = $(id); if (el) el.checked = !!valor; };
    const pesos = (p && p.pesos) || {};
    set("an-regiao", p && p.regiao);
    chk("an-regiao-essencial", p && p.regiaoEssencial);
    set("an-componente", p && p.componente);
    chk("an-componente-elim", p && p.componenteEliminatorio);
    chk("an-pocket-elim", p && p.pocketEliminatorio);
    set("an-peso-cobertura", pesos.cobertura);
    set("an-peso-qualidade", pesos.qualidade);
    set("an-peso-componente", pesos.componente);
    set("an-peso-pocket", pesos.pocket);
  }

  function importarTexto(nome, texto) {
    const r = Snap.importar(texto, itens, { bytes: texto == null ? 0 : String(texto).length });
    if (r.ok) {
      itens = r.colecao;
      resultado = null;
      msg(nome ? "Análise importada: " + nome + "." : "Análise importada.", false);
    } else {
      msg((nome ? nome + ": " : "") + r.erro, true);
    }
    render();
    return r;
  }

  function remover(id) {
    itens = itens.filter((a) => a.id !== id);
    if (fichaId === id) fichaId = "";
    resultado = null;
    render();
  }

  function limpar() {
    itens = [];
    resultado = null;
    fichaId = "";
    msg("Comparação limpa neste navegador. Os arquivos no computador não foram apagados.", false);
    render();
  }

  function textoMudanca(antes, depois) {
    if (!antes) return "";
    const nomes = (lista) => (lista || []).map((c) => c.rotulo).join(", ") || "ninguém";
    const a = nomes(antes.lideres);
    const b = nomes(depois.lideres);
    if (!depois.ranqueado) return "O ranking deixou de ser calculado. " + (depois.motivo || "");
    if (!antes.ranqueado) return "";
    if (a === b) return "O primeiro colocado permanece " + b + ". " + (depois.razao || "");
    return "O primeiro colocado mudou de " + a + " para " + b + ". " + (depois.razao || depois.motivo || "");
  }

  function comparar() {
    if (itens.length < Snap.MIN_ANALISES || itens.length > Snap.MAX_ANALISES) {
      resultado = Snap.comparar(itens, lerPergunta());
      msg(resultado.motivo, true);
      render();
      return resultado;
    }
    const antes = resultado;
    resultado = Snap.comparar(itens, lerPergunta());
    resultado.mudanca = textoMudanca(antes, resultado);
    msg("", false);
    render();
    return resultado;
  }

  function registrarEscolha() {
    if (!resultado) {
      const el = $("an-escolha-status");
      if (el) el.textContent = "Calcule o ranking antes de registrar a escolha.";
      return { ok: false, erro: "sem comparação" };
    }
    const sel = $("an-escolha");
    const jus = $("an-justificativa");
    const r = Snap.comEscolha(resultado, {
      id: sel ? sel.value : "",
      justificativa: jus ? jus.value : "",
    });
    const el = $("an-escolha-status");
    if (!r.ok) {
      if (el) el.textContent = r.erro;
      return r;
    }
    resultado = r.resultado;
    if (el) {
      el.textContent = resultado.escolha
        ? "Decisão registrada em " + resultado.escolha.rotulo + ". Ela entra no relatório e não altera os dados guardados."
        : "Decisão retirada.";
    }
    return r;
  }

  function baixar(nome, conteudo, mime) {
    const blob = new Blob([conteudo], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportar(tipo) {
    if (!resultado) return "";
    if (tipo === "json") {
      const texto = Snap.relatorioJson(resultado);
      baixar("comparacao-analises.json", texto, "application/json;charset=utf-8");
      return texto;
    }
    const md = Snap.relatorioMarkdown(resultado);
    baixar("comparacao-analises.md", md, "text/markdown;charset=utf-8");
    return md;
  }

  function guardarWorkspace(estado, baixarFn, opcoes) {
    const snap = Snap.montarDeWorkspace(estado, opcoes || {});
    const nome = Snap.nomeArquivo(snap);
    const texto = JSON.stringify(snap, null, 2) + "\n";
    if (typeof baixarFn === "function") baixarFn(nome, texto);
    return { nome, texto, snap };
  }

  function el(tag, classe, texto) {
    const node = document.createElement(tag);
    if (classe) node.className = classe;
    if (texto != null) node.textContent = texto;
    return node;
  }

  function fichaTexto(snap) {
    const linhas = [];
    linhas.push(snap.rotulo + " (" + snap.id + ")");
    linhas.push("Origem: " + (snap.origem && snap.origem.fonte ? snap.origem.fonte : "não informada"));
    if (snap.origem && snap.origem.pdbId) linhas.push("PDB: " + snap.origem.pdbId);
    if (snap.origem && snap.origem.sintetico) linhas.push("Dados sintéticos de teste.");
    linhas.push("Guardada em: " + snap.geradoEm);
    linhas.push("Formato: " + (snap.origem && snap.origem.formato));
    linhas.push("Cadeias: " + (snap.cadeias || []).map((c) => c.id + " (" + c.residuos.length + " resíduos modelados)").join(", "));
    linhas.push("Cobertura determinada: " + (snap.lacunas && snap.lacunas.determinado ? "sim" : "não") + ". " + (snap.lacunas && snap.lacunas.resumo ? snap.lacunas.resumo : ""));
    linhas.push("Qualidade: " + (snap.qualidade && snap.qualidade.estado));
    linhas.push("Pockets: " + (snap.pockets && snap.pockets.estado) + ". " + ((snap.pockets && snap.pockets.motivo) || ""));
    const hetero = ((snap.componentes && snap.componentes.hetero) || []).map((h) => h.codigo + "×" + h.instancias).join(", ");
    linhas.push("Heterocomponentes observados: " + (hetero || "nenhum no inventário") + ".");
    linhas.push("Reabrir esta ficha não recarrega o 3D: o PDB não está dentro do arquivo.");
    return linhas.join("\n");
  }

  function renderLista() {
    const lista = $("an-lista");
    if (!lista) return;
    lista.textContent = "";
    if (!itens.length) {
      lista.appendChild(el("p", "muted small", "Nenhuma análise importada. O ranking pede de 2 a 5 arquivos."));
      return;
    }
    const ul = el("ul", "an-ul");
    for (const snap of itens) {
      const li = el("li", "an-item");
      const cab = el("div", "an-item-cab");
      cab.appendChild(el("strong", null, snap.rotulo));
      const meta = el("span", "muted small");
      meta.textContent = " " + (snap.origem && snap.origem.fonte ? snap.origem.fonte : "") + (snap.origem && snap.origem.pdbId ? " · " + snap.origem.pdbId : "") + (snap.origem && snap.origem.sintetico ? " · sintético" : "");
      cab.appendChild(meta);
      li.appendChild(cab);
      const acoes = el("div", "an-item-acoes");
      const ver = el("button", "ghost-btn", "Ver ficha");
      ver.type = "button";
      ver.addEventListener("click", () => {
        fichaId = fichaId === snap.id ? "" : snap.id;
        renderFicha();
      });
      const rm = el("button", "ghost-btn", "Remover");
      rm.type = "button";
      rm.addEventListener("click", () => remover(snap.id));
      acoes.appendChild(ver);
      acoes.appendChild(rm);
      li.appendChild(acoes);
      ul.appendChild(li);
    }
    lista.appendChild(ul);
  }

  function renderFicha() {
    const box = $("an-ficha");
    if (!box) return;
    box.textContent = "";
    const snap = itens.find((a) => a.id === fichaId);
    if (!snap) return;
    const pre = el("pre", "an-pre", fichaTexto(snap));
    box.appendChild(pre);
  }

  function renderResultado() {
    const box = $("an-resultado");
    if (!box) return;
    box.textContent = "";
    if (!resultado) return;
    const aviso = resultado.mudanca || "";
    if (aviso) box.appendChild(el("p", "an-mudanca", aviso));
    if (resultado.motivo && !aviso.includes(resultado.motivo)) box.appendChild(el("p", null, resultado.motivo));
    if (resultado.razao && !aviso.includes(resultado.razao)) box.appendChild(el("p", null, resultado.razao));
    for (const alerta of resultado.alertas || []) {
      if (alerta === resultado.motivo) continue;
      box.appendChild(el("p", "an-alerta", alerta));
    }
    if ((resultado.candidatos || []).length) {
      const scroll = el("div", "an-scroll");
      const tabela = el("table", "an-tabela");
      const head = document.createElement("tr");
      ["Posição", "Análise", "Situação", "Pontuação", "Pesos com dado", "Por quê"].forEach((t) => head.appendChild(el("th", null, t)));
      tabela.appendChild(head);
      for (const c of resultado.candidatos) {
        const tr = document.createElement("tr");
        tr.appendChild(el("td", null, c.posicao == null ? "—" : String(c.posicao) + (c.empate ? " (empate)" : "")));
        tr.appendChild(el("td", null, c.rotulo));
        tr.appendChild(el("td", null, rotuloSituacao(c.situacao)));
        tr.appendChild(el("td", null, c.pontuacao == null ? "indisponível" : String(Math.round(c.pontuacao * 1000) / 1000)));
        tr.appendChild(el("td", null, c.fracaoDados == null ? "—" : String(Math.round(c.fracaoDados * 1000) / 1000)));
        const porque = document.createElement("td");
        const partes = [];
        for (const s of c.subscores || []) {
          partes.push(s.rotulo + ": " + (s.estado === "indisponivel" ? "indisponível" : String(Math.round(s.subpontuacao * 1000) / 1000)) + " (peso " + s.peso + "). " + s.detalhe);
        }
        for (const m of c.motivos || []) partes.push(m);
        porque.textContent = partes.join(" ");
        tr.appendChild(porque);
        tabela.appendChild(tr);
      }
      scroll.appendChild(tabela);
      box.appendChild(scroll);
    }
    if ((resultado.insights || []).length) {
      box.appendChild(el("h3", null, "Diferenças ligadas aos critérios"));
      box.appendChild(el("p", "muted small", "Leitura organizada dos arquivos guardados. Não garante relevância biológica."));
      for (const item of resultado.insights) {
        const bloco = el("article", "an-insight");
        bloco.appendChild(el("h4", null, item.titulo));
        bloco.appendChild(el("p", null, item.evidencia));
        if (item.limitacao) bloco.appendChild(el("p", "muted small", "Limitação: " + item.limitacao));
        box.appendChild(bloco);
      }
    }
    preencherEscolha();
  }

  function rotuloSituacao(s) {
    if (s === "ranqueado") return "pontuado";
    if (s === "nao_pontuado") return "não pontuado";
    if (s === "desclassificado") return "desclassificado";
    return s || "";
  }

  function preencherEscolha() {
    const sel = $("an-escolha");
    if (!sel) return;
    const atual = sel.value;
    sel.textContent = "";
    const vazio = document.createElement("option");
    vazio.value = "";
    vazio.textContent = "Escolher depois";
    sel.appendChild(vazio);
    for (const c of (resultado && resultado.candidatos) || itens) {
      const op = document.createElement("option");
      op.value = c.id;
      op.textContent = c.rotulo;
      sel.appendChild(op);
    }
    if ([...sel.options].some((op) => op.value === atual)) sel.value = atual;
  }

  function render() {
    const contagem = $("an-contagem");
    if (contagem) contagem.textContent = itens.length + " de 5 análises neste navegador.";
    renderLista();
    renderFicha();
    renderResultado();
  }

  async function aoEscolherArquivos(files) {
    const erros = [];
    for (const file of files) {
      if (file.size > Snap.LIMITE_BYTES) {
        erros.push(file.name + ": passa de 1,5 MB.");
        continue;
      }
      let texto = "";
      try { texto = await file.text(); }
      catch (e) { erros.push(file.name + ": não foi possível ler o arquivo."); continue; }
      const r = Snap.importar(texto, itens, { bytes: file.size });
      if (!r.ok) erros.push(file.name + ": " + r.erro);
      else itens = r.colecao;
    }
    resultado = null;
    if (erros.length) msg(erros.join(" "), true);
    else if (files.length) msg("Importação concluída neste navegador. Nada foi enviado a um servidor.", false);
    render();
  }

  function init() {
    if (ligado || typeof document === "undefined") return;
    const abrirBtn = $("btn-abrir-analises");
    if (!abrirBtn) return;
    ligado = true;
    abrirBtn.addEventListener("click", abrir);
    const input = $("an-arquivo");
    const importarBtn = $("btn-an-arquivo");
    if (importarBtn && input) importarBtn.addEventListener("click", () => input.click());
    if (input) {
      input.addEventListener("change", () => {
        const files = [...(input.files || [])];
        input.value = "";
        aoEscolherArquivos(files);
      });
    }
    const limparBtn = $("an-limpar");
    if (limparBtn) limparBtn.addEventListener("click", limpar);
    const atualizar = $("an-atualizar");
    if (atualizar) atualizar.addEventListener("click", comparar);
    const registrar = $("an-registrar");
    if (registrar) registrar.addEventListener("click", registrarEscolha);
    const md = $("an-md");
    if (md) md.addEventListener("click", () => exportar("md"));
    const json = $("an-json");
    if (json) json.addEventListener("click", () => exportar("json"));
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  return {
    abrir,
    aoFechar,
    init,
    importarTexto,
    remover,
    limpar,
    comparar,
    definirPergunta,
    lerPergunta,
    registrarEscolha,
    exportar,
    guardarWorkspace,
    render,
    itens: () => itens.slice(),
    resultado: () => resultado,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AnalysisUI;
if (typeof globalThis !== "undefined") globalThis.AnalysisUI = AnalysisUI;
