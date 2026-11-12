// StructureModel — leitura de PDB e mmCIF do PEKI Fold.
// Contrato: peki-estrutura-1.
//
// PDB entra pelas colunas fixas (wwPDB v3.3). mmCIF entra pelas categorias,
// nunca pelas mesmas colunas. Modelo selecionado: o primeiro MODEL do PDB ou o
// menor pdbx_PDB_model_num do mmCIF. altLoc não cria outro resíduo.
// Resíduo sem coordenada não ganha coordenada aqui.
// Correspondência resíduo a resíduo com UniProt não é calculada: DBREF e
// _struct_ref_seq ficam como intervalo declarado no arquivo.

"use strict";

const StructureModel = (() => {
  const SCHEMA = "peki-estrutura-1";

  const AA = new Set([
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
    "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
  ]);
  // Lista parcial. Código de fora dela não vira ligante biológico por omissão.
  const MODIFICADOS = new Set([
    "MSE", "SEC", "PYL", "MLY", "PTR", "SEP", "TPO", "CSE", "CSO", "ABU", "PCA", "FME", "ALY", "M3L",
  ]);
  const TERMINAIS = new Set(["ACE", "NH2", "NME", "FOR"]);
  const NUCLEOTIDEOS = new Set([
    "A", "C", "G", "U", "I", "DA", "DT", "DG", "DC", "DU", "DI",
    "ADE", "CYT", "GUA", "THY", "URA", "URI",
  ]);
  const AGUAS = new Set(["HOH", "WAT", "H2O", "DOD"]);
  const IONS = new Set([
    "LI", "NA", "K", "RB", "CS", "MG", "CA", "SR", "BA", "MN", "FE", "CO", "NI", "CU", "ZN",
    "CD", "HG", "CL", "BR", "IOD",
  ]);
  const TRES_PARA_UMA = {
    ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E",
    GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F",
    PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
  };

  function idClassico(id) {
    return /^[0-9][A-Z0-9]{3}$/.test(String(id || "").trim().toUpperCase());
  }

  function pareceMmcif(texto) {
    const t = String(texto || "").replace(/^\uFEFF/, "");
    if (t.slice(0, 200).includes("#\\#CIF_2.0")) return true;
    if (/^\s*data_\S/.test(t)) return true;
    return /^_atom_site\./m.test(t);
  }

  function pareceCoordenadaPdb(texto) {
    const t = String(texto || "");
    if (!t || pareceMmcif(t)) return false;
    return /^(?:ATOM  |HETATM)/m.test(t);
  }

  function escolherEntrada(pdbTexto, cifTexto) {
    if (pareceCoordenadaPdb(pdbTexto)) return { texto: pdbTexto, origem: "pdb" };
    if (cifTexto && pareceMmcif(cifTexto)) return { texto: cifTexto, origem: "mmcif" };
    return null;
  }

  function detectar(texto) {
    const t = String(texto || "");
    if (t.includes("\0")) return "binario";
    if (t.slice(0, 200).includes("#\\#CIF_2.0")) return "cif2";
    if (pareceMmcif(t)) return "mmcif";
    if (/^(?:ATOM  |HETATM|HEADER |MODEL )/m.test(t)) return "pdb";
    return "desconhecido";
  }

  function falha(formato, codigo, mensagem) {
    return {
      schema: SCHEMA,
      ok: false,
      formato,
      erro: { codigo, mensagem },
      diagnosticos: [{ nivel: "erro", codigo, mensagem }],
      analise: null,
      estrutura: null,
      textoPdb: null,
      textoViewer: null,
      viewerFormato: null,
    };
  }

  function limpo(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || s === "." || s === "?") return null;
    return s;
  }

  function numero(v) {
    const s = limpo(v);
    if (s == null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function inteiro(v) {
    const s = limpo(v);
    if (s == null || !/^-?\d+$/.test(s)) return null;
    return parseInt(s, 10);
  }

  function tokenizarCif(texto) {
    const src = String(texto || "").replace(/^\uFEFF/, "");
    const tokens = [];
    const n = src.length;
    let i = 0;
    while (i < n) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
      if (c === "#") {
        while (i < n && src[i] !== "\n" && src[i] !== "\r") i++;
        continue;
      }
      if (c === "'" || c === '"') {
        const q = c;
        i++;
        let s = "";
        while (i < n && src[i] !== q) { s += src[i]; i++; }
        if (i < n) i++;
        tokens.push(s);
        continue;
      }
      if (c === ";") {
        let j = i - 1;
        while (j >= 0 && (src[j] === " " || src[j] === "\t")) j--;
        const inicio = j < 0 || src[j] === "\n" || src[j] === "\r";
        if (inicio) {
          i++;
          if (src[i] === "\r") i++;
          if (src[i] === "\n") i++;
          let s = "";
          while (i < n) {
            if (src[i] === ";") {
              let k = i - 1;
              while (k >= 0 && (src[k] === " " || src[k] === "\t")) k--;
              if (k < 0 || src[k] === "\n" || src[k] === "\r") { i++; break; }
            }
            s += src[i];
            i++;
          }
          tokens.push(s.replace(/\r/g, "").replace(/\n$/, ""));
          continue;
        }
      }
      let j = i;
      while (j < n && src[j] !== " " && src[j] !== "\t" && src[j] !== "\n" && src[j] !== "\r") j++;
      tokens.push(src.slice(i, j));
      i = j;
    }
    return tokens;
  }

  function parseCif(texto) {
    const tokens = tokenizarCif(texto);
    const blocks = [];
    let block = null;
    const novo = (nome) => {
      block = { name: nome, singles: [], loops: [] };
      blocks.push(block);
    };
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.startsWith("data_")) { novo(t.slice(5)); i++; continue; }
      if (t.startsWith("save_") || t === "global_" || t === "stop_") {
        return { erro: "mmCIF com " + t + " não é lido nesta versão. O arquivo não foi interpretado por aproximação." };
      }
      if (t === "loop_") {
        if (!block) novo("");
        i++;
        const cols = [];
        while (i < tokens.length && tokens[i].startsWith("_")) cols.push(tokens[i++].toLowerCase());
        if (!cols.length) return { erro: "mmCIF com loop_ sem colunas. A leitura parou." };
        const rows = [];
        while (
          i < tokens.length &&
          !tokens[i].startsWith("_") &&
          !tokens[i].startsWith("data_") &&
          tokens[i] !== "loop_" &&
          !tokens[i].startsWith("save_") &&
          tokens[i] !== "global_"
        ) {
          if (i + cols.length > tokens.length) return { erro: "mmCIF com loop incompleto em " + cols[0] + ". A leitura parou para não deslocar colunas." };
          rows.push(tokens.slice(i, i + cols.length));
          i += cols.length;
        }
        block.loops.push({ category: cols[0].split(".")[0], cols, rows });
        continue;
      }
      if (t.startsWith("_")) {
        if (!block) novo("");
        const tag = t.toLowerCase();
        i++;
        if (i >= tokens.length) return { erro: "mmCIF com item sem valor (" + tag + ")." };
        block.singles.push({ tag, value: tokens[i] });
        i++;
        continue;
      }
      return { erro: "mmCIF com token inesperado. A leitura parou para não reinterpretar o arquivo." };
    }
    const escolhido = blocks.find((b) => b.loops.some((l) => l.category === "_atom_site"))
      || blocks.find((b) => b.singles.some((s) => s.tag.startsWith("_atom_site.")));
    if (!escolhido) return { erro: "mmCIF sem a categoria _atom_site. Não li o arquivo como se fosse PDB." };
    return { block: escolhido };
  }

  function linhasLoop(block, category) {
    const out = [];
    for (const loop of block.loops) {
      if (loop.category !== category) continue;
      for (const row of loop.rows) {
        const o = {};
        loop.cols.forEach((c, idx) => { o[c] = row[idx]; });
        out.push(o);
      }
    }
    return out;
  }

  function campo(row, sufixo) {
    const alvo = "." + sufixo;
    const k = Object.keys(row).find((nome) => nome.endsWith(alvo));
    return k ? row[k] : undefined;
  }

  function registrosCategoria(block, category) {
    const loops = linhasLoop(block, category);
    if (loops.length) {
      return loops.map((row) => {
        const o = {};
        Object.keys(row).forEach((k) => { o[k.slice(category.length + 1)] = row[k]; });
        return o;
      });
    }
    const tags = block.singles.filter((s) => s.tag.startsWith(category + "."));
    if (!tags.length) return [];
    const records = [];
    let cur = {};
    const seen = new Set();
    for (const s of tags) {
      const name = s.tag.slice(category.length + 1);
      if (seen.has(name)) { records.push(cur); cur = {}; seen.clear(); }
      cur[name] = s.value;
      seen.add(name);
    }
    records.push(cur);
    return records;
  }

  function valores(block, tag) {
    const t = tag.toLowerCase();
    const vals = block.singles.filter((s) => s.tag === t).map((s) => s.value);
    const cat = t.split(".")[0];
    for (const row of linhasLoop(block, cat)) {
      if (Object.prototype.hasOwnProperty.call(row, t)) vals.push(row[t]);
    }
    return vals;
  }

  function temCategoria(block, category) {
    return block.loops.some((l) => l.category === category) || block.singles.some((s) => s.tag.startsWith(category + "."));
  }

  function primeiroModeloTexto(texto) {
    if (!/^MODEL\s/m.test(texto)) return texto;
    const out = [];
    for (const l of String(texto).split("\n")) {
      out.push(l);
      if (l.startsWith("ENDMDL")) break;
    }
    return out.join("\n") + "\n";
  }

  function linhasPdb(texto) {
    return String(texto || "").replace(/^\uFEFF/, "").split("\n").map((l) => l.replace(/\r$/, ""));
  }

  function fatiarPdb(linhas) {
    let total = 0;
    let primeiro = null;
    let viu = false;
    let capturando = false;
    const atomos = [];
    for (const l of linhas) {
      if (l.startsWith("MODEL ") || l.startsWith("MODEL\t")) {
        total += 1;
        if (!viu) {
          viu = true;
          capturando = true;
          const n = parseInt(l.slice(5).trim(), 10);
          primeiro = Number.isFinite(n) ? n : 1;
        } else {
          capturando = false;
        }
        continue;
      }
      if (l.startsWith("ENDMDL")) {
        if (capturando) capturando = false;
        continue;
      }
      if ((!viu || capturando) && (l.startsWith("ATOM") || l.startsWith("HETATM") || l.startsWith("TER"))) {
        atomos.push(l);
      }
    }
    if (!viu) return { modelo: 1, total: 1, criterio: "arquivo sem registro MODEL", atomos };
    return { modelo: primeiro == null ? 1 : primeiro, total, criterio: "primeiro registro MODEL até ENDMDL", atomos };
  }

  function registrosPdb(atomos, diagnosticos) {
    const registros = [];
    let curtas = 0;
    for (const linha of atomos) {
      const rec = linha.substring(0, 6).trim();
      if (rec !== "ATOM" && rec !== "HETATM" && rec !== "TER") continue;
      if (linha.length < 22) { curtas += 1; continue; }
      const ch = linha.charAt(21);
      const chain = !ch || ch === " " ? "_" : ch;
      if (rec === "TER") {
        registros.push(registroBase({ rec: "TER", chain, authChain: chain === "_" ? null : chain }));
        continue;
      }
      if (linha.length < 27) { curtas += 1; continue; }
      const seqTxt = linha.substring(22, 26).trim();
      const seq = /^-?\d+$/.test(seqTxt) ? parseInt(seqTxt, 10) : null;
      const ic = linha.charAt(26);
      const alt = linha.charAt(16);
      let x = null; let y = null; let z = null;
      if (linha.length >= 54) {
        const px = parseFloat(linha.substring(30, 38));
        const py = parseFloat(linha.substring(38, 46));
        const pz = parseFloat(linha.substring(46, 54));
        if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) { x = px; y = py; z = pz; }
      }
      const occ = linha.length >= 60 ? parseFloat(linha.substring(54, 60)) : NaN;
      registros.push(registroBase({
        rec,
        chain,
        authChain: chain === "_" ? null : chain,
        resname: linha.substring(17, 20).trim().toUpperCase(),
        seq,
        seqFonte: seq == null ? "ausente" : "auth",
        icode: ic && ic !== " " ? ic.toUpperCase() : "",
        num: linha.substring(22, 27).trim(),
        altloc: alt && alt !== " " ? alt.toUpperCase() : "",
        x, y, z,
        nome: linha.substring(12, 16).trim().toUpperCase(),
        elemento: linha.length >= 78 ? linha.substring(76, 78).trim().toUpperCase() : "",
        occ: Number.isFinite(occ) ? occ : null,
      }));
    }
    if (curtas) {
      diagnosticos.push({ nivel: "aviso", codigo: "pdb_linha_curta", mensagem: curtas + " linha(s) ATOM/HETATM curtas foram ignoradas." });
    }
    if (!registros.some((r) => r.rec === "ATOM" || r.rec === "HETATM")) {
      return { erro: "PDB sem coordenadas: nenhuma linha ATOM ou HETATM utilizável. O arquivo não foi reinterpretado." };
    }
    return { registros };
  }

  function registroBase(p) {
    return {
      rec: p.rec || "ATOM",
      chain: p.chain || "_",
      authChain: p.authChain == null ? null : p.authChain,
      labelChain: p.labelChain == null ? null : p.labelChain,
      resname: p.resname || "",
      seq: p.seq == null ? null : p.seq,
      seqFonte: p.seqFonte || "ausente",
      labelSeq: p.labelSeq == null ? null : p.labelSeq,
      icode: p.icode || "",
      num: p.num == null ? "" : p.num,
      altloc: p.altloc || "",
      x: p.x == null ? null : p.x,
      y: p.y == null ? null : p.y,
      z: p.z == null ? null : p.z,
      nome: p.nome || "",
      elemento: p.elemento || "",
      occ: p.occ == null ? null : p.occ,
      entity: p.entity == null ? null : p.entity,
      modelo: p.modelo == null ? null : p.modelo,
    };
  }

  function registrosCif(block, diagnosticos) {
    const rows = linhasLoop(block, "_atom_site");
    if (!rows.length) return { erro: "mmCIF sem linhas em _atom_site. Não li o arquivo como se fosse PDB." };
    const keys = Object.keys(rows[0]);
    const tem = (suf) => keys.some((k) => k.endsWith("." + suf));
    if (!tem("cartn_x") || !tem("cartn_y") || !tem("cartn_z")) {
      return { erro: "mmCIF _atom_site sem Cartn_x, Cartn_y e Cartn_z. Não completei coordenadas por aproximação." };
    }
    if (!tem("auth_comp_id") && !tem("label_comp_id")) {
      return { erro: "mmCIF _atom_site sem auth_comp_id nem label_comp_id." };
    }
    if (!tem("auth_asym_id") && !tem("label_asym_id")) {
      return { erro: "mmCIF _atom_site sem auth_asym_id nem label_asym_id." };
    }
    if (!tem("auth_seq_id") && !tem("label_seq_id")) {
      return { erro: "mmCIF _atom_site sem auth_seq_id nem label_seq_id." };
    }
    if (!tem("group_pdb")) {
      return { erro: "mmCIF _atom_site sem group_PDB. A leitura parou para não tratar toda linha como ATOM." };
    }
    const todos = [];
    const modelos = new Set();
    const temColunaModelo = tem("pdbx_pdb_model_num");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const groupRaw = limpo(campo(row, "group_pdb"));
      const group = groupRaw ? groupRaw.toUpperCase() : "";
      if (group !== "ATOM" && group !== "HETATM" && group !== "TER") {
        return { erro: "mmCIF _atom_site com group_PDB inválido na linha " + (i + 1) + (group ? " (" + group + ")" : "") + ". A leitura parou para não deslocar colunas." };
      }
      if (group !== "TER") {
        const x = numero(campo(row, "cartn_x"));
        const y = numero(campo(row, "cartn_y"));
        const z = numero(campo(row, "cartn_z"));
        if (x == null || y == null || z == null) {
          return { erro: "mmCIF _atom_site com coordenada não numérica na linha " + (i + 1) + ". A leitura parou para não aceitar um loop deslocado." };
        }
      }
      if (group === "TER") continue;
      const modeloLido = inteiro(campo(row, "pdbx_pdb_model_num"));
      const modelo = modeloLido == null ? 1 : modeloLido;
      modelos.add(modelo);
      todos.push({ row, group, modelo });
    }
    if (!todos.length) return { erro: "mmCIF _atom_site não tem ATOM nem HETATM." };
    const selecionado = Math.min(...modelos);
    const registros = [];
    let semSeq = 0;
    for (const item of todos) {
      if (item.modelo !== selecionado) continue;
      const row = item.row;
      const authChain = limpo(campo(row, "auth_asym_id"));
      const labelChain = limpo(campo(row, "label_asym_id"));
      const authComp = limpo(campo(row, "auth_comp_id"));
      const labelComp = limpo(campo(row, "label_comp_id"));
      const authSeq = inteiro(campo(row, "auth_seq_id"));
      const labelSeq = inteiro(campo(row, "label_seq_id"));
      const seq = authSeq != null ? authSeq : labelSeq;
      const icode = (limpo(campo(row, "pdbx_pdb_ins_code")) || "").toUpperCase();
      const alt = limpo(campo(row, "label_alt_id"));
      const x = numero(campo(row, "cartn_x"));
      const y = numero(campo(row, "cartn_y"));
      const z = numero(campo(row, "cartn_z"));
      if (seq == null) semSeq += 1;
      const nome = (limpo(campo(row, "auth_atom_id")) || limpo(campo(row, "label_atom_id")) || "").toUpperCase();
      registros.push(registroBase({
        rec: item.group,
        chain: authChain || labelChain || "_",
        authChain,
        labelChain,
        resname: (authComp || labelComp || "").toUpperCase(),
        seq,
        seqFonte: authSeq != null ? "auth" : (labelSeq != null ? "label" : "ausente"),
        labelSeq,
        icode,
        num: seq == null ? "" : String(seq) + icode,
        altloc: alt ? alt.toUpperCase() : "",
        x, y, z,
        nome,
        elemento: (limpo(campo(row, "type_symbol")) || "").toUpperCase(),
        occ: numero(campo(row, "occupancy")),
        entity: limpo(campo(row, "label_entity_id")),
        modelo: item.modelo,
      }));
    }
    if (semSeq) diagnosticos.push({ nivel: "aviso", codigo: "cif_sem_seq", mensagem: semSeq + " átomo(s) sem auth_seq_id e sem label_seq_id inteiros. Não numerei esses átomos." });
    return {
      registros,
      modelo: {
        selecionado,
        total: modelos.size,
        criterio: temColunaModelo ? "menor pdbx_PDB_model_num presente em _atom_site" : "sem pdbx_PDB_model_num; um modelo",
      },
    };
  }

  function metaPdb(linhas) {
    let id = null;
    let classificacao = null;
    const titulo = [];
    const metodo = [];
    const organismos = [];
    let resolucao = null;
    for (const l of linhas) {
      if (l.startsWith("HEADER")) {
        classificacao = l.substring(10, 50).trim() || classificacao;
        const codigo = l.length >= 66 ? l.substring(62, 66).trim() : "";
        if (codigo) id = codigo;
      } else if (l.startsWith("TITLE ")) {
        titulo.push(l.substring(10).trim());
      } else if (l.startsWith("EXPDTA")) {
        metodo.push(l.substring(6).trim());
      } else if (l.startsWith("REMARK   2 RESOLUTION")) {
        const m = l.match(/([\d.]+)\s*ANGSTROM/i);
        if (m) resolucao = parseFloat(m[1]);
      } else if (l.startsWith("SOURCE")) {
        const m = l.match(/ORGANISM_SCIENTIFIC:\s*(.+?);?\s*$/);
        if (m && !organismos.includes(m[1].trim())) organismos.push(m[1].trim());
      }
    }
    return {
      id,
      classificacao: classificacao || null,
      titulo: titulo.join(" ").replace(/\s+/g, " ").trim() || null,
      metodo: metodo.join(" ").replace(/\s+/g, " ").trim() || null,
      resolucao: Number.isFinite(resolucao) ? resolucao : null,
      resolucaoOrigem: Number.isFinite(resolucao) ? "REMARK 2" : null,
      organismos,
    };
  }

  function metaCif(block, nomeBloco, diagnosticos) {
    const primeiro = (tag) => {
      for (const v of valores(block, tag)) {
        const s = limpo(v);
        if (s) return s;
      }
      return null;
    };
    const metodos = valores(block, "_exptl.method").map(limpo).filter(Boolean);
    let resolucao = null;
    let origem = null;
    for (const tag of ["_refine.ls_d_res_high", "_reflns.d_resolution_high", "_em_3d_reconstruction.resolution"]) {
      const nums = valores(block, tag).map(numero).filter((n) => n != null && n > 0);
      if (nums.length) {
        resolucao = nums[0];
        origem = tag;
        if (nums.length > 1 && nums.some((n) => n !== nums[0])) {
          diagnosticos.push({ nivel: "info", codigo: "resolucao_multipla", mensagem: "Há mais de um valor em " + tag + ". A visão geral mostra o primeiro (" + nums[0] + ")." });
        }
        break;
      }
    }
    const organismos = [];
    for (const tag of ["_entity_src_gen.pdbx_gene_src_scientific_name", "_entity_src_nat.pdbx_organism_scientific", "_entity_src_nat.pdbx_organism_scientific_name"]) {
      for (const v of valores(block, tag).map(limpo).filter(Boolean)) {
        if (!organismos.includes(v)) organismos.push(v);
      }
    }
    return {
      id: primeiro("_entry.id") || nomeBloco || null,
      classificacao: primeiro("_struct_keywords.pdbx_keywords"),
      titulo: primeiro("_struct.title"),
      metodo: metodos.join("; ") || null,
      resolucao,
      resolucaoOrigem: origem,
      organismos,
    };
  }

  function parseDbref(linhas, diagnosticos) {
    const decls = [];
    let longo = false;
    for (const l of linhas) {
      if (l.startsWith("DBREF1") || l.startsWith("DBREF2")) { longo = true; continue; }
      if (!l.startsWith("DBREF ")) continue;
      const chain = l.charAt(12);
      const beg = parseInt(l.substring(14, 18), 10);
      const end = parseInt(l.substring(20, 24), 10);
      const dbb = parseInt(l.substring(55, 60), 10);
      const dbe = parseInt(l.substring(62, 67), 10);
      const ib = l.charAt(18);
      const ie = l.charAt(24);
      decls.push({
        fonte: "DBREF",
        db: l.substring(26, 32).trim() || null,
        accession: l.substring(33, 41).trim() || null,
        cadeiaAuth: !chain || chain === " " ? "_" : chain,
        pdbInicio: Number.isFinite(beg) ? beg : null,
        pdbFim: Number.isFinite(end) ? end : null,
        pdbIcodeInicio: ib && ib !== " " ? ib : "",
        pdbIcodeFim: ie && ie !== " " ? ie : "",
        dbInicio: Number.isFinite(dbb) ? dbb : null,
        dbFim: Number.isFinite(dbe) ? dbe : null,
      });
    }
    if (longo) {
      diagnosticos.push({ nivel: "info", codigo: "dbref_longo", mensagem: "DBREF1/DBREF2 não é lido nesta versão. Nenhum acesso longo foi convertido em correspondência de resíduos." });
    }
    return decls;
  }

  function parseFaixaModelos(linha) {
    const m = linha.match(/MODELS\s+(.+)$/);
    if (!m) return [];
    const nums = [];
    for (const parte of m[1].split(",")) {
      const p = parte.trim();
      const faixa = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (faixa) {
        let a = parseInt(faixa[1], 10);
        let b = parseInt(faixa[2], 10);
        if (b < a) { const t = a; a = b; b = t; }
        const limite = Math.min(b, a + 500);
        for (let n = a; n <= limite; n++) nums.push(n);
      } else if (/^\d+$/.test(p)) nums.push(parseInt(p, 10));
    }
    return nums;
  }

  function parseRemark465(linhas) {
    let exaustivo = false;
    let modelos = null;
    const itens = [];
    for (const l of linhas) {
      if (!l.startsWith("REMARK 465")) continue;
      if (l.includes("MISSING RESIDUES")) exaustivo = true;
      if (l.includes("MODELS")) { modelos = parseFaixaModelos(l); continue; }
      if (l.length < 26) continue;
      const res = l.substring(15, 18).trim().toUpperCase();
      if (!/^[A-Z0-9]{3}$/.test(res) || res === "RES") continue;
      const seqTxt = l.substring(21, 26).trim();
      if (!/^-?\d+$/.test(seqTxt)) continue;
      const chainCh = l.charAt(19);
      const ic = l.length > 26 && l.charAt(26) !== " " ? l.charAt(26).toUpperCase() : "";
      const modelTxt = l.substring(12, 15).trim();
      itens.push({
        resname: res,
        chain: !chainCh || chainCh === " " ? "_" : chainCh,
        seq: parseInt(seqTxt, 10),
        icode: ic,
        modelo: /^\d+$/.test(modelTxt) ? parseInt(modelTxt, 10) : null,
        modelosBloco: modelos ? modelos.slice() : null,
      });
    }
    return { exaustivo, itens };
  }

  function remarkDoModelo(parsed, modelo) {
    return parsed.itens.filter((it) => {
      if (it.modelosBloco && it.modelosBloco.length) return it.modelosBloco.includes(modelo);
      if (it.modelo != null) return it.modelo === modelo;
      return true;
    });
  }

  function parseSeqres(linhas) {
    const map = new Map();
    const informado = {};
    for (const l of linhas) {
      if (!l.startsWith("SEQRES")) continue;
      const chain = l.charAt(11) === " " ? "_" : l.charAt(11);
      const n = parseInt(l.substring(13, 17), 10);
      if (!map.has(chain)) map.set(chain, []);
      if (Number.isFinite(n)) informado[chain] = n;
      const parte = l.length > 19 ? l.substring(19) : "";
      for (let i = 0; i + 3 <= parte.length; i += 4) {
        const nome = parte.substring(i, i + 3).trim().toUpperCase();
        if (nome && /^[A-Z0-9]{1,3}$/.test(nome)) map.get(chain).push(nome);
      }
    }
    return [...map.entries()].map(([chain, seq]) => ({
      chain,
      seq,
      informado: informado[chain] == null ? null : informado[chain],
      contagemConfere: informado[chain] == null || informado[chain] === seq.length,
    }));
  }

  function parseEsquema(block) {
    if (!temCategoria(block, "_pdbx_poly_seq_scheme")) return { presente: false, itens: [] };
    const itens = registrosCategoria(block, "_pdbx_poly_seq_scheme").map((row) => {
      const ins = limpo(row.pdb_ins_code);
      return {
        chain: limpo(row.pdb_strand_id) || limpo(row.asym_id) || "_",
        labelChain: limpo(row.asym_id),
        seq: inteiro(row.auth_seq_num),
        icode: ins ? ins.toUpperCase() : "",
        resname: (limpo(row.auth_mon_id) || limpo(row.mon_id) || "").toUpperCase(),
        observado: limpo(row.pdb_mon_id) != null,
        labelSeq: inteiro(row.seq_id),
      };
    });
    return { presente: true, itens };
  }

  function parseUnobs(block) {
    const cat = "_pdbx_unobs_or_zero_occ_residues";
    if (!temCategoria(block, cat)) return { presente: false, itens: [] };
    const itens = registrosCategoria(block, cat).map((row) => {
      const ins = limpo(row.pdb_ins_code);
      return {
        modelo: inteiro(row.pdb_model_num),
        flag: limpo(row.occupancy_flag),
        chain: limpo(row.auth_asym_id) || "_",
        labelChain: limpo(row.label_asym_id),
        resname: (limpo(row.auth_comp_id) || limpo(row.label_comp_id) || "").toUpperCase(),
        seq: inteiro(row.auth_seq_id),
        icode: ins ? ins.toUpperCase() : "",
        labelSeq: inteiro(row.label_seq_id),
      };
    });
    return { presente: true, itens };
  }

  function declaracoesCif(block) {
    const refs = registrosCategoria(block, "_struct_ref");
    const seqs = registrosCategoria(block, "_struct_ref_seq");
    const refPorId = new Map();
    refs.forEach((r, i) => refPorId.set(limpo(r.id) || String(i + 1), r));
    const decls = [];
    if (!seqs.length) {
      for (const r of refs) {
        const db = limpo(r.db_name);
        const acc = limpo(r.pdbx_db_accession) || limpo(r.db_code);
        if (!db && !acc) continue;
        decls.push({
          fonte: "_struct_ref",
          db,
          accession: limpo(r.pdbx_db_accession),
          cadeiaAuth: null,
          pdbInicio: inteiro(r.pdbx_align_begin),
          pdbFim: inteiro(r.pdbx_align_end),
          pdbIcodeInicio: "",
          pdbIcodeFim: "",
          dbInicio: null,
          dbFim: null,
        });
      }
      return decls;
    }
    for (const s of seqs) {
      const ref = refPorId.get(limpo(s.ref_id) || "") || refs[0] || {};
      decls.push({
        fonte: "_struct_ref_seq",
        db: limpo(ref.db_name),
        accession: limpo(s.pdbx_db_accession) || limpo(ref.pdbx_db_accession),
        cadeiaAuth: limpo(s.pdbx_strand_id),
        pdbInicio: inteiro(s.pdbx_auth_seq_align_beg) != null ? inteiro(s.pdbx_auth_seq_align_beg) : inteiro(s.seq_align_beg),
        pdbFim: inteiro(s.pdbx_auth_seq_align_end) != null ? inteiro(s.pdbx_auth_seq_align_end) : inteiro(s.seq_align_end),
        pdbIcodeInicio: limpo(s.pdbx_seq_align_beg_ins_code) || "",
        pdbIcodeFim: limpo(s.pdbx_seq_align_end_ins_code) || "",
        dbInicio: inteiro(s.db_align_beg),
        dbFim: inteiro(s.db_align_end),
      });
    }
    return decls;
  }

  function entidadesDe(block) {
    const map = new Map();
    for (const e of registrosCategoria(block, "_entity")) {
      const id = limpo(e.id);
      if (!id) continue;
      map.set(id, { id, type: limpo(e.type), descricao: limpo(e.pdbx_description), poly: null });
    }
    for (const p of registrosCategoria(block, "_entity_poly")) {
      const id = limpo(p.entity_id);
      if (!id) continue;
      const cur = map.get(id) || { id, type: null, descricao: null, poly: null };
      cur.poly = limpo(p.type);
      map.set(id, cur);
    }
    return map;
  }

  function quimicosDe(block) {
    const map = new Map();
    for (const r of registrosCategoria(block, "_chem_comp")) {
      const id = limpo(r.id);
      if (!id) continue;
      map.set(id.toUpperCase(), { type: limpo(r.type), name: limpo(r.name) });
    }
    return map;
  }

  function analiseClassica(registros) {
    const cadeias = [];
    const vistoC = new Set();
    for (const r of registros) {
      if (!vistoC.has(r.chain)) { vistoC.add(r.chain); cadeias.push(r.chain); }
    }
    const residuosPorCadeia = {};
    for (const c of cadeias) residuosPorCadeia[c] = [];
    const vistoR = new Set();
    for (const r of registros) {
      if (r.rec !== "ATOM" || !r.num) continue;
      const chave = r.chain + "|" + r.resname + "|" + r.num;
      if (vistoR.has(chave)) continue;
      vistoR.add(chave);
      residuosPorCadeia[r.chain].push([r.resname, r.num]);
    }
    const por = {};
    for (const r of registros) {
      if (r.rec !== "ATOM" || !r.num) continue;
      const d = por[r.chain] || (por[r.chain] = { atomos: 0, residuos: new Set(), aa: new Set() });
      d.atomos += 1;
      d.residuos.add(r.num);
      if (AA.has(r.resname)) d.aa.add(r.resname);
    }
    const statsCadeias = Object.keys(por).sort().map((cid) => ({
      cadeia: cid,
      atomos: por[cid].atomos,
      residuos: por[cid].residuos.size,
      aminoacidos_diferentes: por[cid].aa.size,
    }));
    let maior = null;
    let menor = null;
    if (statsCadeias.length) {
      maior = statsCadeias.reduce((a, b) => (b.residuos > a.residuos ? b : a));
      menor = statsCadeias.reduce((a, b) => (b.residuos < a.residuos ? b : a));
    }
    const frequencias = {};
    const sequencias = {};
    for (const cid of cadeias) {
      const contagem = {};
      for (const aa of AA) contagem[aa] = 0;
      for (const [nome] of residuosPorCadeia[cid]) {
        if (Object.prototype.hasOwnProperty.call(contagem, nome)) contagem[nome] += 1;
      }
      const total = Object.values(contagem).reduce((s, v) => s + v, 0);
      frequencias[cid] = {
        total,
        itens: [...AA].map((aa) => ({
          aa,
          contagem: contagem[aa],
          porcentagem: total ? Math.round((10000 * contagem[aa]) / total) / 100 : 0,
        })),
      };
      sequencias[cid] = residuosPorCadeia[cid].map(([nome]) => TRES_PARA_UMA[nome] || "X").join("");
    }
    return {
      cadeias,
      estatisticas: { cadeias: statsCadeias, maior, menor },
      frequencias,
      sequencias,
      residuosPorCadeia,
    };
  }

  function buscarMotivo(residuosPorCadeia, motivo) {
    const lista = (Array.isArray(motivo) ? motivo : String(motivo || "").split(/[-,\s]+/))
      .map((m) => String(m).trim().toUpperCase())
      .filter(Boolean);
    const ocorrencias = [];
    if (!lista.length || !residuosPorCadeia) return ocorrencias;
    const n = lista.length;
    for (const cid of Object.keys(residuosPorCadeia)) {
      const seq = residuosPorCadeia[cid] || [];
      for (let i = 0; i <= seq.length - n; i++) {
        let bate = true;
        for (let k = 0; k < n; k++) if (seq[i + k][0] !== lista[k]) { bate = false; break; }
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

  function classePosicao(pos, entidades) {
    const ent = pos.entity && entidades ? entidades.get(String(pos.entity)) : null;
    const res = pos.resname;
    if (AGUAS.has(res)) return "agua";
    if (pos.soHet && IONS.has(res)) return "ion";
    if (ent && ent.type === "water") return "agua";
    if (ent && ent.poly && /polypeptide/i.test(ent.poly)) {
      return AA.has(res) ? "proteina" : "proteina-modificada";
    }
    if (ent && ent.poly && /nucleotide/i.test(ent.poly)) return "outro-polimero";
    if (AA.has(res)) return "proteina";
    if (MODIFICADOS.has(res)) return "proteina-modificada";
    if (TERMINAIS.has(res)) return "terminal";
    if (NUCLEOTIDEOS.has(res)) return "outro-polimero";
    if (pos.temAtom) return "nao-classificado";
    return "hetero";
  }

  function agrupar(registros, entidades) {
    const ordem = [];
    const map = new Map();
    for (const r of registros) {
      if ((r.rec !== "ATOM" && r.rec !== "HETATM") || r.seq == null) continue;
      const key = r.chain + "|" + r.seq + "|" + (r.icode || "");
      let p = map.get(key);
      if (!p) {
        p = {
          key, chain: r.chain, authChain: r.authChain, labelChain: r.labelChain,
          seq: r.seq, icode: r.icode || "", labelSeq: r.labelSeq, resnames: [],
          atomos: [], temAtom: false, soHet: true, entity: r.entity, coords: false,
        };
        map.set(key, p);
        ordem.push(p);
      }
      if (r.resname && !p.resnames.includes(r.resname)) p.resnames.push(r.resname);
      if (r.rec === "ATOM") { p.temAtom = true; p.soHet = false; }
      if (!p.entity && r.entity) p.entity = r.entity;
      if (r.labelSeq != null) p.labelSeq = r.labelSeq;
      p.atomos.push(r);
      if (r.x != null && r.y != null && r.z != null) p.coords = true;
    }
    for (const p of ordem) {
      const base = p.atomos.find((a) => a.rec === "ATOM") || p.atomos[0];
      p.resname = base.resname;
      p.altlocs = [...new Set(p.atomos.map((a) => a.altloc).filter(Boolean))];
      p.classe = classePosicao(p, entidades);
    }
    return ordem;
  }

  function dpAlinhar(obs, seq) {
    const n = obs.length;
    const m = seq.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
    for (let j = 0; j <= m; j++) dp[0][j] = 1;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        let w = dp[i][j - 1];
        if (obs[i - 1] === seq[j - 1]) w += dp[i - 1][j - 1];
        dp[i][j] = w > 2 ? 2 : w;
      }
    }
    return dp;
  }

  function reconstruirSeqres(obsPos, seq) {
    const obs = obsPos.map((p) => p.resname);
    const dp = dpAlinhar(obs, seq);
    if (dp[obs.length][seq.length] !== 1) return null;
    const match = new Array(seq.length).fill(null);
    let i = obs.length;
    let j = seq.length;
    while (j > 0) {
      const podeCasar = i > 0 && obs[i - 1] === seq[j - 1] && dp[i - 1][j - 1] > 0;
      const podePular = dp[i][j - 1] > 0;
      if (podeCasar && !podePular) { match[j - 1] = obsPos[i - 1]; i -= 1; j -= 1; }
      else if (podePular && !podeCasar) j -= 1;
      else return null;
    }
    if (i !== 0) return null;
    return match;
  }

  function avaliarSeqres(seqres, posicoes) {
    if (!seqres.contagemConfere) {
      return { usavel: false, detalhe: "O numRes da SEQRES não confere com os nomes lidos nessa cadeia.", faltantes: [] };
    }
    const nomes = new Set(seqres.seq);
    const vistos = new Set();
    const obs = [];
    for (const p of posicoes) {
      if (p.chain !== seqres.chain || !p.coords || p.seq == null) continue;
      const polimerico = p.classe === "proteina" || p.classe === "proteina-modificada" || p.classe === "terminal" || nomes.has(p.resname);
      if (!polimerico) continue;
      if (!nomes.has(p.resname)) {
        return {
          usavel: false,
          detalhe: "Há resíduo com coordenadas (" + p.resname + ") que não está na SEQRES. Possível modificação ou incompatibilidade; a SEQRES não foi usada para nomear ausências nem para inventar numeração.",
          faltantes: [],
        };
      }
      if (vistos.has(p.key)) continue;
      vistos.add(p.key);
      obs.push(p);
    }
    const ways = dpAlinhar(obs.map((p) => p.resname), seqres.seq)[obs.length][seqres.seq.length];
    if (ways === 0) return { usavel: false, detalhe: "As coordenadas não formam uma subsequência da SEQRES.", faltantes: [] };
    if (ways !== 1) return { usavel: false, detalhe: "Há mais de um alinhamento possível com a SEQRES.", faltantes: [] };
    const match = reconstruirSeqres(obs, seqres.seq);
    if (!match) return { usavel: false, detalhe: "O alinhamento único não pôde ser reconstruído.", faltantes: [] };
    const faltantes = [];
    for (let i = 0; i < match.length; i++) {
      if (match[i]) continue;
      faltantes.push({ chain: seqres.chain, resname: seqres.seq[i], seqIndex: i + 1 });
    }
    return {
      usavel: true,
      detalhe: "Alinhamento único com a SEQRES. Posições ausentes não recebem numeração author calculada.",
      faltantes,
    };
  }

  function cmpPos(a, b) {
    if (a.seq !== b.seq) return a.seq - b.seq;
    if ((a.icode || "") === (b.icode || "")) return 0;
    if (!a.icode) return -1;
    if (!b.icode) return 1;
    return a.icode < b.icode ? -1 : 1;
  }

  function chavePos(chain, seq, icode) {
    return chain + "|" + seq + "|" + (icode || "");
  }

  function representante(pos) {
    const atoms = pos.atomos.filter((a) => a.x != null && a.y != null && a.z != null);
    atoms.sort((a, b) => {
      const nota = (x) => (x.altloc ? 2 : 0) + (x.nome === "CA" || x.nome === "C4'" ? 0 : 1);
      return nota(a) - nota(b);
    });
    return atoms[0] || null;
  }

  function diagnosticarNaoObservados(fontes, modeloSelecionado, presentes, divergencias, ocupacaoZero, adicionar) {
    if (fontes.unobs.presente) {
      for (const it of fontes.unobs.itens) {
        if (it.modelo != null && it.modelo !== modeloSelecionado) continue;
        if (it.seq == null) {
          divergencias.push("Há resíduo em _pdbx_unobs_or_zero_occ_residues sem auth_seq_id inteiro. Ele não foi numerado por aproximação.");
          continue;
        }
        if (it.flag === "0") {
          ocupacaoZero.push({
            cadeiaAuth: it.chain,
            cadeiaLabel: it.labelChain,
            resname: it.resname,
            authSeq: it.seq,
            icode: it.icode || "",
            labelSeq: it.labelSeq,
            modelo: it.modelo,
            temCoordenadas: presentes.has(chavePos(it.chain, it.seq, it.icode)),
            origem: "pdbx_unobs_or_zero_occ_residues",
            tipo: "ocupacao_zero",
          });
          continue;
        }
        if (it.flag !== "1") {
          divergencias.push("occupancy_flag fora de 0 ou 1 em _pdbx_unobs_or_zero_occ_residues. Essa linha não entrou na lista.");
          continue;
        }
        adicionar({
          chain: it.chain, seq: it.seq, icode: it.icode || "", resname: it.resname,
          labelChain: it.labelChain, labelSeq: it.labelSeq,
          origem: new Set(["pdbx_unobs_or_zero_occ_residues"]),
          tipo: "nao_observado",
          avisoCoordenada: "A categoria de não observados cita " + it.resname + " " + it.chain + " " + it.seq + ", mas há coordenadas nesse número.",
        });
      }
    }
  }

  function adicionarAusentesRemark(fontes, adicionar) {
    for (const it of fontes.remarkItens) {
      adicionar({
        chain: it.chain, seq: it.seq, icode: it.icode || "", resname: it.resname,
        labelChain: null, labelSeq: null,
        origem: new Set(["remark465"]),
        tipo: "nao_observado",
        avisoCoordenada: "REMARK 465 cita " + it.resname + " " + it.chain + " " + it.seq + ", mas há coordenadas nesse número.",
      });
    }
  }

  function diagnosticarEsquemaSequencia(fontes, presentes, divergencias, adicionar) {
    if (fontes.scheme.presente) {
      for (const it of fontes.scheme.itens) {
        if (it.seq == null) {
          if (!it.observado) divergencias.push("O esquema de sequência tem resíduo não observado sem auth_seq_num. O número author não foi inventado.");
          continue;
        }
        const k = chavePos(it.chain, it.seq, it.icode);
        if (it.observado && !presentes.has(k)) {
          adicionar({
            chain: it.chain, seq: it.seq, icode: it.icode || "", resname: it.resname,
            labelChain: it.labelChain, labelSeq: it.labelSeq,
            origem: new Set(["pdbx_poly_seq_scheme"]),
            tipo: "nao_observado",
            avisoCoordenada: "",
          });
          divergencias.push("_pdbx_poly_seq_scheme marca " + it.resname + " " + it.chain + " " + it.seq + " como observado, mas o modelo selecionado não tem essas coordenadas.");
          continue;
        }
        if (!it.observado) {
          adicionar({
            chain: it.chain, seq: it.seq, icode: it.icode || "", resname: it.resname,
            labelChain: it.labelChain, labelSeq: it.labelSeq,
            origem: new Set(["pdbx_poly_seq_scheme"]),
            tipo: "nao_observado",
            avisoCoordenada: "O esquema marca " + it.resname + " " + it.chain + " " + it.seq + " como ausente, mas há coordenadas nesse número.",
          });
        }
      }
    }
  }

  function diagnosticarSeqres(fontes, posicoes, candidatos, divergencias, adicionar) {
    const seqresInfo = new Map();
    for (const sq of fontes.seqres) {
      const aval = avaliarSeqres(sq, posicoes);
      seqresInfo.set(sq.chain, aval);
      if (!aval.usavel) continue;
      const remarkChain = candidatos
        .filter((c) => c.chain === sq.chain && c.origem.has("remark465") && c.seq != null)
        .sort(cmpPos);
      const mesmosNomes = remarkChain.map((c) => c.resname).join(",") === aval.faltantes.map((f) => f.resname).join(",");
      if (fontes.remark.exaustivo && remarkChain.length && mesmosNomes) {
        remarkChain.forEach((c, i) => {
          c.origem.add("seqres");
          c.seqIndex = aval.faltantes[i].seqIndex;
        });
        continue;
      }
      if (fontes.remark.exaustivo && remarkChain.length && !mesmosNomes) {
        divergencias.push("Cadeia " + sq.chain + ": a SEQRES e o REMARK 465 não listam os mesmos nomes na mesma ordem. A SEQRES não recebeu numeração author.");
      }
      for (const f of aval.faltantes) {
        adicionar({
          chain: f.chain,
          seq: null,
          seqIndex: f.seqIndex,
          icode: "",
          resname: f.resname,
          labelChain: null,
          labelSeq: null,
          origem: new Set(["seqres"]),
          tipo: "nao_observado",
          avisoCoordenada: "",
        });
      }
    }
    return seqresInfo;
  }

  function diagnosticarCoberturaCadeias(posicoes, fontes, seqresInfo) {
    const classesPolimero = new Set(["proteina", "proteina-modificada", "outro-polimero", "terminal"]);
    const cadeias = new Set();
    for (const p of posicoes) if (classesPolimero.has(p.classe)) cadeias.add(p.chain);
    for (const sq of fontes.seqres) cadeias.add(sq.chain);
    for (const it of fontes.scheme.itens) cadeias.add(it.chain);

    const porCadeia = [];
    for (const chain of cadeias) {
      let motivo = "sem fonte explícita para esta cadeia";
      let coberto = false;
      if (fontes.remark.exaustivo) { coberto = true; motivo = "REMARK 465, seção MISSING RESIDUES"; }
      else if (fontes.unobs.presente) { coberto = true; motivo = "_pdbx_unobs_or_zero_occ_residues"; }
      else if (fontes.scheme.presente && fontes.scheme.itens.some((i) => i.chain === chain)) { coberto = true; motivo = "_pdbx_poly_seq_scheme"; }
      else if (seqresInfo.get(chain) && seqresInfo.get(chain).usavel) { coberto = true; motivo = "SEQRES"; }
      else if (seqresInfo.get(chain)) motivo = seqresInfo.get(chain).detalhe;
      porCadeia.push({ cadeia: chain, coberto, motivo });
    }
    return { classesPolimero, cadeias, porCadeia };
  }

  function diagnosticarSaltosNumeracao(posicoes, classesPolimero, cadeias, porCadeia, candidatos) {
    const saltos = [];
    for (const chain of cadeias) {
      const coberto = porCadeia.find((c) => c.cadeia === chain).coberto;
      const obs = posicoes
        .filter((p) => p.chain === chain && p.coords && p.seq != null && classesPolimero.has(p.classe))
        .slice()
        .sort(cmpPos);
      for (let i = 1; i < obs.length; i++) {
        const a = obs[i - 1];
        const b = obs[i];
        if (b.seq <= a.seq + 1) continue;
        const livres = [];
        for (let n = a.seq + 1; n < b.seq; n++) {
          if (!candidatos.some((c) => c.chain === chain && c.seq === n && !c.icode)) livres.push(n);
        }
        if (!livres.length) continue;
        saltos.push({
          cadeia: chain,
          de: { resname: a.resname, seq: a.seq, icode: a.icode || "" },
          para: { resname: b.resname, seq: b.seq, icode: b.icode || "" },
          inteirosSemResiduoDeclarado: livres,
          interpretacao: coberto ? "salto_de_numeracao" : "nao_determinado",
        });
      }
    }
    return saltos;
  }

  function listarResiduosNaoResolvidos(candidatos) {
    const naoResolvidos = candidatos
      .slice()
      .sort((a, b) => {
        if (a.chain !== b.chain) return a.chain < b.chain ? -1 : 1;
        if (a.seq != null && b.seq != null) return cmpPos(a, b);
        if (a.seq != null) return -1;
        if (b.seq != null) return 1;
        return (a.seqIndex || 0) - (b.seqIndex || 0);
      })
      .map((c) => ({
        cadeiaAuth: c.chain,
        cadeiaLabel: c.labelChain,
        resname: c.resname,
        authSeq: c.seq == null ? null : c.seq,
        numeracaoAuthor: c.seq == null ? "nao_depositada" : "depositada",
        seqIndex: c.seqIndex == null ? null : c.seqIndex,
        icode: c.icode || "",
        labelSeq: c.labelSeq == null ? null : c.labelSeq,
        origem: [...c.origem].sort(),
        tipo: c.tipo,
      }));
    return naoResolvidos;
  }

  function diagnosticarProximidadeFlanqueadores(posicoes, classesPolimero, candidatos) {
    const proximidade = [];
    const obsPol = posicoes.filter((p) => p.coords && classesPolimero.has(p.classe) && p.seq != null);
    const porChain = new Map();
    for (const c of candidatos) {
      if (c.seq == null) continue;
      if (!porChain.has(c.chain)) porChain.set(c.chain, []);
      porChain.get(c.chain).push(c);
    }
    for (const [chain, lista] of porChain) {
      lista.sort(cmpPos);
      let seg = [];
      const fechar = () => {
        if (!seg.length) return;
        const primeiro = seg[0];
        const ultimo = seg[seg.length - 1];
        const anteriores = obsPol.filter((p) => p.chain === chain && cmpPos(p, primeiro) < 0).sort(cmpPos);
        const posteriores = obsPol.filter((p) => p.chain === chain && cmpPos(p, ultimo) > 0).sort(cmpPos);
        const prev = anteriores.length ? anteriores[anteriores.length - 1] : null;
        const next = posteriores.length ? posteriores[0] : null;
        if (prev && next) {
          const ap = representante(prev);
          const an = representante(next);
          if (ap && an) {
            const d = Math.hypot(ap.x - an.x, ap.y - an.y, ap.z - an.z);
            proximidade.push({
              cadeia: chain,
              residuosAusentes: seg.map((s) => ({ resname: s.resname, authSeq: s.seq, icode: s.icode || "" })),
              flanqueadorAnterior: { resname: prev.resname, authSeq: prev.seq, icode: prev.icode || "", atomo: ap.nome },
              flanqueadorPosterior: { resname: next.resname, authSeq: next.seq, icode: next.icode || "", atomo: an.nome },
              distanciaA: Math.round(d * 1000) / 1000,
              rotulo: "Distância entre átomos dos resíduos flanqueadores que têm coordenadas. Não é distância do resíduo ausente. Nenhuma coordenada foi reconstruída.",
            });
          }
        }
        seg = [];
      };
      for (const item of lista) {
        if (!seg.length) { seg.push(item); continue; }
        const prev = seg[seg.length - 1];
        const noMeio = obsPol.some((p) => p.chain === chain && cmpPos(p, prev) > 0 && cmpPos(p, item) < 0);
        if (noMeio) fechar();
        seg.push(item);
      }
      fechar();
    }
    return proximidade;
  }

  function diagnosticar(posicoes, fontes, modeloSelecionado) {
    const presentes = new Map();
    for (const p of posicoes) {
      if (p.coords && p.seq != null) presentes.set(p.key, p);
    }
    const candidatos = [];
    const divergencias = [];
    const ocupacaoZero = [];

    function chaveItem(item) {
      if (item.seq == null) return item.chain + "|seqres|" + item.seqIndex + "|" + item.resname;
      return chavePos(item.chain, item.seq, item.icode);
    }

    function adicionar(item) {
      if (item.seq == null && item.seqIndex == null) return null;
      const k = chaveItem(item);
      if (item.seq != null && presentes.has(chavePos(item.chain, item.seq, item.icode))) {
        if (item.avisoCoordenada) divergencias.push(item.avisoCoordenada);
        return null;
      }
      const ex = candidatos.find((c) => chaveItem(c) === k && c.resname === item.resname);
      if (ex) { item.origem.forEach((o) => ex.origem.add(o)); return ex; }
      candidatos.push(item);
      return item;
    }

    diagnosticarNaoObservados(fontes, modeloSelecionado, presentes, divergencias, ocupacaoZero, adicionar);

    adicionarAusentesRemark(fontes, adicionar);

    diagnosticarEsquemaSequencia(fontes, presentes, divergencias, adicionar);

    const seqresInfo = diagnosticarSeqres(fontes, posicoes, candidatos, divergencias, adicionar);

    const { classesPolimero, cadeias, porCadeia } = diagnosticarCoberturaCadeias(posicoes, fontes, seqresInfo);

    const saltos = diagnosticarSaltosNumeracao(posicoes, classesPolimero, cadeias, porCadeia, candidatos);

    const determinado = porCadeia.length > 0 && porCadeia.every((c) => c.coberto);
    const naoResolvidos = listarResiduosNaoResolvidos(candidatos);

    const proximidade = diagnosticarProximidadeFlanqueadores(posicoes, classesPolimero, candidatos);

    const fontesLista = [
      { id: "remark465", presente: fontes.remark.itens.length > 0 || fontes.remark.exaustivo, usada: fontes.remark.exaustivo || fontes.remarkItens.length > 0, detalhe: fontes.remark.exaustivo ? "seção MISSING RESIDUES" : (fontes.remarkItens.length ? "linhas de resíduo sem a seção exaustiva" : "ausente") },
      { id: "pdbx_unobs_or_zero_occ_residues", presente: fontes.unobs.presente, usada: fontes.unobs.presente, detalhe: fontes.unobs.presente ? "categoria presente; flag 1 é não observado e flag 0 é ocupação zero" : "ausente neste formato ou arquivo" },
      { id: "pdbx_poly_seq_scheme", presente: fontes.scheme.presente, usada: fontes.scheme.presente, detalhe: fontes.scheme.presente ? "pdb_mon_id vazio conta como não observado" : "ausente" },
      { id: "seqres", presente: fontes.seqres.length > 0, usada: [...seqresInfo.values()].some((v) => v.usavel), detalhe: fontes.seqres.length ? [...seqresInfo.values()].map((v) => v.detalhe).filter((v, i, a) => a.indexOf(v) === i).join(" ") : "ausente" },
    ];

    let resumo;
    if (!porCadeia.length) {
      resumo = "Não há cadeia polimérica no modelo selecionado para diagnosticar resíduos ausentes.";
    } else if (!determinado) {
      resumo = "Não determinado. Não há fonte explícita cobrindo todas as cadeias com polímero (REMARK 465 com a seção MISSING RESIDUES, categoria mmCIF de não observados, esquema de sequência ou SEQRES com alinhamento único). Saltos de numeração não foram contados como resíduos ausentes.";
      if (naoResolvidos.length) resumo += " Há " + naoResolvidos.length + " resíduo(s) citado(s) por metadado; a lista não fecha o diagnóstico das outras cadeias.";
    } else if (!naoResolvidos.length) {
      resumo = "Nenhum resíduo não resolvido segundo a fonte explícita. Isso não avalia trechos fora do constructo e não afirma completude em relação ao UniProt.";
    } else {
      resumo = naoResolvidos.length + " resíduo(s) não resolvido(s), cada um com a origem do metadado. Nenhum deles tem coordenadas neste modelo.";
    }

    return {
      determinado,
      resumo,
      fontes: fontesLista,
      porCadeia,
      foraDoConstructo: {
        status: "nao_avaliado",
        motivo: "A sequência completa no UniProt não foi consultada. O intervalo citado em DBREF ou _struct_ref_seq não foi expandido em resíduos fora do constructo.",
      },
      naoResolvidos,
      ocupacaoZero,
      saltosNumeracao: saltos,
      proximidadeFlanqueadores: proximidade,
      divergencias: [...new Set(divergencias.filter(Boolean))],
    };
  }

  function montarComponentes(posicoes, formato, entidades, quimicos) {
    const proteinas = [];
    const modificadas = [];
    const outros = [];
    const terminais = [];
    const aguas = [];
    const ions = [];
    const hetero = [];
    const incertos = [];
    for (const p of posicoes) {
      if (p.classe === "proteina") proteinas.push(p);
      else if (p.classe === "proteina-modificada") modificadas.push(p);
      else if (p.classe === "outro-polimero") outros.push(p);
      else if (p.classe === "terminal") terminais.push(p);
      else if (p.classe === "agua") aguas.push(p);
      else if (p.classe === "ion") ions.push(p);
      else if (p.classe === "hetero") hetero.push(p);
      else incertos.push(p);
    }
    const cadeiasDe = (lista) => [...new Set(lista.map((p) => p.chain))];
    const agrupaCodigo = (lista) => {
      const map = new Map();
      for (const p of lista) {
        const cur = map.get(p.resname) || { codigo: p.resname, instancias: 0, nome: null };
        cur.instancias += 1;
        const q = quimicos && quimicos.get(p.resname);
        if (q && q.name) cur.nome = q.name;
        map.set(p.resname, cur);
      }
      return [...map.values()];
    };
    const criterioProteina = entidades && [...entidades.values()].some((e) => e.poly && /polypeptide/i.test(e.poly))
      ? "entidade mmCIF polypeptide e, na falta dela, o nome do resíduo"
      : (formato === "mmcif"
        ? "nome do resíduo; nenhuma entidade polypeptide foi lida"
        : "nome do resíduo no PDB, sem registro de entidade");
    return {
      proteinas: {
        posicoes: proteinas.length + modificadas.length,
        padrao: proteinas.length,
        modificadas: modificadas.length,
        cadeias: cadeiasDe(proteinas.concat(modificadas)),
        criterio: criterioProteina,
      },
      modificados: agrupaCodigo(modificadas).map((m) => ({
        ...m,
        leitura: "resíduo modificado na cadeia polimérica; não é ligante livre",
      })),
      outrosPolimeros: outros.length ? [{
        tipo: "nucleotideo ou polímero não peptídico, pelo nome ou pela entidade",
        posicoes: outros.length,
        cadeias: cadeiasDe(outros),
        codigos: agrupaCodigo(outros),
        criterio: "classificação pelo nome do componente ou por _entity_poly.type; não é uma atribuição biológica fechada",
      }] : [],
      terminais: { posicoes: terminais.length, codigos: agrupaCodigo(terminais), criterio: "lista parcial de grupos terminais (ACE, NH2, NME, FOR)" },
      aguas: {
        instancias: aguas.length,
        codigos: agrupaCodigo(aguas),
        nota: "Contagem de registros HOH, WAT, H2O ou DOD no modelo selecionado. Ausência de registro não significa ausência de água na amostra.",
      },
      ions: agrupaCodigo(ions).map((i) => ({ ...i, criterio: "lista parcial de códigos de íon; HETATM não prova estado holo" })),
      hetero: agrupaCodigo(hetero.concat(incertos)).map((h) => ({
        ...h,
        leitura: "não classificado: HETATM não estabelece ligante, cofator, substrato, inibidor nem estado holo",
      })),
      holo: {
        estado: "nao_determinado",
        motivo: "HETATM e o inventário de componentes não estabelecem estado holo ou apo.",
      },
    };
  }

  function cifValor(v) {
    if (v == null || v === "") return ".";
    const s = String(v);
    if (/[\s#'"]/.test(s)) return "'" + s.replace(/'/g, "") + "'";
    return s;
  }

  function textoViewerCif(registros) {
    const cols = [
      "group_PDB", "id", "type_symbol", "auth_atom_id", "label_atom_id", "label_alt_id",
      "auth_comp_id", "label_comp_id", "auth_asym_id", "label_asym_id",
      "auth_seq_id", "label_seq_id", "pdbx_PDB_ins_code",
      "Cartn_x", "Cartn_y", "Cartn_z", "occupancy", "pdbx_PDB_model_num",
    ];
    const linhas = ["data_peki_modelo", "# gerado da leitura peki-estrutura-1; só o modelo selecionado", "loop_"];
    cols.forEach((c) => linhas.push("_atom_site." + c));
    let id = 1;
    for (const r of registros) {
      if ((r.rec !== "ATOM" && r.rec !== "HETATM") || r.x == null) continue;
      const vals = [
        r.rec,
        String(id),
        r.elemento || "X",
        r.nome || "X",
        r.nome || "X",
        r.altloc || ".",
        r.resname || "UNK",
        r.resname || "UNK",
        r.authChain || (r.chain === "_" ? "." : r.chain),
        r.labelChain || r.authChain || (r.chain === "_" ? "." : r.chain),
        r.seq == null ? "." : String(r.seq),
        r.labelSeq == null ? "." : String(r.labelSeq),
        r.icode || ".",
        r.x.toFixed(3),
        r.y.toFixed(3),
        r.z.toFixed(3),
        r.occ == null ? "1.00" : r.occ.toFixed(2),
        r.modelo == null ? "1" : String(r.modelo),
      ];
      linhas.push(vals.map(cifValor).join(" "));
      id += 1;
    }
    return linhas.join("\n") + "\n";
  }

  function notaIntervalo(d) {
    if (d.dbInicio != null && d.dbInicio !== 1) {
      return "O intervalo declarado no banco não começa em 1. Os resíduos anteriores não foram listados.";
    }
    return null;
  }

  function uniprotDe(decls) {
    return {
      correspondenciaResiduo: "nao_estabelecida",
      motivo: "DBREF e _struct_ref_seq são intervalos declarados no arquivo. Esta versão não os expande em pares resíduo a resíduo e não consulta a sequência completa no UniProt.",
      declaracoes: decls.map((d) => ({ ...d, nota: notaIntervalo(d) })),
    };
  }

  function cadeiasVisao(posicoes, analise) {
    const ids = [];
    const visto = new Set();
    for (const r of posicoes) {
      if (!visto.has(r.chain)) { visto.add(r.chain); ids.push(r.chain); }
    }
    for (const c of analise.cadeias) if (!visto.has(c)) { visto.add(c); ids.push(c); }
    return ids.map((id) => {
      const doId = posicoes.filter((p) => p.chain === id);
      const atomos = doId.reduce((s, p) => s + p.atomos.filter((a) => a.rec === "ATOM").length, 0);
      const het = doId.reduce((s, p) => s + p.atomos.filter((a) => a.rec === "HETATM").length, 0);
      const polimero = doId.filter((p) => ["proteina", "proteina-modificada", "outro-polimero", "terminal"].includes(p.classe));
      const label = doId.map((p) => p.labelChain).find(Boolean) || null;
      const auth = doId.map((p) => p.authChain).find(Boolean) || (id === "_" ? null : id);
      return {
        id,
        auth,
        label,
        posicoesPolimero: polimero.length,
        posicoesComAltLoc: doId.filter((p) => p.altlocs.length).length,
        atomosAtom: atomos,
        atomosHet: het,
      };
    });
  }

  function textoVisao(est) {
    if (!est) return "";
    const L = [];
    L.push("Contrato " + est.schema + ".");
    L.push("Formato lido: " + est.formato + ".");
    L.push("Modelo " + est.modelo.selecionado + " de " + est.modelo.total + " (" + est.modelo.criterio + ").");
    const id = est.identidade;
    if (id.id) L.push("Identificador no arquivo: " + id.id + ".");
    if (id.titulo) L.push("Título: " + id.titulo + ".");
    if (id.metodo) L.push("Método: " + id.metodo + ".");
    if (id.resolucao != null) L.push("Resolução: " + id.resolucao + " Å (" + id.resolucaoOrigem + ").");
    if (id.classificacao) L.push("Classificação do arquivo: " + id.classificacao + ".");
    if (id.organismos && id.organismos.length) L.push("Organismo citado no arquivo: " + id.organismos.join("; ") + ".");
    L.push(est.lacunas.resumo);
    L.push(est.lacunas.foraDoConstructo.motivo);
    L.push(est.uniprot.motivo);
    for (const d of est.uniprot.declaracoes) {
      const intervalo = [d.db || "banco", d.accession || "sem acesso", "cadeia " + (d.cadeiaAuth || "não indicada"),
        "PDB " + (d.pdbInicio == null ? "?" : d.pdbInicio) + "-" + (d.pdbFim == null ? "?" : d.pdbFim),
        "banco " + (d.dbInicio == null ? "?" : d.dbInicio) + "-" + (d.dbFim == null ? "?" : d.dbFim)].join("; ");
      L.push("Declaração " + d.fonte + ": " + intervalo + ". Correspondência resíduo a resíduo não estabelecida.");
      if (d.nota) L.push(d.nota);
    }
    if (!est.uniprot.declaracoes.length) L.push("Nenhuma declaração DBREF ou _struct_ref neste arquivo. Mapa PDB–UniProt pendente.");
    const comp = est.componentes;
    L.push("Proteína: " + comp.proteinas.posicoes + " posição(ões) com coordenadas em " + (comp.proteinas.cadeias.join(", ") || "nenhuma cadeia") + ". " + comp.proteinas.criterio + ".");
    if (comp.proteinas.modificadas) {
      const mods = (comp.modificados || []).map((m) => m.codigo + " ×" + m.instancias).join(", ");
      L.push("Resíduos modificados na cadeia: " + comp.proteinas.modificadas + (mods ? " (" + mods + ")" : "") + ". Não são ligantes livres.");
    }
    if (comp.outrosPolimeros.length) {
      for (const o of comp.outrosPolimeros) L.push("Outro polímero: " + o.posicoes + " posição(ões). " + o.criterio + ".");
    }
    L.push("Águas registradas no modelo: " + comp.aguas.instancias + ". " + comp.aguas.nota);
    if (comp.ions.length) L.push("Íons: " + comp.ions.map((i) => i.codigo + " ×" + i.instancias).join(", ") + ". " + comp.ions[0].criterio);
    else L.push("Nenhum íon da lista parcial foi encontrado no modelo selecionado.");
    if (comp.hetero.length) L.push("Heterocomponentes de classificação biológica incerta: " + comp.hetero.map((h) => h.codigo + " ×" + h.instancias).join(", ") + ".");
    else L.push("Nenhum HETATM fora de polímero, água, íon da lista parcial e grupo terminal foi encontrado no modelo selecionado.");
    L.push(comp.holo.motivo);
    if (est.lacunas.naoResolvidos.length) {
      L.push("Resíduos não resolvidos:");
      for (const r of est.lacunas.naoResolvidos) {
        L.push("- " + r.resname + " cadeia " + r.cadeiaAuth + " " + (r.numeracaoAuthor === "nao_depositada"
          ? "posição " + r.seqIndex + " na SEQRES, numeração author não depositada"
          : r.authSeq + (r.icode || "")) + " (" + r.origem.join(", ") + ")");
      }
    }
    if (est.lacunas.saltosNumeracao.length) {
      L.push("Saltos de numeração:");
      for (const s of est.lacunas.saltosNumeracao) {
        L.push("- cadeia " + s.cadeia + " entre " + s.de.seq + " e " + s.para.seq + ": " + s.interpretacao + " (" + s.inteirosSemResiduoDeclarado.join(", ") + ")");
      }
    }
    for (const p of est.lacunas.proximidadeFlanqueadores) {
      L.push(p.rotulo + " " + p.distanciaA + " Å entre " + p.flanqueadorAnterior.resname + " " + p.flanqueadorAnterior.authSeq + " (" + p.flanqueadorAnterior.atomo + ") e " + p.flanqueadorPosterior.resname + " " + p.flanqueadorPosterior.authSeq + " (" + p.flanqueadorPosterior.atomo + ").");
    }
    for (const d of est.diagnosticos) L.push(d.mensagem);
    for (const lim of est.limitacoes) L.push(lim);
    if (est.recursos.preparo === "bloqueado") L.push(est.recursos.preparoMotivo);
    return L.join("\n");
  }

  function ler(texto) {
    const formato = detectar(texto);
    if (formato === "binario") return falha("desconhecido", "binario", "O arquivo parece binário. Esta versão lê PDB em texto e mmCIF em texto.");
    if (formato === "cif2") return falha("cif2", "cif2", "mmCIF versão 2 não é lido nesta versão. O arquivo não foi interpretado como CIF 1 nem como PDB.");
    if (formato === "desconhecido") return falha("desconhecido", "formato", "Formato não reconhecido. Esta versão lê PDB (colunas ATOM/HETATM) e mmCIF (_atom_site). O arquivo não foi interpretado.");

    const diagnosticos = [];
    if (formato === "pdb") {
      const linhas = linhasPdb(texto);
      const fatia = fatiarPdb(linhas);
      const lidos = registrosPdb(fatia.atomos, diagnosticos);
      if (lidos.erro) return falha("pdb", "pdb_sem_coord", lidos.erro);
      const analise = analiseClassica(lidos.registros);
      const posicoes = agrupar(lidos.registros, null);
      const remark = parseRemark465(linhas);
      const seqres = parseSeqres(linhas);
      const lacunas = diagnosticar(posicoes, {
        remark,
        remarkItens: remarkDoModelo(remark, fatia.modelo),
        unobs: { presente: false, itens: [] },
        scheme: { presente: false, itens: [] },
        seqres,
      }, fatia.modelo);
      const decls = parseDbref(linhas, diagnosticos);
      const componentes = montarComponentes(posicoes, "pdb", null, null);
      const identidade = metaPdb(linhas);
      if (posicoes.some((p) => p.altlocs.length)) {
        diagnosticos.push({ nivel: "info", codigo: "altloc", mensagem: "Há altLoc. A contagem de posições usa um resíduo por número e código de inserção; as linhas de átomo da estatística clássica continuam incluindo as alternativas." });
      }
      const estrutura = montarEstrutura({
        formato: "pdb",
        identidade,
        modelo: { selecionado: fatia.modelo, total: fatia.total, criterio: fatia.criterio },
        cadeias: cadeiasVisao(posicoes, analise),
        residuos: residuosDe(posicoes, fatia.modelo),
        componentes,
        lacunas,
        uniprot: uniprotDe(decls),
        diagnosticos,
        recursos: recursosDe("pdb"),
        limitacoes: limitacoesDe("pdb", posicoes),
      });
      return {
        schema: SCHEMA,
        ok: true,
        formato: "pdb",
        erro: null,
        diagnosticos,
        analise,
        estrutura,
        textoPdb: primeiroModeloTexto(String(texto || "")),
        textoViewer: primeiroModeloTexto(String(texto || "")),
        viewerFormato: "pdb",
      };
    }

    const cif = parseCif(texto);
    if (cif.erro) return falha("mmcif", "mmcif", cif.erro);
    const lidos = registrosCif(cif.block, diagnosticos);
    if (lidos.erro) return falha("mmcif", "mmcif", lidos.erro);
    const ents = entidadesDe(cif.block);
    const quimicos = quimicosDe(cif.block);
    const analise = analiseClassica(lidos.registros);
    const posicoes = agrupar(lidos.registros, ents);
    const scheme = parseEsquema(cif.block);
    const unobs = parseUnobs(cif.block);
    const lacunas = diagnosticar(posicoes, {
      remark: { exaustivo: false, itens: [] },
      remarkItens: [],
      unobs,
      scheme,
      seqres: [],
    }, lidos.modelo.selecionado);
    if (!scheme.presente && !unobs.presente && registrosCategoria(cif.block, "_entity_poly_seq").length) {
      diagnosticos.push({ nivel: "info", codigo: "entity_poly_seq", mensagem: "Há _entity_poly_seq, mas não há _pdbx_poly_seq_scheme nem a categoria de não observados. A sequência da entidade não foi alinhada por número." });
      lacunas.resumo += " A sequência da entidade, sozinha, não foi usada para nomear resíduos ausentes.";
    }
    const identidade = metaCif(cif.block, cif.block.name, diagnosticos);
    const componentes = montarComponentes(posicoes, "mmcif", ents, quimicos);
    if (posicoes.some((p) => p.altlocs.length)) {
      diagnosticos.push({ nivel: "aviso", codigo: "cif_altloc_viewer", mensagem: "Há altLoc. O Overview conta uma posição por resíduo. O 3Dmol 2.4.0, no mmCIF em texto, desenha as alternativas sobrepostas e não as separa." });
    }
    if (posicoes.some((p) => p.icode)) {
      diagnosticos.push({ nivel: "aviso", codigo: "cif_icode_viewer", mensagem: "Há código de inserção. A lista distingue esse resíduo. O 3Dmol 2.4.0 não usa pdbx_PDB_ins_code ao selecionar o mmCIF em texto." });
    }
    const estrutura = montarEstrutura({
      formato: "mmcif",
      identidade,
      modelo: lidos.modelo,
cadeias: cadeiasVisao(posicoes, analise),
        residuos: residuosDe(posicoes, lidos.modelo.selecionado),
        componentes,
        lacunas,
        uniprot: uniprotDe(declaracoesCif(cif.block)),
      diagnosticos,
      recursos: recursosDe("mmcif"),
      limitacoes: limitacoesDe("mmcif", posicoes),
    });
    return {
      schema: SCHEMA,
      ok: true,
      formato: "mmcif",
      erro: null,
      diagnosticos,
      analise,
      estrutura,
      textoPdb: null,
      textoViewer: textoViewerCif(lidos.registros),
      viewerFormato: "cif",
    };
  }

  function recursosDe(formato) {
    const pdb = formato === "pdb";
    return {
      preparo: pdb ? "disponivel" : "bloqueado",
      preparoMotivo: pdb ? null : "A ficha de preparo lê colunas PDB. Este mmCIF não foi enviado a ela.",
      cadeiaPdb: pdb ? "disponivel" : "bloqueado",
      cadeiaPdbMotivo: pdb ? null : "O download da cadeia em PDB não é feito para mmCIF nesta versão. A FASTA sai dos resíduos lidos no _atom_site.",
      dogsite: "somente_por_id_pdb",
      viewer: pdb ? "pdb" : "cif",
      conversaoPdb: pdb ? "nao_necessaria" : "nao_feita",
    };
  }

  function limitacoesDe(formato, posicoes) {
    const lim = [
      "Resíduos sem coordenadas não são desenhados nem destacados no viewer.",
      "A leitura peki-estrutura-1 não calcula R, Rfree, clashscore nem qualidade local. Com ID do PDB, a aba Qualidade consulta o relatório wwPDB à parte.",
      "Reconstrução de coordenadas e SWISS-MODEL não entram nesta versão.",
      "Mapa resíduo a resíduo PDB–UniProt fica pendente.",
      "Regiões fora do constructo não foram separadas das ausências no experimento.",
      "REMARK 470 e átomos faltando dentro de um resíduo resolvido não entram nesta versão.",
      "O drugScore do DoGSite continua descritor geométrico, não afinidade.",
    ];
    if (formato === "mmcif") {
      lim.push("Comparação e Ensemble desta versão continuam no PDB baixado pelo ID. O mmCIF não é encaminhado a essas rotinas.");
      lim.push("O viewer recebe um mmCIF só com o modelo selecionado, gerado da leitura. Não é uma conversão para colunas PDB.");
    }
    if (posicoes.some((p) => p.seqFonte === "ausente")) lim.push("Há átomos sem numeração inteira; eles ficaram de fora da identidade de resíduo.");
    return lim;
  }

  function residuosDe(posicoes, modeloSelecionado) {
    return posicoes.map((p) => {
      const fontes = (p.atomos || []).map((a) => a.seqFonte).filter(Boolean);
      const seqFonte = fontes.includes("auth") ? "auth" : (fontes.includes("label") ? "label" : "ausente");
      return {
        chain: p.chain,
        authChain: p.authChain == null ? null : p.authChain,
        labelChain: p.labelChain == null ? null : p.labelChain,
        seq: p.seq,
        seqFonte,
        icode: p.icode || "",
        labelSeq: p.labelSeq == null ? null : p.labelSeq,
        resname: p.resname,
        classe: p.classe,
        altlocs: p.altlocs.slice(),
        modelo: modeloSelecionado,
        temCoordenadas: p.coords === true,
      };
    });
  }

  function montarEstrutura(p) {
    return {
      schema: SCHEMA,
      formato: p.formato,
      identidade: p.identidade,
      modelo: p.modelo,
      cadeias: p.cadeias,
      residuos: p.residuos || [],
      componentes: p.componentes,
      lacunas: p.lacunas,
      uniprot: p.uniprot,
      diagnosticos: p.diagnosticos,
      recursos: p.recursos,
      limitacoes: p.limitacoes,
    };
  }

  return {
    SCHEMA,
    ler,
    idClassico,
    pareceCoordenadaPdb,
    pareceMmcif,
    escolherEntrada,
    buscarMotivo,
    textoVisao,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = StructureModel;
