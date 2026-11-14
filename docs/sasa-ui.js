// Painel "Mapa da sequência com exposição ao solvente" na aba Aminoácidos.
// O cálculo roda num worker; se o worker não abrir, segue em lotes na página.

"use strict";

const SasaUI = (() => {
  let pedido = 0;
  let worker = null;
  let cache = null;
  let foco = null;
  let cadeiaAtual = "";
  let ligado = false;

  function el(id) {
    return typeof document !== "undefined" ? document.getElementById(id) : null;
  }

  function fonteAtual() {
    if (typeof estado === "undefined" || !estado) return null;
    if (estado.pdbText) return { texto: estado.pdbText, formato: "pdb" };
    if (estado.textoViewer) return { texto: estado.textoViewer, formato: estado.viewerFormato === "pdb" ? "pdb" : "cif" };
    return null;
  }

  function ligar() {
    if (ligado) return;
    const sel = el("sasa-cadeia");
    const mapa = el("sasa-mapa");
    if (!sel || !mapa) return;
    ligado = true;
    sel.addEventListener("change", () => {
      cadeiaAtual = sel.value;
      foco = null;
      desenhar();
    });
    mapa.addEventListener("click", aoClicar);
    const svg = el("sasa-svg");
    const png = el("sasa-png");
    if (svg) svg.addEventListener("click", () => exportar("svg"));
    if (png) png.addEventListener("click", () => exportar("png"));
    const legenda = el("sasa-legenda");
    if (legenda && typeof ProtAnalysis !== "undefined") legenda.innerHTML = Sasa.htmlLegenda(ProtAnalysis.GRUPOS_AA);
    const metodo = el("sasa-metodo");
    if (metodo) metodo.textContent = Sasa.TEXTO_METODO;
  }

  function status(texto) {
    const node = el("sasa-status");
    if (node) node.textContent = texto || "";
  }

  function exportes(ligadoBtn) {
    for (const id of ["sasa-svg", "sasa-png"]) {
      const btn = el(id);
      if (btn) btn.disabled = !ligadoBtn;
    }
    const sel = el("sasa-cadeia");
    if (sel) sel.disabled = !ligadoBtn;
  }

  function progresso(feito, total, visivel) {
    const box = el("sasa-progresso");
    const trilho = el("sasa-trilho");
    const fill = el("sasa-progresso-fill");
    const pct = total ? Math.min(100, Math.round((100 * feito) / total)) : 0;
    if (box) box.hidden = !visivel;
    if (trilho) trilho.setAttribute("aria-valuenow", String(pct));
    if (fill) fill.style.width = pct + "%";
    if (visivel) status("Calculando a exposição ao solvente… " + pct + "%");
  }

  function subtitulo() {
    if (typeof estado === "undefined" || !estado) return "";
    const id = estado.pdbId || String(estado.nome || "estrutura").replace(/\.[^.]+$/, "");
    const molecula = estado.meta && estado.meta.moleculas && estado.meta.moleculas[0];
    return (molecula ? molecula + " · " : "") + id;
  }

  function chaveFoco() {
    if (!foco) return "";
    return foco.cadeia + "|" + foco.resi + "|" + (foco.icode || "");
  }

  function mapaAtual() {
    const vista = typeof estado !== "undefined" && estado.vistaPocket && estado.vistaPocket.visivel ? estado.vistaPocket : null;
    const marcas = vista && vista.sels ? Sasa.chavesDeSelecao(vista.sels) : new Set();
    return Sasa.montarMapa(cache.resultado, cadeiaAtual, {
      marcas,
      nomeBolsão: vista && vista.nome ? "Bolsão " + vista.nome : "Bolsão",
    });
  }

  function garantirCadeia() {
    const sel = el("sasa-cadeia");
    if (!sel || !cache) return;
    const ids = cache.resultado.cadeias || [];
    const anterior = cadeiaAtual || sel.value;
    sel.innerHTML = "";
    for (const id of ids) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id === "_" ? "Cadeia _" : "Cadeia " + id;
      sel.appendChild(opt);
    }
    cadeiaAtual = ids.includes(anterior) ? anterior : (ids[0] || "");
    if (cadeiaAtual) sel.value = cadeiaAtual;
  }

  function desenhar() {
    const box = el("sasa-mapa");
    if (!box || !cache) return;
    const mapa = mapaAtual();
    const titulo = el("sasa-titulo");
    if (titulo) {
      const nome = !cadeiaAtual ? "" : cadeiaAtual === "_" ? " — cadeia _" : " — cadeia " + cadeiaAtual;
      titulo.textContent = "Mapa da sequência com exposição ao solvente" + nome;
    }
    const sub = el("sasa-subtitulo");
    if (sub) sub.textContent = subtitulo();
    box.innerHTML = Sasa.htmlDoMapa(mapa, { ativo: chaveFoco() });
    const resumo = el("sasa-resumo");
    if (resumo) resumo.textContent = mapa.textoResumo;
    const bolsao = el("sasa-bolsao");
    if (bolsao) {
      bolsao.hidden = !mapa.textoBolsão;
      bolsao.textContent = mapa.textoBolsão || "";
    }
    exportes(mapa.celulas.length > 0);
  }

  function limparPainel(mensagem) {
    cache = null;
    const box = el("sasa-mapa");
    if (box) box.innerHTML = "";
    const resumo = el("sasa-resumo");
    if (resumo) resumo.textContent = "";
    const bolsao = el("sasa-bolsao");
    if (bolsao) { bolsao.hidden = true; bolsao.textContent = ""; }
    const sub = el("sasa-subtitulo");
    if (sub) sub.textContent = "";
    exportes(false);
    progresso(0, 1, false);
    status(mensagem || "");
  }

  function aoClicar(ev) {
    const alvo = ev.target && ev.target.closest ? ev.target.closest(".sasa-res") : null;
    if (!alvo || !el("sasa-mapa") || !el("sasa-mapa").contains(alvo)) return;
    const cadeia = alvo.getAttribute("data-cadeia");
    const resi = Number(alvo.getAttribute("data-resi"));
    const icode = alvo.getAttribute("data-icode") || "";
    foco = { cadeia, resi, icode };
    desenhar();
    const ok = typeof destacarResiduoMapa === "function" && destacarResiduoMapa(foco);
    const item = cache && cache.resultado.residuos.find((r) => r.cadeia === cadeia && r.seq === resi && (r.icode || "") === icode);
    const rsa = item && item.rsa != null ? "RSA " + Sasa.fmt1(item.rsa) + "%" : "sem RSA";
    const nome = item ? item.resname + " " + String(resi) + icode : String(resi);
    status(ok
      ? "Resíduo " + nome + " da cadeia " + cadeia + " (" + rsa + ") centralizado no visualizador."
      : "O visualizador 3D ainda não está pronto para este resíduo.");
    const viewer = el("viewer");
    if (ok && viewer && viewer.scrollIntoView) viewer.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function nomeArquivo() {
    const base = (typeof estado !== "undefined" && (estado.pdbId || estado.nome) || "estrutura").replace(/\.[^.]+$/, "");
    const cid = cadeiaAtual === "_" ? "sem_id" : (cadeiaAtual || "cadeia");
    return base + "_cadeia" + cid + "_exposicao";
  }

  function baixar(nome, conteudo, mime) {
    const blob = new Blob([conteudo], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportar(tipo) {
    if (!cache) return;
    const mapa = mapaAtual();
    const titulo = el("sasa-titulo") ? el("sasa-titulo").textContent : "Mapa da sequência com exposição ao solvente";
    const sub = el("sasa-subtitulo") ? el("sasa-subtitulo").textContent : "";
    const svg = Sasa.svgDoMapa(mapa, { titulo, subtitulo: sub });
    if (tipo === "svg") {
      baixar(nomeArquivo() + ".svg", svg, "image/svg+xml;charset=utf-8");
      return;
    }
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const escala = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth) * escala;
      canvas.height = Math.max(1, img.naturalHeight) * escala;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) { status("Não foi possível gerar o PNG. O SVG continua disponível."); return; }
        const u = URL.createObjectURL(png);
        const a = document.createElement("a");
        a.href = u;
        a.download = nomeArquivo() + ".png";
        a.click();
        URL.revokeObjectURL(u);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      status("Não foi possível gerar o PNG. O SVG continua disponível.");
    };
    img.src = url;
  }

  function tentarWorker(id, fonte, terminar, falha) {
    if (typeof Worker !== "function" || typeof document === "undefined" || !document.baseURI) return false;
    try {
      if (worker) worker.terminate();
      worker = new Worker(new URL("sasa-worker.js", document.baseURI).href);
    } catch (e) {
      worker = null;
      return false;
    }
    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.id !== id || id !== pedido) return;
      if (msg.tipo === "progresso") progresso(msg.feito, msg.total, true);
      else if (msg.tipo === "resultado") terminar(msg.resultado);
      else if (msg.tipo === "erro") falha(msg.mensagem);
    };
    worker.onerror = () => {
      if (worker) { worker.terminate(); worker = null; }
      if (id !== pedido) return;
      calcularEmLotes(id, fonte, terminar, falha);
    };
    worker.postMessage({ tipo: "calcular", id, texto: fonte.texto, formato: fonte.formato });
    return true;
  }

  function calcularEmLotes(id, fonte, terminar, falha) {
    let lidos;
    let tarefa;
    try {
      lidos = Sasa.lerCoordenadas(fonte.texto, fonte.formato);
      tarefa = Sasa.iniciarCalculo(lidos.atomos, {});
    } catch (e) {
      falha(e && e.message);
      return;
    }
    const tick = () => {
      if (id !== pedido) return;
      const st = Sasa.avancarCalculo(tarefa, 250);
      progresso(st.feito, st.total, !st.terminou);
      if (!st.terminou) {
        setTimeout(tick, 0);
        return;
      }
      terminar(Sasa.concluirCalculo(tarefa, lidos));
    };
    setTimeout(tick, 0);
  }

  function comecar(fonte) {
    const id = ++pedido;
    foco = null;
    cache = null;
    const box = el("sasa-mapa");
    if (box) box.innerHTML = "";
    const resumo = el("sasa-resumo");
    if (resumo) resumo.textContent = "";
    exportes(false);
    progresso(0, Math.max(1, 1), true);
    const terminar = (resultado) => {
      if (id !== pedido) return;
      cache = { texto: fonte.texto, formato: fonte.formato, resultado };
      progresso(resultado.atomosUsados, resultado.atomosUsados || 1, false);
      garantirCadeia();
      desenhar();
      status("");
    };
    const falha = (msg) => {
      if (id !== pedido) return;
      progresso(0, 1, false);
      status(msg || "Não foi possível calcular a exposição ao solvente.");
    };
    if (!tentarWorker(id, fonte, terminar, falha)) calcularEmLotes(id, fonte, terminar, falha);
  }

  function aoCarregar() {
    ligar();
    if (!el("sasa-painel")) return;
    const fonte = fonteAtual();
    if (!fonte) {
      limparPainel("Esta leitura não trouxe coordenadas para a exposição ao solvente.");
      return;
    }
    if (cache && cache.texto === fonte.texto && cache.formato === fonte.formato) {
      garantirCadeia();
      desenhar();
      return;
    }
    comecar(fonte);
  }

  function cancelar() {
    pedido += 1;
    if (worker) { worker.terminate(); worker = null; }
    progresso(0, 1, false);
  }

  function sincronizarBolsão() {
    if (!cache || !el("sasa-mapa")) return;
    desenhar();
  }

  return { aoCarregar, cancelar, sincronizarBolsão };
})();

if (typeof module !== "undefined" && module.exports) module.exports = SasaUI;
