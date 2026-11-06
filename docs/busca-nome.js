// Busca de depósitos experimentais pelo nome da proteína.
// O nome não vira código PDB. A lista não escolhe uma entrada.
// Metadado ausente na resposta do RCSB não é preenchido.

"use strict";

const BuscaNome = (function () {
  const LIMITE = 12;
  const ESPERA_MS = 20000;
  const URL_BUSCA = "https://search.rcsb.org/rcsbsearch/v2/query";
  const URL_GRAPHQL = "https://data.rcsb.org/graphql";
  const ID_CLASSICO = /^[0-9][A-Z0-9]{3}$/;
  const CONSULTA_GRAPHQL = `
    query ($ids: [String!]!) {
      entries(entry_ids: $ids) {
        rcsb_id
        struct { title }
        exptl { method }
        rcsb_entry_info { resolution_combined }
        polymer_entities {
          rcsb_polymer_entity_container_identifiers { auth_asym_ids }
          rcsb_polymer_entity { pdbx_description }
          entity_poly { type rcsb_sample_sequence_length }
        }
        nonpolymer_entities {
          rcsb_nonpolymer_entity_container_identifiers { auth_asym_ids }
          pdbx_entity_nonpoly { comp_id name }
        }
      }
    }
  `;

  function classificar(texto) {
    const bruto = String(texto == null ? "" : texto).trim().replace(/\s+/g, " ");
    if (!bruto) {
      return {
        tipo: "vazio",
        valor: "",
        mensagem: "Informe um código PDB (ex.: 1A00) ou um nome de proteína (ex.: NLRP3).",
      };
    }
    const token = !bruto.includes(" ");
    if (token && ID_CLASSICO.test(bruto.toUpperCase())) {
      return { tipo: "id", valor: bruto.toUpperCase() };
    }
    if (token && /^pdb_[0-9a-z]+$/i.test(bruto) && bruto.length > 4) {
      return {
        tipo: "invalido",
        valor: bruto,
        mensagem: "Esta versão não aceita ID estendido. Use o código clássico de 4 caracteres ou o nome da proteína.",
      };
    }
    if (bruto.length < 2) {
      return {
        tipo: "invalido",
        valor: bruto,
        mensagem: "O nome precisa de pelo menos 2 caracteres. Um código PDB tem 4 e começa com número (ex.: 1A00).",
      };
    }
    if (bruto.length > 80) {
      return {
        tipo: "invalido",
        valor: bruto,
        mensagem: "O nome passou de 80 caracteres. Use um nome mais curto ou o código PDB.",
      };
    }
    // "1A0" ou "12345" parecem código mal formado. Não viram nome e não são truncados.
    if (token && /^[0-9][A-Za-z0-9]+$/.test(bruto) && bruto.length !== 4) {
      return mensagemCodigoCurto(bruto);
    }
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .,'’()\/+\-]*$/u.test(bruto) || !/\p{L}/u.test(bruto)) {
      return {
        tipo: "invalido",
        valor: bruto,
        mensagem: "Use um código PDB de 4 caracteres começando com número (ex.: 1A00) ou um nome de proteína (ex.: NLRP3). O nome não é convertido em código.",
      };
    }
    return { tipo: "nome", valor: bruto };
  }

  function mensagemCodigoCurto(bruto) {
    return {
      tipo: "invalido",
      valor: bruto,
      mensagem: bruto + " não é um código PDB. O código tem 4 caracteres e começa com número (ex.: 1A00). Um nome como NLRP3 não é cortado nem usado como código.",
    };
  }

  function decidir(texto) {
    const c = classificar(texto);
    if (c.tipo === "id") return { acao: "carregar", id: c.valor };
    if (c.tipo === "nome") return { acao: "listar", nome: c.valor };
    return { acao: "erro", mensagem: c.mensagem };
  }

  function noTexto(atributo, operador, valor) {
    return {
      type: "terminal",
      service: "text",
      parameters: { attribute: atributo, operator: operador, value: valor },
    };
  }

  function montarConsulta(nome) {
    const valor = String(nome);
    return {
      query: {
        type: "group",
        logical_operator: "and",
        nodes: [
          {
            type: "group",
            logical_operator: "or",
            nodes: [
              noTexto("rcsb_polymer_entity.pdbx_description", "contains_words", valor),
              noTexto("rcsb_entity_source_organism.rcsb_gene_name.value", "exact_match", valor),
              noTexto("struct.title", "contains_words", valor),
            ],
          },
          noTexto("rcsb_entry_info.structure_determination_methodology", "exact_match", "experimental"),
        ],
      },
      return_type: "entry",
      request_options: {
        paginate: { start: 0, rows: LIMITE },
        scoring_strategy: "combined",
        sort: [{ sort_by: "score", direction: "desc" }],
      },
    };
  }

  function selecionar(lista, id) {
    if (id == null) return null;
    const alvo = String(id).trim().toUpperCase();
    if (!ID_CLASSICO.test(alvo) || !Array.isArray(lista)) return null;
    for (const item of lista) {
      if (item && String(item.id || "").trim().toUpperCase() === alvo) return item;
    }
    return null;
  }

  function textoOuNull(v) {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t : null;
  }

  function numeroOuNull(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }

  function listaTexto(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(textoOuNull).filter(Boolean);
  }

  function normalizarEntrada(entry) {
    if (!entry || typeof entry !== "object") return null;
    const idBruto = textoOuNull(entry.rcsb_id);
    if (!idBruto || !ID_CLASSICO.test(idBruto.toUpperCase())) return null;
    const item = { id: idBruto.toUpperCase() };
    const titulo = textoOuNull(entry.struct && entry.struct.title);
    if (titulo) item.titulo = titulo;
    const metodos = Array.isArray(entry.exptl)
      ? entry.exptl.map((e) => textoOuNull(e && e.method)).filter(Boolean)
      : [];
    if (metodos.length) item.metodos = metodos;
    const info = entry.rcsb_entry_info || {};
    if (Array.isArray(info.resolution_combined)) {
      const nums = info.resolution_combined.map(numeroOuNull).filter((n) => n != null);
      if (nums.length) item.resolucaoCombinada = nums;
    }
    const polimeros = [];
    for (const p of Array.isArray(entry.polymer_entities) ? entry.polymer_entities : []) {
      if (!p || typeof p !== "object") continue;
      const pol = {};
      const desc = textoOuNull(p.rcsb_polymer_entity && p.rcsb_polymer_entity.pdbx_description);
      const cadeias = listaTexto(p.rcsb_polymer_entity_container_identifiers && p.rcsb_polymer_entity_container_identifiers.auth_asym_ids);
      const tipo = textoOuNull(p.entity_poly && p.entity_poly.type);
      const comp = numeroOuNull(p.entity_poly && p.entity_poly.rcsb_sample_sequence_length);
      if (desc) pol.descricao = desc;
      if (cadeias.length) pol.cadeias = cadeias;
      if (tipo) pol.tipo = tipo;
      if (comp != null) pol.comprimentoAmostra = comp;
      if (Object.keys(pol).length) polimeros.push(pol);
    }
    if (polimeros.length) item.polimeros = polimeros;
    const naoPoli = [];
    for (const n of Array.isArray(entry.nonpolymer_entities) ? entry.nonpolymer_entities : []) {
      if (!n || typeof n !== "object") continue;
      const np = {};
      const compId = textoOuNull(n.pdbx_entity_nonpoly && n.pdbx_entity_nonpoly.comp_id);
      const nome = textoOuNull(n.pdbx_entity_nonpoly && n.pdbx_entity_nonpoly.name);
      const cadeias = listaTexto(n.rcsb_nonpolymer_entity_container_identifiers && n.rcsb_nonpolymer_entity_container_identifiers.auth_asym_ids);
      if (compId) np.compId = compId;
      if (nome) np.nome = nome;
      if (cadeias.length) np.cadeias = cadeias;
      if (Object.keys(np).length) naoPoli.push(np);
    }
    if (naoPoli.length) item.naoPolimericos = naoPoli;
    return item;
  }

  function lerBusca(status, texto) {
    if (status === 204) return vazio();
    if (status === 429) return limite();
    if (status === 400) {
      return {
        ok: false,
        codigo: "consulta",
        mensagem: "O RCSB recusou esta consulta (HTTP 400). Tente um nome mais curto, só com letras e números.",
      };
    }
    if (status >= 500 && status <= 599) {
      return {
        ok: false,
        codigo: "servico",
        mensagem: "O RCSB não completou a busca (HTTP " + status + "). Tente de novo.",
      };
    }
    if (status !== 200) {
      return {
        ok: false,
        codigo: "http",
        mensagem: "O RCSB respondeu HTTP " + status + " na busca.",
      };
    }
    let json;
    try {
      json = JSON.parse(texto || "");
    } catch (e) {
      return {
        ok: false,
        codigo: "formato",
        mensagem: "A busca do RCSB não veio em JSON. Nada foi listado.",
      };
    }
    if (!json || !Array.isArray(json.result_set)) {
      return {
        ok: false,
        codigo: "formato",
        mensagem: "A busca do RCSB não trouxe a lista de resultados. Nada foi listado.",
      };
    }
    const ids = [];
    const vistos = new Set();
    for (const item of json.result_set) {
      const id = String(item && item.identifier || "").trim().toUpperCase();
      if (!ID_CLASSICO.test(id) || vistos.has(id)) continue;
      vistos.add(id);
      ids.push(id);
      if (ids.length >= LIMITE) break;
    }
    if (!ids.length) return vazio();
    const total = typeof json.total_count === "number" && Number.isFinite(json.total_count) ? json.total_count : null;
    return { ok: true, ids, total };
  }

  function lerMetadados(texto) {
    let json;
    try {
      json = JSON.parse(texto || "");
    } catch (e) {
      return {
        ok: false,
        mensagem: "Os metadados do RCSB não vieram em JSON. Os códigos da busca continuam na lista; campos ausentes não foram preenchidos.",
      };
    }
    const entries = json && json.data && Array.isArray(json.data.entries) ? json.data.entries : null;
    if (!entries) {
      return {
        ok: false,
        mensagem: "Os metadados do RCSB não trouxeram entradas. Os códigos da busca continuam na lista; campos ausentes não foram preenchidos.",
      };
    }
    const porId = {};
    for (const entry of entries) {
      const norm = normalizarEntrada(entry);
      if (norm) porId[norm.id] = norm;
    }
    return { ok: true, porId };
  }

  function vazio() {
    return {
      ok: false,
      codigo: "vazio",
      mensagem: "Nenhum depósito experimental encontrado para esse nome no RCSB. Confira o nome ou use o código PDB de 4 caracteres.",
    };
  }

  function limite() {
    return {
      ok: false,
      codigo: "limite",
      mensagem: "O RCSB limitou as consultas (HTTP 429). Espere um pouco e tente de novo.",
    };
  }

  function falhaTransporte(e) {
    if (e && e.codigo === "tempo") {
      return {
        ok: false,
        codigo: "tempo",
        mensagem: "A consulta ao RCSB passou de " + Math.round(ESPERA_MS / 1000) + " segundos. Tente de novo.",
      };
    }
    return {
      ok: false,
      codigo: "rede",
      mensagem: "Sem conexão com o RCSB (ou bloqueio de rede).",
    };
  }

  function pedir(fetchImpl, url, options, esperaMs) {
    const espera = typeof esperaMs === "number" ? esperaMs : ESPERA_MS;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    let abortou = false;
    const timer = setTimeout(() => {
      abortou = true;
      if (ctrl) ctrl.abort();
    }, espera);
    const opts = Object.assign({ credentials: "omit" }, options);
    if (ctrl) opts.signal = ctrl.signal;
    return Promise.resolve()
      .then(() => fetchImpl(url, opts))
      .catch((e) => {
        if (abortou || (e && e.name === "AbortError")) {
          const err = new Error("tempo");
          err.codigo = "tempo";
          throw err;
        }
        const err = new Error("rede");
        err.codigo = "rede";
        throw err;
      })
      .finally(() => clearTimeout(timer));
  }

  async function textoResposta(resp) {
    if (resp && typeof resp.text === "function") return await resp.text();
    return "";
  }

  async function pesquisar(nome, opcoes) {
    const c = classificar(nome);
    if (c.tipo !== "nome") {
      return {
        ok: false,
        codigo: "entrada",
        mensagem: c.tipo === "id"
          ? "Esse texto é um código PDB. A busca por nome não o transforma em lista nem escolhe outra estrutura."
          : (c.mensagem || "Informe um nome de proteína."),
      };
    }
    const fetchImpl = (opcoes && opcoes.fetch) || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchImpl) return falhaTransporte({ codigo: "rede" });
    const espera = opcoes && typeof opcoes.esperaMs === "number" ? opcoes.esperaMs : ESPERA_MS;
    let respBusca;
    try {
      respBusca = await pedir(fetchImpl, URL_BUSCA, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(montarConsulta(c.valor)),
      }, espera);
    } catch (e) {
      return falhaTransporte(e);
    }
    const busca = lerBusca(respBusca && respBusca.status, await textoResposta(respBusca));
    if (!busca.ok) return busca;

    let porId = {};
    let avisoMetadados = null;
    try {
      const respMeta = await pedir(fetchImpl, URL_GRAPHQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: CONSULTA_GRAPHQL, variables: { ids: busca.ids } }),
      }, espera);
      const status = respMeta && respMeta.status;
      if (status === 429) {
        avisoMetadados = "O RCSB limitou a consulta de metadados (HTTP 429). Os códigos abaixo vieram da busca; título, método e componentes não foram preenchidos.";
      } else if (status !== 200) {
        avisoMetadados = "Os metadados não voltaram (HTTP " + status + "). Os códigos abaixo vieram da busca; campos ausentes não foram preenchidos.";
      } else {
        const lido = lerMetadados(await textoResposta(respMeta));
        if (!lido.ok) avisoMetadados = lido.mensagem;
        else porId = lido.porId;
      }
    } catch (e) {
      avisoMetadados = e && e.codigo === "tempo"
        ? "A consulta de metadados passou do tempo de espera. Os códigos abaixo vieram da busca; campos ausentes não foram preenchidos."
        : "Sem conexão ao pedir os metadados. Os códigos abaixo vieram da busca; campos ausentes não foram preenchidos.";
    }

    return {
      ok: true,
      nome: c.valor,
      total: busca.total,
      limite: LIMITE,
      avisoMetadados,
      resultados: busca.ids.map((id) => porId[id] || { id }),
    };
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function formatarNumero(n) {
    return String(n);
  }

  function textoCadeias(cadeias, rotuloUm, rotuloVarios) {
    if (!cadeias || !cadeias.length) return null;
    const max = 12;
    const vis = cadeias.slice(0, max);
    const extra = cadeias.length - vis.length;
    let s = vis.join(", ");
    if (extra > 0) s += " e mais " + extra + " cadeias informadas pelo RCSB";
    return (cadeias.length > 1 ? rotuloVarios : rotuloUm) + " " + s;
  }

  function textoPolimero(p) {
    const pedacos = [];
    const cad = textoCadeias(p.cadeias, "Cadeia", "Cadeias");
    if (cad) pedacos.push(cad);
    if (p.descricao) pedacos.push(p.descricao);
    if (p.tipo) pedacos.push(p.tipo);
    if (typeof p.comprimentoAmostra === "number") {
      pedacos.push("sequência da amostra: " + p.comprimentoAmostra + " resíduos");
    }
    return pedacos.join(" · ");
  }

  function textoNaoPolimero(p) {
    const pedacos = ["Componente não polimérico"];
    if (p.compId) pedacos.push(p.compId);
    if (p.nome) pedacos.push(p.nome);
    const cad = textoCadeias(p.cadeias, "cadeia", "cadeias");
    if (cad) pedacos.push(cad);
    return pedacos.join(" · ");
  }

  function textoContagem(resp) {
    const n = (resp.resultados || []).length;
    const nome = resp.nome || "";
    const total = typeof resp.total === "number" && resp.total >= n ? resp.total : null;
    const faixa = total != null && total > n
      ? n + " de " + total + " depósitos experimentais"
      : n + (n === 1 ? " depósito experimental" : " depósitos experimentais");
    return "Busca pelo nome \u201c" + nome + "\u201d: " + faixa + ". A ordem é a da resposta do RCSB.";
  }

  function htmlItem(item) {
    const id = item.id;
    const partes = ['<article class="busca-item" role="listitem">'];
    partes.push('<h3 class="busca-id">' + esc(id) + "</h3>");
    if (item.titulo) partes.push('<p><span class="busca-rot">Título</span> ' + esc(item.titulo) + "</p>");
    if (item.metodos && item.metodos.length) {
      partes.push('<p><span class="busca-rot">Método</span> ' + esc(item.metodos.join("; ")) + "</p>");
    }
    if (item.resolucaoCombinada && item.resolucaoCombinada.length) {
      partes.push(
        '<p><span class="busca-rot">Resolução combinada</span> '
        + esc(item.resolucaoCombinada.map(formatarNumero).join(", "))
        + " Å</p>"
      );
    }
    if (item.polimeros && item.polimeros.length) {
      partes.push('<ul class="busca-comp">');
      for (const p of item.polimeros) partes.push("<li>" + esc(textoPolimero(p)) + "</li>");
      partes.push("</ul>");
    }
    if (item.naoPolimericos && item.naoPolimericos.length) {
      partes.push('<ul class="busca-comp">');
      for (const p of item.naoPolimericos) partes.push("<li>" + esc(textoNaoPolimero(p)) + "</li>");
      partes.push("</ul>");
    }
    partes.push(
      '<p class="busca-acoes"><a href="https://www.rcsb.org/structure/'
      + encodeURIComponent(id)
      + '" target="_blank" rel="noopener">Página '
      + esc(id)
      + " no RCSB</a></p>"
    );
    partes.push(
      '<button type="button" class="primary-btn" data-busca-id="'
      + esc(id)
      + '">Analisar '
      + esc(id)
      + "</button>"
    );
    partes.push("</article>");
    return partes.join("");
  }

  function htmlResultados(resp) {
    const resultados = resp && Array.isArray(resp.resultados) ? resp.resultados : [];
    const partes = ['<div class="busca-cabeca">'];
    partes.push("<p>" + esc(textoContagem(resp || {})) + "</p>");
    partes.push("<p>Escolha um código para abrir no PEKI. Nenhum depósito é carregado automaticamente.</p>");
    partes.push(
      '<p class="busca-nota">Método, resolução e componentes são metadados ou anotações do depósito no RCSB. Não são julgamento de qualidade, adequação para dinâmica molecular, presença de ligante ou completude do modelo.</p>'
    );
    if (resp && resp.avisoMetadados) partes.push('<p class="busca-aviso">' + esc(resp.avisoMetadados) + "</p>");
    partes.push("</div>");
    partes.push('<div class="busca-lista" role="list">');
    for (const item of resultados) partes.push(htmlItem(item));
    partes.push("</div>");
    return partes.join("");
  }

  return {
    LIMITE,
    ESPERA_MS,
    URL_BUSCA,
    URL_GRAPHQL,
    classificar,
    decidir,
    montarConsulta,
    selecionar,
    normalizarEntrada,
    lerBusca,
    lerMetadados,
    pesquisar,
    htmlResultados,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BuscaNome;
