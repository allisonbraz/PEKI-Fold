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
  const n = BuscaNome.decidir("hemoglobin");
  assert(n.acao === "listar" && n.nome === "hemoglobin", "hemoglobin é nome, não código: " + JSON.stringify(n));
  assert(BuscaNome.classificar("hemoglobin").tipo === "nome" && BuscaNome.classificar("hemoglobin").valor === "hemoglobin", "minúsculas continuam nome");
  const curto = BuscaNome.decidir("cram");
  assert(curto.acao === "listar" && curto.nome === "cram", "cram não é usado como código: " + JSON.stringify(curto));
  assert(BuscaNome.decidir("cram").id == null, "cram não ganha id");

  const id = BuscaNome.decidir("1crn");
  assert(id.acao === "carregar" && id.id === "1CRN", "1CRN carrega pelo código: " + JSON.stringify(id));
  const a00 = BuscaNome.decidir("  1a00 ");
  assert(a00.acao === "carregar" && a00.id === "1A00", "1A00 com espaço nas pontas é código");
  assert(BuscaNome.decidir("4HHB").acao === "carregar", "4HHB segue o fluxo de código");

  const misturado = BuscaNome.decidir("1CRN hemoglobin");
  assert(misturado.acao === "listar" && misturado.nome === "1CRN hemoglobin", "frase com código não é carregada sozinha");
  const vazio = BuscaNome.decidir("");
  assert(vazio.acao === "erro", "vazio é erro");
  assertExemploPublico(vazio.mensagem, "erro vazio");
  assert(BuscaNome.decidir("   ").acao === "erro", "espaço é vazio");
  assert(BuscaNome.decidir("A").acao === "erro", "uma letra não busca");
  const curtoCodigo = BuscaNome.decidir("1A0");
  assert(curtoCodigo.acao === "erro", "código curto não é truncado nem buscado");
  assertExemploPublico(curtoCodigo.mensagem, "código curto");
  assert(BuscaNome.decidir("12345").acao === "erro", "dígitos a mais não viram nome");
  const ext = BuscaNome.decidir("PDB_00001ABC");
  assert(ext.acao === "erro" && /estendido/.test(ext.mensagem), "ID estendido continua recusado");
  const simbolos = BuscaNome.decidir("***");
  assert(simbolos.acao === "erro", "símbolos não viram busca");
  assertExemploPublico(simbolos.mensagem, "símbolos");
  const digitada = BuscaNome.decidir("hemoglobina");
  assert(digitada.acao === "listar" && digitada.nome === "hemoglobina", "o termo digitado não é traduzido");
  const ingles = BuscaNome.decidir("hemoglobin");
  assert(ingles.acao === "listar" && ingles.nome === "hemoglobin", "hemoglobin segue inteiro para a busca");
}

function assertExemploPublico(mensagem, onde) {
  assert(/hemoglobin/.test(mensagem) && !/hemoglobina/.test(mensagem), onde + " cita hemoglobin: " + mensagem);
  assert(/O RCSB busca em inglês/.test(mensagem), onde + " explica a busca em inglês");
}

function consultaNaoTrunca() {
  const q = BuscaNome.montarConsulta("hemoglobin");
  const s = JSON.stringify(q);
  assert(s.includes("hemoglobin") && !s.includes("\"cram\""), "a consulta manda hemoglobin inteiro");
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
  const cram = BuscaNome.montarConsulta("cram");
  const js = JSON.stringify(cram);
  assert(js.includes("\"cram\"") && !js.includes("hemoglobin"), "cram não é reescrito nem completado");
  assert(!/files\.rcsb\.org/.test(js), "a consulta de nome não baixa estrutura");
}

function selecaoExplicita() {
  const lista = [
    { id: "4HHB", titulo: "hemoglobin" },
    { id: "1CRN", titulo: "crambin" },
  ];
  assert(BuscaNome.selecionar(lista, null) == null, "sem id não escolhe o primeiro");
  assert(BuscaNome.selecionar(lista) == null, "omissão não escolhe");
  assert(BuscaNome.selecionar(lista, "") == null, "string vazia não escolhe");
  assert(BuscaNome.selecionar(lista, "4HHB") === lista[0], "escolhe o id clicado, não o vizinho");
  assert(BuscaNome.selecionar(lista, "1crn").id === "1CRN", "escolha aceita o código em minúsculas");
  assert(BuscaNome.selecionar(lista, "1A00") == null, "código fora da lista não entra");
  assert(BuscaNome.selecionar(lista, "hemoglobin") == null, "nome não é seleção");
  assert(BuscaNome.selecionar([{ id: "1CRN" }], "1CRN").id === "1CRN", "lista de um item ainda exige o clique");
  const html = BuscaNome.htmlResultados({ nome: "hemoglobin", total: 2, resultados: lista });
  const botoes = html.match(/data-busca-id="/g) || [];
  assert(botoes.length === 2, "um botão por resultado, sem atalho");
  assert(!/data-busca-id="1A00"/.test(html), "exemplo da home não entra na lista");
  assert(/Escolha um código/.test(html) && /automaticamente/.test(html), "a lista pede escolha");
}

// Metadados simulados: exercitam campos opcionais, sem interpretação científica.
function metadadosAusentes() {
  const entrada = BuscaNome.normalizarEntrada({
    rcsb_id: "4HHB",
    struct: { title: "hemoglobin" },
    exptl: [{ method: "SOLUTION NMR" }],
    rcsb_entry_info: { resolution_combined: null },
    polymer_entities: [{
      rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ["A"] },
      rcsb_polymer_entity: { pdbx_description: "hemoglobin" },
      entity_poly: { type: "polypeptide(L)", rcsb_sample_sequence_length: 91 },
    }],
    nonpolymer_entities: null,
  });
  assert(entrada.id === "4HHB", "id oficial");
  assert(entrada.titulo.includes("hemoglobin"), "título oficial");
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

  assert(BuscaNome.normalizarEntrada({ rcsb_id: "hemoglobin", struct: { title: "não é depósito" } }) == null, "nome não vira entrada");
  assert(BuscaNome.normalizarEntrada(null) == null, "entrada nula");

  const html = BuscaNome.htmlResultados({
    nome: "hemoglobin",
    total: 2,
    resultados: [entrada, incompleta],
  });
  assert(html.includes("4HHB") && html.includes("SOLUTION NMR"), "método presente aparece");
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
  assert(/Página 4HHB no RCSB/.test(html), "link verificável do código");
  assert(html.includes("https://www.rcsb.org/structure/4HHB"), "URL do RCSB");
}

function errosELista() {
  assert(BuscaNome.lerBusca(204, "").codigo === "vazio", "204 é nenhum resultado");
  assert(BuscaNome.lerBusca(200, JSON.stringify({ result_set: [], total_count: 0 })).codigo === "vazio", "lista vazia não ganha exemplo");
  const lixo = BuscaNome.lerBusca(200, JSON.stringify({
    total_count: 3,
    result_set: [{ identifier: "hemoglobin" }, { identifier: "1CRN" }, { identifier: "nao-e-id" }],
  }));
  assert(lixo.ok && lixo.ids.length === 1 && lixo.ids[0] === "1CRN", "só identificador PDB clássico entra: " + JSON.stringify(lixo));
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
    data: { entries: [null, { rcsb_id: "1CRN", struct: { title: "crambin" }, exptl: [{ method: "ELECTRON MICROSCOPY" }], rcsb_entry_info: { resolution_combined: [3.8] } }] },
  }));
  assert(metaOk.ok && metaOk.porId["1CRN"].resolucaoCombinada[0] === 3.8, "resolução numérica oficial");
  assert(metaOk.porId["1CRN"].titulo.startsWith("Cryo-EM"), "título não é reescrito");

  const htmlCheio = BuscaNome.htmlResultados({
    nome: "hemoglobin",
    total: 28,
    limite: 12,
    resultados: [{ id: "1CRN", titulo: "crambin", metodos: ["ELECTRON MICROSCOPY"], resolucaoCombinada: [3.8], polimeros: [{ descricao: "Nek7", cadeias: ["B"], comprimentoAmostra: 279 }], naoPolimericos: [{ compId: "ADP", nome: "ADENOSINE-5'-DIPHOSPHATE", cadeias: ["A"] }] }],
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
  const comoId = await BuscaNome.pesquisar("1CRN", { fetch: idFetch.fetchImpl });
  assert(!comoId.ok && comoId.codigo === "entrada", "pesquisar recusa código");
  assert(idFetch.chamadas.length === 0, "código não dispara a Search API");

  const vazio = fetchQue([{ status: 204, texto: "" }]);
  const sem = await BuscaNome.pesquisar("hemoglobin", { fetch: vazio.fetchImpl });
  assert(!sem.ok && sem.codigo === "vazio" && /Nenhum depósito experimental/.test(sem.mensagem), "sem resultado");
  const corpo = JSON.parse(vazio.chamadas[0].body);
  assert(corpo.query.nodes[1].parameters.value === "experimental", "pedido real pede experimental");
  assert(corpo.query.nodes[0].nodes[0].parameters.value === "hemoglobin", "pedido real manda o nome inteiro");

  const limite = fetchQue([{ status: 429, texto: "" }]);
  const lim = await BuscaNome.pesquisar("hemoglobin", { fetch: limite.fetchImpl });
  assert(lim.codigo === "limite" && /429/.test(lim.mensagem), "429 na busca");

  const rede = fetchQue([{ erro: new TypeError("Failed to fetch") }]);
  const off = await BuscaNome.pesquisar("hemoglobin", { fetch: rede.fetchImpl });
  assert(off.codigo === "rede" && /Sem conexão/.test(off.mensagem), "falha de rede");

  const lento = fetchQue([{ pendura: true }]);
  const tempo = await BuscaNome.pesquisar("hemoglobin", { fetch: lento.fetchImpl, esperaMs: 30 });
  assert(tempo.codigo === "timeout" && tempo.estado === "erro" && /tempo-limite/.test(tempo.mensagem), "tempo esgotado: " + tempo.mensagem);

  const metaLimite = fetchQue([
    { status: 200, texto: JSON.stringify({ total_count: 2, result_set: [{ identifier: "1CRN" }, { identifier: "4HHB" }] }) },
    { status: 429, texto: "" },
  ]);
  const parcial = await BuscaNome.pesquisar("hemoglobin", { fetch: metaLimite.fetchImpl });
  assert(parcial.ok && parcial.resultados.map((r) => r.id).join(",") === "1CRN,4HHB", "429 de metadado conserva os códigos");
  assert(parcial.resultados.every((r) => !r.titulo), "sem metadado não inventa título");
  assert(/429/.test(parcial.avisoMetadados), "avisa o limite dos metadados");
  const html = BuscaNome.htmlResultados(parcial);
  assert(!html.includes("Å"), "sem resolução na lista parcial");
  assert((html.match(/data-busca-id="/g) || []).length === 2, "os dois códigos seguem escolhíveis");

  const metaFora = fetchQue([
    { status: 200, texto: JSON.stringify({ total_count: 1, result_set: [{ identifier: "1CRN" }] }) },
    { erro: new TypeError("Failed to fetch") },
  ]);
  const semMeta = await BuscaNome.pesquisar("hemoglobin", { fetch: metaFora.fetchImpl });
  assert(semMeta.ok && semMeta.resultados[0].id === "1CRN" && !semMeta.resultados[0].titulo, "queda na hora do metadado deixa o código");
  assert(/Sem conexão ao pedir os metadados/.test(semMeta.avisoMetadados), "avisa a queda dos metadados");

  const completo = fetchQue([
    { status: 200, texto: JSON.stringify({ total_count: 28, result_set: [{ identifier: "1crn" }] }) },
    { status: 200, texto: JSON.stringify({ data: { entries: [{ rcsb_id: "1CRN", struct: { title: "crambin" }, exptl: [{ method: "ELECTRON MICROSCOPY" }], rcsb_entry_info: { resolution_combined: [3.8] }, polymer_entities: [], nonpolymer_entities: [] }] } }) },
  ]);
  const cheio = await BuscaNome.pesquisar("hemoglobin", { fetch: completo.fetchImpl });
  assert(cheio.ok && cheio.resultados[0].id === "1CRN" && cheio.resultados[0].resolucaoCombinada[0] === 3.8, "metadado oficial entra na ficha");
  assert(BuscaNome.selecionar(cheio.resultados, "1CRN").titulo === "crambin", "a escolha devolve a ficha, não outro código");
  assert(completo.chamadas[1].url === BuscaNome.URL_GRAPHQL, "metadado vai ao GraphQL oficial");
  assert(completo.chamadas[0].url === BuscaNome.URL_BUSCA, "busca vai à Search API oficial");
}

function arquivosDaInterface() {
  const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
  const campo = html.slice(html.indexOf('id="pdb-id"'), html.indexOf('id="pdb-id"') + 280);
  assert(!/maxlength="4"/.test(campo), "o campo não corta em 4: " + campo);
  assert(/maxlength="80"/.test(campo), "o campo aceita nome com mais de 4 caracteres");
  assert(/placeholder="ex\.: 1A00 ou hemoglobin"/.test(campo), "placeholder usa hemoglobin");
  assert(!/hemoglobina/.test(campo), "o campo não sugere hemoglobina");
  assert(/Código PDB ou nome da proteína/.test(html), "rótulo separa código e nome");
  const dica = html.slice(html.indexOf('id="entrada-dica"'), html.indexOf("</p>", html.indexOf('id="entrada-dica"')));
  assertExemploPublico(dica, "ajuda do campo");
  const ajudaNome = html.slice(html.indexOf("<strong>Nome da proteína</strong>"), html.indexOf("</li>", html.indexOf("<strong>Nome da proteína</strong>")));
  assert(/<code>hemoglobin<\/code>/.test(ajudaNome) && !/hemoglobina/.test(ajudaNome), "instruções citam hemoglobin");
  assert(/O RCSB busca em inglês/.test(ajudaNome), "instruções explicam a busca em inglês");
  assert(/data-id="1A00">1A00 \(hemoglobina\)/.test(html), "chip 1A00 continua abrindo pelo código");
  assert(/data-id="4HHB">4HHB</.test(html), "chip 4HHB permanece");
  assert(/data-id="1CRN">1CRN \(crambina\)/.test(html), "chip 1CRN permanece");
  assert(/hemoglobin/i.test(html), "a página pública usa exemplo neutro");
  assert(/Nome da proteína/.test(html), "ajuda distingue o nome");
  const busca = fs.readFileSync(path.join(__dirname, "../docs/busca-nome.js"), "utf8");
  const leiaute = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  const leiauteDocs = fs.readFileSync(path.join(__dirname, "../docs/README.md"), "utf8");
  assert(!/hemoglobina/.test(busca), "mensagens do módulo não sugerem hemoglobina");
  assert(/O RCSB busca em inglês/.test(busca), "erros do módulo explicam a busca em inglês");
  assert(/hemoglobin/i.test(busca), "mensagens do módulo usam exemplo neutro");
  assert(/hemoglobin/i.test(leiaute), "readme da raiz usa exemplo neutro");
  assert(/hemoglobin/i.test(leiauteDocs), "readme do app usa exemplo neutro");
  assert(/ex\.: `hemoglobin`/.test(leiaute) && /RCSB busca em inglês/.test(leiaute), "readme da raiz exemplifica hemoglobin");
  assert(!/ex\.: `hemoglobina`/.test(leiaute), "readme da raiz não sugere hemoglobina");
  assert(/ex\.: `hemoglobin`/.test(leiauteDocs) && /RCSB busca em inglês/.test(leiauteDocs), "readme do app exemplifica hemoglobin");
  assert(!/hemoglobina/.test(leiauteDocs), "readme do app não sugere hemoglobina");
  assert(/busca-nome\.js/.test(html) && html.indexOf("busca-nome.js") < html.indexOf("app.js"), "módulo entra antes do app");
  assert(/id="cmp-ids"/.test(html), "comparação por código permanece");
  assert(/id="file-input"/.test(html), "upload permanece");
  const app = fs.readFileSync(path.join(__dirname, "../docs/app.js"), "utf8");
  const viewer = fs.readFileSync(path.join(__dirname, "../docs/viewer.js"), "utf8");
  assert(viewer.includes("Ocultar ${p.name} no 3D") && viewer.includes("Ocultar ${nome} no 3D"), "botão ver/ocultar do pocket permanece");
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
