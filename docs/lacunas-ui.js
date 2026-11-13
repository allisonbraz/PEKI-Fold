// Atalho de lacunas na aba Qualidade. Não envia a FASTA, não cria job no
// Swiss-Model e não coloca token no navegador. Se a rede ou o CORS falhar,
// ficam os links e a importação de um PDB local.

"use strict";

const LacunasUI = (() => {
  let sessao = null;
  let pedido = 0;

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function $(id) { return document.getElementById(id); }

  function buscar(url, options) {
    if (typeof PekiRede !== "undefined" && PekiRede.fetch) {
      return PekiRede.fetch(url, options || {}, { tempoMs: 25000 });
    }
    return fetch(url, options || {});
  }

  function status(msg) {
    const el = $("lac-status");
    if (el) el.textContent = msg || "";
  }

  function cadeiaAtual() {
    const sel = $("lac-cadeia");
    return sel && sel.value ? sel.value : (sessao && sessao.cadeia) || "";
  }

  function fastaAtual() {
    if (!sessao || !sessao.app || !sessao.app.estrutura) return null;
    const cadeia = cadeiaAtual();
    const est = sessao.app.estrutura;
    const seqres = LacunasModelo.parseSeqres(sessao.app.pdbText || "");
    return LacunasModelo.fastaCadeia({
      nome: sessao.app.pdbId || sessao.app.nome || "estrutura",
      titulo: "PEKI Fold",
      cadeia,
      residuos: est.residuos || [],
      naoResolvidos: (est.lacunas && est.lacunas.naoResolvidos) || [],
      seqres,
    });
  }

  function declEscolhida() {
    const sel = $("lac-uniprot");
    const acc = sel && sel.value;
    const lista = (sessao && sessao.decls) || [];
    return lista.find((d) => LacunasModelo.acessoDe(d) === acc) || lista[0] || null;
  }

  function mapaAtual() {
    const sel = $("lac-mapa");
    const v = sel && sel.value;
    return v === "fasta" || v === "author" || v === "uniprot" ? v : "uniprot";
  }

  function modoAtual() {
    const sel = $("lac-modo");
    return sel && sel.value === "sobrepor" ? "sobrepor" : "lado";
  }

  function htmlLinks(links) {
    if (!links || !links.length) return "";
    return `<ul class="ov-lista">${links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.rotulo)}</a></li>`).join("")}</ul>`;
  }

  function htmlVazio() {
    return `<p class="muted small lac-vazio">Nenhuma lacuna nomeada nem salto de numeração nesta leitura. O botão de modelar lacunas fica oculto.</p>`;
  }

  function htmlPainel() {
    const det = sessao.det;
    const ops = det.cadeias.map((c) =>
      `<option value="${esc(c.cadeia)}"${c.cadeia === sessao.cadeia ? " selected" : ""}>Cadeia ${esc(c.cadeia)} (${c.naoResolvidos} sem coordenada, ${c.saltos} salto(s))</option>`
    ).join("");
    return `
      <section class="lac-painel">
        <h3>Modelar lacunas</h3>
        <p>${esc(det.resumo || "Há lacuna ou salto de numeração nesta leitura.")}</p>
        <p class="muted small">Atalho manual. O PEKI Fold não reconstrói coordenada, não envia a sequência e não cria job no Swiss-Model. Um salto de numeração não prova resíduo faltante.</p>
        <div class="prep-linha">
          <label>Cadeia <select id="lac-cadeia">${ops}</select></label>
          <button type="button" class="primary-btn" id="lac-modelar">Modelar lacunas</button>
        </div>
        <ol class="lac-passos">
          <li>O botão copia a FASTA da cadeia e abre o Swiss-Model em outra aba.</li>
          <li>Cole a sequência no site e baixe o PDB por lá.</li>
          <li>Volte e use Importar PDB local. Nada disso é enviado daqui.</li>
        </ol>
        <p><a href="${esc(LacunasModelo.SWISS_URL)}" target="_blank" rel="noopener">Abrir Swiss-Model</a></p>
        <textarea id="lac-fasta" class="prep-cfg" rows="4" readonly aria-label="FASTA da cadeia"></textarea>
        <h4>AlphaFold DB</h4>
        <p class="muted small">O acesso UniProt sai do DBREF do arquivo ou, se faltar, do mapeamento público da PDBe. O pLDDT é a confiança publicada no modelo, não uma medida experimental e não é afinidade.</p>
        <div class="prep-linha">
          <button type="button" class="ghost-btn" id="lac-af">Consultar AlphaFold</button>
          <label class="prep-check"><input id="lac-arquivo" type="file" accept=".pdb,.ent"/> Importar PDB local</label>
        </div>
        <div id="lac-uniprot-box"></div>
        <div id="lac-af-box"></div>
        <div class="prep-linha">
          <label>Numeração do modelo
            <select id="lac-mapa">
              <option value="uniprot">UniProt (AlphaFold)</option>
              <option value="fasta">Resíduo 1 = primeiro da FASTA</option>
              <option value="author">Número author do cristal</option>
            </select>
          </label>
          <label>Vista
            <select id="lac-modo">
              <option value="lado">Ao lado, em visores separados</option>
              <option value="sobrepor">Sobrepor pelos CA em comum</option>
            </select>
          </label>
          <button type="button" class="ghost-btn" id="lac-redesenhar">Atualizar comparação</button>
        </div>
        <p id="lac-status" class="muted small" role="status" aria-live="polite"></p>
        <div id="lac-plddt"></div>
        <div class="lac-views">
          <div><p class="muted small">Cristal, cópia nesta aba. O visualizador principal não muda.</p><div id="lac-view-cristal" class="lac-viewer"></div></div>
          <div><p class="muted small">Modelo AlphaFold ou PDB importado.</p><div id="lac-view-modelo" class="lac-viewer"></div></div>
        </div>
        <div id="lac-sobre-box" hidden>
          <p class="muted small">Sobreposição geométrica dos CA em comum. O RMSD é só desse encaixe, não é resultado de simulação.</p>
          <div id="lac-view-sobre" class="lac-viewer"></div>
        </div>
        <p class="lac-legenda"><span style="color:#0053D6">pLDDT muito alto</span> · <span style="color:#65CBF3">alto</span> · <span style="color:#b08900">baixo</span> · <span style="color:#FF7D45">muito baixo</span> · <span style="color:#ff4d6d">faixa da lacuna</span> · <span style="color:#e8513a">flanqueadores no cristal</span></p>
      </section>`;
  }

  function preencherFasta() {
    const f = fastaAtual();
    sessao.fasta = f;
    const ta = $("lac-fasta");
    if (ta && f) ta.value = f.texto;
    return f;
  }

  function numerosLacuna() {
    const cadeia = cadeiaAtual();
    const faltam = (sessao.det.naoResolvidos || []).filter((r) => (r.cadeiaAuth || r.chain) === cadeia && r.authSeq != null);
    const mapa = mapaAtual();
    if (mapa === "uniprot") {
      const decl = declEscolhida();
      return new Set(faltam.map((r) => LacunasModelo.uniprotDeAuth(r.authSeq, decl)).filter((n) => n != null));
    }
    if (mapa === "fasta" && sessao.fasta) {
      const nums = new Set();
      for (const item of sessao.fasta.lista) {
        if (item.origem === "seqres-ausente" || item.origem === "nao-resolvido") nums.add(item.ordem);
      }
      return nums;
    }
    return new Set(faltam.map((r) => r.authSeq));
  }

  function flancos() {
    const cadeia = cadeiaAtual();
    const est = sessao.app.estrutura;
    const coords = (est.residuos || []).filter((r) => r.chain === cadeia && r.temCoordenadas && r.seq != null);
    const faltam = (sessao.det.naoResolvidos || []).filter((r) => (r.cadeiaAuth || r.chain) === cadeia && r.authSeq != null).map((r) => r.authSeq);
    const vistos = new Set();
    const out = [];
    for (const seq of faltam) {
      const antes = coords.filter((r) => r.seq < seq).sort((a, b) => b.seq - a.seq)[0];
      const depois = coords.filter((r) => r.seq > seq).sort((a, b) => a.seq - b.seq)[0];
      for (const r of [antes, depois]) {
        if (!r) continue;
        const k = r.seq + "|" + (r.icode || "");
        if (vistos.has(k)) continue;
        vistos.add(k);
        out.push(r);
      }
    }
    return out;
  }

  function textoCristal() {
    const app = sessao.app || {};
    return { texto: app.textoViewer || app.pdbText || "", formato: app.viewerFormato || "pdb" };
  }

  function selChain(cadeia) {
    return cadeia === "_" ? "" : cadeia;
  }

  async function criarViewer(id, modelos) {
    const div = $(id);
    if (!div) return null;
    div.innerHTML = "";
    if (typeof lib3D !== "function") throw new Error("A biblioteca 3D não está disponível neste carregamento.");
    await lib3D();
    const viewer = $3Dmol.createViewer(div, { backgroundColor: "#0b1020" });
    for (const parte of modelos) viewer.addModel(parte.texto, parte.formato === "cif" ? "cif" : "pdb");
    return viewer;
  }

  function alvoEstilo(viewer, indice) {
    const model = viewer && viewer.getModel ? viewer.getModel(indice) : null;
    if (model && typeof model.setStyle === "function") return model;
    return viewer;
  }

  function pintarCristal(viewer) {
    viewer.setStyle({}, { cartoon: { color: "#8aa4c8" } });
    for (const r of flancos()) {
      viewer.setStyle({ chain: selChain(r.chain), resi: r.seq }, { cartoon: { color: "#e8513a" }, stick: { color: "#e8513a", radius: 0.18 } });
    }
  }

  function pintarModelo(viewer, atomos, confianca, lacunas) {
    viewer.setStyle({}, { cartoon: { color: "#888888" } });
    const cas = LacunasModelo.casDe(atomos);
    for (const ca of cas) {
      const p = LacunasModelo.plddtDoAtomo(ca, confianca);
      const lacuna = lacunas.has(ca.resseq);
      const cor = lacuna ? "#ff4d6d" : LacunasModelo.corPlddt(p);
      const estilo = { cartoon: { color: cor } };
      if (lacuna) estilo.stick = { color: cor, radius: 0.22 };
      viewer.setStyle({ chain: selChain(ca.cadeia), resi: ca.resseq }, estilo);
    }
  }

  function htmlPlddt(atomos, confianca, lacunas, extra) {
    const cas = LacunasModelo.casDe(atomos).filter((a) => lacunas.has(a.resseq));
    const linhas = cas.slice(0, 40).map((ca) => {
      const p = LacunasModelo.plddtDoAtomo(ca, confianca);
      return `<tr><td>${esc(ca.cadeia)} ${esc(ca.resname)} ${esc(ca.resseq)}</td><td>${p == null ? "—" : Number(p).toFixed(1)}</td><td>${esc(LacunasModelo.faixaPlddt(p))}</td></tr>`;
    }).join("");
    const media = LacunasModelo.media(cas.map((ca) => LacunasModelo.plddtDoAtomo(ca, confianca)));
    return `${extra || ""}
      <p class="muted small">${cas.length} resíduo(s) da faixa destacada no modelo. Média do pLDDT nesses CA: ${media == null ? "não calculada" : media.toFixed(2)}. Faixas do AlphaFold, não medida experimental.</p>
      ${linhas ? `<div class="prep-scroll"><table class="prep-tabela"><thead><tr><th>Resíduo no modelo</th><th>pLDDT</th><th>Faixa</th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<p class="muted small">Nenhum resíduo do modelo caiu na faixa com a numeração escolhida. Troque a numeração se o modelo vier da FASTA ou do número author.</p>`}
      ${cas.length > 40 ? `<p class="muted small">Mostrando 40 de ${cas.length}.</p>` : ""}`;
  }

  function paresCa(modeloAtoms) {
    const cristal = textoCristal();
    if (cristal.formato === "cif") return { erro: "A sobreposição desta versão lê colunas PDB. O mmCIF fica só ao lado." };
    const casC = LacunasModelo.casDe(LacunasModelo.atomosPdb(cristal.texto)).filter((a) => a.cadeia === cadeiaAtual());
    const porNum = new Map();
    for (const a of LacunasModelo.casDe(modeloAtoms)) if (!porNum.has(a.resseq)) porNum.set(a.resseq, a);
    const mapa = mapaAtual();
    const decl = declEscolhida();
    const P = [];
    const Q = [];
    for (const c of casC) {
      let alvo = null;
      if (mapa === "author") alvo = c.resseq;
      else if (mapa === "uniprot") alvo = LacunasModelo.uniprotDeAuth(c.resseq, decl);
      else if (sessao.fasta) {
        const item = sessao.fasta.lista.find((x) => x.authSeq === c.resseq && (x.icode || "") === (c.icode || ""));
        alvo = item ? item.ordem : null;
      }
      const m = alvo == null ? null : porNum.get(alvo);
      if (!m) continue;
      P.push(c);
      Q.push(m);
    }
    return { P, Q };
  }

  async function desenhar() {
    if (!sessao || !sessao.modelo) return;
    const box = $("lac-plddt");
    try {
      const cristal = textoCristal();
      const modeloAtoms = LacunasModelo.atomosPdb(sessao.modelo.pdb);
      const lacunas = numerosLacuna();
      const modo = modoAtual();
      const sobre = $("lac-sobre-box");
      if (sobre) sobre.hidden = true;
      const vC = await criarViewer("lac-view-cristal", [{ texto: cristal.texto, formato: cristal.formato }]);
      if (vC) { pintarCristal(alvoEstilo(vC, 0)); vC.zoomTo(); vC.render(); }
      let nota = "";
      let pdbModelo = sessao.modelo.pdb;
      if (modo === "sobrepor") {
        const pares = paresCa(modeloAtoms);
        if (pares.erro) nota = pares.erro;
        else if (pares.P.length < 3) nota = "Menos de 3 CA em comum com essa numeração. A sobreposição não foi aplicada.";
        else {
          const tr = LacunasModelo.kabsch(pares.P, pares.Q);
          const erro = tr && LacunasModelo.rmsd(pares.P, pares.Q, tr);
          if (!tr || erro == null || erro > 15) {
            nota = "O encaixe dos CA não ficou estável (RMSD " + (erro == null ? "indisponível" : erro.toFixed(2) + " Å") + "). O modelo continua ao lado, sem sobreposição.";
          } else {
            pdbModelo = LacunasModelo.transformarPdb(sessao.modelo.pdb, tr);
            nota = pares.P.length + " CA usados no encaixe. RMSD " + erro.toFixed(2) + " Å. Isso não é RMSD de simulação.";
            const vS = await criarViewer("lac-view-sobre", [
              { texto: cristal.texto, formato: "pdb" },
              { texto: pdbModelo, formato: "pdb" },
            ]);
            if (vS) {
              pintarCristal(alvoEstilo(vS, 0));
              pintarModelo(alvoEstilo(vS, 1), LacunasModelo.atomosPdb(pdbModelo), sessao.modelo.confianca, lacunas);
              vS.zoomTo();
              vS.render();
              if (sobre) sobre.hidden = false;
            }
          }
        }
      }
      const vM = await criarViewer("lac-view-modelo", [{ texto: sessao.modelo.pdb, formato: "pdb" }]);
      if (vM) {
        pintarModelo(alvoEstilo(vM, 0), modeloAtoms, sessao.modelo.confianca, lacunas);
        vM.zoomTo();
        vM.render();
      }
      if (box) box.innerHTML = htmlPlddt(modeloAtoms, sessao.modelo.confianca, lacunas, nota ? `<p class="prep-aviso">${esc(nota)}</p>` : "");
      status((sessao.modelo.nome || "Modelo") + " carregado. " + (nota || "Os flanqueadores do cristal estão em vermelho e a faixa da lacuna no modelo, em rosa."));
    } catch (e) {
      status(e && e.message ? e.message : "Não foi possível desenhar a comparação.");
    }
  }

  function pct(v) {
    if (v == null || !Number.isFinite(Number(v))) return "não informado";
    const n = Number(v) <= 1 ? Number(v) * 100 : Number(v);
    return n.toFixed(1).replace(".", ",") + "%";
  }

  function htmlPredicao(entrada) {
    if (!entrada) return "";
    return `<p><strong>${esc(entrada.entryId || entrada.uniprotAccession)}</strong> ${esc(entrada.uniprotDescription || "")}. pLDDT global informado pela API: ${entrada.globalMetricValue == null ? "não informado" : entrada.globalMetricValue}. Frações: muito alto ${pct(entrada.fractionPlddtVeryHigh)}, alto ${pct(entrada.fractionPlddtConfident)}, baixo ${pct(entrada.fractionPlddtLow)}, muito baixo ${pct(entrada.fractionPlddtVeryLow)}.</p>`;
  }

  async function consultarAf() {
    const meu = ++pedido;
    const atual = () => meu === pedido && sessao;
    const cadeia = cadeiaAtual();
    const pdbId = sessao.app && sessao.app.pdbId;
    status("Buscando o UniProt da cadeia " + cadeia + "…");
    let decls = LacunasModelo.declaracoesDaCadeia(sessao.app.estrutura.uniprot && sessao.app.estrutura.uniprot.declaracoes, cadeia);
    let fonte = decls.length ? "arquivo" : "";
    if (!decls.length && pdbId) {
      try {
        const r = await buscar(LacunasModelo.PDBE_MAP + encodeURIComponent(String(pdbId).toLowerCase()), { headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error("PDBe respondeu " + r.status);
        decls = LacunasModelo.uniprotDoPdbe(await r.json(), pdbId, cadeia);
        fonte = "pdbe";
      } catch (e) {
        if (!atual()) return;
        const links = LacunasModelo.linksPublicos(pdbId, "", null);
        $("lac-af-box").innerHTML = `<p class="prep-aviso">${esc(e.message || "Falha na consulta.")} O mapeamento não foi lido neste navegador.</p>${htmlLinks(links)}`;
        status("Consulta de UniProt indisponível. Use os links ou importe um PDB.");
        return;
      }
    }
    if (!atual()) return;
    sessao.decls = decls;
    const boxU = $("lac-uniprot-box");
    if (!decls.length) {
      if (boxU) boxU.innerHTML = `<p class="prep-aviso">Não há acesso UniProt para a cadeia ${esc(cadeia)}. O AlphaFold não foi consultado. A FASTA e o Swiss-Model continuam disponíveis.</p>${htmlLinks(LacunasModelo.linksPublicos(pdbId, "", null))}`;
      status("Sem UniProt nesta cadeia.");
      return;
    }
    if (boxU) {
      boxU.innerHTML = `<label>UniProt (${esc(fonte === "arquivo" ? "DBREF do arquivo" : "mapeamento PDBe")})
        <select id="lac-uniprot">${decls.map((d) => `<option value="${esc(LacunasModelo.acessoDe(d))}">${esc(LacunasModelo.acessoDe(d))} · PDB ${esc(d.pdbInicio)}–${esc(d.pdbFim)} · banco ${esc(d.dbInicio)}–${esc(d.dbFim)}</option>`).join("")}</select>
      </label>
      <p class="muted small">O intervalo foi usado como deslocamento linear (número author − início PDB + início no banco). Não é um mapa resíduo a resíduo validado.</p>`;
    }
    const decl = decls[0];
    const acc = LacunasModelo.acessoDe(decl);
    status("Consultando a API do AlphaFold para " + acc + "…");
    let entradas;
    try {
      const r = await buscar(LacunasModelo.AF_API + encodeURIComponent(acc), { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("A API do AlphaFold respondeu " + r.status);
      entradas = LacunasModelo.normalizarPredicao(await r.json());
      if (!entradas.length) throw new Error("A API não trouxe modelo para " + acc);
    } catch (e) {
      if (!atual()) return;
      $("lac-af-box").innerHTML = `<p class="prep-aviso">${esc(e.message || "Falha.")} Os links seguem disponíveis. Baixe o PDB e importe o arquivo.</p>${htmlLinks(LacunasModelo.linksPublicos(pdbId, acc, null))}`;
      status("AlphaFold indisponível neste navegador. Use o link ou um PDB local.");
      return;
    }
    if (!atual()) return;
    sessao.predicao = entradas;
    const entrada = entradas[0];
    $("lac-af-box").innerHTML = htmlPredicao(entrada) + htmlLinks(LacunasModelo.linksPublicos(pdbId, acc, entrada));
    status("Lendo o PDB do modelo…");
    try {
      const r = await buscar(entrada.pdbUrl);
      if (!r.ok) throw new Error("O arquivo PDB respondeu " + r.status);
      const pdb = await r.text();
      if (!String(pdb).includes("ATOM")) throw new Error("A resposta não contém coordenadas ATOM.");
      let confianca = null;
      if (entrada.plddtDocUrl) {
        try {
          const c = await buscar(entrada.plddtDocUrl);
          if (c.ok) confianca = LacunasModelo.lerConfianca(await c.json());
        } catch (e) { confianca = null; }
      }
      if (!atual()) return;
      const mapa = $("lac-mapa");
      if (mapa) mapa.value = "uniprot";
      sessao.modelo = { origem: "alphafold", pdb, confianca, nome: entrada.entryId || acc };
      await desenhar();
    } catch (e) {
      if (!atual()) return;
      $("lac-af-box").insertAdjacentHTML("beforeend", `<p class="prep-aviso">${esc(e.message || "Falha ao ler o PDB.")} O navegador não leu o arquivo de coordenadas. Baixe pelo link e use Importar PDB local.</p>`);
      status("Metadados e pLDDT global disponíveis. As coordenadas ficam no link ou num PDB importado.");
    }
  }

  async function aoModelar() {
    const f = preencherFasta();
    if (!f || !f.letras) { status("Esta cadeia não tem sequência para copiar."); return; }
    const janela = window.open(LacunasModelo.SWISS_URL, "_blank", "noopener");
    const avisoSeq = f.avisos.length ? " " + f.avisos.join(" ") : "";
    const mapa = $("lac-mapa");
    if (mapa) mapa.value = "fasta";
    status("A FASTA está no campo abaixo. " +
      (janela ? "O Swiss-Model foi pedido em outra aba. " : "Se a aba não abrir, use o link. ") +
      "Cole a sequência no site. O PEKI Fold não enviou o texto." + avisoSeq);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(f.texto).then(() => {
        status("FASTA copiada. " +
          (janela ? "Cole no Swiss-Model. " : "Se a aba não abriu, use o link. ") +
          "O PEKI Fold não enviou o texto." + avisoSeq);
      }, () => {
        status("Não foi possível copiar automaticamente. Selecione a FASTA abaixo. " +
          (janela ? "A aba do Swiss-Model foi pedida. " : "Use o link do Swiss-Model. ") +
          "O PEKI Fold não enviou o texto." + avisoSeq);
      });
    }
  }

  function aoArquivo(file) {
    if (!file) return;
    const leitor = new FileReader();
    leitor.onload = async () => {
      const pdb = String(leitor.result || "");
      if (!pdb.includes("ATOM") && !pdb.includes("HETATM")) {
        status("O arquivo não tem coordenadas ATOM ou HETATM.");
        return;
      }
      sessao.fasta = fastaAtual();
      sessao.modelo = { origem: "local", pdb, confianca: null, nome: file.name };
      status("PDB local lido neste navegador. Ele não foi enviado.");
      await desenhar();
    };
    leitor.onerror = () => status("Não foi possível ler o arquivo local.");
    leitor.readAsText(file);
  }

  function onClick(ev) {
    const id = ev.target && ev.target.id;
    if (!sessao || !id) return;
    if (id === "lac-modelar") aoModelar();
    if (id === "lac-af") consultarAf().catch((e) => status(e.message || "Falha na consulta."));
    if (id === "lac-redesenhar") desenhar();
  }

  function onChange(ev) {
    const t = ev.target;
    if (!t || !sessao) return;
    if (t.id === "lac-cadeia") {
      sessao.cadeia = t.value;
      sessao.decls = [];
      preencherFasta();
    }
    if (t.id === "lac-arquivo" && t.files && t.files[0]) aoArquivo(t.files[0]);
  }

  function garantir(el) {
    if (el.dataset.ouvintes === "1") return;
    el.dataset.ouvintes = "1";
    el.addEventListener("click", onClick);
    el.addEventListener("change", onChange);
  }

  function sincronizar(el, app, relatorio) {
    if (!el || typeof LacunasModelo === "undefined") return;
    garantir(el);
    const det = LacunasModelo.detectar(app && app.estrutura, relatorio);
    const id = (app && (app.pdbId || app.nome)) || "";
    const chave = id + "|" + (det.tem ? "1" : "0") + "|" + det.cadeias.map((c) => c.cadeia + c.naoResolvidos + c.saltos).join(",");
    if (el.dataset.chave === chave) return;
    el.dataset.chave = chave;
    pedido += 1;
    sessao = det.tem ? {
      app, det,
      cadeia: det.cadeias[0] ? det.cadeias[0].cadeia : "",
      decls: [], fasta: null, predicao: null, modelo: null,
    } : null;
    el.innerHTML = det.tem ? htmlPainel() : htmlVazio();
    if (det.tem) preencherFasta();
  }

  return { sincronizar };
})();

if (typeof module !== "undefined" && module.exports) module.exports = LacunasUI;
if (typeof globalThis !== "undefined") globalThis.LacunasUI = LacunasUI;
