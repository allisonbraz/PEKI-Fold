// Interface da ficha de preparo. A lógica fica em prep-analysis.js.
// DESLIGAR O MÓDULO: mude ATIVO para false. A aba some e o resto do app segue igual.
// Remover de vez: apague este arquivo, prep-analysis.js e a aba Preparo no index.html.

"use strict";

const PrepUI = (() => {
  const ATIVO = true;

  let estado = null;
  let resultado = null;
  let selecao = null;
  let destaque = null;
  let caixaDesenhada = false;
  let ouvintes = false;
  const decisoes = {};
  const cacheRes = new Map();
  const raios = { metal: 2.8, ss: 2.5, glic: 1.8, his: 3.2 };
  const vina = { margem: 4, sugerida: null, editada: null, pocketIdx: "", residuosTxt: "" };

  function ativo() { return ATIVO; }
  function temFicha() { return !!(ATIVO && resultado); }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function num(v, c) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return Number(v).toFixed(c);
  }

  function cad(c) { return PrepAnalysis.rotuloCadeia(c); }

  function res(o) {
    if (!o) return "—";
    return `${o.resname || ""} ${cad(o.cadeia)} ${o.resseq}${o.icode || ""}`.trim();
  }

  function fim(f) {
    return `${f.nome} ${f.resname} ${cad(f.cadeia)} ${f.resseq}${f.icode || ""}`;
  }

  function cel(v) {
    return String(v ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ");
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

  function baseNome() {
    const n = (estado && (estado.pdbId || estado.nome)) || "estrutura";
    return String(n).replace(/\.[^.]+$/, "");
  }

  function opcoesLimpeza() {
    return {
      cadeias: [...selecao.cadeias],
      hets: [...selecao.hets],
      aguasManter: [...selecao.aguas],
      removerAguas: selecao.removerAguas,
      altloc: selecao.altloc,
    };
  }

  function lerDecisoes() {
    document.querySelectorAll("#tab-preparo [data-decisao]").forEach((el) => {
      decisoes[el.dataset.decisao] = el.value;
    });
  }

  function campoDecisao(id) {
    return `<label class="prep-decisao-lbl">Decisão do pesquisador
      <textarea data-decisao="${id}" rows="2" placeholder="Preencher antes da revisão">${esc(decisoes[id] || "")}</textarea>
    </label>`;
  }

  function tabela(head, rows) {
    if (!rows.length) return `<p class="muted small">Nada a listar neste raio.</p>`;
    const th = head.map((h) => `<th>${esc(h)}</th>`).join("");
    const tb = rows.map((r) => `<tr>${r.map((c) => {
      if (c && typeof c === "object" && c.html != null) return `<td>${c.html}</td>`;
      return `<td>${esc(c)}</td>`;
    }).join("")}</tr>`).join("");
    return `<div class="prep-scroll"><table class="prep-tabela"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
  }

  function mdTabela(head, rows) {
    let s = "| " + head.map(cel).join(" | ") + " |\n| " + head.map(() => "---").join(" | ") + " |\n";
    for (const r of rows) s += "| " + r.map((c) => cel(c && c.html != null ? c.html.replace(/<[^>]+>/g, "") : c)).join(" | ") + " |\n";
    return s + "\n";
  }

  function csv(head, rows) {
    const escCsv = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [head, ...rows].map((r) => r.map(escCsv).join(",")).join("\n") + "\n";
  }

  function initSelecao() {
    const cadeias = new Set(resultado.inventario.cadeias.map((c) => c.cadeia));
    const hets = new Set();
    for (const h of resultado.inventario.hets) {
      if (h.classe === "agua") continue;
      for (const cp of h.copias) hets.add(cp.chave);
    }
    selecao = { cadeias, hets, aguas: new Set(), removerAguas: true, altloc: "A" };
  }

  function recalcular() {
    resultado = PrepAnalysis.analisar(estado.pdbText, {
      raioMetal: raios.metal,
      raioDissulfeto: raios.ss,
      raioGlicosilacao: raios.glic,
      raioHistidina: raios.his,
      nModelos: estado.dados && estado.dados.nModelos,
      meta: estado.meta,
    });
  }

  function aguasNoRaio() {
    const map = new Map();
    for (const m of resultado.ions.metais) {
      for (const v of m.vizinhos) {
        if (!v.agua) continue;
        if (!map.has(v.chaveRes)) {
          map.set(v.chaveRes, { chave: v.chaveRes, rotulo: res(v), metais: [] });
        }
        map.get(v.chaveRes).metais.push(`${m.nomeArquivo} a ${num(v.distancia, 2)} Å`);
      }
    }
    return [...map.values()];
  }

  function linhasIons() {
    const rows = [];
    for (const m of resultado.ions.metais) {
      const id = `${m.nomeArquivo.replace(".pdb", "")} ${m.elemento} ${cad(m.cadeia)} ${m.resseq}${m.icode || ""}`;
      const occ = m.occupancy == null ? "—" : num(m.occupancy, 2);
      if (!m.vizinhos.length) {
        rows.push([id, m.serial ?? "—", occ, "—", "—", "—", "nenhum N/O/S no raio"]);
        continue;
      }
      for (const v of m.vizinhos) {
        rows.push([
          id,
          m.serial ?? "—",
          occ,
          `${v.nome} ${res(v)}`,
          num(v.distancia, 2),
          v.noLink ? "não" : "sim",
          v.notas.join(" "),
        ]);
      }
    }
    return rows;
  }

  function linhasLinksFora() {
    return resultado.ions.links.filter((l) => l.identidade && !l.coberto).map((l) => [
      fim(l.a), fim(l.b), num(l.distancia, 2), "distância anotada no LINK, fora do raio",
    ]);
  }

  function linhasSimetria() {
    return resultado.ions.links.filter((l) => !l.identidade).map((l) => [
      fim(l.a), fim(l.b), `${l.simetriaA || "?"} / ${l.simetriaB || "?"}`, num(l.distancia, 2),
    ]);
  }

  function linhasSS() {
    return resultado.dissulfetos.pares.map((p) => [
      res(p.a), res(p.b), num(p.distancia, 2), p.noSsbond ? "não" : "sim",
    ]);
  }

  function linhasGlic() {
    return resultado.glicosilacao.pares.map((p) => [
      res(p.asn), res(p.acucar), num(p.distancia, 2),
      p.conhecido ? "lista ou HETNAM" : "C1 fora da lista",
      p.noLink ? "não" : "sim",
    ]);
  }

  function linhasArvores() {
    const rows = [];
    for (const a of resultado.glicosilacao.arvores) {
      for (const r of a.residuos) {
        rows.push([
          a.id, r.resname, cad(r.cadeia), `${r.resseq}${r.icode || ""}`,
          r.numeroSugerido, r.nome || "—", (r.asns || []).join("; ") || "—",
        ]);
      }
    }
    return rows;
  }

  function linhasHis() {
    return resultado.histidinas.itens.map((h) => [
      cad(h.cadeia), `${h.resseq}${h.icode || ""}`, h.texto,
      h.metaisND1, h.metaisNE2, h.enterramento == null ? "—" : h.enterramento,
    ]);
  }

  function cabecalhoTexto() {
    const F = PrepAnalysis.FRASES;
    const quando = new Date().toLocaleString("pt-BR");
    const id = baseNome();
    const linhas = [
      `Estrutura: ${id}`,
      `Gerado em: ${quando}`,
      `Versão do módulo: ${PrepAnalysis.VERSAO}`,
      `Raios: metais ${raios.metal} Å; SG–SG ${raios.ss} Å; ND2–C1 ${raios.glic} Å; histidinas ${raios.his} Å.`,
      F.auxiliar,
      F.contato,
      F.escore,
    ];
    if (resultado.nModelos > 1) {
      linhas.push(`A ficha usa só o primeiro MODEL (há ${resultado.nModelos}). Os outros não entram.`);
    }
    if (resultado.predita) linhas.push(resultado.predita);
    if (resultado.simetriaLinks || resultado.simetriaSs) {
      linhas.push(
        `Há ${resultado.simetriaLinks} LINK e ${resultado.simetriaSs} SSBOND com operador de simetria diferente de 1555. ` +
        "O módulo só vê a unidade assimétrica."
      );
    }
    return linhas;
  }

  function montar() {
    const F = PrepAnalysis.FRASES;
    const inv = resultado.inventario;
    const headCad = ["Cadeia", "ATOM", "HETATM", "Águas (res.)", "Átomos com altloc", "ANISOU", "Inserções"];
    const rowsCad = inv.cadeias.map((c) => [
      cad(c.cadeia), c.atom, c.hetatm, c.aguas, c.altlocAtomos, c.anisou, c.insercoes.join(", ") || "—",
    ]);
    const headHet = ["Código", "Classe", "Cópias", "Átomos", "Nome no HETNAM"];
    const rowsHet = inv.hets.map((h) => [
      h.resname, h.classeRotulo + (h.contemMetal && h.classe !== "metal" ? " (contém metal)" : ""),
      h.copias.length, h.nAtomos, h.nome || "—",
    ]);

    const checksCadeia = inv.cadeias.map((c) =>
      `<label class="prep-check"><input type="checkbox" data-sel="cadeia" data-chave="${esc(c.cadeia)}" ${selecao.cadeias.has(c.cadeia) ? "checked" : ""}/> Cadeia ${esc(cad(c.cadeia))}</label>`
    ).join("");

    const hetHtml = inv.hets.filter((h) => h.classe !== "agua").map((h) => {
      const copias = h.copias.map((cp) => {
        const rotulo = `${h.resname} ${cad(cp.cadeia)} ${cp.resseq}${cp.icode || ""} (${cp.nAtomos} átomos)`;
        return `<div class="prep-check"><label><input type="checkbox" data-sel="het" data-chave="${esc(cp.chave)}" ${selecao.hets.has(cp.chave) ? "checked" : ""}/> ${esc(rotulo)}</label>
          <button type="button" class="link-btn" data-acao="het" data-chave="${esc(cp.chave)}">baixar</button></div>`;
      }).join("");
      return `<details class="het-grupo"><summary>${esc(h.resname)} — ${esc(h.classeRotulo)} (${h.copias.length})</summary>${copias}</details>`;
    }).join("");

    const aguas = aguasNoRaio();
    const aguasHtml = aguas.length
      ? aguas.map((a) => `<label class="prep-check"><input type="checkbox" data-sel="agua" data-chave="${esc(a.chave)}" ${selecao.aguas.has(a.chave) ? "checked" : ""}/> Manter ${esc(a.rotulo)} (${esc(a.metais.join("; "))})</label>`).join("")
      : `<p class="muted small">Nenhuma água dentro do raio dos metais.</p>`;

    const pockets = (estado && estado.pockets) || [];
    const pocketOpts = pockets.length
      ? pockets.map((p, i) => `<option value="${i}"${String(i) === String(vina.pocketIdx) ? " selected" : ""}>${esc(p.name)}</option>`).join("")
      : `<option value="">Nenhum pocket detectado ainda</option>`;

    const vinaCampos = vina.editada ? `
      <div class="prep-linha">
        <label>center_x <input id="prep-cx" data-vina="1" type="number" step="0.001" value="${esc(vina.editada.center_x)}"/></label>
        <label>center_y <input id="prep-cy" data-vina="1" type="number" step="0.001" value="${esc(vina.editada.center_y)}"/></label>
        <label>center_z <input id="prep-cz" data-vina="1" type="number" step="0.001" value="${esc(vina.editada.center_z)}"/></label>
        <label>size_x <input id="prep-sx" data-vina="1" type="number" step="0.1" value="${esc(vina.editada.size_x)}"/></label>
        <label>size_y <input id="prep-sy" data-vina="1" type="number" step="0.1" value="${esc(vina.editada.size_y)}"/></label>
        <label>size_z <input id="prep-sz" data-vina="1" type="number" step="0.1" value="${esc(vina.editada.size_z)}"/></label>
      </div>
      <textarea id="prep-vina-cfg" class="prep-cfg" rows="6">${esc(PrepAnalysis.formatarConfigVina(vina.editada))}</textarea>
      <div class="prep-linha">
        <button type="button" class="dl-btn" data-acao="vina-texto">Aplicar texto</button>
        <button type="button" class="dl-btn" data-acao="vina-copiar">Copiar</button>
        <button type="button" class="primary-btn" data-acao="vina-desenhar">Desenhar caixa no 3D</button>
        <button type="button" class="ghost-btn" data-acao="vina-restaurar">Restaurar sugestão</button>
        ${vina.residuosTxt ? `<button type="button" class="dl-btn" data-acao="vina-residuos">Baixar resíduos do pocket</button>` : ""}
      </div>` : "";

    const ionRows = linhasIons();
    const ionHtmlRows = ionRows.map((row, i) => {
      if (i > 0 && ionRows[i - 1][0] === row[0]) return row;
      const m = resultado.ions.metais.find((x) => row[0].startsWith(x.nomeArquivo.replace(".pdb", "") + " "));
      const idx = resultado.ions.metais.indexOf(m);
      const copia = row.slice();
      copia[0] = { html: `${esc(row[0])} <button type="button" class="link-btn" data-acao="ver-ion" data-idx="${idx}">ver</button> <button type="button" class="link-btn" data-acao="ion" data-idx="${idx}">baixar</button>` };
      return copia;
    });
    const nPares = resultado.ions.metais.reduce((s, m) => s + m.vizinhos.length, 0);
    const nSem = resultado.ions.metais.reduce((s, m) => s + m.vizinhos.filter((v) => v.noLink).length, 0);
    const linksId = resultado.ions.links.filter((l) => l.identidade);
    const linksCob = linksId.filter((l) => l.coberto).length;

    return `
      <div class="prep-aviso">
        <strong>Ficha auxiliar, versão ${esc(PrepAnalysis.VERSAO)}.</strong>
        ${esc(F.auxiliar)} ${esc(F.contato)} ${esc(F.escore)}
      </div>
      ${resultado.predita ? `<p class="aviso-predita">${esc(resultado.predita)}</p>` : ""}
      ${resultado.nModelos > 1 ? `<p class="aviso-predita">A ficha usa só o primeiro MODEL (há ${resultado.nModelos}).</p>` : ""}
      <p class="muted small">${esc(cabecalhoTexto().slice(0, 4).join(" · "))}</p>

      <div class="prep-controles">
        <label>Metais (Å) <input id="prep-raio-metal" data-raio="metal" type="number" min="0" max="15" step="0.1" value="${esc(raios.metal)}"/></label>
        <label>SG–SG (Å) <input id="prep-raio-ss" data-raio="ss" type="number" min="0" max="15" step="0.1" value="${esc(raios.ss)}"/></label>
        <label>ND2–C1 (Å) <input id="prep-raio-glic" data-raio="glic" type="number" min="0" max="15" step="0.1" value="${esc(raios.glic)}"/></label>
        <label>Histidinas (Å) <input id="prep-raio-his" data-raio="his" type="number" min="0" max="15" step="0.1" value="${esc(raios.his)}"/></label>
        <button type="button" class="primary-btn" data-acao="raios">Atualizar raios</button>
      </div>

      <div class="prep-linha">
        <button type="button" class="dl-btn" data-acao="md">Ficha Markdown</button>
        <button type="button" class="dl-btn" data-acao="csv">Ficha CSV</button>
        <button type="button" class="dl-btn" data-acao="pdf">Ficha PDF</button>
        <button type="button" class="ghost-btn" data-acao="limpar-3d">Limpar destaques do preparo</button>
      </div>

      <section class="prep-secao">
        <h3>Inventário</h3>
        ${inv.alertas.map((a) => `<p class="prep-aviso">${esc(a)}</p>`).join("")}
        ${tabela(headCad, rowsCad)}
        <h4>Heteroátomos</h4>
        <p class="muted small">A classe é uma lista parcial para triagem. "Não classificado" pode ser ligante, cofator, lipídio ou detergente. A decisão é sua.</p>
        ${tabela(headHet, rowsHet)}
        ${inv.lacunas.length ? `<h4>Lacunas de numeração</h4><p class="muted small">${esc(F.gap)}</p>${tabela(
          ["Cadeia", "Entre", "Números", "No REMARK 465"],
          inv.lacunas.map((L) => [cad(L.cadeia), `${L.de} … ${L.ate}`, L.numeros.map((n) => n.resseq).join(", "), `${L.confirmados}/${L.numeros.length}`])
        )}` : ""}
        <details>
          <summary>REMARK 465 (${inv.remark465.length})</summary>
          <p class="muted small">Resíduos que o depositante marcou como não localizados. Uma lacuna de numeração sem este registro não prova resíduo faltante. O contrário também ocorre: o REMARK pode citar posições fora do intervalo numerado da cadeia.</p>
          ${inv.remark465.length ? tabela(["Resíduo", "Cadeia", "Número"], inv.remark465.map((r) => [r.resname, cad(r.cadeia), `${r.resseq}${r.icode || ""}`])) : `<p class="muted small">Este arquivo não traz REMARK 465.</p>`}
        </details>
        ${campoDecisao("inventario")}
      </section>

      <section class="prep-secao">
        <h3>Limpeza e exportação</h3>
        <p class="muted small">O viewer continua mostrando a estrutura original. Os arquivos abaixo são uma cópia filtrada, sem hidrogênios adicionados e sem ANISOU. ${esc(F.serial)}</p>
        <div class="prep-linha">${checksCadeia}</div>
        <label class="prep-check"><input type="checkbox" data-sel="aguas" ${selecao.removerAguas ? "checked" : ""}/> Remover águas (HOH e aliases), exceto as marcadas abaixo</label>
        <div class="prep-linha">
          <label class="prep-check"><input type="radio" name="prep-altloc" data-sel="altloc" value="A" ${selecao.altloc === "A" ? "checked" : ""}/> Altloc em branco ou A</label>
          <label class="prep-check"><input type="radio" name="prep-altloc" data-sel="altloc" value="ocupacao" ${selecao.altloc === "ocupacao" ? "checked" : ""}/> Maior ocupação</label>
        </div>
        <h4>HET a manter</h4>
        ${hetHtml || `<p class="muted small">Nenhum heteroátomo além de água.</p>`}
        <h4>Águas no raio dos metais</h4>
        ${aguasHtml}
        <div id="prep-previa" class="prep-aviso"></div>
        <div class="prep-linha">
          <button type="button" class="primary-btn" data-acao="limpa">Baixar proteina_limpa.pdb</button>
          <button type="button" class="dl-btn" data-acao="pacote">Baixar pacote (PDB limpo + íons + HET marcados)</button>
        </div>
        ${campoDecisao("limpeza")}
      </section>

      <section class="prep-secao">
        <h3>Íons metálicos</h3>
        <p class="rotulo-fixo">${esc(F.contato)} Vizinhos N, O e S até ${esc(raios.metal)} Å. O elemento vem das colunas 77–78, para não confundir cálcio com carbono alfa. ${esc(F.serial)}</p>
        <p class="muted small">${resultado.ions.metais.length} íon(s), ${nPares} par(es) geométrico(s), ${nSem} sem LINK de simetria 1555. LINK de metal com simetria 1555 encontrados: ${linksCob}/${linksId.length}.</p>
        ${tabela(
          ["Íon", "Série original", "Ocupação", "Vizinho", "Distância (Å)", "Consta no LINK?", "Notas"],
          ionHtmlRows
        )}
        ${linhasLinksFora().length ? `<h4>LINK de metal dentro da unidade assimétrica, fora do raio</h4><p class="muted small">A distância abaixo é a que está escrita no próprio LINK, não um julgamento de coordenação.</p>${tabela(["Átomo 1", "Átomo 2", "Distância no LINK (Å)", "Leitura"], linhasLinksFora())}` : ""}
        ${linhasSimetria().length ? `<h4>LINK de metal por simetria cristalográfica</h4><p class="muted small">Operador diferente de 1555. O módulo não constrói a cópia simétrica.</p>${tabela(["Átomo 1", "Átomo 2", "Operadores", "Distância no LINK (Å)"], linhasSimetria())}` : ""}
        ${resultado.ions.aguasEntre.length ? `<p class="prep-aviso">Há água no raio de mais de um metal (${resultado.ions.aguasEntre.map((a) => esc(a.metais.join(" e "))).join("; ")}). Pode ser ponte. Não remova sem conferir.</p>` : ""}
        ${campoDecisao("ions")}
      </section>

      <section class="prep-secao">
        <h3>Pontes dissulfeto</h3>
        <p class="rotulo-fixo">${esc(F.contato)} Pares SG–SG de CYS ou CYX até ${esc(raios.ss)} Å, comparados ao SSBOND.</p>
        ${tabela(["Cisteína 1", "Cisteína 2", "Distância (Å)", "Consta no SSBOND?"], linhasSS().map((row, i) => {
          const copia = row.slice();
          copia[0] = { html: `${esc(row[0])} <button type="button" class="link-btn" data-acao="ver-ss" data-idx="${i}">ver</button>` };
          return copia;
        }))}
        <h4>Rascunho de linhas bond</h4>
        <p class="muted small">${esc(F.tleap)} ${esc(PrepAnalysis.FRASES.acucar)}</p>
        <pre class="prep-bonds">${esc(resultado.bonds)}</pre>
        <button type="button" class="dl-btn" data-acao="bonds">Baixar rascunho_bond_tleap.txt</button>
        ${campoDecisao("dissulfetos")}
      </section>

      <section class="prep-secao">
        <h3>Glicosilação (Asn–açúcar)</h3>
        <p class="rotulo-fixo">${esc(F.contato)} ND2 de ASN até ${esc(raios.glic)} Å de um C1. ${esc(F.acucar)} Se o arquivo não traz o glicano, o módulo não o adiciona. Açúcares devem permanecer HETATM; um TER entre eles é decisão sua, não é gravado automaticamente.</p>
        ${tabela(["ASN", "Açúcar C1", "Distância (Å)", "Origem do código", "Consta no LINK?"], linhasGlic().map((row, i) => {
          const copia = row.slice();
          copia[0] = { html: `${esc(row[0])} <button type="button" class="link-btn" data-acao="ver-glic" data-idx="${i}">ver</button>` };
          return copia;
        }))}
        <h4>Açúcares por árvore</h4>
        <p class="muted small">A numeração sugerida continua depois do último resíduo polimérico (${inv.maxResProteina == null ? "nenhum" : inv.maxResProteina}). Ela não é aplicada ao arquivo.</p>
        ${tabela(["Árvore", "Código", "Cadeia", "Número atual", "Número sugerido", "HETNAM", "ASN no raio"], linhasArvores())}
        ${campoDecisao("glicosilacao")}
      </section>

      <section class="prep-secao">
        <h3>Histidinas</h3>
        <p class="rotulo-fixo">${esc(F.protonacao)} A coluna de candidato só reage a metal dentro de ${esc(raios.his)} Å. Enterramento: átomos pesados a ≤ ${resultado.histidinas.raioEnterramento} Å do meio de ND1–NE2, fora do próprio resíduo. Não é área de superfície.</p>
        ${tabela(["Cadeia", "Resíduo", "Candidato", "Metais no ND1", "Metais no NE2", "Enterramento"], linhasHis())}
        ${campoDecisao("histidinas")}
      </section>

      <section class="prep-secao" id="prep-vina">
        <h3>Caixa sugerida para o Vina</h3>
        <p class="rotulo-fixo">${esc(F.vina)} ${esc(F.descritor)} ${esc(F.escore)} O centro é o centroide dos átomos do arquivo de resíduos do pocket do DoGSite. O tamanho é a extensão em x, y e z mais duas vezes a margem (uma de cada lado), arredondado.</p>
        ${estado && estado.pdbId ? "" : `<p class="prep-aviso">A caixa pede um pocket do DoGSiteScorer e, por isso, só aparece quando a estrutura foi aberta por ID do PDB. O resto da ficha não depende disso.</p>`}
        <div class="prep-linha">
          <label>Pocket <select id="prep-pocket">${pocketOpts}</select></label>
          <label>Margem de cada lado (Å) <input id="prep-margem" type="number" min="0" max="50" step="0.5" value="${esc(vina.margem)}"/></label>
          <button type="button" class="primary-btn" data-acao="sugerir">Sugerir caixa</button>
        </div>
        <p id="prep-vina-status" class="muted small"></p>
        ${vinaCampos}
        ${campoDecisao("vina")}
      </section>

      <p class="muted small">${esc(F.auxiliar)} ${esc(F.contato)} ${esc(F.escore)} ${esc(F.serial)} ${esc(F.protonacao)} ${esc(F.vina)}</p>
    `;
  }

  function atualizarPrevia() {
    const el = document.getElementById("prep-previa");
    if (!el || !selecao) return;
    try {
      const r = PrepAnalysis.limparPdb(estado.pdbText, opcoesLimpeza());
      el.innerHTML = r.linhasResumo.map((l) => esc(l)).join("<br>");
    } catch (e) {
      el.textContent = e.message;
    }
  }

  function render() {
    const cont = document.getElementById("tab-preparo");
    if (!cont) return;
    cont.innerHTML = montar();
    atualizarPrevia();
  }

  function lerRaiosDosCampos() {
    const ler = (id, atual) => {
      const el = document.getElementById(id);
      const n = el ? Number(el.value) : atual;
      return Number.isFinite(n) ? n : atual;
    };
    raios.metal = ler("prep-raio-metal", raios.metal);
    raios.ss = ler("prep-raio-ss", raios.ss);
    raios.glic = ler("prep-raio-glic", raios.glic);
    raios.his = ler("prep-raio-his", raios.his);
    const mg = document.getElementById("prep-margem");
    if (mg && Number.isFinite(Number(mg.value))) vina.margem = Number(mg.value);
  }

  function atualizarSelecao(t) {
    const on = t.checked;
    const ch = t.dataset.chave;
    if (t.dataset.sel === "cadeia") { if (on) selecao.cadeias.add(ch); else selecao.cadeias.delete(ch); }
    if (t.dataset.sel === "het") { if (on) selecao.hets.add(ch); else selecao.hets.delete(ch); }
    if (t.dataset.sel === "agua") { if (on) selecao.aguas.add(ch); else selecao.aguas.delete(ch); }
    if (t.dataset.sel === "aguas") selecao.removerAguas = on;
    if (t.dataset.sel === "altloc") selecao.altloc = t.value;
    atualizarPrevia();
  }

  function pdbIon(idx) {
    const m = resultado.ions.metais[idx];
    if (!m) return null;
    return { nome: m.nomeArquivo, pdb: PrepAnalysis.linhaIonMaiuscula(m.atom) + "\nEND\n" };
  }

  function pdbHet(chave) {
    const r = PrepAnalysis.limparPdb(estado.pdbText, {
      hets: [chave],
      removerAguas: true,
      altloc: selecao.altloc,
    });
    return r.hets.find((h) => h.chave === chave) || null;
  }

  function mostrar3d(itens) {
    destaque = itens;
    const estilo = document.getElementById("estilo-3d");
    if (estilo) estilo.dispatchEvent(new Event("change"));
    else aposEstilo(estado);
  }

  function itemEsfera(o, color, radius) {
    return { cadeia: o.cadeia, resseq: o.resseq, icode: o.icode || "", atom: o.nome || o.elemento, color, radius };
  }

  function sincronizarVina() {
    const cx = document.getElementById("prep-cx");
    if (!cx) return;
    vina.editada = {
      center_x: Number(document.getElementById("prep-cx").value),
      center_y: Number(document.getElementById("prep-cy").value),
      center_z: Number(document.getElementById("prep-cz").value),
      size_x: Number(document.getElementById("prep-sx").value),
      size_y: Number(document.getElementById("prep-sy").value),
      size_z: Number(document.getElementById("prep-sz").value),
    };
    const ta = document.getElementById("prep-vina-cfg");
    if (ta && document.activeElement !== ta) ta.value = PrepAnalysis.formatarConfigVina(vina.editada);
  }

  function preencherNumeros() {
    const c = vina.editada;
    if (!c || !document.getElementById("prep-cx")) return;
    document.getElementById("prep-cx").value = c.center_x;
    document.getElementById("prep-cy").value = c.center_y;
    document.getElementById("prep-cz").value = c.center_z;
    document.getElementById("prep-sx").value = c.size_x;
    document.getElementById("prep-sy").value = c.size_y;
    document.getElementById("prep-sz").value = c.size_z;
    const ta = document.getElementById("prep-vina-cfg");
    if (ta) ta.value = PrepAnalysis.formatarConfigVina(c);
  }

  async function sugerirCaixa() {
    const status = document.getElementById("prep-vina-status");
    const sel = document.getElementById("prep-pocket");
    const idx = sel ? sel.value : "";
    const p = estado.pockets && estado.pockets[idx];
    if (!p || !p.residuosUrl) {
      if (status) status.textContent = estado.pdbId
        ? "Detecte os pockets na aba Pockets e volte aqui. A caixa não é calculada sozinha."
        : "A caixa pede um ID do PDB, porque o DoGSiteScorer não recebe arquivo enviado.";
      return;
    }
    if (status) status.textContent = "Lendo os resíduos do pocket…";
    let txt = cacheRes.get(p.residuosUrl);
    if (!txt) {
      const resp = await fetch(p.residuosUrl);
      if (!resp.ok) throw new Error("Não foi possível baixar os resíduos do pocket (" + resp.status + ").");
      txt = await resp.text();
      cacheRes.set(p.residuosUrl, txt);
    }
    const margem = Number(document.getElementById("prep-margem").value);
    const caixa = PrepAnalysis.caixaPocket(txt, margem);
    if (!caixa.ok) throw new Error(caixa.erro);
    vina.sugerida = caixa;
    vina.editada = {
      center_x: caixa.center_x, center_y: caixa.center_y, center_z: caixa.center_z,
      size_x: caixa.size_x, size_y: caixa.size_y, size_z: caixa.size_z,
    };
    vina.margem = caixa.margem;
    vina.pocketIdx = String(idx);
    vina.residuosTxt = txt;
    lerDecisoes();
    render();
    const st = document.getElementById("prep-vina-status");
    if (st) {
      st.textContent = `Sugestão a partir de ${p.name}: ${caixa.nAtomos} átomos, margem ${caixa.margem} Å de cada lado. ${PrepAnalysis.FRASES.vina}`;
    }
  }

  function aplicarTextoVina() {
    const ta = document.getElementById("prep-vina-cfg");
    const status = document.getElementById("prep-vina-status");
    if (!ta) return;
    const obj = {};
    for (const linha of ta.value.split("\n")) {
      const m = linha.match(/^(center_[xyz]|size_[xyz])\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
      if (m) obj[m[1].toLowerCase()] = Number(m[2]);
    }
    const keys = ["center_x", "center_y", "center_z", "size_x", "size_y", "size_z"];
    if (!keys.every((k) => Number.isFinite(obj[k]))) {
      if (status) status.textContent = "O texto precisa ter center_x, center_y, center_z, size_x, size_y e size_z.";
      return;
    }
    vina.editada = obj;
    preencherNumeros();
    if (status) status.textContent = "Texto aplicado aos campos. Ainda é uma sugestão editável, não uma caixa validada.";
  }

  function documento() {
    lerDecisoes();
    const F = PrepAnalysis.FRASES;
    const inv = resultado.inventario;
    const limpo = PrepAnalysis.limparPdb(estado.pdbText, opcoesLimpeza());
    const decisao = (id) => decisoes[id] && decisoes[id].trim() ? decisoes[id].trim() : "(em branco)";
    return {
      titulo: `Ficha de preparo — ${baseNome()}`,
      cabecalho: cabecalhoTexto(),
      secoes: [
        {
          id: "inventario", titulo: "Inventário",
          paragrafos: inv.alertas.concat([F.gap]),
          tabelas: [
            { head: ["Cadeia", "ATOM", "HETATM", "Águas", "Altloc", "ANISOU"], rows: inv.cadeias.map((c) => [cad(c.cadeia), c.atom, c.hetatm, c.aguas, c.altlocAtomos, c.anisou]) },
            { head: ["Código", "Classe", "Cópias", "Átomos", "HETNAM"], rows: inv.hets.map((h) => [h.resname, h.classeRotulo, h.copias.length, h.nAtomos, h.nome || ""]) },
            { head: ["Cadeia", "Entre", "Confirmados no REMARK 465"], rows: inv.lacunas.map((L) => [cad(L.cadeia), `${L.de}-${L.ate}`, `${L.confirmados}/${L.numeros.length}`]) },
          ],
        },
        {
          id: "limpeza", titulo: "Limpeza e exportação",
          paragrafos: limpo.linhasResumo.concat([F.serial, "Regra de altloc: " + (selecao.altloc === "A" ? "branco ou A" : "maior ocupação") + "."]),
          tabelas: [],
        },
        {
          id: "ions", titulo: "Íons metálicos",
          paragrafos: [F.contato, F.serial, `Raio ${raios.metal} Å. Pares sem LINK de simetria 1555 não são, por isso, erros automáticos.`],
          tabelas: [
            { head: ["Íon", "Série original", "Ocupação", "Vizinho", "Distância (Å)", "LINK 1555", "Notas"], rows: linhasIons() },
            { head: ["Átomo 1", "Átomo 2", "Distância no LINK", "Leitura"], rows: linhasLinksFora() },
            { head: ["Átomo 1", "Átomo 2", "Operadores", "Distância no LINK"], rows: linhasSimetria() },
          ],
        },
        {
          id: "dissulfetos", titulo: "Pontes dissulfeto",
          paragrafos: [F.contato, F.tleap],
          tabelas: [{ head: ["Cisteína 1", "Cisteína 2", "Distância (Å)", "SSBOND"], rows: linhasSS() }],
          pre: resultado.bonds,
        },
        {
          id: "glicosilacao", titulo: "Glicosilação",
          paragrafos: [F.contato, F.acucar, "Açúcares permanecem HETATM. O módulo não insere TER entre eles."],
          tabelas: [
            { head: ["ASN", "C1", "Distância (Å)", "Origem", "LINK"], rows: linhasGlic() },
            { head: ["Árvore", "Código", "Cadeia", "Número atual", "Número sugerido", "HETNAM", "ASN"], rows: linhasArvores() },
          ],
        },
        {
          id: "histidinas", titulo: "Histidinas",
          paragrafos: [F.protonacao, `Enterramento: contagem a ≤ ${resultado.histidinas.raioEnterramento} Å. Não é área de superfície.`],
          tabelas: [{ head: ["Cadeia", "Resíduo", "Candidato", "Metais ND1", "Metais NE2", "Enterramento"], rows: linhasHis() }],
        },
        {
          id: "vina", titulo: "Caixa sugerida para o Vina",
          paragrafos: [F.vina, F.descritor, F.escore, vina.editada ? "Valores editados no momento da exportação:" : "Nenhuma caixa calculada nesta exportação."],
          pre: vina.editada ? PrepAnalysis.formatarConfigVina(vina.editada) : "",
          tabelas: [],
        },
      ],
      decisao,
      rodape: [F.auxiliar, F.contato, F.escore, F.serial, F.protonacao, F.vina],
    };
  }

  function markdown() {
    if (!resultado) return "";
    const doc = documento();
    let md = `# ${doc.titulo}\n\n`;
    md += doc.cabecalho.map((l) => `- ${l}`).join("\n") + "\n\n";
    for (const s of doc.secoes) {
      md += `## ${s.titulo}\n\n`;
      for (const p of s.paragrafos || []) md += `${p}\n\n`;
      for (const t of s.tabelas || []) {
        if (!t.rows.length) continue;
        md += mdTabela(t.head, t.rows);
      }
      if (s.pre) md += "```\n" + s.pre.trim() + "\n```\n\n";
      md += `**Decisão do pesquisador:** ${doc.decisao(s.id)}\n\n`;
    }
    md += doc.rodape.map((l) => `- ${l}`).join("\n") + "\n";
    return md;
  }

  function csvFicha() {
    if (!resultado) return "";
    const doc = documento();
    let out = "# ficha " + baseNome() + "\n";
    out += doc.cabecalho.map((l) => "# " + l).join("\n") + "\n";
    for (const s of doc.secoes) {
      out += "\n# " + s.titulo + "\n";
      for (const t of s.tabelas || []) {
        if (!t.rows.length) continue;
        out += "# " + t.head.join(" | ") + "\n";
        out += csv(t.head, t.rows);
      }
      out += "# decisao: " + doc.decisao(s.id) + "\n";
    }
    return out;
  }

  function anexarPdf(h) {
    if (!resultado || !h) return;
    const doc = documento();
    h.sub("Ficha de preparo");
    doc.cabecalho.forEach((l) => h.par(l));
    for (const s of doc.secoes) {
      h.sub(s.titulo);
      (s.paragrafos || []).forEach((p) => h.par(p));
      for (const t of s.tabelas || []) {
        if (!t.rows.length) continue;
        h.tabela(t.head, t.rows);
      }
      if (s.pre) h.par(s.pre);
      h.par("Decisão do pesquisador: " + doc.decisao(s.id));
    }
    doc.rodape.forEach((l) => h.par(l));
  }

  function baixarPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      const st = document.getElementById("prep-vina-status");
      if (st) st.textContent = "jsPDF não está disponível neste carregamento da página.";
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    let y = M;
    const ensure = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };
    const helper = {
      titulo(t) { ensure(28); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(t, M, y); y += 22; doc.setFont("helvetica", "normal"); },
      sub(t) { ensure(22); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(t, M, y); y += 16; doc.setFont("helvetica", "normal"); },
      par(t) { doc.setFontSize(9); const lines = doc.splitTextToSize(String(t), W - 2 * M); ensure(lines.length * 12 + 4); doc.text(lines, M, y); y += lines.length * 12 + 4; },
      tabela(head, body) {
        doc.autoTable({ startY: y, head: [head], body, margin: { left: M, right: M }, styles: { fontSize: 8 }, headStyles: { fillColor: [42, 85, 153] } });
        y = doc.lastAutoTable.finalY + 12;
      },
    };
    helper.titulo("PEKI Fold — " + baseNome());
    anexarPdf(helper);
    doc.save("PEKI-Fold_" + baseNome() + "_ficha-preparo.pdf");
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset && t.dataset.raio) {
      lerDecisoes();
      lerRaiosDosCampos();
      recalcular();
      render();
      return;
    }
    if (t.dataset && t.dataset.sel) atualizarSelecao(t);
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset && t.dataset.decisao) decisoes[t.dataset.decisao] = t.value;
    if (t.dataset && t.dataset.vina) sincronizarVina();
  }

  async function onClick(e) {
    const btn = e.target.closest("[data-acao]");
    if (!btn || !resultado) return;
    const acao = btn.dataset.acao;
    if (acao === "raios") {
      lerDecisoes();
      lerRaiosDosCampos();
      recalcular();
      render();
      return;
    }
    if (acao === "limpa") {
      const r = PrepAnalysis.limparPdb(estado.pdbText, opcoesLimpeza());
      baixar("proteina_limpa.pdb", r.pdb);
      return;
    }
    if (acao === "pacote") {
      const r = PrepAnalysis.limparPdb(estado.pdbText, opcoesLimpeza());
      let pac = "##### proteina_limpa.pdb\n" + r.pdb + "\n";
      for (const ion of r.ions) pac += "##### " + ion.nomeArquivo + "\n" + ion.pdb + "\n";
      for (const h of r.hets) pac += "##### " + h.nomeArquivo + "\n" + h.pdb + "\n";
      baixar(baseNome() + "_pacote_preparo.txt", pac);
      return;
    }
    if (acao === "ion") {
      const arq = pdbIon(Number(btn.dataset.idx));
      if (arq) baixar(arq.nome, arq.pdb);
      return;
    }
    if (acao === "het") {
      const het = pdbHet(btn.dataset.chave);
      if (het) baixar(het.nomeArquivo, het.pdb);
      return;
    }
    if (acao === "ver-ion") {
      const m = resultado.ions.metais[Number(btn.dataset.idx)];
      if (!m) return;
      const itens = [itemEsfera(m, "#ffb000", 0.55)];
      for (const v of m.vizinhos) itens.push(itemEsfera(v, "#7fd0ff", 0.4));
      mostrar3d(itens);
      return;
    }
    if (acao === "ver-ss") {
      const p = resultado.dissulfetos.pares[Number(btn.dataset.idx)];
      if (!p) return;
      mostrar3d([itemEsfera(p.a, "#ffe14a", 0.45), itemEsfera(p.b, "#ffe14a", 0.45)]);
      return;
    }
    if (acao === "ver-glic") {
      const p = resultado.glicosilacao.pares[Number(btn.dataset.idx)];
      if (!p) return;
      mostrar3d([
        itemEsfera({ ...p.asn, nome: "ND2" }, "#7dffb3", 0.45),
        itemEsfera({ ...p.acucar, nome: "C1" }, "#ff9d6e", 0.45),
      ]);
      return;
    }
    if (acao === "limpar-3d") {
      destaque = null;
      caixaDesenhada = false;
      if (estado && estado.viewer) estado.viewer.removeAllShapes();
      const estilo = document.getElementById("estilo-3d");
      if (estilo) estilo.dispatchEvent(new Event("change"));
      return;
    }
    if (acao === "bonds") baixar("rascunho_bond_tleap.txt", resultado.bonds);
    if (acao === "md") baixar("PEKI-Fold_" + baseNome() + "_ficha-preparo.md", markdown(), "text/markdown;charset=utf-8");
    if (acao === "csv") baixar("PEKI-Fold_" + baseNome() + "_ficha-preparo.csv", csvFicha(), "text/csv;charset=utf-8");
    if (acao === "pdf") baixarPdf();
    if (acao === "sugerir") {
      try { await sugerirCaixa(); }
      catch (err) {
        const st = document.getElementById("prep-vina-status");
        if (st) st.textContent = err.message;
      }
      return;
    }
    if (acao === "vina-texto") aplicarTextoVina();
    if (acao === "vina-copiar") {
      sincronizarVina();
      const ta = document.getElementById("prep-vina-cfg");
      if (!ta) return;
      ta.focus();
      ta.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).catch(() => {});
      }
      return;
    }
    if (acao === "vina-desenhar") {
      sincronizarVina();
      caixaDesenhada = true;
      const estilo = document.getElementById("estilo-3d");
      if (estilo) estilo.dispatchEvent(new Event("change"));
      return;
    }
    if (acao === "vina-restaurar" && vina.sugerida) {
      vina.editada = {
        center_x: vina.sugerida.center_x, center_y: vina.sugerida.center_y, center_z: vina.sugerida.center_z,
        size_x: vina.sugerida.size_x, size_y: vina.sugerida.size_y, size_z: vina.sugerida.size_z,
      };
      preencherNumeros();
      return;
    }
    if (acao === "vina-residuos" && vina.residuosTxt) {
      baixar("pocket_residuos.pdb", vina.residuosTxt);
    }
  }

  function garantirOuvintes() {
    if (ouvintes) return;
    const cont = document.getElementById("tab-preparo");
    if (!cont) return;
    cont.addEventListener("click", onClick);
    cont.addEventListener("change", onChange);
    cont.addEventListener("input", onInput);
    ouvintes = true;
  }

  function reiniciar() {
    destaque = null;
    caixaDesenhada = false;
  }

  function aoCarregar(est) {
    if (!ATIVO || typeof PrepAnalysis === "undefined") return;
    estado = est;
    destaque = null;
    caixaDesenhada = false;
    vina.sugerida = null;
    vina.editada = null;
    vina.pocketIdx = "";
    vina.residuosTxt = "";
    vina.margem = PrepAnalysis.RAIOS_PADRAO.margemVina;
    raios.metal = PrepAnalysis.RAIOS_PADRAO.metal;
    raios.ss = PrepAnalysis.RAIOS_PADRAO.dissulfeto;
    raios.glic = PrepAnalysis.RAIOS_PADRAO.glicosilacao;
    raios.his = PrepAnalysis.RAIOS_PADRAO.histidina;
    for (const k of Object.keys(decisoes)) delete decisoes[k];
    garantirOuvintes();
    try {
      recalcular();
      initSelecao();
      render();
    } catch (e) {
      const cont = document.getElementById("tab-preparo");
      if (cont) cont.innerHTML = `<p class="prep-aviso">Não foi possível montar a ficha: ${esc(e.message)}</p>`;
      resultado = null;
    }
  }

  function aposEstilo(est) {
    if (!ATIVO) return;
    if (est) estado = est;
    const v = estado && estado.viewer;
    if (!v) return;
    if (destaque && destaque.length) {
      for (const item of destaque) {
        const sel = {
          chain: item.cadeia === "_" ? "" : item.cadeia,
          resi: item.icode ? String(item.resseq) + item.icode : item.resseq,
          atom: item.atom,
        };
        v.setStyle(sel, { sphere: { color: item.color, radius: item.radius } });
      }
    }
    if (caixaDesenhada && vina.editada && Number.isFinite(Number(vina.editada.center_x))) {
      const c = vina.editada;
      v.removeAllShapes();
      v.addBox({
        center: { x: Number(c.center_x), y: Number(c.center_y), z: Number(c.center_z) },
        dimensions: { w: Number(c.size_x), h: Number(c.size_y), d: Number(c.size_z) },
        color: "#e0a800",
        wireframe: true,
        linewidth: 2,
        opacity: 0.95,
      });
    }
    v.render();
  }

  function aoMostrar() {
    const sel = document.getElementById("prep-pocket");
    if (!sel || !estado) return;
    const atual = sel.value;
    const pockets = estado.pockets || [];
    if (!pockets.length) {
      sel.innerHTML = `<option value="">Nenhum pocket detectado ainda</option>`;
      return;
    }
    sel.innerHTML = pockets.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("");
    if (atual !== "" && pockets[atual]) sel.value = atual;
    else if (vina.pocketIdx !== "" && pockets[vina.pocketIdx]) sel.value = String(vina.pocketIdx);
  }

  function init() {
    const botao = document.querySelector('#workspace .aba[data-tab="preparo"]');
    if (!ATIVO && botao) botao.hidden = true;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { ativo, temFicha, reiniciar, aoCarregar, aposEstilo, aoMostrar, markdown, anexarPdf };
})();

if (typeof globalThis !== "undefined") globalThis.PrepUI = PrepUI;
