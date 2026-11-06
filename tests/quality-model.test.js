// Qualidade wwPDB e anotação de componentes.
// As respostas em tests/fixtures/qualidade/ estão descritas em ORIGEM.txt.
"use strict";

const fs = require("fs");
const path = require("path");
const QualityModel = require("../docs/quality-model.js");
const StructureModel = require("../docs/structure-model.js");
global.QualityModel = QualityModel;
const QualityUI = require("../docs/quality-ui.js");

const dir = path.join(__dirname, "fixtures", "qualidade");
const ler = (nome) => fs.readFileSync(path.join(dir, nome), "utf8");

let falhas = 0;
let ok = 0;
function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}

function metrica(rel, id) {
  return QualityModel.metricaPorId(rel, id);
}

function respostaHttp(status, body) {
  const texto = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get() { return null; } },
    async text() { return texto; },
    async json() { return typeof body === "string" ? JSON.parse(body) : body; },
  };
}

function atomo(o) {
  const rec = (o.rec || "ATOM  ").padEnd(6, " ").slice(0, 6);
  const alt = o.altloc || " ";
  const nome = (o.nome || " CA ").padEnd(4, " ").slice(0, 4);
  const res = (o.res || "ALA").padEnd(3, " ").slice(0, 3);
  const seq = String(o.seq == null ? 1 : o.seq).padStart(4, " ");
  const x = (o.x == null ? 1 : o.x).toFixed(3).padStart(8, " ");
  return (
    rec + "    1 " + nome + alt + res + " A" + seq + "    " + x + "   2.000   3.000  1.00 20.00           C"
  );
}

function testeClasses() {
  assert(QualityModel.classificarMetodo("X-RAY DIFFRACTION") === "xray", "raio X");
  assert(QualityModel.classificarMetodo("SOLUTION NMR") === "nmr", "NMR");
  assert(QualityModel.classificarMetodo("ELECTRON MICROSCOPY") === "em", "EM");
  assert(QualityModel.classificarMetodo("THEORETICAL MODEL") === "modelo", "modelo");
  const eff = QualityModel.classeEfetiva("nmr", "xray");
  assert(eff.classe === "nmr" && eff.conflito, "NMR no arquivo bloqueia classe cristalográfica");
}

function testeXml1CRN() {
  const cif = fs.readFileSync(path.join(__dirname, "fixtures", "estrutura", "1CRN.cif"), "utf8");
  const lido = StructureModel.ler(cif);
  const rel = QualityModel.lerXml(ler("1CRN_validation.xml"), {
    id: "1CRN",
    metodoArquivo: lido.estrutura.identidade.metodo,
    contexto: {
      modeloSelecionado: lido.estrutura.modelo.selecionado,
      residuos: lido.estrutura.residuos,
      lacunas: { naoResolvidos: [{ cadeiaAuth: "A", authSeq: 99, resname: "GLY" }] },
    },
  });
  assert(rel.estado === "ok" && rel.schema === "peki-qualidade-1", "1CRN XML ok");
  assert(rel.fonte.pdbid === "1CRN" && /pdbe/.test(rel.fonte.url), "fonte PDBe e ID");
  assert(metrica(rel, "resolucao").valor === 1.5, "resolução 1.5");
  assert(metrica(rel, "rwork") == null && metrica(rel, "rfree") == null, "R e Rfree ausentes não viram métrica");
  assert(rel.omitidos.some((o) => o.id === "rwork" && /NotAvailable/.test(o.motivo)), "Rwork citado como NotAvailable");
  assert(metrica(rel, "clashscore").valor === 0 && metrica(rel, "clashscore").texto === "0.00", "clashscore zero é o valor do relatório");
  assert(metrica(rel, "rama").valor === 0 && metrica(rel, "rotamer").valor === 0, "rama e rotâmero presentes");
  assert(metrica(rel, "qscore") == null && metrica(rel, "medoid") == null, "métrica de EM/NMR não entra em raio X sem fonte");
  const gly = rel.local.itens.find((it) => it.chain === "A" && it.resnum === 37 && it.resname === "GLY");
  assert(gly && gly.mapeamento === "modelo" && gly.bondOutliers >= 1, "GLY A 37 tem bond-outlier e mapeia no modelo");
  const ile = rel.local.itens.find((it) => it.resnum === 7 && it.resname === "ILE");
  assert(ile && ile.angleOutliers >= 1 && ile.mapeamento === "modelo", "ILE 7 tem angle-outlier");
  assert(!rel.local.itens.some((it) => it.resnum === 99 && it.mapeamento === "modelo"), "lacuna inventada não ganha indicador");
  assert(rel.local.porCadeia.A.lacunasSemCoordenada === 1, "a lacuna entra na cobertura");
  assert(rel.local.porCadeia.A.comIndicador === 46 && rel.local.porCadeia.A.residuosComCoordenadas === 46, "46 posições author com coordenada e 46 indicadores: " + JSON.stringify(rel.local.porCadeia.A));
  const modelo = new Set(lido.estrutura.residuos.filter((r) => r.temCoordenadas && r.seqFonte === "auth").map((r) => r.authChain + ":" + r.seq + ":" + r.resname));
  const relatorio = new Set(rel.local.itens.filter((it) => it.mapeamento === "modelo").map((it) => it.chain + ":" + it.resnum + ":" + it.resname));
  assert(modelo.size === 46 && relatorio.size === 46, "o conjunto tem 46 identidades, não só a contagem");
  for (const id of modelo) assert(relatorio.has(id), "posição modelada sem o mesmo nome no relatório: " + id);
  assert(rel.local.itens.every((it) => it.said == null || it.chain === "A"), "said label não troca a cadeia author da crambina");
  const texto = QualityModel.textoDossie({ relatorio: rel });
  assert(texto.includes("peki-qualidade-1") && texto.includes(rel.fonte.url), "export traz contrato e URL");
  assert(!/Rwork citado pelo relatório \(refinamento depositado\):/.test(texto), "export não publica Rwork numérico");
  assert(/não garantem a qualidade local/.test(texto), "aviso de sítio no texto");
}

function testeMetodos() {
  const x = QualityModel.lerXml(ler("1A00_excerpt.xml"), { id: "1A00", metodoArquivo: "X-RAY DIFFRACTION" });
  assert(x.estado === "ok", "1A00 " + x.mensagem);
  assert(metrica(x, "rwork").valor === 0.169 && metrica(x, "rfree").valor === 0.223, "Rwork/Rfree do relatório");
  assert(metrica(x, "eds_r").valor === 0.5267 && metrica(x, "dcc_r").valor === 0.5314, "ajuste EDS e DCC");
  assert(metrica(x, "reflexoes_livres").valor === 0, "zero de reflexões livres é valor escrito");
  assert(metrica(x, "dcc_rfree") == null, "DCC_Rfree NotAvailable não vira zero");
  assert(x.omitidos.some((o) => o.id === "dcc_rfree"), "DCC_Rfree fica na lista de ausentes");
  assert(x.avisos.some((a) => /EDS/.test(a)), "aviso do EDS preservado");

  const n = QualityModel.lerXml(ler("1A0N_excerpt.xml"), {
    id: "1A0N",
    metodoArquivo: "SOLUTION NMR",
    contexto: {
      modeloSelecionado: 1,
      residuos: [
        { chain: "A", seq: 91, icode: "", resname: "PRO", altlocs: [], temCoordenadas: true, labelChain: "A", labelSeq: 91 },
        { chain: "A", seq: 1, icode: "", resname: "ALA", altlocs: [], temCoordenadas: true, labelChain: "A", labelSeq: 1 },
      ],
      lacunas: { naoResolvidos: [] },
    },
  });
  assert(n.metodo.classe === "nmr", "1A0N é NMR");
  assert(metrica(n, "rwork") == null && metrica(n, "rfree") == null && metrica(n, "resolucao") == null, "NMR não mostra R nem resolução cristalográfica");
  assert(metrica(n, "clashscore").valor === 36.51 && metrica(n, "medoid").valor === 5, "geometria e medóide do NMR");
  const pro = n.local.itens.filter((it) => it.resname === "PRO" && it.mapeamento === "modelo");
  assert(pro.length === 1 && pro[0].model === 1 && pro[0].resnum === 91, "só o modelo 1 e o resnum author 91: " + JSON.stringify(pro));
  assert(!n.local.itens.some((it) => it.resname === "ALA" && it.mapeamento === "modelo"), "seq label 1 não rouba o indicador do ALA 1");
  assert(n.local.subgruposOutroModelo === 1, "modelo 2 fica de fora");

  const em = QualityModel.lerXml(ler("3DWU_excerpt.xml"), { id: "3DWU", metodoArquivo: "ELECTRON MICROSCOPY" });
  assert(em.metodo.classe === "em", "3DWU é EM");
  assert(metrica(em, "rwork") == null && metrica(em, "rfree") == null, "EM não mostra R");
  assert(metrica(em, "resolucao_reconstrucao").valor === 12.6 && metrica(em, "resolucao_emdb").valor === 12.6, "duas resoluções de EM, com rótulos próprios");
  assert(!/cristalogr[aá]fica/.test(metrica(em, "resolucao_reconstrucao").rotulo), "resolução de EM não é chamada de cristalográfica");
  assert(metrica(em, "qscore").valor === -0.024, "Q-score negativo permanece");
  assert(metrica(em, "clashscore").valor === 0, "clashscore 0 do EM é o valor escrito");
}

function testeMapeamentoSintetico() {
  const xml = `<?xml version="1.0"?>
<wwPDB-validation-information>
<Entry pdbid="9ZZZ" percentilebins="all,xray" PDB-resolution="NotAvailable" PDB-R="NotAvailable" PDB-Rfree="NotAvailable" clashscore="1.00"/>
<ModelledSubgroup model="1" chain="A" resnum="7" icode="A" resname="SER" altcode="B" said="A" rama="OUTLIER"/>
<ModelledSubgroup model="1" chain="A" resnum="7" icode=" " resname="SER" altcode="A" rama="Favored"/>
<ModelledSubgroup model="1" chain="B" resnum="7" icode=" " resname="SER" altcode=" " rama="Favored"/>
<ModelledSubgroup model="1" resnum="8" resname="ALA" altcode=" "/>
<ModelledSubgroup model="2" chain="A" resnum="7" icode="A" resname="SER" altcode="B" rama="Allowed"/>
</wwPDB-validation-information>`;
  const rel = QualityModel.lerXml(xml, {
    id: "9ZZZ",
    metodoArquivo: "X-RAY DIFFRACTION",
    contexto: {
      modeloSelecionado: 1,
      residuos: [
        { chain: "A", seq: 7, icode: "A", resname: "SER", altlocs: ["B"], temCoordenadas: true, labelChain: "AA" },
        { chain: "A", seq: 7, icode: "", resname: "SER", altlocs: ["A"], temCoordenadas: true, labelChain: "A" },
      ],
      lacunas: { naoResolvidos: [{ cadeiaAuth: "A", authSeq: 8, resname: "GLY" }] },
    },
  });
  const ins = rel.local.itens.find((it) => it.icode === "A" && it.model === 1);
  assert(ins && ins.mapeamento === "modelo" && ins.labelDivergente && ins.outlier, "inserção 7A e altLoc B mapeiam; said ausente não impede");
  const semIns = rel.local.itens.find((it) => it.chain === "A" && it.resnum === 7 && it.icode === "" && it.altcode === "A");
  assert(semIns && semIns.mapeamento === "modelo" && !semIns.outlier, "7 sem inserção não herda o outlier da inserção");
  const cadeiaB = rel.local.itens.find((it) => it.chain === "B");
  assert(cadeiaB && cadeiaB.mapeamento === "sem_residuo", "cadeia B não é colada na cadeia A");
  assert(rel.local.campoAusente === 1, "subgrupo sem chain não é associado");
  assert(rel.local.subgruposOutroModelo === 1, "modelo 2 sintético ignorado");
  assert(rel.local.porCadeia.A.lacunasSemCoordenada === 1, "GLY 8 sem coordenada só entra na cobertura");
  const divergente = QualityModel.lerXml(xml, { id: "1CRN" });
  assert(divergente.estado === "erro" && divergente.codigo === "id_divergente" && divergente.metricas.length === 0, "XML de outro ID é descartado");
}

function testeJsonEErros() {
  const cache = QualityModel.criarCache();
  const crn = QualityModel.lerResumoRcsb(JSON.parse(ler("rcsb_1CRN_entry.json")), { id: "1CRN", metodoArquivo: "X-RAY DIFFRACTION" });
  assert(crn.consulta === "rcsb-json" && crn.local.estado === "pendente", "JSON não finge painel local");
  assert(metrica(crn, "clashscore").valor === 0 && metrica(crn, "rwork") == null, "JSON da 1CRN tem clashscore e não tem R");
  assert(cache.gravarRelatorio("1A00", crn) === false, "não grava relatório 1CRN na chave 1A00");
  assert(cache.gravarRelatorio("1CRN", crn) === true, "grava na própria chave");
  assert(cache.lerRelatorio("1A00") == null && cache.lerRelatorio("1CRN").id === "1CRN", "leitura não vaza entre IDs");

  const nmr = QualityModel.lerResumoRcsb(JSON.parse(ler("rcsb_1A0N_entry.json")), { id: "1A0N" });
  assert(nmr.metodo.classe === "nmr" && metrica(nmr, "rwork") == null && metrica(nmr, "nmr_modelos").valor === 25, "JSON NMR sem R e com 25 modelos");
  const em = QualityModel.lerResumoRcsb(JSON.parse(ler("rcsb_3DWU_entry.json")), { id: "3DWU" });
  assert(em.metodo.classe === "em" && metrica(em, "qscore").valor === -0.024 && metrica(em, "rwork") == null, "JSON EM");

  const xml1 = ler("1CRN_validation.xml");
  const json1a = JSON.parse(ler("rcsb_1A00_entry.json"));
  const cacheHttp = QualityModel.criarCache();
  const pedidos = [];
  function fetchRoteado(mapa) {
    return async (url) => {
      pedidos.push(url);
      if (Object.prototype.hasOwnProperty.call(mapa, url)) return mapa[url];
      const err = new TypeError("Failed to fetch");
      throw err;
    };
  }
  return Promise.resolve().then(async () => {
    pedidos.length = 0;
    const bom = await QualityModel.consultarRelatorio("1crn", {
      fetch: fetchRoteado({ "https://www.ebi.ac.uk/pdbe/entry-files/download/1crn_validation.xml": respostaHttp(200, xml1) }),
      cache: cacheHttp,
      metodoArquivo: "X-RAY DIFFRACTION",
    });
    assert(bom.estado === "ok" && bom.id === "1CRN", "consulta usa o XML quando ele responde");
    assert(!pedidos.some((u) => u.includes("validation_reports")), "não baixa o gzip sem CORS");
    const antes = pedidos.length;
    const deNovo = await QualityModel.consultarRelatorio("1CRN", {
      fetch: fetchRoteado({}),
      cache: cacheHttp,
      metodoArquivo: "X-RAY DIFFRACTION",
    });
    assert(deNovo.id === "1CRN" && pedidos.length === antes, "cache da 1CRN não dispara outra rede");
    pedidos.length = 0;
    const outra = await QualityModel.consultarRelatorio("1A00", {
      fetch: fetchRoteado({
        "https://www.ebi.ac.uk/pdbe/entry-files/download/1a00_validation.xml": respostaHttp(404, ""),
        "https://data.rcsb.org/rest/v1/core/entry/1A00": respostaHttp(200, json1a),
      }),
      cache: cacheHttp,
      metodoArquivo: "X-RAY DIFFRACTION",
    });
    assert(outra.estado === "ok" && outra.consulta === "rcsb-json" && outra.id === "1A00", "404 do XML cai no JSON do próprio ID");
    assert(metrica(outra, "rwork").valor === 0.169, "Rwork do JSON de 1A00");
    assert(cacheHttp.lerRelatorio("1CRN").id === "1CRN" && cacheHttp.lerRelatorio("1A00").id === "1A00", "os dois IDs continuam separados");

    const so404 = await QualityModel.consultarRelatorio("4HHB", {
      fetch: async () => respostaHttp(404, ""),
      cache: QualityModel.criarCache(),
    });
    assert(so404.codigo === "404" && so404.metricas.length === 0, "404 não cria métrica");

    const limite = await QualityModel.consultarRelatorio("1ABC", {
      fetch: async () => respostaHttp(429, ""),
      cache: QualityModel.criarCache(),
    });
    assert(limite.codigo === "429" && limite.metricas.length === 0, "429 não cria métrica");

    const rede = await QualityModel.consultarRelatorio("1XYZ", {
      fetch: async () => { throw new TypeError("Failed to fetch"); },
      cache: QualityModel.criarCache(),
    });
    assert(rede.estado === "rede" && rede.metricas.length === 0 && rede.links.pdf, "CORS/rede não zera e mantém o link do PDF");

    const ctrl = new AbortController();
    ctrl.abort();
    let chamadasCanceladas = 0;
    const abortado = await QualityModel.consultarRelatorio("1CRN", {
      fetch: async () => { chamadasCanceladas += 1; const e = new Error("abort"); e.name = "AbortError"; throw e; },
      cache: QualityModel.criarCache(),
      forcar: true,
      signal: ctrl.signal,
    });
    assert(abortado.codigo === "cancelado" && abortado.metricas.length === 0 && chamadasCanceladas === 0, "sinal já cancelado não consulta e não zera");
    const pedidosTimeout = [];
    const aposTimeout = await QualityModel.consultarRelatorio("1CRN", {
      fetch: async (url) => {
        pedidosTimeout.push(url);
        if (url.includes("validation.xml")) { const e = new Error("timeout"); e.name = "AbortError"; throw e; }
        return respostaHttp(200, JSON.parse(ler("rcsb_1CRN_entry.json")));
      },
      cache: QualityModel.criarCache(),
      forcar: true,
      metodoArquivo: "X-RAY DIFFRACTION",
    });
    assert(aposTimeout.consulta === "rcsb-json" && metrica(aposTimeout, "rwork") == null && metrica(aposTimeout, "clashscore").valor === 0, "timeout do XML cai no JSON e não inventa Rwork");
    assert(pedidosTimeout.some((u) => u.includes("data.rcsb.org")), "o fallback JSON foi chamado");

    const grande = await QualityModel.consultarRelatorio("1CRN", {
      fetch: async () => respostaHttp(200, xml1),
      cache: QualityModel.criarCache(),
      forcar: true,
      limite: 80,
      metodoArquivo: "X-RAY DIFFRACTION",
    });
    assert(grande.estado === "parcial" && grande.local.estado === "pendente" && metrica(grande, "resolucao").valor === 1.5, "XML acima do limite guarda o global e deixa o local pendente");

    const semId = await QualityModel.consultarRelatorio("", { fetch: async () => { throw new Error("não devia consultar"); } });
    assert(semId.estado === "nao_aplica" && semId.metricas.length === 0, "upload sem ID não consulta");
  });
}

function testeComponentes() {
  const texto = [
    "HEADER    TEST                                    01-JAN-00   9ZZZ",
    "MODEL        1",
    atomo({ rec: "ATOM  ", res: "ALA", seq: 1 }),
    atomo({ rec: "HETATM", res: "MSE", seq: 2, nome: " CA " }),
    atomo({ rec: "HETATM", res: "GOL", seq: 3, nome: " C1 " }),
    atomo({ rec: "HETATM", res: "ZN ", seq: 4, nome: "ZN  " }),
    atomo({ rec: "HETATM", res: "HOH", seq: 5, nome: " O  " }),
    atomo({ rec: "HETATM", res: "HEM", seq: 6, nome: "FE  ", altloc: "A", x: 1 }),
    atomo({ rec: "HETATM", res: "HEM", seq: 6, nome: "FE  ", altloc: "B", x: 2 }),
    "ENDMDL",
    "MODEL        2",
    atomo({ rec: "HETATM", res: "HOH", seq: 9, nome: " O  " }),
    "ENDMDL",
  ].join("\n");
  const lido = StructureModel.ler(texto);
  assert(lido.ok, "PDB de componentes lê");
  assert(lido.estrutura.modelo.total === 2 && lido.estrutura.componentes.aguas.instancias === 1, "água do modelo 2 não entra");
  const hem = lido.estrutura.componentes.hetero.find((h) => h.codigo === "HEM");
  assert(hem && hem.instancias === 1, "altLoc do HEM conta uma instância");
  assert(!lido.estrutura.componentes.hetero.some((h) => h.codigo === "MSE"), "MSE não é HET livre");
  const codigos = QualityModel.codigosParaConsulta(lido.estrutura).map((c) => c.codigo + ":" + c.grupo);
  assert(codigos.includes("MSE:modificado") && codigos.includes("ZN:ion") && codigos.includes("HOH:agua"), "grupos de MSE, ZN e água: " + codigos.join(","));
  assert(codigos.includes("GOL:hetero") && codigos.includes("HEM:hetero"), "GOL e HEM ficam não classificados como papel");
  assert(!codigos.some((c) => c.startsWith("ALA")), "aminoácido padrão não vai ao CCD");

  const gol = QualityModel.anotarChemCompRcsb(JSON.parse(ler("chemcomp_GOL.json")), "GOL");
  const mse = QualityModel.anotarChemCompRcsb(JSON.parse(ler("chemcomp_MSE.json")), "MSE");
  const zn = QualityModel.anotarChemCompRcsb(JSON.parse(ler("chemcomp_ZN.json")), "ZN");
  const hoh = QualityModel.anotarChemCompRcsb(JSON.parse(ler("chemcomp_HOH.json")), "HOH");
  const hemAnn = QualityModel.anotarChemCompRcsb(JSON.parse(ler("chemcomp_HEM.json")), "HEM");
  assert(gol.estado === "ok" && gol.formula === "C3 H8 O3" && gol.massa === 92.094 && gol.papelBiologico == null, "GOL tem fórmula e não tem papel");
  assert(gol.links.filter((l) => /chebi/i.test(l.url)).length === 2, "os dois ChEBI devolvidos viram link");
  assert(mse.tipo === "L-peptide linking" && mse.nome === "SELENOMETHIONINE", "MSE é aminoácido de ligação no CCD");
  assert(zn.nome === "ZINC ION" && hoh.nome === "WATER" && hemAnn.formula === "C34 H32 Fe N4 O4", "ZN, água e HEM");
  assert(QualityModel.anotarChemCompRcsb(JSON.parse(ler("chemcomp_HEM.json")), "GOL").estado === "erro", "ficha HEM não serve para GOL");

  const painel = QualityModel.montarPainelComponentes(lido.estrutura, [gol, mse, zn, hoh, hemAnn]);
  assert(/aditivo/.test(painel.grupos.hetero.find((f) => f.codigo === "GOL").hipotese), "glicerol não é tratado como prova de aditivo");
  assert(/ligante livre/i.test(painel.grupos.modificado[0].hipotese), "MSE continua modificação de cadeia");
  assert(painel.grupos.hetero.find((f) => f.codigo === "HEM").posicoes[0].altlocs.join("") === "AB", "a posição do HEM guarda os dois altLoc");
  assert(painel.holo.estado === "nao_determinado", "holo segue indeterminado");
  const dossie = QualityModel.textoDossie({ relatorio: null, componentes: painel });
  assert(dossie.includes("C3 H8 O3") && dossie.includes("peki-qualidade-1") && /aditivo/.test(dossie), "export dos componentes cita fórmula e o limite do glicerol");
}

function testeAdversarial() {
  const xmlNs = `<?xml version="1.0"?>
<vrpt:wwPDB-validation-information>
<vrpt:Entry vrpt:pdbid="9ZZZ" vrpt:percentilebins="all,xray" vrpt:PDB-resolution="Not Available" vrpt:PDB-R="NotAvailable" vrpt:clashscore="2.5"/>
<vrpt:ModelledSubgroup vrpt:model="1" vrpt:chain="A" vrpt:resnum="4" vrpt:icode=" " vrpt:resname="ALA" vrpt:altcode=" " vrpt:rama="Favored">
  <vrpt:angle-outlier atom0="N" atom1="CA" atom2="C"/>
</vrpt:ModelledSubgroup>
</vrpt:wwPDB-validation-information>`;
  const ns = QualityModel.lerXml(xmlNs, {
    id: "9ZZZ",
    metodoArquivo: "X-RAY DIFFRACTION",
    contexto: {
      modeloSelecionado: 1,
      residuos: [{ chain: "A", authChain: "A", seq: 4, seqFonte: "auth", icode: "", resname: "ALA", altlocs: [], temCoordenadas: true }],
      lacunas: { naoResolvidos: [] },
    },
  });
  assert(ns.estado === "ok" && metrica(ns, "resolucao") == null && metrica(ns, "rwork") == null, "prefixo de namespace não transforma NotAvailable em zero");
  assert(metrica(ns, "clashscore").valor === 2.5, "clashscore prefixado continua número");
  assert(ns.local.itens[0].mapeamento === "modelo" && ns.local.itens[0].angleOutliers === 1, "subgrupo prefixado mapeia e conta o outlier filho");

  const cruzado = QualityModel.lerXml(`<Entry pdbid="1A00" percentilebins="all,2.0,xray" PDB-R="NotAvailable" PDB-Rfree="NotAvailable" PDB-resolution="2.00"/>
<ModelledSubgroup model="1" chain="A" resnum="10" resname="VAL" icode=" " altcode=" " said="A" ent="1" seq="10" rama="Favored"/>
<ModelledSubgroup model="1" chain="B" resnum="10" resname="ALA" icode=" " altcode=" " said="B" ent="2" seq="10" rama="Favored"/>
<ModelledSubgroup model="1" chain="A" resnum="142" resname="HEM" icode=" " altcode=" " said="E" ent="3" seq="."/>
<ModelledSubgroup model="1" chain="A" resnum="12" resname="MET" icode=" " altcode=" " said="A" ent="1" seq="12"/>`, {
    id: "1A00",
    metodoArquivo: "X-RAY DIFFRACTION",
    contexto: {
      modeloSelecionado: 1,
      residuos: [
        { chain: "A", authChain: "A", seq: 10, seqFonte: "auth", icode: "", resname: "VAL", altlocs: [], temCoordenadas: true, labelChain: "A" },
        { chain: "B", authChain: "B", seq: 10, seqFonte: "auth", icode: "", resname: "ALA", altlocs: [], temCoordenadas: true, labelChain: "B" },
        { chain: "A", authChain: "A", seq: 142, seqFonte: "auth", icode: "", resname: "HEM", altlocs: [], temCoordenadas: true, labelChain: null },
        { chain: "A", authChain: "A", seq: 12, seqFonte: "auth", icode: "", resname: "MSE", altlocs: [], temCoordenadas: true, labelChain: "A" },
        { chain: "A", authChain: null, seq: 10, seqFonte: "label", icode: "", resname: "TRP", altlocs: [], temCoordenadas: true, labelChain: "E" },
      ],
      lacunas: { naoResolvidos: [] },
    },
  });
  const a10 = cruzado.local.itens.find((it) => it.chain === "A" && it.resnum === 10);
  const b10 = cruzado.local.itens.find((it) => it.chain === "B" && it.resnum === 10);
  const hem = cruzado.local.itens.find((it) => it.resname === "HEM");
  const met = cruzado.local.itens.find((it) => it.resnum === 12);
  assert(a10.mapeamento === "modelo" && a10.resname === "VAL", "VAL A 10 não recebe o ALA da cadeia B");
  assert(b10.mapeamento === "modelo" && b10.resname === "ALA", "ALA B 10 fica na entidade 2");
  assert(hem.mapeamento === "modelo" && hem.chain === "A" && hem.resnum === 142 && hem.seqLabel == null, "HEM usa auth 142; seq '.' não vira índice");
  assert(!cruzado.local.itens.some((it) => it.chain === "E"), "said E do HEM não cria cadeia E");
  assert(met.mapeamento === "resname_divergente", "MET do relatório não é colado no MSE do modelo");
  assert(cruzado.local.porCadeia.A.comIndicador === 2, "só VAL 10 e HEM 142 contam como indicador na cadeia A");
  assert(cruzado.local.semIdentidadeAuthor === 1, "resíduo só com número label fica fora das cadeias author");

  const pdb = require("fs").readFileSync(require("path").join(__dirname, "..", "pdbproteins", "pdb1a00.pdb"), "utf8");
  const real = StructureModel.ler(pdb);
  const relReal = QualityModel.lerXml(`<Entry pdbid="1A00" percentilebins="all,xray" PDB-resolution="2.00" PDB-R="0.1690" PDB-Rfree="0.2230"/>
<ModelledSubgroup model="1" chain="A" resnum="10" resname="VAL" icode=" " altcode=" " said="A" ent="1"/>
<ModelledSubgroup model="1" chain="B" resnum="10" resname="ALA" icode=" " altcode=" " said="B" ent="2"/>
<ModelledSubgroup model="1" chain="A" resnum="142" resname="HEM" icode=" " altcode=" " said="E" ent="3" seq="."/>`, {
    id: "1A00",
    metodoArquivo: real.estrutura.identidade.metodo,
    contexto: { modeloSelecionado: real.estrutura.modelo.selecionado, residuos: real.estrutura.residuos, lacunas: real.estrutura.lacunas },
  });
  const hemReal = relReal.local.itens.find((it) => it.resname === "HEM");
  const valReal = real.estrutura.residuos.find((r) => r.authChain === "A" && r.seq === 10);
  const alaReal = real.estrutura.residuos.find((r) => r.authChain === "B" && r.seq === 10);
  assert(valReal && valReal.resname === "VAL" && alaReal && alaReal.resname === "ALA", "1A00 real: A10 é VAL e B10 é ALA");
  assert(relReal.local.itens.find((it) => it.chain === "A" && it.resnum === 10).mapeamento === "modelo", "VAL A 10 do arquivo real recebe o subgrupo A 10");
  assert(relReal.local.itens.find((it) => it.chain === "B" && it.resnum === 10).mapeamento === "modelo", "ALA B 10 do arquivo real recebe o subgrupo B 10");
  assert(hemReal && hemReal.mapeamento === "modelo", "HEM A 142 do arquivo real mapeia, said E não desvia");
  assert(real.estrutura.componentes.hetero.find((h) => h.codigo === "HEM").instancias === 4, "quatro HEM no modelo, sem duplicar altLoc");

  const em = QualityModel.lerResumoRcsb({
    rcsb_entry_container_identifiers: { entry_id: "3DWU" },
    exptl: [{ method: "ELECTRON MICROSCOPY" }],
    rcsb_entry_info: { experimental_method: "EM", resolution_combined: [12.6] },
    pdbx_vrpt_summary_geometry: [{ clashscore: 0 }],
  }, { id: "3DWU" });
  const rotulo = metrica(em, "resolucao_reconstrucao").rotulo;
  assert(/resolution_combined/.test(rotulo) && /Não é o campo PDB-resolution do XML/.test(rotulo), "resolução combinada não é vendida como campo do XML: " + rotulo);
  assert(metrica(em, "rwork") == null && metrica(em, "clashscore").valor === 0, "EM do JSON continua sem R e com clashscore presente");

  assert(QualityUI.escapar('<img src=x onerror="alert(1)">') === "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;", "escape de HTML");
  const partes = {};
  const raiz = {
    _feito: false,
    map: { click: [], change: [] },
    addEventListener(tipo, fn) { this.map[tipo].push(fn); },
    removeEventListener(tipo, fn) { this.map[tipo] = this.map[tipo].filter((f) => f !== fn); },
    querySelector(sel) {
      if (sel === ".ql") return this._feito ? { ok: true } : null;
      return partes[sel] || null;
    },
    set innerHTML(v) {
      this._feito = true;
      partes["#ql-rel"] = { innerHTML: "" };
      partes["#ql-loc"] = { innerHTML: "" };
      partes["#ql-comp"] = { innerHTML: "" };
    },
  };
  QualityUI.definirParaTeste({
    raiz,
    compEstado: "ok",
    app: { pdbId: "1CRN", estrutura: { componentes: { proteinas: null, holo: { motivo: "HETATM não fecha holo." } }, residuos: [] } },
    relatorio: {
      estado: "ok",
      id: "1CRN",
      consulta: "xml",
      fonte: { nome: "wwPDB", url: "https://www.ebi.ac.uk/pdbe/entry-files/download/1crn_validation.xml", data: "2026-03-05" },
      metodo: { classe: "xray", conflito: false },
      metricas: [{ id: "clashscore", grupo: "geometria", rotulo: "Clashscore", texto: "0.00", unidade: null }],
      omitidos: [],
      naoAplicaveis: [],
      avisos: ['<script>alert("x")</script>'],
      avisoGlobal: "aviso",
      links: null,
      local: { estado: "pendente", motivo: "sem painel", itens: [] },
    },
  });
  assert(partes["#ql-rel"].innerHTML.includes("&lt;script&gt;") && !partes["#ql-rel"].innerHTML.includes("<script>"), "aviso do relatório não entra como HTML cru");
}

function testeOuvintes() {
  assert(QualityModel.respostaAtual({ geracao: 2, id: "1CRN" }, { geracao: 2, id: "1CRN" }), "mesma geração e mesmo ID");
  assert(!QualityModel.respostaAtual({ geracao: 2, id: "1CRN" }, { geracao: 3, id: "1CRN" }), "geração nova descarta resposta velha");
  assert(!QualityModel.respostaAtual({ geracao: 2, id: "1CRN" }, { geracao: 2, id: "1A00" }), "ID trocado descarta a resposta");
  function elemento() {
    const map = { click: [], change: [] };
    return {
      map,
      addEventListener(tipo, fn) { map[tipo].push(fn); },
      removeEventListener(tipo, fn) { map[tipo] = map[tipo].filter((f) => f !== fn); },
    };
  }
  const el = elemento();
  QualityUI.vincular(el);
  QualityUI.vincular(el);
  assert(el.map.click.length === 1 && el.map.change.length === 1, "revincular não acumula ouvintes");
  assert(QualityUI.contagemOuvintes(el) === 2, "contagem de click e change");
  QualityUI.desvincular();
  assert(el.map.click.length === 0 && el.map.change.length === 0, "desvincular remove os dois");
  QualityUI.invalidar();
  assert(!QualityUI.aindaVale({ geracao: -1, id: "" }), "geração antiga não segue valendo");
}

async function main() {
  testeClasses();
  testeXml1CRN();
  testeMetodos();
  testeMapeamentoSintetico();
  await testeJsonEErros();
  testeComponentes();
  testeAdversarial();
  testeOuvintes();
  console.log(ok + " asserções ok, " + falhas + " falhas");
  if (falhas) process.exit(1);
}

main();
