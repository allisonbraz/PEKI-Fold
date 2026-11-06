// Smoke com coordenadas reais. A fixture sintética fica no teste de unidade.
"use strict";

const fs = require("fs");
const path = require("path");

let falhas = 0;
let ok = 0;
function assert(cond, msg) {
  if (cond) { ok += 1; return; }
  falhas += 1;
  console.error("FALHOU: " + msg);
}

const ProtAnalysis = require("../docs/pdb-analysis.js");
const StructureModel = require("../docs/structure-model.js");

function somaBate(analise) {
  const todas = ProtAnalysis.frequenciaConsolidada(analise.frequencias, analise.cadeias);
  for (const aa of ProtAnalysis.AMINOACIDOS_PADRAO) {
    const esperado = analise.cadeias.reduce((s, cid) => {
      const item = analise.frequencias[cid].itens.find((i) => i.aa === aa);
      return s + (item ? item.contagem : 0);
    }, 0);
    const achado = todas.itens.find((i) => i.aa === aa).contagem;
    if (achado !== esperado) return aa + " " + achado + " != " + esperado;
  }
  const totalCadeias = analise.cadeias.reduce((s, cid) => s + analise.frequencias[cid].total, 0);
  if (todas.total !== totalCadeias) return "total " + todas.total + " != " + totalCadeias;
  return "";
}

function janelaQueSoValeNaOrdem(residuosPorCadeia, pdb) {
  for (const [cid, seq] of Object.entries(residuosPorCadeia)) {
    for (let i = 0; i + 2 < seq.length; i++) {
      const ordem = [seq[i][0], seq[i + 1][0], seq[i + 2][0]];
      const reverso = [ordem[2], ordem[1], ordem[0]];
      if (ordem.join("-") === reverso.join("-")) continue;
      const ida = ProtAnalysis.buscarMotivo(pdb, ordem);
      const volta = ProtAnalysis.buscarMotivo(pdb, reverso);
      if (ida.length > 0 && volta.length === 0) {
        return { cid, ordem, posicao: seq[i][1], ida: ida.length };
      }
    }
  }
  return null;
}

function checarLeitura(rotulo, texto) {
  const lido = StructureModel.ler(texto);
  assert(lido.ok, rotulo + " lê: " + (lido.erro && lido.erro.mensagem));
  if (!lido.ok) return;
  const analise = lido.analise;
  assert(analise.cadeias.length > 0, rotulo + " tem cadeia");
  const erroSoma = somaBate(analise);
  assert(!erroSoma, rotulo + " soma das cadeias: " + erroSoma);
  const cat = ProtAnalysis.catalogoResiduos(analise.residuosPorCadeia);
  const nomes = new Set();
  for (const seq of Object.values(analise.residuosPorCadeia)) for (const par of seq) nomes.add(par[0]);
  assert(cat.every((c) => nomes.has(c.codigo)), rotulo + " catálogo só tem resíduo modelado");
  assert(cat.length === nomes.size, rotulo + " catálogo não perde resíduo modelado: " + cat.length + "/" + nomes.size);
  const pdb = lido.textoPdb || texto;
  const janela = lido.textoPdb ? janelaQueSoValeNaOrdem(analise.residuosPorCadeia, pdb) : null;
  if (lido.textoPdb) {
    assert(janela, rotulo + " tem uma janela cuja ordem inversa não ocorre");
    if (janela) {
      const hit = ProtAnalysis.buscarMotivo(pdb, janela.ordem);
      assert(hit.some((h) => h.cadeia === janela.cid && h.posicao === janela.posicao), rotulo + " a janela " + janela.ordem.join("-") + " começa em " + janela.posicao);
      assert(ProtAnalysis.buscarMotivo(pdb, [janela.ordem[2], janela.ordem[1], janela.ordem[0]]).length === 0, rotulo + " a ordem inversa não é ocorrência");
    }
  } else {
    const seq = analise.residuosPorCadeia[analise.cadeias[0]] || [];
    if (seq.length >= 3) {
      const ordem = [seq[0][0], seq[1][0], seq[2][0]];
      const hit = StructureModel.buscarMotivo(analise.residuosPorCadeia, ordem);
      assert(hit.some((h) => h.posicao === seq[0][1]), rotulo + " a primeira janela lida é encontrada");
    }
  }
  const totalPadrao = ProtAnalysis.frequenciaConsolidada(analise.frequencias, analise.cadeias).total;
  const residuosModelados = Object.values(analise.residuosPorCadeia).reduce((s, seq) => s + seq.length, 0);
  assert(totalPadrao <= residuosModelados, rotulo + " o total padrão não passa dos resíduos modelados");
  console.log(rotulo + ": " + analise.cadeias.length + " cadeia(s), " + totalPadrao + " aminoácidos padrão, " + residuosModelados + " resíduos ATOM");
}

async function baixarPdb(id) {
  const resp = await fetch("https://files.rcsb.org/download/" + id + ".pdb");
  if (!resp.ok) throw new Error(id + " HTTP " + resp.status);
  const texto = await resp.text();
  if (!/^(?:ATOM  |HETATM)/m.test(texto)) throw new Error(id + " sem coordenadas PDB");
  return texto;
}

async function main() {
  const local = fs.readFileSync(path.join(__dirname, "../pdbproteins/pdb1a00.pdb"), "utf8");
  checarLeitura("1A00 local", local);
  let remoto = null;
  try {
    remoto = await baixarPdb("4HHB");
  } catch (e) {
    assert(false, "não foi possível baixar 4HHB: " + e.message);
  }
  if (remoto) checarLeitura("4HHB RCSB", remoto);
  if (falhas) {
    console.error(falhas + " falha(s), " + ok + " ok");
    process.exit(1);
  }
  console.log(ok + " asserções ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
