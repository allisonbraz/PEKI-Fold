// ProtAnalysis - logica de analise estrutural de proteinas (formato PDB).
// Versao JavaScript (roda 100% no navegador) das funcoes do modulo Python
// pdb_analysis.py: cadeias, estatisticas, frequencia de aminoacidos, sequencia
// e busca de motivos. Os indices de coluna seguem o formato PDB.

"use strict";

const ProtAnalysis = (() => {

  const AMINOACIDOS_PADRAO = [
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
    "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
  ];
  const SET_AA = new Set(AMINOACIDOS_PADRAO);

  const TRES_PARA_UMA = {
    ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E",
    GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F",
    PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
  };

  // Identificador da cadeia: coluna 22 (indice 21). Vazio -> "_".
  function idCadeia(linha) {
    const c = linha.charAt(21);
    return c === " " || c === "" ? "_" : c;
  }

  function ehRegistro(linha, tipos) {
    const reg = linha.substring(0, 6).trim();
    return tipos.includes(reg);
  }

  function listarCadeias(texto) {
    const vistos = [];
    for (const linha of texto.split("\n")) {
      if (linha.length >= 22 && ehRegistro(linha, ["ATOM", "HETATM", "TER"])) {
        const cid = idCadeia(linha);
        if (!vistos.includes(cid)) vistos.push(cid);
      }
    }
    return vistos;
  }

  function separarCadeias(texto) {
    const cadeias = {};
    for (const linha of texto.split("\n")) {
      if (linha.length >= 22 && ehRegistro(linha, ["ATOM", "HETATM", "TER", "ANISOU"])) {
        const cid = idCadeia(linha);
        (cadeias[cid] = cadeias[cid] || []).push(linha);
      }
    }
    const resultado = {};
    for (const cid of Object.keys(cadeias).sort()) {
      resultado[cid] = cadeias[cid].join("\n") + "\nEND\n";
    }
    return resultado;
  }

  // Lista [nomeResiduo, numResiduo] de uma cadeia, na ordem, sem repetir.
  function residuosOrdenados(texto, cidAlvo) {
    const seq = [];
    const vistos = new Set();
    for (const linha of texto.split("\n")) {
      if (linha.length < 27 || !linha.startsWith("ATOM")) continue;
      const cid = idCadeia(linha);
      if (cidAlvo != null && cid !== cidAlvo) continue;
      const nome = linha.substring(17, 20).trim();
      const num = linha.substring(22, 27).trim();
      const chave = cid + "|" + nome + "|" + num;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        seq.push([nome, num]);
      }
    }
    return seq;
  }

  function estatisticas(texto) {
    const porCadeia = {};
    for (const linha of texto.split("\n")) {
      if (linha.length < 27 || !linha.startsWith("ATOM")) continue;
      const cid = idCadeia(linha);
      const nome = linha.substring(17, 20).trim();
      const num = linha.substring(22, 27).trim();
      const d = porCadeia[cid] || (porCadeia[cid] = { atomos: 0, residuos: new Set(), aa: new Set() });
      d.atomos += 1;
      d.residuos.add(num);
      if (SET_AA.has(nome)) d.aa.add(nome);
    }
    const cadeias = Object.keys(porCadeia).sort().map((cid) => ({
      cadeia: cid,
      atomos: porCadeia[cid].atomos,
      residuos: porCadeia[cid].residuos.size,
      aminoacidos_diferentes: porCadeia[cid].aa.size,
    }));
    let maior = null, menor = null;
    if (cadeias.length) {
      maior = cadeias.reduce((a, b) => (b.residuos > a.residuos ? b : a));
      menor = cadeias.reduce((a, b) => (b.residuos < a.residuos ? b : a));
    }
    return { cadeias, maior, menor };
  }

  function frequenciaAminoacidos(texto, cidAlvo) {
    const contagem = {};
    for (const aa of AMINOACIDOS_PADRAO) contagem[aa] = 0;
    for (const [nome] of residuosOrdenados(texto, cidAlvo)) {
      if (contagem.hasOwnProperty(nome)) contagem[nome] += 1;
    }
    const total = Object.values(contagem).reduce((s, v) => s + v, 0);
    const itens = AMINOACIDOS_PADRAO.map((aa) => ({
      aa,
      contagem: contagem[aa],
      porcentagem: total ? Math.round((10000 * contagem[aa]) / total) / 100 : 0,
    }));
    return { total, itens };
  }

  function sequenciaUmaLetra(texto, cid) {
    return residuosOrdenados(texto, cid)
      .map(([nome]) => TRES_PARA_UMA[nome] || "X")
      .join("");
  }

  function buscarMotivo(texto, motivo) {
    motivo = motivo.map((m) => m.trim().toUpperCase()).filter(Boolean);
    const ocorrencias = [];
    if (!motivo.length) return ocorrencias;
    const n = motivo.length;
    for (const cid of listarCadeias(texto)) {
      const seq = residuosOrdenados(texto, cid);
      const nomes = seq.map((r) => r[0]);
      for (let i = 0; i <= nomes.length - n; i++) {
        let bate = true;
        for (let k = 0; k < n; k++) if (nomes[i + k] !== motivo[k]) { bate = false; break; }
        if (bate) {
          ocorrencias.push({
            cadeia: cid,
            posicao: seq[i][1],
            residuos: Array.from({ length: n }, (_, k) => seq[i + k][1]),
          });
        }
      }
    }
    return ocorrencias;
  }

  function analisarCompleto(texto) {
    const cadeias = listarCadeias(texto);
    const frequencias = {};
    const sequencias = {};
    for (const cid of cadeias) {
      frequencias[cid] = frequenciaAminoacidos(texto, cid);
      sequencias[cid] = sequenciaUmaLetra(texto, cid);
    }
    return {
      cadeias,
      estatisticas: estatisticas(texto),
      frequencias,
      sequencias,
    };
  }

  // Extrai metadados dos registros de cabeçalho do PDB (HEADER, TITLE, COMPND,
  // SOURCE, EXPDTA, REMARK 2, HET/HETNAM). Funciona para upload e para ID.
  function extrairMetadados(texto) {
    const meta = { id: null, classificacao: null, data: null, titulo: null,
      metodo: null, resolucao: null, organismos: [], moleculas: [], ligantes: [] };
    const titulo = [], hetCount = {}, hetNome = {};
    for (const l of texto.split("\n")) {
      const rec = l.substring(0, 6).trim();
      if (rec === "HEADER") {
        meta.classificacao = l.substring(10, 50).trim() || null;
        meta.data = l.substring(50, 59).trim() || null;
        meta.id = l.substring(62, 66).trim() || null;
      } else if (rec === "TITLE") {
        titulo.push(l.substring(10).trim());
      } else if (rec === "EXPDTA") {
        meta.metodo = ((meta.metodo ? meta.metodo + " " : "") + l.substring(10).trim()).trim();
      } else if (l.startsWith("REMARK   2 RESOLUTION")) {
        const m = l.match(/([\d.]+)\s*ANGSTROM/);
        if (m) meta.resolucao = parseFloat(m[1]);
      } else if (rec === "COMPND") {
        const m = l.match(/MOLECULE:\s*(.+?);?\s*$/);
        if (m && !meta.moleculas.includes(m[1].trim())) meta.moleculas.push(m[1].trim());
      } else if (rec === "SOURCE") {
        const m = l.match(/ORGANISM_SCIENTIFIC:\s*(.+?);?\s*$/);
        if (m && !meta.organismos.includes(m[1].trim())) meta.organismos.push(m[1].trim());
      } else if (rec === "HET") {
        const id = l.substring(7, 10).trim();
        if (id && id !== "HOH") hetCount[id] = (hetCount[id] || 0) + 1;
      } else if (rec === "HETNAM") {
        const id = l.substring(11, 14).trim();
        if (id) hetNome[id] = ((hetNome[id] ? hetNome[id] + " " : "") + l.substring(15).trim()).trim();
      }
    }
    meta.titulo = titulo.join(" ").replace(/\s+/g, " ").trim() || null;
    meta.ligantes = Object.keys(hetCount).map((id) => ({ id, count: hetCount[id], nome: hetNome[id] || null }));
    return meta;
  }

  function validar(texto) {
    if (!texto.includes("ATOM") && !texto.includes("HETATM")) {
      throw new Error("Arquivo invalido: nenhuma linha ATOM/HETATM encontrada.");
    }
  }

  return {
    AMINOACIDOS_PADRAO,
    listarCadeias, separarCadeias, estatisticas, frequenciaAminoacidos,
    sequenciaUmaLetra, buscarMotivo, analisarCompleto, validar, extrairMetadados,
  };
})();
