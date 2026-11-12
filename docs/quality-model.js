// Qualidade estrutural e anotação de componentes — contrato peki-qualidade-1.
//
// A leitura do arquivo continua em structure-model.js (peki-estrutura-1).
// Este módulo não inventa métrica, não troca NMR/cryo-EM por estatística
// cristalográfica e não trata HETATM como estado holo.
//
// Fonte primária do relatório: XML wwPDB servido pela PDBe
//   https://www.ebi.ac.uk/pdbe/entry-files/download/{id}_validation.xml
//   CORS observado: Access-Control-Allow-Origin: *
//   Esquema: http://wwpdb.org/validation/schema/wwpdb_validation_v6.06.xsd
//
// O gzip em files.rcsb.org NÃO envia CORS. O navegador não lê esse arquivo.
// Ele permanece como link para a pessoa abrir ou baixar.
//
// Reserva global, se o XML não entra: RCSB Data API
//   https://data.rcsb.org/rest/v1/core/entry/{id}
//   categorias pdbx_vrpt_summary* (relatório wwPDB na Data API)
//   https://www.rcsb.org/news/feature/67edb6c196cbbd16fc52edb0
//
// Componente químico: https://data.rcsb.org/rest/v1/core/chemcomp/{ccd}
// Reserva: https://www.ebi.ac.uk/pdbe/api/pdb/compound/summary/{ccd}
// ChEBI só entra como link quando o CCD devolve o acesso. O registro ChEBI
// não é baixado e não vira papel biológico.

"use strict";

const QualityModel = (() => {
  const Rede = typeof PekiRede !== "undefined" ? PekiRede : require("./network.js");
  const SCHEMA = "peki-qualidade-1";
  const LIMITE_BYTES = 5 * 1024 * 1024;
  const XSD = "http://wwpdb.org/validation/schema/wwpdb_validation_v6.06.xsd";
  const AVISO_GLOBAL = "O relatório wwPDB e os indicadores globais não garantem a qualidade local do sítio. Um valor global pode conviver com problema no local de interesse.";
  const AVISO_LOCAL = "Indicador por resíduo só existe quando o relatório traz ModelledSubgroup com chain (auth_asym_id), resnum (auth_seq_id) e model, e essa posição tem coordenada no modelo selecionado. Lacuna sem coordenada não recebe qualidade local. Resíduo que não está no relatório não é preenchido com zero.";
  const AVISO_PAPEL = "O tipo no Chemical Component Dictionary é classe química do dicionário. Não é cofator, substrato, inibidor, aditivo nem prova de estado holo.";
  const AVISO_VIZINHO = "Lista de resíduos próximos por distância não entra nesta versão.";

  const CATALOGO = [
    { id: "resolucao", chaves: ["PDB-resolution"], classes: ["xray"], rotulo: "Resolução alta citada no relatório", unidade: "Å", grupo: "experimento" },
    { id: "resolucao_reconstrucao", chaves: ["PDB-resolution"], classes: ["em"], rotulo: "Resolução da reconstrução citada no relatório", unidade: "Å", grupo: "experimento" },
    { id: "resolucao_emdb", chaves: ["EMDB-resolution"], classes: ["em"], rotulo: "Resolução informada ao EMDB", unidade: "Å", grupo: "experimento" },
    { id: "rwork", chaves: ["PDB-R"], classes: ["xray"], rotulo: "Rwork citado pelo relatório (refinamento depositado)", grupo: "experimento" },
    { id: "rfree", chaves: ["PDB-Rfree"], classes: ["xray"], rotulo: "Rfree citado pelo relatório (refinamento depositado)", grupo: "experimento" },
    { id: "eds_r", chaves: ["EDS_R"], classes: ["xray"], rotulo: "R recalculado pelo EDS", grupo: "ajuste" },
    { id: "dcc_r", chaves: ["DCC_R"], classes: ["xray"], rotulo: "R da verificação DCC", grupo: "ajuste" },
    { id: "dcc_rfree", chaves: ["DCC_Rfree"], classes: ["xray"], rotulo: "Rfree da verificação DCC", grupo: "ajuste" },
    { id: "completude", chaves: ["DataCompleteness"], classes: ["xray"], rotulo: "Completude dos dados no relatório", unidade: "%", grupo: "ajuste" },
    { id: "rsrz", chaves: ["percent-RSRZ-outliers"], classes: ["xray"], rotulo: "Resíduos com RSRZ outlier", unidade: "%", grupo: "ajuste" },
    { id: "fofc", chaves: ["Fo_Fc_correlation"], classes: ["xray"], rotulo: "Correlação Fo–Fc no relatório", grupo: "ajuste" },
    { id: "reflexoes_livres", chaves: ["num-free-reflections"], classes: ["xray"], rotulo: "Reflexões livres na reanálise (num-free-reflections)", grupo: "ajuste" },
    { id: "clashscore", chaves: ["clashscore"], classes: ["xray", "nmr", "em", "modelo", "outro", "desconhecido"], rotulo: "Clashscore", grupo: "geometria" },
    { id: "clashscore_completo", chaves: ["clashscore-full-length"], classes: ["nmr"], rotulo: "Clashscore do comprimento completo", grupo: "geometria" },
    { id: "rama", chaves: ["percent-rama-outliers"], classes: ["xray", "nmr", "em", "modelo", "outro", "desconhecido"], rotulo: "Ramachandran outliers", unidade: "%", grupo: "geometria" },
    { id: "rama_completo", chaves: ["percent-rama-outliers-full-length"], classes: ["nmr"], rotulo: "Ramachandran outliers no comprimento completo", unidade: "%", grupo: "geometria" },
    { id: "rotamer", chaves: ["percent-rota-outliers"], classes: ["xray", "nmr", "em", "modelo", "outro", "desconhecido"], rotulo: "Rotâmeros outliers", unidade: "%", grupo: "geometria" },
    { id: "rotamer_completo", chaves: ["percent-rota-outliers-full-length"], classes: ["nmr"], rotulo: "Rotâmeros outliers no comprimento completo", unidade: "%", grupo: "geometria" },
    { id: "bonds_rmsz", chaves: ["bonds_rmsz"], classes: ["xray", "nmr", "em", "modelo", "outro", "desconhecido"], rotulo: "RMSZ dos comprimentos de ligação", grupo: "geometria" },
    { id: "angles_rmsz", chaves: ["angles_rmsz"], classes: ["xray", "nmr", "em", "modelo", "outro", "desconhecido"], rotulo: "RMSZ dos ângulos de ligação", grupo: "geometria" },
    { id: "qscore", chaves: ["Q_score"], classes: ["em"], rotulo: "Q-score", grupo: "em" },
    { id: "inclusao", chaves: ["atom_inclusion_all_atoms"], classes: ["em"], rotulo: "Inclusão de átomos no mapa", grupo: "em" },
    { id: "inclusao_backbone", chaves: ["atom_inclusion_backbone"], classes: ["em"], rotulo: "Inclusão do esqueleto no mapa", grupo: "em" },
    { id: "medoid", chaves: ["medoid_model"], classes: ["nmr"], rotulo: "Modelo medóide citado no relatório", grupo: "nmr" },
    { id: "nmr_representante", chaves: ["nmrclust_representative_model"], classes: ["nmr"], rotulo: "Modelo representante do NMRCLUST", grupo: "nmr" },
    { id: "nmr_clusters", chaves: ["nmrclust_number_of_clusters"], classes: ["nmr"], rotulo: "Aglomerados NMRCLUST", grupo: "nmr" },
    { id: "nmr_modelos", chaves: ["nmrclust_number_of_models"], classes: ["nmr"], rotulo: "Modelos considerados pelo NMRCLUST", grupo: "nmr" },
    { id: "nmr_outliers", chaves: ["nmrclust_number_of_outliers"], classes: ["nmr"], rotulo: "Modelos outliers do NMRCLUST", grupo: "nmr" },
    { id: "cyrange_dominios", chaves: ["cyrange_number_of_domains"], classes: ["nmr"], rotulo: "Domínios CYRANGE", grupo: "nmr" },
  ];

  function idClassico(id) {
    return /^[0-9][A-Za-z0-9]{3}$/.test(String(id || "").trim());
  }

  function normalizarId(id) {
    return String(id || "").trim().toUpperCase();
  }

  function urlsDe(id) {
    const up = normalizarId(id);
    const low = up.toLowerCase();
    const mid = low.slice(1, 3);
    return {
      xml: "https://www.ebi.ac.uk/pdbe/entry-files/download/" + low + "_validation.xml",
      json: "https://data.rcsb.org/rest/v1/core/entry/" + up,
      pdf: "https://files.rcsb.org/pub/pdb/validation_reports/" + mid + "/" + low + "/" + low + "_validation.pdf.gz",
      xmlGzip: "https://files.rcsb.org/pub/pdb/validation_reports/" + mid + "/" + low + "/" + low + "_validation.xml.gz",
      rcsb: "https://www.rcsb.org/structure/" + up,
      pdbe: "https://www.ebi.ac.uk/pdbe/entry/pdb/" + low,
      chemcomp: "https://data.rcsb.org/rest/v1/core/chemcomp/",
      pdbeComp: "https://www.ebi.ac.uk/pdbe/api/pdb/compound/summary/",
      ligante: "https://www.rcsb.org/ligand/",
    };
  }

  function classificarMetodo(texto) {
    const s = String(texto || "").trim().toUpperCase();
    if (!s) return null;
    if (/ELECTRON|CRYO-?EM|MICROSCOPY|(^|[^A-Z])EM([^A-Z]|$)/.test(s)) return "em";
    if (/(^|[^A-Z])NMR([^A-Z]|$)/.test(s)) return "nmr";
    if (/THEORETICAL|COMPUTATION|PREDICTED|ALPHAFOLD/.test(s)) return "modelo";
    if (/X-?RAY/.test(s)) return "xray";
    return "outro";
  }

  function classeDoRelatorio(bins) {
    const partes = String(bins || "").toLowerCase().split(/[^a-z0-9]+/);
    if (partes.includes("nmr")) return "nmr";
    if (partes.includes("em")) return "em";
    if (partes.includes("xray")) return "xray";
    return null;
  }

  function classeEfetiva(arquivo, relatorio) {
    const a = arquivo || null;
    const r = relatorio || null;
    let classe = "desconhecido";
    if (a === "nmr" || r === "nmr") classe = "nmr";
    else if (a === "em" || r === "em") classe = "em";
    else if (a === "modelo") classe = "modelo";
    else if (a === "xray" || r === "xray") classe = "xray";
    else if (a === "outro") classe = "outro";
    return {
      classe,
      arquivo: a,
      relatorio: r,
      conflito: !!(a && r && a !== r),
    };
  }

  function decodeXml(s) {
    return String(s)
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  function parseAttrs(tag) {
    const attrs = {};
    const re = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tag))) attrs[m[1]] = decodeXml(m[2]);
    return attrs;
  }

  function attrsLocais(attrs) {
    const out = {};
    for (const chave of Object.keys(attrs || {})) {
      const nome = chave.includes(":") ? chave.slice(chave.lastIndexOf(":") + 1) : chave;
      if (out[nome] == null) out[nome] = attrs[chave];
    }
    return out;
  }

  function attr(attrs, nome) {
    if (!attrs) return null;
    if (attrs[nome] != null && attrs[nome] !== "") return attrs[nome];
    const sufixo = ":" + nome;
    for (const chave of Object.keys(attrs)) {
      if (chave === nome || chave.endsWith(sufixo)) return attrs[chave];
    }
    return null;
  }

  function lerNumero(bruto) {
    if (bruto == null) return { ausente: true, motivo: "não informado" };
    if (typeof bruto === "number") {
      if (!Number.isFinite(bruto)) return { ausente: true, motivo: "não numérico", bruto: String(bruto) };
      return { ausente: false, valor: bruto, texto: String(bruto) };
    }
    const s = String(bruto).trim();
    if (!s || /^not\s*available$/i.test(s) || s === "." || s === "?" || /^n\/a$/i.test(s)) {
      return { ausente: true, motivo: /^not\s*available$/i.test(s) ? "o relatório marca NotAvailable" : "não informado", bruto: s || null };
    }
    const n = Number(s);
    if (!Number.isFinite(n)) return { ausente: true, motivo: "não numérico", bruto: s };
    return { ausente: false, valor: n, texto: s };
  }

  function rotuloDa(def, classe, consulta, origemResolucao) {
    let rotulo = def.rotulo;
    if (def.id === "clashscore" && classe === "nmr") {
      rotulo = "Clashscore do núcleo bem definido do ensemble";
    }
    if (consulta === "rcsb-json" && (def.id === "rwork" || def.id === "rfree")) {
      rotulo += ". Fonte desta consulta: categoria refine na Data API do RCSB; o XML do relatório não foi lido.";
    }
    if (consulta === "rcsb-json" && (def.id === "resolucao" || def.id === "resolucao_reconstrucao" || def.id === "resolucao_emdb")) {
      if (origemResolucao === "resolution_combined" && def.id !== "resolucao_emdb") {
        rotulo = "Resolução combinada na Data API do RCSB (resolution_combined). Não é o campo PDB-resolution do XML.";
      } else if (def.id === "resolucao") {
        rotulo += ". Fonte desta consulta: refinamento depositado na Data API.";
      }
    }
    return rotulo;
  }

  function selecionarMetricas(brutos, efetivo, consulta, origemResolucao) {
    const classe = efetivo.classe;
    const metricas = [];
    const omitidos = [];
    const naoAplicaveis = [];
    for (const def of CATALOGO) {
      const aplica = def.classes.includes(classe);
      let achado = null;
      let chaveUsada = null;
      for (const chave of def.chaves) {
        if (Object.prototype.hasOwnProperty.call(brutos, chave)) {
          achado = lerNumero(brutos[chave]);
          chaveUsada = chave;
          break;
        }
      }
      if (!aplica) {
        if (achado && !achado.ausente && (def.id === "rwork" || def.id === "rfree" || def.id === "resolucao" || def.grupo === "ajuste")) {
          naoAplicaveis.push({
            id: def.id,
            rotulo: def.rotulo,
            motivo: "não exibido: o método efetivo é " + classe + " e esta métrica não foi tratada como cristalográfica",
          });
        }
        continue;
      }
      if (!achado || achado.ausente) {
        omitidos.push({
          id: def.id,
          rotulo: def.rotulo,
          motivo: achado ? achado.motivo : "não informado no relatório",
        });
        continue;
      }
      metricas.push({
        id: def.id,
        rotulo: rotuloDa(def, classe, consulta, origemResolucao),
        unidade: def.unidade || null,
        grupo: def.grupo,
        valor: achado.valor,
        texto: achado.texto,
        chave: chaveUsada,
      });
    }
    return { metricas, omitidos, naoAplicaveis };
  }

  function normToken(s) {
    if (s == null) return "";
    const t = String(s).trim();
    if (!t || t === "." || t === "?") return "";
    return t.toUpperCase();
  }

  function normCadeia(s) {
    const t = normToken(s);
    return t || null;
  }

  function inteiroOuNulo(s) {
    if (s == null) return null;
    const t = String(s).trim();
    if (!/^-?\d+$/.test(t)) return null;
    return parseInt(t, 10);
  }

  function contarTag(inner, tag) {
    if (!inner) return 0;
    const re = new RegExp("<(?:[\\w.-]+:)?" + tag + "\\b", "g");
    return (inner.match(re) || []).length;
  }

  function extrairSubgrupos(xml) {
    const itens = [];
    const re = /<(?:[\w.-]+:)?ModelledSubgroup\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?ModelledSubgroup>)/g;
    let m;
    while ((m = re.exec(xml))) {
      const attrs = parseAttrs(m[1]);
      const inner = m[2] || "";
      itens.push({
        chain: normCadeia(attr(attrs, "chain")),
        resnum: inteiroOuNulo(attr(attrs, "resnum")),
        icode: normToken(attr(attrs, "icode")),
        resname: normToken(attr(attrs, "resname")) || null,
        model: inteiroOuNulo(attr(attrs, "model")),
        altcode: normToken(attr(attrs, "altcode")),
        said: normCadeia(attr(attrs, "said")),
        ent: attr(attrs, "ent"),
        seqLabel: inteiroOuNulo(attr(attrs, "seq")),
        rama: attr(attrs, "rama") ? String(attr(attrs, "rama")).trim() : null,
        rota: attr(attrs, "rota") ? String(attr(attrs, "rota")).trim() : null,
        bondOutliers: contarTag(inner, "bond-outlier"),
        angleOutliers: contarTag(inner, "angle-outlier"),
        clashes: contarTag(inner, "clash"),
        planeOutliers: contarTag(inner, "plane-outlier"),
        chiralOutliers: contarTag(inner, "chiral-outlier"),
      });
    }
    return itens;
  }

  function ehOutlier(sg) {
    if (sg.rama === "OUTLIER") return true;
    if (sg.rota && /outlier/i.test(sg.rota)) return true;
    return sg.bondOutliers > 0 || sg.angleOutliers > 0 || sg.clashes > 0 || sg.planeOutliers > 0 || sg.chiralOutliers > 0;
  }

  function chaveResiduo(chain, seq, icode) {
    return chain + "|" + seq + "|" + (icode || "");
  }

  // Só a identidade author entra no índice. Cadeia ou número label não substituem auth_asym_id / auth_seq_id.
  function identidadeAuth(r) {
    if (!r || r.seq == null) return null;
    if (r.seqFonte === "label" || r.seqFonte === "ausente") return null;
    let chain = null;
    if (Object.prototype.hasOwnProperty.call(r, "authChain")) chain = r.authChain || null;
    else chain = r.chain || null;
    if (!chain || chain === "_") return null;
    return { chain, seq: r.seq, icode: r.icode || "", resname: normToken(r.resname) };
  }

  function mapearSubgrupos(subgrupos, contexto) {
    const modelo = contexto && contexto.modeloSelecionado != null ? contexto.modeloSelecionado : null;
    const residuos = (contexto && contexto.residuos) || [];
    const lacunas = (contexto && contexto.lacunas && contexto.lacunas.naoResolvidos) || [];
    const indice = new Map();
    for (const r of residuos) {
      const idn = identidadeAuth(r);
      if (!idn) continue;
      const k = chaveResiduo(idn.chain, idn.seq, idn.icode);
      const arr = indice.get(k) || [];
      arr.push(r);
      indice.set(k, arr);
    }
    const itens = [];
    let outroModelo = 0;
    let campoAusente = 0;
    for (const sg of subgrupos) {
      if (sg.model == null || !sg.chain || sg.resnum == null) {
        campoAusente += 1;
        itens.push({ ...sg, mapeamento: "campo_ausente", outlier: ehOutlier(sg) });
        continue;
      }
      if (modelo != null && sg.model !== modelo) {
        outroModelo += 1;
        continue;
      }
      const lista = indice.get(chaveResiduo(sg.chain, sg.resnum, sg.icode)) || [];
      let mapeamento = "sem_residuo";
      let temCoordenadas = false;
      let labelDivergente = false;
      if (lista.length > 1) mapeamento = "ambiguo";
      else if (lista.length === 1) {
        const r = lista[0];
        temCoordenadas = r.temCoordenadas === true;
        const nomeModelo = normToken(r.resname);
        if (sg.resname && nomeModelo && sg.resname !== nomeModelo) mapeamento = "resname_divergente";
        else if (!temCoordenadas) mapeamento = "sem_coordenada";
        else if (sg.altcode && !(r.altlocs || []).includes(sg.altcode)) mapeamento = "altloc_ausente";
        else mapeamento = "modelo";
        if (sg.said && r.labelChain && sg.said !== r.labelChain) labelDivergente = true;
      }
      itens.push({
        ...sg,
        mapeamento,
        temCoordenadas,
        labelDivergente,
        outlier: ehOutlier(sg),
      });
    }
    const porCadeia = {};
    const cadeias = new Set();
    for (const r of residuos) {
      const idn = identidadeAuth(r);
      if (idn) cadeias.add(idn.chain);
    }
    for (const it of itens) if (it.chain && it.mapeamento !== "campo_ausente") cadeias.add(it.chain);
    const semIdentidadeAuthor = residuos.filter((r) => r.temCoordenadas === true && !identidadeAuth(r)).length;
    for (const chain of cadeias) {
      const doModelo = residuos.filter((r) => {
        const idn = identidadeAuth(r);
        return idn && idn.chain === chain;
      });
      const comCoord = doModelo.filter((r) => r.temCoordenadas === true);
      const chavesComIndicador = new Set();
      for (const it of itens) {
        if (it.chain === chain && it.mapeamento === "modelo") {
          chavesComIndicador.add(chaveResiduo(it.chain, it.resnum, it.icode));
        }
      }
      const semIndicador = comCoord.filter((r) => {
        const idn = identidadeAuth(r);
        if (!idn || idn.chain !== chain) return true;
        return !chavesComIndicador.has(chaveResiduo(idn.chain, idn.seq, idn.icode));
      }).length;
      const lacunasCadeia = lacunas.filter((r) => (r.cadeiaAuth || r.chain) === chain);
      porCadeia[chain] = {
        residuosComCoordenadas: comCoord.length,
        comIndicador: chavesComIndicador.size,
        semIndicador,
        lacunasSemCoordenada: lacunasCadeia.length,
        subgrupos: itens.filter((it) => it.chain === chain && it.mapeamento !== "campo_ausente").length,
        outliers: itens.filter((it) => it.chain === chain && it.outlier && it.mapeamento === "modelo").length,
      };
    }
    return {
      estado: "ok",
      motivo: null,
      modeloSelecionado: modelo,
      subgruposLidos: subgrupos.length,
      subgruposOutroModelo: outroModelo,
      campoAusente,
      semIdentidadeAuthor,
      porCadeia,
      itens,
      aviso: AVISO_LOCAL,
    };
  }

  function avisoEds(attrs) {
    const texto = attrs.eds_rfactor_warning || attrs["eds_rfactor_warning"] || null;
    if (!texto || !String(texto).trim()) return [];
    return [String(texto).trim()];
  }

  function baseResultado(id, consulta, fonte, efetivo, selecionadas, extra) {
    return {
      schema: SCHEMA,
      estado: extra.estado || "ok",
      codigo: extra.codigo || null,
      mensagem: extra.mensagem || null,
      id: normalizarId(id),
      consulta,
      fonte,
      links: urlsDe(id),
      metodo: efetivo,
      metricas: selecionadas.metricas,
      omitidos: selecionadas.omitidos,
      naoAplicaveis: selecionadas.naoAplicaveis,
      avisos: extra.avisos || [],
      local: extra.local,
      avisoGlobal: AVISO_GLOBAL,
      avisoVizinho: AVISO_VIZINHO,
    };
  }

  function lerXml(xml, opts) {
    const o = opts || {};
    const id = normalizarId(o.id || "");
    const texto = String(xml || "");
    const tag = texto.match(/<(?:[\w.-]+:)?Entry\b[^>]*>/);
    if (!tag) {
      return {
        schema: SCHEMA,
        estado: "erro",
        codigo: "xml_invalido",
        mensagem: "A resposta não contém o elemento Entry do relatório wwPDB. Nenhum indicador foi preenchido.",
        id,
        metricas: [],
        omitidos: [],
        naoAplicaveis: [],
        local: { estado: "pendente", motivo: "XML sem Entry", itens: [] },
        links: id ? urlsDe(id) : null,
        avisoGlobal: AVISO_GLOBAL,
      };
    }
    const attrs = attrsLocais(parseAttrs(tag[0]));
    const pdbid = normalizarId(attr(attrs, "pdbid") || "");
    if (!pdbid || (id && pdbid !== id)) {
      return {
        schema: SCHEMA,
        estado: "erro",
        codigo: "id_divergente",
        mensagem: "O XML identificou " + (pdbid || "nenhum pdbid") + " e a consulta pediu " + (id || "outro ID") + ". O conteúdo foi descartado.",
        id,
        metricas: [],
        omitidos: [],
        naoAplicaveis: [],
        local: { estado: "pendente", motivo: "identificador divergente", itens: [] },
        links: id ? urlsDe(id) : null,
        avisoGlobal: AVISO_GLOBAL,
      };
    }
    const efetivo = classeEfetiva(classificarMetodo(o.metodoArquivo), classeDoRelatorio(attr(attrs, "percentilebins")));
    const selecionadas = selecionarMetricas(attrs, efetivo, "xml", null);
    let local;
    if (o.truncado) {
      local = {
        estado: "pendente",
        motivo: "O relatório passou do limite de leitura no navegador (" + LIMITE_BYTES + " bytes). Os indicadores por resíduo ficam pendentes. O resumo global acima veio só do início do XML.",
        itens: [],
        porCadeia: {},
        aviso: AVISO_LOCAL,
      };
    } else {
      local = mapearSubgrupos(extrairSubgrupos(texto), o.contexto || null);
    }
    const fonte = {
      nome: "wwPDB validation report",
      distribuicao: "PDBe entry-files",
      url: urlsDe(pdbid).xml,
      schemaXsd: attr(attrs, "noNamespaceSchemaLocation") || XSD,
      pdbid,
      data: attr(attrs, "XMLcreationDate") || null,
      percentilebins: attr(attrs, "percentilebins") || null,
    };
    const avisos = avisoEds(attrs);
    if (efetivo.conflito) {
      avisos.push("O método no arquivo (" + (efetivo.arquivo || "ausente") + ") e a classe no relatório (" + efetivo.relatorio + ") não coincidem. Métricas cristalográficas só aparecem se a classe efetiva for raio X.");
    }
    const consistencia = attr(attrs, "nmr_models_consistency_flag");
    if (consistencia) {
      avisos.push("Consistência dos modelos NMR no relatório: " + consistencia + ".");
    }
    return baseResultado(pdbid, "xml", fonte, efetivo, selecionadas, {
      estado: o.truncado ? "parcial" : "ok",
      avisos,
      local,
    });
  }

  function copiar(destino, origem, mapa) {
    if (!origem) return;
    for (const chave of Object.keys(mapa)) {
      if (origem[chave] != null) destino[mapa[chave]] = origem[chave];
    }
  }

  function brutosDeJson(entry) {
    const b = {};
    let resolucaoFonte = null;
    const geom = (entry.pdbx_vrpt_summary_geometry || [])[0] || null;
    copiar(b, geom, {
      clashscore: "clashscore",
      percent_ramachandran_outliers: "percent-rama-outliers",
      percent_rotamer_outliers: "percent-rota-outliers",
      bonds_RMSZ: "bonds_rmsz",
      angles_RMSZ: "angles_rmsz",
      clashscore_full_length: "clashscore-full-length",
      percent_ramachandran_outliers_full_length: "percent-rama-outliers-full-length",
      percent_rotamer_outliers_full_length: "percent-rota-outliers-full-length",
    });
    const dif = (entry.pdbx_vrpt_summary_diffraction || [])[0] || null;
    copiar(b, dif, {
      EDS_R: "EDS_R",
      DCC_R: "DCC_R",
      data_completeness: "DataCompleteness",
      percent_RSRZ_outliers: "percent-RSRZ-outliers",
      Fo_Fc_correlation: "Fo_Fc_correlation",
      number_reflns_R_free: "num-free-reflections",
    });
    const ref = (entry.refine || [])[0] || null;
    copiar(b, ref, {
      ls_R_factor_R_work: "PDB-R",
      ls_R_factor_R_free: "PDB-Rfree",
      ls_d_res_high: "PDB-resolution",
    });
    if (b["PDB-resolution"] != null) resolucaoFonte = "refine";
    const info = entry.rcsb_entry_info || {};
    if (b["PDB-resolution"] == null && Array.isArray(info.resolution_combined) && info.resolution_combined[0] != null) {
      b["PDB-resolution"] = info.resolution_combined[0];
      resolucaoFonte = "resolution_combined";
    }
    const em = (entry.pdbx_vrpt_summary_em || [])[0] || null;
    copiar(b, em, {
      Q_score: "Q_score",
      atom_inclusion_all_atoms: "atom_inclusion_all_atoms",
      atom_inclusion_backbone: "atom_inclusion_backbone",
    });
    const nmr = (entry.pdbx_vrpt_summary_nmr || [])[0] || null;
    copiar(b, nmr, {
      medoid_model: "medoid_model",
      nmrclust_representative_model: "nmrclust_representative_model",
      nmrclust_number_of_clusters: "nmrclust_number_of_clusters",
      nmrclust_number_of_models: "nmrclust_number_of_models",
      nmrclust_number_of_outliers: "nmrclust_number_of_outliers",
      cyrange_number_of_domains: "cyrange_number_of_domains",
    });
    const aviso = dif && dif.EDS_R_warning ? [String(dif.EDS_R_warning)] : [];
    if (nmr && nmr.nmr_models_consistency_flag != null) {
      aviso.push("Consistência dos modelos NMR no relatório: " + nmr.nmr_models_consistency_flag + ".");
    }
    return { brutos: b, avisos: aviso, nmr, dif, resolucaoFonte };
  }

  function lerResumoRcsb(entry, opts) {
    const o = opts || {};
    const id = normalizarId(o.id || "");
    if (!entry || typeof entry !== "object") {
      return {
        schema: SCHEMA,
        estado: "erro",
        codigo: "json_invalido",
        mensagem: "A Data API não devolveu um objeto de entrada. Nenhum indicador foi preenchido.",
        id,
        metricas: [],
        omitidos: [],
        naoAplicaveis: [],
        local: { estado: "pendente", motivo: "sem XML", itens: [] },
        links: id ? urlsDe(id) : null,
        avisoGlobal: AVISO_GLOBAL,
      };
    }
    const ids = entry.rcsb_entry_container_identifiers || {};
    const entryId = normalizarId(ids.entry_id || "");
    if (entryId && id && entryId !== id) {
      return {
        schema: SCHEMA,
        estado: "erro",
        codigo: "id_divergente",
        mensagem: "A Data API identificou " + entryId + " e a consulta pediu " + id + ". O conteúdo foi descartado.",
        id,
        metricas: [],
        omitidos: [],
        naoAplicaveis: [],
        local: { estado: "pendente", motivo: "identificador divergente", itens: [] },
        links: urlsDe(id),
        avisoGlobal: AVISO_GLOBAL,
      };
    }
    const metodoApi = (entry.exptl && entry.exptl[0] && entry.exptl[0].method)
      || (entry.rcsb_entry_info && entry.rcsb_entry_info.experimental_method)
      || null;
    const efetivo = classeEfetiva(classificarMetodo(o.metodoArquivo) || classificarMetodo(metodoApi), classificarMetodo(metodoApi));
    const extraido = brutosDeJson(entry);
    const selecionadas = selecionarMetricas(extraido.brutos, efetivo, "rcsb-json", extraido.resolucaoFonte);
    const resumo = entry.pdbx_vrpt_summary || {};
    const fonte = {
      nome: "wwPDB validation report via RCSB Data API (pdbx_vrpt_summary*)",
      distribuicao: "RCSB Data API",
      url: urlsDe(id || entryId).json,
      documento: "https://www.rcsb.org/news/feature/67edb6c196cbbd16fc52edb0",
      pdbid: id || entryId,
      data: resumo.report_creation_date || null,
    };
    const avisos = extraido.avisos.slice();
    avisos.push("Indicadores por resíduo ficam pendentes: esta consulta leu o resumo JSON, não o XML com ModelledSubgroup.");
    if (efetivo.conflito) {
      avisos.push("Há mais de uma leitura de método. Métricas cristalográficas só entram na classe raio X.");
    }
    return baseResultado(id || entryId, "rcsb-json", fonte, efetivo, selecionadas, {
      avisos,
      local: {
        estado: "pendente",
        motivo: "O XML wwPDB com chain, resnum e model não foi lido nesta consulta. Não há painel local simulado.",
        itens: [],
        porCadeia: {},
        aviso: AVISO_LOCAL,
      },
    });
  }

  function erroConsulta(id, codigo, mensagem, tentativas) {
    return {
      schema: SCHEMA,
      estado: codigo === "rede" ? "rede" : "erro",
      codigo,
      mensagem,
      id: normalizarId(id),
      metricas: [],
      omitidos: [],
      naoAplicaveis: [],
      local: { estado: "pendente", motivo: mensagem, itens: [] },
      links: urlsDe(id),
      tentativas: tentativas || [],
      avisoGlobal: AVISO_GLOBAL,
      avisoVizinho: AVISO_VIZINHO,
    };
  }

  function criarCache() {
    const relatorios = new Map();
    const componentes = new Map();
    function chave(id) { return normalizarId(id); }
    return {
      lerRelatorio(id) {
        const item = relatorios.get(chave(id));
        if (!item || item.id !== chave(id) || !item.dado || item.dado.id !== chave(id)) return null;
        return item.dado;
      },
      gravarRelatorio(id, dado) {
        const k = chave(id);
        if (!dado || dado.id !== k) return false;
        if (dado.estado !== "ok" && dado.estado !== "parcial") return false;
        relatorios.set(k, { id: k, dado });
        return true;
      },
      apagarRelatorio(id) { relatorios.delete(chave(id)); },
      lerComponente(codigo) {
        const k = normToken(codigo);
        const item = componentes.get(k);
        if (!item || item.codigo !== k || !item.dado || item.dado.codigo !== k) return null;
        return item.dado;
      },
      gravarComponente(codigo, dado) {
        const k = normToken(codigo);
        if (!dado || dado.codigo !== k || dado.estado !== "ok") return false;
        componentes.set(k, { codigo: k, dado });
        return true;
      },
      apagarComponente(codigo) { componentes.delete(normToken(codigo)); },
      tamanho() { return { relatorios: relatorios.size, componentes: componentes.size }; },
    };
  }

  async function textoLimitado(res, limite) {
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let texto = "";
      let total = 0;
      while (true) {
        const passo = await reader.read();
        if (passo.done) break;
        total += passo.value.byteLength;
        if (total > limite) {
          try { await reader.cancel(); } catch (e) { /* já fechado */ }
          return { texto: "", excedeu: true, total };
        }
        texto += dec.decode(passo.value, { stream: true });
      }
      texto += dec.decode();
      return { texto, excedeu: false, total };
    }
    const texto = await res.text();
    const total = new TextEncoder().encode(texto).byteLength;
    if (total > limite) return { texto: "", excedeu: true, total };
    return { texto, excedeu: false, total };
  }

  function statusDe(res) {
    return res && typeof res.status === "number" ? res.status : 0;
  }

  function resultadoRelatorioSemId(up) {
    return {
      schema: SCHEMA,
      estado: "nao_aplica",
      codigo: "sem_id",
      mensagem: "Sem ID clássico do PDB, o relatório wwPDB não é consultado. Nenhum indicador remoto foi preenchido.",
      id: up || null,
      metricas: [],
      omitidos: [],
      naoAplicaveis: [],
      local: { estado: "pendente", motivo: "sem ID de depósito", itens: [] },
      links: null,
      avisoGlobal: AVISO_GLOBAL,
    };
  }

  function processarXmlConsultado(lido, up, o, cache, tentativas, urls) {
    const rel = lerXml(lido.texto, {
      id: up,
      metodoArquivo: o.metodoArquivo,
      truncado: lido.excedeu,
      contexto: lido.excedeu ? null : o.contexto,
    });
    if (rel.estado === "ok" || rel.estado === "parcial") {
      if (cache) cache.gravarRelatorio(up, rel);
      return rel;
    }
    if (rel.codigo === "id_divergente") {
      tentativas.push({ fonte: "pdbe-xml", url: urls.xml, status: "id_divergente" });
    }
  }

  function processarJsonConsultado(json, up, o, cache, tentativas) {
    const rel = lerResumoRcsb(json, { id: up, metodoArquivo: o.metodoArquivo });
    rel.tentativas = tentativas;
    if (rel.estado === "ok" || rel.estado === "parcial") {
      if (cache) cache.gravarRelatorio(up, rel);
      return rel;
    }
    return rel;
  }

  async function consultarRelatorio(id, opts) {
    const o = opts || {};
    const up = normalizarId(id);
    if (!idClassico(up)) {
      return resultadoRelatorioSemId(up);
    }
    const cache = o.cache;
    if (cache && !o.forcar) {
      const hit = cache.lerRelatorio(up);
      if (hit) return hit;
    }
    const fetchImpl = o.fetch;
    if (typeof fetchImpl !== "function") {
      return erroConsulta(up, "sem_fetch", "Não há função de consulta configurada.");
    }
    const tentativas = [];
    let xmlGrandeDemais = null;
    const sinal = o.signal;
    const limite = Math.min(Number(o.limite) || LIMITE_BYTES, LIMITE_BYTES);
    const urls = urlsDe(up);
    if (sinal && sinal.aborted) {
      return erroConsulta(up, "cancelado", "A consulta ao relatório foi cancelada. Nenhum indicador foi preenchido.");
    }
    try {
      // O relatório já desvinculava o cancelamento externo antes do corpo.
      const res = await Rede.fetch(urls.xml, { signal: sinal, headers: { Accept: "application/xml,text/xml,*/*" } },
        { fetch: fetchImpl, chave: "qualidadeXml", cancelarCorpo: false });
      const status = statusDe(res);
      tentativas.push({ fonte: "pdbe-xml", url: urls.xml, status });
      if (status === 200) {
        const lido = await textoLimitado(res, limite);
        if (lido.excedeu) {
          xmlGrandeDemais = erroConsulta(up, "xml_grande_demais", "O relatório XML é grande demais: ultrapassa o limite de leitura de " + limite + " bytes. Nenhum indicador foi preenchido.", tentativas);
          tentativas.push({ fonte: "pdbe-xml", url: urls.xml, status: "xml_grande_demais", codigo: "xml_grande_demais" });
        } else {
          const rel = processarXmlConsultado(lido, up, o, cache, tentativas, urls);
          if (rel) return rel;
        }
      }
    } catch (e) {
      if (sinal && sinal.aborted) {
        return erroConsulta(up, "cancelado", "A consulta ao relatório foi cancelada. Nenhum indicador foi preenchido.", tentativas);
      }
      tentativas.push({ fonte: "pdbe-xml", url: urls.xml, status: Rede.ehTimeout(e) || (e && e.name === "AbortError") ? "timeout" : "rede" });
    }
    if (sinal && sinal.aborted) {
      return erroConsulta(up, "cancelado", "A consulta ao relatório foi cancelada. Nenhum indicador foi preenchido.", tentativas);
    }
    try {
      // O relatório já desvinculava o cancelamento externo antes do corpo.
      const res = await Rede.fetch(urls.json, { signal: sinal, headers: { Accept: "application/json" } },
        { fetch: fetchImpl, chave: "qualidadeJson", cancelarCorpo: false });
      const status = statusDe(res);
      tentativas.push({ fonte: "rcsb-json", url: urls.json, status });
      if (status === 429) {
        return xmlGrandeDemais || erroConsulta(up, "429", "O RCSB respondeu 429 (limite de consultas). Nenhum indicador foi preenchido.", tentativas);
      }
      if (status === 404) {
        return xmlGrandeDemais || erroConsulta(up, "404", "Não há relatório nem ficha na Data API para este ID (HTTP 404). Nenhum indicador foi preenchido.", tentativas);
      }
      if (status === 200) {
        const json = await res.json();
        const rel = processarJsonConsultado(json, up, o, cache, tentativas);
        return xmlGrandeDemais && rel.estado !== "ok" && rel.estado !== "parcial" ? xmlGrandeDemais : rel;
      }
      return xmlGrandeDemais || erroConsulta(up, "http_" + status, "A consulta ao relatório devolveu HTTP " + status + ". Nenhum indicador foi preenchido.", tentativas);
    } catch (e) {
      if (sinal && sinal.aborted) {
        return erroConsulta(up, "cancelado", "A consulta ao relatório foi cancelada. Nenhum indicador foi preenchido.", tentativas);
      }
      tentativas.push({ fonte: "rcsb-json", url: urls.json, status: Rede.ehTimeout(e) || (e && e.name === "AbortError") ? "timeout" : "rede" });
      if (Rede.ehTimeout(e) || (e && e.name === "AbortError")) return xmlGrandeDemais || erroConsulta(up, Rede.TIMEOUT.codigo, Rede.TIMEOUT.mensagem, tentativas);
      return xmlGrandeDemais || erroConsulta(up, "rede", "A consulta não devolveu dados (rede ou CORS). Nenhum indicador foi preenchido. Os links oficiais continuam disponíveis para abrir no navegador.", tentativas);
    }
  }

  function linkChebi(acesso) {
    const s = String(acesso || "").trim();
    if (!/^CHEBI:\d+$/i.test(s)) return null;
    const id = s.toUpperCase();
    return { rotulo: id, url: "https://www.ebi.ac.uk/chebi/searchId.do?chebiId=" + id };
  }

  function anotarChemCompRcsb(json, codigo) {
    const pedido = normToken(codigo);
    const cc = json && json.chem_comp;
    const id = normToken(cc && cc.id);
    if (!cc || !id || id !== pedido) {
      return {
        codigo: pedido,
        estado: "erro",
        codigoErro: "id_divergente",
        mensagem: "O CCD devolvido não é " + pedido + ". A ficha foi descartada.",
      };
    }
    const links = [{ rotulo: "RCSB ligand " + id, url: "https://www.rcsb.org/ligand/" + id }];
    const chebi = [];
    for (const rel of json.rcsb_chem_comp_related || []) {
      if (rel && rel.resource_name === "ChEBI") {
        const link = linkChebi(rel.resource_accession_code);
        if (link && !chebi.some((c) => c.url === link.url)) chebi.push(link);
      }
    }
    const massa = lerNumero(cc.formula_weight);
    return {
      codigo: id,
      estado: "ok",
      nome: cc.name ? String(cc.name) : null,
      tipo: cc.type ? String(cc.type) : null,
      formula: cc.formula ? String(cc.formula) : null,
      massa: massa.ausente ? null : massa.valor,
      massaTexto: massa.ausente ? null : massa.texto,
      links: links.concat(chebi),
      fonte: {
        nome: "wwPDB Chemical Component Dictionary via RCSB Data API",
        url: "https://data.rcsb.org/rest/v1/core/chemcomp/" + id,
      },
      papelBiologico: null,
      aviso: AVISO_PAPEL,
    };
  }

  function anotarChemCompPdbe(json, codigo) {
    const pedido = normToken(codigo);
    const lista = json && json[pedido];
    const cc = Array.isArray(lista) ? lista[0] : null;
    if (!cc) {
      return {
        codigo: pedido,
        estado: "erro",
        codigoErro: "ausente",
        mensagem: "A PDBe não devolveu ficha para " + pedido + ".",
      };
    }
    const massa = lerNumero(cc.weight);
    return {
      codigo: pedido,
      estado: "ok",
      nome: cc.name ? String(cc.name) : null,
      tipo: cc.compound_type ? String(cc.compound_type) : null,
      formula: cc.formula ? String(cc.formula) : null,
      massa: massa.ausente ? null : massa.valor,
      massaTexto: massa.ausente ? null : massa.texto,
      links: [
        { rotulo: "PDBe-chem " + pedido, url: "https://www.ebi.ac.uk/pdbe-srv/pdbechem/chemicalCompound/show/" + pedido },
        { rotulo: "RCSB ligand " + pedido, url: "https://www.rcsb.org/ligand/" + pedido },
      ],
      fonte: {
        nome: "PDBe compound summary",
        url: "https://www.ebi.ac.uk/pdbe/api/pdb/compound/summary/" + pedido,
      },
      papelBiologico: null,
      aviso: AVISO_PAPEL,
    };
  }

  async function consultarComponente(codigo, opts) {
    const o = opts || {};
    const id = normToken(codigo);
    if (!/^[A-Z0-9]{1,3}$/.test(id)) {
      return { codigo: id, estado: "nao_aplica", mensagem: "Código de componente fora do padrão consultado." };
    }
    if (o.cache && !o.forcar) {
      const hit = o.cache.lerComponente(id);
      if (hit) return hit;
    }
    const fetchImpl = o.fetch;
    if (typeof fetchImpl !== "function") return { codigo: id, estado: "erro", mensagem: "Sem consulta." };
    const url = "https://data.rcsb.org/rest/v1/core/chemcomp/" + id;
    try {
      const res = await Rede.fetch(url, { signal: o.signal, headers: { Accept: "application/json" } }, { fetch: fetchImpl });
      const status = statusDe(res);
      if (status === 429) return { codigo: id, estado: "erro", codigoErro: "429", mensagem: "RCSB respondeu 429 para " + id + ". A ficha não foi preenchida." };
      if (status === 200) {
        const ann = anotarChemCompRcsb(await res.json(), id);
        if (ann.estado === "ok") {
          if (o.cache) o.cache.gravarComponente(id, ann);
          return ann;
        }
      }
    } catch (e) {
      if (e && e.name === "AbortError") return { codigo: id, estado: "cancelado", mensagem: "Consulta do componente cancelada." };
    }
    const url2 = "https://www.ebi.ac.uk/pdbe/api/pdb/compound/summary/" + id;
    try {
      const res = await Rede.fetch(url2, { signal: o.signal, headers: { Accept: "application/json" } }, { fetch: fetchImpl });
      const status = statusDe(res);
      if (status === 429) return { codigo: id, estado: "erro", codigoErro: "429", mensagem: "PDBe respondeu 429 para " + id + ". A ficha não foi preenchida." };
      if (status === 404) return { codigo: id, estado: "erro", codigoErro: "404", mensagem: "Não há ficha CCD/PDBe para " + id + "." };
      if (status === 200) {
        const ann = anotarChemCompPdbe(await res.json(), id);
        if (ann.estado === "ok" && o.cache) o.cache.gravarComponente(id, ann);
        return ann;
      }
      return { codigo: id, estado: "erro", codigoErro: "http_" + status, mensagem: "Consulta de " + id + " devolveu HTTP " + status + "." };
    } catch (e) {
      if (e && e.name === "AbortError") return { codigo: id, estado: "cancelado", mensagem: "Consulta do componente cancelada." };
      if (Rede.ehTimeout(e)) return { codigo: id, estado: Rede.TIMEOUT.estado, codigoErro: Rede.TIMEOUT.codigo, mensagem: Rede.TIMEOUT.mensagem };
      return { codigo: id, estado: "erro", codigoErro: "rede", mensagem: "Não foi possível ler o CCD de " + id + " (rede ou CORS). Nenhum dado foi inventado." };
    }
  }

  function codigosParaConsulta(estrutura) {
    if (!estrutura || !estrutura.componentes) return [];
    const comp = estrutura.componentes;
    const itens = [];
    const push = (codigo, grupo, instancias) => {
      const id = normToken(codigo);
      if (!id) return;
      itens.push({ codigo: id, grupo, instancias: instancias || 0 });
    };
    for (const h of comp.hetero || []) push(h.codigo, "hetero", h.instancias);
    for (const i of comp.ions || []) push(i.codigo, "ion", i.instancias);
    for (const m of comp.modificados || []) push(m.codigo, "modificado", m.instancias);
    for (const a of (comp.aguas && comp.aguas.codigos) || []) push(a.codigo, "agua", a.instancias);
    for (const t of (comp.terminais && comp.terminais.codigos) || []) push(t.codigo, "terminal", t.instancias);
    for (const o of comp.outrosPolimeros || []) {
      for (const c of o.codigos || []) push(c.codigo, "outro-polimero", c.instancias);
    }
    return itens;
  }

  function posicoesDoCodigo(residuos, codigo) {
    const id = normToken(codigo);
    return (residuos || []).filter((r) => normToken(r.resname) === id).map((r) => ({
      chain: r.chain,
      seq: r.seq,
      icode: r.icode || "",
      altlocs: (r.altlocs || []).slice(),
      classe: r.classe,
      temCoordenadas: r.temCoordenadas === true,
    }));
  }

  function hipoteseDoGrupo(grupo, codigo, nome) {
    if (grupo === "modificado") return "Resíduo modificado na cadeia polimérica. Não é ligante livre, mesmo se a linha do arquivo for HETATM.";
    if (grupo === "ion") return "Íon por lista parcial de códigos do PEKI Fold. É hipótese de leitura, não papel biológico oficial.";
    if (grupo === "agua") return "Água registrada no modelo selecionado. Ausência de registro não significa amostra sem água.";
    if (grupo === "terminal") return "Grupo terminal da lista parcial. Não é ligante livre.";
    if (grupo === "outro-polimero") return "Polímero não peptídico pela leitura do arquivo. Não é uma atribuição biológica fechada.";
    const base = "Não classificado quanto ao papel biológico. HETATM não estabelece ligante, cofator, substrato, inibidor nem estado holo.";
    if (codigo === "GOL" || (nome && /GLYCEROL/i.test(nome))) {
      return base + " O nome glicerol no dicionário não prova que o componente é aditivo ou crioprotetor.";
    }
    return base;
  }

  function montarPainelComponentes(estrutura, anotacoes) {
    const mapa = new Map();
    for (const a of anotacoes || []) if (a && a.codigo) mapa.set(a.codigo, a);
    const grupos = {};
    for (const item of codigosParaConsulta(estrutura)) {
      const ann = mapa.get(item.codigo) || null;
      const ficha = {
        codigo: item.codigo,
        grupo: item.grupo,
        instancias: item.instancias,
        posicoes: posicoesDoCodigo(estrutura && estrutura.residuos, item.codigo),
        hipotese: hipoteseDoGrupo(item.grupo, item.codigo, ann && ann.nome),
        oficial: ann && ann.estado === "ok" ? ann : null,
        consulta: ann,
      };
      (grupos[item.grupo] = grupos[item.grupo] || []).push(ficha);
    }
    const prot = estrutura && estrutura.componentes && estrutura.componentes.proteinas;
    return {
      schema: SCHEMA,
      polimeros: prot ? {
        posicoes: prot.posicoes,
        padrao: prot.padrao,
        modificadas: prot.modificadas,
        cadeias: prot.cadeias || [],
        criterio: prot.criterio,
        nota: "Os 20 aminoácidos padrão não são consultados um a um no CCD nesta versão. A contagem sai do modelo selecionado.",
      } : null,
      grupos,
      holo: estrutura && estrutura.componentes ? estrutura.componentes.holo : null,
      aviso: AVISO_PAPEL,
    };
  }

  function respostaAtual(ticket, atual) {
    return !!(ticket && atual && ticket.geracao === atual.geracao && ticket.id === atual.id);
  }

  function metricaPorId(rel, id) {
    if (!rel || !rel.metricas) return null;
    return rel.metricas.find((m) => m.id === id) || null;
  }

  function textoDossie(dossie) {
    const L = [];
    L.push("Contrato " + SCHEMA + ".");
    if (!dossie) {
      L.push("Qualidade ainda não consultada. Nenhum indicador foi preenchido com zero.");
      return L.join("\n");
    }
    const rel = dossie.relatorio;
    if (!rel) {
      L.push("Relatório wwPDB ainda não consultado.");
    } else if (rel.estado === "nao_aplica") {
      L.push(rel.mensagem);
    } else if (rel.estado !== "ok" && rel.estado !== "parcial") {
      L.push(rel.mensagem || "A consulta ao relatório não devolveu indicadores.");
      if (rel.links) {
        L.push("Links oficiais: " + [rel.links.rcsb, rel.links.pdf, rel.links.xml].filter(Boolean).join(" "));
      }
    } else {
      L.push("Estado: " + rel.estado + ". Consulta: " + rel.consulta + ".");
      if (rel.fonte) {
        L.push("Fonte: " + rel.fonte.nome + ".");
        if (rel.fonte.url) L.push("URL: " + rel.fonte.url);
        if (rel.fonte.data) L.push("Data no relatório: " + rel.fonte.data + ".");
        if (rel.fonte.pdbid) L.push("ID no relatório: " + rel.fonte.pdbid + ".");
      }
      if (rel.metodo) L.push("Classe efetiva: " + rel.metodo.classe + ".");
      for (const m of rel.metricas || []) {
        L.push(m.rotulo + ": " + m.texto + (m.unidade ? " " + m.unidade : "") + ".");
      }
      if (rel.omitidos && rel.omitidos.length) {
        L.push("Não exibidos porque o relatório não trouxe valor: " + rel.omitidos.map((o) => o.rotulo + " (" + o.motivo + ")").join("; ") + ".");
      }
      if (rel.naoAplicaveis && rel.naoAplicaveis.length) {
        L.push("Não aplicados a este método: " + rel.naoAplicaveis.map((o) => o.rotulo).join("; ") + ".");
      }
      for (const a of rel.avisos || []) L.push(a);
      L.push(rel.avisoGlobal || AVISO_GLOBAL);
      const local = rel.local;
      if (local && local.estado === "ok") {
        L.push("Qualidade local: subgrupos lidos " + local.subgruposLidos + "; de outro modelo " + local.subgruposOutroModelo + "; sem chain/resnum/model " + local.campoAusente + ".");
        const cadeias = Object.keys(local.porCadeia || {});
        for (const c of cadeias) {
          const p = local.porCadeia[c];
          L.push("Cadeia " + c + ": " + p.comIndicador + " de " + p.residuosComCoordenadas + " posições com coordenada têm indicador; " + p.semIndicador + " sem indicador no relatório; lacunas sem coordenada " + p.lacunasSemCoordenada + ".");
        }
        L.push(local.aviso || AVISO_LOCAL);
      } else if (local) {
        L.push("Qualidade local pendente. " + (local.motivo || ""));
      }
      L.push(AVISO_VIZINHO);
    }
    const painel = dossie.componentes;
    if (painel && painel.grupos) {
      L.push("Componentes anotados. " + AVISO_PAPEL);
      if (painel.holo && painel.holo.motivo) L.push(painel.holo.motivo);
      for (const grupo of Object.keys(painel.grupos)) {
        for (const f of painel.grupos[grupo]) {
          const oficial = f.oficial;
          const pedaco = oficial
            ? [oficial.nome, oficial.tipo ? "tipo " + oficial.tipo : null, oficial.formula, oficial.massaTexto != null ? "massa " + oficial.massaTexto : null].filter(Boolean).join("; ")
            : (f.consulta && f.consulta.mensagem) || "sem ficha oficial";
          const fonte = oficial && oficial.fonte ? " Fonte: " + oficial.fonte.url : "";
          L.push(f.codigo + " ×" + f.instancias + " (" + grupo + "): " + pedaco + "." + fonte);
          L.push(f.hipotese);
        }
      }
    }
    return L.join("\n");
  }

  return {
    SCHEMA,
    LIMITE_BYTES,
    AVISO_GLOBAL,
    AVISO_LOCAL,
    AVISO_PAPEL,
    AVISO_VIZINHO,
    idClassico,
    normalizarId,
    urlsDe,
    classificarMetodo,
    classeEfetiva,
    lerXml,
    lerResumoRcsb,
    consultarRelatorio,
    anotarChemCompRcsb,
    anotarChemCompPdbe,
    consultarComponente,
    codigosParaConsulta,
    montarPainelComponentes,
    criarCache,
    respostaAtual,
    metricaPorId,
    textoDossie,
    mapearSubgrupos,
    extrairSubgrupos,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QualityModel;
