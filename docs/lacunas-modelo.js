// Apoio à modelagem de lacunas. Não reconstrói coordenada, não envia job
// ao Swiss-Model e não usa token. A FASTA e os mapas são calculados no navegador.

"use strict";

const LacunasModelo = (() => {
  const SWISS_URL = "https://swissmodel.expasy.org/interactive";
  const AF_API = "https://alphafold.ebi.ac.uk/api/prediction/";
  const PDBE_MAP = "https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/";

  const TRES = {
    ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E",
    GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F",
    PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
  };

  function uma(nome) {
    return TRES[String(nome || "").toUpperCase()] || "X";
  }

  function numero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function detectar(estrutura, relatorio) {
    const lac = (estrutura && estrutura.lacunas) || {};
    const nao = Array.isArray(lac.naoResolvidos) ? lac.naoResolvidos : [];
    const saltos = Array.isArray(lac.saltosNumeracao) ? lac.saltosNumeracao : [];
    const por = new Map();
    function bucket(cadeia) {
      const id = cadeia || "_";
      if (!por.has(id)) por.set(id, { cadeia: id, naoResolvidos: 0, saltos: 0 });
      return por.get(id);
    }
    for (const r of nao) bucket(r.cadeiaAuth || r.chain).naoResolvidos += 1;
    for (const s of saltos) bucket(s.cadeia).saltos += 1;
    let local = 0;
    const relPor = relatorio && relatorio.local && relatorio.local.porCadeia;
    if (relPor) {
      for (const [cadeia, info] of Object.entries(relPor)) {
        const n = Number(info && info.lacunasSemCoordenada) || 0;
        if (n > 0) {
          local += n;
          bucket(cadeia);
        }
      }
    }
    return {
      tem: nao.length > 0 || saltos.length > 0 || local > 0,
      determinado: lac.determinado !== false,
      resumo: lac.resumo || "",
      cadeias: [...por.values()].sort((a, b) => a.cadeia.localeCompare(b.cadeia)),
      naoResolvidos: nao,
      saltos,
    };
  }

  function parseSeqres(texto) {
    const map = new Map();
    const informado = {};
    for (const l of String(texto || "").replace(/\r\n/g, "\n").split("\n")) {
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
      contagemConfere: informado[chain] == null || informado[chain] === seq.length,
    }));
  }

  function dpSubsequencia(obs, seq) {
    const n = obs.length;
    const m = seq.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
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

  function reconstruirUnico(obs, seq) {
    const dp = dpSubsequencia(obs.map((r) => r.resname), seq);
    if (dp[obs.length][seq.length] !== 1) return null;
    const match = new Array(seq.length).fill(-1);
    let i = obs.length;
    let j = seq.length;
    while (i > 0) {
      if (j === 0) return null;
      const casa = obs[i - 1].resname === seq[j - 1] && dp[i - 1][j - 1] > 0;
      const pula = dp[i][j - 1] > 0;
      if (casa && dp[i][j - 1] === 0) {
        match[j - 1] = i - 1;
        i -= 1;
        j -= 1;
      } else if (pula && !(casa && dp[i - 1][j - 1] > 0 && dp[i][j] !== dp[i][j - 1])) {
        j -= 1;
      } else if (casa) {
        match[j - 1] = i - 1;
        i -= 1;
        j -= 1;
      } else return null;
    }
    return match;
  }

  function quebrarFasta(letras) {
    return (letras.match(/.{1,60}/g) || [""]).join("\n");
  }

  function fastaCadeia(opcoes) {
    const o = opcoes || {};
    const cadeia = o.cadeia;
    const avisos = [];
    const obs = (o.residuos || []).filter((r) =>
      r.chain === cadeia && r.temCoordenadas && r.seq != null &&
      (r.classe === "proteina" || r.classe === "proteina-modificada")
    ).slice().sort((a, b) => a.seq - b.seq || String(a.icode || "").localeCompare(String(b.icode || "")));
    const sq = (o.seqres || []).find((s) => s.chain === cadeia && s.contagemConfere !== false && s.seq && s.seq.length);
    let fonte = "author";
    let lista = [];
    if (sq && obs.length) {
      const match = reconstruirUnico(obs, sq.seq);
      if (match) {
        fonte = "seqres";
        lista = sq.seq.map((resname, i) => {
          const visto = match[i] >= 0 ? obs[match[i]] : null;
          return {
            ordem: i + 1,
            resname,
            letra: uma(resname),
            authSeq: visto ? visto.seq : null,
            icode: visto ? (visto.icode || "") : "",
            origem: visto ? "coordenada" : "seqres-ausente",
          };
        });
      } else {
        avisos.push("A SEQRES desta cadeia não tem um alinhamento único com as coordenadas. A FASTA usa a numeração author e os resíduos não resolvidos que têm nome e número.");
      }
    }
    if (!lista.length) {
      const por = new Map();
      for (const r of obs) {
        const k = r.seq + "|" + (r.icode || "");
        if (!por.has(k)) por.set(k, { resname: r.resname, authSeq: r.seq, icode: r.icode || "", origem: "coordenada" });
      }
      let semNumero = 0;
      for (const g of o.naoResolvidos || []) {
        if ((g.cadeiaAuth || g.chain) !== cadeia) continue;
        if (g.authSeq == null) { semNumero += 1; continue; }
        const k = g.authSeq + "|" + (g.icode || "");
        if (!por.has(k)) por.set(k, { resname: g.resname, authSeq: g.authSeq, icode: g.icode || "", origem: "nao-resolvido" });
      }
      if (semNumero) avisos.push(semNumero + " resíduo(s) citado(s) sem numeração author ficaram de fora da FASTA, para não inventar a ordem.");
      lista = [...por.values()].sort((a, b) => a.authSeq - b.authSeq || a.icode.localeCompare(b.icode));
      lista.forEach((r, i) => { r.ordem = i + 1; r.letra = uma(r.resname); });
    }
    const letras = lista.map((r) => r.letra).join("");
    const titulo = String(o.titulo || "").replace(/[\r\n>]/g, " ").trim().slice(0, 80);
    const header = ">" + (o.nome || "estrutura") + "_" + cadeia + " fonte=" + fonte + (titulo ? " " + titulo : "");
    return {
      texto: header + "\n" + quebrarFasta(letras) + "\n",
      letras,
      lista,
      fonte,
      avisos,
      cadeia,
    };
  }

  function acessoDe(decl) {
    if (!decl || !decl.accession) return "";
    const db = String(decl.db || "").toUpperCase();
    if (!db || db === "UNP" || db === "UNIPROT" || db.includes("UNIPROT")) return String(decl.accession).trim();
    return "";
  }

  function declaracoesDaCadeia(decls, cadeia) {
    return (decls || []).filter((d) => acessoDe(d) && (!d.cadeiaAuth || d.cadeiaAuth === cadeia));
  }

  function uniprotDoPdbe(json, pdbId, cadeia) {
    if (!json || typeof json !== "object") return [];
    const id = String(pdbId || "").toLowerCase();
    const raiz = json[id] || json[id.toUpperCase()] || json[Object.keys(json)[0]];
    const uni = raiz && raiz.UniProt;
    if (!uni) return [];
    const out = [];
    for (const [acc, info] of Object.entries(uni)) {
      for (const m of (info && info.mappings) || []) {
        if (m.chain_id !== cadeia && m.struct_asym_id !== cadeia) continue;
        out.push({
          fonte: "pdbe",
          db: "UNP",
          accession: acc,
          cadeiaAuth: cadeia,
          pdbInicio: m.start ? numero(m.start.author_residue_number) : null,
          pdbFim: m.end ? numero(m.end.author_residue_number) : null,
          dbInicio: numero(m.unp_start),
          dbFim: numero(m.unp_end),
        });
      }
    }
    return out;
  }

  function uniprotDeAuth(seq, decl) {
    if (!decl || seq == null || decl.pdbInicio == null || decl.dbInicio == null) return null;
    if (decl.pdbFim != null && (seq < decl.pdbInicio || seq > decl.pdbFim)) return null;
    return decl.dbInicio + (seq - decl.pdbInicio);
  }

  function linksPublicos(pdbId, accession, entrada) {
    const links = [];
    if (pdbId) links.push({ rotulo: "Ficha RCSB", url: "https://www.rcsb.org/structure/" + pdbId });
    if (accession) {
      links.push({ rotulo: "UniProt " + accession, url: "https://www.uniprot.org/uniprotkb/" + accession });
      links.push({ rotulo: "AlphaFold " + accession, url: "https://alphafold.ebi.ac.uk/entry/" + accession });
    }
    if (entrada && entrada.pdbUrl) links.push({ rotulo: "PDB do modelo AlphaFold", url: entrada.pdbUrl });
    links.push({ rotulo: "Swiss-Model", url: SWISS_URL });
    return links;
  }

  function normalizarPredicao(json) {
    const lista = Array.isArray(json) ? json : (json ? [json] : []);
    return lista.filter((e) => e && (e.pdbUrl || e.entryId)).map((e) => ({
      entryId: e.entryId || "",
      uniprotAccession: e.uniprotAccession || "",
      uniprotDescription: e.uniprotDescription || "",
      organism: e.organismScientificName || "",
      globalMetricValue: numero(e.globalMetricValue),
      fractionPlddtVeryHigh: numero(e.fractionPlddtVeryHigh),
      fractionPlddtConfident: numero(e.fractionPlddtConfident),
      fractionPlddtLow: numero(e.fractionPlddtLow),
      fractionPlddtVeryLow: numero(e.fractionPlddtVeryLow),
      pdbUrl: e.pdbUrl || "",
      plddtDocUrl: e.plddtDocUrl || "",
      sequenceStart: numero(e.uniprotStart != null ? e.uniprotStart : e.sequenceStart) || 1,
      sequenceEnd: numero(e.uniprotEnd != null ? e.uniprotEnd : e.sequenceEnd),
    }));
  }

  function lerConfianca(json) {
    const nums = json && json.residueNumber;
    const scores = json && (json.confidenceScore || json.confidenceCategory);
    if (!Array.isArray(nums) || !Array.isArray(scores)) return null;
    const map = new Map();
    for (let i = 0; i < nums.length && i < scores.length; i++) {
      const n = numero(nums[i]);
      const s = numero(scores[i]);
      if (n != null && s != null) map.set(n, s);
    }
    return map;
  }

  function atomosPdb(texto) {
    const out = [];
    for (const linha of String(texto || "").replace(/\r\n/g, "\n").split("\n")) {
      if (!linha.startsWith("ATOM") && !linha.startsWith("HETATM")) continue;
      const nome = linha.substring(12, 16).trim().toUpperCase();
      const alt = linha.charAt(16);
      const cadeia = linha.charAt(21) === " " ? "_" : linha.charAt(21);
      const resseq = parseInt(linha.substring(22, 26), 10);
      const ic = linha.charAt(26);
      const x = parseFloat(linha.substring(30, 38));
      const y = parseFloat(linha.substring(38, 46));
      const z = parseFloat(linha.substring(46, 54));
      const b = parseFloat(linha.substring(60, 66));
      if (!Number.isFinite(resseq) || !Number.isFinite(x)) continue;
      out.push({
        linha,
        nome,
        altloc: alt && alt !== " " ? alt.toUpperCase() : "",
        cadeia,
        resseq,
        icode: ic && ic !== " " ? ic.toUpperCase() : "",
        resname: linha.substring(17, 20).trim().toUpperCase(),
        x, y, z,
        bfactor: Number.isFinite(b) ? b : null,
      });
    }
    return out;
  }

  function casDe(atomos) {
    const vistos = new Set();
    const out = [];
    for (const a of atomos) {
      if (a.nome !== "CA" || a.altloc && a.altloc !== "A") continue;
      const k = a.cadeia + "|" + a.resseq + "|" + a.icode;
      if (vistos.has(k)) continue;
      vistos.add(k);
      out.push(a);
    }
    return out;
  }

  function corPlddt(v) {
    if (v == null || !Number.isFinite(Number(v))) return "#888888";
    if (v >= 90) return "#0053D6";
    if (v >= 70) return "#65CBF3";
    if (v >= 50) return "#FFDB13";
    return "#FF7D45";
  }

  function faixaPlddt(v) {
    if (v == null || !Number.isFinite(Number(v))) return "sem valor";
    if (v >= 90) return "muito alto";
    if (v >= 70) return "alto";
    if (v >= 50) return "baixo";
    return "muito baixo";
  }

  function media(valores) {
    const nums = valores.filter((v) => v != null && Number.isFinite(v));
    if (!nums.length) return null;
    return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 100) / 100;
  }

  function zeros() { return [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; }
  function transposta(A) {
    return [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
  }
  function mul(A, B) {
    const C = zeros();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
    return C;
  }
  function det3(A) {
    return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
      - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
      + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  }
  function jacobi(S) {
    const A = S.map((r) => r.slice());
    const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let iter = 0; iter < 24; iter++) {
      let p = 0; let q = 1; let max = Math.abs(A[0][1]);
      if (Math.abs(A[0][2]) > max) { max = Math.abs(A[0][2]); p = 0; q = 2; }
      if (Math.abs(A[1][2]) > max) { max = Math.abs(A[1][2]); p = 1; q = 2; }
      if (max < 1e-12) break;
      const app = A[p][p]; const aqq = A[q][q]; const apq = A[p][q];
      const tau = (aqq - app) / (2 * apq);
      const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t);
      const s = t * c;
      A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      A[p][q] = 0; A[q][p] = 0;
      for (let r = 0; r < 3; r++) {
        if (r === p || r === q) continue;
        const arp = A[r][p]; const arq = A[r][q];
        A[r][p] = A[p][r] = c * arp - s * arq;
        A[r][q] = A[q][r] = s * arp + c * arq;
      }
      for (let r = 0; r < 3; r++) {
        const vip = V[r][p]; const viq = V[r][q];
        V[r][p] = c * vip - s * viq;
        V[r][q] = s * vip + c * viq;
      }
    }
    return { valores: [A[0][0], A[1][1], A[2][2]], V };
  }
  function svd(H) {
    const HtH = mul(transposta(H), H);
    const ev = jacobi(HtH);
    const sig = ev.valores.map((v) => Math.sqrt(Math.max(0, v)));
    const V = ev.V.map((r) => r.slice());
    const U = zeros();
    for (let j = 0; j < 3; j++) {
      if (sig[j] < 1e-8) continue;
      for (let i = 0; i < 3; i++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += H[i][k] * V[k][j];
        U[i][j] = s / sig[j];
      }
    }
    return { U, S: sig, V };
  }

  function centroide(pontos) {
    const c = [0, 0, 0];
    for (const p of pontos) { c[0] += p.x; c[1] += p.y; c[2] += p.z; }
    c[0] /= pontos.length; c[1] /= pontos.length; c[2] /= pontos.length;
    return c;
  }

  // Move Q sobre P. Devolve null se houver menos de 3 pares.
  function kabsch(P, Q) {
    if (!P || !Q || P.length !== Q.length || P.length < 3) return null;
    const cp = centroide(P);
    const cq = centroide(Q);
    const H = zeros();
    for (let i = 0; i < P.length; i++) {
      const y = [Q[i].x - cq[0], Q[i].y - cq[1], Q[i].z - cq[2]];
      const x = [P[i].x - cp[0], P[i].y - cp[1], P[i].z - cp[2]];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) H[r][c] += y[r] * x[c];
    }
    const dec = svd(H);
    let V = dec.V;
    let R = mul(V, transposta(dec.U));
    if (det3(R) < 0) {
      V = V.map((row) => row.slice());
      let j = 0;
      if (dec.S[1] < dec.S[j]) j = 1;
      if (dec.S[2] < dec.S[j]) j = 2;
      for (let i = 0; i < 3; i++) V[i][j] *= -1;
      R = mul(V, transposta(dec.U));
    }
    return { R, cp, cq };
  }

  function aplicarPonto(p, tr) {
    const y = [p.x - tr.cq[0], p.y - tr.cq[1], p.z - tr.cq[2]];
    return {
      x: tr.R[0][0] * y[0] + tr.R[0][1] * y[1] + tr.R[0][2] * y[2] + tr.cp[0],
      y: tr.R[1][0] * y[0] + tr.R[1][1] * y[1] + tr.R[1][2] * y[2] + tr.cp[1],
      z: tr.R[2][0] * y[0] + tr.R[2][1] * y[1] + tr.R[2][2] * y[2] + tr.cp[2],
    };
  }

  function campoCoord(n) {
    const s = Number(n).toFixed(3);
    return s.length > 8 ? s.slice(0, 8) : s.padStart(8, " ");
  }

  function transformarPdb(texto, tr) {
    return String(texto || "").replace(/\r\n/g, "\n").split("\n").map((linha) => {
      if (!linha.startsWith("ATOM") && !linha.startsWith("HETATM")) return linha;
      const x = parseFloat(linha.substring(30, 38));
      const y = parseFloat(linha.substring(38, 46));
      const z = parseFloat(linha.substring(46, 54));
      if (!Number.isFinite(x)) return linha;
      const p = aplicarPonto({ x, y, z }, tr);
      const base = linha.length < 54 ? linha.padEnd(54, " ") : linha;
      return base.slice(0, 30) + campoCoord(p.x) + campoCoord(p.y) + campoCoord(p.z) + base.slice(54);
    }).join("\n");
  }

  function rmsd(P, Q, tr) {
    if (!P.length) return null;
    let s = 0;
    for (let i = 0; i < P.length; i++) {
      const q = aplicarPonto(Q[i], tr);
      s += (q.x - P[i].x) ** 2 + (q.y - P[i].y) ** 2 + (q.z - P[i].z) ** 2;
    }
    return Math.sqrt(s / P.length);
  }

  function plddtDoAtomo(atomo, confianca) {
    if (confianca && confianca.has(atomo.resseq)) return confianca.get(atomo.resseq);
    return atomo.bfactor;
  }

  return {
    SWISS_URL,
    AF_API,
    PDBE_MAP,
    detectar,
    parseSeqres,
    fastaCadeia,
    reconstruirUnico,
    acessoDe,
    declaracoesDaCadeia,
    uniprotDoPdbe,
    uniprotDeAuth,
    linksPublicos,
    normalizarPredicao,
    lerConfianca,
    atomosPdb,
    casDe,
    corPlddt,
    faixaPlddt,
    media,
    kabsch,
    aplicarPonto,
    transformarPdb,
    rmsd,
    plddtDoAtomo,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = LacunasModelo;
if (typeof globalThis !== "undefined") globalThis.LacunasModelo = LacunasModelo;
