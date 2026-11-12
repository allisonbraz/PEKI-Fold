"use strict";

// Deliberate baseline capture only. Never called by the test suite.
const fs = require("node:fs");
const path = require("node:path");
const { cases, GOLDENS } = require("./characterization-cases.js");

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--write") {
    throw new Error("Captura altera as referências. Use explicitamente: node tests/helpers/capture-characterization.js --write");
  }
  fs.mkdirSync(GOLDENS, { recursive: true });
  for (const [name, capture] of Object.entries(cases)) {
    const output = JSON.stringify(await capture(), null, 2) + "\n";
    fs.writeFileSync(path.join(GOLDENS, name + ".json"), output, "utf8");
    console.log(name + ": " + Buffer.byteLength(output) + " bytes");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
