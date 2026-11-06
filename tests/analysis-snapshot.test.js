// Análise guardável e ranking por pergunta.
// Fixtures reais: hemoglobina 1A00 e crambina 1CRN, locais.
// As análises SIN-* são sintéticas e estão rotuladas assim.
"use strict";

const fs = require("fs");
const path = require("path");
const StructureModel = require("../docs/structure-model.js");
const QualityModel = require("../docs/quality-model.js");
const AnalysisSnapshot = require("../docs/analysis-snapshot.js");

let falhas = 0;
let ok = 0;
function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}
function quase(a, b, msg) {
  assert(Math.abs(a - b) < 1e-9, msg + " (" + a + " vs " + b + ")");
}

function residuo(seq, resname) {
  return { resname: resname || "ALA", seq, icode: "", classe: "proteina" };
}
function cadeia(id, n, resname) {
  const residuos = [];
  for (let i = 1; i <= n; i++) residuos.push(residuo(i, resname));
  return {
    id,
    auth: id,
    label: id,
    sequencia: residuos.map(() => "A").join(""),
    residuos,
  };
}

function base(over) {
  const snap = {
    schema: "peki-analise-1",
    versaoApp: "peki-fold-web",
    geradoEm: "2026-11-06T12:00:00.000Z",
    id: "SIN-A",
    rotulo: "SIN-A",
    origem: {
      tipo: "arquivo", pdbId: null, nomeArquivo: "sintetico.pdb", formato: "pdb",
      fonte: "dados sintéticos de teste", url: null, titulo: "fixture sintética",
      metodo: "X-RAY DIFFRACTION", resolucaoArquivo: null, sintetico: true,
      nota: "Dados sintéticos de teste. Não é um depósito.",
    },
    modelo: { selecionado: 1, total: 1, criterio: "fixture" },
    cadeias: [cadeia("A", 10)],
    cobertura: { polimerosModelados: 10 },
    lacunas: {
      determinado: true, resumo: "Nenhum ausente na fixture sintética.",
      naoResolvidos: [], saltosNumeracao: [], foraDoConstructo: "não avaliado",
    },
    componentes: {
      proteinas: { posicoes: 10, padrao: 10, modificadas: 0 },
      hetero: [], ions: [], modificados: [],
      aguas: { instancias: 0, nota: "fixture" },
      holo: { estado: "nao_determinado", motivo: "não prova holo" },
      anotacoesCcd: [], ccdEstado: "nao_consultado",
    },
    qualidade: {
      estado: "ok", motivo: null, classe: "xray", consulta: "fixture", fonte: null,
      metricas: [], omitidos: [], local: { estado: "ausente", motivo: "fixture" },
    },
    pockets: {
      estado: "nao_solicitado", motivo: "não pedido na fixture", fonte: null,
      aviso: "drugScore não é afinidade", itens: [],
    },
    preparo: {
      estado: "nao_calculado", motivo: null, versao: null, predita: null,
      contagens: null, selecao: null, anotacoes: null, caixaVina: null,
    },
    uniprot: {
      correspondenciaResiduo: "nao_estabelecida",
      motivo: "fixture sem mapa resíduo a resíduo",
      declaracoes: [{ cadeia: "A", accession: "EX-HBA", db: "UNP", pdbInicio: 1, pdbFim: 10 }],
    },
    anotacoes: { motivoSequencia: null },
    limitacoes: ["fixture sintética"],
  };
  return Object.assign(snap, over || {});
}

function comQualidade(valores) {
  return {
    estado: "ok", classe: "xray", consulta: "fixture", fonte: null, motivo: null, omitidos: [],
    local: { estado: "ausente", motivo: "fixture" },
    metricas: [
      { id: "resolucao", rotulo: "Resolução", valor: valores.resolucao, unidade: "Å" },
      { id: "clashscore", rotulo: "Clashscore", valor: valores.clashscore, unidade: null },
      { id: "rama", rotulo: "Ramachandran outliers", valor: valores.rama, unidade: "%" },
    ],
  };
}

function completo() {
  const cadeias = [cadeia("A", 100)];
  return base({
    id: "SIN-COMPLETO", rotulo: "SIN-COMPLETO", cadeias,
    cobertura: { polimerosModelados: 100 },
    componentes: Object.assign({}, base().componentes, { hetero: [{ codigo: "HEM", instancias: 4, nome: "PROTOPORPHYRIN IX" }] }),
    qualidade: comQualidade({ resolucao: 2, clashscore: 8, rama: 2 }),
    pockets: {
      estado: "ok", motivo: null, fonte: "DoGSiteScorer/ProteinsPlus", aviso: "não é afinidade",
      itens: [{ name: "P_0", volume: 200, surface: 100, depth: 8, hydrophobicity: 0.3, drugScore: 0.4 }],
    },
  });
}
function lacuna() {
  const ausentes = [];
  for (let i = 71; i <= 100; i++) ausentes.push({ cadeia: "A", resname: "ALA", seq: i, icode: "" });
  return base({
    id: "SIN-LACUNA", rotulo: "SIN-LACUNA",
    cadeias: [cadeia("A", 70)],
    cobertura: { polimerosModelados: 70 },
    lacunas: {
      determinado: true, resumo: "30 ausentes citados na fixture sintética.",
      naoResolvidos: ausentes, saltosNumeracao: [], foraDoConstructo: "não avaliado",
    },
    componentes: Object.assign({}, base().componentes, { hetero: [{ codigo: "HEM", instancias: 4, nome: null }] }),
    qualidade: comQualidade({ resolucao: 1.8, clashscore: 4, rama: 1 }),
    pockets: {
      estado: "ok", motivo: null, fonte: "DoGSiteScorer/ProteinsPlus", aviso: "não é afinidade",
      itens: [{ name: "P_0", volume: 80, surface: 40, depth: 5, hydrophobicity: 0.2, drugScore: 0.8 }],
    },
  });
}
function apo() {
  return base({
    id: "SIN-APO", rotulo: "SIN-APO",
    cadeias: [cadeia("A", 100)],
    cobertura: { polimerosModelados: 100 },
    qualidade: comQualidade({ resolucao: 1.5, clashscore: 2, rama: 0 }),
    pockets: { estado: "pendente", motivo: "cálculo não concluído na fixture", fonte: "DoGSiteScorer/ProteinsPlus", aviso: "não é afinidade", itens: [] },
  });
}

function pesos(p) {
  return {
    regiao: "", regiaoEssencial: false, componente: "", componenteEliminatorio: false, pocketEliminatorio: false,
    pesos: { cobertura: 0, qualidade: 0, componente: 0, pocket: 0, ...p },
  };
}

function porId(resultado, id) {
  return resultado.candidatos.find((c) => c.id === id);
}

function testeValidacao() {
  const um = completo();
  const texto = JSON.stringify(um);
  let colecao = [];
  let r = AnalysisSnapshot.importar(texto, colecao);
  assert(r.ok && r.colecao.length === 1, "importa um JSON válido");
  colecao = r.colecao;
  r = AnalysisSnapshot.importar(texto, colecao);
  assert(!r.ok && r.colecao.length === 1, "duplicata não entra e não altera a lista");
  assert(/identificador/.test(r.erro), "duplicata explica o identificador");
  r = AnalysisSnapshot.importar("{", colecao);
  assert(!r.ok && r.colecao.length === 1 && /JSON válido/.test(r.erro), "JSON inválido preserva a lista");
  r = AnalysisSnapshot.importar(JSON.stringify({ schema: "peki-analise-1" }), colecao);
  assert(!r.ok && r.colecao.length === 1, "formato incompleto é recusado");
  r = AnalysisSnapshot.importar(JSON.stringify({ schema: "peki-analise-2", id: "X" }), colecao);
  assert(!r.ok && /futura/.test(r.erro) && r.colecao.length === 1 && r.colecao[0].id === "SIN-COMPLETO", "versão futura não corrompe a lista");
  r = AnalysisSnapshot.importar("[]", colecao);
  assert(!r.ok, "lista solta não é análise");
  const grande = '{"schema":"peki-analise-1"' + " ".repeat(AnalysisSnapshot.LIMITE_BYTES);
  r = AnalysisSnapshot.importar(grande, colecao);
  assert(!r.ok && /1,5 MB/.test(r.erro), "arquivo grande é recusado");
  const sujo = JSON.parse(texto);
  sujo.rotulo = "<img src=x onerror=alert(1)>";
  r = AnalysisSnapshot.importar(JSON.stringify(sujo), []);
  assert(r.ok && r.analise.rotulo.indexOf("<img") === 0, "texto importado permanece texto");
}

function testeContagem() {
  const pergunta = pesos({ cobertura: 1 });
  let r = AnalysisSnapshot.comparar([completo()], pergunta);
  assert(!r.ranqueado && /2 a 5/.test(r.motivo) && /1/.test(r.motivo), "uma análise não gera ranking");
  const cinco = [completo(), lacuna(), apo()];
  cinco.push(base({ id: "SIN-D", rotulo: "SIN-D" }));
  cinco.push(base({ id: "SIN-E", rotulo: "SIN-E" }));
  r = AnalysisSnapshot.comparar(cinco, pergunta);
  assert(r.ranqueado && r.candidatos.length === 5, "cinco análises podem ser comparadas");
  let colecao = [];
  for (const snap of cinco) {
    const imp = AnalysisSnapshot.importar(JSON.stringify(snap), colecao);
    assert(imp.ok, "as cinco entram: " + snap.id + " " + imp.erro);
    colecao = imp.colecao;
  }
  const sexta = AnalysisSnapshot.importar(JSON.stringify(base({ id: "SIN-F", rotulo: "SIN-F" })), colecao);
  assert(!sexta.ok && colecao.length === 5 && sexta.colecao.length === 5, "a sexta é recusada e a lista fica em cinco");
  r = AnalysisSnapshot.comparar(sexta.colecao.concat([base({ id: "SIN-F", rotulo: "SIN-F" })]), pergunta);
  assert(!r.ranqueado && /2 a 5/.test(r.motivo), "seis análises não geram ranking");
}

function testeRanking() {
  const trio = [completo(), lacuna(), apo()];
  let r = AnalysisSnapshot.comparar(trio, pesos({ pocket: 1 }));
  assert(r.ranqueado && r.lideres[0].id === "SIN-LACUNA", "peso só de pocket coloca o maior drugScore na frente");
  assert(porId(r, "SIN-APO").situacao === "nao_pontuado" && porId(r, "SIN-APO").pontuacao == null, "pocket pendente não vira zero");
  assert(porId(r, "SIN-COMPLETO").pontuacao === 0, "o menor drugScore observado fica em 0 dentro do conjunto, porque o dado existe");
  r = AnalysisSnapshot.comparar(trio, pesos({ qualidade: 1 }));
  assert(r.lideres[0].id === "SIN-APO", "peso só de qualidade muda o primeiro colocado");
  quase(porId(r, "SIN-LACUNA").subscores[0].subpontuacao, (0.4 + (4 / 6) + 0.5) / 3, "qualidade da lacuna é a média das três métricas");
  r = AnalysisSnapshot.comparar(trio, Object.assign(pesos({ cobertura: 1, componente: 1 }), { componente: "HEM" }));
  assert(r.lideres[0].id === "SIN-COMPLETO", "cobertura e HEM mudam de novo o primeiro colocado");
  quase(porId(r, "SIN-LACUNA").pontuacao, 0.85, "lacuna com HEM fica em 0,85");
  quase(porId(r, "SIN-APO").pontuacao, 0.5, "ausência observada de HEM entra como 0 nesse critério");
  assert(/não prova|holo/i.test(porId(r, "SIN-COMPLETO").subscores.find((s) => s.id === "componente").detalhe), "presença de HEM não é declarada holo");
  r = AnalysisSnapshot.comparar(trio, Object.assign(pesos({ qualidade: 1 }), { componente: "HEM", componenteEliminatorio: true }));
  assert(porId(r, "SIN-APO").situacao === "desclassificado", "critério eliminatório tira quem não tem HEM");
  assert(r.lideres[0].id === "SIN-LACUNA", "entre quem tem HEM, a qualidade decide");
  assert(porId(r, "SIN-APO").pontuacao == null, "eliminado não recebe nota zero");
  r = AnalysisSnapshot.comparar(trio, pesos({}));
  assert(!r.ranqueado && /peso/.test(r.motivo), "sem peso não há ranking");
  const pendente = base({
    id: "SIN-QUAL", rotulo: "SIN-QUAL",
    qualidade: { estado: "pendente", motivo: "relatório não chegou", classe: null, consulta: null, fonte: null, metricas: [], omitidos: [], local: { estado: "pendente", motivo: "pendente" } },
  });
  r = AnalysisSnapshot.comparar([apo(), pendente], pesos({ qualidade: 1 }));
  assert(!r.ranqueado, "um único valor de qualidade não vira nota: " + r.motivo);
  assert(porId(r, "SIN-QUAL").pontuacao == null, "qualidade pendente não vira zero");
  assert(porId(r, "SIN-APO").pontuacao == null, "valor isolado não recebe nota boa implícita");
}

function testeEmpateERegiao() {
  const a = completo();
  const b = completo();
  b.id = "SIN-IGUAL";
  b.rotulo = "SIN-IGUAL";
  let r = AnalysisSnapshot.comparar([a, b], pesos({ cobertura: 1 }));
  assert(r.empateNoTopo && r.candidatos.every((c) => c.posicao === 1), "métricas iguais empatam na primeira posição");
  const cheia = base({
    id: "SIN-CHEIA", rotulo: "SIN-CHEIA",
    cadeias: [cadeia("A", 10)], cobertura: { polimerosModelados: 10 },
  });
  const furada = base({
    id: "SIN-FURADA", rotulo: "SIN-FURADA",
    cadeias: [cadeia("A", 7)], cobertura: { polimerosModelados: 7 },
    lacunas: {
      determinado: true, resumo: "três ausentes",
      naoResolvidos: [8, 9, 10].map((seq) => ({ cadeia: "A", resname: "ALA", seq, icode: "" })),
      saltosNumeracao: [], foraDoConstructo: "não avaliado",
    },
  });
  r = AnalysisSnapshot.comparar([furada, cheia], Object.assign(pesos({ cobertura: 1 }), { regiao: "A:1-10", regiaoEssencial: true }));
  assert(r.ranqueado && r.numeracao.comparavel && r.lideres[0].id === "SIN-CHEIA", "região comparável usa a faixa e prefere a cobertura maior");
  quase(porId(r, "SIN-FURADA").pontuacao, 0.7, "7 modelados e 3 ausentes na faixa");
  const outra = base({ id: "SIN-GLY", rotulo: "SIN-GLY", cadeias: [cadeia("A", 10, "GLY")] });
  r = AnalysisSnapshot.comparar([cheia, outra], Object.assign(pesos({ cobertura: 1 }), { regiao: "A:1-10", regiaoEssencial: true }));
  assert(!r.ranqueado && /não tem o mesmo nome|não é comparável|mesmo sítio/i.test(r.motivo), "nomes diferentes na mesma numeração impedem ranking da região essencial");
  r = AnalysisSnapshot.comparar([cheia, outra], Object.assign(pesos({ cobertura: 1 }), { regiao: "cadeia inteira" }));
  assert(!r.ranqueado && /Trecho inválido/.test(r.motivo), "região mal formada não gera ranking");
}

function testeReais() {
  const pdb = fs.readFileSync(path.join(__dirname, "../pdbproteins/pdb1a00.pdb"), "utf8");
  const lido = StructureModel.ler(pdb);
  assert(lido.ok, "1A00 local lê");
  const xml = fs.readFileSync(path.join(__dirname, "fixtures/qualidade/1A00_excerpt.xml"), "utf8");
  const rel = QualityModel.lerXml(xml, { id: "1A00", metodoArquivo: lido.estrutura.identidade.metodo });
  const snap = AnalysisSnapshot.montarDeWorkspace({
    pdbId: "1A00",
    nome: "pdb1a00.pdb",
    estrutura: lido.estrutura,
    qualidade: { relatorio: rel, componentes: null },
    pockets: null,
  }, { agora: "2026-11-06T15:00:00.000Z", preparo: { estado: "ok", versao: "preparo-1", contagens: { dissulfetos: 0 }, selecao: { cadeias: ["A"], removerAguas: true, altloc: "A", codigosHetMantidos: ["HEM"] }, anotacoes: { inventario: "conferir HEM" } } });
  assert(AnalysisSnapshot.nomeArquivo(snap) === "1A00-analise.json", "nome do arquivo da hemoglobina");
  assert(snap.origem.tipo === "rcsb" && snap.origem.sintetico === false, "1A00 não é marcado como sintético");
  assert(snap.origem.url === "https://files.rcsb.org/download/1A00.pdb", "origem aponta o PDB público");
  assert(!JSON.stringify(snap).includes("pdb1a00") || snap.origem.nomeArquivo === "pdb1a00.pdb", "o nome do arquivo local pode constar");
  assert(!/"ATOM  "/.test(JSON.stringify(snap)), "o PDB original não foi embutido");
  assert(snap.componentes.hetero.some((h) => h.codigo === "HEM" && h.instancias === 4), "HEM observado em 1A00: " + JSON.stringify(snap.componentes.hetero));
  assert(snap.cadeias.length === 4, "1A00 tem quatro cadeias");
  assert(snap.cadeias.every((c) => c.sequencia.length === c.residuos.length && c.sequencia.length > 0), "cada cadeia tem sequência");
  assert(snap.lacunas.determinado === true, "1A00 tem diagnóstico de lacuna");
  assert(snap.qualidade.estado === "ok" || snap.qualidade.estado === "parcial", "qualidade do excerto entrou: " + snap.qualidade.estado);
  const resolucao = snap.qualidade.metricas.find((m) => m.id === "resolucao");
  assert(resolucao && resolucao.valor === 2, "resolução 2,00 do relatório, não um valor inventado");
  assert(snap.pockets.estado === "nao_solicitado", "pocket não pedido permanece não solicitado");
  assert(snap.preparo.selecao.codigosHetMantidos.includes("HEM"), "seleção da ficha entra no guardado");
  assert(snap.uniprot.correspondenciaResiduo === "nao_estabelecida", "não promete mapa UniProt");
  const ida = AnalysisSnapshot.validarTexto(JSON.stringify(snap));
  assert(ida.ok && ida.analise.id === snap.id && ida.analise.cadeias.length === 4, "round-trip de 1A00");

  const cif = fs.readFileSync(path.join(__dirname, "fixtures/estrutura/1CRN.cif"), "utf8");
  const crnLido = StructureModel.ler(cif);
  assert(crnLido.ok, "1CRN local lê");
  const crn = AnalysisSnapshot.montarDeWorkspace({
    pdbId: "1CRN", nome: "1CRN.cif", estrutura: crnLido.estrutura, qualidade: null, pockets: null,
  }, { agora: "2026-11-06T15:01:00.000Z" });
  assert(AnalysisSnapshot.nomeArquivo(crn) === "1CRN-analise.json", "nome da crambina");
  assert(crn.preparo.estado === "bloqueado", "ficha de preparo continua bloqueada no mmCIF");
  assert(crn.cadeias.length === 1 && crn.cadeias[0].residuos.length === 46, "crambina: 46 resíduos modelados");
  const cmp = AnalysisSnapshot.comparar([snap, crn], Object.assign(pesos({ cobertura: 1 }), { regiao: "A:1-10", regiaoEssencial: true }));
  assert(!cmp.ranqueado, "1A00 e 1CRN não viram o mesmo sítio na região essencial");
  assert(/acesso|nome|não é comparável|mesmo sítio|cadeia/i.test(cmp.motivo + " " + (cmp.numeracao && cmp.numeracao.motivo)), "a limitação de numeração é dita: " + cmp.motivo);
  const livre = AnalysisSnapshot.comparar([snap, crn], Object.assign(pesos({ componente: 1 }), { componente: "HEM" }));
  assert(livre.ranqueado && livre.lideres[0].id === snap.id, "sem região, HEM observado separa 1A00 da crambina");
  assert(porId(livre, crn.id).subscores.find((s) => s.id === "componente").subpontuacao === 0, "1CRN não ganha HEM implícito");
}

function teste4HHBLocal() {
  const arquivo = path.join(__dirname, "fixtures/analises/4HHB-analise.json");
  const snap = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  const lido = AnalysisSnapshot.validarTexto(fs.readFileSync(arquivo, "utf8"));
  assert(lido.ok, "snapshot local de 4HHB é válido: " + lido.erro);
  assert(snap.rotulo === "4HHB" && snap.origem.pdbId === "4HHB" && snap.origem.sintetico === false, "4HHB público, não sintético");
  assert(snap.componentes.hetero.some((h) => h.codigo === "HEM"), "4HHB traz HEM observado");
  assert(snap.cadeias.map((c) => c.id).join("") === "ABCD", "4HHB tem cadeias A–D");
  const pdb = fs.readFileSync(path.join(__dirname, "../pdbproteins/pdb1a00.pdb"), "utf8");
  const a00 = AnalysisSnapshot.montarDeWorkspace({
    pdbId: "1A00", nome: "pdb1a00.pdb", estrutura: StructureModel.ler(pdb).estrutura, qualidade: null, pockets: null,
  }, { agora: "2026-11-06T16:00:01.000Z" });
  const alfa = AnalysisSnapshot.comparar([a00, snap], Object.assign(pesos({ cobertura: 1, componente: 1 }), { componente: "HEM", regiao: "A:1-20" }));
  assert(alfa.ranqueado && alfa.numeracao.comparavel, "cadeia A 1–20 de 1A00 e 4HHB é comparável no número author e no acesso declarado");
  assert(alfa.empateNoTopo, "nessa faixa os dois estão completos e têm HEM");
  const beta = AnalysisSnapshot.comparar([a00, snap], Object.assign(pesos({ cobertura: 1 }), { regiao: "B:30-40", regiaoEssencial: true }));
  assert(!beta.ranqueado, "a faixa B:30-40 não vira ranking: o resíduo 37 não tem o mesmo nome");
  assert(/mesmo nome/.test(beta.numeracao.motivo), "o motivo cita o nome divergente: " + beta.numeracao.motivo);
}

function colunasTabela(linha) {
  let n = 0;
  for (let i = 0; i < linha.length; i++) {
    if (linha[i] === "|" && linha[i - 1] !== "\\") n += 1;
  }
  return n;
}

function testeMarkdownHostil() {
  const hostil = "HEM | coluna\n\n## Seção injetada\n`codigo`";
  const a = base({
    id: "SIN-HOSTIL",
    rotulo: hostil,
    origem: Object.assign({}, base().origem, { fonte: hostil, nomeArquivo: "hostil.json" }),
  });
  const b = base({ id: "SIN-B2", rotulo: "SIN-B2" });
  const comparado = AnalysisSnapshot.comparar([a, b], Object.assign(pesos({ cobertura: 1, pocket: 1 }), {
    componente: "HEM | x\n\n## Comp injetado",
  }));
  assert(comparado.ranqueado, "snapshot hostil ainda compara: " + comparado.motivo);
  const pocket = porId(comparado, "SIN-HOSTIL").subscores.find((s) => s.id === "pocket");
  assert(pocket && pocket.estado === "indisponivel" && pocket.subpontuacao == null, "peso de pocket sem drugScore fica indisponível");
  const com = AnalysisSnapshot.comEscolha(comparado, {
    id: "SIN-B2",
    justificativa: "prefiro esta\n\n## Decisão falsa\n| esta | coluna `aberta`",
  });
  assert(com.ok, "justificativa hostil é aceita: " + (com.erro || ""));
  const md = AnalysisSnapshot.relatorioMarkdown(com.resultado);
  const linhas = md.split("\n");
  const tabela = linhas.filter((l) => l.startsWith("|"));
  const esperadas = colunasTabela(tabela[0]);
  assert(esperadas === 6, "cabeçalho tem 5 colunas");
  for (const linha of tabela) {
    assert(colunasTabela(linha) === esperadas, "linha da tabela não ganha coluna: " + linha);
  }
  assert(!linhas.some((l) => /^#{1,6}\s+(Seção injetada|Decisão falsa|Comp injetado)\b/.test(l)), "texto importado não abre seção: " + linhas.filter((l) => /^#/.test(l)).join(" || "));
  assert(!linhas.some((l) => /^```/.test(l) || /^\| esta \|/.test(l)), "não abre cerca nem linha de tabela solta");
  assert(md.includes("Seção injetada") && md.includes("Decisão falsa") && md.includes("codigo"), "o conteúdo hostil continua legível");
  assert(md.includes("\\|"), "a barra vertical do rótulo permanece escapada");
  const soPocket = AnalysisSnapshot.comparar(
    [base({ id: "SIN-P1", rotulo: "SIN-P1" }), base({ id: "SIN-P2", rotulo: "SIN-P2" })],
    pesos({ pocket: 1 })
  );
  assert(!soPocket.ranqueado, "só pocket, sem drugScore, não ranqueia");
  const sub = porId(soPocket, "SIN-P1").subscores.find((s) => s.id === "pocket");
  assert(sub && sub.estado === "indisponivel" && sub.subpontuacao == null, "ausência de drugScore não vira zero");
}

function testeRelatorio() {
  const trio = [completo(), lacuna(), apo()];
  const r = AnalysisSnapshot.comparar(trio, Object.assign(pesos({ pocket: 5, qualidade: 1 }), { componente: "HEM", componenteEliminatorio: true }));
  const sem = AnalysisSnapshot.comEscolha(r, { id: "SIN-COMPLETO", justificativa: "ok" });
  assert(!sem.ok, "escolher quem não lidera exige justificativa de verdade");
  const com = AnalysisSnapshot.comEscolha(r, { id: "SIN-COMPLETO", justificativa: "O drugScore alto não responde a esta pergunta." });
  assert(com.ok && com.resultado.escolha.diferenteDoLider, "a escolha diferente fica registrada");
  const md = AnalysisSnapshot.relatorioMarkdown(com.resultado);
  assert(md.includes("peki-comparacao-1") && md.includes("peki-analise-1") && md.includes("peki-fold-web"), "relatório cita schema e app");
  assert(md.includes("SIN-LACUNA") && md.includes(r.lideres[0].rotulo), "relatório e ranking citam o mesmo líder");
  assert(md.includes("pocket 5") && md.includes("HEM") && md.includes("eliminatório") || md.includes("Eliminatório"), "relatório traz pesos e o requisito");
  assert(/desclassificado|Eliminado/.test(md) && md.includes("SIN-APO"), "rejeição aparece no relatório");
  assert(md.includes("O drugScore alto não responde"), "justificativa entra no Markdown");
  assert(/não é verdade biológica|Não é verdade biológica/.test(md), "limitação do ranking está no relatório");
  assert(/sítio funcional/.test(md), "o relatório diz que drugScore não identifica sítio funcional");
  const json = JSON.parse(AnalysisSnapshot.relatorioJson(com.resultado));
  assert(json.lideres[0].id === r.lideres[0].id && json.escolha.id === "SIN-COMPLETO", "JSON estruturado segue a mesma comparação");
  assert(json.insights.every((item) => item.evidencia && item.estruturas.length), "cada achado aponta evidência e estruturas");
}

function main() {
  testeValidacao();
  testeContagem();
  testeRanking();
  testeEmpateERegiao();
  testeReais();
  teste4HHBLocal();
  testeMarkdownHostil();
  testeRelatorio();
  if (falhas) {
    console.error(falhas + " falha(s), " + ok + " ok");
    process.exit(1);
  }
  console.log(ok + " asserções ok");
}

main();
