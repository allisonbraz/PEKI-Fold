// Testes do módulo de preparo. Não são validação química.
// Conferem o parser, a limpeza e a concordância com LINK/SSBOND do próprio arquivo.
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const Prep = require("../docs/prep-analysis.js");

const FIX = path.join(__dirname, "fixtures");
const IDS = ["4EYL", "1GZM", "1HSG", "5ORG"];
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
    for (let i = 0; i < s.length && col - 1 + i < buf.length; i++) buf[col - 1 + i] = s[i];
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
  const occ = (o.occ == null ? 1 : o.occ).toFixed(2).padStart(6, " ");
  const b = (o.b == null ? 20 : o.b).toFixed(2).padStart(6, " ");
  const el = o.el == null ? " C" : o.el;
  return linha([
    [1, rec], [7, serial], [13, nome], [17, alt], [18, res], [22, chain],
    [23, seq], [27, ic], [31, x], [39, y], [47, z], [55, occ], [61, b], [77, el],
  ]);
}

function baixar(id) {
  return new Promise((resolve, reject) => {
    const dest = path.join(FIX, id + ".pdb");
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      resolve(fs.readFileSync(dest, "utf8"));
      return;
    }
    fs.mkdirSync(FIX, { recursive: true });
    const url = "https://files.rcsb.org/download/" + id + ".pdb";
    https.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error(id + " HTTP " + res.statusCode)); return; }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const txt = Buffer.concat(chunks).toString("utf8");
        fs.writeFileSync(dest, txt);
        resolve(txt);
      });
    }).on("error", reject);
  });
}

function testeSintetico() {
  const ca = atomo({ nome: " CA ", res: "ALA", el: " C", x: 0, y: 0, z: 0 });
  const calcio = atomo({ rec: "HETATM", serial: 2, nome: "CA  ", res: "CA", chain: "A", seq: 200, el: "CA", x: 1, y: 0, z: 0 });
  const calcioSemColuna = atomo({ rec: "HETATM", serial: 3, nome: "CA  ", res: "CA", chain: "A", seq: 201, el: "  ", x: 2, y: 0, z: 0 });
  const znSemColuna = atomo({ rec: "HETATM", serial: 4, nome: "ZN  ", res: "ZN", chain: "A", seq: 202, el: "  ", x: 3, y: 0, z: 0 });
  const texto = [ca, calcio, calcioSemColuna, znSemColuna].join("\n");
  const atoms = Prep.parseAtomos(texto);
  assert(atoms.length === 4, "quatro átomos sintéticos");
  assert(atoms[0].elemento === "C" && atoms[0].metal === false, "carbono alfa não é metal");
  assert(atoms[1].elemento === "CA" && atoms[1].metal === true, "HETATM CA com elemento CA é cálcio");
  assert(atoms[2].elemento === "CA" && atoms[2].elementoFonte === "nome", "cálcio sem coluna, nome CA");
  assert(atoms[3].elemento === "ZN" && atoms[3].metal === true, "zinco sem coluna inferido pelo resíduo");

  const altA = atomo({ serial: 1, nome: " CB ", altloc: "A", occ: 0.25, x: 1 });
  const altB = atomo({ serial: 2, nome: " CB ", altloc: "B", occ: 0.75, x: 2 });
  const hoh = atomo({ rec: "HETATM", serial: 3, nome: " O  ", res: "HOH", seq: 10, el: " O", x: 5 });
  const anisou = "ANISOU    1  CA  ALA A   1     1000   1000   1000      0      0      0  C  ";
  const bruto = [altA, altB, hoh, anisou, "END"].join("\n");
  const regraA = Prep.limparPdb(bruto, { removerAguas: true, altloc: "A", hets: [] });
  assert(!regraA.pdb.includes("ANISOU"), "ANISOU sai na limpeza");
  assert(!regraA.pdb.includes("HOH"), "HOH sai quando a opção pede");
  assert(regraA.pdb.includes(" A "), "altloc A permanece na regra branco ou A");
  assert(!/\nATOM.{11}B/.test("\n" + regraA.pdb), "altloc B sai na regra branco ou A");
  const regraO = Prep.limparPdb(bruto, { removerAguas: true, altloc: "ocupacao", hets: [] });
  assert(regraO.pdb.includes(" B") || regraO.contagens.atom === 1, "maior ocupação fica com uma linha");
  const occ = Prep.parseAtomos(regraO.pdb);
  assert(occ.length === 1 && occ[0].altloc === "B", "maior ocupação escolhe B (0,75)");

  const cys1 = atomo({ serial: 1, nome: " SG ", res: "CYS", seq: 10, el: " S", x: 0, y: 0, z: 0 });
  const cys2 = atomo({ serial: 2, nome: " SG ", res: "CYS", seq: 20, el: " S", x: 2.0, y: 0, z: 0 });
  const ssTxt = [
    "SSBOND   1 CYS A   10    CYS A   20                          1555   1555  2.00",
    cys1, cys2,
  ].join("\n");
  const ss = Prep.paresSS(Prep.parseAtomos(ssTxt), Prep.parseSsbond(ssTxt), 2.5);
  assert(ss.pares.length === 1 && ss.registros[0].coberto === true, "par SG–SG casa com SSBOND");

  const ssSim = [
    "SSBOND   1 CYS A   10    CYS A   20                          1555   2555  2.00",
    cys1, cys2,
  ].join("\n");
  const ss2 = Prep.paresSS(Prep.parseAtomos(ssSim), Prep.parseSsbond(ssSim), 2.5);
  assert(ss2.pares.length === 1 && ss2.pares[0].noSsbond === true, "SSBOND de simetria não conta como coberto");
  assert(ss2.registros[0].identidade === false, "operador diferente de 1555 não é identidade");

  const asn = atomo({ serial: 1, nome: " ND2", res: "ASN", seq: 2, el: " N", x: 0, y: 0, z: 0 });
  const c1 = atomo({ rec: "HETATM", serial: 2, nome: " C1 ", res: "NAG", chain: "D", seq: 1, el: " C", x: 1.45, y: 0, z: 0 });
  const link = "LINK         ND2 ASN A   2                 C1  NAG D   1     1555   1555  1.45";
  const gTxt = [link, asn, c1, "REMARK 465     ALA A     4", "REMARK 465     ALA A     5"].join("\n");
  const g = Prep.glicosilacao(Prep.parseAtomos(gTxt), Prep.parseLinks(gTxt), { NAG: "2-acetamido-2-deoxy-beta-D-glucopyranose" }, 1.8, 10);
  assert(g.pares.length === 1 && g.linksAsnC1[0].coberto === true, "ND2–C1 casa com LINK");

  const gapTxt = [
    "REMARK 465     ALA A     3",
    atomo({ seq: 1, x: 0 }),
    atomo({ seq: 2, x: 1 }),
    atomo({ seq: 2, icode: "A", x: 1.2 }),
    atomo({ seq: 5, x: 2 }),
  ].join("\n");
  const inv = Prep.inventario(gapTxt);
  assert(inv.lacunas.length === 1, "uma lacuna de numeração");
  const nums = inv.lacunas[0].numeros.map((n) => n.resseq + (n.noRemark465 ? "*" : ""));
  assert(nums.join(",") === "3*,4", "3 consta no REMARK 465 e 4 não: " + nums.join(","));
  assert(inv.cadeias[0].insercoes.length === 1, "código de inserção listado");

  const pocket = [
    atomo({ x: 0, y: 0, z: 0 }),
    atomo({ serial: 2, x: 2, y: 0, z: 0 }),
    atomo({ serial: 3, x: 0, y: 4, z: 0 }),
    atomo({ serial: 4, x: 0, y: 0, z: 6 }),
  ].join("\n");
  const caixa = Prep.caixaPocket(pocket, 4);
  assert(caixa.ok, "caixa ok");
  assert(caixa.center_x === 0.5 && caixa.center_y === 1 && caixa.center_z === 1.5, "centroide " + [caixa.center_x, caixa.center_y, caixa.center_z]);
  assert(caixa.size_x === 10 && caixa.size_y === 12 && caixa.size_z === 14, "tamanho com margem 4: " + [caixa.size_x, caixa.size_y, caixa.size_z]);
  const cfg = Prep.formatarConfigVina(caixa);
  assert(cfg.includes("center_x = 0.500") && cfg.includes("size_z = 14.0"), "texto no formato do Vina");

  const af = "TITLE     ALPHAFOLD MONOMER V2.0 PREDICTION\nEXPDTA    THEORETICAL MODEL\n";
  assert(Prep.avisoPredita(af, null) === Prep.FRASES.predita, "aviso de estrutura predita");
  assert(Prep.avisoPredita("EXPDTA    X-RAY DIFFRACTION\n", null) == null, "cristal não dispara o aviso");
}

function resumo(id, r) {
  const ions = r.ions;
  const linksId = ions.links.filter((l) => l.identidade);
  const linksCob = linksId.filter((l) => l.coberto);
  const extras = ions.metais.reduce((s, m) => s + m.vizinhos.filter((v) => v.noLink).length, 0);
  const pares = ions.metais.reduce((s, m) => s + m.vizinhos.length, 0);
  const ssId = r.dissulfetos.registros.filter((x) => x.identidade);
  const ssCob = ssId.filter((x) => x.coberto);
  const gId = r.glicosilacao.linksAsnC1.filter((x) => x.identidade);
  const gCob = gId.filter((x) => x.coberto);
  console.log("\n== " + id + " ==");
  console.log("modelos no texto", r.nModelos, "raio metal", r.raios.metal);
  console.log("cadeias", r.inventario.cadeias.map((c) => c.cadeia + ":ATOM " + c.atom + " HET " + c.hetatm + " HOH " + c.aguas + " alt " + c.altlocAtomos + " ANISOU " + c.anisou).join(" | "));
  console.log("HET", r.inventario.hets.map((h) => h.resname + "×" + h.copias.length + " [" + h.classe + "]").join(", "));
  console.log("lacunas", r.inventario.lacunas.length, "REMARK 465", r.inventario.remark465.length, "ANISOU", r.inventario.anisou);
  console.log("metais", ions.metais.length, ions.metais.map((m) => m.nomeArquivo + " " + m.cadeia + m.resseq + " occ " + m.occupancy + " viz " + m.vizinhos.length).join("; "));
  console.log("pares N/O/S", pares, "sem LINK 1555", extras, "LINK metal 1555", linksCob.length + "/" + linksId.length, "LINK simetria", ions.links.filter((l) => !l.identidade).length);
  for (const m of ions.metais) {
    console.log(" ", m.nomeArquivo, m.elemento, m.cadeia, m.resseq, "serial", m.serial);
    for (const v of m.vizinhos) {
      console.log("   ", v.distancia.toFixed(2), v.nome, v.resname, v.cadeia, v.resseq, v.noLink ? "SEM-LINK" : "LINK", v.notas[0] ? "(" + v.notas[0].slice(0, 40) + ")" : "");
    }
  }
  console.log("SS pares", r.dissulfetos.pares.length, "SSBOND 1555 cobertos", ssCob.length + "/" + ssId.length);
  for (const p of r.dissulfetos.pares) {
    console.log("  SG", p.a.cadeia, p.a.resseq, p.b.cadeia, p.b.resseq, p.distancia.toFixed(2), p.noSsbond ? "SEM-SSBOND" : "SSBOND");
  }
  console.log("ASN–C1", r.glicosilacao.pares.length, "LINK cobertos", gCob.length + "/" + gId.length, "arvores", r.glicosilacao.arvores.length);
  for (const p of r.glicosilacao.pares) {
    console.log("  ", p.distancia.toFixed(2), p.asn.cadeia, p.asn.resseq, p.acucar.resname, p.acucar.cadeia, p.acucar.resseq, p.conhecido ? "lista" : "FORA", p.noLink ? "SEM-LINK" : "LINK");
  }
  for (const a of r.glicosilacao.arvores) {
    console.log("  arvore", a.id, a.residuos.map((x) => x.resname + x.cadeia + x.resseq + "→" + x.numeroSugerido).join(", "));
  }
  const cand = r.histidinas.itens.filter((h) => h.candidato !== "nenhum");
  console.log("HIS", r.histidinas.itens.length, "com candidato", cand.length);
  for (const h of cand) console.log("  HIS", h.cadeia, h.resseq, h.texto);
  console.log("águas entre metais", r.ions.aguasEntre.length);
  return { linksCob: linksCob.length, linksId: linksId.length, ssCob: ssCob.length, ssId: ssId.length, gCob: gCob.length, gId: gId.length, pares, extras };
}

async function main() {
  testeSintetico();
  for (const id of IDS) {
    const txt = await baixar(id);
    const r = Prep.analisar(txt, {});
    const s = resumo(id, r);
    if (id === "4EYL") {
      assert(r.ions.metais.length === 4, "4EYL tem 4 Zn");
      assert(r.ions.metais.every((m) => m.elemento === "ZN"), "4EYL metais são Zn");
      assert(s.linksId === 18 && s.linksCob === 18, "4EYL LINK de metal 1555 todos achados na geometria (" + s.linksCob + "/" + s.linksId + ")");
      assert(r.dissulfetos.pares.length === 0 && r.dissulfetos.registros.length === 0, "4EYL sem dissulfeto");
      assert(r.glicosilacao.pares.length === 0, "4EYL sem ASN–C1");
      const limpo = Prep.limparPdb(txt, { removerAguas: true, altloc: "A" });
      assert(!limpo.pdb.includes("\nANISOU"), "4EYL limpo sem ANISOU");
      assert(limpo.ions.length === 4, "4EYL exporta 4 arquivos de íon");
    }
    if (id === "1GZM") {
      assert(s.ssId === 2 && s.ssCob === 2, "1GZM 2/2 SSBOND (" + s.ssCob + "/" + s.ssId + ")");
      assert(s.gId === 4 && s.gCob === 4, "1GZM 4/4 LINK ASN–C1 (" + s.gCob + "/" + s.gId + ")");
      assert(r.glicosilacao.arvores.length === 4, "1GZM 4 árvores de açúcar, observado " + r.glicosilacao.arvores.length);
      assert(r.ions.metais.length === 2, "1GZM 2 Zn");
    }
    if (id === "1HSG") {
      assert(r.ions.metais.length === 0, "1HSG sem metal");
      assert(r.dissulfetos.pares.length === 0 && r.dissulfetos.registros.length === 0, "1HSG sem dissulfeto");
      assert(r.glicosilacao.pares.length === 0, "1HSG sem glicosilação");
      assert(r.inventario.hets.some((h) => h.resname === "MK1"), "1HSG tem MK1");
    }
    if (id === "5ORG") {
      assert(r.ions.metais.length === 9 && r.ions.metais.every((m) => m.elemento === "NA"), "5ORG 9 sódio");
      assert(r.inventario.anisou > 0, "5ORG tem ANISOU");
      assert(r.dissulfetos.registros.length === 0, "5ORG sem SSBOND");
      const limpo = Prep.limparPdb(txt, { removerAguas: true, altloc: "A" });
      assert(!limpo.pdb.split("\n").some((l) => l.startsWith("ANISOU")), "5ORG limpo sem ANISOU");
      assert(!limpo.pdb.split("\n").some((l) => l.startsWith("HETATM") && l.substring(17, 20).trim() === "HOH"), "5ORG limpo sem HOH");
      assert(limpo.pdb.includes("6DB"), "5ORG limpo mantém o heteroátomo 6DB por padrão");
    }
    assert(r.predita == null, id + " experimental não é tratado como predito");
  }
  console.log("\n" + ok + " assertivas ok, " + falhas + " falhas");
  if (falhas) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
