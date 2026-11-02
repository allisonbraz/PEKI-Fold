// PrepAnalysis — ficha de preparo geométrico do PEKI Fold.
// Roda 100% no navegador (ou em Node, para teste). Não faz docking,
// dinâmica, minimização, protonação nem cálculo de afinidade.
// Contato geométrico não é contribuição energética.
//
// Colunas no formato PDB fixo (wwPDB v3.3), conferidas em arquivos do RCSB.

"use strict";

const PrepAnalysis = (() => {
  const VERSAO = "preparo-1";

  const RAIOS_PADRAO = Object.freeze({
    metal: 2.8,
    dissulfeto: 2.5,
    glicosilacao: 1.8,
    histidina: 3.2,
    enterramento: 6.0,
    margemVina: 4,
  });

  const FRASES = Object.freeze({
    contato: "Contato geométrico não é contribuição energética.",
    escore: "Escore de docking não é afinidade.",
    auxiliar:
      "Ficha auxiliar: exige conferência humana. Não faz docking, dinâmica molecular, minimização, protonação nem cálculo de afinidade.",
    serial:
      "O número de série é o do arquivo original. Ele muda se outro programa renumerar os átomos. Não serve como identificador depois dessa renumeração.",
    predita:
      "Estrutura predita: o pLDDT, quando está no fator de temperatura, indica a confiança por resíduo. Ele não informa se um pocket está em estado apo ou holo.",
    vina: "Sugestão editável de caixa. Não é uma caixa validada e não é resultado de docking.",
    protonacao:
      "Indício geométrico, não protonação. Sem hidrogênios no arquivo, a geometria não separa tautômeros com segurança.",
    tleap:
      "Rascunho. Não é um arquivo de entrada pronto. A numeração pode mudar depois do loadpdb e precisa ser conferida.",
    gap: "Lacuna de numeração não prova resíduo faltante. O REMARK 465 confirma quando ele existe.",
    acucar: "O nome GLYCAM do açúcar não sai da geometria.",
    descritor:
      "O drugScore e o volume do DoGSite são descritores geométricos da cavidade, não previsão de ligação.",
  });

  const AA = new Set([
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
    "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
  ]);

  // HOH conferido no Chemical Component Dictionary. WAT, H2O e DOD são
  // aliases que aparecem em arquivos escritos por outros programas.
  const AGUAS = new Set(["HOH", "WAT", "H2O", "DOD"]);

  // Códigos conferidos no Chemical Component Dictionary do RCSB em nov/2026.
  // HEP não entra: nesse dicionário HEP não é HEPES (HEPES é EPE).
  const ADITIVOS = new Set([
    "GOL", "EDO", "PEG", "PG4", "PGE", "1PE", "MPD", "MRD",
    "ACT", "SO4", "PO4", "DMS", "TRS", "MES", "EPE",
    "IPA", "MOH", "EOH", "FMT", "ACY", "CIT", "NO3", "SCN",
  ]);

  // Monossacarídeos conferidos no mesmo dicionário. A lista é parcial:
  // HETNAM e o par geométrico ND2–C1 cobrem o que ficar de fora.
  const ACUCARES = new Set([
    "NAG", "NDG", "BMA", "MAN", "GLC", "BGC", "GAL", "GLA",
    "FUC", "FUL", "SIA", "XYS", "XYP", "A2G",
  ]);

  const METAIS = new Set([
    "LI", "NA", "K", "RB", "CS",
    "BE", "MG", "CA", "SR", "BA",
    "SC", "TI", "V", "CR", "MN", "FE", "CO", "NI", "CU", "ZN",
    "Y", "ZR", "NB", "MO", "RU", "RH", "PD", "AG", "CD",
    "HF", "TA", "W", "RE", "OS", "IR", "PT", "AU", "HG",
    "AL", "GA", "IN", "SN", "TL", "PB", "BI",
    "LA", "CE", "PR", "ND", "SM", "EU", "GD", "TB", "DY", "HO", "ER", "TM", "YB", "LU",
    "U", "TH",
  ]);

  const IONS_NAO_METAL = new Set(["CL", "BR", "I", "F"]);
  const RES_HALETO = new Set(["CL", "BR", "IOD"]);

  function normalizarTexto(texto) {
    return String(texto || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function linhasDe(texto) {
    return normalizarTexto(texto).split("\n");
  }

  function contarModelos(texto) {
    return (normalizarTexto(texto).match(/^MODEL\s/gm) || []).length;
  }

  function primeiroModelo(texto) {
    const norm = normalizarTexto(texto);
    if (!/^MODEL\s/m.test(norm)) return norm;
    const out = [];
    for (const l of norm.split("\n")) {
      out.push(l);
      if (l.startsWith("ENDMDL")) break;
    }
    return out.join("\n") + "\n";
  }

  function registro(linha) {
    return linha.substring(0, 6).trim();
  }

  function cadeiaDe(ch) {
    return !ch || ch === " " ? "_" : ch;
  }

  function numCol(linha, a, b) {
    if (linha.length < a) return null;
    const n = parseFloat(linha.substring(a, b));
    return Number.isFinite(n) ? n : null;
  }

  function intCol(linha, a, b) {
    if (linha.length < a) return null;
    const n = parseInt(linha.substring(a, b), 10);
    return Number.isFinite(n) ? n : null;
  }

  function resolverElemento(nomeBruto, nome, resname, hetatm, coluna) {
    if (coluna) return { elemento: coluna, fonte: "coluna" };
    if (hetatm) {
      if (nomeBruto[0] !== " " && METAIS.has(nome)) return { elemento: nome, fonte: "nome" };
      if (METAIS.has(resname) && nome === resname) return { elemento: resname, fonte: "residuo" };
    }
    if (nomeBruto[0] === " ") {
      const ch = nomeBruto[1].trim().toUpperCase();
      if (/^[A-Z]$/.test(ch)) return { elemento: ch, fonte: "nome" };
    }
    return { elemento: "", fonte: "ausente" };
  }

  function parseAtomos(texto) {
    const atomos = [];
    let indice = 0;
    for (const linha of linhasDe(primeiroModelo(texto))) {
      const rec = registro(linha);
      if (rec !== "ATOM" && rec !== "HETATM") continue;
      const nomeBruto = (linha.substring(12, 16) + "    ").slice(0, 4);
      const nome = nomeBruto.trim().toUpperCase();
      const resname = linha.substring(17, 20).trim().toUpperCase();
      const hetatm = rec === "HETATM";
      const coluna = linha.length >= 78 ? linha.substring(76, 78).trim().toUpperCase() : "";
      const el = resolverElemento(nomeBruto, nome, resname, hetatm, coluna);
      const alt = linha.charAt(16);
      const ic = linha.charAt(26);
      const atom = {
        registro: rec,
        serial: intCol(linha, 6, 11),
        nome,
        nomeBruto,
        altloc: alt && alt !== " " ? alt.toUpperCase() : "",
        resname,
        cadeia: cadeiaDe(linha.charAt(21)),
        resseq: intCol(linha, 22, 26),
        icode: ic && ic !== " " ? ic.toUpperCase() : "",
        x: numCol(linha, 30, 38),
        y: numCol(linha, 38, 46),
        z: numCol(linha, 46, 54),
        occupancy: numCol(linha, 54, 60),
        bfactor: numCol(linha, 60, 66),
        elemento: el.elemento,
        elementoFonte: el.fonte,
        linha,
        indice: indice++,
      };
      atom.chaveRes = [atom.resname, atom.cadeia, atom.resseq, atom.icode].join("|");
      atom.metal = METAIS.has(atom.elemento) && (hetatm || atom.resname === atom.elemento);
      atom.agua = AGUAS.has(atom.resname);
      atomos.push(atom);
    }
    return atomos;
  }

  function fimLink(linha, base) {
    const nome = linha.substring(base, base + 5).trim().toUpperCase();
    const alt = linha.charAt(base + 5);
    const resname = linha.substring(base + 6, base + 9).trim().toUpperCase();
    const cadeia = cadeiaDe(linha.charAt(base + 10));
    const resseq = intCol(linha, base + 11, base + 15);
    const ic = linha.charAt(base + 15);
    return {
      nome,
      altloc: alt && alt !== " " ? alt.toUpperCase() : "",
      resname,
      cadeia,
      resseq,
      icode: ic && ic !== " " ? ic.toUpperCase() : "",
    };
  }

  function simetriaIdentidade(sym) {
    const s = String(sym || "").replace(/[\s_]/g, "");
    return s === "" || s === "1555";
  }

  function parseLinks(texto) {
    const links = [];
    for (const linha of linhasDe(primeiroModelo(texto))) {
      if (registro(linha) !== "LINK") continue;
      const a = fimLink(linha, 11);
      const b = fimLink(linha, 41);
      const simA = linha.substring(58, 65).trim();
      const simB = linha.substring(66, 73).trim();
      links.push({
        a, b,
        simetriaA: simA,
        simetriaB: simB,
        identidade: simetriaIdentidade(simA) && simetriaIdentidade(simB),
        distancia: numCol(linha, 73, 78),
        linha: linha.trim(),
      });
    }
    return links;
  }

  function parseSsbond(texto) {
    const regs = [];
    for (const linha of linhasDe(primeiroModelo(texto))) {
      if (!linha.startsWith("SSBOND")) continue;
      const res1 = linha.substring(11, 14).trim().toUpperCase();
      const res2 = linha.substring(25, 28).trim().toUpperCase();
      const ic1 = linha.charAt(21);
      const ic2 = linha.charAt(35);
      const simA = linha.substring(59, 65).trim();
      const simB = linha.substring(66, 72).trim();
      regs.push({
        ser: intCol(linha, 7, 10),
        a: {
          resname: res1,
          cadeia: cadeiaDe(linha.charAt(15)),
          resseq: intCol(linha, 17, 21),
          icode: ic1 && ic1 !== " " ? ic1.toUpperCase() : "",
        },
        b: {
          resname: res2,
          cadeia: cadeiaDe(linha.charAt(29)),
          resseq: intCol(linha, 31, 35),
          icode: ic2 && ic2 !== " " ? ic2.toUpperCase() : "",
        },
        simetriaA: simA,
        simetriaB: simB,
        identidade: simetriaIdentidade(simA) && simetriaIdentidade(simB),
        distancia: numCol(linha, 73, 78),
        linha: linha.trim(),
      });
    }
    return regs;
  }

  function parseHetnam(texto) {
    const nomes = {};
    for (const linha of linhasDe(texto)) {
      if (registro(linha) !== "HETNAM") continue;
      const id = linha.substring(11, 14).trim().toUpperCase();
      const txt = linha.substring(15).trim();
      if (!id) continue;
      nomes[id] = (nomes[id] ? nomes[id] + " " : "") + txt;
    }
    for (const k of Object.keys(nomes)) nomes[k] = nomes[k].replace(/\s+/g, " ").trim();
    return nomes;
  }

  function parseRemark465(texto) {
    const itens = [];
    for (const linha of linhasDe(texto)) {
      if (!linha.startsWith("REMARK 465")) continue;
      const m = linha.match(/^REMARK 465\s+(?:\d+\s+)?([A-Z0-9]{3})\s+([A-Za-z0-9])\s+(-?\d+)([A-Za-z])?\s*$/);
      if (!m) continue;
      itens.push({
        resname: m[1].toUpperCase(),
        cadeia: cadeiaDe(m[2]),
        resseq: parseInt(m[3], 10),
        icode: m[4] ? m[4].toUpperCase() : "",
      });
    }
    return itens;
  }

  function dist(a, b) {
    if (a.x == null || b.x == null) return Infinity;
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  function altlocCompativel(a, b) {
    if (!a.altloc || !b.altloc) return true;
    return a.altloc === b.altloc;
  }

  function mesmoAtomo(a, fim) {
    if (!fim) return false;
    if (a.cadeia !== fim.cadeia) return false;
    if (a.resseq !== fim.resseq) return false;
    if ((a.icode || "") !== (fim.icode || "")) return false;
    if (a.resname !== fim.resname) return false;
    if (a.nome !== fim.nome) return false;
    if (fim.altloc && a.altloc !== fim.altloc) return false;
    return true;
  }

  function mesmoResiduo(a, fim) {
    return a.cadeia === fim.cadeia && a.resseq === fim.resseq && (a.icode || "") === (fim.icode || "");
  }

  function raioSeguro(v, padrao) {
    const n = Number(v);
    if (!Number.isFinite(n)) return padrao;
    if (n < 0) return 0;
    if (n > 15) return 15;
    return n;
  }

  function normalizarRaios(op) {
    const o = op || {};
    return {
      metal: raioSeguro(o.raioMetal, RAIOS_PADRAO.metal),
      dissulfeto: raioSeguro(o.raioDissulfeto != null ? o.raioDissulfeto : o.raioSS, RAIOS_PADRAO.dissulfeto),
      glicosilacao: raioSeguro(o.raioGlicosilacao != null ? o.raioGlicosilacao : o.raioGlic, RAIOS_PADRAO.glicosilacao),
      histidina: raioSeguro(o.raioHistidina != null ? o.raioHistidina : o.raioHis, RAIOS_PADRAO.histidina),
    };
  }

  function hetnamPareceAcucar(nome) {
    return /pyranose|furanose|neuraminic|fucose|mannose|glucose|galactose|xylose|glucosamine/i.test(nome || "");
  }

  function classeHet(grupo, hetnomes) {
    const res = grupo.resname;
    const nome = hetnomes[res] || "";
    if (AGUAS.has(res)) return "agua";
    if (grupo.atomos.every((a) => a.metal)) return "metal";
    if (grupo.atomos.length === 1 && (IONS_NAO_METAL.has(grupo.atomos[0].elemento) || RES_HALETO.has(res))) {
      return "ion-nao-metal";
    }
    if (ACUCARES.has(res) || hetnamPareceAcucar(nome)) return "acucar";
    if (ADITIVOS.has(res)) return "aditivo";
    return "nao-classificado";
  }

  function rotuloClasse(c) {
    return {
      agua: "água",
      metal: "íon metálico",
      "ion-nao-metal": "íon não metálico",
      acucar: "açúcar",
      aditivo: "aditivo frequente de cristalização",
      "nao-classificado": "não classificado (ligante, cofator, lipídio ou outro)",
    }[c] || c;
  }

  function inventario(texto) {
    const pdb = primeiroModelo(texto);
    const atomos = parseAtomos(pdb);
    const hetnomes = parseHetnam(texto);
    const remark = parseRemark465(texto);
    const porCadeia = new Map();

    function bucket(cid) {
      if (!porCadeia.has(cid)) {
        porCadeia.set(cid, {
          cadeia: cid, atom: 0, hetatm: 0, aguas: new Set(),
          altlocAtomos: 0, altlocResiduos: new Set(), anisou: 0, insercoes: new Set(),
        });
      }
      return porCadeia.get(cid);
    }

    for (const a of atomos) {
      const b = bucket(a.cadeia);
      if (a.registro === "ATOM") b.atom += 1;
      else b.hetatm += 1;
      if (a.agua) b.aguas.add(a.chaveRes);
      if (a.altloc) {
        b.altlocAtomos += 1;
        b.altlocResiduos.add(a.chaveRes + "|" + a.nome);
      }
      if (a.icode) b.insercoes.add(a.resname + " " + a.resseq + a.icode);
    }
    for (const linha of pdb.split("\n")) {
      if (!linha.startsWith("ANISOU")) continue;
      const cid = cadeiaDe(linha.charAt(21));
      bucket(cid).anisou += 1;
    }

    const grupos = new Map();
    for (const a of atomos) {
      if (a.registro !== "HETATM") continue;
      if (!grupos.has(a.chaveRes)) {
        grupos.set(a.chaveRes, {
          chave: a.chaveRes, resname: a.resname, cadeia: a.cadeia,
          resseq: a.resseq, icode: a.icode, atomos: [],
        });
      }
      grupos.get(a.chaveRes).atomos.push(a);
    }

    const porResname = new Map();
    for (const g of grupos.values()) {
      g.classe = classeHet(g, hetnomes);
      g.contemMetal = g.atomos.some((a) => a.metal);
      if (!porResname.has(g.resname)) {
        porResname.set(g.resname, {
          resname: g.resname,
          nome: hetnomes[g.resname] || "",
          classe: g.classe,
          classeRotulo: rotuloClasse(g.classe),
          copias: [],
          nAtomos: 0,
          contemMetal: false,
        });
      }
      const dest = porResname.get(g.resname);
      if (g.contemMetal) dest.contemMetal = true;
      dest.nAtomos += g.atomos.length;
      const occs = g.atomos.map((a) => a.occupancy).filter((v) => v != null);
      dest.copias.push({
        chave: g.chave,
        cadeia: g.cadeia,
        resseq: g.resseq,
        icode: g.icode,
        nAtomos: g.atomos.length,
        altlocs: [...new Set(g.atomos.map((a) => a.altloc).filter(Boolean))],
        occupancyMin: occs.length ? Math.min(...occs) : null,
      });
    }

    const hets = [...porResname.values()].sort((a, b) => a.resname.localeCompare(b.resname));
    for (const h of hets) {
      h.copias.sort((a, b) => a.cadeia.localeCompare(b.cadeia) || a.resseq - b.resseq || a.icode.localeCompare(b.icode));
    }

    const cadeias = [...porCadeia.values()];
    const alertas = [];
    for (const c of cadeias) {
      if (c.altlocAtomos) {
        alertas.push(
          `A cadeia ${rotuloCadeia(c.cadeia)} tem conformação alternativa em ${c.altlocAtomos} átomo(s) ` +
          `(${c.altlocResiduos.size} resíduo(s)/átomo com altloc).`
        );
      }
      if (c.anisou) alertas.push(`A cadeia ${rotuloCadeia(c.cadeia)} tem ${c.anisou} linha(s) ANISOU.`);
      if (c.insercoes.size) {
        alertas.push(`A cadeia ${rotuloCadeia(c.cadeia)} tem código de inserção: ${[...c.insercoes].join(", ")}.`);
      }
    }

    const polymer = [];
    const visto = new Set();
    for (const a of atomos) {
      if (a.registro !== "ATOM" || !AA.has(a.resname) || a.resseq == null) continue;
      const k = a.cadeia + "|" + a.resseq + "|" + a.icode;
      if (visto.has(k)) continue;
      visto.add(k);
      polymer.push({ cadeia: a.cadeia, resseq: a.resseq, icode: a.icode, resname: a.resname });
    }
    const porPol = new Map();
    for (const r of polymer) {
      if (!porPol.has(r.cadeia)) porPol.set(r.cadeia, []);
      porPol.get(r.cadeia).push(r);
    }
    const remarkSet = new Set(remark.map((r) => r.cadeia + "|" + r.resseq));
    const lacunas = [];
    for (const [cid, lista] of porPol) {
      lista.sort((a, b) => a.resseq - b.resseq || a.icode.localeCompare(b.icode));
      for (let i = 1; i < lista.length; i++) {
        const prev = lista[i - 1];
        const cur = lista[i];
        if (cur.resseq <= prev.resseq + 1) continue;
        const numeros = [];
        for (let n = prev.resseq + 1; n < cur.resseq; n++) {
          numeros.push({
            resseq: n,
            noRemark465: remarkSet.has(cid + "|" + n),
          });
        }
        lacunas.push({
          cadeia: cid,
          de: prev.resseq,
          ate: cur.resseq,
          numeros,
          confirmados: numeros.filter((n) => n.noRemark465).length,
        });
      }
    }
    if (lacunas.length) alertas.push(FRASES.gap);

    const semElemento = atomos.filter((a) => a.elementoFonte !== "coluna").length;
    if (semElemento) {
      alertas.push(
        `${semElemento} átomo(s) sem elemento nas colunas 77–78, ou com elemento inferido pelo nome. ` +
        "O carbono alfa (nome CA, elemento C) não é tratado como cálcio."
      );
    }
    const metalAtom = atomos.filter((a) => METAIS.has(a.elemento) && !a.metal);
    if (metalAtom.length) {
      alertas.push(
        `${metalAtom.length} átomo(s) com elemento metálico em registro que não entrou na lista de íons ` +
        "(não é HETATM nem resíduo cujo nome é o próprio metal)."
      );
    }

    let maxResProteina = null;
    for (const r of polymer) if (maxResProteina == null || r.resseq > maxResProteina) maxResProteina = r.resseq;

    return {
      cadeias: cadeias.map((c) => ({
        cadeia: c.cadeia,
        atom: c.atom,
        hetatm: c.hetatm,
        aguas: c.aguas.size,
        altlocAtomos: c.altlocAtomos,
        altlocResiduos: c.altlocResiduos.size,
        anisou: c.anisou,
        insercoes: [...c.insercoes],
      })),
      hets,
      alertas,
      lacunas,
      remark465: remark,
      anisou: [...porCadeia.values()].reduce((s, c) => s + c.anisou, 0),
      aguas: atomos.filter((a) => a.agua).reduce((set, a) => set.add(a.chaveRes), new Set()).size,
      semElemento,
      maxResProteina,
      nAtomos: atomos.length,
    };
  }

  function rotuloCadeia(c) {
    return c === "_" ? "(sem id)" : c;
  }

  function rotuloRes(a) {
    return `${a.resname} ${rotuloCadeia(a.cadeia)} ${a.resseq}${a.icode || ""}`;
  }

  function linkUne(link, x, y) {
    const xa = mesmoAtomo(x, link.a);
    const xb = mesmoAtomo(x, link.b);
    const ya = mesmoAtomo(y, link.a);
    const yb = mesmoAtomo(y, link.b);
    return (xa && yb) || (xb && ya);
  }

  function vizinhosMetal(atomos, links, raio) {
    const metais = atomos.filter((a) => a.metal && a.x != null);
    const doadores = atomos.filter((a) => a.x != null && (a.elemento === "N" || a.elemento === "O" || a.elemento === "S"));
    const contagemEl = {};
    const lista = metais.map((m) => {
      contagemEl[m.elemento] = (contagemEl[m.elemento] || 0) + 1;
      const n = contagemEl[m.elemento];
      const vizinhos = [];
      for (const d of doadores) {
        if (d.indice === m.indice) continue;
        if (!altlocCompativel(m, d)) continue;
        const distancia = dist(m, d);
        if (distancia <= raio + 1e-6) {
          vizinhos.push({
            elemento: d.elemento,
            nome: d.nome,
            resname: d.resname,
            cadeia: d.cadeia,
            resseq: d.resseq,
            icode: d.icode,
            altloc: d.altloc,
            serial: d.serial,
            chaveRes: d.chaveRes,
            agua: d.agua,
            distancia,
            noLink: false,
            notas: [],
            atom: d,
          });
        }
      }
      vizinhos.sort((a, b) => a.distancia - b.distancia);
      return {
        nomeArquivo: `${m.elemento}${n}.pdb`,
        elemento: m.elemento,
        resname: m.resname,
        cadeia: m.cadeia,
        resseq: m.resseq,
        icode: m.icode,
        altloc: m.altloc,
        serial: m.serial,
        occupancy: m.occupancy,
        bfactor: m.bfactor,
        x: m.x, y: m.y, z: m.z,
        registro: m.registro,
        elementoFonte: m.elementoFonte,
        chaveRes: m.chaveRes,
        atom: m,
        vizinhos,
      };
    });

    const metalLinks = links.filter((lk) => {
      if (METAIS.has(lk.a.resname) || METAIS.has(lk.b.resname)) return true;
      return metais.some((m) => mesmoAtomo(m, lk.a) || mesmoAtomo(m, lk.b));
    }).map((lk) => ({ ...lk, coberto: false }));

    for (const m of lista) {
      for (const v of m.vizinhos) {
        const hit = metalLinks.find((lk) => lk.identidade && linkUne(lk, m.atom, v.atom));
        v.noLink = !hit;
        if (hit) hit.coberto = true;
        if ((v.resname === "CYS" || v.resname === "CYX") && v.nome === "SG") {
          v.notas.push("Cisteína pelo SG: candidata a CYM, se a coordenação for confirmada. A ficha não renomeia o resíduo.");
        }
        if (v.resname === "HIS" && v.nome === "NE2") {
          v.notas.push("Histidina pelo NE2: candidata a HID. " + FRASES.protonacao);
        }
        if (v.resname === "HIS" && v.nome === "ND1") {
          v.notas.push("Histidina pelo ND1: candidata a HIE. " + FRASES.protonacao);
        }
        if (v.agua) v.notas.push("Água no raio. Pode ser ligante ou artefato de cristalização.");
      }
      const porRes = new Map();
      for (const v of m.vizinhos) {
        if (!porRes.has(v.chaveRes)) porRes.set(v.chaveRes, []);
        porRes.get(v.chaveRes).push(v);
      }
      for (const grupo of porRes.values()) {
      const os = grupo.filter((v) => v.elemento === "O");
      if (os.length >= 2) {
        const carbox = grupo.some((v) => v.resname === "ASP" || v.resname === "GLU");
        const msg = carbox
          ? "Mais de um átomo O deste resíduo está no raio (Asp/Glu mono ou bidentado: a decidir)."
          : "Mais de um átomo O deste resíduo está no raio.";
        for (const v of grupo) v.notas.push(msg);
      }
        const his = grupo.filter((v) => v.resname === "HIS");
        if (his.some((v) => v.nome === "ND1") && his.some((v) => v.nome === "NE2")) {
          for (const v of his) v.notas.push("ND1 e NE2 desta histidina estão no raio: candidato ambíguo.");
        }
      }
    }

    const aguaMetais = new Map();
    lista.forEach((m, i) => {
      for (const v of m.vizinhos) {
        if (!v.agua) continue;
        if (!aguaMetais.has(v.chaveRes)) aguaMetais.set(v.chaveRes, []);
        aguaMetais.get(v.chaveRes).push(i);
      }
    });
    const aguasEntre = [];
    for (const [chave, idxs] of aguaMetais) {
      const unicos = [...new Set(idxs)];
      if (unicos.length < 2) continue;
      aguasEntre.push({ chave, metais: unicos.map((i) => lista[i].nomeArquivo) });
      for (const i of unicos) {
        for (const v of lista[i].vizinhos) {
          if (v.chaveRes === chave) {
            v.notas.push("Esta água está no raio de mais de um metal. Pode ser ponte. Não remova sem conferir.");
          }
        }
      }
    }

    return { metais: lista, links: metalLinks, aguasEntre, raio };
  }

  function paresSS(atomos, ssbonds, raio) {
    const sgs = atomos.filter((a) => a.nome === "SG" && (a.resname === "CYS" || a.resname === "CYX") && a.x != null);
    const pares = [];
    for (let i = 0; i < sgs.length; i++) {
      for (let j = i + 1; j < sgs.length; j++) {
        const a = sgs[i];
        const b = sgs[j];
        if (a.chaveRes === b.chaveRes) continue;
        if (!altlocCompativel(a, b)) continue;
        const distancia = dist(a, b);
        if (distancia <= raio + 1e-6) pares.push({ a, b, distancia, noSsbond: true });
      }
    }
    pares.sort((p, q) => p.distancia - q.distancia);
    const registros = ssbonds.map((r) => ({ ...r, coberto: false }));
    for (const p of pares) {
      const hit = registros.find((r) => r.identidade && (
        (mesmoResiduo(p.a, r.a) && mesmoResiduo(p.b, r.b)) ||
        (mesmoResiduo(p.a, r.b) && mesmoResiduo(p.b, r.a))
      ));
      p.noSsbond = !hit;
      if (hit) hit.coberto = true;
    }
    return { pares, registros, raio };
  }

  function glicosilacao(atomos, links, hetnomes, raio, maxResProteina) {
    function ehAcucarRes(resname) {
      return ACUCARES.has(resname) || hetnamPareceAcucar(hetnomes[resname]);
    }
    const acucarAtomos = atomos.filter((a) => a.registro === "HETATM" && ehAcucarRes(a.resname) && a.x != null);
    const nd2 = atomos.filter((a) => a.resname === "ASN" && a.nome === "ND2" && a.x != null);
    const c1conhecidos = acucarAtomos.filter((a) => a.nome === "C1");
    const c1todos = atomos.filter((a) => a.registro === "HETATM" && a.nome === "C1" && a.x != null);

    const pares = [];
    function considerar(asn, c1, conhecido) {
      if (!altlocCompativel(asn, c1)) return;
      const distancia = dist(asn, c1);
      if (distancia <= raio + 1e-6) pares.push({ asn, acucar: c1, distancia, conhecido, noLink: true });
    }
    for (const asn of nd2) {
      for (const c1 of c1conhecidos) considerar(asn, c1, true);
      for (const c1 of c1todos) {
        if (ehAcucarRes(c1.resname)) continue;
        considerar(asn, c1, false);
      }
    }
    pares.sort((a, b) => a.distancia - b.distancia);

    function ehAsnC1(lk) {
      const asn = (f) => f.resname === "ASN" && f.nome === "ND2";
      const c1 = (f) => f.nome === "C1";
      return (asn(lk.a) && c1(lk.b)) || (asn(lk.b) && c1(lk.a));
    }
    const linksAsn = links.filter(ehAsnC1).map((lk) => ({ ...lk, coberto: false }));
    for (const p of pares) {
      const hit = linksAsn.find((lk) => lk.identidade && linkUne(lk, p.asn, p.acucar));
      p.noLink = !hit;
      if (hit) hit.coberto = true;
    }

    const residuos = new Map();
    for (const a of acucarAtomos) {
      if (!residuos.has(a.chaveRes)) {
        residuos.set(a.chaveRes, {
          chave: a.chaveRes, resname: a.resname, cadeia: a.cadeia,
          resseq: a.resseq, icode: a.icode, nome: hetnomes[a.resname] || "", atomos: [],
        });
      }
      residuos.get(a.chaveRes).atomos.push(a);
    }
    const chaves = [...residuos.keys()];
    const pai = new Map(chaves.map((k) => [k, k]));
    function achar(k) {
      while (pai.get(k) !== k) { pai.set(k, pai.get(pai.get(k))); k = pai.get(k); }
      return k;
    }
    function unir(a, b) { pai.set(achar(a), achar(b)); }
    for (let i = 0; i < chaves.length; i++) {
      for (let j = i + 1; j < chaves.length; j++) {
        const A = residuos.get(chaves[i]).atomos;
        const B = residuos.get(chaves[j]).atomos;
        let perto = false;
        for (const a of A) {
          for (const b of B) {
            if (!altlocCompativel(a, b)) continue;
            if (dist(a, b) <= raio + 1e-6) { perto = true; break; }
          }
          if (perto) break;
        }
        if (perto) unir(chaves[i], chaves[j]);
      }
    }
    const comps = new Map();
    for (const k of chaves) {
      const r = achar(k);
      if (!comps.has(r)) comps.set(r, []);
      comps.get(r).push(residuos.get(k));
    }
    let seq = (maxResProteina || 0) + 1;
    const ordenados = [...comps.values()].map((lista) =>
      lista.sort((a, b) => a.cadeia.localeCompare(b.cadeia) || a.resseq - b.resseq || a.icode.localeCompare(b.icode))
    );
    ordenados.sort((a, b) => a[0].cadeia.localeCompare(b[0].cadeia) || a[0].resseq - b[0].resseq);
    const arvores = ordenados.map((lista, idx) => {
      const itens = lista.map((r) => {
        const numeroSugerido = seq++;
        const asns = pares
          .filter((p) => p.conhecido && p.acucar.chaveRes === r.chave)
          .map((p) => rotuloRes(p.asn));
        return { ...r, atomos: undefined, numeroSugerido, asns };
      });
      return { id: idx + 1, residuos: itens };
    });

    return { pares, linksAsnC1: linksAsn, arvores, raio, maxResProteina };
  }

  function histidinas(atomos, raio, raioMetal) {
    const porRes = new Map();
    for (const a of atomos) {
      if (a.resname !== "HIS") continue;
      if (!porRes.has(a.chaveRes)) porRes.set(a.chaveRes, []);
      porRes.get(a.chaveRes).push(a);
    }
    const polares = atomos.filter((a) => a.x != null && (a.elemento === "N" || a.elemento === "O" || a.elemento === "S" || a.metal));
    const pesados = atomos.filter((a) => a.x != null && a.elemento !== "H" && a.elemento !== "D");
    const itens = [];
    for (const grupo of porRes.values()) {
      const base = grupo[0];
      const nd1 = grupo.find((a) => a.nome === "ND1");
      const ne2 = grupo.find((a) => a.nome === "NE2");
      function vizinhosDe(centro) {
        if (!centro) return [];
        const out = [];
        for (const p of polares) {
          if (p.chaveRes === centro.chaveRes) continue;
          if (!altlocCompativel(centro, p)) continue;
          const distancia = dist(centro, p);
          if (distancia <= raio + 1e-6) {
            out.push({
              nome: p.nome, resname: p.resname, cadeia: p.cadeia, resseq: p.resseq,
              icode: p.icode, elemento: p.elemento, metal: p.metal, distancia, agua: p.agua,
            });
          }
        }
        out.sort((a, b) => a.distancia - b.distancia);
        return out;
      }
      const v1 = vizinhosDe(nd1);
      const v2 = vizinhosDe(ne2);
      const m1 = v1.filter((v) => v.metal).length;
      const m2 = v2.filter((v) => v.metal).length;
      const dMetal = (viz) => {
        const m = viz.find((v) => v.metal);
        return m ? m.distancia : null;
      };
      const corteMetal = raioMetal == null ? RAIOS_PADRAO.metal : raioMetal;
      const frase = (sigla, atomoNome, d) => {
        const fora = d > corteMetal + 1e-6 ? ` Fora do raio de ${corteMetal} Å usado na seção de íons.` : "";
        return `candidata a ${sigla} — ${atomoNome} a ${d.toFixed(2)} Å de um metal.${fora}`;
      };
      let candidato = "nenhum";
      let texto = "sem candidato automático";
      if (m2 > 0 && m1 === 0) {
        candidato = "HID";
        texto = frase("HID", "NE2", dMetal(v2));
      } else if (m1 > 0 && m2 === 0) {
        candidato = "HIE";
        texto = frase("HIE", "ND1", dMetal(v1));
      } else if (m1 > 0 && m2 > 0) {
        candidato = "ambigua";
        texto = `ambígua — ND1 a ${dMetal(v1).toFixed(2)} Å e NE2 a ${dMetal(v2).toFixed(2)} Å de metal`;
      }
      let enterramento = null;
      if (nd1 && ne2 && nd1.x != null && ne2.x != null) {
        const meio = { x: (nd1.x + ne2.x) / 2, y: (nd1.y + ne2.y) / 2, z: (nd1.z + ne2.z) / 2 };
        enterramento = 0;
        for (const p of pesados) {
          if (p.chaveRes === base.chaveRes) continue;
          if (dist(meio, p) <= RAIOS_PADRAO.enterramento + 1e-6) enterramento += 1;
        }
      }
      itens.push({
        cadeia: base.cadeia,
        resseq: base.resseq,
        icode: base.icode,
        altloc: base.altloc,
        temND1: !!nd1,
        temNE2: !!ne2,
        vizND1: v1,
        vizNE2: v2,
        metaisND1: m1,
        metaisNE2: m2,
        enterramento,
        candidato,
        texto,
      });
    }
    itens.sort((a, b) => a.cadeia.localeCompare(b.cadeia) || a.resseq - b.resseq || a.icode.localeCompare(b.icode));
    return { itens, raio, raioEnterramento: RAIOS_PADRAO.enterramento };
  }

  function linhasBond(ss, glic) {
    const linhas = [];
    linhas.push("# Rascunho de linhas bond para o tleap (AmberTools).");
    linhas.push("# " + FRASES.tleap);
    linhas.push("# " + FRASES.contato);
    linhas.push("# A cadeia não entra no nome do átomo. Números iguais em cadeias diferentes ficam ambíguos.");
    if (!ss.pares.length && !glic.pares.length) {
      linhas.push("# Nenhum par SG–SG nem ND2–C1 dentro do raio.");
      return linhas.join("\n") + "\n";
    }
    for (const p of ss.pares) {
      linhas.push(`# Dissulfeto ${rotuloRes(p.a)} SG — ${rotuloRes(p.b)} SG, ${p.distancia.toFixed(2)} Å. ${p.noSsbond ? "Não consta no SSBOND de simetria 1555." : "Consta no SSBOND."}`);
      linhas.push(`bond <unidade>.${p.a.resseq}${p.a.icode}.SG <unidade>.${p.b.resseq}${p.b.icode}.SG`);
    }
    for (const p of glic.pares) {
      linhas.push(`# ${rotuloRes(p.asn)} ND2 — ${rotuloRes(p.acucar)} C1, ${p.distancia.toFixed(2)} Å. ${p.conhecido ? "Açúcar da lista ou do HETNAM." : "C1 de HETATM fora da lista de açúcares."} ${p.noLink ? "Não consta em LINK de simetria 1555." : "Consta em LINK."}`);
      linhas.push(`bond <unidade>.${p.asn.resseq}${p.asn.icode}.ND2 <unidade>.${p.acucar.resseq}${p.acucar.icode}.C1`);
    }
    return linhas.join("\n") + "\n";
  }

  function avisoPredita(texto, meta) {
    const src = String(texto || "");
    let exp = "";
    let titulo = "";
    for (const l of src.split("\n")) {
      if (l.startsWith("EXPDTA")) exp += " " + l.substring(6);
      else if (l.startsWith("TITLE")) titulo += " " + l.substring(5);
    }
    const metodo = (meta && meta.metodo) || "";
    const tituloMeta = (meta && meta.titulo) || "";
    const blob = `${exp}\n${titulo}\n${metodo}\n${tituloMeta}`;
    const hit =
      /theoretical|predicted/i.test(exp + " " + metodo) ||
      /alphafold|colabfold|esmfold|rosettafold/i.test(blob) ||
      /\bplddt\b/i.test(src);
    return hit ? FRASES.predita : null;
  }

  function linhaIonMaiuscula(atom) {
    let s = atom.linha.replace(/\s+$/, "");
    if (s.length < 78) s = s.padEnd(78, " ");
    const res = atom.resname.toUpperCase().padEnd(3, " ").slice(0, 3);
    const nome = s.substring(12, 16).toUpperCase();
    const el = (atom.elemento || "").toUpperCase();
    const elField = el.length <= 1 ? " " + (el || " ") : el.slice(0, 2);
    s = s.substring(0, 12) + nome + s.substring(16);
    s = s.substring(0, 17) + res + s.substring(20);
    s = s.substring(0, 76) + elField + s.substring(78);
    return s;
  }

  function limparPdb(texto, opcoes) {
    const o = opcoes || {};
    const pdb = primeiroModelo(texto);
    const atomos = parseAtomos(pdb);
    const cadeias = o.cadeias ? new Set(o.cadeias) : null;
    const hets = o.hets ? new Set(o.hets) : null;
    const aguasManter = new Set(o.aguasManter || []);
    const removerAguas = o.removerAguas !== false;
    const altloc = o.altloc === "ocupacao" ? "ocupacao" : "A";

    let anisou = 0;
    for (const l of pdb.split("\n")) if (l.startsWith("ANISOU")) anisou += 1;

    const candidatos = [];
    let foraCadeia = 0;
    let aguasRemovidas = 0;
    let hetsRemovidos = 0;
    for (const a of atomos) {
      if (a.x == null) continue;
      if (cadeias && !cadeias.has(a.cadeia)) { foraCadeia += 1; continue; }
      if (a.agua) {
        if (removerAguas && !aguasManter.has(a.chaveRes)) { aguasRemovidas += 1; continue; }
      } else if (a.registro === "HETATM" && hets && !hets.has(a.chaveRes)) {
        hetsRemovidos += 1;
        continue;
      }
      candidatos.push(a);
    }

    const antes = new Set(candidatos.map((a) => a.chaveRes));
    let escolhidos;
    let altlocRemovidos = 0;
    if (altloc === "A") {
      escolhidos = [];
      for (const a of candidatos) {
        if (!a.altloc || a.altloc === "A") escolhidos.push(a);
        else altlocRemovidos += 1;
      }
    } else {
      const melhor = new Map();
      for (const a of candidatos) {
        const k = [a.cadeia, a.resseq, a.icode, a.resname, a.nome].join("|");
        const prev = melhor.get(k);
        if (!prev || ocupaMelhor(a, prev)) melhor.set(k, a);
      }
      const keep = new Set(melhor.values());
      escolhidos = candidatos.filter((a) => keep.has(a));
      altlocRemovidos = candidatos.length - escolhidos.length;
    }
    const depois = new Set(escolhidos.map((a) => a.chaveRes));
    const sumiram = [...antes].filter((k) => !depois.has(k));

    const vistos = new Set();
    const unicos = [];
    let duplicadas = 0;
    for (const a of escolhidos) {
      const linha = a.metal ? linhaIonMaiuscula(a) : a.linha.replace(/\s+$/, "");
      if (vistos.has(linha)) { duplicadas += 1; continue; }
      vistos.add(linha);
      unicos.push({ atom: a, linha });
    }

    const out = [
      "REMARK   1 PEKI Fold. PDB filtrado no navegador (ficha de preparo).",
      "REMARK   1 Nao adiciona hidrogenio, nao protona e nao e entrada pronta de simulacao.",
      "REMARK   1 " + FRASES.contato,
    ];
    let prevCadeia = null;
    for (const item of unicos) {
      if (prevCadeia != null && item.atom.cadeia !== prevCadeia) out.push("TER");
      out.push(item.linha);
      prevCadeia = item.atom.cadeia;
    }
    if (unicos.length) out.push("TER");
    out.push("END");

    const contagemEl = {};
    const ions = [];
    for (const item of unicos) {
      if (!item.atom.metal) continue;
      const el = item.atom.elemento;
      contagemEl[el] = (contagemEl[el] || 0) + 1;
      const nomeArquivo = `${el}${contagemEl[el]}.pdb`;
      ions.push({
        nomeArquivo,
        chave: item.atom.chaveRes,
        elemento: el,
        cadeia: item.atom.cadeia,
        resseq: item.atom.resseq,
        icode: item.atom.icode,
        serial: item.atom.serial,
        pdb: item.linha + "\nEND\n",
      });
    }
    const hetArqs = [];
    const hetGrupos = new Map();
    for (const item of unicos) {
      const a = item.atom;
      if (a.registro !== "HETATM" || a.agua || a.metal) continue;
      if (!hetGrupos.has(a.chaveRes)) hetGrupos.set(a.chaveRes, []);
      hetGrupos.get(a.chaveRes).push(item.linha);
    }
    for (const [chave, linhas] of hetGrupos) {
      const [resname, cadeia, resseq, icode] = chave.split("|");
      hetArqs.push({
        chave,
        nomeArquivo: `${resname}_${cadeia}_${resseq}${icode || ""}.pdb`,
        resname, cadeia, resseq, icode,
        pdb: linhas.join("\n") + "\nEND\n",
        nAtomos: linhas.length,
      });
    }

    const linhasResumo = [
      `Átomos de proteína mantidos: ${unicos.filter((u) => u.atom.registro === "ATOM").length}.`,
      `HETATM mantidos: ${unicos.filter((u) => u.atom.registro === "HETATM").length}.`,
      `Águas removidas: ${aguasRemovidas} linha(s).`,
      `HET não marcados e removidos: ${hetsRemovidos} linha(s).`,
      `Fora das cadeias escolhidas: ${foraCadeia} linha(s).`,
      `ANISOU descartados: ${anisou}.`,
      `Linhas removidas pela regra de altloc (${altloc === "A" ? "branco ou A" : "maior ocupação"}): ${altlocRemovidos}.`,
      `Linhas duplicadas descartadas: ${duplicadas}.`,
      `Íons em arquivo próprio: ${ions.length}.`,
    ];
    if (sumiram.length) {
      linhasResumo.push(
        "Resíduos que sumiram por causa do altloc (não havia branco nem A, ou a ocupação ficou com outra cópia já contada): " +
        sumiram.slice(0, 12).join(", ") + (sumiram.length > 12 ? "…" : "") + "."
      );
    }
    linhasResumo.push("O arquivo continua sem hidrogênios adicionados.");
    linhasResumo.push(FRASES.serial);

    return {
      pdb: out.join("\n") + "\n",
      ions,
      hets: hetArqs,
      linhasResumo,
      vazio: unicos.length === 0,
      contagens: {
        atom: unicos.filter((u) => u.atom.registro === "ATOM").length,
        hetatm: unicos.filter((u) => u.atom.registro === "HETATM").length,
        aguasRemovidas, hetsRemovidos, foraCadeia, anisou, altlocRemovidos, duplicadas,
        residuosSumiramAltloc: sumiram,
      },
    };
  }

  function ocupaMelhor(a, b) {
    const oa = a.occupancy == null ? -1 : a.occupancy;
    const ob = b.occupancy == null ? -1 : b.occupancy;
    if (oa !== ob) return oa > ob;
    const rank = (alt) => (alt === "" ? 0 : alt === "A" ? 1 : 2);
    if (rank(a.altloc) !== rank(b.altloc)) return rank(a.altloc) < rank(b.altloc);
    return a.indice < b.indice;
  }

  function caixaPocket(textoResiduos, margem) {
    const atomos = parseAtomos(textoResiduos).filter((a) => a.x != null);
    if (!atomos.length) {
      return { ok: false, erro: "Nenhum átomo no arquivo de resíduos do pocket." };
    }
    let m = Number(margem);
    if (!Number.isFinite(m) || m < 0) m = 0;
    if (m > 50) m = 50;
    let sx = 0, sy = 0, sz = 0;
    let minx = Infinity, miny = Infinity, minz = Infinity;
    let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (const a of atomos) {
      sx += a.x; sy += a.y; sz += a.z;
      if (a.x < minx) minx = a.x;
      if (a.y < miny) miny = a.y;
      if (a.z < minz) minz = a.z;
      if (a.x > maxx) maxx = a.x;
      if (a.y > maxy) maxy = a.y;
      if (a.z > maxz) maxz = a.z;
    }
    const n = atomos.length;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      ok: true,
      nAtomos: n,
      margem: m,
      center_x: r3(sx / n),
      center_y: r3(sy / n),
      center_z: r3(sz / n),
      size_x: r1((maxx - minx) + 2 * m),
      size_y: r1((maxy - miny) + 2 * m),
      size_z: r1((maxz - minz) + 2 * m),
    };
  }

  function formatarConfigVina(c) {
    if (!c) return "";
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

  function analisar(texto, opcoes) {
    const o = opcoes || {};
    const bruto = normalizarTexto(texto);
    const nModelos = contarModelos(bruto);
    const pdb = primeiroModelo(bruto);
    const raios = normalizarRaios(o);
    const atomos = parseAtomos(pdb);
    const links = parseLinks(pdb);
    const ssbonds = parseSsbond(pdb);
    const hetnomes = parseHetnam(bruto);
    const inv = inventario(bruto);
    const ions = vizinhosMetal(atomos, links, raios.metal);
    const ss = paresSS(atomos, ssbonds, raios.dissulfeto);
    const glic = glicosilacao(atomos, links, hetnomes, raios.glicosilacao, inv.maxResProteina);
    const his = histidinas(atomos, raios.histidina, raios.metal);
    const bonds = linhasBond(ss, glic);
    const predita = avisoPredita(bruto, o.meta || null);
    const simetriaLinks = links.filter((l) => !l.identidade).length;
    const simetriaSs = ssbonds.filter((l) => !l.identidade).length;
    return {
      versao: VERSAO,
      nModelos: o.nModelos != null ? o.nModelos : nModelos,
      raios,
      inventario: inv,
      ions,
      dissulfetos: ss,
      glicosilacao: glic,
      histidinas: his,
      bonds,
      predita,
      simetriaLinks,
      simetriaSs,
      frases: FRASES,
    };
  }

  return {
    VERSAO,
    RAIOS_PADRAO,
    FRASES,
    METAIS,
    ACUCARES,
    ADITIVOS,
    primeiroModelo,
    contarModelos,
    parseAtomos,
    parseLinks,
    parseSsbond,
    parseHetnam,
    parseRemark465,
    inventario,
    vizinhosMetal,
    paresSS,
    glicosilacao,
    histidinas,
    linhasBond,
    limparPdb,
    caixaPocket,
    formatarConfigVina,
    avisoPredita,
    analisar,
    linhaIonMaiuscula,
    rotuloClasse,
    rotuloCadeia,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = PrepAnalysis;
if (typeof globalThis !== "undefined") globalThis.PrepAnalysis = PrepAnalysis;
