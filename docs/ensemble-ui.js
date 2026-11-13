// Interface do ensemble. A lógica fica em ensemble-analysis.js.
// DESLIGAR O MÓDULO: mude ATIVO para false. A entrada some e o resto do app segue igual.
// Remover de vez: apague este arquivo, ensemble-analysis.js e o bloco Ensemble no index.html.

"use strict";

const EnsembleUI = (() => {
  const ATIVO = true;
  const LS_KEY = "peki-ensemble-cache-v1";

  let sessao = null;
  let geracao = 0;
  let cancelado = false;
  let ouvintes = false;
  let avisoCache = "";
  let viewer = null;
  let modeloId = null;

  function ativo() { return ATIVO; }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function $(id) { return document.getElementById(id); }

  function status(msg, erro) {
    const el = $("ens-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = erro ? "ens-status ens-erro" : "ens-status";
  }

  function erroHome(msg) {
    const el = $("ens-erro-home");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
  }

  function baixar(nome, conteudo, mime) {
    const blob = new Blob([conteudo], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  function lerLs() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { versao: EnsembleAnalysis.VERSAO, itens: {} };
      const o = JSON.parse(raw);
      if (!o || o.versao !== EnsembleAnalysis.VERSAO || !o.itens) return { versao: EnsembleAnalysis.VERSAO, itens: {} };
      return o;
    } catch (e) {
      return { versao: EnsembleAnalysis.VERSAO, itens: {} };
    }
  }

  const memoria = new Map();

  function lerCache(chave) {
    if (memoria.has(chave)) return memoria.get(chave);
    const item = lerLs().itens[chave];
    if (item && Array.isArray(item.pockets)) {
      memoria.set(chave, item.pockets);
      return item.pockets;
    }
    return null;
  }

  function gravarCache(chave, pockets) {
    memoria.set(chave, pockets);
    try {
      const o = lerLs();
      o.itens[chave] = { quando: new Date().toISOString(), pockets };
      const chaves = Object.keys(o.itens).sort((a, b) => String(o.itens[a].quando).localeCompare(String(o.itens[b].quando)));
      while (chaves.length > 40) delete o.itens[chaves.shift()];
      localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (e) {
      avisoCache = "Sem espaço no localStorage; o resultado desta sessão fica só na memória.";
    }
  }

  function chaveDoItem(item) {
    if (item.origem === "modelo") return EnsembleAnalysis.chaveCache("modelo", item.chaveCache || EnsembleAnalysis.hashTexto(item.texto || ""));
    return EnsembleAnalysis.chaveCache("pdb", item.id);
  }

  function lerNumero(id, fallback) {
    const el = $(id);
    if (!el || el.value === "") return fallback;
    const n = Number(el.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function lerParams() {
    const modo = $("ens-modo");
    const pausaSeg = lerNumero("ens-pausa", 2);
    return EnsembleAnalysis.normalizarParams({
      modoAlinhamento: modo ? modo.value : "numero",
      jaccardMin: lerNumero("ens-jaccard", 0.5),
      usarCentroide: !!($("ens-centroide") && $("ens-centroide").checked),
      distanciaMax: lerNumero("ens-distancia", 6),
      margemVina: lerNumero("ens-margem", 4),
      faixaCaixa: lerNumero("ens-faixa", 50),
      limite: lerNumero("ens-limite", 8),
      pausaEntreChamadasMs: Math.round(pausaSeg * 1000),
      referenciaId: sessao && sessao.referenciaId,
    });
  }

  function decisao() {
    const el = $("ens-decisao");
    return el ? el.value : "";
  }

  function mostrarPainel() {
    const entrada = $("entrada");
    const workspace = $("workspace");
    const comparacao = $("comparacao");
    const main = $("ensemble");
    if (entrada) entrada.hidden = true;
    if (workspace) workspace.hidden = true;
    if (comparacao) comparacao.hidden = true;
    const analises = $("analises");
    if (analises) analises.hidden = true;
    if (main) main.hidden = false;
    erroHome("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function invalidarConsultas() {
    geracao += 1;
    cancelado = true;
  }

  function aoFechar() {
    invalidarConsultas();
    const main = $("ensemble");
    if (main) main.hidden = true;
    const box = $("ens-progresso");
    if (box) box.hidden = true;
    const calc = $("ens-calcular");
    const canc = $("ens-cancelar");
    if (calc) calc.hidden = false;
    if (canc) canc.hidden = true;
  }

  function setRodando(on) {
    const calc = $("ens-calcular");
    const canc = $("ens-cancelar");
    if (calc) calc.hidden = on;
    if (canc) canc.hidden = !on;
    const box = $("ens-progresso");
    if (box) box.hidden = !on;
  }

  function setProgresso(feitos, total, texto) {
    const pct = total ? Math.round((100 * feitos) / total) : 0;
    const fill = $("ens-progresso-fill");
    const trilho = $("ens-trilho");
    const txt = $("ens-progresso-txt");
    if (fill) fill.style.width = pct + "%";
    if (trilho) trilho.setAttribute("aria-valuenow", String(pct));
    if (txt) txt.textContent = texto || "";
  }

  function esperar(ms, g) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const id = setInterval(() => {
        if (g !== geracao || cancelado || Date.now() - t0 >= ms) {
          clearInterval(id);
          resolve();
        }
      }, 200);
    });
  }

  function parar(g) { return g !== geracao || cancelado; }

  function ehLimite(e) {
    return String((e && e.message) || e).indexOf("Limite de uso da API") >= 0;
  }

  function renderLista(itens) {
    const el = $("ens-lista");
    if (!el) return;
    if (!itens || !itens.length) { el.innerHTML = ""; return; }
    el.innerHTML = "<ul class=\"ens-itens\">" + itens.map((it) =>
      "<li><strong>" + esc(it.rotulo || it.id) + "</strong> — " + esc(it.estado || "na fila") + "</li>"
    ).join("") + "</ul>";
  }

  function assinaturaCaixa(c) {
    if (!c || !c.ok) return "";
    return [c.center_x, c.center_y, c.center_z, c.size_x, c.size_y, c.size_z].join("|");
  }

  function lerCaixa(prefix) {
    const ids = ["cx", "cy", "cz", "sx", "sy", "sz"];
    const keys = ["center_x", "center_y", "center_z", "size_x", "size_y", "size_z"];
    const o = {};
    for (let i = 0; i < ids.length; i++) {
      const el = $(prefix + "-" + ids[i]);
      if (!el) return null;
      o[keys[i]] = Number(el.value);
    }
    if (!keys.every((k) => Number.isFinite(o[k]))) return null;
    return o;
  }

  function capturarEdits() {
    if (!sessao) return;
    const ens = lerCaixa("ens-box");
    const est = lerCaixa("ens-est");
    if (ens) sessao.editEns = ens;
    if (est) sessao.editEst = est;
  }

  function fmtCaixa(c) {
    if (!c) return "";
    if (typeof PrepAnalysis !== "undefined" && PrepAnalysis.formatarConfigVina) return PrepAnalysis.formatarConfigVina(c);
    return EnsembleAnalysis.formatarConfigVina(c);
  }

  function camposCaixa(prefix, caixa) {
    if (!caixa) return "";
    const pares = [
      ["cx", "center_x", "0.001"],
      ["cy", "center_y", "0.001"],
      ["cz", "center_z", "0.001"],
      ["sx", "size_x", "0.1"],
      ["sy", "size_y", "0.1"],
      ["sz", "size_z", "0.1"],
    ];
    return "<div class=\"ens-grade\">" + pares.map(([id, chave, step]) =>
      "<label>" + chave + " <input id=\"" + prefix + "-" + id + "\" type=\"number\" step=\"" + step + "\" value=\"" + esc(caixa[chave]) + "\"></label>"
    ).join("") + "</div>";
  }

  function clsFaixa(f) {
    if (f === 75) return "ens-faixa ens-faixa-75";
    if (f === 50) return "ens-faixa ens-faixa-50";
    if (f === 25) return "ens-faixa ens-faixa-25";
    return "ens-faixa ens-faixa-0";
  }

  function textoResiduos(lista, rotulo, faixa) {
    const corpo = lista && lista.length
      ? lista.map((r) => esc(r.rotulo) + " (" + esc(r.texto) + ", " + r.pct + "%)").join("; ")
      : "nenhum";
    return "<p><span class=\"" + clsFaixa(faixa) + "\">" + esc(rotulo) + "</span> " + corpo + "</p>";
  }

  function faixaDeGrupo(g) {
    return "<span class=\"" + clsFaixa(g.persistencia.faixa) + "\">" + esc(g.persistencia.rotuloFaixa) + "</span>";
  }

  function estadoDa(rel, id) {
    const e = (rel.estruturas || []).find((x) => x.id === id);
    return e && e.ligante ? e.ligante : null;
  }

  function caixaDaEstrutura(rel) {
    const params = rel.parametros;
    const estId = (sessao && sessao.estruturaCaixa) || rel.referenciaId;
    const bolsao = sessao && sessao.bolsaoCaixa;
    let escolhido = null;
    for (const g of rel.grupos) {
      for (const m of g.membros) {
        if (m.estruturaId !== estId) continue;
        if (!escolhido || m.name === bolsao) escolhido = m;
        if (m.name === bolsao) return { estId, membro: m, caixa: EnsembleAnalysis.caixaDeExtensao(m.extensao, params.margemVina) };
      }
    }
    if (!escolhido) return { estId, membro: null, caixa: { ok: false, erro: "Esta estrutura não tem bolsão neste agrupamento." } };
    return { estId, membro: escolhido, caixa: EnsembleAnalysis.caixaDeExtensao(escolhido.extensao, params.margemVina) };
  }

  function opcoesEstruturas(rel, atual) {
    return (rel.estruturas || []).filter((e) => e.incluida).map((e) =>
      "<option value=\"" + esc(e.id) + "\"" + (e.id === atual ? " selected" : "") + ">" + esc(e.rotulo || e.id) + "</option>"
    ).join("");
  }

  function opcoesBolsos(rel, estId, atual) {
    const nomes = [];
    for (const g of rel.grupos) {
      for (const m of g.membros) if (m.estruturaId === estId && nomes.indexOf(m.name) < 0) nomes.push(m.name);
    }
    return nomes.map((n) => "<option value=\"" + esc(n) + "\"" + (n === atual ? " selected" : "") + ">" + esc(n) + "</option>").join("");
  }

  function htmlResumoRelatorio(rel, f) {
    let html = "";
    if (rel.exemplo) html += "<p class=\"ens-exemplo-aviso\">" + esc(f.exemplo) + " Três estruturas inventadas, para ver a tabela sem chamar o DoGSiteScorer.</p>";
    html += "<p id=\"ens-n-efetivo\"><strong>N efetivo = " + rel.nEfetivo + "</strong> (pedidas nesta execução: " + rel.nPedidas;
    if (rel.nDisponiveis !== rel.nPedidas) html += "; carregadas: " + rel.nDisponiveis;
    html += "). " + esc(f.nEfetivo) + "</p>";
    html += "<p class=\"ens-nota\">Critério de agrupamento: Jaccard de resíduos ≥ " + rel.parametros.jaccardMin + ". " + esc(rel.agrupamento) + "</p>";
    if (rel.avisoCentroide) html += "<p class=\"ens-nota\">" + esc(rel.avisoCentroide) + "</p>";
    else if (rel.centroideAplicado) html += "<p class=\"ens-nota\">A distância entre centroides também entrou, no máximo " + rel.parametros.distanciaMax + " Å, porque estas estruturas compartilham referencial.</p>";
    html += "<p class=\"ens-nota\">" + esc(rel.alinhamento.limitacao) + "</p>";
    const descartadas = (sessao.bolsos || []).reduce((n, b) => n + (b.descartadas || 0), 0);
    if (descartadas) html += "<p class=\"ens-nota\">" + esc(avisoLinhasPocket(descartadas).trim()) + "</p>";
    if (avisoCache) html += "<p class=\"ens-nota\">" + esc(avisoCache) + "</p>";

    return html;
  }

  function htmlGruposRelatorio(rel, f) {
    let html = "";
    html += "<div class=\"ens-scroll\"><table class=\"ens-tabela\"><thead><tr>";
    html += "<th>Grupo</th><th>Persistência</th><th>drugScore DoGSite</th><th>Volume DoGSite (Å³)</th><th>Estruturas</th><th>Apo / holo</th>";
    html += "</tr></thead><tbody>";
    for (const g of rel.grupos) {
      const drug = g.drugScore.n ? g.drugScore.media + " (" + g.drugScore.min + "–" + g.drugScore.max + ")" : "—";
      const vol = g.volume.n ? g.volume.media + " (" + g.volume.min + "–" + g.volume.max + ")" : "—";
      const ests = g.estruturas.map((id) => {
        const lig = estadoDa(rel, id);
        return esc(id) + (lig ? " (" + esc(lig.classe) + ")" : "");
      }).join(", ");
      const mistura = g.misturaApoHolo ? " Há estrutura com ligante e estrutura sem ligante. Evidência: HETATM. Hipótese: o bolsão existe nos dois estados." : "";
      html += "<tr data-grupo=\"" + esc(g.id) + "\">";
      html += "<td><strong>" + esc(g.id) + "</strong></td>";
      html += "<td>" + esc(g.persistencia.texto) + " (" + g.persistencia.pct + "%) " + faixaDeGrupo(g) + " <span class=\"ens-n\">N efetivo = " + g.persistencia.n + "</span></td>";
      html += "<td>" + esc(drug) + "</td><td>" + esc(vol) + "</td><td class=\"ens-wrap\">" + ests + "</td>";
      html += "<td class=\"ens-wrap\">" + (g.misturaApoHolo ? "misto. " + esc(mistura) : "ver estruturas") + "</td>";
      html += "</tr>";
    }
    if (!rel.grupos.length) html += "<tr><td colspan=\"6\">Nenhum bolsão para agrupar.</td></tr>";
    html += "</tbody></table></div>";
    html += "<p class=\"ens-nota\">" + esc(f.descritor) + " " + esc(f.persistencia) + "</p>";

    return html;
  }

  function htmlResiduosRelatorio(rel) {
    let html = "";
    for (const g of rel.grupos) {
      const res = g.residuos;
      html += "<section class=\"ens-grupo\"><h3>" + esc(g.id) + " — resíduos, " + esc(g.persistencia.texto) + "</h3>";
      html += textoResiduos(res.faixa75, "≥ 75%", 75);
      html += textoResiduos(res.faixa50, "≥ 50% e < 75%", 50);
      html += textoResiduos(res.faixa25, "≥ 25% e < 50%", 25);
      html += textoResiduos(res.abaixo, "< 25%", 0);
      const diverge = res.todos.filter((r) => r.nomesDivergem).map((r) => r.rotulo);
      if (diverge.length) {
        html += "<p class=\"ens-nota\">Evidência: o nome do aminoácido não é o mesmo em todas as estruturas (" + esc(diverge.join("; ")) + "). Hipótese: numeração diferente ou mutação; o arquivo não decide qual.</p>";
      }
      html += "</section>";
    }

    return html;
  }

  function htmlMatrizRelatorio(rel, f) {
    let html = "";
    html += "<h3>Estrutura × bolsão</h3>";
    html += "<p id=\"ens-matriz-titulo\"><strong>N efetivo = " + rel.nEfetivo + ".</strong> Cada célula é o bolsão do DoGSite naquela estrutura, ou ausência.</p>";
    html += "<div class=\"ens-scroll\"><table class=\"ens-tabela\"><thead><tr><th>Estrutura</th><th>Apo / holo</th>";
    for (const col of rel.matriz.colunas) html += "<th>" + esc(col.id) + "<br>" + esc(col.persistencia) + "</th>";
    html += "</tr></thead><tbody>";
    for (const linha of rel.matriz.linhas) {
      html += "<tr><td>" + esc(linha.rotulo) + (linha.erro ? " — " + esc(linha.erro) : "") + "</td><td>" + esc(linha.apoHolo) + "</td>";
      for (const cel of linha.celulas) {
        html += "<td>" + (cel.presente
          ? esc(cel.bolsao) + (cel.jaccardEntrada == null ? " (semente)" : " · " + cel.jaccardEntrada)
          : "—") + "</td>";
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    html += "<p class=\"ens-nota\">" + esc(f.apoHolo) + "</p>";

    return html;
  }

  function atualizarSessaoRelatorio(rel) {
    const refAtual = sessao.referenciaId && rel.estruturas.some((e) => e.id === sessao.referenciaId && e.incluida)
      ? sessao.referenciaId
      : rel.referenciaId;
    sessao.referenciaId = refAtual;
    const estCaixa = caixaDaEstrutura(rel);
    if (!sessao.estruturaCaixa) sessao.estruturaCaixa = estCaixa.estId;
    if (estCaixa.membro && !sessao.bolsaoCaixa) sessao.bolsaoCaixa = estCaixa.membro.name;
    const sigEns = assinaturaCaixa(rel.caixaEnsemble);
    if (sessao.sigEns !== sigEns) {
      sessao.sigEns = sigEns;
      sessao.editEns = rel.caixaEnsemble.ok ? rel.caixaEnsemble : null;
    }
    const sigEst = (estCaixa.membro ? estCaixa.membro.estruturaId + "|" + estCaixa.membro.name + "|" : "") + assinaturaCaixa(estCaixa.caixa);
    if (sessao.sigEst !== sigEst) {
      sessao.sigEst = sigEst;
      sessao.editEst = estCaixa.caixa.ok ? estCaixa.caixa : null;
    }
    sessao.sugEns = rel.caixaEnsemble;
    sessao.sugEst = estCaixa.caixa;

    return { refAtual, estCaixa };
  }

  function htmlCaixasRelatorio(rel, f, estCaixa) {
    let html = "";
    html += "<div class=\"ens-caixas\">";
    html += "<section><h3>Caixa do ensemble</h3>";
    html += "<p class=\"rotulo-fixo\">" + esc(f.vina) + " " + esc(f.preparo) + " " + esc(f.docking) + "</p>";
    html += "<p class=\"ens-nota\">Evidência: envelope dos centroides, na estrutura de referência, dos grupos com pelo menos 2 estruturas e faixa ≥ " + rel.parametros.faixaCaixa + "%. A margem é " + rel.parametros.margemVina + " Å de cada lado. Hipótese: que esta caixa serve para um ensaio.</p>";
    if (rel.gruposSemCentroide && rel.gruposSemCentroide.length) {
      html += "<p class=\"ens-nota\">Sem centroide na referência: " + esc(rel.gruposSemCentroide.join(", ")) + ".</p>";
    }
    if (!rel.caixaEnsemble.ok) html += "<p class=\"ens-nota\">" + esc(rel.caixaEnsemble.erro) + "</p>";
    else html += camposCaixa("ens-box", sessao.editEns || rel.caixaEnsemble);
    html += "<textarea id=\"ens-box-txt\" class=\"ens-cfg\" rows=\"6\">" + esc(fmtCaixa(sessao.editEns || rel.caixaEnsemble)) + "</textarea>";
    html += "<div class=\"ens-acoes\"><button type=\"button\" class=\"ghost-btn\" id=\"ens-aplicar-ens\">Aplicar texto</button>";
    html += "<button type=\"button\" class=\"ghost-btn\" id=\"ens-restaurar-ens\">Restaurar sugestão</button>";
    html += "<button type=\"button\" class=\"primary-btn\" id=\"ens-caixa-ens\">Desenhar no 3D</button></div></section>";

    html += "<section><h3>Caixa desta estrutura</h3>";
    html += "<p class=\"ens-nota\">Evidência: centro na média dos átomos do arquivo de resíduos do DoGSite e tamanho na extensão mais a margem, como na ficha de preparo. O referencial é o desta estrutura.</p>";
    html += "<label>Estrutura <select id=\"ens-est\">" + opcoesEstruturas(rel, estCaixa.estId) + "</select></label>";
    html += "<label>Bolsão <select id=\"ens-bolsao\">" + opcoesBolsos(rel, estCaixa.estId, estCaixa.membro && estCaixa.membro.name) + "</select></label>";
    if (!estCaixa.caixa.ok) html += "<p class=\"ens-nota\">" + esc(estCaixa.caixa.erro) + "</p>";
    else html += camposCaixa("ens-est", sessao.editEst || estCaixa.caixa);
    html += "<textarea id=\"ens-est-txt\" class=\"ens-cfg\" rows=\"6\">" + esc(fmtCaixa(sessao.editEst || estCaixa.caixa)) + "</textarea>";
    html += "<div class=\"ens-acoes\"><button type=\"button\" class=\"ghost-btn\" id=\"ens-aplicar-est\">Aplicar texto</button>";
    html += "<button type=\"button\" class=\"ghost-btn\" id=\"ens-restaurar-est\">Restaurar sugestão</button>";
    html += "<button type=\"button\" class=\"primary-btn\" id=\"ens-caixa-est\">Desenhar no 3D</button></div></section>";
    html += "</div>";

    return html;
  }

  function htmlControlesRelatorio(rel, refAtual) {
    let html = "";
    html += "<div class=\"ens-viewer-controles\">";
    html += "<label>Referência do 3D <select id=\"ens-ref\">" + opcoesEstruturas(rel, refAtual) + "</select></label>";
    html += "<label>Grupo <select id=\"ens-grupo\">" + rel.grupos.map((g) =>
      "<option value=\"" + esc(g.id) + "\"" + (g.id === sessao.grupoId ? " selected" : "") + ">" + esc(g.id) + " (" + esc(g.persistencia.texto) + ")</option>"
    ).join("") + "</select></label>";
    html += "<button type=\"button\" class=\"primary-btn\" id=\"ens-ver\">Ver centroide na referência</button>";
    html += "<button type=\"button\" class=\"ghost-btn\" id=\"ens-limpar\">Limpar marcas</button>";
    html += "</div>";

    return html;
  }

  function htmlLeituraRelatorio(rel, f) {
    let html = "";
    html += "<section class=\"ens-leitura\"><h3>Evidência</h3><ul>";
    html += "<li>" + esc(f.evidencia) + "</li>";
    html += "<li>N efetivo = " + rel.nEfetivo + ". Cada recorrência desta página traz k de N efetivo.</li>";
    html += "<li>Jaccard mínimo usado: " + rel.parametros.jaccardMin + ".</li>";
    html += "<li>" + esc(f.descritor) + "</li>";
    html += "<li>" + esc(f.apoHolo) + "</li>";
    html += "</ul><h3>Hipótese</h3><ul>";
    html += "<li>" + esc(f.hipotese) + "</li>";
    html += "<li>" + esc(f.persistencia) + "</li>";
    html += "<li>" + esc(f.dinamica) + "</li>";
    html += "<li>" + esc(f.exploratorio) + "</li>";
    html += "<li>" + esc(f.docking) + "</li>";
    html += "<li>" + esc(f.redundancia) + "</li>";
    html += "<li>" + esc(f.motor) + "</li>";
    html += "</ul></section>";
    return html;
  }

  function htmlRelatorio(rel) {
    const f = EnsembleAnalysis.FRASES;
    let html = "";
    html += htmlResumoRelatorio(rel, f);
    html += htmlGruposRelatorio(rel, f);
    html += htmlResiduosRelatorio(rel);
    html += htmlMatrizRelatorio(rel, f);
    const { refAtual, estCaixa } = atualizarSessaoRelatorio(rel);
    html += htmlCaixasRelatorio(rel, f, estCaixa);
    html += htmlControlesRelatorio(rel, refAtual);
    html += htmlLeituraRelatorio(rel, f);
    return html;
  }

  function publicar(rel) {
    sessao.relatorio = rel;
    const resumo = $("ens-resumo");
    if (resumo) {
      resumo.textContent = (rel.exemplo ? "Exemplo sintético. " : "") + "N efetivo = " + rel.nEfetivo + ". Jaccard ≥ " + rel.parametros.jaccardMin + ".";
    }
    const cont = $("ens-resultado");
    if (cont) cont.innerHTML = htmlRelatorio(rel);
    const notaEl = $("ens-viewer-nota");
    if (notaEl) {
      delete notaEl.dataset.preso;
      notaEl.textContent = "O ponto, quando pedido, é o centroide nesta estrutura de referência. Não é o centroide de outra estrutura colado aqui. " + EnsembleAnalysis.FRASES.centroide;
    }
  }

  function atualizarGrupos() {
    if (!sessao) return;
    capturarEdits();
    const params = lerParams();
    const entrada = {
      exemplo: !!sessao.exemplo,
      mesmoReferencial: !!sessao.mesmoReferencial,
      nPedidas: sessao.nPedidas || (sessao.estruturas || []).length,
      nDisponiveis: sessao.nDisponiveis || (sessao.disponiveis || []).length,
      estruturas: sessao.estruturas || [],
      bolsos: sessao.bolsos || [],
      params,
    };
    publicar(EnsembleAnalysis.montarRelatorio(entrada));
  }

  function abrirSessao(nova, mensagem) {
    if (typeof memorizarEntrada === "function") memorizarEntrada();
    if (typeof invalidarConsultasEstrutura === "function") invalidarConsultasEstrutura();
    geracao += 1;
    cancelado = true;
    setRodando(false);
    sessao = nova;
    sessao.referenciaId = null;
    sessao.grupoId = null;
    sessao.estruturaCaixa = null;
    sessao.bolsaoCaixa = null;
    sessao.sigEns = null;
    sessao.sigEst = null;
    modeloId = null;
    mostrarPainel();
    renderLista((sessao.disponiveis || []).map((d) => ({ rotulo: d.rotulo || d.id, estado: d.estado || "pronta para a fila" })));
    if (sessao.exemplo) atualizarGrupos();
    else {
      const cont = $("ens-resultado");
      if (cont) cont.innerHTML = "<p class=\"ens-nota\">Nada foi enviado ao DoGSiteScorer. Ajuste o limite e o Jaccard e peça os bolsões. A fila é sequencial.</p>";
      const resumo = $("ens-resumo");
      if (resumo) resumo.textContent = (sessao.disponiveis || []).length + " estrutura(s) carregada(s). N efetivo ainda não foi calculado.";
    }
    status(mensagem || "");
    if (typeof abrirTela === "function") abrirTela("ensemble", "ens-titulo");
  }

  function abrirIds(texto) {
    if (!ATIVO || typeof EnsembleAnalysis === "undefined") return;
    const p = EnsembleAnalysis.parseIds(texto);
    if (!p.ids.length) {
      erroHome(p.invalidos.length ? "Nenhum ID válido. Use quatro caracteres, começando por dígito, como 4EYL." : "Informe pelo menos um ID.");
      return;
    }
    const cap = EnsembleAnalysis.aplicarLimite(p.ids, 20);
    let msg = "IDs prontos. O cálculo ainda não chamou o DoGSiteScorer.";
    if (p.invalidos.length) msg += " Ignorados: " + p.invalidos.join(", ") + ".";
    if (cap.excedeu) msg += " O máximo desta versão é 20; os primeiros 20 foram mantidos.";
    msg += " " + EnsembleAnalysis.FRASES.mesmaProteina;
    abrirSessao({
      exemplo: false,
      mesmoReferencial: false,
      origem: "pdb",
      disponiveis: cap.aceitos.map((id) => ({ id, rotulo: id, origem: "pdb", texto: null, exemplo: false })),
      estruturas: [],
      bolsos: [],
      nDisponiveis: cap.aceitos.length,
    }, msg);
    if (typeof atualizarURL === "function") atualizarURL("ensemble", cap.aceitos.join(","));
  }

  async function abrirArquivo(file) {
    if (!ATIVO || typeof EnsembleAnalysis === "undefined") return;
    if (typeof invalidarConsultasEstrutura === "function") invalidarConsultasEstrutura();
    const g = ++geracao;
    let texto;
    try { texto = await file.text(); }
    catch (e) { if (g === geracao) erroHome("Não foi possível ler o arquivo."); return; }
    if (g !== geracao) return;
    if (typeof StructureModel !== "undefined" && StructureModel.pareceMmcif(texto)) {
      erroHome("O ensemble desta versão lê PDB com MODEL/ENDMDL. Este mmCIF não foi interpretado como colunas PDB nem enviado ao DoGSite.");
      return;
    }
    if (typeof StructureModel !== "undefined" && !StructureModel.pareceCoordenadaPdb(texto)) {
      erroHome("O ensemble desta versão lê coordenadas PDB. O arquivo não foi passado ao leitor de colunas.");
      return;
    }
    const mods = EnsembleAnalysis.separarModelos(texto).filter((m) => /^(ATOM|HETATM)/m.test(m.texto));
    if (!mods.length) { erroHome("Nenhum bloco com ATOM ou HETATM."); return; }
    const cap = EnsembleAnalysis.aplicarLimite(mods, 20);
    let msg = cap.aceitos.length + " modelo(s) no arquivo. Nada foi enviado ao DoGSiteScorer.";
    if (cap.excedeu) msg += " Há " + cap.total + " modelos; esta versão guarda no máximo 20.";
    if (cap.aceitos.length < 2) msg += " Com um modelo só não há recorrência para ler.";
    abrirSessao({
      exemplo: false,
      mesmoReferencial: true,
      origem: "modelo",
      disponiveis: cap.aceitos.map((m) => ({
        id: m.rotulo,
        rotulo: m.rotulo,
        origem: "modelo",
        texto: m.texto,
        exemplo: false,
        chaveCache: EnsembleAnalysis.hashTexto(m.texto),
      })),
      estruturas: [],
      bolsos: [],
      nDisponiveis: cap.aceitos.length,
    }, msg);
  }

  function abrirExemplo() {
    if (!ATIVO || typeof EnsembleAnalysis === "undefined") return;
    const ex = EnsembleAnalysis.exemploSintetico();
    abrirSessao({
      exemplo: true,
      mesmoReferencial: true,
      origem: "exemplo",
      disponiveis: ex.estruturas,
      estruturas: ex.estruturas,
      bolsos: ex.bolsos,
      nPedidas: 3,
      nDisponiveis: 3,
    }, EnsembleAnalysis.FRASES.exemplo);
    if (typeof atualizarURL === "function") atualizarURL("ensemble", "exemplo");
  }

  function abrirPorUrl(valor) {
    if (!ATIVO) return;
    if (String(valor).trim().toLowerCase() === "exemplo") abrirExemplo();
    else abrirIds(valor);
  }

  async function enviarModelo(texto, deveParar) {
    return PekiRede.limitar((signal) => consultarEnvioModelo(texto, deveParar, signal), { chave: "uploadJob" });
  }

  async function consultarEnvioModelo(texto, deveParar, signal) {
    const polling = PekiRede.config.polling.upload;
    const fd = new FormData();
    fd.append("pdb_file[pathvar]", new Blob([texto], { type: "chemical/x-pdb" }), "modelo.pdb");
    let resp;
    try {
      resp = await PekiRede.fetch("https://proteins.plus/api/pdb_files_rest", {
        signal,
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
      });
    } catch (e) {
      if (PekiRede.ehTimeout(e)) throw e;
      throw new Error("Sem conexão com a API ProteinsPlus (ou bloqueio de rede).");
    }
    if (resp.status === 429) throw new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
    if (resp.status !== 200 && resp.status !== 202) throw new Error("Erro ao enviar o modelo à API ProteinsPlus (" + resp.status + ").");
    const data = await resp.json();
    if (resp.status === 200 && data.id) return String(data.id);
    if (!data.location) throw new Error("Resposta inesperada da API ProteinsPlus (sem 'location').");
    for (let i = 0; i < polling.tentativas; i++) {
      if (deveParar()) throw new Error("Cálculo cancelado.");
      await sleep(polling.intervaloMs);
      if (signal && signal.aborted) throw PekiRede.erroTimeout();
      if (deveParar()) throw new Error("Cálculo cancelado.");
      let r;
      try { r = await PekiRede.fetch(data.location, { signal, headers: { Accept: "application/json" } }); }
      catch (e2) { if (PekiRede.ehTimeout(e2)) throw e2; throw new Error("Conexão perdida durante o envio do modelo."); }
      if (r.status === 429) throw new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
      if (r.status === 200) {
        const d = await r.json();
        if (d.id) return String(d.id);
      } else if (r.status >= 400) {
        throw new Error("Erro ao enviar o modelo à API ProteinsPlus (" + r.status + ").");
      }
    }
    throw PekiRede.erroTimeout();
  }

  async function comResiduos(pockets, deveParar) {
    const out = [];
    for (const p of pockets) {
      if (deveParar()) throw new Error("Cálculo cancelado.");
      let residuos = [];
      let extensao = null;
      let aviso = null;
      const diagnostico = {};
      if (p.residuosUrl) {
        let r;
        try { r = await PekiRede.fetch(p.residuosUrl); }
        catch (e) { if (PekiRede.ehTimeout(e)) throw e; throw new Error("Conexão perdida durante o cálculo dos pockets."); }
        if (r.status === 429) throw new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
        if (!r.ok) aviso = "Não foi possível baixar os resíduos deste bolsão (HTTP " + r.status + ").";
        else {
          const parsed = EnsembleAnalysis.parseArquivoResiduos(await r.text(), diagnostico);
          aviso = avisoLinhasPocket(diagnostico.descartadas).trim() || null;
          residuos = parsed.residuos;
          extensao = parsed.extensao;
        }
      } else aviso = "A API não informou o arquivo de resíduos deste bolsão.";
      out.push({
        name: p.name, volume: p.volume, surface: p.surface, depth: p.depth,
        hydrophobicity: p.hydrophobicity, accept: p.accept, donor: p.donor, drugScore: p.drugScore,
        residuos, extensao, aviso,
      });
      if (diagnostico.descartadas) out[out.length - 1].descartadas = diagnostico.descartadas;
    }
    return out;
  }

  async function chamarUm(item, g, onMsg) {
    if (item.origem === "pdb" && !item.texto) {
      onMsg(item.rotulo + " — baixando coordenadas no RCSB");
      const texto = await baixarRCSB(item.id);
      if (parar(g)) throw new Error("Cálculo cancelado.");
      item.texto = texto;
      if (typeof StructureModel !== "undefined" && !StructureModel.pareceCoordenadaPdb(item.texto)) {
        throw new Error("O PDB baixado para o ensemble não tem coordenadas em colunas PDB. O texto não foi lido como PDB.");
      }
    }
    if (parar(g)) throw new Error("Cálculo cancelado.");
    const chave = chaveDoItem(item);
    const hit = lerCache(chave);
    if (hit) {
      item.usouRede = false;
      onMsg(item.rotulo + " — bolsões na memória ou no localStorage; o DoGSite não foi chamado de novo");
      return hit;
    }
    let codigo = item.id;
    if (item.origem === "modelo") {
      if (typeof StructureModel !== "undefined" && !StructureModel.pareceCoordenadaPdb(item.texto)) {
        throw new Error("O ensemble não envia mmCIF ao DoGSite como se fosse PDB.");
      }
      onMsg(item.rotulo + " — enviando o modelo à ProteinsPlus");
      codigo = await enviarModelo(item.texto, () => parar(g));
    }
    if (parar(g)) throw new Error("Cálculo cancelado.");
    onMsg(item.rotulo + " — na fila do DoGSiteScorer");
    let pacote;
    if (item.origem !== "modelo" && typeof obterPockets === "function") {
      pacote = await obterPockets(codigo, (n) => onMsg(item.rotulo + " — verificação " + n + " no DoGSiteScorer"), () => parar(g));
    } else {
      const location = await dogsiteSubmit(codigo, { preservarCaixa: true });
      if (parar(g)) throw new Error("Cálculo cancelado.");
      const resultado = await dogsitePoll(location, (n) => onMsg(item.rotulo + " — verificação " + n + " no DoGSiteScorer"), () => parar(g));
      const txt = await (await PekiRede.fetch(resultado.result_table)).text();
      const diagnostico = {};
      const pockets = parseTabelaPockets(txt, diagnostico);
      pockets.forEach((p, i) => { p.residuosUrl = (resultado.residues || [])[diagnostico.indices[i]] || null; });
      pacote = { pockets };
      if (diagnostico.descartadas) pacote.descartadas = diagnostico.descartadas;
    }
    if (!pacote.pockets.length) throw new Error("Nenhum pocket retornado pela API." + avisoLinhasPocket(pacote.descartadas));
    const resumo = await comResiduos(pacote.pockets, () => parar(g));
    if (parar(g)) throw new Error("Cálculo cancelado.");
    if (pacote.descartadas && resumo.length) {
      resumo[0].descartadas = (resumo[0].descartadas || 0) + pacote.descartadas;
      resumo[0].aviso = (resumo[0].aviso || "") + avisoLinhasPocket(pacote.descartadas);
    }
    gravarCache(chave, resumo);
    item.usouRede = true;
    return resumo;
  }

  async function comBackoff(item, g, onMsg) {
    let espera = 15000;
    let ultimo = null;
    for (let t = 0; t < 4; t++) {
      if (parar(g)) throw new Error("Cálculo cancelado.");
      try {
        return await chamarUm(item, g, onMsg);
      } catch (e) {
        ultimo = e;
        if (e.message === "Cálculo cancelado.") throw e;
        if (!ehLimite(e) || t === 3) throw e;
        onMsg("Limite da ProteinsPlus. A fila espera " + Math.round(espera / 1000) + " s e não dispara outra estrutura em paralelo.");
        await esperar(espera, g);
        espera = Math.min(60000, espera * 2);
      }
    }
    throw ultimo || new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
  }

  async function calcular() {
    if (!sessao || sessao.exemplo) {
      status("O exemplo sintético não chama o DoGSiteScorer. Abra IDs da mesma proteína ou um arquivo com MODEL/ENDMDL.");
      return;
    }
    if (!sessao.disponiveis || !sessao.disponiveis.length) {
      status("Não há estruturas na fila.");
      return;
    }
    const g = ++geracao;
    cancelado = false;
    const params = lerParams();
    const lista = sessao.disponiveis.slice(0, params.limite);
    setRodando(true);
    setProgresso(0, lista.length, "Fila sequencial, 0 de " + lista.length + ".");
    const prontas = [];
    let parouLimite = null;
    for (let i = 0; i < lista.length; i++) {
      if (parar(g)) break;
      const item = lista[i];
      item.estado = "calculando";
      renderLista(lista);
      try {
        const pockets = await comBackoff(item, g, (msg) => { if (!parar(g)) setProgresso(i, lista.length, msg); });
        if (parar(g)) break;
        item.estado = item.usouRede ? "DoGSite concluído" : "cache";
        prontas.push({ ...item, erro: null, bolsos: pockets });
      } catch (e) {
        if (e.message === "Cálculo cancelado." || parar(g)) break;
        item.estado = "erro";
        prontas.push({ ...item, erro: e.message, bolsos: [] });
        if (ehLimite(e)) { parouLimite = e.message; break; }
      }
      setProgresso(i + 1, lista.length, item.rotulo + " — " + item.estado + " (" + (i + 1) + " de " + lista.length + ")");
      if (item.usouRede && i < lista.length - 1 && !parar(g)) await esperar(params.pausaEntreChamadasMs, g);
      if (g !== geracao) return;
      renderLista(lista);
    }
    if (g !== geracao) return;
    setRodando(false);
    sessao.estruturas = prontas.map((p) => ({
      id: p.id, rotulo: p.rotulo, texto: p.texto, origem: p.origem, exemplo: false, erro: p.erro || null,
    }));
    sessao.bolsos = [];
    for (const p of prontas) {
      if (p.erro) continue;
      for (const b of p.bolsos || []) sessao.bolsos.push({ ...b, estruturaId: p.id });
    }
    sessao.nPedidas = lista.length;
    sessao.nDisponiveis = sessao.disponiveis.length;
    sessao.exemplo = false;
    atualizarGrupos();
    if (cancelado) status("Cálculo cancelado. O que já tinha voltado entra no agrupamento, se houver coordenadas.");
    else if (parouLimite) status(parouLimite + " A fila parou. O que já foi obtido entra no agrupamento.");
    else status("Fila encerrada. N efetivo = " + (sessao.relatorio ? sessao.relatorio.nEfetivo : 0) + ".");
  }

  function grupoSelecionado() {
    if (!sessao || !sessao.relatorio) return null;
    const sel = $("ens-grupo");
    const id = (sel && sel.value) || sessao.grupoId || (sessao.relatorio.grupos[0] && sessao.relatorio.grupos[0].id);
    return sessao.relatorio.grupos.find((g) => g.id === id) || null;
  }

  function estruturaRef() {
    if (!sessao || !sessao.relatorio) return null;
    const id = sessao.referenciaId || sessao.relatorio.referenciaId;
    return (sessao.estruturas || []).find((e) => e.id === id) || null;
  }

  function nota(msg) {
    const el = $("ens-viewer-nota");
    if (el) {
      el.dataset.preso = "1";
      el.textContent = msg;
    }
  }

  let seqDesenho = 0;
  async function desenhar(extra) {
    const g = geracao;
    const seq = ++seqDesenho;
    const atual = () => g === geracao && seq === seqDesenho;
    const est = estruturaRef();
    if (!est || !est.texto) {
      nota("Sem coordenadas da estrutura de referência para o 3D.");
      return;
    }
    const visualStatus = $("ens-viewer-status");
    if (visualStatus) visualStatus.textContent = "Carregando visualização…";
    const visual = $("ens-viewer"); if (visual) visual.hidden = false;
    try {
      if (typeof lib3D !== "function") throw new Error("biblioteca 3D indisponível");
      await lib3D();
      if (!atual()) return;
      const div = $("ens-viewer");
      if (!div) return;
      if (!viewer) {
        div.innerHTML = "";
        viewer = $3Dmol.createViewer(div, { backgroundColor: "#0b1020" });
      }
      if (modeloId !== est.id) {
        viewer.clear();
        viewer.addModel(est.texto, "pdb");
        viewer.setStyle({}, { cartoon: { color: "#9ec5ff" } });
        modeloId = est.id;
      }
      viewer.removeAllShapes();
      if (typeof viewer.removeAllLabels === "function") viewer.removeAllLabels();
      for (const s of (extra && extra.esferas) || []) {
        viewer.addSphere({ center: { x: s.x, y: s.y, z: s.z }, radius: 1.3, color: s.cor || "#e8513a" });
        if (typeof viewer.addLabel === "function") {
          viewer.addLabel(s.rotulo || "", {
            position: { x: s.x, y: s.y, z: s.z },
            backgroundColor: "#1a3d6d",
            fontColor: "white",
            backgroundOpacity: 0.85,
            fontSize: 12,
          });
        }
      }
      for (const b of (extra && extra.caixas) || []) {
        viewer.addBox({
          center: { x: Number(b.center_x), y: Number(b.center_y), z: Number(b.center_z) },
          dimensions: { w: Number(b.size_x), h: Number(b.size_y), d: Number(b.size_z) },
          color: b.cor || "#e0a800",
          wireframe: true,
          linewidth: 2,
          opacity: 0.95,
        });
      }
      viewer.zoomTo();
      viewer.render();
      if (visualStatus) visualStatus.textContent = "";
    } catch (e) {
      if (!atual()) return;
      viewer = null;
      modeloId = null;
      if (visual) { visual.innerHTML = ""; visual.hidden = true; }
      if (visualStatus) {
        visualStatus.innerHTML = '<p>O 3D não abriu. Os resultados em texto e tabela continuam disponíveis.</p><button class="ghost-btn" type="button">Tentar de novo</button>';
        const btn = visualStatus.querySelector("button");
        if (btn) btn.addEventListener("click", () => { if (atual()) desenhar(extra); });
      }
      const el = $("ens-viewer-nota");
      const base = el ? el.textContent : "";
      nota(base + " O 3D não abriu (" + e.message + "). Os números acima continuam válidos.");
    }
  }

  function verCentroide() {
    const g = grupoSelecionado();
    if (!g) { nota("Não há grupo selecionado."); return; }
    const c = g.centroideReferencia;
    if (!c) {
      nota(g.id + " não tem centroide na estrutura de referência. Evidência: os resíduos do grupo não foram achados nela. Nenhuma hipótese de posição foi desenhada.");
      return;
    }
    const fonte = c.fonte === "bolsao-desta-estrutura"
      ? "média dos átomos do bolsão desta estrutura"
      : "média, nesta estrutura, dos resíduos do grupo que existem nela";
    nota("Evidência: " + g.id + " em (" + c.x + ", " + c.y + ", " + c.z + "), " + fonte + ". Hipótese: que este ponto representa o bolsão nas outras estruturas. " + EnsembleAnalysis.FRASES.centroide);
    desenhar({ esferas: [{ x: c.x, y: c.y, z: c.z, rotulo: g.id, cor: "#ff5c7a" }] });
  }

  function desenharCaixaEnsemble() {
    capturarEdits();
    const c = sessao && (sessao.editEns || sessao.sugEns);
    if (!c || !Number.isFinite(Number(c.center_x))) { nota("Não há caixa de ensemble para desenhar."); return; }
    nota("Caixa do ensemble desenhada na referência. " + EnsembleAnalysis.FRASES.vina + " " + EnsembleAnalysis.FRASES.docking);
    desenhar({ caixas: [{ ...c, cor: "#e0a800" }] });
  }

  function desenharCaixaEstrutura() {
    capturarEdits();
    const c = sessao && (sessao.editEst || sessao.sugEst);
    if (!c || !Number.isFinite(Number(c.center_x))) { nota("Não há caixa desta estrutura."); return; }
    const estId = ($("ens-est") && $("ens-est").value) || (sessao && sessao.estruturaCaixa);
    const refId = sessao && sessao.referenciaId;
    if (estId !== refId && !(sessao && sessao.mesmoReferencial)) {
      nota("A caixa desta estrutura está no referencial dela (" + estId + "). O 3D mostra a referência (" + refId + ") e este app não sobrepõe coordenadas, então a caixa não foi desenhada. Os números continuam editáveis. " + EnsembleAnalysis.FRASES.centroide);
      return;
    }
    nota("Caixa desta estrutura desenhada. " + EnsembleAnalysis.FRASES.vina);
    desenhar({ caixas: [{ ...c, cor: "#7eb6ff" }] });
  }

  function aplicarTexto(qual) {
    const ta = $(qual === "ens" ? "ens-box-txt" : "ens-est-txt");
    const lido = EnsembleAnalysis.lerConfigVina(ta ? ta.value : "");
    if (!lido.ok) { status(lido.erro, true); return; }
    if (qual === "ens") sessao.editEns = lido.caixa;
    else sessao.editEst = lido.caixa;
    const prefix = qual === "ens" ? "ens-box" : "ens-est";
    const mapa = { cx: "center_x", cy: "center_y", cz: "center_z", sx: "size_x", sy: "size_y", sz: "size_z" };
    Object.keys(mapa).forEach((id) => {
      const el = $(prefix + "-" + id);
      if (el) el.value = lido.caixa[mapa[id]];
    });
    status("Texto aplicado na caixa. " + EnsembleAnalysis.FRASES.vina);
  }

  function restaurar(qual) {
    if (!sessao) return;
    if (qual === "ens") {
      sessao.sigEns = null;
      sessao.editEns = sessao.sugEns && sessao.sugEns.ok ? sessao.sugEns : null;
    } else {
      sessao.sigEst = null;
      sessao.editEst = sessao.sugEst && sessao.sugEst.ok ? sessao.sugEst : null;
    }
    if (sessao.relatorio) publicar(sessao.relatorio);
  }

  function exportar(tipo) {
    if (!sessao || !sessao.relatorio) { status("Ainda não há agrupamento para exportar."); return; }
    capturarEdits();
    const extras = {
      decisaoPesquisador: decisao(),
      geradoEm: new Date().toISOString(),
      caixaEnsembleEditada: sessao.editEns || null,
      caixaEstruturaSugerida: sessao.sugEst || null,
      caixaEstruturaEditada: sessao.editEst || null,
      editadaPeloUsuario: true,
    };
    if (tipo === "json") {
      baixar("ensemble.json", EnsembleAnalysis.exportarJSON(sessao.relatorio, extras), "application/json");
      return;
    }
    const csv = EnsembleAnalysis.exportarCSV(sessao.relatorio, extras);
    if (tipo === "matriz") baixar("ensemble-estrutura-bolsao.csv", csv.matriz, "text/csv");
    else baixar("ensemble-grupos.csv", csv.grupos, "text/csv");
  }

  function onChange(ev) {
    if (!sessao || !sessao.relatorio) return;
    const t = ev.target;
    if (!t || !t.id) return;
    if (t.id === "ens-ref") {
      sessao.referenciaId = t.value;
      modeloId = null;
      atualizarGrupos();
    } else if (t.id === "ens-grupo") {
      sessao.grupoId = t.value;
    } else if (t.id === "ens-est" || t.id === "ens-bolsao") {
      if (t.id === "ens-est") {
        sessao.estruturaCaixa = t.value;
        sessao.bolsaoCaixa = null;
        sessao.sigEst = null;
      } else sessao.bolsaoCaixa = t.value;
      atualizarGrupos();
    }
  }

  function onClick(ev) {
    const el = ev.target && ev.target.nodeType === 1 ? ev.target : ev.target && ev.target.parentElement;
    if (!el || !el.closest) return;
    const b = el.closest("button");
    if (!b) {
      const tr = el.closest("tr[data-grupo]");
      if (tr && sessao) {
        sessao.grupoId = tr.dataset.grupo;
        const sel = $("ens-grupo");
        if (sel) sel.value = sessao.grupoId;
      }
      return;
    }
    const id = b.id;
    if (id === "ens-abrir") abrirIds(($("ens-ids") && $("ens-ids").value) || "");
    else if (id === "ens-exemplo-home" || id === "ens-exemplo") abrirExemplo();
    else if (id === "ens-calcular") calcular();
    else if (id === "ens-atualizar") atualizarGrupos();
    else if (id === "ens-cancelar") { cancelado = true; status("Cancelamento pedido. A estrutura que já está no DoGSite termina esta espera."); }
    else if (id === "ens-novo" && typeof irParaHome === "function") irParaHome();
    else if (id === "ens-ver") verCentroide();
    else if (id === "ens-caixa-ens") desenharCaixaEnsemble();
    else if (id === "ens-caixa-est") desenharCaixaEstrutura();
    else if (id === "ens-limpar") { nota("Marcas removidas."); desenhar({ esferas: [], caixas: [] }); }
    else if (id === "ens-aplicar-ens") aplicarTexto("ens");
    else if (id === "ens-aplicar-est") aplicarTexto("est");
    else if (id === "ens-restaurar-ens") restaurar("ens");
    else if (id === "ens-restaurar-est") restaurar("est");
    else if (id === "ens-csv") exportar("grupos");
    else if (id === "ens-csv-matriz") exportar("matriz");
    else if (id === "ens-json") exportar("json");
  }

  function init() {
    if (ouvintes) return;
    ouvintes = true;
    if (!ATIVO) {
      const entrada = $("ens-entrada");
      const main = $("ensemble");
      if (entrada) entrada.hidden = true;
      if (main) main.hidden = true;
      return;
    }
    document.body.addEventListener("click", onClick);
    document.body.addEventListener("change", onChange);
    const file = $("ens-file");
    const abrirFile = $("btn-ens-file");
    if (abrirFile && file) abrirFile.addEventListener("click", () => file.click());
    if (file) file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (f) abrirArquivo(f);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { ativo, invalidarConsultas, aoFechar, abrirPorUrl, abrirExemplo };
})();

if (typeof globalThis !== "undefined") globalThis.EnsembleUI = EnsembleUI;
