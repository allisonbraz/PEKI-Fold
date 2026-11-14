// RSA (Shrake-Rupley / Tien 2013) e montagem do mapa de sequência.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const Sasa = require("../docs/sasa.js");
const ProtAnalysis = require("../docs/pdb-analysis.js");
globalThis.ProtAnalysis = ProtAnalysis;

function linha(o) {
  const rec = (o.rec || "ATOM").padEnd(6, " ").slice(0, 6);
  const serial = String(o.serial == null ? 1 : o.serial).padStart(5, " ");
  const nome = (o.nome || " CA ").padEnd(4, " ").slice(0, 4);
  const alt = (o.altloc || " ").slice(0, 1);
  const res = (o.res || "ALA").padEnd(3, " ").slice(0, 3);
  const chain = (o.chain || "A").slice(0, 1);
  const seq = String(o.seq == null ? 1 : o.seq).padStart(4, " ");
  const ic = (o.icode || " ").slice(0, 1);
  const x = (o.x == null ? 0 : o.x).toFixed(3).padStart(8, " ");
  const y = (o.y == null ? 0 : o.y).toFixed(3).padStart(8, " ");
  const z = (o.z == null ? 0 : o.z).toFixed(3).padStart(8, " ");
  const occ = (o.occ == null ? 1 : o.occ).toFixed(2).padStart(6, " ");
  const el = (o.elemento == null ? nome.trim().charAt(0) : o.elemento).padStart(2, " ");
  return rec + serial + " " + nome + alt + res + " " + chain + seq + ic + "   " + x + y + z + occ + "  0.00          " + el;
}

function areaCheia(elemento) {
  const r = Sasa.raioDe(elemento) + Sasa.PROBE;
  return 4 * Math.PI * r * r;
}

test("máximos de Tien 2013 e limiar de 25%", () => {
  assert.equal(Sasa.MAX_ASA_TIEN.ALA, 129);
  assert.equal(Sasa.MAX_ASA_TIEN.HIS, 224);
  assert.equal(Sasa.MAX_ASA_TIEN.TRP, 285);
  assert.equal(Sasa.MAX_ASA_TIEN.GLY, 104);
  assert.equal(Sasa.LIMIAR, 25);
  assert.equal(Sasa.PROBE, 1.4);
  assert.equal(Sasa.N_PONTOS, 100);
  assert.match(Sasa.TEXTO_METODO, /Shrake e Rupley/);
  assert.match(Sasa.TEXTO_METODO, /Tien et al\./);
  assert.match(Sasa.TEXTO_METODO, /sem águas/);
});

test("átomo isolado tem a área da esfera; água não oclui e outra cadeia oclui", () => {
  const cheia = areaCheia("C");
  const sozinho = Sasa.calcularExposicao(linha({ nome: " CA ", res: "ALA", elemento: "C" }) + "\n");
  assert.equal(sozinho.atomosUsados, 1);
  assert.ok(Math.abs(sozinho.residuos[0].sasa - cheia) < 1e-6, sozinho.residuos[0].sasa);
  assert.ok(Math.abs(sozinho.residuos[0].rsa - (100 * cheia) / 129) < 1e-6);

  const comAgua = linha({ nome: " CA ", res: "ALA", elemento: "C" }) + "\n"
    + linha({ nome: " O  ", res: "HOH", seq: 2, x: 2, elemento: "O", rec: "HETATM" }) + "\n";
  const agua = Sasa.calcularExposicao(comAgua);
  assert.equal(agua.aguasIgnoradas, 1);
  assert.equal(agua.atomosUsados, 1);
  assert.ok(Math.abs(agua.residuos[0].sasa - cheia) < 1e-6);

  const vizinho = linha({ nome: " CA ", res: "ALA", elemento: "C" }) + "\n"
    + linha({ nome: " CA ", res: "ALA", chain: "B", x: 2.2, elemento: "C" }) + "\n";
  const junto = Sasa.calcularExposicao(vizinho);
  const a = junto.residuos.find((r) => r.cadeia === "A");
  assert.ok(a.sasa < cheia - 1, "a cadeia B entra no contexto da SASA: " + a.sasa);
});

test("altloc duplicado não enterra o resíduo e o elemento CA do aminoácido é carbono", () => {
  const cheia = areaCheia("C");
  const texto = linha({ nome: " CA ", altloc: "A", occ: 0.4, elemento: "C" }) + "\n"
    + linha({ nome: " CA ", altloc: "B", occ: 0.6, elemento: "C" }) + "\n";
  const exp = Sasa.calcularExposicao(texto);
  assert.equal(exp.atomosUsados, 1);
  assert.ok(Math.abs(exp.residuos[0].sasa - cheia) < 1e-6);
  assert.equal(Sasa.inferirElemento("CA", "C"), "C");
  assert.equal(Sasa.inferirElemento("FE", "FE"), "FE");
  assert.equal(Sasa.inferirElemento("FE", ""), "FE");
  assert.equal(Sasa.inferirElemento("CA", ""), "C");
});

test("o mapa quebra em linhas, reusa a paleta e marca o bolsão", () => {
  const residuos = [];
  const ordem = ProtAnalysis.AMINOACIDOS_PADRAO;
  for (let i = 0; i < 25; i++) {
    const resname = ordem[i % ordem.length];
    const max = Sasa.MAX_ASA_TIEN[resname];
    const rsa = i === 3 ? 2.6 : i === 7 ? 0 : i < 10 ? 10 : 40;
    residuos.push({
      cadeia: "A", resname, seq: i + 1, icode: "", sasa: (rsa / 100) * max, maxAsa: max, rsa,
    });
  }
  residuos.push({ cadeia: "A", resname: "MSE", seq: 26, icode: "A", sasa: 10, maxAsa: null, rsa: null });
  const marcas = Sasa.chavesDeSelecao([{ chain: "A", resi: [4, 8], icode: " " }]);
  const mapa = Sasa.montarMapa({ residuos }, "A", { marcas, nomeBolsão: "P_0", porLinha: 24 });
  assert.equal(mapa.linhas.length, 2);
  assert.equal(mapa.linhas[0].length, 24);
  assert.equal(mapa.linhas[1].length, 2);
  assert.equal(mapa.celulas[0].letra, ProtAnalysis.TRES_PARA_UMA.ALA);
  assert.equal(mapa.celulas[0].cor, ProtAnalysis.grupoAminoacido("ALA").cor);
  assert.equal(mapa.celulas[2].cor, ProtAnalysis.grupoAminoacido(ordem[2]).cor);
  assert.equal(mapa.celulas[3].enterrado, true);
  assert.equal(mapa.celulas[10].enterrado, false);
  assert.equal(mapa.celulas[3].noBolsão, true);
  assert.equal(mapa.celulas[7].noBolsão, true);
  assert.equal(mapa.resumo.semMaximo, 1);
  assert.match(mapa.textoResumo, /enterrados \(RSA < 25%\)/);
  assert.match(mapa.textoResumo, /Hidrofóbicos:/);
  assert.match(mapa.textoBolsão, /P_0:/);
  const html = Sasa.htmlDoMapa(mapa, { ativo: "A|4|" });
  assert.equal((html.match(/class="sasa-res/g) || []).length, 26);
  assert.equal((html.match(/data-linha="/g) || []).length, 2);
  assert.ok(html.includes("sasa-limiar"));
  assert.ok(html.includes(ProtAnalysis.grupoAminoacido("ALA").cor));
  assert.ok(html.includes("sasa-bolsao"));
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes("▼"));
  const svg = Sasa.svgDoMapa(mapa, { titulo: "Mapa da sequência com exposição ao solvente — cadeia A" });
  assert.match(svg, /stroke-dasharray="4 3"/);
  assert.ok(svg.includes(ProtAnalysis.grupoAminoacido("HIS").cor));
  assert.match(svg, /<polygon /);
  const legenda = Sasa.htmlLegenda(ProtAnalysis.GRUPOS_AA);
  for (const g of ProtAnalysis.GRUPOS_AA) {
    assert.ok(legenda.includes(g.cor), g.id);
    assert.ok(legenda.includes(g.nome), g.nome);
  }
  assert.match(legenda, /Limiar 25%/);
});

test("4HHB cadeia A fica perto da referência: 86/141, His58 e His87 enterradas", { timeout: 60000 }, () => {
  const texto = fs.readFileSync(path.join(__dirname, "fixtures/ui-render/4HHB.pdb"), "utf8");
  const exp = Sasa.calcularExposicao(texto);
  assert.ok(exp.aguasIgnoradas > 0, "as águas do cristal ficam de fora");
  assert.ok(exp.atomosUsados > 4000, "proteína e hemes entram no contexto");
  const mapa = Sasa.montarMapa(exp, "A");
  assert.equal(mapa.resumo.total, 141);
  assert.equal(mapa.resumo.enterrados, 86);
  assert.equal(mapa.resumo.expostos, 55);
  assert.equal(mapa.resumo.hidroTotal, 62);
  assert.equal(mapa.resumo.hidroEnterrados, 50);
  assert.equal(mapa.linhas.length, 6);
  assert.equal(mapa.linhas[0].length, 24);
  assert.equal(mapa.linhas[5].length, 21);
  const his58 = mapa.celulas.find((c) => c.seq === 58 && c.resname === "HIS");
  const his87 = mapa.celulas.find((c) => c.seq === 87 && c.resname === "HIS");
  assert.ok(his58 && his58.rsa < 5, "His58 " + (his58 && his58.rsa));
  assert.ok(Math.abs(his58.rsa - 2.6) < 0.2, his58.rsa);
  assert.ok(his87 && his87.rsa < 1, "His87 " + (his87 && his87.rsa));
  assert.equal(his58.cor, ProtAnalysis.grupoAminoacido("HIS").cor);
  assert.equal(his58.grupoId, "positivo");
  assert.match(mapa.textoResumo, /86 de 141 resíduos enterrados/);
  assert.match(mapa.textoResumo, /50 de 62 enterrados \(80,6%\)/);
  const crn = fs.readFileSync(path.join(__dirname, "fixtures/ui-render/1CRN.pdb"), "utf8");
  const expCrn = Sasa.calcularExposicao(crn);
  const mapaCrn = Sasa.montarMapa(expCrn, "A");
  assert.equal(mapaCrn.resumo.total, 46);
  assert.ok(mapaCrn.celulas.every((c) => c.rsa != null && c.cor));
});
