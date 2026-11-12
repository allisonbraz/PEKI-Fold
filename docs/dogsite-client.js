"use strict";

// Toda a deteccao roda no navegador: POST cria o job, faz-se polling ate o
// resultado ficar pronto e a tabela de descritores (TSV) e baixada e parseada.
const DOGSITE_API = "https://proteins.plus/api/dogsite_rest";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Cache de pockets por sessão, por ID do PDB — evita re-chamar a API (e o rate limit)
// ao reanalisar a mesma proteína ou ao usá-la na comparação.
const POCKETS_CACHE = {};

async function obterPockets(id, onTick, deveParar) {
  const verificar = () => {
    if (typeof deveParar === "function" && deveParar()) throw new Error("Cálculo cancelado.");
  };
  verificar();
  const chave = String(id).toUpperCase();
  if (POCKETS_CACHE[chave]) return POCKETS_CACHE[chave];
  const location = await dogsiteSubmit(id);
  verificar();
  const resultado = await dogsitePoll(location, onTick, deveParar);
  verificar();
  const resposta = await fetch(resultado.result_table);
  verificar();
  const txt = await resposta.text();
  verificar();
  const pockets = parseTabelaPockets(txt);
  pockets.forEach((p, i) => { p.residuosUrl = (resultado.residues || [])[i] || null; });
  POCKETS_CACHE[chave] = { pockets, residues: resultado.residues || [] };
  return POCKETS_CACHE[chave];
}

// Colunas usadas da tabela de descritores do DoGSiteScorer.
const POCKET_COLS = {
  name: "name", volume: "volume", surface: "surface", depth: "depth",
  accept: "accept", donor: "donor", hydrophobicity: "hydrophobicity",
  drugScore: "drugScore",
};

async function dogsiteSubmit(pdbId, opcoes) {
  const codigo = opcoes && opcoes.preservarCaixa ? String(pdbId) : String(pdbId).toLowerCase();
  let resp;
  try {
    resp = await fetch(DOGSITE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        dogsite: {
          pdbCode: codigo,
          analysisDetail: "0",                  // 0 = pockets (sem subpockets)
          bindingSitePredictionGranularity: "1", // 1 = propriedades + druggability
          ligand: "", chain: "",
        },
      }),
    });
  } catch (e) {
    throw new Error("Sem conexão com a API ProteinsPlus (ou bloqueio de rede).");
  }
  if (resp.status === 429) throw new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
  if (!resp.ok && resp.status !== 202 && resp.status !== 200) {
    throw new Error(`Erro ao enviar à API DoGSite (${resp.status}).`);
  }
  const data = await resp.json();
  if (!data.location) throw new Error("Resposta inesperada da API DoGSite (sem 'location').");
  return data.location;
}

async function dogsitePoll(location, onTick, deveParar) {
  const parar = () => typeof deveParar === "function" && deveParar();
  for (let i = 0; i < 45; i++) { // ~3 min no maximo (45 x 4s)
    if (parar()) throw new Error("Cálculo cancelado.");
    let r;
    try { r = await fetch(location, { headers: { Accept: "application/json" } }); }
    catch (e) { throw new Error("Conexão perdida durante o cálculo dos pockets."); }
    if (parar()) throw new Error("Cálculo cancelado.");
    if (r.status === 429) throw new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
    if (r.status === 200) {
      const d = await r.json();
      if (parar()) throw new Error("Cálculo cancelado.");
      if (d.result_table) return d;
    }
    if (onTick) onTick(i + 1);
    for (let s = 0; s < 4; s++) {
      if (parar()) throw new Error("Cálculo cancelado.");
      await sleep(1000);
    }
  }
  throw new Error("Tempo esgotado aguardando o DoGSiteScorer.");
}

// Converte o TSV de descritores num array de objetos {name, volume, ...}.
function parseTabelaPockets(txt) {
  const linhas = txt.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const header = linhas[0].split("\t").map((h) => h.trim());
  const idx = {};
  for (const [k, col] of Object.entries(POCKET_COLS)) idx[k] = header.indexOf(col);

  const num = (v) => { const n = parseFloat(String(v).trim()); return Number.isFinite(n) ? n : null; };
  const pockets = [];
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split("\t");
    const nome = (c[idx.name] || `P_${i - 1}`).trim();
    // analysisDetail=0 ja retorna so pockets, mas filtramos subpockets por seguranca
    if (/_\d+_\d+$/.test(nome)) continue;
    pockets.push({
      name: nome,
      volume: num(c[idx.volume]),
      surface: num(c[idx.surface]),
      depth: num(c[idx.depth]),
      accept: num(c[idx.accept]),
      donor: num(c[idx.donor]),
      hydrophobicity: num(c[idx.hydrophobicity]),
      drugScore: num(c[idx.drugScore]),
    });
  }
  return pockets;
}
