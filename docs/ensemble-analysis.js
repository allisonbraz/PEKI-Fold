// EnsembleAnalysis — agrupamento exploratório de bolsões do DoGSiteScorer.
// Roda no navegador e no Node, sem rede e sem dependência.
// Não faz docking, não sobrepõe coordenadas e não mistura outro motor.
//
// Trabalho relacionado (não é fonte de código nem de texto):
// PockFlex, Rahali et al., Nucleic Acids Research 2026, 54(W1), W295–W300.
// https://doi.org/10.1093/nar/gkag453

"use strict";

const EnsembleAnalysis = (() => {
  const VERSAO = "ensemble-1";

  const CITACAO = Object.freeze({
    nome: "PockFlex",
    autores: "Rahali et al.",
    revista: "Nucleic Acids Research",
    ano: 2026,
    volume: "54",
    fasciculo: "W1",
    paginas: "W295–W300",
    doi: "10.1093/nar/gkag453",
    url: "https://doi.org/10.1093/nar/gkag453",
  });

  const FRASES = Object.freeze({
    persistencia: "Persistência indica recorrência do bolsão no conjunto, não druggability nem ligação de composto.",
    dinamica: "Ensemble de estruturas cristalográficas não representa dinâmica real.",
    exploratorio: "Resultado exploratório: é hipótese, não conclusão.",
    docking: "PEKI Fold não é ferramenta de docking.",
    evidencia: "Evidência: dado medido no arquivo ou descritor vindo do DoGSiteScorer.",
    hipotese: "Hipótese: interpretação que esses dados não provam.",
    descritor: "O drugScore e o volume são descritores do DoGSiteScorer. Não são afinidade nem previsão de ligação.",
    alinhamento: "O alinhamento é por número de resíduo e cadeia, ou por sequência simples. Não há sobreposição estrutural.",
    centroide: "A distância entre centroides só entra se as estruturas já compartilham o referencial. Este app não sobrepõe coordenadas.",
    apoHolo: "Apo ou holo é um indício pela presença de HETATM de ligante. Não confirma o estado biológico.",
    vina: "Sugestão editável de caixa. Não é uma caixa validada e não é resultado de docking.",
    redundancia: "Estruturas redundantes inflam a contagem. Entradas quase iguais aumentam n sem informação nova, e esta aba não remove essa redundância.",
    motor: "Resultados de motores diferentes não devem ser misturados. Esta aba usa somente o DoGSiteScorer. O drugScore daqui não entra na mesma conta que o escore de outro programa.",
    nEfetivo: "N efetivo é o número de estruturas que de fato entraram no agrupamento. A recorrência aparece como k de N efetivo.",
    mesmaProteina: "O app não confere se os IDs são a mesma proteína.",
    exemplo: "EXEMPLO SINTÉTICO. Estes bolsões não vieram do DoGSiteScorer.",
    relacionado: "Trabalho relacionado: PockFlex (Rahali et al., Nucleic Acids Research 2026, 54(W1), W295–W300, https://doi.org/10.1093/nar/gkag453). Também analisa bolsões num conjunto de estruturas. Esta aba é a leitura do PEKI Fold, no navegador e em português, com a ficha de preparo e uma caixa editável. Não há comparação de desempenho com o PockFlex.",
    preparo: "O texto da caixa segue o mesmo formato da ficha de preparo. Continua sendo sugestão editável e não substitui a conferência daquela ficha.",
  });

  const LIM_NUM = "Alinhamento por número de resíduo e pela letra da cadeia. A cadeia A de uma estrutura só encontra a cadeia A de outra com o mesmo número. Não há sobreposição de coordenadas. Se a numeração ou a letra da cadeia mudou, resíduos do mesmo lugar podem ficar separados, e resíduos diferentes podem cair no mesmo número.";
  const LIM_SEQ = "Alinhamento por sequência (pontuação +1 se a letra é igual, −1 se difere, −1 por buraco), sem matriz de substituição e sem sobreposição de coordenadas. A referência é a primeira estrutura efetiva. Um resíduo sem coluna na referência não cruza com as outras estruturas.";

  const FAIXAS = Object.freeze([75, 50, 25]);

  const LIMITES = Object.freeze({
    maxEstruturas: 20,
    limitePadrao: 8,
    jaccardPadrao: 0.5,
    distanciaPadrao: 6,
    margemVinaPadrao: 4,
    faixaCaixaPadrao: 50,
    pausaMsPadrao: 2000,
  });

  const TRES_PARA_UMA = {
    ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E",
    GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F",
    PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
  };

  const AGUAS = Object.freeze(["HOH", "WAT", "H2O", "DOD"]);
  const ADITIVOS = Object.freeze([
    "GOL", "EDO", "PEG", "PG4", "PGE", "1PE", "MPD", "MRD",
    "ACT", "SO4", "PO4", "DMS", "TRS", "MES", "EPE",
    "IPA", "MOH", "EOH", "FMT", "ACY", "CIT", "NO3", "SCN",
  ]);
  const IONS = Object.freeze([
    "LI", "NA", "K", "RB", "CS", "MG", "CA", "SR", "BA",
    "MN", "FE", "CO", "NI", "CU", "ZN", "CD", "HG",
    "CL", "BR", "IOD", "AG", "AU", "PT",
  ]);
  const SET_AGUA = new Set(AGUAS);
  const SET_ADITIVO = new Set(ADITIVOS);
  const SET_ION = new Set(IONS);

  function normalizarTexto(texto) {
    return String(texto || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function arred(v, casas) {
    if (!Number.isFinite(v)) return null;
    return Number(Number(v).toFixed(casas));
  }

  function clamp(n, a, b, fallback) {
    if (!Number.isFinite(n)) return fallback;
    if (n < a) return a;
    if (n > b) return b;
    return n;
  }

  function chaveLocal(r) {
    return String(r.chain || "_") + "|" + String(r.resseq) + "|" + String(r.icode || "");
  }

  function chaveCache(origem, id) {
    if (origem === "modelo") return "MOD:" + String(id);
    return "PDB:" + String(id || "").toUpperCase();
  }

  function hashTexto(texto) {
    let h = 5381;
    const s = String(texto || "");
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return (h >>> 0).toString(16);
  }

  function escreverAtomo(o) {
    const buf = Array(80).fill(" ");
    const por = (col, txt) => {
      const s = String(txt);
      for (let i = 0; i < s.length && col - 1 + i < 80; i++) buf[col - 1 + i] = s[i];
    };
    const rec = (o.rec || "ATOM").padEnd(6, " ").slice(0, 6);
    const serial = String(o.serial == null ? 1 : o.serial).padStart(5, " ");
    const nome = (o.nome || " CA ").padEnd(4, " ").slice(0, 4);
    const res = (o.res || "ALA").padEnd(3, " ").slice(0, 3);
    const seq = String(o.seq == null ? 1 : o.seq).padStart(4, " ");
    const x = (o.x == null ? 0 : o.x).toFixed(3).padStart(8, " ");
    const y = (o.y == null ? 0 : o.y).toFixed(3).padStart(8, " ");
    const z = (o.z == null ? 0 : o.z).toFixed(3).padStart(8, " ");
    const occ = (o.occ == null ? 1 : o.occ).toFixed(2).padStart(6, " ");
    const b = (o.b == null ? 20 : o.b).toFixed(2).padStart(6, " ");
    const el = (o.el == null ? " C" : o.el).padStart(2, " ").slice(-2);
    por(1, rec);
    por(7, serial);
    por(13, nome);
    por(17, o.altloc || " ");
    por(18, res);
    por(22, o.chain || "A");
    por(23, seq);
    por(27, o.icode || " ");
    por(31, x);
    por(39, y);
    por(47, z);
    por(55, occ);
    por(61, b);
    por(77, el);
    return buf.join("");
  }

  function parseIds(texto) {
    const partes = String(texto || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const ids = [];
    const invalidos = [];
    const vistos = new Set();
    for (const p of partes) {
      if (!/^[0-9][A-Za-z0-9]{3}$/.test(p)) {
        invalidos.push(p);
        continue;
      }
      const id = p.toUpperCase();
      if (vistos.has(id)) continue;
      vistos.add(id);
      ids.push(id);
    }
    return { ids, invalidos };
  }

  function separarModelos(texto) {
    const norm = normalizarTexto(texto);
    const linhas = norm.split("\n");
    if (!linhas.some((l) => /^MODEL\s/.test(l))) {
      return [{ indice: 1, rotulo: "modelo 1", texto: norm.endsWith("\n") ? norm : norm + "\n" }];
    }
    const modelos = [];
    let atual = null;
    for (const l of linhas) {
      if (/^MODEL\s/.test(l)) {
        const n = parseInt(l.substring(5).trim(), 10);
        atual = { indice: Number.isFinite(n) ? n : modelos.length + 1, buf: [] };
      } else if (/^ENDMDL\b/.test(l)) {
        if (atual) {
          const corpo = atual.buf.join("\n");
          if (/^(ATOM|HETATM)/m.test(corpo)) {
            modelos.push({
              indice: atual.indice,
              rotulo: "modelo " + atual.indice,
              texto: corpo + "\n",
            });
          }
          atual = null;
        }
      } else if (atual) {
        atual.buf.push(l);
      }
    }
    if (atual && /^(ATOM|HETATM)/m.test(atual.buf.join("\n"))) {
      modelos.push({
        indice: atual.indice,
        rotulo: "modelo " + atual.indice,
        texto: atual.buf.join("\n") + "\n",
      });
    }
    return modelos;
  }

  function aplicarLimite(itens, limite) {
    const n = normalizarParams({ limite }).limite;
    const lista = Array.isArray(itens) ? itens : [];
    return {
      aceitos: lista.slice(0, n),
      excedeu: lista.length > n,
      limite: n,
      total: lista.length,
    };
  }

  function normalizarParams(p) {
    const o = p || {};
    const modo = o.modoAlinhamento === "sequencia" ? "sequencia" : "numero";
    let j = Number(o.jaccardMin);
    if (!Number.isFinite(j)) j = LIMITES.jaccardPadrao;
    j = arred(clamp(j, 0, 1, LIMITES.jaccardPadrao), 2);
    let dist = Number(o.distanciaMax);
    if (!Number.isFinite(dist)) dist = LIMITES.distanciaPadrao;
    dist = arred(clamp(dist, 0, 100, LIMITES.distanciaPadrao), 2);
    let margem = Number(o.margemVina);
    if (!Number.isFinite(margem)) margem = LIMITES.margemVinaPadrao;
    margem = arred(clamp(margem, 0, 50, LIMITES.margemVinaPadrao), 2);
    const faixaBruta = Number(o.faixaCaixa);
    const faixaCaixa = faixaBruta === 25 || faixaBruta === 75 ? faixaBruta : 50;
    let limite = Number(o.limite);
    if (!Number.isFinite(limite)) limite = LIMITES.limitePadrao;
    limite = Math.round(clamp(limite, 1, LIMITES.maxEstruturas, LIMITES.limitePadrao));
    let pausa = Number(o.pausaEntreChamadasMs);
    if (!Number.isFinite(pausa)) pausa = LIMITES.pausaMsPadrao;
    pausa = Math.round(clamp(pausa, 0, 30000, LIMITES.pausaMsPadrao));
    const referenciaId = o.referenciaId ? String(o.referenciaId) : null;
    return {
      modoAlinhamento: modo,
      jaccardMin: j,
      usarCentroide: !!o.usarCentroide,
      distanciaMax: dist,
      margemVina: margem,
      faixaCaixa,
      limite,
      pausaEntreChamadasMs: pausa,
      referenciaId,
      criterio: "Jaccard de resíduos",
    };
  }

  function lerCoords(linha) {
    const x = parseFloat(linha.substring(30, 38));
    const y = parseFloat(linha.substring(38, 46));
    const z = parseFloat(linha.substring(46, 54));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x, y, z };
  }

  function lerResiduoLinha(linha) {
    const resname = linha.substring(17, 20).trim().toUpperCase();
    const ch = linha.charAt(21);
    const chain = !ch || ch === " " ? "_" : ch;
    const resseq = parseInt(linha.substring(22, 26), 10);
    if (!Number.isFinite(resseq)) return null;
    const ic = linha.charAt(26);
    const icode = !ic || ic === " " ? "" : ic;
    const nome = linha.substring(12, 16);
    const elemento = linha.length >= 78 ? linha.substring(76, 78).trim().toUpperCase() : "";
    return { resname, chain, resseq, icode, nome, elemento, coords: lerCoords(linha) };
  }

  function parseArquivoResiduos(texto, diagnostico) {
    const filtrar = typeof filtrarResiduosPocket === "function" ? filtrarResiduosPocket
      : require("./dogsite-client.js").filtrarResiduosPocket;
    texto = filtrar(texto, diagnostico);
    const map = new Map();
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let minx = Infinity;
    let miny = Infinity;
    let minz = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    let maxz = -Infinity;
    for (const linha of normalizarTexto(texto).split("\n")) {
      const rec = linha.substring(0, 6).trim();
      if (rec !== "ATOM" && rec !== "HETATM") continue;
      const r = lerResiduoLinha(linha);
      if (!r) continue;
      const chave = chaveLocal(r);
      if (!map.has(chave)) map.set(chave, { chain: r.chain, resseq: r.resseq, icode: r.icode, resname: r.resname });
      if (!r.coords) continue;
      n += 1;
      sx += r.coords.x;
      sy += r.coords.y;
      sz += r.coords.z;
      if (r.coords.x < minx) minx = r.coords.x;
      if (r.coords.y < miny) miny = r.coords.y;
      if (r.coords.z < minz) minz = r.coords.z;
      if (r.coords.x > maxx) maxx = r.coords.x;
      if (r.coords.y > maxy) maxy = r.coords.y;
      if (r.coords.z > maxz) maxz = r.coords.z;
    }
    return {
      residuos: [...map.values()],
      extensao: n ? { n, cx: sx / n, cy: sy / n, cz: sz / n, minx, miny, minz, maxx, maxy, maxz } : null,
    };
  }

  function residuosPorCadeia(texto) {
    const ordem = [];
    const por = new Map();
    const vistos = new Set();
    for (const linha of normalizarTexto(texto).split("\n")) {
      if (!linha.startsWith("ATOM")) continue;
      const r = lerResiduoLinha(linha);
      if (!r || !r.resname) continue;
      const chave = chaveLocal(r);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      if (!por.has(r.chain)) {
        por.set(r.chain, []);
        ordem.push(r.chain);
      }
      por.get(r.chain).push({
        chain: r.chain,
        resseq: r.resseq,
        icode: r.icode,
        resname: r.resname,
        letra: TRES_PARA_UMA[r.resname] || "X",
      });
    }
    return ordem.map((chain) => {
      const residuos = por.get(chain);
      return { chain, residuos, sequencia: residuos.map((x) => x.letra).join("") };
    });
  }

  function classeHet(resname) {
    const r = String(resname || "").toUpperCase();
    if (SET_AGUA.has(r)) return "agua";
    if (SET_ADITIVO.has(r)) return "aditivo";
    if (SET_ION.has(r)) return "ion";
    return "ligante";
  }

  function detectarLigante(texto) {
    const het = new Map();
    for (const linha of normalizarTexto(texto).split("\n")) {
      if (linha.substring(0, 6).trim() !== "HETATM") continue;
      const r = lerResiduoLinha(linha);
      if (!r || !r.resname) continue;
      const chave = r.resname + "|" + r.chain + "|" + r.resseq + "|" + r.icode;
      if (!het.has(chave)) het.set(chave, { resname: r.resname, chain: r.chain, resseq: r.resseq, icode: r.icode, classe: classeHet(r.resname) });
    }
    const todos = [...het.values()];
    const ligantes = todos.filter((x) => x.classe === "ligante");
    const aguas = todos.filter((x) => x.classe === "agua");
    const aditivos = todos.filter((x) => x.classe === "aditivo");
    const ions = todos.filter((x) => x.classe === "ion");
    let classe = "apo";
    if (ligantes.length) classe = "holo";
    else if (ions.length) classe = "apo-com-ion";
    return {
      classe,
      ligantes,
      aguas,
      aditivos,
      ions,
      frase: FRASES.apoHolo,
      listas: { aguas: AGUAS, aditivos: ADITIVOS, ions: IONS },
    };
  }

  function alinharIndices(ref, outro) {
    const n = ref.length;
    const m = outro.length;
    const map = new Array(m).fill(-1);
    if (!n || !m) return map;
    const MATCH = 1;
    const MIS = -1;
    const GAP = -1;
    const cols = m + 1;
    const dp = new Int32Array((n + 1) * cols);
    const at = (i, j) => i * cols + j;
    for (let i = 1; i <= n; i++) dp[at(i, 0)] = i * GAP;
    for (let j = 1; j <= m; j++) dp[at(0, j)] = j * GAP;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const s = ref[i - 1] === outro[j - 1] ? MATCH : MIS;
        const diag = dp[at(i - 1, j - 1)] + s;
        const up = dp[at(i - 1, j)] + GAP;
        const left = dp[at(i, j - 1)] + GAP;
        let best = diag;
        if (up > best) best = up;
        if (left > best) best = left;
        dp[at(i, j)] = best;
      }
    }
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0) {
        const s = ref[i - 1] === outro[j - 1] ? MATCH : MIS;
        if (dp[at(i, j)] === dp[at(i - 1, j - 1)] + s) {
          map[j - 1] = i - 1;
          i -= 1;
          j -= 1;
          continue;
        }
      }
      if (i > 0 && dp[at(i, j)] === dp[at(i - 1, j)] + GAP) {
        i -= 1;
        continue;
      }
      if (j > 0 && dp[at(i, j)] === dp[at(i, j - 1)] + GAP) {
        j -= 1;
        continue;
      }
      if (i > 0 && j > 0) {
        map[j - 1] = i - 1;
        i -= 1;
        j -= 1;
      } else if (i > 0) i -= 1;
      else j -= 1;
    }
    return map;
  }

  function identidadeSeq(a, b) {
    if (!a.length && !b.length) return 1;
    const map = alinharIndices(a, b);
    let acertos = 0;
    for (let j = 0; j < b.length; j++) {
      const i = map[j];
      if (i >= 0 && a[i] === b[j]) acertos += 1;
    }
    const den = Math.max(a.length, b.length);
    return den ? acertos / den : 0;
  }

  function mapaIdentidade(cads) {
    const m = new Map();
    for (const cad of cads) {
      for (const r of cad.residuos) m.set(chaveLocal(r), chaveLocal(r));
    }
    return m;
  }

  function construirAlinhamento(estruturas, modo) {
    const pareamentos = [];
    const mapas = {};
    const referenciaId = estruturas.length ? estruturas[0].id : null;
    if (modo !== "sequencia") {
      for (const e of estruturas) mapas[e.id] = mapaIdentidade(residuosPorCadeia(e.texto));
      return { modo: "numero", limitacao: LIM_NUM, referenciaId, mapas, pareamentos };
    }
    const ref = estruturas[0];
    const refCads = residuosPorCadeia(ref.texto);
    mapas[ref.id] = mapaIdentidade(refCads);
    const refPorCadeia = new Map(refCads.map((c) => [c.chain, c]));
    for (const e of estruturas.slice(1)) {
      const cads = residuosPorCadeia(e.texto);
      const m = new Map();
      const usadasRef = new Set();
      const pares = [];
      for (const c of cads) {
        if (refPorCadeia.has(c.chain) && !usadasRef.has(c.chain)) {
          usadasRef.add(c.chain);
          pares.push({ cad: c, ref: refPorCadeia.get(c.chain), criterio: "mesmo identificador de cadeia" });
        }
      }
      const livresOut = cads.filter((c) => !pares.some((p) => p.cad.chain === c.chain));
      const livresRef = refCads.filter((c) => !usadasRef.has(c.chain));
      const cands = [];
      for (const a of livresRef) {
        for (const b of livresOut) cands.push({ a, b, id: identidadeSeq(a.sequencia, b.sequencia) });
      }
      cands.sort((x, y) => y.id - x.id);
      const ru = new Set();
      const ou = new Set();
      for (const c of cands) {
        if (c.id < 0.4) break;
        if (ru.has(c.a.chain) || ou.has(c.b.chain)) continue;
        ru.add(c.a.chain);
        ou.add(c.b.chain);
        pares.push({ cad: c.b, ref: c.a, criterio: "sequência, sem o mesmo identificador", identidade: arred(c.id, 3) });
      }
      const pareadas = new Set();
      for (const p of pares) {
        pareadas.add(p.cad.chain);
        const mapIdx = alinharIndices(p.ref.sequencia, p.cad.sequencia);
        let acertos = 0;
        for (let j = 0; j < p.cad.residuos.length; j++) {
          const i = mapIdx[j];
          const local = chaveLocal(p.cad.residuos[j]);
          if (i >= 0 && p.ref.residuos[i]) {
            m.set(local, chaveLocal(p.ref.residuos[i]));
            if (p.ref.sequencia[i] === p.cad.sequencia[j]) acertos += 1;
          }
        }
        pareamentos.push({
          estruturaId: e.id,
          cadeia: p.cad.chain,
          cadeiaReferencia: p.ref.chain,
          criterio: p.criterio,
          identidade: p.identidade != null ? p.identidade : arred(acertos / Math.max(p.ref.sequencia.length, p.cad.sequencia.length || 1), 3),
        });
      }
      for (const c of cads) {
        if (pareadas.has(c.chain)) continue;
        pareamentos.push({
          estruturaId: e.id,
          cadeia: c.chain,
          cadeiaReferencia: null,
          criterio: "sem par na referência",
          identidade: null,
        });
      }
      mapas[e.id] = m;
    }
    return { modo: "sequencia", limitacao: LIM_SEQ, referenciaId, mapas, pareamentos };
  }

  function aplicarMapa(residuos, mapa, estruturaId) {
    const out = [];
    const vistos = new Set();
    for (const r of residuos || []) {
      const local = chaveLocal(r);
      const aligned = (mapa && mapa.get(local)) || ("local:" + estruturaId + ":" + local);
      if (vistos.has(aligned)) continue;
      vistos.add(aligned);
      out.push({
        chain: r.chain,
        resseq: r.resseq,
        icode: r.icode || "",
        resname: r.resname || "",
        chaveAlinhada: aligned,
      });
    }
    return out;
  }

  function jaccardConjuntos(a, b) {
    const A = new Set(a);
    const B = new Set(b);
    if (!A.size && !B.size) return 0;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter += 1;
    const uni = A.size + B.size - inter;
    return uni ? inter / uni : 0;
  }

  function distanciaCentroides(a, b) {
    if (!a || !b) return null;
    const dx = a.cx - b.cx;
    const dy = a.cy - b.cy;
    const dz = a.cz - b.cz;
    if (![dx, dy, dz].every(Number.isFinite)) return null;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function rotuloFaixa(faixa) {
    if (faixa === 75) return "≥ 75%";
    if (faixa === 50) return "≥ 50% e < 75%";
    if (faixa === 25) return "≥ 25% e < 50%";
    return "< 25%";
  }

  function recorrencia(k, n) {
    const kk = Math.max(0, k | 0);
    const nn = Math.max(0, n | 0);
    const pct = nn > 0 ? Number(((100 * kk) / nn).toFixed(1)) : 0;
    const faixa = pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0;
    return { k: kk, n: nn, pct, faixa, rotuloFaixa: rotuloFaixa(faixa), texto: kk + " de " + nn };
  }

  function stats(nums, casas) {
    const v = (nums || []).filter((x) => Number.isFinite(x));
    if (!v.length) return { n: 0, media: null, min: null, max: null };
    let min = v[0];
    let max = v[0];
    let s = 0;
    for (const x of v) {
      s += x;
      if (x < min) min = x;
      if (x > max) max = x;
    }
    return { n: v.length, media: arred(s / v.length, casas), min: arred(min, casas), max: arred(max, casas) };
  }

  function agrupar(bolsos, params, mesmoReferencial) {
    const grupos = [];
    let centroideAplicado = !!params.usarCentroide && !!mesmoReferencial;
    const avisoCentroide = params.usarCentroide && !mesmoReferencial
      ? "A distância entre centroides foi pedida, mas não entrou no agrupamento: as estruturas não compartilham referencial e não houve sobreposição."
      : null;
    if (avisoCentroide) centroideAplicado = false;
    for (const b of bolsos) {
      const chaves = b.residuosAlinhados.map((r) => r.chaveAlinhada);
      let melhor = null;
      for (const g of grupos) {
        if (g.estruturas.has(b.estruturaId)) continue;
        for (const membro of g.membros) {
          const j = jaccardConjuntos(membro.chaves, chaves);
          const d = distanciaCentroides(membro.extensao, b.extensao);
          if (j + 1e-9 < params.jaccardMin) continue;
          if (centroideAplicado && (d == null || d > params.distanciaMax + 1e-9)) continue;
          const melhorDist = melhor && melhor.d != null ? melhor.d : Infinity;
          const dCmp = d == null ? Infinity : d;
          if (!melhor || j > melhor.j + 1e-12 || (Math.abs(j - melhor.j) <= 1e-12 && dCmp < melhorDist)) {
            melhor = { g, j, d };
          }
        }
      }
      const membro = {
        estruturaId: b.estruturaId,
        name: b.name,
        volume: b.volume,
        surface: b.surface,
        depth: b.depth,
        hydrophobicity: b.hydrophobicity,
        accept: b.accept,
        donor: b.donor,
        drugScore: b.drugScore,
        residuosAlinhados: b.residuosAlinhados,
        chaves,
        extensao: b.extensao || null,
        aviso: b.aviso || null,
        jaccardEntrada: melhor ? arred(melhor.j, 3) : null,
        distanciaEntrada: melhor && melhor.d != null ? arred(melhor.d, 2) : null,
      };
      if (melhor) {
        melhor.g.membros.push(membro);
        melhor.g.estruturas.add(b.estruturaId);
      } else {
        grupos.push({
          id: "G" + (grupos.length + 1),
          membros: [membro],
          estruturas: new Set([b.estruturaId]),
        });
      }
    }
    return { grupos, centroideAplicado, avisoCentroide };
  }

  function rotuloChave(chave, nomes) {
    const nome = (nomes || []).filter(Boolean).sort().join("/") || "???";
    if (String(chave).startsWith("local:")) {
      const partes = String(chave).split(":");
      const resto = partes.slice(2).join(":");
      return nome + " " + resto + " (sem coluna na referência)";
    }
    const [chain, seq, ic] = String(chave).split("|");
    return nome + " " + (chain || "_") + " " + (seq || "") + (ic || "");
  }

  function resumirResiduos(membros, nEfetivo) {
    const acc = new Map();
    for (const m of membros) {
      const vistos = new Set();
      for (const r of m.residuosAlinhados) {
        if (vistos.has(r.chaveAlinhada)) continue;
        vistos.add(r.chaveAlinhada);
        if (!acc.has(r.chaveAlinhada)) acc.set(r.chaveAlinhada, { chave: r.chaveAlinhada, nomes: new Set(), k: 0 });
        const item = acc.get(r.chaveAlinhada);
        item.k += 1;
        if (r.resname) item.nomes.add(r.resname);
      }
    }
    const lista = [...acc.values()].map((item) => {
      const rec = recorrencia(item.k, nEfetivo);
      const nomes = [...item.nomes];
      return {
        chave: item.chave,
        nomes,
        nomesDivergem: nomes.length > 1,
        rotulo: rotuloChave(item.chave, nomes),
        ...rec,
      };
    });
    lista.sort((a, b) => b.k - a.k || String(a.chave).localeCompare(String(b.chave)));
    return {
      todos: lista,
      faixa75: lista.filter((r) => r.faixa === 75),
      faixa50: lista.filter((r) => r.faixa === 50),
      faixa25: lista.filter((r) => r.faixa === 25),
      abaixo: lista.filter((r) => r.faixa === 0),
    };
  }

  function centroideNaReferencia(texto, chaves) {
    const want = new Set(chaves || []);
    if (!want.size) return null;
    const cas = [];
    const todos = [];
    for (const linha of normalizarTexto(texto).split("\n")) {
      if (!linha.startsWith("ATOM")) continue;
      const r = lerResiduoLinha(linha);
      if (!r || !r.coords || !want.has(chaveLocal(r))) continue;
      const nome = r.nome.trim().toUpperCase();
      if (nome === "CA") cas.push(r.coords);
      todos.push(r.coords);
    }
    const usar = cas.length ? cas : todos;
    if (!usar.length) return null;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const c of usar) {
      sx += c.x;
      sy += c.y;
      sz += c.z;
    }
    return { x: sx / usar.length, y: sy / usar.length, z: sz / usar.length, n: usar.length, atomo: cas.length ? "CA" : "ATOM" };
  }

  function centroideDoGrupo(grupo, refId, textoRef) {
    const membro = grupo.membros.find((m) => m.estruturaId === refId && m.extensao && Number.isFinite(m.extensao.cx));
    if (membro) {
      return {
        x: arred(membro.extensao.cx, 3),
        y: arred(membro.extensao.cy, 3),
        z: arred(membro.extensao.cz, 3),
        n: membro.extensao.n,
        fonte: "bolsao-desta-estrutura",
      };
    }
    const chaves = [];
    const vistos = new Set();
    for (const m of grupo.membros) {
      for (const r of m.residuosAlinhados) {
        if (String(r.chaveAlinhada).startsWith("local:") || vistos.has(r.chaveAlinhada)) continue;
        vistos.add(r.chaveAlinhada);
        chaves.push(r.chaveAlinhada);
      }
    }
    const c = centroideNaReferencia(textoRef, chaves);
    if (!c) return null;
    return {
      x: arred(c.x, 3),
      y: arred(c.y, 3),
      z: arred(c.z, 3),
      n: c.n,
      fonte: "residuos-mapeados",
    };
  }

  function caixaDeExtensao(ext, margem) {
    if (!ext || !ext.n || !Number.isFinite(ext.cx)) {
      return { ok: false, erro: "Sem átomos do bolsão para montar a caixa desta estrutura." };
    }
    let m = Number(margem);
    if (!Number.isFinite(m) || m < 0) m = 0;
    if (m > 50) m = 50;
    return {
      ok: true,
      nAtomos: ext.n,
      margem: m,
      formula: "media-dos-atomos",
      center_x: arred(ext.cx, 3),
      center_y: arred(ext.cy, 3),
      center_z: arred(ext.cz, 3),
      size_x: arred((ext.maxx - ext.minx) + 2 * m, 1),
      size_y: arred((ext.maxy - ext.miny) + 2 * m, 1),
      size_z: arred((ext.maxz - ext.minz) + 2 * m, 1),
    };
  }

  function envelopeCentroides(pontos, margem) {
    const pts = (pontos || []).filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) && Number.isFinite(Number(p.z)));
    if (!pts.length) return { ok: false, erro: "Nenhum centroide persistente no referencial da estrutura de referência." };
    let m = Number(margem);
    if (!Number.isFinite(m) || m < 0) m = 0;
    if (m > 50) m = 50;
    let minx = Infinity;
    let miny = Infinity;
    let minz = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    let maxz = -Infinity;
    for (const p of pts) {
      const x = Number(p.x);
      const y = Number(p.y);
      const z = Number(p.z);
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (z < minz) minz = z;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
      if (z > maxz) maxz = z;
    }
    return {
      ok: true,
      margem: m,
      nCentroides: pts.length,
      formula: "envelope-dos-centroides",
      center_x: arred((minx + maxx) / 2, 3),
      center_y: arred((miny + maxy) / 2, 3),
      center_z: arred((minz + maxz) / 2, 3),
      size_x: arred((maxx - minx) + 2 * m, 1),
      size_y: arred((maxy - miny) + 2 * m, 1),
      size_z: arred((maxz - minz) + 2 * m, 1),
    };
  }

  function formatarConfigVina(c) {
    if (!c || !Number.isFinite(Number(c.center_x))) return "";
    const f = (n, d) => Number(n).toFixed(d);
    return [
      "center_x = " + f(c.center_x, 3),
      "center_y = " + f(c.center_y, 3),
      "center_z = " + f(c.center_z, 3),
      "size_x = " + f(c.size_x, 1),
      "size_y = " + f(c.size_y, 1),
      "size_z = " + f(c.size_z, 1),
    ].join("\n");
  }

  function lerConfigVina(texto) {
    const o = {};
    for (const linha of String(texto || "").split(/\r?\n/)) {
      const m = linha.match(/^\s*(center_[xyz]|size_[xyz])\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
      if (m) o[m[1].toLowerCase()] = Number(m[2]);
    }
    const keys = ["center_x", "center_y", "center_z", "size_x", "size_y", "size_z"];
    if (!keys.every((k) => Number.isFinite(o[k]))) {
      return { ok: false, erro: "O texto precisa das seis linhas center_x, center_y, center_z, size_x, size_y e size_z." };
    }
    return { ok: true, caixa: o };
  }

  function liganteResumo(est) {
    if (est.erro) return { classe: "fora", frase: est.erro };
    if (!est.texto) return { classe: "fora", frase: "Sem coordenadas para ler HETATM." };
    const d = detectarLigante(est.texto);
    return {
      classe: d.classe,
      ligantes: d.ligantes.map((x) => x.resname + " " + x.chain + " " + x.resseq),
      ions: d.ions.map((x) => x.resname + " " + x.chain + " " + x.resseq),
      frase: d.frase,
    };
  }

  function rotuloEstado(classe) {
    if (classe === "holo") return "holo (indício)";
    if (classe === "apo-com-ion") return "apo (indício, há íon)";
    if (classe === "apo") return "apo (indício)";
    return "fora do N efetivo";
  }

  function prepararEstruturasRelatorio(src) {
    const brutas = Array.isArray(src.estruturas) ? src.estruturas.map((e) => ({ ...e })) : [];
    const vistos = new Set();
    for (const e of brutas) {
      const id = String(e.id || "");
      if (!id || vistos.has(id)) {
        e.erro = e.erro || "Identificador repetido; esta cópia ficou de fora para não inflar N.";
      }
      if (id) vistos.add(id);
      if (!e.erro && !e.texto) e.erro = "Sem coordenadas para alinhar.";
    }
    return brutas;
  }

  function prepararAlinhamentoRelatorio(src, incluidas, params) {
    const alinhamento = construirAlinhamento(incluidas, params.modoAlinhamento);
    let refId = params.referenciaId && incluidas.some((e) => e.id === params.referenciaId)
      ? params.referenciaId
      : alinhamento.referenciaId;
    if (params.referenciaId && refId !== params.referenciaId) {
      alinhamento.referenciaPedidaAusente = params.referenciaId;
    }
    const refEst = incluidas.find((e) => e.id === refId) || null;
    const bolsosIn = [];
    for (const b of src.bolsos || []) {
      const est = incluidas.find((e) => e.id === b.estruturaId);
      if (!est) continue;
      bolsosIn.push({
        ...b,
        residuosAlinhados: aplicarMapa(b.residuos, alinhamento.mapas[est.id], est.id),
      });
    }
    return { alinhamento, refId, refEst, bolsosIn };
  }

  function resumirGruposRelatorio(brutas, ag, nEfetivo, refEst, params) {
    const porId = new Map(brutas.map((e) => [e.id, e]));
    const grupos = ag.grupos.map((g) => {
      const residuos = resumirResiduos(g.membros, nEfetivo);
      const pers = recorrencia(g.estruturas.size, nEfetivo);
      const centroide = refEst ? centroideDoGrupo(g, refEst.id, refEst.texto) : null;
      const classes = [...g.estruturas].map((id) => liganteResumo(porId.get(id) || { erro: "ausente" }).classe);
      const temHolo = classes.includes("holo");
      const temApo = classes.includes("apo") || classes.includes("apo-com-ion");
      return {
        id: g.id,
        persistencia: pers,
        persistenteNaCaixa: pers.k >= 2 && pers.faixa >= params.faixaCaixa,
        drugScore: stats(g.membros.map((m) => m.drugScore), 3),
        volume: stats(g.membros.map((m) => m.volume), 2),
        residuos,
        estruturas: [...g.estruturas],
        misturaApoHolo: temHolo && temApo,
        centroideReferencia: centroide,
        membros: g.membros.map((m) => ({
          estruturaId: m.estruturaId,
          name: m.name,
          volume: m.volume,
          surface: m.surface,
          depth: m.depth,
          hydrophobicity: m.hydrophobicity,
          accept: m.accept,
          donor: m.donor,
          drugScore: m.drugScore,
          jaccardEntrada: m.jaccardEntrada,
          distanciaEntrada: m.distanciaEntrada,
          aviso: m.aviso,
          residuos: m.residuosAlinhados.map((r) => r.chaveAlinhada),
          extensao: m.extensao,
        })),
      };
    });
    return grupos;
  }

  function sugerirCaixaRelatorio(grupos, params) {
    const pontosCaixa = grupos
      .filter((g) => g.persistenteNaCaixa && g.centroideReferencia)
      .map((g) => ({ ...g.centroideReferencia, grupo: g.id }));
    const caixaEnsemble = envelopeCentroides(pontosCaixa, params.margemVina);
    caixaEnsemble.grupos = pontosCaixa.map((p) => p.grupo);
    caixaEnsemble.faixa = params.faixaCaixa;
    const semCentroide = grupos.filter((g) => g.persistenteNaCaixa && !g.centroideReferencia).map((g) => g.id);
    return { caixaEnsemble, semCentroide };
  }

  function montarMatrizRelatorio(brutas, grupos, nEfetivo) {
    const matriz = {
      nEfetivo,
      colunas: grupos.map((g) => ({ id: g.id, persistencia: g.persistencia.texto, faixa: g.persistencia.rotuloFaixa })),
      linhas: brutas.map((e) => ({
        estruturaId: e.id,
        rotulo: e.rotulo || e.id,
        erro: e.erro || null,
        apoHolo: rotuloEstado(liganteResumo(e).classe),
        celulas: grupos.map((g) => {
          const m = g.membros.find((x) => x.estruturaId === e.id);
          return m
            ? { presente: true, bolsao: m.name, jaccardEntrada: m.jaccardEntrada }
            : { presente: false, bolsao: null, jaccardEntrada: null };
        }),
      })),
    };
    return matriz;
  }

  function limitacoesRelatorio(src, ag, alinhamento, nDisponiveis, nPedidas, nEfetivo) {
    const limitacoes = [
      FRASES.persistencia,
      FRASES.dinamica,
      FRASES.exploratorio,
      FRASES.docking,
      FRASES.redundancia,
      FRASES.motor,
      FRASES.nEfetivo,
      FRASES.alinhamento,
      alinhamento.limitacao,
      FRASES.mesmaProteina,
      FRASES.apoHolo,
      FRASES.descritor,
      FRASES.vina,
      FRASES.preparo,
    ];
    if (ag.avisoCentroide) limitacoes.push(ag.avisoCentroide);
    if (src.exemplo) limitacoes.push(FRASES.exemplo);
    if (nDisponiveis > nPedidas) {
      limitacoes.push("O limite desta execução deixou estruturas de fora: " + nPedidas + " de " + nDisponiveis + " carregadas.");
    }
    if (nEfetivo < 2) {
      limitacoes.push("Com menos de duas estruturas efetivas não há recorrência para ler.");
    }
    return limitacoes;
  }

  function montarRelatorio(entrada) {
    const src = entrada || {};
    const params = normalizarParams(src.params);
    const brutas = prepararEstruturasRelatorio(src);
    const incluidas = brutas.filter((e) => !e.erro);
    const nEfetivo = incluidas.length;
    const nPedidas = Number.isFinite(src.nPedidas) ? src.nPedidas : brutas.length;
    const nDisponiveis = Number.isFinite(src.nDisponiveis) ? src.nDisponiveis : nPedidas;
    const { alinhamento, refId, refEst, bolsosIn } = prepararAlinhamentoRelatorio(src, incluidas, params);
    const mesmoReferencial = !!src.mesmoReferencial;
    const ag = agrupar(bolsosIn, params, mesmoReferencial);
    const grupos = resumirGruposRelatorio(brutas, ag, nEfetivo, refEst, params);
    const { caixaEnsemble, semCentroide } = sugerirCaixaRelatorio(grupos, params);
    const ligantes = brutas.map((e) => ({ id: e.id, rotulo: e.rotulo || e.id, ...liganteResumo(e) }));
    const matriz = montarMatrizRelatorio(brutas, grupos, nEfetivo);
    const limitacoes = limitacoesRelatorio(src, ag, alinhamento, nDisponiveis, nPedidas, nEfetivo);
    return {
      versao: VERSAO,
      exemplo: !!src.exemplo,
      mesmoReferencial,
      nEfetivo,
      nPedidas,
      nDisponiveis,
      referenciaId: refId,
      parametros: params,
      faixas: FAIXAS.slice(),
      citacao: CITACAO,
      frases: FRASES,
      alinhamento: {
        modo: alinhamento.modo,
        limitacao: alinhamento.limitacao,
        referenciaId: alinhamento.referenciaId,
        pareamentos: alinhamento.pareamentos,
      },
      centroideAplicado: ag.centroideAplicado,
      avisoCentroide: ag.avisoCentroide,
      agrupamento: "Guloso, na ordem recebida. Um bolsão entra num grupo se a estrutura ainda não está nele e o Jaccard de resíduos com o membro de maior Jaccard atinge o limiar. G1 é o primeiro grupo aberto, não um ranking.",
      grupos,
      matriz,
      caixaEnsemble,
      gruposSemCentroide: semCentroide,
      estruturas: brutas.map((e) => ({
        id: e.id,
        rotulo: e.rotulo || e.id,
        origem: e.origem || null,
        exemplo: !!e.exemplo,
        erro: e.erro || null,
        incluida: !e.erro,
        ligante: ligantes.find((l) => l.id === e.id) || null,
        nBolsos: (src.bolsos || []).filter((b) => b.estruturaId === e.id && !e.erro).length,
      })),
      limitacoes,
      exclusoesHet: { aguas: AGUAS, aditivos: ADITIVOS, ions: IONS },
    };
  }

  function csvCampo(v) {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csvLinha(cols) {
    return cols.map(csvCampo).join(",");
  }

  function juntarRotulos(lista) {
    return (lista || []).map((r) => r.rotulo + " (" + r.texto + ", " + r.pct + "%)").join("; ");
  }

  function exportarCSV(relatorio, extras) {
    const r = relatorio || { grupos: [], matriz: { linhas: [] }, parametros: {} };
    const x = extras || {};
    const p = r.parametros || {};
    const comum = [
      p.jaccardMin,
      p.usarCentroide ? "sim" : "nao",
      r.centroideAplicado ? "sim" : "nao",
      p.distanciaMax,
      p.modoAlinhamento,
      p.faixaCaixa,
      p.margemVina,
      r.nEfetivo,
      r.nPedidas,
      r.versao,
      r.exemplo ? "sim" : "nao",
      x.decisaoPesquisador || "",
      "DoGSiteScorer",
      CITACAO.doi,
    ];
    const cabComum = [
      "jaccard_min", "pedir_centroide", "centroide_aplicado", "distancia_max", "alinhamento",
      "faixa_caixa", "margem_vina", "n_efetivo", "n_pedidas", "versao", "exemplo",
      "decisao_pesquisador", "motor", "doi_trabalho_relacionado",
    ];
    const grupos = [csvLinha([
      "grupo", "persistencia_k", "persistencia_N_efetivo", "persistencia", "faixa",
      "drugScore_media", "drugScore_min", "drugScore_max",
      "volume_media", "volume_min", "volume_max",
      "residuos_75", "residuos_50", "residuos_25", "residuos_abaixo",
      "estruturas", "mistura_apo_holo",
    ].concat(cabComum))];
    for (const g of r.grupos || []) {
      const res = g.residuos || {};
      grupos.push(csvLinha([
        g.id,
        g.persistencia.k,
        g.persistencia.n,
        g.persistencia.texto,
        g.persistencia.rotuloFaixa,
        g.drugScore.media,
        g.drugScore.min,
        g.drugScore.max,
        g.volume.media,
        g.volume.min,
        g.volume.max,
        juntarRotulos(res.faixa75),
        juntarRotulos(res.faixa50),
        juntarRotulos(res.faixa25),
        juntarRotulos(res.abaixo),
        (g.estruturas || []).join("; "),
        g.misturaApoHolo ? "sim" : "nao",
      ].concat(comum)));
    }
    const matriz = [csvLinha([
      "estrutura", "apo_holo", "erro", "grupo", "bolsao", "presente", "jaccard_entrada",
    ].concat(cabComum))];
    for (const linha of (r.matriz && r.matriz.linhas) || []) {
      (linha.celulas || []).forEach((cel, i) => {
        const col = r.matriz.colunas[i];
        matriz.push(csvLinha([
          linha.estruturaId,
          linha.apoHolo,
          linha.erro || "",
          col ? col.id : "",
          cel.bolsao || "",
          cel.presente ? "sim" : "nao",
          cel.jaccardEntrada == null ? "" : cel.jaccardEntrada,
        ].concat(comum)));
      });
    }
    return { grupos: grupos.join("\n") + "\n", matriz: matriz.join("\n") + "\n" };
  }

  function exportarJSON(relatorio, extras) {
    const x = extras || {};
    return JSON.stringify({
      versao: VERSAO,
      geradoEm: x.geradoEm || null,
      trabalhoRelacionado: CITACAO,
      frases: FRASES,
      decisaoPesquisador: x.decisaoPesquisador || "",
      relatorio,
      caixaEnsembleEditada: x.caixaEnsembleEditada || null,
      caixaEstruturaSugerida: x.caixaEstruturaSugerida || null,
      caixaEstruturaEditada: x.caixaEstruturaEditada || null,
      editadaPeloUsuario: !!x.editadaPeloUsuario,
    }, null, 2);
  }

  function extDe(cx, cy, cz) {
    const h = 1;
    return { n: 8, cx, cy, cz, minx: cx - h, miny: cy - h, minz: cz - h, maxx: cx + h, maxy: cy + h, maxz: cz + h };
  }

  function pdbCadeia(chain, residuos, extra) {
    const linhas = [];
    let serial = 1;
    for (const r of residuos) {
      linhas.push(escreverAtomo({
        serial: serial++, nome: " CA ", res: r.res || "ALA", chain, seq: r.seq, x: r.seq * 3, y: 0, z: 0,
      }));
    }
    if (extra) linhas.push(extra);
    linhas.push("END");
    return linhas.join("\n") + "\n";
  }

  function exemploSintetico() {
    const ala = (ns) => ns.map((seq) => ({ seq, res: "ALA" }));
    const ex1 = pdbCadeia("A", ala([1, 2, 3, 10, 11]));
    const lig = escreverAtomo({
      rec: "HETATM", serial: 50, nome: " C1 ", res: "LIG", chain: "A", seq: 900, x: 30, y: 0, z: 0, el: " C",
    });
    const ex2 = pdbCadeia("A", ala([1, 2, 3, 10, 11, 12]), lig);
    const ex3 = pdbCadeia("A", ala([1, 2, 20]));
    const res = (ns) => ns.map((seq) => ({ chain: "A", resseq: seq, icode: "", resname: "ALA" }));
    const bolso = (estruturaId, name, residuos, volume, drugScore, cx, cy, cz) => ({
      estruturaId, name, residuos, volume, drugScore,
      surface: null, depth: null, hydrophobicity: null, accept: null, donor: null,
      extensao: extDe(cx, cy, cz),
    });
    return {
      exemplo: true,
      mesmoReferencial: true,
      nPedidas: 3,
      nDisponiveis: 3,
      estruturas: [
        { id: "EX1", rotulo: "EX1 (exemplo)", texto: ex1, origem: "exemplo", exemplo: true },
        { id: "EX2", rotulo: "EX2 (exemplo)", texto: ex2, origem: "exemplo", exemplo: true },
        { id: "EX3", rotulo: "EX3 (exemplo)", texto: ex3, origem: "exemplo", exemplo: true },
      ],
      bolsos: [
        bolso("EX1", "P_0", res([1, 2, 3]), 100, 0.8, 0, 0, 0),
        bolso("EX1", "P_1", res([10, 11]), 40, 0.2, 10, 0, 0),
        bolso("EX2", "P_0", res([1, 2, 3]), 110, 0.7, 0.5, 0, 0),
        bolso("EX2", "P_1", res([10, 11, 12]), 50, 0.3, 10.5, 0, 0),
        bolso("EX3", "P_0", res([1, 2]), 90, 0.6, -0.5, 0, 0),
        bolso("EX3", "P_1", res([20]), 15, 0.1, 20, 5, 0),
      ],
    };
  }

  return {
    VERSAO,
    CITACAO,
    FRASES,
    FAIXAS,
    LIMITES,
    LIM_NUM,
    LIM_SEQ,
    AGUAS,
    ADITIVOS,
    IONS,
    parseIds,
    separarModelos,
    hashTexto,
    chaveCache,
    aplicarLimite,
    normalizarParams,
    escreverAtomo,
    parseArquivoResiduos,
    residuosPorCadeia,
    detectarLigante,
    alinharIndices,
    jaccardConjuntos,
    distanciaCentroides,
    recorrencia,
    rotuloFaixa,
    caixaDeExtensao,
    envelopeCentroides,
    formatarConfigVina,
    lerConfigVina,
    centroideNaReferencia,
    montarRelatorio,
    exportarCSV,
    exportarJSON,
    exemploSintetico,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = EnsembleAnalysis;
if (typeof globalThis !== "undefined") globalThis.EnsembleAnalysis = EnsembleAnalysis;
