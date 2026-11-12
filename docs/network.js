"use strict";

// Única configuração de prazos de rede, em milissegundos.
const PEKI_REDE_CONFIG = {
  padraoMs: 20000,
  excecoes: {
    qualidadeXml: { ms: 12000, motivo: "Primeira tentativa: o XML wwPDB é maior que o resumo JSON." },
    qualidadeJson: { ms: 8000, motivo: "Alternativa leve após o XML; preserva a janela de resposta do relatório." },
    dogsiteJob: { ms: 180000, motivo: "O cálculo remoto é assíncrono e pode passar por várias verificações." },
    uploadJob: { ms: 60000, motivo: "A ProteinsPlus prepara o modelo enviado em um job assíncrono." },
  },
  polling: {
    dogsite: { tentativas: 45, passos: 4, intervaloMs: 1000 },
    upload: { tentativas: 30, intervaloMs: 2000 },
  },
};

const PekiRede = (() => {
  const TIMEOUT = Object.freeze({ estado: "erro", codigo: "timeout",
    mensagem: "A consulta excedeu o tempo-limite. Tente de novo." });
  function erroTimeout() { return Object.assign(new Error(TIMEOUT.mensagem), TIMEOUT, { name: "TimeoutError" }); }
  function ehTimeout(e) { return !!(e && e.codigo === TIMEOUT.codigo); }
  function tempo(opcoes = {}) {
    // tempoMs mantém a injeção já disponível em BuscaNome.pesquisar({ esperaMs }).
    if (typeof opcoes.tempoMs === "number") return opcoes.tempoMs;
    return opcoes.chave ? PEKI_REDE_CONFIG.excecoes[opcoes.chave].ms : PEKI_REDE_CONFIG.padraoMs;
  }
  function iniciarPrazo(aoExpirar, opcoes = {}) {
    const ctrl = opcoes.controller || (typeof AbortController !== "undefined" ? new AbortController() : null);
    const sinal = opcoes.signal;
    const cortar = () => { if (ctrl) ctrl.abort(); };
    let encerrado = false, erro = null;
    if (sinal) {
      if (sinal.aborted) cortar();
      else sinal.addEventListener("abort", cortar, { once: true });
    }
    const timer = setTimeout(() => {
      erro = erroTimeout();
      fim();
      aoExpirar(erro);
      cortar();
    }, tempo(opcoes));
    function fim() {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timer);
      if (sinal) sinal.removeEventListener("abort", cortar);
    }
    return { signal: ctrl ? ctrl.signal : sinal, fim, erro: () => erro };
  }
  function limitar(tarefa, opcoes = {}) {
    return new Promise((resolve, reject) => {
      const prazo = iniciarPrazo(reject, opcoes);
      let resultado;
      try { resultado = tarefa(prazo.signal); }
      catch (e) { prazo.fim(); reject(prazo.erro() || e); return; }
      Promise.resolve(resultado).then((valor) => { prazo.fim(); resolve(valor); },
        (e) => { prazo.fim(); reject(prazo.erro() || e); });
    });
  }
  async function consultar(url, options = {}, opcoes = {}) {
    const fetchImpl = opcoes.fetch || fetch;
    const ms = tempo(opcoes);
    const fim = Date.now() + ms;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const resposta = await limitar((signal) => fetchImpl(url, { ...options, ...(signal ? { signal } : {}) }),
      { ...opcoes, tempoMs: ms, controller: ctrl, signal: options.signal });
    if (!resposta || typeof resposta !== "object") return resposta;
    const ler = (tarefa) => {
      const restante = Math.max(0, fim - Date.now());
      if (!restante) { if (ctrl) ctrl.abort(); return Promise.reject(erroTimeout()); }
      return limitar(tarefa, { tempoMs: restante, controller: ctrl,
        signal: opcoes.cancelarCorpo === false ? null : options.signal });
    };
    let corpo;
    return new Proxy(resposta, { get(alvo, campo) {
      const valor = Reflect.get(alvo, campo, alvo);
      if (["text", "json", "arrayBuffer", "blob", "formData", "bytes"].includes(campo) && typeof valor === "function") {
        return (...args) => ler(() => valor.apply(alvo, args));
      }
      if (campo === "body" && valor && typeof valor.getReader === "function") {
        if (!corpo) corpo = new Proxy(valor, { get(stream, chave) {
          if (chave === "getReader") return (...args) => {
            const reader = stream.getReader(...args);
            return new Proxy(reader, { get(r, prop) {
              if (prop === "read") return (...params) => ler(() => r.read(...params));
              const item = Reflect.get(r, prop, r);
              return typeof item === "function" ? item.bind(r) : item;
            } });
          };
          const item = Reflect.get(stream, chave, stream);
          return typeof item === "function" ? item.bind(stream) : item;
        } });
        return corpo;
      }
      return typeof valor === "function" ? valor.bind(alvo) : valor;
    } });
  }
  return { config: PEKI_REDE_CONFIG, TIMEOUT, tempo, erroTimeout, ehTimeout, iniciarPrazo, limitar, fetch: consultar };
})();

if (typeof module !== "undefined" && module.exports) module.exports = PekiRede;
