"use strict";

// Optional preload for running ALL legacy suites without external requests.
// The old 4HHB smoke keeps its fetch boundary, served from the public fixture.
// The prep suite's previously cached PDB fixtures must already be local;
// attempting their download fails loudly instead of reaching the network.
const fs = require("node:fs");
const path = require("node:path");
const forbidden = () => { throw new Error("Rede real bloqueada pelo preload dos testes."); };
for (const protocol of [require("node:http"), require("node:https")]) {
  protocol.get = forbidden;
  protocol.request = forbidden;
}
globalThis.fetch = async (input) => {
  const url = String(input && input.url || input);
  const match = url.match(/^https:\/\/files\.rcsb\.org\/download\/(1CRN|4HHB)\.pdb$/);
  if (!match) return forbidden();
  const data = fs.readFileSync(path.join(__dirname, "../fixtures/ui-render", match[1] + ".pdb"));
  return new Response(data, { status: 200, headers: { "Content-Type": "chemical/x-pdb" } });
};
