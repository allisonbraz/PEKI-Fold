"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { cases, GOLDENS, json, models } = require("./helpers/characterization-cases.js");

// Expected files are checked in. A normal test run never writes or updates them.
for (const [name, capture] of Object.entries(cases)) {
  test("saída atual: " + name, async () => {
    const expected = JSON.parse(fs.readFileSync(path.join(GOLDENS, name + ".json"), "utf8"));
    assert.deepStrictEqual(json(await capture()), expected);
  });
}

// These are deliberate records of existing defects, not desired behavior.
// A future bug fix should change these tests in its own reviewed change.
test("comportamento conhecido: null vira zero no JSON salvo", () => {
  const { nulosAtuais } = cases.snapshots();
  assert.equal(nulosAtuais.pockets.itens[0].drugScore, 0);
  assert.equal(nulosAtuais.qualidade.metricas[0].valor, 0);
});

test("comportamento conhecido: validação interna aceita métricas com tipo incorreto", () => {
  const AS = models().get("AnalysisSnapshot");
  const snapshot = cases.snapshots().snapshot;
  snapshot.qualidade = { estado: "ok", metricas: {} };
  assert.equal(AS.validarObjeto(snapshot).ok, true);
  assert.throws(() => AS.comparar([snapshot, { ...snapshot, id: "SIN-OUTRO" }], {}), /lista\.find is not a function/);
});

test("comportamento conhecido: XML em blocos perde subgrupo após 64 KiB", async () => {
  const QM = models().get("QualityModel");
  const xml = '<wwPDB-validation-information><Entry pdbid="1ABC" percentilebins="xray" clashscore="1"/><!--'
    + "x".repeat(70000)
    + '--><ModelledSubgroup chain="A" resnum="1" model="1" resname="GLY"/></wwPDB-validation-information>';
  const chunks = [Buffer.from(xml.slice(0, 65536)), Buffer.from(xml.slice(65536))];
  let index = 0;
  const response = { status: 200, body: { getReader: () => ({
    read: async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true },
    cancel: async () => {},
  }) } };
  const direct = QM.lerXml(xml, { id: "1ABC" });
  const streamed = await QM.consultarRelatorio("1ABC", { fetch: async () => response });
  assert.equal(direct.local.subgruposLidos, 1);
  assert.equal(streamed.estado, "ok");
  assert.equal(streamed.local.subgruposLidos, 0);
});
