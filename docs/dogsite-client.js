"use strict";

// Toda a deteccao roda no navegador: POST cria o job, faz-se polling ate o
// resultado ficar pronto e a tabela de descritores (TSV) e baixada e parseada.
const DOGSITE_API = "https://proteins.plus/api/dogsite_rest";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Cache de pockets por sessão, por ID do PDB — evita re-chamar a API (e o rate limit)
// ao reanalisar a mesma proteína ou ao usá-la na comparação.
const POCKETS_CACHE = {};

async function obterPockets(id, onTick, deveParar) {
  const chave = String(id).toUpperCase();
  if (POCKETS_CACHE[chave]) return POCKETS_CACHE[chave];
  const location = await dogsiteSubmit(id);
  const resultado = await dogsitePoll(location, onTick, deveParar);
  const txt = await (await PekiRede.fetch(resultado.result_table)).text();
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
    resp = await PekiRede.fetch(DOGSITE_API, {
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
    if (PekiRede.ehTimeout(e)) throw e;
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
  return PekiRede.limitar((signal) => consultarJobDogsite(location, onTick, deveParar, signal), { chave: "dogsiteJob" });
}

async function consultarJobDogsite(location, onTick, deveParar, signal) {
  const polling = PekiRede.config.polling.dogsite;
  const parar = () => typeof deveParar === "function" && deveParar();
  for (let i = 0; i < polling.tentativas; i++) {
    if (parar()) throw new Error("Cálculo cancelado.");
    if (signal && signal.aborted) throw PekiRede.erroTimeout();
    let r;
    try { r = await PekiRede.fetch(location, { signal, headers: { Accept: "application/json" } }); }
    catch (e) { if (PekiRede.ehTimeout(e)) throw e; throw new Error("Conexão perdida durante o cálculo dos pockets."); }
    if (r.status === 429) throw new Error("Limite de uso da API atingido. Tente novamente em alguns minutos.");
    if (r.status === 200) {
      const d = await r.json();
      if (d.result_table) return d;
    }
    if (signal && signal.aborted) throw PekiRede.erroTimeout();
    if (onTick) onTick(i + 1);
    for (let s = 0; s < polling.passos; s++) {
      if (parar()) throw new Error("Cálculo cancelado.");
      await sleep(polling.intervaloMs);
    }
  }
  throw PekiRede.erroTimeout();
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
