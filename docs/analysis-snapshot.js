// Análise guardável e comparação por pergunta — contrato peki-analise-1.
//
// O arquivo JSON fica no computador de quem analisa. Este módulo não envia
// nada a um servidor e não embute o PDB. A pontuação usa só campos presentes
// no snapshot: dado pendente não vira zero e não vira nota boa.

"use strict";

const AnalysisSnapshot = (() => {
  const SCHEMA = "peki-analise-1";
  const SCHEMA_COMPARACAO = "peki-comparacao-1";
  const VERSAO_APP = "peki-fold-web";
  const LIMITE_BYTES = 1500000;
  const MIN_ANALISES = 2;
  const MAX_ANALISES = 5;
  const AVISO_POCKET = "O drugScore é descritor geométrico do DoGSiteScorer. Não é afinidade, não identifica sítio funcional e não corresponde a um pocket alinhado entre estruturas.";
  const AVISO_HOLO = "Componente observado no snapshot não prova estado holo, apo nem função biológica.";
  const AVISO_RANKING = "A pontuação é apoio calculado com os critérios e os pesos desta pergunta. Não é verdade biológica nem nota universal de qualidade.";

  const UMA = {
    ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E",
    GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F",
    PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
  };
  const POLIMERO = new Set(["proteina", "proteina-modificada", "outro-polimero", "terminal"]);
  const ESTADOS_QUALIDADE = new Set(["ok", "parcial", "pendente", "ausente", "erro", "nao_consultada", "nao_aplica", "rede"]);
  const ESTADOS_POCKET = new Set(["ok", "pendente", "nao_solicitado", "erro", "nao_aplica"]);
  const METRICAS_MENOR_MELHOR = [
    { id: "resolucao", rotulo: "Resolução", classes: ["xray"] },
    { id: "rfree", rotulo: "Rfree", classes: ["xray"] },
    { id: "clashscore", rotulo: "Clashscore", classes: null },
    { id: "rama", rotulo: "Ramachandran outliers", classes: null },
  ];

  const REGRAS = [
    "Entram de 2 a 5 análises já guardadas. Uma só, ou mais de cinco, não gera ranking.",
    "Peso zero exclui o critério da pontuação. Peso não cria dado que o snapshot não tem.",
    "Dado pendente, não solicitado ou com erro fica indisponível. Não é convertido em zero nem em nota boa.",
    "A pontuação de cada candidato é a média ponderada das subpontuações disponíveis. Os pesos desses critérios são renormalizados para somar 1. A fração dos pesos ativos que tinham dado é informada à parte e não entra como bônus escondido.",
    "Cobertura é a proporção de resíduos poliméricos modelados sobre modelados mais ausentes citados por fonte explícita. Sem essa fonte, a cobertura fica indisponível.",
    "Se a região informada for comparável no número author e no acesso declarado, a cobertura passa a ser a dessa faixa, no referencial de cada análise. Sem mapa resíduo a resíduo, números que não concordam não são tratados como o mesmo sítio.",
    "Qualidade usa só métricas numéricas presentes, da mesma classe experimental, em pelo menos duas análises. Menor valor fica mais alto dentro deste conjunto. Métrica ausente não entra na média daquele candidato.",
    "O componente pedido conta como observado ou ausente no inventário do snapshot. Isso não estabelece holo nem função.",
    "Pocket usa o maior drugScore devolvido pelo DoGSiteScorer. O valor é normalizado só entre quem tem o número. Não há correspondência estrutural entre pockets.",
    "Critério eliminatório que falha, ou que não dá para verificar, tira o candidato do ranking. Não o coloca em último com nota zero.",
    "Empate na pontuação permanece empate. A ordem alfabética do identificador só organiza a lista.",
  ];

  function obj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function texto(v) { return v == null ? "" : String(v); }
  function corte(v, n) {
    const s = texto(v).replace(/\s+/g, " ").trim();
    return s ? s.slice(0, n) : null;
  }
  function inteiro(v) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return Math.trunc(v);
  }
  function decimal(v) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function arred(v) {
    if (v == null || !Number.isFinite(v)) return null;
    return Math.round(v * 1000) / 1000;
  }
  function fmt(v) {
    if (v == null || !Number.isFinite(v)) return "indisponível";
    const n = arred(v);
    return String(n);
  }
  function selo(rotulo) {
    const s = texto(rotulo).replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40);
    return s || "analise";
  }

  function nomeArquivo(snap) {
    return selo(snap && snap.rotulo) + "-analise.json";
  }

  function idDe(rotulo, iso) {
    const stamp = texto(iso).replace(/[-:]/g, "").replace(".", "");
    return (selo(rotulo) + "-" + stamp).slice(0, 80);
  }

  function umaLetra(resname) {
    return UMA[texto(resname).toUpperCase()] || "X";
  }

  function cmpRes(a, b) {
    const sa = a.seq == null ? 1e9 : a.seq;
    const sb = b.seq == null ? 1e9 : b.seq;
    if (sa !== sb) return sa - sb;
    return texto(a.icode).localeCompare(texto(b.icode));
  }

  function cadeiasDe(est) {
    const porId = new Map();
    const ordem = [];
    function garantir(id, auth, label) {
      if (porId.has(id)) return porId.get(id);
      const row = { id, auth: auth || null, label: label || null, sequencia: "", residuos: [] };
      porId.set(id, row);
      ordem.push(id);
      return row;
    }
    for (const c of (est && est.cadeias) || []) garantir(texto(c.id), c.auth, c.label);
    for (const r of (est && est.residuos) || []) {
      if (r.temCoordenadas !== true || !POLIMERO.has(r.classe)) continue;
      const row = garantir(texto(r.chain), r.authChain, r.labelChain);
      row.residuos.push({
        resname: texto(r.resname).toUpperCase(),
        seq: r.seq == null ? null : r.seq,
        icode: texto(r.icode),
        classe: r.classe,
      });
    }
    return ordem.map((id) => {
      const row = porId.get(id);
      row.residuos.sort(cmpRes);
      row.sequencia = row.residuos.map((r) => umaLetra(r.resname)).join("");
      return row;
    });
  }

  function listaCodigos(lista) {
    return (lista || []).map((item) => ({
      codigo: texto(item.codigo || item.resname).toUpperCase(),
      instancias: inteiro(item.instancias) == null ? 1 : inteiro(item.instancias),
      nome: corte(item.nome, 160),
    })).filter((item) => item.codigo);
  }

  function ccdDe(qualidade) {
    const painel = qualidade && qualidade.componentes;
    if (!painel || !obj(painel.grupos)) return { ccdEstado: "nao_consultado", anotacoesCcd: [] };
    const anotacoes = [];
    for (const grupo of Object.keys(painel.grupos)) {
      for (const f of painel.grupos[grupo] || []) {
        const oficial = f && f.oficial;
        const consulta = f && f.consulta;
        anotacoes.push({
          codigo: texto(f.codigo).toUpperCase(),
          grupo: corte(f.grupo || grupo, 40),
          instancias: inteiro(f.instancias),
          nome: oficial && oficial.nome ? corte(oficial.nome, 160) : null,
          tipo: oficial && oficial.tipo ? corte(oficial.tipo, 80) : null,
          estado: consulta && consulta.estado ? corte(consulta.estado, 40) : (oficial ? "ok" : "nao_consultado"),
        });
      }
    }
    let ccdEstado = "ok";
    if (!anotacoes.length) ccdEstado = "ausente";
    else if (anotacoes.some((a) => a.estado !== "ok")) ccdEstado = "parcial";
    return { ccdEstado, anotacoesCcd: anotacoes };
  }

  function qualidadeDe(estado) {
    const pdbId = estado && estado.pdbId ? texto(estado.pdbId).toUpperCase() : "";
    const vazio = (sit, motivo) => ({
      estado: sit,
      motivo,
      classe: null,
      consulta: null,
      fonte: null,
      metricas: [],
      omitidos: [],
      local: { estado: sit, motivo },
    });
    if (!pdbId) {
      return vazio("ausente", "Sem ID de depósito, o relatório wwPDB não foi consultado. Nenhum indicador foi preenchido.");
    }
    const rel = estado.qualidade && estado.qualidade.relatorio;
    if (!rel) {
      return vazio("pendente", "A consulta ao relatório wwPDB ainda não concluiu nesta análise. Os indicadores não foram inventados nem zerados.");
    }
    const sit = ESTADOS_QUALIDADE.has(rel.estado) ? rel.estado : "erro";
    const metricas = (sit === "ok" || sit === "parcial") ? (rel.metricas || []).map((m) => ({
      id: texto(m.id),
      rotulo: corte(m.rotulo, 180) || texto(m.id),
      valor: decimal(m.valor),
      unidade: corte(m.unidade, 16),
    })).filter((m) => m.id && m.valor != null) : [];
    const omitidos = (rel.omitidos || []).map((o) => ({
      id: texto(o.id),
      motivo: corte(o.motivo, 180) || "não informado",
    })).filter((o) => o.id);
    const fonte = rel.fonte && obj(rel.fonte) ? {
      nome: corte(rel.fonte.nome, 160),
      url: corte(rel.fonte.url, 240),
      data: corte(rel.fonte.data, 80),
    } : null;
    const local = rel.local && obj(rel.local) ? {
      estado: corte(rel.local.estado, 40) || "pendente",
      motivo: corte(rel.local.motivo, 240),
    } : { estado: "pendente", motivo: "Indicador por resíduo não registrado neste snapshot." };
    return {
      estado: sit,
      motivo: corte(rel.mensagem, 300),
      classe: rel.metodo && rel.metodo.classe ? corte(rel.metodo.classe, 24) : null,
      consulta: corte(rel.consulta, 40),
      fonte,
      metricas,
      omitidos,
      local,
    };
  }

  function pocketsDe(estado) {
    const pdbId = estado && estado.pdbId ? texto(estado.pdbId).toUpperCase() : "";
    const base = { fonte: null, aviso: AVISO_POCKET, itens: [] };
    if (!pdbId) {
      return { ...base, estado: "nao_aplica", motivo: "A detecção desta versão usa a API do DoGSiteScorer por ID de PDB. Este arquivo não teve detecção." };
    }
    const info = estado.pocketsInfo;
    if (info && info.estado === "erro") {
      return { ...base, estado: "erro", motivo: corte(info.motivo, 240) || "A detecção de pockets falhou. Nenhum drugScore foi inventado.", fonte: "DoGSiteScorer/ProteinsPlus" };
    }
    if (info && info.estado === "pendente") {
      return { ...base, estado: "pendente", motivo: corte(info.motivo, 240) || "A detecção de pockets ainda não concluiu.", fonte: "DoGSiteScorer/ProteinsPlus" };
    }
    if (Array.isArray(estado.pockets)) {
      const itens = estado.pockets.map((p) => ({
        name: corte(p.name, 40) || "pocket",
        volume: decimal(p.volume),
        surface: decimal(p.surface),
        depth: decimal(p.depth),
        hydrophobicity: decimal(p.hydrophobicity),
        drugScore: decimal(p.drugScore),
      }));
      return {
        ...base,
        estado: "ok",
        motivo: itens.length ? null : "A detecção concluiu sem pocket na tabela.",
        fonte: "DoGSiteScorer/ProteinsPlus",
        itens,
      };
    }
    return { ...base, estado: "nao_solicitado", motivo: "A detecção não foi executada nesta análise. Não há drugScore para converter em zero." };
  }

  function preparoDe(est, preparo) {
    if (est && est.recursos && est.recursos.preparo === "bloqueado") {
      return {
        estado: "bloqueado",
        motivo: corte(est.recursos.preparoMotivo, 240) || "A ficha de preparo não lê este formato.",
        versao: null, predita: null, contagens: null, selecao: null, anotacoes: null, caixaVina: null,
      };
    }
    if (!preparo) {
      return {
        estado: "nao_calculado",
        motivo: "A ficha de preparo não foi registrada neste guardado.",
        versao: null, predita: null, contagens: null, selecao: null, anotacoes: null, caixaVina: null,
      };
    }
    return {
      estado: ["ok", "bloqueado", "nao_calculado", "desligado"].includes(preparo.estado) ? preparo.estado : "nao_calculado",
      motivo: corte(preparo.motivo, 240),
      versao: corte(preparo.versao, 40),
      predita: corte(preparo.predita, 300),
      contagens: preparo.contagens && obj(preparo.contagens) ? {
        dissulfetos: inteiro(preparo.contagens.dissulfetos),
        glicosilacao: inteiro(preparo.contagens.glicosilacao),
        ions: inteiro(preparo.contagens.ions),
        histidinas: inteiro(preparo.contagens.histidinas),
        aguas: inteiro(preparo.contagens.aguas),
      } : null,
      selecao: preparo.selecao && obj(preparo.selecao) ? {
        cadeias: (preparo.selecao.cadeias || []).map((c) => texto(c)).slice(0, 40),
        removerAguas: !!preparo.selecao.removerAguas,
        altloc: corte(preparo.selecao.altloc, 8),
        codigosHetMantidos: (preparo.selecao.codigosHetMantidos || []).map((c) => texto(c).toUpperCase()).filter(Boolean).slice(0, 80),
      } : null,
      anotacoes: preparo.anotacoes && obj(preparo.anotacoes) ? {
        inventario: corte(preparo.anotacoes.inventario, 500),
        limpeza: corte(preparo.anotacoes.limpeza, 500),
        ions: corte(preparo.anotacoes.ions, 500),
        dissulfetos: corte(preparo.anotacoes.dissulfetos, 500),
        glicosilacao: corte(preparo.anotacoes.glicosilacao, 500),
        histidinas: corte(preparo.anotacoes.histidinas, 500),
        vina: corte(preparo.anotacoes.vina, 500),
      } : null,
      caixaVina: preparo.caixaVina && obj(preparo.caixaVina) ? {
        editada: true,
        center_x: decimal(preparo.caixaVina.center_x),
        center_y: decimal(preparo.caixaVina.center_y),
        center_z: decimal(preparo.caixaVina.center_z),
        size_x: decimal(preparo.caixaVina.size_x),
        size_y: decimal(preparo.caixaVina.size_y),
        size_z: decimal(preparo.caixaVina.size_z),
        aviso: "Sugestão editável no formato da ficha. Não é resultado de docking.",
      } : null,
    };
  }

  function identidadeDeWorkspace(estado, est) {
    const pdbId = estado.pdbId ? texto(estado.pdbId).toUpperCase() : null;
    const nomeArquivoLocal = corte(estado.nome, 120);
    const idArquivo = est.identidade && est.identidade.id ? texto(est.identidade.id).toUpperCase() : null;
    const rotuloBruto = pdbId || idArquivo || (nomeArquivoLocal ? nomeArquivoLocal.replace(/\.[^.]+$/, "") : "analise");
    const rotulo = corte(rotuloBruto, 80) || "analise";
    const metodo = est.identidade && est.identidade.metodo ? texto(est.identidade.metodo) : "";
    const titulo = est.identidade && est.identidade.titulo ? texto(est.identidade.titulo) : "";
    let tipo = "desconhecida";
    if (/alphafold|colabfold|esmfold|rosettafold/i.test(metodo + " " + titulo)) tipo = "alphafold";
    else if (pdbId && /^[0-9][A-Z0-9]{3}$/.test(pdbId)) tipo = "rcsb";
    else if (nomeArquivoLocal) tipo = "arquivo";
    const formato = est.formato === "mmcif" || est.formato === "pdb" ? est.formato : "desconhecido";
    const fonte = tipo === "rcsb" ? "RCSB PDB" : (tipo === "alphafold" ? "estrutura predita citada no arquivo" : (tipo === "arquivo" ? "arquivo local" : "não identificada"));
    const url = tipo === "rcsb" && pdbId
      ? "https://files.rcsb.org/download/" + pdbId + (formato === "mmcif" ? ".cif" : ".pdb")
      : null;
    return { pdbId, nomeArquivoLocal, rotulo, metodo, titulo, tipo, formato, fonte, url };
  }

  function residuosAusentesDeWorkspace(lac) {
    const naoResolvidos = (lac.naoResolvidos || []).map((r) => ({
      cadeia: texto(r.cadeiaAuth || r.chain),
      resname: texto(r.resname).toUpperCase(),
      seq: r.authSeq == null ? null : r.authSeq,
      icode: texto(r.icode),
    }));
    const saltos = (lac.saltosNumeracao || []).map((s) => ({
      cadeia: texto(s.cadeia),
      de: s.de && s.de.seq != null ? s.de.seq : null,
      para: s.para && s.para.seq != null ? s.para.seq : null,
      interpretacao: corte(s.interpretacao, 40),
    }));
    return { naoResolvidos, saltos };
  }

  function componentesDeWorkspace(comp, ccd, polimerosModelados) {
    return {
      proteinas: {
        posicoes: comp.proteinas ? inteiro(comp.proteinas.posicoes) : polimerosModelados,
        padrao: comp.proteinas ? inteiro(comp.proteinas.padrao) : null,
        modificadas: comp.proteinas ? inteiro(comp.proteinas.modificadas) : null,
      },
      hetero: listaCodigos(comp.hetero),
      ions: listaCodigos(comp.ions),
      modificados: listaCodigos(comp.modificados),
      aguas: {
        instancias: comp.aguas ? inteiro(comp.aguas.instancias) || 0 : 0,
        nota: corte(comp.aguas && comp.aguas.nota, 240) || "Contagem de águas registradas no modelo. Ausência de registro não significa amostra sem água.",
      },
      holo: {
        estado: corte(comp.holo && comp.holo.estado, 40) || "nao_determinado",
        motivo: corte(comp.holo && comp.holo.motivo, 240) || AVISO_HOLO,
      },
      anotacoesCcd: ccd.anotacoesCcd,
      ccdEstado: ccd.ccdEstado,
    };
  }

  function uniprotDeWorkspace(est) {
    return {
      correspondenciaResiduo: "nao_estabelecida",
      motivo: corte(est.uniprot && est.uniprot.motivo, 300) || "Não há mapa resíduo a resíduo com o UniProt.",
      declaracoes: ((est.uniprot && est.uniprot.declaracoes) || []).map((d) => ({
        cadeia: d.cadeiaAuth == null ? null : texto(d.cadeiaAuth),
        accession: corte(d.accession, 40),
        db: corte(d.db, 40),
        pdbInicio: d.pdbInicio == null ? null : d.pdbInicio,
        pdbFim: d.pdbFim == null ? null : d.pdbFim,
      })),
    };
  }

  function limitacoesDeWorkspace(est) {
    return [
      "O PDB original não foi embutido. A comparação usa este snapshot, não uma nova leitura do depósito.",
      "Não há mapa resíduo a resíduo com UniProt nem sobreposição estrutural.",
      AVISO_HOLO,
      AVISO_POCKET,
      "O relatório wwPDB global não garante a qualidade do sítio.",
    ].concat((est.limitacoes || []).map((l) => corte(l, 240)).filter(Boolean)).slice(0, 24);
  }

  function montarDeWorkspace(estado, opcoes) {
    const o = opcoes || {};
    const est = estado && estado.estrutura;
    if (!est || est.schema !== "peki-estrutura-1") {
      throw new Error("Ainda não há leitura estrutural para guardar. Abra uma estrutura antes.");
    }
    const agora = o.agora || new Date().toISOString();
    const {
      pdbId, nomeArquivoLocal, rotulo, metodo, titulo, tipo, formato, fonte, url,
    } = identidadeDeWorkspace(estado, est);
    const cadeias = cadeiasDe(est);
    const polimerosModelados = cadeias.reduce((s, c) => s + c.residuos.length, 0);
    const lac = est.lacunas || {};
    const { naoResolvidos, saltos } = residuosAusentesDeWorkspace(lac);
    const comp = est.componentes || {};
    const ccd = ccdDe(estado.qualidade);
    const motivo = estado.ultimoMotivo && estado.ultimoMotivo.motivo ? {
      consulta: corte(estado.ultimoMotivo.motivo, 80),
      ocorrencias: Array.isArray(estado.ultimoMotivo.ocorrencias) ? estado.ultimoMotivo.ocorrencias.length : null,
    } : null;
    const resolucao = est.identidade && est.identidade.resolucao != null ? {
      valor: decimal(est.identidade.resolucao),
      unidade: "Å",
      origem: corte(est.identidade.resolucaoOrigem, 80) || "arquivo",
    } : null;
    const snap = {
      schema: SCHEMA,
      versaoApp: VERSAO_APP,
      geradoEm: agora,
      id: o.id || idDe(rotulo, agora),
      rotulo,
      origem: {
        tipo,
        pdbId,
        nomeArquivo: nomeArquivoLocal,
        formato,
        fonte,
        url,
        titulo: corte(titulo, 300),
        metodo: corte(metodo, 160),
        resolucaoArquivo: resolucao && resolucao.valor != null ? resolucao : null,
        sintetico: false,
        nota: "O PDB original não foi embutido. Este arquivo guarda a leitura usada na comparação e fica no computador de quem o baixou.",
      },
      modelo: {
        selecionado: est.modelo ? est.modelo.selecionado : null,
        total: est.modelo ? est.modelo.total : null,
        criterio: est.modelo ? corte(est.modelo.criterio, 120) : null,
      },
      cadeias,
      cobertura: { polimerosModelados },
      lacunas: {
        determinado: lac.determinado === true,
        resumo: corte(lac.resumo, 400) || "Lacunas não registradas.",
        naoResolvidos,
        saltosNumeracao: saltos,
        foraDoConstructo: corte(lac.foraDoConstructo && lac.foraDoConstructo.motivo, 240) || "Fora do constructo não avaliado.",
      },
      componentes: componentesDeWorkspace(comp, ccd, polimerosModelados),
      qualidade: qualidadeDe(estado),
      pockets: pocketsDe(estado),
      preparo: preparoDe(est, o.preparo || null),
      uniprot: uniprotDeWorkspace(est),
      anotacoes: { motivoSequencia: motivo },
      limitacoes: limitacoesDeWorkspace(est),
    };
    const checagem = validarObjeto(snap);
    if (!checagem.ok) throw new Error("O guardado não passou na validação interna: " + checagem.erro);
    return checagem.analise;
  }

  function falha(msg) { return { ok: false, erro: msg, analise: null }; }

  function validarTexto(textoJson, meta) {
    const bruto = texto(textoJson);
    const bytes = meta && meta.bytes != null ? meta.bytes : bruto.length;
    if (bytes > LIMITE_BYTES || bruto.length > LIMITE_BYTES) {
      return falha("O arquivo passa de 1,5 MB. Uma análise guardada não inclui o PDB original.");
    }
    if (!bruto.trim()) return falha("O arquivo está vazio.");
    let valor;
    try {
      valor = JSON.parse(bruto, (chave, item) => {
        if (chave === "__proto__" || chave === "constructor" || chave === "prototype") {
          throw new Error("campo não aceito");
        }
        return item;
      });
    } catch (e) {
      if (texto(e.message) === "campo não aceito") return falha("O JSON contém um campo não aceito. A comparação atual foi mantida.");
      return falha("O arquivo não é JSON válido. A comparação atual foi mantida.");
    }
    return validarObjeto(valor);
  }

  function validarObjeto(valor) {
    if (!obj(valor)) return falha("O JSON precisa ser um objeto de análise, não uma lista nem um valor solto.");
    const schema = texto(valor.schema);
    const versao = schema.match(/^peki-analise-(\d+)$/);
    if (!versao) return falha("O arquivo não é uma análise PEKI (schema ausente ou desconhecido). A comparação atual foi mantida.");
    if (Number(versao[1]) > 1) {
      return falha("Versão futura incompatível (" + schema + "). Esta versão lê " + SCHEMA + ". A comparação atual foi mantida.");
    }
    if (schema !== SCHEMA) return falha("Schema " + schema + " não é lido por esta versão. A comparação atual foi mantida.");
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(texto(valor.id))) return falha("O identificador da análise está ausente ou usa caracteres não aceitos.");
    if (!corte(valor.rotulo, 80)) return falha("Falta o rótulo da análise.");
    if (!/^\d{4}-\d{2}-\d{2}T/.test(texto(valor.geradoEm))) return falha("A data do guardado não está em ISO 8601.");
    if (!obj(valor.origem)) return falha("Falta a origem da estrutura.");
    const tipos = new Set(["rcsb", "arquivo", "alphafold", "desconhecida"]);
    if (!tipos.has(valor.origem.tipo)) return falha("A origem da estrutura tem tipo desconhecido.");
    const formatos = new Set(["pdb", "mmcif", "desconhecido"]);
    if (!formatos.has(valor.origem.formato)) return falha("O formato da origem não é pdb, mmcif nem desconhecido.");
    if (!Array.isArray(valor.cadeias)) return falha("Falta a lista de cadeias.");
    for (const c of valor.cadeias) {
      if (!obj(c) || !texto(c.id) || typeof c.sequencia !== "string" || !Array.isArray(c.residuos)) {
        return falha("Uma cadeia está sem id, sequência ou resíduos.");
      }
      for (const r of c.residuos) {
        if (!obj(r) || !texto(r.resname)) return falha("Há resíduo sem nome na cadeia " + c.id + ".");
      }
    }
    if (!obj(valor.cobertura) || inteiro(valor.cobertura.polimerosModelados) == null) {
      return falha("Falta a contagem de polímeros modelados.");
    }
    if (!obj(valor.lacunas) || typeof valor.lacunas.determinado !== "boolean" || !Array.isArray(valor.lacunas.naoResolvidos)) {
      return falha("As lacunas precisam informar se o diagnóstico está determinado e listar os ausentes.");
    }
    if (!obj(valor.componentes) || !Array.isArray(valor.componentes.hetero) || !obj(valor.componentes.holo)) {
      return falha("Falta o inventário de componentes.");
    }
    if (!obj(valor.qualidade) || !ESTADOS_QUALIDADE.has(valor.qualidade.estado)) {
      return falha("O estado da qualidade está ausente ou não é reconhecido.");
    }
    if (!obj(valor.pockets) || !ESTADOS_POCKET.has(valor.pockets.estado) || !Array.isArray(valor.pockets.itens)) {
      return falha("O estado dos pockets está ausente ou não é reconhecido.");
    }
    if (!obj(valor.preparo) || !texto(valor.preparo.estado)) return falha("Falta o estado da ficha de preparo.");
    if (!obj(valor.uniprot) || valor.uniprot.correspondenciaResiduo !== "nao_estabelecida") {
      return falha("O snapshot não pode afirmar mapa resíduo a resíduo com o UniProt.");
    }
    return { ok: true, erro: null, analise: valor };
  }

  function importar(textoJson, colecao, meta) {
    const atual = Array.isArray(colecao) ? colecao.slice() : [];
    const lido = validarTexto(textoJson, meta);
    if (!lido.ok) return { ok: false, erro: lido.erro, colecao: atual, analise: null };
    if (atual.length >= MAX_ANALISES) {
      return { ok: false, erro: "Esta comparação aceita no máximo 5 análises. Remova uma antes de importar outra.", colecao: atual, analise: null };
    }
    if (atual.some((a) => a.id === lido.analise.id)) {
      return { ok: false, erro: "Já existe uma análise com o identificador " + lido.analise.id + ". A lista não foi alterada.", colecao: atual, analise: null };
    }
    return { ok: true, erro: null, colecao: atual.concat([lido.analise]), analise: lido.analise };
  }

  function parseRegiao(entrada) {
    const t = texto(entrada).trim();
    if (!t) return { ok: true, vazia: true, segmentos: [], motivo: null };
    if (t.length > 120) return { ok: false, vazia: false, segmentos: [], motivo: "A região passa de 120 caracteres." };
    const partes = t.split(",").map((s) => s.trim()).filter(Boolean);
    if (!partes.length || partes.length > 12) {
      return { ok: false, vazia: false, segmentos: [], motivo: "Use até 12 trechos, como A:10-40 ou A:10-40,B:1-20." };
    }
    const segmentos = [];
    const vistos = new Set();
    for (const p of partes) {
      const faixa = p.match(/^([A-Za-z0-9_]{1,4}):(\d+)-(\d+)$/);
      const unico = p.match(/^([A-Za-z0-9_]{1,4}):(\d+)$/);
      const m = faixa || unico;
      if (!m) return { ok: false, vazia: false, segmentos: [], motivo: "Trecho inválido \"" + p + "\". Use cadeia:início-fim, por exemplo A:10-40." };
      const cadeia = m[1];
      const inicio = Number(m[2]);
      const fim = m[3] == null ? inicio : Number(m[3]);
      if (fim < inicio) return { ok: false, vazia: false, segmentos: [], motivo: "Em " + p + " o fim é menor que o início." };
      if (fim - inicio > 2000) return { ok: false, vazia: false, segmentos: [], motivo: "O trecho " + p + " passa de 2000 resíduos." };
      const chave = cadeia + ":" + inicio + "-" + fim;
      if (vistos.has(chave)) return { ok: false, vazia: false, segmentos: [], motivo: "O trecho " + chave + " está repetido." };
      vistos.add(chave);
      segmentos.push({ cadeia, inicio, fim });
    }
    return { ok: true, vazia: false, segmentos, motivo: null };
  }

  function avaliarRegiao(snap, regiao) {
    if (!regiao || regiao.vazia) return { ok: true, vazia: true, segmentos: [], motivo: null };
    if (!regiao.ok) return { ok: false, vazia: false, segmentos: [], motivo: regiao.motivo };
    const segmentos = [];
    for (const seg of regiao.segmentos) {
      const cadeia = (snap.cadeias || []).find((c) => c.id === seg.cadeia);
      if (!cadeia) {
        return { ok: false, vazia: false, segmentos: [], motivo: "A cadeia " + seg.cadeia + " não existe em " + snap.rotulo + "." };
      }
      const modelados = [];
      const ausentes = [];
      let insercoes = 0;
      for (const r of cadeia.residuos) {
        if (r.seq == null || r.seq < seg.inicio || r.seq > seg.fim) continue;
        if (r.icode) insercoes += 1;
        modelados.push(r);
      }
      for (const r of snap.lacunas.naoResolvidos || []) {
        if (r.cadeia !== seg.cadeia || r.seq == null || r.seq < seg.inicio || r.seq > seg.fim) continue;
        ausentes.push(r);
      }
      const indeterminado = snap.lacunas.determinado !== true && (seg.fim - seg.inicio + 1) > modelados.length + ausentes.length;
      segmentos.push({
        cadeia: seg.cadeia,
        inicio: seg.inicio,
        fim: seg.fim,
        modelados: modelados.length,
        ausentes: ausentes.length,
        insercoes,
        indeterminado,
        residuos: modelados.map((r) => r.resname + r.seq + (r.icode || "")).slice(0, 12),
      });
    }
    const indeterminado = segmentos.some((s) => s.indeterminado);
    return {
      ok: true,
      vazia: false,
      segmentos,
      indeterminado,
      motivo: indeterminado ? "A região tem posições sem fonte explícita de ausência em " + snap.rotulo + ". Elas não entram como falha nem como acerto." : null,
    };
  }

  function acessos(snap, cadeia) {
    const saida = new Set();
    for (const d of (snap.uniprot && snap.uniprot.declaracoes) || []) {
      if (!d.accession) continue;
      if (d.cadeia && d.cadeia !== cadeia) continue;
      saida.add(texto(d.accession).toUpperCase());
    }
    return [...saida].sort();
  }

  function numeracaoComparavel(snaps, regiao) {
    if (!regiao || regiao.vazia) {
      return { aplicavel: false, comparavel: null, motivo: "Nenhuma região foi informada. A cobertura, quando pesada, usa o modelo inteiro." };
    }
    if (!regiao.ok) return { aplicavel: true, comparavel: false, motivo: regiao.motivo };
    const conflitos = [];
    for (const seg of regiao.segmentos) {
      const mapas = snaps.map((snap) => {
        const cadeia = (snap.cadeias || []).find((c) => c.id === seg.cadeia);
        const mapa = new Map();
        if (cadeia) {
          for (const r of cadeia.residuos) {
            if (r.seq == null || r.icode || r.seq < seg.inicio || r.seq > seg.fim) continue;
            mapa.set(r.seq, r.resname);
          }
        }
        return { snap, cadeia: !!cadeia, mapa, acessos: acessos(snap, seg.cadeia) };
      });
      if (mapas.some((m) => !m.cadeia)) {
        conflitos.push("A cadeia " + seg.cadeia + " não está em todas as análises.");
        continue;
      }
      const accComValor = mapas.filter((m) => m.acessos.length);
      if (accComValor.length !== mapas.length) {
        conflitos.push("A cadeia " + seg.cadeia + " não tem o mesmo acesso de banco declarado em todas as análises. O número author não foi tratado como o mesmo resíduo.");
      } else {
        const primeiro = mapas[0].acessos.join(",");
        if (mapas.some((m) => m.acessos.join(",") !== primeiro)) {
          conflitos.push("Os acessos declarados da cadeia " + seg.cadeia + " divergem. A faixa não é o mesmo sítio.");
        }
      }
      const numeros = new Set();
      mapas.forEach((m) => m.mapa.forEach((nome, seq) => numeros.add(seq)));
      for (const seq of numeros) {
        const nomes = mapas.map((m) => m.mapa.get(seq)).filter(Boolean);
        if (nomes.length >= 2 && nomes.some((n) => n !== nomes[0])) {
          conflitos.push("Na cadeia " + seg.cadeia + ", o resíduo " + seq + " não tem o mesmo nome em todas as análises que o modelam.");
          break;
        }
      }
    }
    if (conflitos.length) {
      return { aplicavel: true, comparavel: false, motivo: conflitos[0] + " Sem mapa UniProt e sem alinhamento, a região não entra na pontuação como se fosse o mesmo lugar." };
    }
    return {
      aplicavel: true,
      comparavel: true,
      motivo: "A faixa usa o número author e o acesso declarado no arquivo. Isso não é mapa resíduo a resíduo nem sobreposição estrutural.",
    };
  }

  function pesoDe(v, nome, erros) {
    if (v == null || v === "") return 1;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      erros.push("O peso de " + nome + " precisa ser um número entre 0 e 100.");
      return 0;
    }
    return n;
  }

  function normalizarPergunta(entrada) {
    const p = entrada || {};
    const erros = [];
    const pesosEntrada = obj(p.pesos) ? p.pesos : {};
    const pergunta = {
      regiao: texto(p.regiao).trim(),
      regiaoEssencial: !!p.regiaoEssencial,
      componente: texto(p.componente).trim(),
      componenteEliminatorio: !!p.componenteEliminatorio,
      pocketEliminatorio: !!p.pocketEliminatorio,
      pesos: {
        cobertura: pesoDe(pesosEntrada.cobertura, "cobertura", erros),
        qualidade: pesoDe(pesosEntrada.qualidade, "qualidade", erros),
        componente: pesoDe(pesosEntrada.componente, "componente", erros),
        pocket: pesoDe(pesosEntrada.pocket, "pocket", erros),
      },
    };
    const regiao = parseRegiao(pergunta.regiao);
    if (!regiao.ok) erros.push(regiao.motivo);
    return { ok: erros.length === 0, erros, pergunta, regiao };
  }

  function catalogoComponentes(snap) {
    const itens = [];
    function add(lista, grupo) {
      for (const item of lista || []) {
        itens.push({
          codigo: texto(item.codigo).toUpperCase(),
          nome: texto(item.nome).toUpperCase(),
          instancias: item.instancias || 0,
          grupo,
        });
      }
    }
    add(snap.componentes.hetero, "hetero");
    add(snap.componentes.ions, "ion");
    add(snap.componentes.modificados, "modificado");
    add(snap.componentes.anotacoesCcd, "ccd");
    const aguas = snap.componentes.aguas && snap.componentes.aguas.instancias;
    if (aguas) itens.push({ codigo: "HOH", nome: "WATER", instancias: aguas, grupo: "agua" });
    return itens;
  }

  function presenciaComponente(snap, pedido) {
    const alvo = texto(pedido).trim().toUpperCase();
    if (!alvo) return { pedido: false, presente: null, instancias: 0, grupos: [] };
    const hits = catalogoComponentes(snap).filter((item) => item.codigo === alvo || (item.nome && item.nome === alvo));
    const instancias = hits.reduce((s, item) => s + (item.instancias || 0), 0);
    return { pedido: true, presente: instancias > 0, instancias, grupos: [...new Set(hits.map((h) => h.grupo))] };
  }

  function melhorPocket(snap) {
    if (!snap.pockets || snap.pockets.estado !== "ok") {
      return { disponivel: false, motivo: snap.pockets && snap.pockets.motivo ? snap.pockets.motivo : "Pocket indisponível." };
    }
    let melhor = null;
    for (const item of snap.pockets.itens || []) {
      if (item.drugScore == null) continue;
      if (!melhor || item.drugScore > melhor.drugScore) melhor = item;
    }
    if (!melhor) return { disponivel: false, motivo: "Não há drugScore numérico neste snapshot." };
    return { disponivel: true, nome: melhor.name, drugScore: melhor.drugScore, volume: melhor.volume };
  }

  function coberturaGlobal(snap) {
    if (!snap.lacunas || snap.lacunas.determinado !== true) {
      return { disponivel: false, motivo: "A cobertura não está determinada. Posição sem fonte explícita não entrou como zero." };
    }
    const modelados = snap.cobertura.polimerosModelados;
    const ausentes = (snap.lacunas.naoResolvidos || []).length;
    const den = modelados + ausentes;
    if (den <= 0) return { disponivel: false, motivo: "Não há resíduo polimérico modelado nem ausente citado." };
    return { disponivel: true, valor: modelados / den, detalhe: modelados + " modelados e " + ausentes + " ausentes citados, no modelo inteiro." };
  }

  function coberturaNaRegiao(avaliacao) {
    if (!avaliacao || !avaliacao.ok || avaliacao.vazia) return { disponivel: false, motivo: avaliacao && avaliacao.motivo ? avaliacao.motivo : "Região não aplicável." };
    if (avaliacao.indeterminado) return { disponivel: false, motivo: avaliacao.motivo };
    let modelados = 0;
    let ausentes = 0;
    for (const seg of avaliacao.segmentos) {
      modelados += seg.modelados;
      ausentes += seg.ausentes;
    }
    const den = modelados + ausentes;
    if (den <= 0) return { disponivel: false, motivo: "A faixa não contém resíduo modelado nem ausente citado neste referencial." };
    return { disponivel: true, valor: modelados / den, detalhe: modelados + " modelados e " + ausentes + " ausentes citados na faixa, no referencial desta análise." };
  }

  function metricaDe(snap, id) {
    const lista = snap.qualidade && snap.qualidade.metricas;
    if (!lista) return null;
    return lista.find((m) => m.id === id && m.valor != null) || null;
  }

  function normaQualidade(ativos, def) {
    const grupos = new Map();
    for (const c of ativos) {
      const q = c.snap.qualidade;
      if (!q || (q.estado !== "ok" && q.estado !== "parcial")) continue;
      const classe = q.classe || "desconhecida";
      if (def.classes && !def.classes.includes(classe)) continue;
      const m = metricaDe(c.snap, def.id);
      if (!m) continue;
      if (!grupos.has(classe)) grupos.set(classe, []);
      grupos.get(classe).push({ id: c.id, valor: m.valor });
    }
    let escolhido = null;
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue;
      if (!escolhido || grupo.length > escolhido.length) escolhido = grupo;
    }
    if (!escolhido) return null;
    const norma = normalizarMenor(escolhido.map((v) => v.valor));
    if (!norma) return null;
    return { norma, ids: escolhido.map((v) => v.id) };
  }

  function normalizarMenor(valores) {
    const nums = valores.filter((v) => v != null);
    if (nums.length < 2) return null;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return { min, max, iguais: min === max };
  }

  function subDeNorma(valor, norma) {
    if (valor == null || !norma) return null;
    if (norma.iguais) return 1;
    return (norma.max - valor) / (norma.max - norma.min);
  }

  function subMaior(valor, norma) {
    if (valor == null || !norma) return null;
    if (norma.iguais) return 1;
    return (valor - norma.min) / (norma.max - norma.min);
  }

  function criarBaseComparacao(lista) {
    const base = {
      schema: SCHEMA_COMPARACAO,
      versaoApp: VERSAO_APP,
      schemaAnalise: SCHEMA,
      geradoEm: new Date().toISOString(),
      ok: false,
      ranqueado: false,
      motivo: "",
      pergunta: null,
      regras: REGRAS.slice(),
      alertas: [],
      numeracao: null,
      candidatos: [],
      lideres: [],
      empateNoTopo: false,
      razao: "",
      insights: [],
      limitacoes: [
        AVISO_RANKING,
        "Não há correspondência UniProt resíduo a resíduo nem alinhamento estrutural.",
        "Pockets não foram sobrepostos. O maior drugScore de cada snapshot não é o mesmo sítio.",
        "Arquivos locais, sem sincronização e sem reenvio ao servidor.",
        AVISO_HOLO,
      ],
      analises: lista.map(resumoAnalise),
      escolha: null,
    };
    return base;
  }

  function listarCriteriosComparacao(pergunta, base) {
    const criterios = [];
    if (pergunta.pesos.cobertura > 0) criterios.push({ id: "cobertura", rotulo: "Cobertura do modelo", peso: pergunta.pesos.cobertura });
    if (pergunta.pesos.qualidade > 0) criterios.push({ id: "qualidade", rotulo: "Qualidade e confiabilidade", peso: pergunta.pesos.qualidade });
    if (pergunta.componente && pergunta.pesos.componente > 0) criterios.push({ id: "componente", rotulo: "Presença do componente", peso: pergunta.pesos.componente });
    else if (!pergunta.componente && pergunta.pesos.componente > 0) {
      base.alertas.push("O peso do componente foi ignorado porque nenhum código ou nome foi informado.");
    }
    if (pergunta.pesos.pocket > 0) criterios.push({ id: "pocket", rotulo: "Pocket e drugScore", peso: pergunta.pesos.pocket });
    return criterios;
  }

  function criarCandidatosComparacao(lista, pergunta, regiao, presencas, pockets, avaliacoes) {
    const candidatos = lista.map((snap) => {
      const motivos = [];
      let situacao = "ranqueado";
      const pres = presencas.get(snap.id);
      if (pergunta.componente && pergunta.componenteEliminatorio && !pres.presente) {
        situacao = "desclassificado";
        motivos.push(pres.instancias === 0
          ? "Eliminado: " + pergunta.componente + " não está no inventário. Isso é ausência do componente observado, não uma nota de qualidade."
          : "Eliminado: não foi possível verificar " + pergunta.componente + ".");
      }
      const pk = pockets.get(snap.id);
      if (pergunta.pocketEliminatorio && !pk.disponivel) {
        situacao = "desclassificado";
        motivos.push("Eliminado: drugScore não verificável (" + pk.motivo + "). O pendente não virou zero.");
      }
      const av = avaliacoes.get(snap.id);
      if (pergunta.regiaoEssencial && !regiao.vazia && (!av.ok || av.indeterminado)) {
        situacao = "desclassificado";
        motivos.push("Eliminado: a região essencial não pôde ser lida neste referencial. " + (av.motivo || ""));
      }
      return {
        id: snap.id,
        rotulo: snap.rotulo,
        origem: resumoOrigem(snap),
        situacao,
        posicao: null,
        empate: false,
        pontuacao: null,
        fracaoDados: null,
        pesosRenormalizados: {},
        subscores: [],
        motivos,
        snap,
      };
    });

    return candidatos;
  }

  function normalizarPontuacoesComparacao(candidatos, pockets, pergunta, base) {
    const ativos = candidatos.filter((c) => c.situacao !== "desclassificado");
    const normasQualidade = {};
    for (const def of METRICAS_MENOR_MELHOR) {
      const pacote = normaQualidade(ativos, def);
      if (pacote) normasQualidade[def.id] = pacote;
    }
    const valoresPocket = ativos.map((c) => pockets.get(c.id)).filter((p) => p.disponivel).map((p) => p.drugScore);
    const normaPocket = normalizarMenor(valoresPocket.map((v) => -v))
      ? { min: Math.min(...valoresPocket), max: Math.max(...valoresPocket), iguais: Math.min(...valoresPocket) === Math.max(...valoresPocket) }
      : null;
    if (pergunta.pesos.pocket > 0 && !normaPocket) {
      base.alertas.push("O drugScore não foi normalizado: é preciso o número em pelo menos duas análises. Pendência não virou zero.");
    }
    if (pergunta.pesos.qualidade > 0 && !Object.keys(normasQualidade).length) {
      base.alertas.push("Nenhuma métrica de qualidade é comparável entre pelo menos duas análises. Ela não entrou como zero.");
    }

    return { normasQualidade, normaPocket };
  }

  function pontuarCandidatosComparacao(candidatos, pergunta, usarRegiao, avaliacoes, presencas, pockets, normasQualidade, normaPocket) {
    for (const c of candidatos) {
      if (c.situacao === "desclassificado") continue;
      const subs = [];
      if (pergunta.pesos.cobertura > 0) {
        const bruto = usarRegiao ? coberturaNaRegiao(avaliacoes.get(c.id)) : coberturaGlobal(c.snap);
        subs.push(subscore("cobertura", "Cobertura do modelo", pergunta.pesos.cobertura, bruto.disponivel ? bruto.valor : null, bruto.disponivel ? bruto.detalhe : bruto.motivo));
      }
      if (pergunta.pesos.qualidade > 0) {
        const partes = [];
        const notas = [];
        for (const def of METRICAS_MENOR_MELHOR) {
          const pacote = normasQualidade[def.id];
          if (!pacote || !pacote.ids.includes(c.id)) continue;
          const m = metricaDe(c.snap, def.id);
          const nota = subDeNorma(m.valor, pacote.norma);
          partes.push(nota);
          notas.push(def.rotulo + " " + m.valor + (pacote.norma.iguais ? " (iguais neste conjunto)" : ""));
        }
        const qEstado = c.snap.qualidade && c.snap.qualidade.estado;
        if (partes.length) {
          const media = partes.reduce((s, n) => s + n, 0) / partes.length;
          subs.push(subscore("qualidade", "Qualidade e confiabilidade", pergunta.pesos.qualidade, media, notas.join("; ") + ". Menor valor fica mais alto só dentro deste conjunto. Métrica ausente não entrou como zero."));
        } else {
          subs.push(subscore("qualidade", "Qualidade e confiabilidade", pergunta.pesos.qualidade, null, qEstado === "pendente" || qEstado === "nao_consultada" || qEstado === "ausente" || qEstado === "erro" || qEstado === "rede"
            ? "Qualidade " + qEstado + ". Não convertida em zero."
            : "Sem métrica comparável com outra análise."));
        }
      }
      if (pergunta.componente && pergunta.pesos.componente > 0) {
        const pres = presencas.get(c.id);
        subs.push(subscore("componente", "Presença do componente", pergunta.pesos.componente, pres.presente ? 1 : 0, (pres.presente ? "Observado" : "Não observado") + " (" + pergunta.componente + ", " + pres.instancias + "). " + AVISO_HOLO));
      }
      if (pergunta.pesos.pocket > 0) {
        const pk = pockets.get(c.id);
        if (pk.disponivel && normaPocket) {
          subs.push(subscore("pocket", "Pocket e drugScore", pergunta.pesos.pocket, subMaior(pk.drugScore, normaPocket), "Maior drugScore " + pk.drugScore + " em " + pk.nome + ". " + AVISO_POCKET));
        } else {
          subs.push(subscore("pocket", "Pocket e drugScore", pergunta.pesos.pocket, null, pk.disponivel ? "Há drugScore, mas não há segundo valor para normalizar. Não virou nota." : pk.motivo));
        }
      }
      c.subscores = subs;
      const disponiveis = subs.filter((s) => s.subpontuacao != null);
      const somaAtiva = subs.reduce((s, item) => s + item.peso, 0);
      const somaDisp = disponiveis.reduce((s, item) => s + item.peso, 0);
      if (!disponiveis.length || somaDisp <= 0) {
        c.situacao = "nao_pontuado";
        c.fracaoDados = somaAtiva > 0 ? 0 : null;
        c.motivos.push("Nenhum critério ativo tem dado comparável. Isso não é a pior nota.");
        continue;
      }
      c.pontuacao = disponiveis.reduce((s, item) => s + item.peso * item.subpontuacao, 0) / somaDisp;
      c.fracaoDados = somaDisp / somaAtiva;
      for (const item of subs) {
        c.pesosRenormalizados[item.id] = item.subpontuacao == null ? null : item.peso / somaDisp;
      }
      if (c.fracaoDados < 1) {
        c.motivos.push("Parte dos pesos ativos não tinha dado (" + fmt(c.fracaoDados) + " da soma dos pesos). O que faltou saiu da média e não virou zero.");
      }
    }

  }

  function classificarEmpatesComparacao(pontuados) {
    pontuados.sort((a, b) => b.pontuacao - a.pontuacao || texto(a.id).localeCompare(texto(b.id)));
    let pos = 1;
    for (let i = 0; i < pontuados.length; i++) {
      if (i > 0 && Math.abs(pontuados[i].pontuacao - pontuados[i - 1].pontuacao) > 1e-9) pos = i + 1;
      pontuados[i].posicao = pos;
    }
    const primeiro = pontuados[0].pontuacao;
    const lideres = pontuados.filter((c) => Math.abs(c.pontuacao - primeiro) <= 1e-9);
    for (const c of pontuados) c.empate = lideres.length > 1 && lideres.some((l) => l.id === c.id) ? true : pontuados.filter((o) => o.posicao === c.posicao).length > 1;
    return lideres;
  }

  function comparar(snaps, entrada) {
    const lista = Array.isArray(snaps) ? snaps : [];
    const base = criarBaseComparacao(lista);
    if (lista.length < MIN_ANALISES || lista.length > MAX_ANALISES) {
      base.motivo = "A comparação precisa de 2 a 5 análises. Agora há " + lista.length + ".";
      base.alertas.push(base.motivo);
      return base;
    }
    const norm = normalizarPergunta(entrada);
    base.pergunta = norm.pergunta;
    if (!norm.ok) {
      base.motivo = norm.erros[0];
      base.alertas = norm.erros.slice();
      return base;
    }
    const pergunta = norm.pergunta;
    const regiao = norm.regiao;
    const numeracao = numeracaoComparavel(lista, regiao);
    base.numeracao = numeracao;
    if (regiao.ok && !regiao.vazia && !numeracao.comparavel) base.alertas.push(numeracao.motivo);
    if (pergunta.regiaoEssencial && !regiao.vazia && !numeracao.comparavel) {
      base.ok = true;
      base.motivo = "A região é essencial e a numeração não é comparável. Não há ranking para não tratar números diferentes como o mesmo sítio.";
      base.alertas.unshift(base.motivo);
      base.candidatos = lista.map((snap) => candidatoVazio(snap, "nao_pontuado", [base.motivo]));
      base.insights = insightsDe(lista, pergunta, regiao, numeracao, [], null);
      return base;
    }

    const criterios = listarCriteriosComparacao(pergunta, base);
    if (!criterios.length) {
      base.ok = true;
      base.motivo = "Informe ao menos um peso maior que zero. Peso zero exclui o critério e, sem critério, não há ranking.";
      base.alertas.push(base.motivo);
      base.candidatos = lista.map((snap) => candidatoVazio(snap, "nao_pontuado", [base.motivo]));
      return base;
    }

    const usarRegiao = !!(regiao.ok && !regiao.vazia && numeracao.comparavel);
    const avaliacoes = new Map(lista.map((snap) => [snap.id, avaliarRegiao(snap, regiao)]));
    const presencas = new Map(lista.map((snap) => [snap.id, presenciaComponente(snap, pergunta.componente)]));
    const pockets = new Map(lista.map((snap) => [snap.id, melhorPocket(snap)]));

    const candidatos = criarCandidatosComparacao(lista, pergunta, regiao, presencas, pockets, avaliacoes);

    const { normasQualidade, normaPocket } = normalizarPontuacoesComparacao(candidatos, pockets, pergunta, base);

    pontuarCandidatosComparacao(candidatos, pergunta, usarRegiao, avaliacoes, presencas, pockets, normasQualidade, normaPocket);

    const pontuados = candidatos.filter((c) => c.situacao === "ranqueado" && c.pontuacao != null);
    if (!pontuados.length) {
      base.ok = true;
      base.ranqueado = false;
      base.motivo = candidatos.some((c) => c.situacao === "desclassificado")
        ? "Nenhum candidato ficou pontuado. Os eliminados não recebem nota zero."
        : "Nenhum candidato tem dado suficiente nos critérios ativos. Não há ranking.";
      base.alertas.push(base.motivo);
      base.candidatos = candidatos.map(limparSnap);
      base.insights = insightsDe(lista, pergunta, regiao, numeracao, candidatos, usarRegiao);
      return base;
    }
    const lideres = classificarEmpatesComparacao(pontuados);
    base.ok = true;
    base.ranqueado = true;
    base.lideres = lideres.map((c) => ({ id: c.id, rotulo: c.rotulo, pontuacao: c.pontuacao }));
    base.empateNoTopo = lideres.length > 1;
    base.motivo = base.empateNoTopo
      ? "Empate na pontuação entre " + lideres.map((c) => c.rotulo).join(", ") + "."
      : lideres[0].rotulo + " fica à frente com os critérios e pesos desta pergunta.";
    base.razao = explicar(pontuados);
    base.candidatos = ordenarExibicao(candidatos).map(limparSnap);
    base.insights = insightsDe(lista, pergunta, regiao, numeracao, candidatos, usarRegiao);
    return base;
  }

  function subscore(id, rotulo, peso, subpontuacao, detalhe) {
    return {
      id,
      rotulo,
      peso,
      estado: subpontuacao == null ? "indisponivel" : "ok",
      subpontuacao,
      detalhe,
    };
  }

  function candidatoVazio(snap, situacao, motivos) {
    return {
      id: snap.id,
      rotulo: snap.rotulo,
      origem: resumoOrigem(snap),
      situacao,
      posicao: null,
      empate: false,
      pontuacao: null,
      fracaoDados: null,
      pesosRenormalizados: {},
      subscores: [],
      motivos,
    };
  }

  function limparSnap(c) {
    return {
      id: c.id,
      rotulo: c.rotulo,
      origem: c.origem,
      situacao: c.situacao,
      posicao: c.posicao,
      empate: !!c.empate,
      pontuacao: c.pontuacao,
      fracaoDados: c.fracaoDados,
      pesosRenormalizados: c.pesosRenormalizados || {},
      subscores: c.subscores || [],
      motivos: c.motivos || [],
    };
  }

  function ordenarExibicao(candidatos) {
    const rank = { ranqueado: 0, nao_pontuado: 1, desclassificado: 2 };
    return candidatos.slice().sort((a, b) => {
      const dr = (rank[a.situacao] ?? 9) - (rank[b.situacao] ?? 9);
      if (dr) return dr;
      if (a.pontuacao != null && b.pontuacao != null && Math.abs(a.pontuacao - b.pontuacao) > 1e-9) return b.pontuacao - a.pontuacao;
      return texto(a.id).localeCompare(texto(b.id));
    });
  }

  function explicar(pontuados) {
    const top = pontuados.filter((c) => c.posicao === 1);
    if (top.length > 1) {
      return "Há empate entre " + top.map((c) => c.rotulo).join(", ") + ". A fração de pesos com dado está na tabela e não foi usada como critério extra.";
    }
    const lider = top[0];
    const segundo = pontuados.find((c) => c.posicao > 1);
    if (!segundo) return lider.rotulo + " é o único candidato pontuado. Os demais estão sem dado comparável ou foram eliminados, não zerados.";
    let melhorId = null;
    let melhor = -Infinity;
    const ids = new Set(lider.subscores.map((s) => s.id));
    for (const id of ids) {
      const a = lider.subscores.find((s) => s.id === id);
      const b = segundo.subscores.find((s) => s.id === id);
      if (!a || a.subpontuacao == null || !b || b.subpontuacao == null) continue;
      const diff = (a.subpontuacao - b.subpontuacao) * a.peso;
      if (diff > melhor) { melhor = diff; melhorId = a; }
    }
    if (!melhorId) {
      return lider.rotulo + " fica à frente de " + segundo.rotulo + " pela média dos critérios que cada um tinha. Dado ausente não entrou como zero.";
    }
    return lider.rotulo + " passa " + segundo.rotulo + " sobretudo em " + melhorId.rotulo + " (subpontuação " + fmt(melhorId.subpontuacao) + " contra " + fmt((segundo.subscores.find((s) => s.id === melhorId.id) || {}).subpontuacao) + ", peso " + melhorId.peso + ").";
  }

  function insight(id, criterio, titulo, estruturas, evidencia, limitacao) {
    return { id, criterio, titulo, estruturas, evidencia, limitacao: limitacao || null };
  }

  function insightsDe(snaps, pergunta, regiao, numeracao, candidatos, usarRegiao) {
    const saida = [];
    const ids = snaps.map((s) => s.id);
    if (pergunta.pesos.cobertura > 0) {
      const linhas = snaps.map((s) => {
        const g = coberturaGlobal(s);
        return s.rotulo + ": " + (g.disponivel ? g.detalhe : g.motivo);
      });
      saida.push(insight("cobertura", "cobertura", "Cobertura do modelo", ids, linhas.join(" "), "A proporção só existe quando a fonte de ausência é explícita."));
    }
    if (!regiao.vazia) {
      const linhas = snaps.map((s) => {
        const av = avaliarRegiao(s, regiao);
        if (!av.ok) return s.rotulo + ": " + av.motivo;
        const txt = av.segmentos.map((seg) => seg.cadeia + ":" + seg.inicio + "-" + seg.fim + " modelados " + seg.modelados + ", ausentes citados " + seg.ausentes).join("; ");
        return s.rotulo + ": " + txt;
      });
      saida.push(insight(
        "regiao",
        "regiao",
        usarRegiao ? "Região usada na cobertura" : "Região lida em cada referencial",
        ids,
        linhas.join(" "),
        numeracao.motivo
      ));
    }
    if (pergunta.componente) {
      const linhas = snaps.map((s) => {
        const p = presenciaComponente(s, pergunta.componente);
        return s.rotulo + ": " + (p.presente ? "observado, " + p.instancias + " ocorrência(s)" : "não observado no inventário");
      });
      saida.push(insight("componente", "componente", "Componente " + pergunta.componente, ids, linhas.join(" "), AVISO_HOLO));
      const fichas = snaps.filter((s) => s.preparo && s.preparo.selecao);
      if (fichas.length >= 2 && pergunta.pesos.componente > 0) {
        const alvo = pergunta.componente.toUpperCase();
        const linhasFicha = fichas.map((s) => {
          const mantidos = s.preparo.selecao.codigosHetMantidos || [];
          return s.rotulo + ": " + (mantidos.includes(alvo) ? "código mantido na seleção da ficha" : "código fora da seleção de HET mantidos");
        });
        if (new Set(linhasFicha.map((l) => l.includes("mantido na seleção"))).size > 1) {
          saida.push(insight("preparo-componente", "preparo", "Seleção da ficha para " + pergunta.componente, fichas.map((s) => s.id), linhasFicha.join(" "), "A seleção da ficha não apaga o componente do inventário estrutural."));
        }
      }
    }
    if (pergunta.pesos.qualidade > 0) {
      const linhas = snaps.map((s) => {
        const q = s.qualidade || {};
        if (q.estado !== "ok" && q.estado !== "parcial") return s.rotulo + ": qualidade " + (q.estado || "ausente") + ". " + (q.motivo || "");
        const nums = (q.metricas || []).map((m) => m.id + " " + m.valor).join(", ");
        return s.rotulo + ": classe " + (q.classe || "não informada") + (nums ? "; " + nums : "; sem métrica numérica");
      });
      saida.push(insight("qualidade", "qualidade", "Qualidade quando o relatório existe", ids, linhas.join(" "), "Métricas de classes diferentes não foram misturadas. O relatório global não garante o sítio."));
    }
    if (pergunta.pesos.pocket > 0 || pergunta.pocketEliminatorio) {
      const linhas = snaps.map((s) => {
        const pk = melhorPocket(s);
        return s.rotulo + ": " + (pk.disponivel ? "maior drugScore " + pk.drugScore + " (" + pk.nome + ")" : "sem drugScore utilizável — " + pk.motivo);
      });
      saida.push(insight("pocket", "pocket", "Maior drugScore de cada snapshot", ids, linhas.join(" "), AVISO_POCKET));
    }
    const preditas = snaps.filter((s) => s.preparo && s.preparo.predita);
    if (preditas.length && preditas.length !== snaps.length && pergunta.pesos.qualidade > 0) {
      saida.push(insight(
        "predita",
        "preparo",
        "Aviso de estrutura predita na ficha",
        ids,
        snaps.map((s) => s.rotulo + ": " + (s.preparo && s.preparo.predita ? "aviso presente" : "sem esse aviso")).join(" "),
        "O aviso não é uma nota de confiança e não diz se um pocket está apo ou holo."
      ));
    }
    if (candidatos && candidatos.some((c) => c.situacao === "desclassificado")) {
      saida.push(insight(
        "eliminados",
        "eliminatorio",
        "Candidatos fora do ranking",
        candidatos.filter((c) => c.situacao === "desclassificado").map((c) => c.id),
        candidatos.filter((c) => c.situacao === "desclassificado").map((c) => c.rotulo + ": " + c.motivos.join(" ")).join(" "),
        "Eliminação não é a pior nota. O candidato não entra na média."
      ));
    }
    return saida;
  }

  function resumoOrigem(snap) {
    const o = snap.origem || {};
    return [o.fonte || o.tipo || "origem não informada", o.pdbId || o.nomeArquivo || snap.rotulo].filter(Boolean).join(" · ");
  }

  function resumoAnalise(snap) {
    return {
      id: snap.id,
      rotulo: snap.rotulo,
      origem: resumoOrigem(snap),
      geradoEm: snap.geradoEm,
      sintetico: !!(snap.origem && snap.origem.sintetico),
    };
  }

  function comEscolha(resultado, escolha) {
    if (!resultado) return { ok: false, erro: "Ainda não há comparação.", resultado: null };
    if (!escolha || !texto(escolha.id).trim()) {
      const copia = Object.assign({}, resultado, { escolha: null });
      return { ok: true, erro: null, resultado: copia };
    }
    const id = texto(escolha.id).trim();
    const alvo = (resultado.candidatos || []).find((c) => c.id === id) || (resultado.analises || []).find((c) => c.id === id);
    if (!alvo) return { ok: false, erro: "A escolha não está entre as análises importadas.", resultado };
    const lideres = new Set((resultado.lideres || []).map((c) => c.id));
    const diferente = resultado.ranqueado ? !lideres.has(id) : true;
    const justificativa = texto(escolha.justificativa).trim();
    if (diferente && justificativa.length < 3) {
      return { ok: false, erro: resultado.ranqueado
        ? "A escolha diferente do primeiro colocado precisa de justificativa."
        : "Sem ranking, a decisão final precisa de justificativa.", resultado };
    }
    const copia = Object.assign({}, resultado, {
      escolha: {
        id,
        rotulo: alvo.rotulo,
        justificativa,
        diferenteDoLider: !!resultado.ranqueado && diferente,
      },
    });
    return { ok: true, erro: null, resultado: copia };
  }

  function relatorioJson(resultado) {
    return JSON.stringify(resultado, null, 2) + "\n";
  }

  // Texto livre no Markdown: a quebra de linha do conteúdo importado não pode
  // abrir título, tabela, cerca ou item novo. O caractere em si permanece.
  function mdLivre(v) {
    return texto(v)
      .replace(/\r\n/g, "\n")
      .replace(/[\n\r\u2028\u2029]+/g, " ⏎ ")
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\*/g, "\\*");
  }

  // Célula de tabela: a barra vertical do texto continua visível e não abre coluna.
  function mdCelula(v) {
    return mdLivre(v).replace(/\|/g, "\\|");
  }

  function linhaTabela(celulas) {
    return "| " + celulas.map((c) => mdCelula(c)).join(" | ") + " |";
  }

  function relatorioMarkdown(resultado) {
    const r = resultado || {};
    const p = r.pergunta || { pesos: {} };
    const L = [];
    L.push("# Comparação de análises guardadas");
    L.push("");
    L.push("Schema da comparação: `" + (r.schema || SCHEMA_COMPARACAO) + "`. Schema da análise: `" + SCHEMA + "`. Versão do app: `" + (r.versaoApp || VERSAO_APP) + "`.");
    L.push("");
    L.push(AVISO_RANKING);
    L.push("");
    L.push("## Pergunta e critérios");
    L.push("");
    L.push("- Região: " + mdLivre(p.regiao || "não informada") + (p.regiaoEssencial ? " (essencial)" : ""));
    L.push("- Componente, parceiro ou ligante: " + mdLivre(p.componente || "não informado") + (p.componenteEliminatorio ? " (eliminatório)" : ""));
    L.push("- Pocket eliminatório: " + (p.pocketEliminatorio ? "sim" : "não"));
    L.push("- Pesos: cobertura " + (p.pesos ? p.pesos.cobertura : "—") + ", qualidade " + (p.pesos ? p.pesos.qualidade : "—") + ", componente " + (p.pesos ? p.pesos.componente : "—") + ", pocket " + (p.pesos ? p.pesos.pocket : "—") + ".");
    L.push("");
    L.push("## Regras");
    L.push("");
    for (const regra of r.regras || REGRAS) L.push("- " + regra);
    L.push("");
    L.push("## Análises");
    L.push("");
    for (const a of r.analises || []) {
      L.push("- " + mdLivre(a.rotulo) + " (`" + a.id + "`), " + mdLivre(a.origem) + ", guardada em " + a.geradoEm + (a.sintetico ? ", dados sintéticos de teste" : "") + ".");
    }
    L.push("");
    L.push("## Ranking");
    L.push("");
    L.push(mdLivre(r.ranqueado ? r.motivo : "Sem ranking. " + (r.motivo || "")));
    if (r.razao) L.push("");
    if (r.razao) L.push(mdLivre(r.razao));
    L.push("");
    L.push("| Posição | Análise | Situação | Pontuação | Fração dos pesos com dado |");
    L.push("| --- | --- | --- | --- | --- |");
    for (const c of r.candidatos || []) {
      L.push(linhaTabela([
        c.posicao == null ? "—" : String(c.posicao) + (c.empate ? " empate" : ""),
        c.rotulo,
        c.situacao,
        fmt(c.pontuacao),
        c.fracaoDados == null ? "—" : fmt(c.fracaoDados),
      ]));
    }
    L.push("");
    L.push("### Subpontuações");
    L.push("");
    for (const c of r.candidatos || []) {
      L.push("**" + mdLivre(c.rotulo) + "**");
      if (!(c.subscores || []).length) L.push("- Sem subpontuação. " + mdLivre((c.motivos || []).join(" ")));
      for (const s of c.subscores || []) {
        const renorm = c.pesosRenormalizados && c.pesosRenormalizados[s.id] != null ? ", peso renormalizado " + fmt(c.pesosRenormalizados[s.id]) : "";
        L.push("- " + mdLivre(s.rotulo) + ": " + (s.estado === "indisponivel" ? "indisponível" : fmt(s.subpontuacao)) + " (peso " + s.peso + renorm + "). " + mdLivre(s.detalhe));
      }
      for (const m of c.motivos || []) L.push("- " + mdLivre(m));
      L.push("");
    }
    L.push("## Fora da pontuação e alertas");
    L.push("");
    const fora = (r.candidatos || []).filter((c) => c.situacao !== "ranqueado");
    if (!fora.length) L.push("Nenhum candidato ficou de fora.");
    for (const c of fora) L.push("- " + mdLivre(c.rotulo) + " (" + c.situacao + "): " + mdLivre((c.motivos || []).join(" ")));
    for (const a of r.alertas || []) L.push("- Alerta: " + mdLivre(a));
    L.push("");
    L.push("## Diferenças usadas nos critérios");
    L.push("");
    L.push("Os achados abaixo organizam os dados guardados. Não garantem relevância biológica.");
    L.push("");
    if (!(r.insights || []).length) L.push("Nenhuma diferença ligada aos critérios ativos.");
    for (const item of r.insights || []) {
      L.push("### " + mdLivre(item.titulo));
      L.push("");
      L.push(mdLivre(item.evidencia));
      L.push("");
      if (item.limitacao) L.push("Limitação: " + mdLivre(item.limitacao));
      L.push("");
    }
    L.push("## Escolha final");
    L.push("");
    if (!r.escolha) L.push("Nenhuma decisão final registrada.");
    else {
      L.push((r.escolha.diferenteDoLider ? "Escolha diferente do primeiro colocado: " : "Escolha: ")
        + mdLivre(r.escolha.rotulo) + " (`" + r.escolha.id + "`). "
        + mdLivre(r.escolha.justificativa || "Sem justificativa adicional."));
    }
    L.push("");
    L.push("## Limitações");
    L.push("");
    for (const lim of r.limitacoes || []) L.push("- " + mdLivre(lim));
    if (r.numeracao && r.numeracao.motivo) L.push("- Numeração: " + mdLivre(r.numeracao.motivo));
    L.push("");
    return L.join("\n");
  }

  return {
    SCHEMA,
    SCHEMA_COMPARACAO,
    VERSAO_APP,
    LIMITE_BYTES,
    MIN_ANALISES,
    MAX_ANALISES,
    REGRAS,
    AVISO_RANKING,
    AVISO_HOLO,
    AVISO_POCKET,
    nomeArquivo,
    montarDeWorkspace,
    validarTexto,
    validarObjeto,
    importar,
    parseRegiao,
    avaliarRegiao,
    comparar,
    comEscolha,
    relatorioMarkdown,
    relatorioJson,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AnalysisSnapshot;
if (typeof globalThis !== "undefined") globalThis.AnalysisSnapshot = AnalysisSnapshot;
