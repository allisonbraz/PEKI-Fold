// Testes do apoio a lacunas. Não medem qualidade experimental nem pLDDT como afinidade.
"use strict";

const Lacunas = require("../docs/lacunas-modelo.js");

let falhas = 0;
let ok = 0;
function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}

function res(chain, seq, resname, coords) {
  return { chain, seq, icode: "", resname, classe: "proteina", temCoordenadas: coords !== false };
}

const det = Lacunas.detectar({
  lacunas: {
    determinado: true,
    resumo: "2 resíduo(s) não resolvido(s).",
    naoResolvidos: [
      { cadeiaAuth: "A", resname: "ALA", authSeq: 3 },
      { cadeiaAuth: "A", resname: "GLY", authSeq: 4 },
    ],
    saltosNumeracao: [],
  },
}, null);
assert(det.tem && det.cadeias[0].naoResolvidos === 2, "detecta lacunas nomeadas");
assert(!Lacunas.detectar({ lacunas: { determinado: true, naoResolvidos: [], saltosNumeracao: [] } }).tem, "sem lacuna o atalho não aparece");

const seqres = [{ chain: "A", seq: ["ALA", "GLY", "SER"], contagemConfere: true }];
const fasta = Lacunas.fastaCadeia({
  nome: "EXEMPLO",
  cadeia: "A",
  residuos: [res("A", 1, "ALA"), res("A", 2, "GLY")],
  naoResolvidos: [],
  seqres,
});
assert(fasta.fonte === "seqres" && fasta.letras === "AGS", "SEQRES única entra na FASTA: " + fasta.letras);
assert(fasta.lista[2].origem === "seqres-ausente" && fasta.lista[0].authSeq === 1, "posição ausente marcada");
assert(fasta.texto.startsWith(">EXEMPLO_A fonte=seqres"), "cabeçalho FASTA");

const ambigua = Lacunas.fastaCadeia({
  nome: "EXEMPLO",
  cadeia: "A",
  residuos: [res("A", 10, "ALA")],
  naoResolvidos: [{ cadeiaAuth: "A", resname: "GLY", authSeq: 11 }],
  seqres: [{ chain: "A", seq: ["ALA", "ALA", "GLY"], contagemConfere: true }],
});
assert(ambigua.fonte === "author" && ambigua.letras === "AG", "SEQRES ambígua não inventa a ordem: " + ambigua.letras + " " + ambigua.avisos.join(" "));

const P = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 3 }, { x: 1, y: 1, z: 1 }];
const Q = P.map((p) => ({ x: -p.y + 5, y: p.x - 2, z: p.z + 3 }));
const tr = Lacunas.kabsch(P, Q);
assert(tr, "kabsch devolve transformação");
const erro = Lacunas.rmsd(P, Q, tr);
assert(erro != null && erro < 1e-6, "encaixe de rotação conhecida, RMSD " + erro);

const pdb = [
  "ATOM      1  CA  ALA A   1       1.000   0.000   0.000  1.00 91.00           C",
  "ATOM      2  CA  GLY A   2       0.000   2.000   0.000  1.00 40.00           C",
].join("\n");
const atoms = Lacunas.atomosPdb(pdb);
assert(atoms.length === 2 && atoms[1].bfactor === 40, "leitura de CA e fator B");
assert(Lacunas.corPlddt(95) === "#0053D6" && Lacunas.faixaPlddt(40) === "muito baixo", "faixas de pLDDT");
assert(Lacunas.uniprotDeAuth(5, { pdbInicio: 1, pdbFim: 10, dbInicio: 3 }) === 7, "deslocamento linear do DBREF");
const conf = Lacunas.lerConfianca({ residueNumber: [1, 2], confidenceScore: [91.2, 40.5] });
assert(conf.get(2) === 40.5 && Lacunas.plddtDoAtomo(atoms[0], conf) === 91.2, "pLDDT do JSON tem prioridade sobre o fator B");

const api = Lacunas.normalizarPredicao([{
  entryId: "AF-P69905-F1", uniprotAccession: "P69905", globalMetricValue: 98.06,
  pdbUrl: "https://alphafold.ebi.ac.uk/files/AF-P69905-F1-model_v6.pdb",
  fractionPlddtVeryHigh: 0.993,
}]);
assert(api.length === 1 && api[0].globalMetricValue === 98.06 && api[0].pdbUrl.includes("model_v6"), "API normalizada");

console.log(ok + " asserções ok, " + falhas + " falhas");
if (falhas) process.exit(1);
