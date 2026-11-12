"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// The page's classic scripts share lexical bindings (estado, $, $$, esc).
// Keep that same shared scope for the legacy CommonJS suites, without adding
// Node-only globals or exports to production. The existing DOM/global mocks
// remain live, including fetch and PrepUI replacements made by each test.
const source = ["network.js", "viewer.js", "comparison.js", "export.js", "app.js"].map((name) =>
  fs.readFileSync(path.join(__dirname, "../../docs", name), "utf8")
).join("\n");
const run = vm.runInThisContext("(function (module) {\n" + source + "\n})", {
  filename: "viewer-app.test-harness.js",
});
const app = { exports: {} };
run(app);
module.exports = app.exports;
