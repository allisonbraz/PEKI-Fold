// Exposição relativa ao solvente (RSA), calculada no navegador.
// SASA: Shrake e Rupley (1973), sonda de 1,4 Å e 100 pontos na espiral
// dourada, no mesmo arranjo usado por Bio.PDB.SASA. Raios de van der Waals
// de Bondi/Mantina, com 2,0 Å quando o elemento não está na tabela.
// RSA: SASA do resíduo dividida pelo máximo teórico de Tien et al.,
// PLOS ONE 8(11):e80635 (2013), Tabela 1, coluna Theoretical.
// A área usa todas as cadeias da estrutura carregada e deixa as águas de fora.

"use strict";

const Sasa = (() => {

  const PROBE = 1.4;
  const N_PONTOS = 100;
  const LIMIAR = 25;
  const POR_LINHA = 24;
  const RAIO_PADRAO = 2.0;
  const AGUAS = new Set(["HOH", "WAT", "H2O", "DOD"]);

  // Mesma tabela de Bio.PDB.SASA.ATOMIC_RADII. O valor ausente fica em 2,0 Å.
  const RAIOS = {
    H: 1.200, HE: 1.400, C: 1.700, N: 1.550, O: 1.520, F: 1.470,
    NA: 2.270, MG: 1.730, P: 1.800, S: 1.800, CL: 1.750, K: 2.750,
    CA: 2.310, NI: 1.630, CU: 1.400, ZN: 1.390, SE: 1.900, BR: 1.850,
    CD: 1.580, I: 1.980, HG: 1.550,
  };

  // Tien et al. 2013, Tabela 1, coluna Theoretical (Å²), região ALLOWED, Gly-X-Gly.
  const MAX_ASA_TIEN = {
    ALA: 129.0, ARG: 274.0, ASN: 195.0, ASP: 193.0, CYS: 167.0,
    GLN: 225.0, GLU: 223.0, GLY: 104.0, HIS: 224.0, ILE: 197.0,
    LEU: 201.0, LYS: 236.0, MET: 224.0, PHE: 240.0, PRO: 159.0,
    SER: 155.0, THR: 172.0, TRP: 285.0, TYR: 263.0, VAL: 174.0,
  };

  const TEXTO_METODO = "RSA = SASA do resíduo na estrutura carregada (todas as cadeias, sem águas) dividida pelo máximo teórico de Tien et al., PLOS ONE 8(11):e80635 (2013), Tabela 1, coluna Theoretical. Método: Shrake e Rupley (1973), sonda de 1,4 Å e 100 pontos por átomo. Enterrado: RSA abaixo de 25%. É uma estimativa geométrica, não um resultado de dinâmica.";

  const esferaCache = new Map();

  function esferaUnitaria(n) {
    let pronta = esferaCache.get(n);
    if (pronta) return pronta;
    const coords = new Float32Array(n * 3);
    const dl = Math.PI * (3 - Math.sqrt(5));
    const dz = 2 / n;
    let longitude = 0;
    let z = 1 - dz / 2;
    for (let k = 0; k < n; k++) {
      const raio = Math.sqrt(Math.max(0, 1 - z * z));
      coords[k * 3] = Math.cos(longitude) * raio;
      coords[k * 3 + 1] = Math.sin(longitude) * raio;
      coords[k * 3 + 2] = z;
      z -= dz;
      longitude += dl;
    }
    esferaCache.set(n, coords);
    return coords;
  }

  function raioDe(elemento) {
    const el = String(elemento || "").toUpperCase();
    return Object.prototype.hasOwnProperty.call(RAIOS, el) ? RAIOS[el] : RAIO_PADRAO;
  }

  // Colunas 77–78 quando existem. Sem elas, o nome do PDB: CA de aminoácido
  // continua carbono; FE, ZN e os demais símbolos de dois letras seguem o nome.
  function inferirElemento(nome, coluna) {
    const col = String(coluna || "").trim().toUpperCase();
    if (/^[A-Z][A-Z]?$/.test(col)) return col;
    const n = String(nome || "").trim().toUpperCase();
    if (!n) return "";
    if (n === "H" || /^[0-9]+H/.test(n) || /^H[A-Z0-9]/.test(n)) return "H";
    // FE, ZN, MG e outros símbolos de dois letras. CA/CB/N/O/S de aminoácido
    // começam por C, N, O, S, P ou H e continuam no elemento de uma letra.
    // Ferro não está na tabela de raios: o padrão de 2,0 Å é o de Bio.PDB.
    const dois = n.slice(0, 2);
    if (/^[A-Z]{2}$/.test(dois) && !/^[CNOSPH]/.test(dois)) return dois;
    return n.charAt(0);
  }

  function chaveAtomo(a) {
    return a.cadeia + "|" + a.seq + "|" + a.icode + "|" + a.nome;
  }

  function preferirAltloc(a, b) {
    const oa = a.occ == null ? 0 : a.occ;
    const ob = b.occ == null ? 0 : b.occ;
    if (oa !== ob) return oa > ob;
    const posto = (alt) => (alt === "" ? 0 : alt === "A" ? 1 : 2);
    if (posto(a.altloc) !== posto(b.altloc)) return posto(a.altloc) < posto(b.altloc);
    return a.altloc < b.altloc;
  }

  function reduzirAltloc(atomos) {
    const melhor = new Map();
    for (const a of atomos) {
      const k = chaveAtomo(a);
      const prev = melhor.get(k);
      if (!prev || preferirAltloc(a, prev)) melhor.set(k, a);
    }
    const visto = new Set();
    const out = [];
    for (const a of atomos) {
      const k = chaveAtomo(a);
      if (visto.has(k)) continue;
      visto.add(k);
      out.push(melhor.get(k));
    }
    return out;
  }

  function atomoDe(campos) {
    if (campos.x == null || campos.y == null || campos.z == null || campos.seq == null) return null;
    const resname = String(campos.resname || "").trim().toUpperCase();
    if (!resname) return null;
    const nome = String(campos.nome || "").trim().toUpperCase();
    return {
      rec: campos.rec === "HETATM" ? "HETATM" : "ATOM",
      nome,
      altloc: campos.altloc ? String(campos.altloc).trim().toUpperCase() : "",
      resname,
      cadeia: campos.cadeia && campos.cadeia !== " " ? String(campos.cadeia) : "_",
      seq: campos.seq,
      icode: campos.icode ? String(campos.icode).trim().toUpperCase() : "",
      x: campos.x,
      y: campos.y,
      z: campos.z,
      occ: campos.occ == null || Number.isNaN(campos.occ) ? null : campos.occ,
      elemento: inferirElemento(nome, campos.elemento),
    };
  }

  function lerPdb(texto) {
    const brutos = [];
    let aguas = 0;
    let viuModelo = false;
    let capturando = true;
    for (const bruta of String(texto || "").split("\n")) {
      const linha = bruta.replace(/\r$/, "");
      if (linha.startsWith("MODEL ") || linha.startsWith("MODEL\t")) {
        if (viuModelo) break;
        viuModelo = true;
        capturando = true;
        continue;
      }
      if (linha.startsWith("ENDMDL")) {
        if (viuModelo) break;
        continue;
      }
      if (!capturando) continue;
      if (!linha.startsWith("ATOM") && !linha.startsWith("HETATM")) continue;
      if (linha.length < 54) continue;
      const resname = linha.substring(17, 20).trim().toUpperCase();
      if (AGUAS.has(resname)) { aguas += 1; continue; }
      const seqTxt = linha.substring(22, 26).trim();
      const seq = /^-?\d+$/.test(seqTxt) ? parseInt(seqTxt, 10) : null;
      const x = parseFloat(linha.substring(30, 38));
      const y = parseFloat(linha.substring(38, 46));
      const z = parseFloat(linha.substring(46, 54));
      const occ = linha.length >= 60 ? parseFloat(linha.substring(54, 60)) : NaN;
      const alt = linha.charAt(16);
      const ic = linha.charAt(26);
      const ch = linha.charAt(21);
      const atomo = atomoDe({
        rec: linha.startsWith("HETATM") ? "HETATM" : "ATOM",
        nome: linha.substring(12, 16),
        altloc: alt && alt !== " " ? alt : "",
        resname,
        cadeia: !ch || ch === " " ? "_" : ch,
        seq,
        icode: ic && ic !== " " ? ic : "",
        x: Number.isFinite(x) ? x : null,
        y: Number.isFinite(y) ? y : null,
        z: Number.isFinite(z) ? z : null,
        occ: Number.isFinite(occ) ? occ : null,
        elemento: linha.length >= 78 ? linha.substring(76, 78) : "",
      });
      if (atomo) brutos.push(atomo);
    }
    return { atomos: reduzirAltloc(brutos), aguasIgnoradas: aguas, formato: "pdb" };
  }

  function celulaCif(valor) {
    if (valor == null) return "";
    let s = String(valor).trim();
    if (s === "." || s === "?") return "";
    if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) s = s.slice(1, -1);
    if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) s = s.slice(1, -1);
    return s;
  }

  function lerCif(texto) {
    const linhas = String(texto || "").split("\n").map((l) => l.replace(/\r$/, ""));
    let colunas = null;
    let naTabela = false;
    const brutos = [];
    let aguas = 0;
    for (const linha of linhas) {
      const t = linha.trim();
      if (!t || t.startsWith("#")) {
        if (naTabela && colunas) naTabela = false;
        continue;
      }
      if (t === "loop_") {
        colunas = [];
        naTabela = false;
        continue;
      }
      if (colunas && t.startsWith("_")) {
        colunas.push(t.split(/\s+/)[0]);
        continue;
      }
      if (colunas && colunas.some((c) => c.startsWith("_atom_site."))) {
        naTabela = true;
        const partes = t.split(/\s+/);
        if (partes.length < colunas.length) continue;
        const get = (sufixo) => {
          const i = colunas.findIndex((c) => c === "_atom_site." + sufixo || c.endsWith("." + sufixo));
          return i >= 0 ? celulaCif(partes[i]) : "";
        };
        const resname = (get("auth_comp_id") || get("label_comp_id")).toUpperCase();
        if (AGUAS.has(resname)) { aguas += 1; continue; }
        const seqTxt = get("auth_seq_id") || get("label_seq_id");
        const seq = /^-?\d+$/.test(seqTxt) ? parseInt(seqTxt, 10) : null;
        const x = parseFloat(get("Cartn_x"));
        const y = parseFloat(get("Cartn_y"));
        const z = parseFloat(get("Cartn_z"));
        const occ = parseFloat(get("occupancy"));
        const cadeia = get("auth_asym_id") || get("label_asym_id") || "_";
        const atomo = atomoDe({
          rec: (get("group_PDB") || "ATOM").toUpperCase() === "HETATM" ? "HETATM" : "ATOM",
          nome: get("auth_atom_id") || get("label_atom_id"),
          altloc: get("label_alt_id"),
          resname,
          cadeia: cadeia || "_",
          seq,
          icode: get("pdbx_PDB_ins_code"),
          x: Number.isFinite(x) ? x : null,
          y: Number.isFinite(y) ? y : null,
          z: Number.isFinite(z) ? z : null,
          occ: Number.isFinite(occ) ? occ : null,
          elemento: get("type_symbol"),
        });
        if (atomo) brutos.push(atomo);
        continue;
      }
      if (colunas && !t.startsWith("_")) colunas = null;
    }
    return { atomos: reduzirAltloc(brutos), aguasIgnoradas: aguas, formato: "cif" };
  }

  function lerCoordenadas(texto, formato) {
    const bruto = String(texto || "");
    const fmt = formato || (bruto.includes("_atom_site.") ? "cif" : "pdb");
    if (fmt === "cif" || fmt === "mmcif") return lerCif(bruto);
    return lerPdb(bruto);
  }

  function prepararVizinhos(xs, ys, zs, raios) {
    const n = raios.length;
    let maxR = 0;
    for (let i = 0; i < n; i++) if (raios[i] > maxR) maxR = raios[i];
    const twice = maxR * 2;
    const twice2 = twice * twice;
    const cell = twice > 0 ? twice : 1;
    const grid = new Map();
    const ix = new Int32Array(n);
    const iy = new Int32Array(n);
    const iz = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      ix[i] = Math.floor(xs[i] / cell);
      iy[i] = Math.floor(ys[i] / cell);
      iz[i] = Math.floor(zs[i] / cell);
      const k = ix[i] + "," + iy[i] + "," + iz[i];
      let balde = grid.get(k);
      if (!balde) grid.set(k, balde = []);
      balde.push(i);
    }
    const listas = new Array(n);
    for (let i = 0; i < n; i++) {
      const ri = raios[i];
      const perto = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const balde = grid.get((ix[i] + dx) + "," + (iy[i] + dy) + "," + (iz[i] + dz));
            if (!balde) continue;
            for (let b = 0; b < balde.length; b++) {
              const j = balde[b];
              if (j === i) continue;
              const ddx = xs[j] - xs[i];
              const ddy = ys[j] - ys[i];
              const ddz = zs[j] - zs[i];
              const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
              if (d2 > twice2) continue;
              const lim = ri + raios[j];
              if (d2 >= lim * lim) continue;
              perto.push({ j, d2 });
            }
          }
        }
      }
      perto.sort((a, b) => a.d2 - b.d2);
      const ids = new Int32Array(perto.length);
      for (let k = 0; k < perto.length; k++) ids[k] = perto[k].j;
      listas[i] = ids;
    }
    return listas;
  }

  function iniciarCalculo(atomos, opcoes) {
    const lista = atomos || [];
    const n = lista.length;
    const nPontos = opcoes && opcoes.nPontos ? opcoes.nPontos : N_PONTOS;
    const probe = opcoes && opcoes.probe ? opcoes.probe : PROBE;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    const zs = new Float64Array(n);
    const raios = new Float64Array(n);
    const rj2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = lista[i];
      xs[i] = a.x;
      ys[i] = a.y;
      zs[i] = a.z;
      raios[i] = raioDe(a.elemento) + probe;
      rj2[i] = raios[i] * raios[i];
    }
    return {
      atomos: lista,
      n,
      nPontos,
      probe,
      xs, ys, zs, raios, rj2,
      listas: n ? prepararVizinhos(xs, ys, zs, raios) : [],
      esfera: esferaUnitaria(nPontos),
      areas: new Float64Array(n),
      indice: 0,
      pts: new Float64Array(nPontos * 3),
      vivo: new Uint8Array(nPontos),
    };
  }

  function areaDoAtomo(tarefa, i) {
    const r = tarefa.raios[i];
    const nPontos = tarefa.nPontos;
    const esfera = tarefa.esfera;
    const pts = tarefa.pts;
    const vivo = tarefa.vivo;
    const cx = tarefa.xs[i];
    const cy = tarefa.ys[i];
    const cz = tarefa.zs[i];
    for (let p = 0; p < nPontos; p++) {
      pts[p * 3] = cx + esfera[p * 3] * r;
      pts[p * 3 + 1] = cy + esfera[p * 3 + 1] * r;
      pts[p * 3 + 2] = cz + esfera[p * 3 + 2] * r;
      vivo[p] = 1;
    }
    let restam = nPontos;
    const viz = tarefa.listas[i];
    const xs = tarefa.xs;
    const ys = tarefa.ys;
    const zs = tarefa.zs;
    const rj2 = tarefa.rj2;
    for (let k = 0; k < viz.length && restam; k++) {
      const j = viz[k];
      const limite = rj2[j];
      const jx = xs[j];
      const jy = ys[j];
      const jz = zs[j];
      for (let p = 0; p < nPontos; p++) {
        if (!vivo[p]) continue;
        const dx = pts[p * 3] - jx;
        const dy = pts[p * 3 + 1] - jy;
        const dz = pts[p * 3 + 2] - jz;
        if (dx * dx + dy * dy + dz * dz < limite) {
          vivo[p] = 0;
          restam -= 1;
        }
      }
    }
    return restam * r * r * (4 * Math.PI / nPontos);
  }

  function avancarCalculo(tarefa, quantos) {
    const fim = Math.min(tarefa.n, tarefa.indice + (quantos > 0 ? quantos : tarefa.n));
    for (let i = tarefa.indice; i < fim; i++) tarefa.areas[i] = areaDoAtomo(tarefa, i);
    tarefa.indice = fim;
    return { feito: tarefa.indice, total: tarefa.n, terminou: tarefa.indice >= tarefa.n };
  }

  function concluirCalculo(tarefa, lidos) {
    const por = new Map();
    const ordem = [];
    for (let i = 0; i < tarefa.n; i++) {
      const a = tarefa.atomos[i];
      if (a.rec !== "ATOM") continue;
      const k = a.cadeia + "|" + a.seq + "|" + a.icode + "|" + a.resname;
      let item = por.get(k);
      if (!item) {
        const maxAsa = Object.prototype.hasOwnProperty.call(MAX_ASA_TIEN, a.resname) ? MAX_ASA_TIEN[a.resname] : null;
        item = {
          cadeia: a.cadeia,
          resname: a.resname,
          seq: a.seq,
          icode: a.icode,
          sasa: 0,
          maxAsa,
          rsa: null,
        };
        por.set(k, item);
        ordem.push(item);
      }
      item.sasa += tarefa.areas[i];
    }
    for (const item of ordem) {
      if (item.maxAsa) item.rsa = (100 * item.sasa) / item.maxAsa;
    }
    const cadeias = [];
    const visto = new Set();
    for (const item of ordem) {
      if (!visto.has(item.cadeia)) {
        visto.add(item.cadeia);
        cadeias.push(item.cadeia);
      }
    }
    return {
      metodo: "Shrake-Rupley",
      probe: tarefa.probe,
      nPontos: tarefa.nPontos,
      limiar: LIMIAR,
      referenciaMax: "Tien et al. 2013, Tabela 1, Theoretical",
      aguasIgnoradas: lidos ? lidos.aguasIgnoradas : 0,
      atomosUsados: tarefa.n,
      formato: lidos ? lidos.formato : null,
      cadeias,
      residuos: ordem,
    };
  }

  function calcularExposicao(texto, opcoes) {
    const opts = opcoes || {};
    const lidos = lerCoordenadas(texto, opts.formato);
    const tarefa = iniciarCalculo(lidos.atomos, opts);
    const passo = opts.passo > 0 ? opts.passo : tarefa.n || 1;
    if (!tarefa.n) {
      if (opts.onProgresso) opts.onProgresso(0, 0);
      return concluirCalculo(tarefa, lidos);
    }
    let estado = { terminou: false };
    while (!estado.terminou) {
      estado = avancarCalculo(tarefa, passo);
      if (opts.onProgresso) opts.onProgresso(estado.feito, estado.total);
    }
    return concluirCalculo(tarefa, lidos);
  }

  function apiAminoacidos() {
    if (typeof ProtAnalysis !== "undefined" && ProtAnalysis.grupoAminoacido) return ProtAnalysis;
    if (typeof globalThis !== "undefined" && globalThis.ProtAnalysis && globalThis.ProtAnalysis.grupoAminoacido) {
      return globalThis.ProtAnalysis;
    }
    return null;
  }

  function grupoDe(resname) {
    const api = apiAminoacidos();
    return api ? api.grupoAminoacido(resname) : null;
  }

  function letraDe(resname) {
    const api = apiAminoacidos();
    if (api && api.TRES_PARA_UMA) return api.TRES_PARA_UMA[resname] || "X";
    return "X";
  }

  function nomeDe(resname) {
    const api = apiAminoacidos();
    if (api && api.NOMES_AA && api.NOMES_AA[resname]) return api.NOMES_AA[resname];
    return resname;
  }

  function chaveResiduo(r) {
    return r.cadeia + "|" + r.seq + "|" + (r.icode || "");
  }

  function fmt1(n) {
    return (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
  }

  function montarMapa(exposicao, cadeia, opcoes) {
    const opts = opcoes || {};
    const porLinha = opts.porLinha > 0 ? opts.porLinha : POR_LINHA;
    const limiar = opts.limiar == null ? LIMIAR : opts.limiar;
    const marcas = opts.marcas instanceof Set ? opts.marcas : new Set(opts.marcas || []);
    const nomeBolsão = opts.nomeBolsão || "";
    const residuos = (exposicao && exposicao.residuos || []).filter((r) => r.cadeia === cadeia);
    const celulas = residuos.map((r) => {
      const grupo = grupoDe(r.resname);
      const temRsa = r.rsa != null && Number.isFinite(r.rsa);
      const enterrado = temRsa ? r.rsa < limiar : null;
      return {
        cadeia: r.cadeia,
        resname: r.resname,
        seq: r.seq,
        icode: r.icode || "",
        rotulo: String(r.seq) + (r.icode || ""),
        letra: letraDe(r.resname),
        nome: nomeDe(r.resname),
        sasa: r.sasa,
        rsa: temRsa ? r.rsa : null,
        maxAsa: r.maxAsa,
        enterrado,
        grupoId: grupo ? grupo.id : null,
        grupoNome: grupo ? grupo.nome : null,
        cor: grupo ? grupo.cor : "#5c6b82",
        noBolsão: marcas.has(chaveResiduo(r)),
      };
    });
    const linhas = [];
    for (let i = 0; i < celulas.length; i += porLinha) linhas.push(celulas.slice(i, i + porLinha));
    const comRsa = celulas.filter((c) => c.rsa != null);
    const enterrados = comRsa.filter((c) => c.enterrado).length;
    const hidro = comRsa.filter((c) => c.grupoId === "hidro");
    const hidroEnterrados = hidro.filter((c) => c.enterrado).length;
    const doBolsão = comRsa.filter((c) => c.noBolsão);
    const fora = comRsa.filter((c) => !c.noBolsão);
    const media = (lista) => (lista.length ? lista.reduce((s, c) => s + c.rsa, 0) / lista.length : null);
    const resumo = {
      total: comRsa.length,
      enterrados,
      expostos: comRsa.length - enterrados,
      semMaximo: celulas.length - comRsa.length,
      hidroTotal: hidro.length,
      hidroEnterrados,
      hidroPct: hidro.length ? (100 * hidroEnterrados) / hidro.length : null,
      bolsao: marcas.size ? {
        nome: nomeBolsão,
        total: doBolsão.length,
        enterrados: doBolsão.filter((c) => c.enterrado).length,
        rsaMedia: media(doBolsão),
        rsaMediaFora: media(fora),
      } : null,
    };
    return {
      cadeia,
      porLinha,
      limiar,
      celulas,
      linhas,
      resumo,
      textoResumo: textoResumo(cadeia, resumo),
      textoBolsão: textoBolsão(resumo.bolsao),
    };
  }

  function textoResumo(cadeia, resumo) {
    const nome = cadeia === "_" ? "Cadeia _" : "Cadeia " + cadeia;
    if (!resumo.total && !resumo.semMaximo) return nome + ": não há resíduo ATOM com coordenadas nesta cadeia.";
    let txt = nome + ": " + resumo.enterrados + " de " + resumo.total
      + " resíduos enterrados (RSA < " + LIMIAR + "%) e " + resumo.expostos + " expostos.";
    if (resumo.hidroTotal) {
      txt += " Hidrofóbicos: " + resumo.hidroEnterrados + " de " + resumo.hidroTotal
        + " enterrados (" + fmt1(resumo.hidroPct) + "%).";
    }
    if (resumo.semMaximo) {
      txt += " " + resumo.semMaximo + " resíduo(s) sem máximo teórico de Tien et al. ficam fora dessa contagem.";
    }
    return txt;
  }

  function textoBolsão(bolsao) {
    if (!bolsao) return "";
    const nome = bolsao.nome || "Bolsão";
    if (!bolsao.total) return nome + " não tem resíduo com RSA nesta cadeia.";
    let txt = nome + ": " + bolsao.enterrados + " de " + bolsao.total + " enterrados";
    if (bolsao.rsaMedia != null) txt += " (RSA média " + fmt1(bolsao.rsaMedia) + "% no bolsão";
    if (bolsao.rsaMediaFora != null) txt += ", " + fmt1(bolsao.rsaMediaFora) + "% no restante da cadeia";
    if (bolsao.rsaMedia != null) txt += ")";
    return txt + ".";
  }

  function chavesDeSelecao(sels) {
    const set = new Set();
    for (const sel of sels || []) {
      if (!sel) continue;
      const cadeia = sel.chain == null || sel.chain === "" ? "_" : String(sel.chain);
      const icode = sel.icode && sel.icode !== " " ? String(sel.icode).toUpperCase() : "";
      const resis = Array.isArray(sel.resi) ? sel.resi : [sel.resi];
      for (const resi of resis) {
        if (resi == null || Number.isNaN(Number(resi))) continue;
        set.add(cadeia + "|" + Number(resi) + "|" + icode);
      }
    }
    return set;
  }

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function rotuloAcessivel(c) {
    let txt = c.nome + " " + c.rotulo + ", cadeia " + c.cadeia + ". ";
    if (c.rsa == null) txt += "Sem máximo teórico para a RSA. ";
    else txt += "RSA " + fmt1(c.rsa) + "%, " + (c.enterrado ? "enterrado" : "exposto") + ". ";
    if (c.grupoNome) txt += "Grupo " + c.grupoNome + ". ";
    if (c.noBolsão) txt += "Faz parte do bolsão aberto no visualizador.";
    return txt.trim();
  }

  function htmlDoMapa(mapa, opcoes) {
    const opts = opcoes || {};
    const ativo = opts.ativo || "";
    if (!mapa || !mapa.celulas.length) {
      return '<p class="muted">Esta cadeia não tem resíduo ATOM com coordenadas para o mapa.</p>';
    }
    const linhas = mapa.linhas.map((linha, i) => {
      const eixo = '<div class="sasa-eixo" aria-hidden="true">'
        + (i === 0 ? '<span class="sasa-tick-100">100</span>' : "")
        + '<span class="sasa-tick-25">25%</span></div>';
      const botoes = linha.map((c) => {
        const chave = chaveResiduo(c);
        const classes = ["sasa-res"];
        if (c.enterrado === true) classes.push("sasa-enterrado");
        else if (c.enterrado === false) classes.push("sasa-exposto");
        else classes.push("sasa-sem-rsa");
        if (c.noBolsão) classes.push("sasa-bolsao");
        if (chave === ativo) classes.push("sasa-ativo");
        const rsa = c.rsa == null ? 0 : Math.max(0, Math.min(100, c.rsa));
        return '<button type="button" class="' + classes.join(" ") + '" data-cadeia="' + escHtml(c.cadeia)
          + '" data-resi="' + c.seq + '" data-icode="' + escHtml(c.icode)
          + '" data-grupo="' + escHtml(c.grupoId || "")
          + '" style="--rsa:' + rsa.toFixed(2) + ';--cor:' + escHtml(c.cor) + '" aria-pressed="'
          + (chave === ativo ? "true" : "false") + '" aria-label="' + escHtml(rotuloAcessivel(c)) + '">'
          + '<span class="sasa-barra-area"><span class="sasa-barra"></span></span>'
          + '<span class="sasa-celula"><span class="sasa-letra">' + escHtml(c.letra) + '</span>'
          + '<span class="sasa-num">' + escHtml(c.rotulo) + "</span></span>"
          + '<span class="sasa-tri" aria-hidden="true">▼</span></button>';
      }).join("");
      return '<div class="sasa-linha" data-linha="' + i + '">' + eixo
        + '<div class="sasa-trilha"><div class="sasa-limiar" aria-hidden="true"></div>' + botoes + "</div></div>";
    }).join("");
    return '<div class="sasa-mapa-corpo"><div class="sasa-ylabel">RSA (%)</div><div class="sasa-linhas">' + linhas + "</div></div>";
  }

  function htmlLegenda(grupos) {
    const itens = (grupos || []).map((g) => '<li><span class="aa-swatch" style="background:' + escHtml(g.cor)
      + '" aria-hidden="true"></span><span><strong>' + escHtml(g.nome) + "</strong> — "
      + escHtml((g.residuos || []).join(", ")) + "</span></li>").join("");
    return '<figcaption>Cor por grupo químico</figcaption><ul>' + itens + "</ul>"
      + '<ul class="sasa-legenda-extra"><li><span class="sasa-amostra-limiar" aria-hidden="true"></span> Limiar 25% (enterrado / exposto)</li>'
      + '<li><span class="sasa-amostra-tri" aria-hidden="true">▼</span> Resíduo do bolsão aberto no visualizador</li></ul>'
      + "<p>A cor da célula é o mesmo grupo químico das barras de frequência. A barra acima do resíduo é a RSA em porcentagem.</p>";
  }

  function svgDoMapa(mapa, opcoes) {
    const opts = opcoes || {};
    const titulo = opts.titulo || "Mapa da sequência com exposição ao solvente";
    const subtitulo = opts.subtitulo || "";
    const cell = 36;
    const barH = 70;
    const cellH = 36;
    const triH = 14;
    const eixo = 46;
    const topo = 58;
    const rowH = barH + cellH + triH + 12;
    const largura = eixo + (mapa && mapa.porLinha ? mapa.porLinha : POR_LINHA) * cell + 16;
    const nLinhas = mapa && mapa.linhas ? mapa.linhas.length : 0;
    const extra = 78;
    const altura = topo + Math.max(1, nLinhas) * rowH + extra;
    const partes = [];
    partes.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + largura + '" height="' + altura
      + '" viewBox="0 0 ' + largura + " " + altura + '" role="img">');
    partes.push("<title>" + escHtml(titulo) + "</title>");
    partes.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    partes.push('<text x="' + (largura / 2) + '" y="22" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="#1c2433">' + escHtml(titulo) + "</text>");
    if (subtitulo) {
      partes.push('<text x="' + (largura / 2) + '" y="40" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#596579">' + escHtml(subtitulo) + "</text>");
    }
    partes.push('<text x="16" y="' + (topo + 36) + '" font-family="sans-serif" font-size="11" fill="#596579" transform="rotate(-90 16 ' + (topo + 36) + ')">RSA (%)</text>');
    (mapa && mapa.linhas || []).forEach((linha, i) => {
      const y0 = topo + i * rowH;
      partes.push('<line x1="' + eixo + '" y1="' + y0 + '" x2="' + (eixo + linha.length * cell) + '" y2="' + y0 + '" stroke="#d5dbe6" stroke-width="1"/>');
      const yLim = y0 + barH * 0.75;
      partes.push('<line x1="' + (eixo - 4) + '" y1="' + yLim + '" x2="' + (eixo + linha.length * cell) + '" y2="' + yLim + '" stroke="#5c6b82" stroke-width="1.2" stroke-dasharray="4 3"/>');
      if (i === 0) partes.push('<text x="' + (eixo - 6) + '" y="' + (y0 + 4) + '" text-anchor="end" font-family="sans-serif" font-size="10" fill="#596579">100</text>');
      partes.push('<text x="' + (eixo - 6) + '" y="' + (yLim + 3) + '" text-anchor="end" font-family="sans-serif" font-size="10" fill="#596579">25%</text>');
      linha.forEach((c, k) => {
        const x = eixo + k * cell;
        const rsa = c.rsa == null ? 0 : Math.max(0, Math.min(100, c.rsa));
        const h = (rsa / 100) * barH;
        if (h > 0) {
          partes.push('<rect x="' + (x + 10) + '" y="' + (y0 + barH - h) + '" width="14" height="' + h.toFixed(2) + '" fill="#a67c2d"/>');
        }
        const texto = c.grupoId === "hidro" ? "#1c1400" : "#ffffff";
        partes.push('<rect x="' + (x + 2) + '" y="' + (y0 + barH) + '" width="' + (cell - 4) + '" height="' + cellH + '" rx="2" fill="' + escHtml(c.cor) + '"/>');
        partes.push('<text x="' + (x + cell / 2) + '" y="' + (y0 + barH + 16) + '" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="' + texto + '">' + escHtml(c.letra) + "</text>");
        partes.push('<text x="' + (x + cell / 2) + '" y="' + (y0 + barH + 30) + '" text-anchor="middle" font-family="sans-serif" font-size="9" fill="' + texto + '">' + escHtml(c.rotulo) + "</text>");
        if (c.noBolsão) {
          const tx = x + cell / 2;
          const ty = y0 + barH + cellH + 3;
          partes.push('<polygon points="' + (tx - 5) + "," + ty + " " + (tx + 5) + "," + ty + " " + tx + "," + (ty + 8) + '" fill="#1c2433"/>');
        }
      });
    });
    const yTexto = topo + Math.max(1, nLinhas) * rowH + 8;
    if (mapa && mapa.textoResumo) {
      partes.push('<text x="' + eixo + '" y="' + yTexto + '" font-family="sans-serif" font-size="12" fill="#1c2433">' + escHtml(mapa.textoResumo) + "</text>");
    }
    if (mapa && mapa.textoBolsão) {
      partes.push('<text x="' + eixo + '" y="' + (yTexto + 18) + '" font-family="sans-serif" font-size="12" fill="#1c2433">' + escHtml(mapa.textoBolsão) + "</text>");
    }
    partes.push("</svg>");
    return partes.join("");
  }

  return {
    PROBE, N_PONTOS, LIMIAR, POR_LINHA, RAIOS, RAIO_PADRAO, MAX_ASA_TIEN, TEXTO_METODO, AGUAS,
    raioDe, inferirElemento, lerCoordenadas, lerPdb, lerCif,
    iniciarCalculo, avancarCalculo, concluirCalculo, calcularExposicao,
    montarMapa, htmlDoMapa, htmlLegenda, svgDoMapa, chavesDeSelecao, chaveResiduo, fmt1,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Sasa;
if (typeof self !== "undefined") self.Sasa = Sasa;
