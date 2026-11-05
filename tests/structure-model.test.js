// Testes da leitura PDB/mmCIF e do diagnóstico de resíduos ausentes.
// Não medem afinidade e não inventam coordenada de resíduo ausente.
"use strict";

const fs = require("fs");
const path = require("path");
const StructureModel = require("../docs/structure-model.js");
const ProtAnalysis = require("../docs/pdb-analysis.js");

let falhas = 0;
let ok = 0;

function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}

function linha(campos) {
  const buf = Array(80).fill(" ");
  for (const [col, txt] of campos) {
    const s = String(txt);
    for (let i = 0; i < s.length && col - 1 + i < 80; i++) buf[col - 1 + i] = s[i];
  }
  return buf.join("");
}

function atomo(o) {
  const rec = (o.rec || "ATOM  ").padEnd(6, " ").slice(0, 6);
  const serial = String(o.serial == null ? 1 : o.serial).padStart(5, " ");
  const nome = (o.nome || " CA ").padEnd(4, " ").slice(0, 4);
  const alt = o.altloc || " ";
  const res = (o.res || "ALA").padEnd(3, " ").slice(0, 3);
  const chain = o.chain || "A";
  const seq = String(o.seq == null ? 1 : o.seq).padStart(4, " ");
  const ic = o.icode || " ";
  const x = (o.x == null ? 0 : o.x).toFixed(3).padStart(8, " ");
  const y = (o.y == null ? 0 : o.y).toFixed(3).padStart(8, " ");
  const z = (o.z == null ? 0 : o.z).toFixed(3).padStart(8, " ");
  return linha([
    [1, rec], [7, serial], [13, nome], [17, alt], [18, res], [22, chain],
    [23, seq], [27, ic], [31, x], [39, y], [47, z],
  ]);
}

function seqres(chain, nomes) {
  const linhas = [];
  for (let i = 0; i < nomes.length; i += 13) {
    const pedaco = nomes.slice(i, i + 13);
    let texto = "SEQRES";
    texto = linha([
      [1, "SEQRES"],
      [9, String(Math.floor(i / 13) + 1)],
      [12, chain],
      [14, String(nomes.length).padStart(4, " ")],
    ]);
    let col = 20;
    for (const nome of pedaco) {
      texto = texto.substring(0, col - 1) + nome.padEnd(3, " ").slice(0, 3) + texto.substring(col + 2);
      col += 4;
    }
    linhas.push(texto);
  }
  return linhas.join("\n");
}

function porNumero(lista, chain, seq, icode) {
  return lista.filter((r) => r.cadeiaAuth === chain && r.authSeq === seq && (r.icode || "") === (icode || ""));
}

function testeIdEEntrada() {
  assert(StructureModel.idClassico("1A00"), "1A00 é ID clássico");
  assert(StructureModel.idClassico("1a00"), "minúsculas entram na mesma regra");
  assert(!StructureModel.idClassico("ABCD"), "ID sem dígito inicial não entra");
  assert(!StructureModel.idClassico("1A00A"), "cinco caracteres não são ID clássico");
  assert(!StructureModel.idClassico("PDB_00001ABC"), "ID estendido não é aceito relaxando a regra");
  const pdb = atomo({ res: "ALA", seq: 1 }) + "\n";
  const cif = "data_X\n_atom_site.group_PDB\nATOM\n";
  const escolha = StructureModel.escolherEntrada(pdb, cif);
  assert(escolha && escolha.origem === "pdb", "PDB com coordenadas vence o mmCIF");
  const sem = StructureModel.escolherEntrada("ENTRY TOO LARGE", cif);
  assert(sem && sem.origem === "mmcif", "texto sem ATOM cai para o mmCIF");
  assert(StructureModel.escolherEntrada("oi", "tambem nao") == null, "nenhum formato devolve nulo");
  assert(!StructureModel.pareceCoordenadaPdb(cif), "mmCIF não é tratado como PDB");
}

function testePdbInsercaoAltLocModelo() {
  const texto = [
    "HEADER    TEST                                    01-JAN-00   0TST",
    atomo({ serial: 1, res: "ALA", seq: 10, x: 0 }),
    atomo({ serial: 2, res: "GLY", seq: 10, icode: "A", x: 1 }),
    atomo({ serial: 3, nome: " CB ", altloc: "A", res: "SER", seq: 11, x: 2 }),
    atomo({ serial: 4, nome: " CB ", altloc: "B", res: "SER", seq: 11, x: 3 }),
    "TER",
    "END",
  ].join("\n");
  const lido = StructureModel.ler(texto);
  assert(lido.ok, "PDB sintético lê");
  const seq = lido.analise.sequencias.A;
  assert(seq === "AGS", "inserção 10A entra na sequência: " + seq);
  assert(lido.analise.estatisticas.cadeias[0].residuos === 3, "três números distintos");
  assert(lido.analise.estatisticas.cadeias[0].atomos === 4, "altLoc conta as duas linhas ATOM");
  const ser = lido.estrutura.cadeias.find((c) => c.id === "A");
  assert(ser.posicoesPolimero === 3, "Overview não duplica SER por altLoc");
  assert(ser.posicoesComAltLoc === 1, "uma posição com altLoc");

  const multi = [
    "MODEL        1",
    atomo({ res: "ALA", seq: 1, x: 0 }),
    "ENDMDL",
    "MODEL        2",
    atomo({ res: "TRP", seq: 1, x: 9 }),
    "ENDMDL",
  ].join("\n");
  const m = StructureModel.ler(multi);
  assert(m.estrutura.modelo.total === 2 && m.estrutura.modelo.selecionado === 1, "fica no primeiro MODEL");
  assert(m.analise.sequencias.A === "A", "TRP do modelo 2 não entra");
  assert(!m.textoViewer.includes("TRP"), "o viewer do PDB também corta no primeiro ENDMDL");
  const classico = ProtAnalysis.analisarCompleto(ProtAnalysis.primeiroModelo(multi));
  assert(JSON.stringify(classico) === JSON.stringify({
    cadeias: m.analise.cadeias,
    estatisticas: m.analise.estatisticas,
    frequencias: m.analise.frequencias,
    sequencias: m.analise.sequencias,
  }), "modelo múltiplo bate com ProtAnalysis");
}

function testeLacunasPdb() {
  const salto = [atomo({ seq: 1, x: 0 }), atomo({ seq: 5, x: 4 })].join("\n");
  const s = StructureModel.ler(salto);
  assert(s.estrutura.lacunas.determinado === false, "salto sem metadado não é diagnóstico fechado");
  assert(s.estrutura.lacunas.naoResolvidos.length === 0, "salto sem evidência não vira resíduo ausente");
  assert(s.estrutura.lacunas.saltosNumeracao.length === 1, "o salto fica registrado");
  assert(s.estrutura.lacunas.saltosNumeracao[0].interpretacao === "nao_determinado", "o inteiro pulado fica não determinado");
  assert(s.estrutura.lacunas.resumo.startsWith("Não determinado"), "o resumo não finge zero");
  assert(!/0 lacuna|gaps:\s*0|0 resíduo ausente/i.test(StructureModel.textoVisao(s.estrutura)), "o texto não mostra zero falso");

  const remark = [
    "REMARK 465",
    "REMARK 465 MISSING RESIDUES",
    "REMARK 465 THE FOLLOWING RESIDUES WERE NOT LOCATED IN THE",
    "REMARK 465 EXPERIMENT. (M=MODEL NUMBER; RES=RESIDUE NAME; C=CHAIN",
    "REMARK 465 IDENTIFIER; SSSEQ=SEQUENCE NUMBER; I=INSERTION CODE.)",
    "REMARK 465",
    "REMARK 465   M RES C SSSEQI",
    linha([[1, "REMARK 465"], [16, "GLY"], [20, "A"], [23, "   2"]]),
    atomo({ res: "ALA", seq: 1, x: 0, y: 0, z: 0 }),
    atomo({ res: "SER", seq: 3, x: 3, y: 0, z: 0 }),
    atomo({ res: "VAL", seq: 8, x: 8, y: 0, z: 0 }),
  ].join("\n");
  const r = StructureModel.ler(remark);
  assert(r.estrutura.lacunas.determinado === true, "REMARK 465 com a seção fecha o diagnóstico");
  const gly = porNumero(r.estrutura.lacunas.naoResolvidos, "A", 2, "");
  assert(gly.length === 1 && gly[0].origem.includes("remark465") && gly[0].resname === "GLY", "GLY 2 vem do REMARK 465");
  assert(gly[0].x == null && gly[0].y == null, "o resíduo ausente não ganha coordenada");
  const prox = r.estrutura.lacunas.proximidadeFlanqueadores;
  assert(prox.length === 1, "só o trecho entre flanqueadores ganha distância: " + prox.length);
  assert(prox[0].distanciaA === 3, "distância dos flanqueadores é 3 Å, não do GLY");
  assert(/flanqueador/i.test(prox[0].rotulo) && /não é distância do resíduo ausente/i.test(prox[0].rotulo), "o rótulo deixa a proxy explícita");
  assert(!prox.some((p) => p.residuosAusentes.some((a) => a.authSeq === 8)), "VAL observado não entra como ausente");
  const saltoNum = r.estrutura.lacunas.saltosNumeracao[0];
  assert(saltoNum && saltoNum.interpretacao === "salto_de_numeracao", "3–7 sem REMARK são salto, não resíduo");
  assert(!saltoNum.inteirosSemResiduoDeclarado.includes(2), "o 2 do REMARK não é salto");

  const terminal = [
    "REMARK 465 MISSING RESIDUES",
    linha([[1, "REMARK 465"], [16, "MET"], [20, "A"], [23, " 143"]]),
    atomo({ res: "ALA", seq: 145, x: 1 }),
  ].join("\n");
  const t = StructureModel.ler(terminal);
  assert(porNumero(t.estrutura.lacunas.naoResolvidos, "A", 143, "").length === 1, "terminal do REMARK entra");
  assert(t.estrutura.lacunas.proximidadeFlanqueadores.length === 0, "sem flanqueador anterior não há distância");

  const declarada = [
    seqres("A", ["ALA", "GLY", "SER"]),
    atomo({ res: "ALA", seq: 1, x: 0 }),
    atomo({ res: "SER", seq: 3, x: 4 }),
  ].join("\n");
  const q = StructureModel.ler(declarada);
  const g = porNumero(q.estrutura.lacunas.naoResolvidos, "A", 2, "");
  assert(q.estrutura.lacunas.determinado && g.length === 1 && g[0].resname === "GLY" && g[0].origem.includes("seqres"), "SEQRES única numera GLY 2: " + JSON.stringify(q.estrutura.lacunas.naoResolvidos));

  const ambigua = [seqres("A", ["ALA", "ALA"]), atomo({ res: "ALA", seq: 1 })].join("\n");
  const a = StructureModel.ler(ambigua);
  assert(a.estrutura.lacunas.determinado === false, "SEQRES ambígua não fecha");
  assert(a.estrutura.lacunas.naoResolvidos.length === 0, "SEQRES ambígua não escolhe um ALA");

  const igual = [seqres("A", ["ALA", "GLY"]), atomo({ res: "ALA", seq: 5 }), atomo({ res: "GLY", seq: 6 })].join("\n");
  const ig = StructureModel.ler(igual);
  assert(ig.estrutura.lacunas.determinado && ig.estrutura.lacunas.naoResolvidos.length === 0, "SEQRES idêntica não fabrica lacuna");
  assert(/fonte explícita/i.test(ig.estrutura.lacunas.resumo), "o zero determinado cita a fonte");
  assert(ig.estrutura.lacunas.foraDoConstructo.status === "nao_avaliado", "UniProt continua não avaliado");

  const db = [
    "DBREF  1A00 A    1   141  UNP    P69905   HBA_HUMAN        1    141",
    "DBREF  1A00 B    2   146  UNP    P68871   HBB_HUMAN        2    146",
    atomo({ res: "ALA", seq: 1 }),
  ].join("\n");
  const d = StructureModel.ler(db);
  assert(d.estrutura.uniprot.correspondenciaResiduo === "nao_estabelecida", "DBREF não vira mapa de resíduos");
  assert(d.estrutura.uniprot.declaracoes.length === 2, "dois DBREF");
  assert(d.estrutura.uniprot.declaracoes[1].accession === "P68871", "acesso da cadeia B");
  assert(d.estrutura.uniprot.declaracoes[1].dbInicio === 2, "início declarado 2");
  assert(/não começa em 1/.test(d.estrutura.uniprot.declaracoes[1].nota), "não lista o resíduo 1 do banco");
  assert(!d.estrutura.uniprot.pares && !d.estrutura.uniprot.residuos, "não há lista de pares");
}

function testeComponentesEInvalidos() {
  const texto = [
    atomo({ res: "ALA", seq: 1 }),
    atomo({ rec: "HETATM", nome: " O  ", res: "HOH", seq: 101, x: 5 }),
    atomo({ rec: "HETATM", nome: "ZN  ", res: "ZN", seq: 201, x: 6 }),
    atomo({ rec: "HETATM", nome: " C1 ", res: "LIG", seq: 301, x: 7 }),
    atomo({ rec: "HETATM", nome: " C2 ", res: "LIG", seq: 301, x: 8 }),
  ].join("\n");
  const l = StructureModel.ler(texto);
  assert(l.estrutura.componentes.proteinas.posicoes === 1, "uma posição de proteína");
  assert(l.estrutura.componentes.aguas.instancias === 1, "uma água");
  assert(l.estrutura.componentes.ions.some((i) => i.codigo === "ZN" && i.instancias === 1), "um zinco");
  const lig = l.estrutura.componentes.hetero.find((h) => h.codigo === "LIG");
  assert(lig && lig.instancias === 1, "duas linhas do mesmo HET são uma instância");
  assert(/holo/i.test(l.estrutura.componentes.holo.motivo) && l.estrutura.componentes.holo.estado === "nao_determinado", "HETATM não fecha holo");
  assert(l.estrutura.identidade.resolucao == null, "sem REMARK 2 a resolução fica ausente");
  assert(!/0 Å|0\.00 Å/.test(StructureModel.textoVisao(l.estrutura)), "não publica resolução zero");

  assert(!StructureModel.ler("isto nao e estrutura").ok, "texto inválido falha");
  assert(/não foi interpretado/.test(StructureModel.ler("isto nao e estrutura").erro.mensagem), "mensagem de formato");
  const cif2 = "#\\#CIF_2.0\ndata_X\n";
  const c2 = StructureModel.ler(cif2);
  assert(!c2.ok && c2.formato === "cif2", "CIF 2 não é lido como CIF 1");
  const semAtom = "data_VAZIO\n_struct.title 'sem atomos'\n";
  const sa = StructureModel.ler(semAtom);
  assert(!sa.ok && /_atom_site/.test(sa.erro.mensagem), "mmCIF sem atom_site não vira PDB");
  assert(!sa.erro.mensagem.toLowerCase().includes("coluna 22"), "o erro não fala em coluna PDB");
}

function cifMinimo(extra, atomos) {
  return [
    "data_TEST",
    "_entry.id TEST",
    "_struct.title 'Proteina sintetica'",
    "_exptl.method 'X-RAY DIFFRACTION'",
    extra || "",
    "loop_",
    "_atom_site.group_PDB",
    "_atom_site.type_symbol",
    "_atom_site.label_atom_id",
    "_atom_site.label_alt_id",
    "_atom_site.label_comp_id",
    "_atom_site.label_asym_id",
    "_atom_site.label_entity_id",
    "_atom_site.label_seq_id",
    "_atom_site.pdbx_PDB_ins_code",
    "_atom_site.Cartn_x",
    "_atom_site.Cartn_y",
    "_atom_site.Cartn_z",
    "_atom_site.occupancy",
    "_atom_site.auth_seq_id",
    "_atom_site.auth_comp_id",
    "_atom_site.auth_asym_id",
    "_atom_site.auth_atom_id",
    "_atom_site.pdbx_PDB_model_num",
    atomos,
  ].join("\n");
}

function testeMmcif() {
  const atomos = [
    "ATOM C CA . ALA A 1 1 ? 0.000 0.000 0.000 1.00 10 ALA AA CA 1",
    "ATOM C CA A SER A 1 3 ? 3.000 0.000 0.000 0.40 12 SER AA CA 1",
    "ATOM C CA B SER A 1 3 ? 3.200 0.000 0.000 0.60 12 SER AA CA 1",
    "ATOM C CA . GLY A 1 4 A 4.000 0.000 0.000 1.00 13 GLY AA CA 1",
    "HETATM O O . HOH B 2 . ? 9.000 0.000 0.000 1.00 1 HOH B O 1",
    "HETATM ZN ZN . ZN B 3 . ? 8.000 0.000 0.000 1.00 2 ZN B ZN 1",
    "ATOM C CA . TRP A 1 9 ? 30.000 0.000 0.000 1.00 99 TRP AA CA 2",
  ].join("\n");
  const extra = [
    "_refine.ls_d_res_high 1.8",
    "loop_",
    "_entity.id",
    "_entity.type",
    "1 polymer",
    "2 water",
    "3 non-polymer",
    "loop_",
    "_entity_poly.entity_id",
    "_entity_poly.type",
    "1 polypeptide(L)",
    "loop_",
    "_struct_ref.id",
    "_struct_ref.db_name",
    "_struct_ref.pdbx_db_accession",
    "_struct_ref.entity_id",
    "1 UNP P12345 1",
    "loop_",
    "_struct_ref_seq.ref_id",
    "_struct_ref_seq.pdbx_strand_id",
    "_struct_ref_seq.pdbx_db_accession",
    "_struct_ref_seq.pdbx_auth_seq_align_beg",
    "_struct_ref_seq.pdbx_auth_seq_align_end",
    "_struct_ref_seq.db_align_beg",
    "_struct_ref_seq.db_align_end",
    "1 AA P12345 10 12 20 22",
    "loop_",
    "_pdbx_poly_seq_scheme.asym_id",
    "_pdbx_poly_seq_scheme.seq_id",
    "_pdbx_poly_seq_scheme.mon_id",
    "_pdbx_poly_seq_scheme.pdb_mon_id",
    "_pdbx_poly_seq_scheme.auth_seq_num",
    "_pdbx_poly_seq_scheme.auth_mon_id",
    "_pdbx_poly_seq_scheme.pdb_strand_id",
    "_pdbx_poly_seq_scheme.pdb_ins_code",
    "A 1 ALA ALA 10 ALA AA ?",
    "A 2 GLY . 11 GLY AA ?",
    "A 3 SER SER 12 SER AA ?",
    "loop_",
    "_pdbx_unobs_or_zero_occ_residues.PDB_model_num",
    "_pdbx_unobs_or_zero_occ_residues.occupancy_flag",
    "_pdbx_unobs_or_zero_occ_residues.auth_asym_id",
    "_pdbx_unobs_or_zero_occ_residues.auth_comp_id",
    "_pdbx_unobs_or_zero_occ_residues.auth_seq_id",
    "_pdbx_unobs_or_zero_occ_residues.PDB_ins_code",
    "_pdbx_unobs_or_zero_occ_residues.label_asym_id",
    "_pdbx_unobs_or_zero_occ_residues.label_seq_id",
    "1 1 AA GLY 11 ? A 2",
    "1 0 AA SER 12 ? A 3",
  ].join("\n");
  const lido = StructureModel.ler(cifMinimo(extra, atomos));
  assert(lido.ok, "mmCIF sintético lê: " + (lido.erro && lido.erro.mensagem));
  assert(lido.formato === "mmcif" && lido.textoPdb == null, "mmCIF não produz texto PDB");
  assert(lido.viewerFormato === "cif" && lido.textoViewer.includes("_atom_site.auth_asym_id"), "viewer é mmCIF");
  assert(!lido.textoViewer.includes("TRP"), "modelo 2 não entra no viewer");
  assert(lido.analise.sequencias.AA === "ASG", "cadeia author AA, inserção 13A e modelo 2 de fora: " + lido.analise.sequencias.AA);
  assert(lido.analise.estatisticas.cadeias.find((c) => c.cadeia === "AA").atomos === 4, "duas linhas altLoc de SER entram na conta ATOM");
  const cadeia = lido.estrutura.cadeias.find((c) => c.id === "AA");
  assert(cadeia && cadeia.label === "A" && cadeia.auth === "AA", "auth AA e label A ficam separados");
  assert(cadeia.posicoesPolimero === 3, "ALA, GLY com inserção e SER são três posições, sem duplicar altLoc");
  const gly = porNumero(lido.estrutura.lacunas.naoResolvidos, "AA", 11, "");
  assert(gly.length === 1 && gly[0].resname === "GLY", "GLY 11 não resolvido");
  assert(gly[0].origem.includes("pdbx_poly_seq_scheme") && gly[0].origem.includes("pdbx_unobs_or_zero_occ_residues"), "as duas fontes mmCIF entram");
  assert(lido.estrutura.lacunas.ocupacaoZero.length === 1 && lido.estrutura.lacunas.ocupacaoZero[0].authSeq === 12 && lido.estrutura.lacunas.ocupacaoZero[0].temCoordenadas === true, "SER com flag 0 é ocupação zero e tem coordenadas");
  assert(!porNumero(lido.estrutura.lacunas.naoResolvidos, "AA", 12, "").length, "SER com coordenadas não é ausência");
  const prox = lido.estrutura.lacunas.proximidadeFlanqueadores;
  assert(prox.length === 1 && prox[0].distanciaA === 3, "proxy entre ALA 10 e SER 12: " + JSON.stringify(prox));
  assert(lido.estrutura.identidade.resolucao === 1.8 && lido.estrutura.identidade.resolucaoOrigem === "_refine.ls_d_res_high", "resolução sai do refine");
  assert(lido.estrutura.identidade.metodo === "X-RAY DIFFRACTION", "método do _exptl");
  assert(lido.estrutura.uniprot.correspondenciaResiduo === "nao_estabelecida", "intervalo UniProt não vira mapa");
  assert(lido.estrutura.uniprot.declaracoes[0].accession === "P12345", "acesso citado no arquivo");
  assert(lido.estrutura.uniprot.declaracoes[0].cadeiaAuth === "AA", "cadeia author do struct_ref_seq");
  assert(lido.estrutura.componentes.aguas.instancias === 1, "HOH no mmCIF");
  assert(lido.estrutura.componentes.ions.some((i) => i.codigo === "ZN"), "ZN no mmCIF");
  assert(lido.estrutura.recursos.preparo === "bloqueado", "preparo bloqueado para mmCIF");
  assert(lido.estrutura.recursos.conversaoPdb === "nao_feita", "não houve conversão para PDB");
  assert(lido.estrutura.componentes.holo.estado === "nao_determinado", "holo continua aberto");

  const semMeta = StructureModel.ler(cifMinimo("", "ATOM C CA . ALA A 1 1 ? 0 0 0 1 1 ALA A CA 1"));
  assert(semMeta.ok && semMeta.estrutura.identidade.resolucao == null, "mmCIF sem resolução não vira 0");
  assert(semMeta.estrutura.lacunas.determinado === false, "sem esquema nem SEQRES o diagnóstico não fecha");
}

function testeArquivosReais() {
  const a00 = fs.readFileSync(path.join("pdbproteins", "pdb1a00.pdb"), "utf8");
  const l00 = StructureModel.ler(a00);
  const classico = ProtAnalysis.analisarCompleto(ProtAnalysis.primeiroModelo(a00));
  assert(JSON.stringify({
    cadeias: l00.analise.cadeias,
    estatisticas: l00.analise.estatisticas,
    frequencias: l00.analise.frequencias,
    sequencias: l00.analise.sequencias,
  }) === JSON.stringify(classico), "1A00 coincide com a análise PDB já existente");
  assert(l00.estrutura.uniprot.correspondenciaResiduo === "nao_estabelecida", "1A00 não ganha mapa de resíduos");
  const acessos = l00.estrutura.uniprot.declaracoes.map((d) => d.accession).sort();
  assert(acessos.includes("P69905") && acessos.includes("P68871"), "DBREF de 1A00: " + acessos.join(","));
  assert(l00.estrutura.lacunas.foraDoConstructo.status === "nao_avaliado", "1A00 não separa fora do constructo");

  const a1c = fs.readFileSync(path.join("pdbproteins", "pdb1a1c.pdb"), "utf8");
  const l1 = StructureModel.ler(a1c);
  const esperados = [
    ["MET", "A", 143], ["ASP", "A", 144], ["MET", "B", 143], ["ASP", "B", 144], ["SER", "B", 145],
  ];
  for (const [res, ch, seq] of esperados) {
    const achou = porNumero(l1.estrutura.lacunas.naoResolvidos, ch, seq, "").find((r) => r.resname === res);
    assert(achou && achou.origem.includes("remark465"), "1A1C " + res + " " + ch + " " + seq + " no REMARK 465");
  }
  assert(l1.estrutura.lacunas.proximidadeFlanqueadores.every((p) => p.rotulo && p.flanqueadorAnterior && p.flanqueadorPosterior), "proxies de 1A1C têm os dois flancos e o rótulo");
  assert(!l1.estrutura.lacunas.proximidadeFlanqueadores.some((p) => p.residuosAusentes.some((r) => (r.authSeq === 143 || r.authSeq === 144) && p.flanqueadorAnterior.authSeq >= r.authSeq)), "não inventa flanco anterior depois do resíduo");

  const a0n = fs.readFileSync(path.join("pdbproteins", "pdb1a0n.pdb"), "utf8");
  const ln = StructureModel.ler(a0n);
  assert(ln.estrutura.modelo.total === 25 && ln.estrutura.modelo.selecionado === 1, "1A0N usa o modelo 1 de 25");
  const classicoN = ProtAnalysis.analisarCompleto(ProtAnalysis.primeiroModelo(a0n));
  assert(JSON.stringify(ln.analise.estatisticas) === JSON.stringify(classicoN.estatisticas), "estatística de 1A0N não mistura os 25 modelos");
  const gly = porNumero(ln.estrutura.lacunas.naoResolvidos, "B", 80, "").find((r) => r.resname === "GLY");
  assert(gly && gly.origem.includes("remark465"), "GLY B 80 de 1A0N está no REMARK 465 e no modelo 1");

  const cif = fs.readFileSync(path.join("tests", "fixtures", "estrutura", "1CRN.cif"), "utf8");
  const crn = StructureModel.ler(cif);
  assert(crn.ok && crn.formato === "mmcif", "1CRN.cif lê como mmCIF: " + (crn.erro && crn.erro.mensagem));
  assert(crn.estrutura.identidade.id === "1CRN", "entry id 1CRN");
  assert(crn.estrutura.identidade.resolucao === 1.5, "1CRN resolução 1.5 do arquivo");
  assert(crn.estrutura.identidade.resolucaoOrigem === "_refine.ls_d_res_high", "origem da resolução");
  assert(/X-RAY DIFFRACTION/.test(crn.estrutura.identidade.metodo), "método de 1CRN");
  assert(crn.estrutura.uniprot.declaracoes.some((d) => d.accession === "P01542"), "1CRN cita P01542");
  assert(crn.estrutura.uniprot.correspondenciaResiduo === "nao_estabelecida", "P01542 não vira mapa");
  assert(crn.estrutura.cadeias.some((c) => c.id === "A"), "cadeia A");
  assert(crn.estrutura.recursos.preparo === "bloqueado" && crn.textoPdb == null, "1CRN mmCIF não segue para o preparo como PDB");
  assert(crn.estrutura.lacunas.foraDoConstructo.status === "nao_avaliado", "1CRN não avalia fora do constructo");
  const texto = StructureModel.textoVisao(crn.estrutura);
  assert(texto.includes("peki-estrutura-1") && !/0 Å/.test(texto), "relatório versionado sem resolução zero");
}

testeIdEEntrada();
testePdbInsercaoAltLocModelo();
testeLacunasPdb();
testeComponentesEInvalidos();
testeMmcif();
testeArquivosReais();

console.log(ok + " asserções ok, " + falhas + " falhas");
if (falhas) process.exit(1);
