"use strict";

const vm = require("node:vm");
const { browser, read } = require("./characterization-cases.js");
const html = read("docs/index.html");

// DOM mínimo só para eventos/estado. Layout, Tab e Esc nativos são verificados
// também em navegador; este harness não tenta simular o comportamento do browser.
function harness() {
  const h = browser(["pdb-analysis", "structure-model", "dogsite-client", "viewer", "comparison", "export", "app"]);
  const nodes = new Map(), ready = [], docListeners = {};
  let all = [];
  class El {
    constructor(tag = "div") {
      this.tag = tag; this.attrs = {}; this.dataset = {}; this.listeners = {};
      this.hidden = false; this.disabled = false; this.isConnected = true;
      this.value = ""; this.checked = false; this.textContent = ""; this._html = ""; this.children = [];
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === "id") { this.id = v; nodes.set("#" + v, this); }
      if (k === "class") this.className = v;
      if (k.startsWith("data-")) this.dataset[k.slice(5)] = v;
      if (["hidden", "disabled", "checked"].includes(k)) this[k] = true;
      if (k === "value") this.value = v;
      if (k === "open") this.open = true;
    }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) {
      delete this.attrs[k];
      if (k === "open") this.open = false;
      if (k.startsWith("data-")) delete this.dataset[k.slice(5)];
    }
    contains(el) { return this === el || this.children.includes(el); }
    get classList() { return { toggle: (c, on) => {
      const classes = new Set((this.className || "").split(/\s+/).filter(Boolean));
      if (on) classes.add(c); else classes.delete(c);
      this.className = [...classes].join(" ");
    } }; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatch(type, extras = {}) {
      const event = { target: this, currentTarget: this, preventDefault() {}, ...extras };
      for (const fn of this.listeners[type] || []) fn(event);
    }
    click() { this.dispatch("click"); }
    focus() { h.context.document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch("close"); }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    querySelectorAll(s) {
      const pool = this.tabs || this.children;
      return pool.filter((n) => s.startsWith(".") ? (n.className || "").split(/\s+/).includes(s.slice(1)) : n.tag === s);
    }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this._html = value;
      for (const n of this.children) { n.isConnected = false; all = all.filter((e) => e !== n); }
      this.children = parse(value);
    }
    appendChild(n) {
      if (n.parent) n.parent.children = n.parent.children.filter((el) => el !== n);
      n.parent = this; this.children.push(n); return n;
    }
  }
  function parse(source) {
    return [...source.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((m) => {
      const e = new El(m[1]);
      for (const a of m[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) e.setAttribute(a[1], a[2] ?? "");
      all.push(e);
      return e;
    });
  }
  parse(html);
  const tabs = (prefix) => all.filter((n) => n.getAttribute("role") === "tab" && n.id.startsWith(prefix));
  const workspaceTabs = new El(), comparisonTabs = new El();
  workspaceTabs.tabs = tabs("aba-"); comparisonTabs.tabs = tabs("caba-");
  nodes.set("#workspace .abas", workspaceTabs); nodes.set("#comparacao .abas", comparisonTabs);
  const selectAll = (s) => {
    if (s === '#workspace .aba[data-tab="preparo"]') return workspaceTabs.tabs.filter((t) => t.dataset.tab === "preparo");
    if (s === "#workspace .aba") return workspaceTabs.tabs;
    if (s === "#comparacao .aba") return comparisonTabs.tabs;
    if (s.endsWith(" .aba-conteudo")) {
      const prefix = s.startsWith("#workspace") ? "tab-" : "ctab-";
      return all.filter((e) => e.id && e.id.startsWith(prefix));
    }
    if (s.startsWith("#pockets-resultado ")) return nodes.get("#pockets-resultado").querySelectorAll(s.split(" ")[1]);
    if (s.startsWith(".")) return all.filter((e) => (e.className || "").split(/\s+/).includes(s.slice(1)));
    return [];
  };
  const doc = h.context.document;
  doc.body = { dataset: {}, addEventListener() {} };
  doc.querySelector = (s) => nodes.get(s) || selectAll(s)[0] || null;
  doc.querySelectorAll = selectAll;
  doc.getElementById = (id) => nodes.get("#" + id) || null;
  doc.createElement = (tag) => new El(tag);
  doc.addEventListener = (type, fn) => {
    if (type === "DOMContentLoaded") ready.push(fn);
    else (docListeners[type] ||= []).push(fn);
  };
  doc.removeEventListener = (type, fn) => { docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn); };
  doc.dispatch = (type, ev) => { for (const fn of docListeners[type] || []) fn(ev); };
  const dialog = nodes.get("#export-modal");
  dialog.children = all.filter((e) => e.tag === "input" && e.getAttribute("name") === "exp-fmt");
  h.context.window.addEventListener = () => {};
  h.context.window.scrollTo = () => {};
  h.context.location = { search: "" };
  h.context.URLSearchParams = URLSearchParams;
  h.context.localStorage = { getItem: () => null };
  const plots = [];
  h.context.libPlotly = async () => {};
  h.context.window.Plotly = h.context.Plotly = { newPlot: (...args) => { plots.push(args); return Promise.resolve(); }, Plots: { resize() {} } };
  return { ...h, el: (id) => nodes.get("#" + id), nodes, plots, ready, docListeners, load: (file) => vm.runInContext(read("docs/" + file + ".js"), h.context) };
}

module.exports = { harness };
