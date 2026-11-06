// Busca por nome de proteína: não é código PDB e não escolhe sozinha.
"use strict";

const fs = require("fs");
const path = require("path");
const BuscaNome = require("../docs/busca-nome.js");

let falhas = 0;
let ok = 0;
function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}

function decidirNome() {
  const n = BuscaNome.decidir("NLRP3");
  assert(n.acao === "listar" && n.nome === "NLRP3", "NLRP3 é nome, não código: " + JSON.stringify(n));
  assert(BuscaNome.classificar("nlrp3").tipo === "nome" && BuscaNome.classificar("nlrp3").valor === "nlrp3", "minúsculas continuam nome");
  const curto = BuscaNome.decidir("NLRP");
  assert(curto.acao === "listar" && curto.nome === "NLRP", "NLRP não é usado como código: " + JSON.stringify(curto));
  assert(BuscaNome.decidir("NLRP").id == null, "NLRP não ganha id");

  const id = BuscaNome.decidir("6npy");
  assert(id.acao === "carregar" && id.id === "6NPY", "6NPY carrega pelo código: " + JSON.stringify(id));
  const a00 = BuscaNome.decidir("  1a00 ");
  assert(a00.acao === "carregar" && a00.id === "1A00", "1A00 com espaço nas pontas é código");
  assert(BuscaNome.decidir("4HHB").acao === "carregar", "4HHB segue o fluxo de código");

  const misturado = BuscaNome.decidir("6NPY NLRP3");
  assert(misturado.acao === "listar" && misturado.nome === "6NPY NLRP3", "frase com código não é carregada sozinha");
  const vazio = BuscaNome.decidir("");
  assert(vazio.acao === "erro", "vazio é erro");
  assert(/hemoglobina/.test(vazio.mensagem) && !/NLRP3/.test(vazio.mensagem), "erro vazio cita hemoglobina");
  assert(BuscaNome.decidir("   ").acao === "erro", "espaço é vazio");
  assert(BuscaNome.decidir("A").acao === "erro", "uma letra não busca");
  const curtoCodigo = BuscaNome.decidir("1A0");
  assert(curtoCodigo.acao === "erro", "código curto não é truncado nem buscado");
  assert(/hemoglobina/.test(curtoCodigo.mensagem) && !/NLRP3/.test(curtoCodigo.mensagem), "código curto cita hemoglobina");
  assert(BuscaNome.decidir("12345").acao === "erro", "dígitos a mais não viram nome");
  const ext = BuscaNome.decidir("PDB_00001ABC");
  assert(ext.acao === "erro" && /estendido/.test(ext.mensagem), "ID estendido continua recusado");
  const simbolos = BuscaNome.decidir("***");
  assert(simbolos.acao === "erro", "símbolos não viram busca");
  assert(/hemoglobina/.test(simbolos.mensagem) && !/NLRP3/.test(simbolos.mensagem), "símbolos citam hemoglobina");
  assert(BuscaNome.decidir("hemoglobina").acao === "listar", "nome comum lista");
}

function consultaNaoTrunca() {
  const q = BuscaNome.montarConsulta("NLRP3");
  const s = JSON.stringify(q);
  assert(s.includes("NLRP3") && !s.includes("\"NLRP\""), "a consulta manda NLRP3 inteiro");
  assert(q.return_type === "entry", "retorno é entrada PDB");
  assert(q.request_options.paginate.rows === BuscaNome.LIMITE && BuscaNome.LIMITE <= 12, "resultados limitados");
  assert(q.request_options.paginate.start === 0, "primeira página");
  const nos = q.query.nodes;
  const experimental = JSON.stringify(nos).includes('"value":"experimental"');
  assert(experimental, "só depósito experimental");
  assert(JSON.stringify(nos).includes("structure_determination_methodology"), "filtro oficial de metodologia");
  const atributos = JSON.stringify(nos);
  assert(atributos.includes("pdbx_description"), "descrição do polímero");
  assert(atributos.includes("rcsb_gene_name.value"), "nome de gene");
  assert(atributos.includes("struct.title"), "título");
  const nlrp = BuscaNome.montarConsulta("NLRP");
  const js = JSON.stringify(nlrp);
  assert(js.includes("\"NLRP\"") && !js.includes("NLRP3"), "NLRP não é reescrito nem completado");
  assert(!/files\.rcsb\.org/.test(js), "a consulta de nome não baixa estrutura");
}

function selecaoExplicita() {
  const lista = [
    { id: "8ERT", titulo: "NLRP3 PYD filament" },
    { id: "6NPY", titulo: "Cryo-EM structure of NLRP3 bound to NEK7" },
  ];
  assert(BuscaNome.selecionar(lista, null) == null, "sem id não escolhe o primeiro");
  assert(BuscaNome.selecionar(lista) == null, "omissão não escolhe");
  assert(BuscaNome.selecionar(lista, "") == null, "string vazia não escolhe");
  assert(BuscaNome.selecionar(lista, "8ERT") === lista[0], "escolhe o id clicado, não o vizinho");
  assert(BuscaNome.selecionar(lista, "6npy").id === "6NPY", "escolha aceita o código em minúsculas");
  assert(BuscaNome.selecionar(lista, "1A00") == null, "código fora da lista não entra");
  assert(BuscaNome.selecionar(lista, "NLRP3") == null, "nome não é seleção");
  assert(BuscaNome.selecionar([{ id: "6NPY" }], "6NPY").id === "6NPY", "lista de um item ainda exige o clique");
  const html = BuscaNome.htmlResultados({ nome: "NLRP3", total: 2, resultados: lista });
  const botoes = html.match(/data-busca-id="/g) || [];
  assert(botoes.length === 2, "um botão por resultado, sem atalho");
  assert(!/data-busca-id="1A00"/.test(html), "exemplo da home não entra na lista");
  assert(/Escolha um código/.test(html) && /automaticamente/.test(html), "a lista pede escolha");
}

function metadadosAusentes() {
  const entrada = BuscaNome.normalizarEntrada({
    rcsb_id: "2NAQ",
    struct: { title: "3D NMR solution structure of NLRP3 PYD" },
    exptl: [{ method: "SOLUTION NMR" }],
    rcsb_entry_info: { resolution_combined: null },
    polymer_entities: [{
      rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ["A"] },
      rcsb_polymer_entity: { pdbx_description: "NACHT, LRR and PYD domains-containing protein 3" },
      entity_poly: { type: "polypeptide(L)", rcsb_sample_sequence_length: 91 },
    }],
    nonpolymer_entities: null,
  });
  assert(entrada.id === "2NAQ", "id oficial");
  assert(entrada.titulo.includes("NLRP3 PYD"), "título oficial");
  assert(entrada.metodos[0] === "SOLUTION NMR", "método oficial");
  assert(!("resolucaoCombinada" in entrada), "resolução nula não vira número");
  assert(!("naoPolimericos" in entrada), "não polímero ausente não é inventado");
  assert(entrada.polimeros[0].cadeias[0] === "A", "cadeia author");
  assert(entrada.polimeros[0].comprimentoAmostra === 91, "comprimento da amostra");

  const incompleta = BuscaNome.normalizarEntrada({
    rcsb_id: "9ZZZ",
    struct: {},
    exptl: [],
    rcsb_entry_info: {},
    polymer_entities: [{ rcsb_polymer_entity: { pdbx_description: "" } }],
  });
  assert(incompleta.id === "9ZZZ", "código sem ficha continua identificável");
  assert(!("titulo" in incompleta) && !("metodos" in incompleta) && !("resolucaoCombinada" in incompleta), "campos vazios ficam de fora");
  assert(!("polimeros" in incompleta), "descrição em branco não vira componente");

  assert(BuscaNome.normalizarEntrada({ rcsb_id: "NLRP3", struct: { title: "não é depósito" } }) == null, "nome não vira entrada");
  assert(BuscaNome.normalizarEntrada(null) == null, "entrada nula");

  const html = BuscaNome.htmlResultados({
    nome: "NLRP3",
    total: 2,
    resultados: [entrada, incompleta],
  });
  assert(html.includes("2NAQ") && html.includes("SOLUTION NMR"), "método presente aparece");
  assert(html.includes("sequência da amostra: 91"), "comprimento presente aparece");
  assert(!html.includes("mais completo"), "não há selo de completude");
  assert(!/recomend/i.test(html), "não há recomendação");
  assert(!/LaMCAD/.test(html), "não há ajuste de dinâmica");
  assert(!/tem ligante/i.test(html), "não afirma ligante");
  const artigoVazio = html.split("<article")[2] || "";
  assert(artigoVazio.includes("9ZZZ"), "o segundo artigo é o código sem ficha");
  assert(!artigoVazio.includes("Å"), "sem resolução não aparece ångström");
  assert(!/Título<\/span>\s*</.test(artigoVazio), "sem título não há rótulo vazio");
  assert(/Não são julgamento de qualidade/.test(html), "o aviso distingue metadado de inferência");
  assert(/Página 2NAQ no RCSB/.test(html), "link verificável do código");
  assert(html.includes("https://www.rcsb.org/structure/2NAQ"), "URL do RCSB");
}

function errosELista() {
  assert(BuscaNome.lerBusca(204, "").codigo === "vazio", "204 é nenhum resultado");
  assert(BuscaNome.lerBusca(200, JSON.stringify({ result_set: [], total_count: 0 })).codigo === "vazio", "lista vazia não ganha exemplo");
  const lixo = BuscaNome.lerBusca(200, JSON.stringify({
    total_count: 3,
    result_set: [{ identifier: "NLRP3" }, { identifier: "6NPY" }, { identifier: "nao-e-id" }],
  }));
  assert(lixo.ok && lixo.ids.length === 1 && lixo.ids[0] === "6NPY", "só identificador PDB clássico entra: " + JSON.stringify(lixo));
  assert(BuscaNome.lerBusca(429, "").codigo === "limite" && /429/.test(BuscaNome.lerBusca(429, "").mensagem), "429 da busca");
  assert(BuscaNome.lerBusca(400, "{}").codigo === "consulta", "400");
  assert(BuscaNome.lerBusca(503, "").codigo === "servico", "5xx");
  assert(BuscaNome.lerBusca(200, "<html>").codigo === "formato", "HTML não vira lista");
  assert(BuscaNome.lerBusca(200, JSON.stringify({ total_count: 1 })).codigo === "formato", "sem result_set não inventa");

  const metaRuim = BuscaNome.lerMetadados("{");
  assert(!metaRuim.ok && /não foram preenchidos/.test(metaRuim.mensagem), "JSON de metadado quebrado");
  const metaSem = BuscaNome.lerMetadados(JSON.stringify({ data: {} }));
  assert(!metaSem.ok, "GraphQL sem entries");
  const metaOk = BuscaNome.lerMetadados(JSON.stringify({
    data: { entries: [null, { rcsb_id: "6NPY", struct: { title: "Cryo-EM structure of NLRP3 bound to NEK7" }, exptl: [{ method: "ELECTRON MICROSCOPY" }], rcsb_entry_info: { resolution_combined: [3.8] } }] },
  }));
  assert(metaOk.ok && metaOk.porId["6NPY"].resolucaoCombinada[0] === 3.8, "resolução numérica oficial");
  assert(metaOk.porId["6NPY"].titulo.startsWith("Cryo-EM"), "título não é reescrito");

  const htmlCheio = BuscaNome.htmlResultados({
    nome: "NLRP3",
    total: 28,
    limite: 12,
    resultados: [{ id: "6NPY", titulo: "Cryo-EM structure of NLRP3 bound to NEK7", metodos: ["ELECTRON MICROSCOPY"], resolucaoCombinada: [3.8], polimeros: [{ descricao: "Nek7", cadeias: ["B"], comprimentoAmostra: 279 }], naoPolimericos: [{ compId: "ADP", nome: "ADENOSINE-5'-DIPHOSPHATE", cadeias: ["A"] }] }],
  });
  assert(/1 de 28 depósitos experimentais/.test(htmlCheio), "informa o recorte sem esconder o total");
  assert(htmlCheio.includes("3.8 Å"), "resolução combinada como veio");
  assert(!htmlCheio.includes("3.80"), "não acrescenta casa decimal");
  assert(/Componente não polimérico · ADP/.test(htmlCheio), "componente com o código oficial");
  assert(!/ligante adequado|adequado para/.test(htmlCheio), "ADP não vira adequação");
}

function fetchQue(roteiro) {
  const chamadas = [];
  const fetchImpl = (url, opts) => {
    chamadas.push({ url, body: opts && opts.body });
    const passo = roteiro.shift();
    if (!passo) return Promise.reject(new Error("sem roteiro"));
    if (passo.erro) return Promise.reject(passo.erro);
    if (passo.pendura) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ status: 200, text: async () => "{}" }), 5000);
        if (opts && opts.signal) {
          opts.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        }
      });
    }
    return Promise.resolve({
      status: passo.status,
      text: async () => passo.texto,
    });
  };
  return { fetchImpl, chamadas };
}

async function fluxosDeRede() {
  const idFetch = fetchQue([]);
  const comoId = await BuscaNome.pesquisar("6NPY", { fetch: idFetch.fetchImpl });
  assert(!comoId.ok && comoId.codigo === "entrada", "pesquisar recusa código");
  assert(idFetch.chamadas.length === 0, "código não dispara a Search API");

  const vazio = fetchQue([{ status: 204, texto: "" }]);
  const sem = await BuscaNome.pesquisar("NLRP3", { fetch: vazio.fetchImpl });
  assert(!sem.ok && sem.codigo === "vazio" && /Nenhum depósito experimental/.test(sem.mensagem), "sem resultado");
  const corpo = JSON.parse(vazio.chamadas[0].body);
  assert(corpo.query.nodes[1].parameters.value === "experimental", "pedido real pede experimental");
  assert(corpo.query.nodes[0].nodes[0].parameters.value === "NLRP3", "pedido real manda o nome inteiro");

  const limite = fetchQue([{ status: 429, texto: "" }]);
  const lim = await BuscaNome.pesquisar("NLRP3", { fetch: limite.fetchImpl });
  assert(lim.codigo === "limite" && /429/.test(lim.mensagem), "429 na busca");

  const rede = fetchQue([{ erro: new TypeError("Failed to fetch") }]);
  const off = await BuscaNome.pesquisar("NLRP3", { fetch: rede.fetchImpl });
  assert(off.codigo === "rede" && /Sem conexão/.test(off.mensagem), "falha de rede");

  const lento = fetchQue([{ pendura: true }]);
  const tempo = await BuscaNome.pesquisar("NLRP3", { fetch: lento.fetchImpl, esperaMs: 30 });
  assert(tempo.codigo === "tempo" && /segundos/.test(tempo.mensagem), "tempo esgotado: " + tempo.mensagem);

  const metaLimite = fetchQue([
    { status: 200, texto: JSON.stringify({ total_count: 2, result_set: [{ identifier: "6NPY" }, { identifier: "2NAQ" }] }) },
    { status: 429, texto: "" },
  ]);
  const parcial = await BuscaNome.pesquisar("NLRP3", { fetch: metaLimite.fetchImpl });
  assert(parcial.ok && parcial.resultados.map((r) => r.id).join(",") === "6NPY,2NAQ", "429 de metadado conserva os códigos");
  assert(parcial.resultados.every((r) => !r.titulo), "sem metadado não inventa título");
  assert(/429/.test(parcial.avisoMetadados), "avisa o limite dos metadados");
  const html = BuscaNome.htmlResultados(parcial);
  assert(!html.includes("Å"), "sem resolução na lista parcial");
  assert((html.match(/data-busca-id="/g) || []).length === 2, "os dois códigos seguem escolhíveis");

  const metaFora = fetchQue([
    { status: 200, texto: JSON.stringify({ total_count: 1, result_set: [{ identifier: "6NPY" }] }) },
    { erro: new TypeError("Failed to fetch") },
  ]);
  const semMeta = await BuscaNome.pesquisar("NLRP3", { fetch: metaFora.fetchImpl });
  assert(semMeta.ok && semMeta.resultados[0].id === "6NPY" && !semMeta.resultados[0].titulo, "queda na hora do metadado deixa o código");
  assert(/Sem conexão ao pedir os metadados/.test(semMeta.avisoMetadados), "avisa a queda dos metadados");

  const completo = fetchQue([
    { status: 200, texto: JSON.stringify({ total_count: 28, result_set: [{ identifier: "6npy" }] }) },
    { status: 200, texto: JSON.stringify({ data: { entries: [{ rcsb_id: "6NPY", struct: { title: "Cryo-EM structure of NLRP3 bound to NEK7" }, exptl: [{ method: "ELECTRON MICROSCOPY" }], rcsb_entry_info: { resolution_combined: [3.8] }, polymer_entities: [], nonpolymer_entities: [] }] } }) },
  ]);
  const cheio = await BuscaNome.pesquisar("NLRP3", { fetch: completo.fetchImpl });
  assert(cheio.ok && cheio.resultados[0].id === "6NPY" && cheio.resultados[0].resolucaoCombinada[0] === 3.8, "metadado oficial entra na ficha");
  assert(BuscaNome.selecionar(cheio.resultados, "6NPY").titulo.includes("NEK7"), "a escolha devolve a ficha, não outro código");
  assert(completo.chamadas[1].url === BuscaNome.URL_GRAPHQL, "metadado vai ao GraphQL oficial");
  assert(completo.chamadas[0].url === BuscaNome.URL_BUSCA, "busca vai à Search API oficial");
}

function arquivosDaInterface() {
  const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
  const campo = html.slice(html.indexOf('id="pdb-id"'), html.indexOf('id="pdb-id"') + 280);
  assert(!/maxlength="4"/.test(campo), "o campo não corta em 4: " + campo);
  assert(/maxlength="80"/.test(campo), "o campo aceita nome com mais de 4 caracteres");
  assert(/placeholder="ex\.: 1A00 ou hemoglobina"/.test(campo), "placeholder usa hemoglobina");
  assert(/Código PDB ou nome da proteína/.test(html), "rótulo separa código e nome");
  assert(/id="entrada-dica"[\s\S]*hemoglobina/.test(html), "ajuda do campo cita hemoglobina");
  assert(/<code>hemoglobina<\/code>/.test(html), "instruções citam hemoglobina");
  assert(!/NLRP3/i.test(html), "a página pública não cita NLRP3");
  assert(/Nome da proteína/.test(html), "ajuda distingue o nome");
  const busca = fs.readFileSync(path.join(__dirname, "../docs/busca-nome.js"), "utf8");
  const leiaute = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  const leiauteDocs = fs.readFileSync(path.join(__dirname, "../docs/README.md"), "utf8");
  assert(!/NLRP3/i.test(busca), "mensagens do módulo não citam NLRP3");
  assert(!/NLRP3/i.test(leiaute), "readme da raiz não cita NLRP3");
  assert(!/NLRP3/i.test(leiauteDocs), "readme do app não cita NLRP3");
  assert(/hemoglobina/.test(leiaute) && /hemoglobina/.test(leiauteDocs), "readmes citam hemoglobina");
  assert(/busca-nome\.js/.test(html) && html.indexOf("busca-nome.js") < html.indexOf("app.js"), "módulo entra antes do app");
  assert(/id="cmp-ids"/.test(html), "comparação por código permanece");
  assert(/id="file-input"/.test(html), "upload permanece");
  const app = fs.readFileSync(path.join(__dirname, "../docs/app.js"), "utf8");
  assert(app.includes("Ocultar ${p.name} no 3D") && app.includes("Ocultar ${nome} no 3D"), "botão ver/ocultar do pocket permanece");
  assert(app.includes('data-busca-id') || app.includes("data-busca-id"), "clique da lista usa o código escolhido");
  assert(/acaoCampo\(pdbParam\)/.test(app), "link ?pdb= passa pelo mesmo classificador");
  const rodape = html.slice(html.indexOf('class="creditos"'));
  assert(/Allison Gustavo Braz/.test(rodape) && /Roosevelt Alves da Silva/.test(rodape), "créditos intactos");
}

decidirNome();
consultaNaoTrunca();
selecaoExplicita();
metadadosAusentes();
arquivosDaInterface();
fluxosDeRede().then(() => {
  console.log(ok + " asserções ok, " + falhas + " falhas");
  if (falhas) process.exit(1);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
