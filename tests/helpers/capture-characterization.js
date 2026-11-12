"use strict";

// Deliberate baseline capture only. Never called by the test suite.
const fs = require("node:fs");
const path = require("node:path");
const { cases, GOLDENS } = require("./characterization-cases.js");

async function main() {
  if (process.argv[2] !== "--write") {
    throw new Error("Captura altera as referências. Use explicitamente: node tests/helpers/capture-characterization.js --write [casos...]");
  }
  const names = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(cases);
  for (const name of names) {
    if (!Object.hasOwn(cases, name)) throw new Error("Caso desconhecido: " + name);
  }
  fs.mkdirSync(GOLDENS, { recursive: true });
  for (const name of names) {
    const output = JSON.stringify(await cases[name](), null, 2) + "\n";
    fs.writeFileSync(path.join(GOLDENS, name + ".json"), output, "utf8");
    console.log(name + ": " + Buffer.byteLength(output) + " bytes");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
