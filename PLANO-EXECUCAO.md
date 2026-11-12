# PLANO DE EXECUÇÃO — auditoria de usabilidade do PEKI Fold

Este plano transforma a auditoria de frontend (itens A1–A8, M1–M13, B1–B10) em 28 tarefas pequenas. Cada tarefa foi escrita para ser executada por um modelo que **não viu a conversa de origem**: ele recebe o bloco "Instruções para o executor", uma tarefa e o código.

**Estado do código em que o plano foi conferido:** branch `refactor/estrutura`, commit `f252627`. Nesse commit o frontend está em `docs/` com estes scripts, nesta ordem no `index.html`: `pdb-analysis.js`, `structure-model.js`, `quality-model.js`, `quality-ui.js`, `prep-analysis.js`, `ensemble-analysis.js`, `prep-ui.js`, `analysis-snapshot.js`, `analysis-ui.js`, `busca-nome.js`, `dogsite-client.js`, `viewer.js`, `comparison.js`, `export.js`, `libs-loader.js`, `app.js`, `ensemble-ui.js`.

**Antes de começar (Allison):**

1. Havia uma alteração não commitada em `docs/structure-model.js` quando o plano foi escrito. Termine ou descarte esse trabalho antes; as tarefas pedem árvore limpa.
2. Crie um branch próprio a partir do estado final da refatoração, por exemplo `ux/auditoria`.
3. Responda às decisões da próxima seção. Cada tarefa já traz a opção recomendada escrita por extenso; se você escolher outra, edite o texto da tarefa antes de colar.

---

## Instruções para o executor

Cole este bloco junto com cada tarefa.

```
Você vai executar UMA tarefa de um plano já decidido, no repositório PEKI-Fold.
O site é estático: HTML, CSS e JavaScript em docs/, sem build e sem backend.

REGRAS
1. Siga a tarefa à risca. Faça só o que está em "Fazer". Não corrija, não
   renomeie, não reformate e não "melhore" nada fora dela, mesmo que pareça errado.
2. Antes de editar, ache o trecho pelo que está em "Localizar". Se o trecho não
   existir, estiver diferente do "antes" mostrado, ou aparecer mais de uma vez
   quando a tarefa espera uma, PARE e reporte. Não adapte por conta própria.
3. Respeite "Não fazer". Além disso, em qualquer tarefa é proibido:
   - mudar o formato do JSON salvo (docs/analysis-snapshot.js e a função
     resumoAnalise em docs/prep-ui.js não são tocados, salvo ordem expressa);
   - mudar textos de aviso científico (frases sobre drugScore, docking,
     afinidade, holo/apo) além do que a tarefa manda;
   - mudar a ordem das tags <script> em docs/index.html;
   - alterar cores do tema escuro (regras [data-theme="dark"]) sem ordem expressa;
   - adicionar dependência, build, framework ou arquivo novo sem ordem expressa.
4. A árvore do git deve estar limpa ao começar. Se não estiver, PARE.
5. Depois de editar, rode todos os testes, um arquivo por vez, a partir da raiz:
       for f in tests/*.test.js; do node "$f" || echo "FALHOU: $f"; done
   Todos precisam passar. Se um teste falhar:
   - se a tarefa diz como tratar aquela falha, faça exatamente aquilo;
   - senão, PARE e reporte a saída. Não edite testes nem arquivos em
     tests/fixtures/ por conta própria.
6. Se você não tem navegador para os itens de "Verificar", execute o que der
   (testes, leitura do diff) e diga com clareza quais verificações visuais
   ficaram por fazer. Não afirme que verificou o que não verificou.
7. Um commit por tarefa, só com os arquivos da tarefa. Mensagem:
       ux(TNN): <título da tarefa>
   Não faça push, merge, rebase nem amend.
8. Ao terminar, mostre: o diff completo (git show --stat e git show), a saída
   dos testes, e a lista de verificações feitas e não feitas.
9. "Se der errado" diz quando parar. Parar e reportar é um resultado aceitável.
   Improvisar não é.
```

---

## Decisões do Allison antes de começar

| # | Decisão | Afeta | Recomendação |
|---|---|---|---|
| D1 | Termo para a cavidade: "pocket", "bolsão" ou os dois? | T08 | Manter os dois onde estão e acrescentar uma linha de glossário. Trocar "bolsão" por "pocket" no Ensemble mexeria em frases que os testes e as exportações fixam. |
| D2 | Como tratar termos internos ("Contrato peki-estrutura-1", "author/label") na tela. | T23 | Tirar "Contrato …" do topo e deixá-lo como "Formato interno" dentro de "Limites desta versão". Trocar "author/label" por "rótulo interno do arquivo". As exportações não mudam. |
| D3 | Quais avisos do Ensemble ficam sempre visíveis. | T09 | Cinco visíveis: o parágrafo do trabalho relacionado, o link do DOI, "Persistência indica…", "Resultado exploratório…" e "PEKI Fold não é ferramenta de docking.". Os outros 14 vão para "Limites desta análise", sem mudar o texto. |
| D4 | Alinhamento da tela inicial. | T27 | Textos e formulários à esquerda; logo, título e os separadores "— ou —" centralizados. |
| D5 | O que vai para "Mais opções" na tela inicial. | T27 | Comparar proteínas, comparar análises guardadas e ensemble. Código/nome, upload e exemplos ficam à vista. O bloco "O que faz / não faz" desce para depois deles. |
| D6 | O que o card "Sobre a estrutura" mantém. | T22 | Título, classificação, etiquetas (método, resolução etc.), a linha de heterocomponentes e o aviso de estrutura predita. Sai o parágrafo de lacunas/holo/formato, que já está na Visão geral. |
| D7 | Botão FASTA verde ou igual aos outros downloads. | T05 | Igual aos outros (azul claro). |
| D8 | Emojis: trocar por SVG ou só esconder do leitor de tela. | T07 | Só esconder (`aria-hidden`). Trocar por SVG é um trabalho de design à parte. |
| D9 | Confirmar ao sair da análise. | T21 | Confirmar só quando houver anotação ou caixa na ficha de preparo, com `confirm()` do navegador. Pockets ficam no cache da sessão e não precisam de aviso. |
| D10 | Texto dos exemplos da tela inicial. | T27 | "4HHB (4 cadeias, com heme)", "1CRN (1 cadeia, 46 resíduos)" e "1A00 (4 cadeias)". |
| D11 | Altura do viewer no celular. | T25 | 240 px até 700 px de largura. |

---

## Ordem dos lotes

- **Lote 1 — CSS mecânico:** T01 a T06
- **Lote 2 — textos e HTML estático:** T07 a T09
- **Lote 3 — acessibilidade pontual:** T10 a T15
- **Lote 4 — comportamento:** T16 a T23
- **Lote 5 — layout (mais arriscado):** T24 a T28

Execute na ordem numérica. Tarefas do mesmo lote mexem em trechos diferentes, mas vários lotes tocam `docs/style.css`, `docs/index.html` e `docs/app.js`; por isso é uma de cada vez, com commit entre elas.

---

# Lote 1 — CSS mecânico

### T01 (M9) — Escurecer o texto secundário no tema claro
- **Modelo:** HAIKU. Troca de um valor em uma linha.
- **Arquivos:** `docs/style.css`
- **Localizar:** o bloco `:root {` no início do arquivo, linha `--muted: #6b7689;`.
- **Fazer:** trocar para `--muted: #5f6a7d;`.
- **Não fazer:** não alterar o `--muted` do bloco `[data-theme="dark"]` (`#93a0b5` continua). Não alterar nenhuma outra variável.
- **Depende de:** nada.
- **Verificar:** abrir `?pdb=4HHB` no tema claro; a linha de resumo sob o título ("PDB · 4 cadeia(s) · …") deve estar um pouco mais escura e legível. O contraste esperado sobre o fundo `#f4f6fb` é cerca de 5:1. No tema escuro nada muda.
- **Se der errado:** se `--muted: #6b7689;` não existir em `:root`, pare.

### T02 (M6) — Rótulo e placeholder do campo "Comparar"
- **Modelo:** HAIKU. Um atributo e uma regra de CSS.
- **Arquivos:** `docs/index.html`, `docs/style.css`
- **Localizar:** no HTML, `<input id="cmp-ids" type="text" placeholder="IDs separados por espaço (ex.: 1A00 4HHB 1CRN)" />`. No CSS, a regra que começa com `.entrada-row input {` e contém `text-transform: uppercase;`.
- **Fazer:**
  1. No `<input id="cmp-ids" …>`, acrescentar o atributo `aria-label="Códigos PDB para comparar, separados por espaço"`.
  2. No CSS, logo depois da regra `#pdb-id { text-transform: none; }`, acrescentar:
     ```css
     .entrada-row input::placeholder, .motivo-row input::placeholder { text-transform: none; }
     ```
- **Não fazer:** não tirar o `text-transform: uppercase` do texto digitado. Não mexer no `<input id="pdb-id">`.
- **Depende de:** nada.
- **Verificar:** na tela inicial, o placeholder do campo de comparação aparece como "IDs separados por espaço (ex.: 1A00 4HHB 1CRN)", sem ficar todo em maiúsculas; ao digitar `4hhb 1crn` o texto continua aparecendo em maiúsculas. Na aba Motivos, o placeholder aparece como "ex.: GLY-LYS-SER".
- **Se der errado:** se o `<input id="cmp-ids">` tiver outros atributos além dos mostrados, pare.

### T03 (M10) — Alvos de toque nos controles do viewer
- **Modelo:** HAIKU. CSS aditivo.
- **Arquivos:** `docs/style.css`
- **Localizar:** a regra `.viewer-controls select { padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }`.
- **Fazer:** logo depois dessa regra, acrescentar:
  ```css
  .viewer-controls label { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; }
  .viewer-controls select, .cmp-est-head select, .aa-controls select { min-height: 40px; }
  .viewer-controls input[type="checkbox"] { width: 20px; height: 20px; }
  ```
- **Não fazer:** não alterar as regras existentes; só acrescentar.
- **Depende de:** nada.
- **Verificar:** em `?pdb=4HHB`, os seletores "Estilo" e "Tamanho" têm 40 px de altura e as caixas "Girar", "Ligantes" e "Superfície" têm 20 px. Em 375 px de largura a faixa de controles quebra em linhas sem criar rolagem horizontal.
- **Se der errado:** se a faixa de controles passar a criar rolagem horizontal em 375 px, pare e reporte.

### T04 (B5) — Esconder o subtítulo do cabeçalho no celular
- **Modelo:** HAIKU. Uma regra de CSS.
- **Arquivos:** `docs/style.css`
- **Localizar:** a regra `.tagline { margin: 0; font-size: .85rem; color: var(--muted); }`.
- **Fazer:** logo depois dela, acrescentar:
  ```css
  @media (max-width: 520px) {
    .tagline { display: none; }
  }
  ```
- **Não fazer:** não alterar o HTML do cabeçalho.
- **Depende de:** nada.
- **Verificar:** em 375 px o cabeçalho mostra só o logo, "PEKI Fold" e o botão de tema, e fica bem mais baixo (antes media 126 px). Acima de 520 px o subtítulo continua aparecendo.
- **Se der errado:** se a regra `.tagline` não existir, pare.

### T05 (B2) — Botão FASTA com o mesmo visual dos outros downloads
- **Modelo:** HAIKU. Substituição de três regras.
- **Arquivos:** `docs/style.css`
- **Localizar:** estas três regras, juntas:
  ```css
  .fasta-btn { background: rgba(46,160,90,.14); color: #1e673a; padding: 6px 12px; font-size: .85rem; }
  [data-theme="dark"] .fasta-btn { color: #4dcc7e; }
  .fasta-btn:hover { background: rgba(46,160,90,.28); }
  ```
- **Fazer:** substituir as três por:
  ```css
  .fasta-btn { background: rgba(42,85,153,.12); color: var(--primary); padding: 6px 12px; font-size: .85rem; }
  .fasta-btn:hover { background: rgba(42,85,153,.25); }
  ```
- **Não fazer:** não renomear a classe `fasta-btn` (o JavaScript a usa como seletor). Não mexer em `.dl-btn`.
- **Depende de:** D7.
- **Verificar:** em `?pdb=4HHB`, aba Cadeias: "FASTA (todas)" e cada "FASTA" têm o mesmo azul claro de "PDB". Clicar em um FASTA ainda baixa o arquivo. Conferir também no tema escuro.
- **Se der errado:** se as três regras não estiverem exatamente como mostrado, pare.

### T06 (B9) — Destacar a confirmação de "Guardar análise"
- **Modelo:** HAIKU. Uma classe no HTML e uma regra de CSS.
- **Arquivos:** `docs/index.html`, `docs/style.css`
- **Localizar:** no HTML, `<p id="guardar-status" class="muted small guardar-status" aria-live="polite"></p>`. No CSS, `.guardar-status { margin: 0 0 12px; }`.
- **Fazer:**
  1. No HTML, trocar `class="muted small guardar-status"` por `class="guardar-status"`.
  2. No CSS, logo depois de `.guardar-status { margin: 0 0 12px; }`, acrescentar:
     ```css
     .guardar-status:not(:empty) { padding: 8px 10px; border-radius: 8px; font-size: .9rem; background: rgba(42, 85, 153, .08); border-left: 4px solid var(--primary); }
     ```
- **Não fazer:** não tirar o `id` nem o `aria-live`. Não alterar o texto que o JavaScript escreve.
- **Depende de:** nada.
- **Verificar:** em `?pdb=4HHB`, antes de clicar não aparece caixa vazia. Depois de clicar em "Guardar análise", a mensagem aparece numa faixa azul clara com borda à esquerda.
- **Se der errado:** se aparecer uma faixa vazia antes do clique, pare e reporte.

---

# Lote 2 — textos e HTML estático

### T07 (B3) — Esconder emojis decorativos do leitor de tela
- **Modelo:** HAIKU. Substituição mecânica em pontos listados.
- **Arquivos:** `docs/index.html`, `docs/app.js`, `docs/comparison.js`
- **Localizar:** as ocorrências exatas listadas abaixo.
- **Fazer:** em cada ponto, envolver só o emoji em `<span aria-hidden="true">…</span>`, mantendo o espaço e o texto que vêm depois. Exemplo: `⬇ Exportar` vira `<span aria-hidden="true">⬇</span> Exportar`.
  - `docs/index.html` (10 pontos): `📁 Arraste um arquivo aqui`; `⬇ Exportar` no botão `id="btn-export"`; `↻ Nova análise` no botão `id="btn-novo"`; `⬇ CSV` no botão `id="btn-aa-csv"`; `🔍 Detectar pockets` no botão `id="btn-pockets"`; `⬇ Exportar` no botão `id="btn-cmp-export"`; `↻ Nova análise` no botão `id="btn-cmp-novo"`; `🔍 Detectar pockets (todas)` no botão `id="btn-cmp-pockets"`; `↻ Início` no botão `id="btn-an-voltar"`; `↻ Nova análise` no botão `id="ens-novo"`.
  - `docs/app.js` (5 pontos, todos dentro de strings de template que montam botões): `⬇ FASTA (todas)`; `⬇ PDB`; `⬇ FASTA`; `⬇ CSV` no botão `id="btn-stats-csv"`; `⬇ CSV` no botão `id="btn-pockets-csv"`.
  - `docs/comparison.js` (2 pontos): `⬇ CSV` no botão `id="btn-cmp-stats-csv"`; `⬇ CSV (todos os pockets)` no botão `id="btn-cmp-pockets-csv"`.
- **Não fazer:** não mexer em emojis atribuídos por `textContent` ou usados em mensagens de status: `👁 ocultar`, `👁 ver`, `☀️`, `🌙`, `✓`, `❌`, `⚠️`. Os testes conferem alguns desses textos. Não mexer no botão `id="theme-toggle"`.
- **Depende de:** D8.
- **Verificar:** visualmente nada muda. `grep -o 'aria-hidden="true">[⬇↻🔍📁]' docs/index.html | wc -l` deve dar 10. Em `?pdb=4HHB`, os botões Exportar, CSV, PDB e FASTA continuam funcionando.
- **Se der errado:** se algum dos 17 pontos não for encontrado, pare e diga qual.

### T08 (B4) — Linha de glossário no "Como usar"
- **Modelo:** HAIKU. Inserção de um item de lista com texto pronto.
- **Arquivos:** `docs/index.html`
- **Localizar:** dentro de `<details class="ajuda">`, o item que começa com `<li><strong>Upload</strong> de <code>.pdb</code> ou <code>.cif</code>`.
- **Fazer:** logo depois desse `<li>…</li>`, inserir:
  ```html
  <li><strong>Termos</strong>: pocket, bolsão e cavidade são a mesma coisa nesta página: a cavidade que o DoGSiteScorer detecta. ATOM são os átomos do polímero (proteína ou ácido nucleico) no arquivo. HETATM são os demais: água, íons, ligantes e resíduos modificados.</li>
  ```
- **Não fazer:** não trocar "bolsão" por "pocket" (ou o contrário) em nenhum outro lugar. Não editar os outros itens da lista.
- **Depende de:** D1.
- **Verificar:** na tela inicial, abrir "Como usar" e conferir o item novo logo após "Upload".
- **Se der errado:** se o item "Upload" não existir, pare.

### T09 (M3) — Recolher os avisos do Ensemble
- **Modelo:** HAIKU. Mover parágrafos sem alterar o texto.
- **Arquivos:** `docs/index.html`, `docs/style.css`
- **Localizar:** `<div class="ens-frases">`, dentro de `<main id="ensemble" …>`. Ele contém 19 parágrafos `<p …>`.
- **Fazer:**
  1. Deixar o conteúdo de `<div class="ens-frases">` nesta ordem, **recortando e colando os parágrafos sem mudar nenhum caractere do texto**:
     - o parágrafo que começa com `Trabalho relacionado: PockFlex`;
     - o parágrafo com o link `DOI 10.1093/nar/gkag453`;
     - o parágrafo `Persistência indica recorrência do bolsão no conjunto, não druggability nem ligação de composto.`;
     - o parágrafo `Resultado exploratório: é hipótese, não conclusão.`;
     - o parágrafo `PEKI Fold não é ferramenta de docking.`;
     - em seguida `<details class="ens-limites">`, com `<summary>Limites desta análise (14 avisos)</summary>` e, dentro, os 14 parágrafos restantes na ordem em que já estavam; fechar `</details>`.
  2. No CSS, logo depois da regra `.ens-leitura ul { margin: 6px 0 12px; padding-left: 18px; }`, acrescentar:
     ```css
     .ens-limites summary { cursor: pointer; font-weight: 600; color: var(--primary); min-height: 44px; display: flex; align-items: center; }
     ```
- **Não fazer:** não alterar, resumir nem corrigir o texto de nenhum parágrafo: um teste confere que frases exatas continuam no `index.html`. Não mexer em `docs/ensemble-analysis.js` nem em `docs/ensemble-ui.js`.
- **Depende de:** D3.
- **Verificar:** `node tests/ensemble-analysis.test.js` passa. Na tela inicial, clicar em "Exemplo sintético": aparecem 5 avisos e a linha "Limites desta análise (14 avisos)", que abre e fecha.
- **Se der errado:** se a contagem de parágrafos dentro de `.ens-frases` não for 19, pare e reporte o número encontrado.

---

# Lote 3 — acessibilidade pontual

### T10 (A5, B6) — Logo navegável por teclado e botão de tema com nome
- **Modelo:** SONNET. Três arquivos e uma pequena mudança na inicialização.
- **Arquivos:** `docs/index.html`, `docs/style.css`, `docs/app.js`
- **Localizar:**
  - HTML: `<div class="brand" id="brand-home" title="Voltar ao início">` e o `</div>` que o fecha (logo antes de `<button id="theme-toggle"`); e `<button id="theme-toggle" class="ghost-btn" title="Alternar tema">🌙</button>`.
  - CSS: `.brand { display: flex; align-items: center; gap: 14px; cursor: pointer; }`.
  - JS: em `function init()`, o bloco comentado `// restaura o tema salvo`; a linha `$("#brand-home").addEventListener("click", irParaHome);`; e a função `alternarTema`.
- **Fazer:**
  1. HTML: trocar a abertura por `<a class="brand" id="brand-home" href="./" title="Voltar ao início">` e o fechamento correspondente por `</a>`. O conteúdo interno não muda.
  2. HTML: trocar o botão de tema por `<button id="theme-toggle" class="ghost-btn" type="button" title="Alternar tema" aria-label="Tema escuro" aria-pressed="false">🌙</button>`.
  3. CSS: na regra `.brand`, acrescentar `color: inherit; text-decoration: none;`.
  4. JS: acrescentar, logo antes de `function alternarTema()`:
     ```js
     function marcarBotaoTema(escuro) {
       const b = $("#theme-toggle");
       if (!b) return;
       b.textContent = escuro ? "☀️" : "🌙";
       b.setAttribute("aria-pressed", escuro ? "true" : "false");
     }
     ```
  5. JS: em `alternarTema`, trocar a linha `$("#theme-toggle").textContent = atual === "dark" ? "☀️" : "🌙";` por `marcarBotaoTema(atual === "dark");`.
  6. JS: em `init`, trocar o bloco
     ```js
     try {
       if (localStorage.getItem("peki-tema") === "dark") {
         document.body.dataset.theme = "dark";
         $("#theme-toggle").textContent = "☀️";
       }
     } catch (e) { /* modo privado */ }
     ```
     por
     ```js
     let temaSalvo = null;
     try { temaSalvo = localStorage.getItem("peki-tema"); } catch (e) { /* modo privado */ }
     const sistemaEscuro = typeof window.matchMedia === "function"
       && window.matchMedia("(prefers-color-scheme: dark)").matches;
     const comecarEscuro = temaSalvo === "dark" || (temaSalvo === null && sistemaEscuro);
     if (comecarEscuro) document.body.dataset.theme = "dark";
     marcarBotaoTema(comecarEscuro);
     ```
     Observação: o app grava `""` (string vazia) quando a pessoa escolhe o tema claro. Por isso só `null` significa "nunca escolheu".
  7. JS: trocar `$("#brand-home").addEventListener("click", irParaHome);` por
     ```js
     $("#brand-home").addEventListener("click", (e) => {
       if (e && e.preventDefault) e.preventDefault();
       irParaHome();
     });
     ```
- **Não fazer:** não mudar a chave `peki-tema` nem os valores gravados. Não mudar `irParaHome`. Não mexer no listener de `#btn-novo`.
- **Depende de:** nada.
- **Verificar:** só com teclado, Tab chega ao logo e Enter volta à tela inicial sem recarregar a página (a URL perde `?pdb=…`). O botão de tema alterna e, no inspetor, `aria-pressed` muda entre `true` e `false`. Com o `localStorage` limpo e o sistema em modo escuro, a página abre escura; depois de escolher claro e recarregar, abre clara. O "PEKI Fold" do cabeçalho continua com a cor de antes, sem sublinhado.
- **Se der errado:** se você não tiver certeza de qual `</div>` fecha o `div#brand-home`, pare.

### T11 (M8) — Trocar `alert()` por mensagem na aba Cadeias
- **Modelo:** HAIKU. Duas linhas com substituto definido.
- **Arquivos:** `docs/export.js`
- **Localizar:** `function baixarCadeia(chain) {`. Dentro dela há duas chamadas `alert(`.
- **Fazer:**
  1. Logo antes de `function baixarCadeia(chain) {`, acrescentar:
     ```js
     function avisarCadeia(msg) {
       const el = $("#cadeias-vis-status");
       if (el) el.textContent = msg;
     }
     ```
  2. Trocar `alert((estado.estrutura && estado.estrutura.recursos.cadeiaPdbMotivo) || "Esta versão não grava a cadeia em PDB para este formato.");` por `avisarCadeia((estado.estrutura && estado.estrutura.recursos.cadeiaPdbMotivo) || "Esta versão não grava a cadeia em PDB para este formato.");`
  3. Trocar `if (!texto) { alert("Cadeia não encontrada."); return; }` por `if (!texto) { avisarCadeia("Cadeia não encontrada."); return; }`
- **Não fazer:** não alterar os textos das mensagens. Não mexer em outros arquivos.
- **Depende de:** nada.
- **Verificar:** `grep -n "alert(" docs/export.js` não retorna nada. Em `?pdb=4HHB`, aba Cadeias, "PDB" de uma cadeia continua baixando o arquivo.
- **Se der errado:** se `baixarCadeia` não tiver exatamente duas chamadas `alert(`, pare.

### T12 (A8) — Nome acessível para os viewers 3D
- **Modelo:** HAIKU. Três edições exatas.
- **Arquivos:** `docs/viewer.js`, `docs/index.html`
- **Localizar:**
  - `docs/viewer.js`, `function renderViewer()`: a linha `div.innerHTML = "";`.
  - `docs/viewer.js`, `function renderCmpViewers()`: o trecho `<div class="cmp-viewer" style="height:${h}px"></div>`.
  - `docs/index.html`: `<div id="ens-viewer" class="ens-viewer"></div>`.
- **Fazer:**
  1. Em `renderViewer`, logo depois de `div.innerHTML = "";`, acrescentar:
     ```js
     div.setAttribute("role", "img");
     div.setAttribute("aria-label", `Visualização 3D de ${estado.nome || "estrutura"}, ${estado.dados ? estado.dados.cadeias.length : 0} cadeia(s), colorida por cadeia. A descrição em texto está na aba Visão geral.`);
     ```
  2. Em `renderCmpViewers`, trocar o trecho por `<div class="cmp-viewer" role="img" aria-label="Visualização 3D de ${esc(p.id)}, colorida por cadeia" style="height:${h}px"></div>`.
  3. No HTML, trocar por `<div id="ens-viewer" class="ens-viewer" role="img" aria-label="Visualização 3D da estrutura de referência do ensemble"></div>`.
- **Não fazer:** não alterar mais nada em `renderViewer` (ordem das chamadas, `syncTamViewer`, `aplicarEstilo`).
- **Depende de:** nada.
- **Verificar:** `node tests/pocket-view.test.js` e `node tests/usabilidade-estrutura.test.js` passam. Em `?pdb=4HHB`, no inspetor, `#viewer` tem `role="img"` e `aria-label` começando por "Visualização 3D de 4HHB.pdb, 4 cadeia(s)". O 3D continua girando com o mouse.
- **Se der errado:** se um teste falhar por causa de `setAttribute` ou de `esc`, pare e reporte.

### T13 (B7) — Descrição em texto para os gráficos
- **Modelo:** HAIKU. Acrescentar atributos em divs listados.
- **Arquivos:** `docs/index.html`, `docs/app.js`, `docs/comparison.js`
- **Localizar e fazer:** em cada `div` abaixo, acrescentar `role="img"` e o `aria-label` indicado, sem tirar atributos existentes.
  - `docs/index.html`, `<div id="aa-grafico" class="grafico"></div>`: `aria-label="Gráfico de barras da frequência de aminoácidos no escopo escolhido. Os mesmos números saem no botão CSV."`
  - `docs/app.js`, `<div id="pockets-graf-volume" class="grafico"></div>`: `aria-label="Gráfico de barras do volume de cada pocket. Os valores estão na tabela acima."`
  - `docs/app.js`, `<div id="pockets-graf-depth" class="grafico"></div>`: `aria-label="Gráfico de barras da profundidade de cada pocket. Os valores estão na tabela acima."`
  - `docs/comparison.js`, `<div id="cmp-graf-stats" class="grafico"></div>`: `aria-label="Gráfico de barras com o número de resíduos de cada proteína. Os valores estão na tabela acima."`
  - `docs/comparison.js`, `<div id="cmp-graf-aa" class="grafico" style="height:420px"></div>`: `aria-label="Gráfico de barras agrupadas com a porcentagem dos 20 aminoácidos em cada proteína."`
  - `docs/comparison.js`, `<div id="cmp-graf-pvol" class="grafico"></div>`: `aria-label="Gráfico de barras do volume do pocket principal de cada proteína. Os valores estão na tabela acima."`
  - `docs/comparison.js`, `<div id="cmp-graf-pdepth" class="grafico"></div>`: `aria-label="Gráfico de barras da profundidade do pocket principal de cada proteína. Os valores estão na tabela acima."`
  - `docs/comparison.js`, `<div id="cmp-graf-phydro" class="grafico"></div>`: `aria-label="Gráfico de barras da hidrofobicidade do pocket principal de cada proteína. Os valores estão na tabela acima."`
- **Não fazer:** não mexer nas chamadas `Plotly.newPlot` nem nos `id`.
- **Depende de:** nada.
- **Verificar:** `node tests/usabilidade-estrutura.test.js` passa. Em `?pdb=4HHB`, aba Aminoácidos, o gráfico aparece como antes e `#aa-grafico` tem `role="img"`.
- **Se der errado:** se algum dos 8 `div` não for encontrado exatamente como mostrado, pare e diga qual.

### T14 (B8) — Avisar quando as cores das cadeias se repetem
- **Modelo:** HAIKU. Uma linha num template.
- **Arquivos:** `docs/app.js`
- **Localizar:** em `function renderCadeias()`, a linha ``${temSemId ? `<p class="vis-nota">A cadeia _ é a que o arquivo não identificou na coluna de cadeia.</p>` : ""}`;`` (é a última linha do template atribuído a `notas.innerHTML`).
- **Fazer:** trocar essa linha por duas, mantendo o fechamento do template na segunda:
  ```js
      ${temSemId ? `<p class="vis-nota">A cadeia _ é a que o arquivo não identificou na coluna de cadeia.</p>` : ""}
      ${estado.dados.cadeias.length > CORES_CADEIA.length ? `<p class="vis-nota">Este modelo tem mais de ${CORES_CADEIA.length} cadeias. As cores se repetem a partir da ${CORES_CADEIA.length + 1}ª; use a legenda e o botão ver/ocultar para distinguir.</p>` : ""}`;
  ```
- **Não fazer:** não alterar a paleta `CORES_CADEIA` (fica em `docs/viewer.js`). Não mexer nas outras notas.
- **Depende de:** nada.
- **Verificar:** `node tests/usabilidade-estrutura.test.js` passa. Em `?pdb=4HHB` (4 cadeias) a nota não aparece. Num depósito com mais de 10 cadeias (por exemplo `?pdb=1AON`), a nota aparece na aba Cadeias.
- **Se der errado:** se a linha com `temSemId` não existir como mostrado, pare.

### T15 (M7) — Erro e "Processando…" junto do campo principal
- **Modelo:** HAIKU. Mover dois elementos e acrescentar uma linha.
- **Arquivos:** `docs/index.html`, `docs/app.js`
- **Localizar:**
  - HTML: as duas linhas `<div id="erro" class="erro" role="alert" hidden></div>` e `<div id="loading" class="loading" hidden><span class="spinner"></span> Processando…</div>` (hoje ficam logo depois de `</details>` do "Como usar"); e a linha `<div id="busca-nome" class="busca-nome" hidden aria-live="polite"></div>`.
  - JS: `function mostrarErro(msg) { const el = $("#erro"); el.textContent = msg; el.hidden = false; }`.
- **Fazer:**
  1. HTML: recortar as duas linhas e colá-las logo depois da linha do `<div id="busca-nome" …></div>`.
  2. HTML: na linha do loading, acrescentar `role="status"` (fica `<div id="loading" class="loading" role="status" hidden>`).
  3. JS: trocar a função por:
     ```js
     function mostrarErro(msg) {
       const el = $("#erro");
       el.textContent = msg;
       el.hidden = false;
       if (el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
     }
     ```
- **Não fazer:** não duplicar os elementos (cada `id` continua único). Não mexer no `<input id="pdb-id">` nem no parágrafo `id="entrada-dica"` (um teste lê os 280 caracteres depois de `id="pdb-id"`).
- **Depende de:** nada.
- **Verificar:** `node tests/busca-nome.test.js` passa. Na tela inicial, digitar `1A0` e clicar em "Analisar código": a mensagem de erro aparece logo abaixo do campo. Digitar `XXXX` no campo "Comparar" e clicar em "Comparar": a página rola até a mensagem de erro.
- **Se der errado:** se `id="erro"` ou `id="loading"` aparecerem mais de uma vez no HTML, pare.

---

# Lote 4 — comportamento

### T16 (A4) — Abas com ARIA completo e foco em uma só
- **Modelo:** SONNET. HTML repetitivo mais duas funções em arquivos diferentes.
- **Arquivos:** `docs/index.html`, `docs/app.js`, `docs/comparison.js`
- **Localizar:**
  - HTML: `<nav class="abas" role="tablist" aria-label="Seções da estrutura">` (workspace, 8 botões) e os 8 painéis `class="aba-conteudo"` com `id` começando por `tab-`; e, em `<main id="comparacao" …>`, `<nav class="abas">` com 3 botões `data-ctab` e os 3 painéis `id="ctab-…"`.
  - `docs/app.js`: `function trocarAba(nome)` e, em `init`, o bloco que começa com `const listaAbas = document.querySelector("#workspace .abas");`.
  - `docs/comparison.js`: `function trocarAbaCmp(nome)`.
- **Fazer:**
  1. Workspace, botões: todos devem ter `type="button"`, `role="tab"`, `aria-selected`, `id="aba-<nome>"` e `aria-controls="tab-<nome>"`, onde `<nome>` é o valor de `data-tab` (`visao`, `qualidade`, `cadeias`, `stats`, `aa`, `motivos`, `pockets`, `preparo`). Os dois primeiros já têm `id` e `aria-controls`; complete os outros seis. Nos sete botões inativos, acrescentar `tabindex="-1"`. O botão "Visão geral" não recebe `tabindex`.
  2. Workspace, painéis: nos seis painéis que ainda não têm, acrescentar `role="tabpanel"` e `aria-labelledby="aba-<nome>"`. Manter todos os outros atributos (por exemplo `hidden` e `data-escopo="todas"` em `#tab-aa`).
  3. Comparação: trocar `<nav class="abas">` por `<nav class="abas" role="tablist" aria-label="Seções da comparação">`. Os três botões ficam:
     ```html
     <button class="aba ativa" type="button" role="tab" aria-selected="true" id="caba-stats" aria-controls="ctab-stats" data-ctab="stats">Estatísticas</button>
     <button class="aba" type="button" role="tab" aria-selected="false" tabindex="-1" id="caba-aa" aria-controls="ctab-aa" data-ctab="aa">Aminoácidos</button>
     <button class="aba" type="button" role="tab" aria-selected="false" tabindex="-1" id="caba-pockets" aria-controls="ctab-pockets" data-ctab="pockets">Pockets</button>
     ```
     Nos painéis `ctab-stats`, `ctab-aa` e `ctab-pockets`, acrescentar `role="tabpanel"` e `aria-labelledby="caba-<nome>"`.
  4. `trocarAba`: dentro do `forEach`, depois da linha do `aria-selected`, acrescentar `a.tabIndex = on ? 0 : -1;`.
  5. `trocarAbaCmp`: trocar a primeira linha (`$$("#comparacao .aba").forEach((a) => a.classList.toggle("ativa", a.dataset.ctab === nome));`) por:
     ```js
     $$("#comparacao .aba").forEach((a) => {
       const on = a.dataset.ctab === nome;
       a.classList.toggle("ativa", on);
       a.setAttribute("aria-selected", on ? "true" : "false");
       a.tabIndex = on ? 0 : -1;
     });
     ```
  6. `init`: o bloco das setas hoje vale só para `#workspace`. Transforme-o numa função e chame para as duas telas. Acrescente antes de `function init()`:
     ```js
     function ligarSetasAbas(raiz) {
       const lista = document.querySelector(raiz + " .abas");
       if (!lista) return;
       lista.addEventListener("keydown", (ev) => {
         if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
         const abas = $$(raiz + " .aba").filter((a) => !a.hidden);
         const i = abas.indexOf(document.activeElement);
         if (i < 0) return;
         ev.preventDefault();
         const n = ev.key === "ArrowRight" ? (i + 1) % abas.length : (i - 1 + abas.length) % abas.length;
         abas[n].focus();
         abas[n].click();
       });
     }
     ```
     e substitua, em `init`, todo o bloco `const listaAbas = … if (listaAbas) { … }` por:
     ```js
     ligarSetasAbas("#workspace");
     ligarSetasAbas("#comparacao");
     ```
- **Não fazer:** não mudar os valores de `data-tab` e `data-ctab`, nem os `id` dos painéis. Não mexer nos listeners de clique das abas.
- **Depende de:** nada.
- **Verificar:** todos os testes passam. Em `?pdb=4HHB`, só com teclado: Tab entra na barra de abas uma única vez (na aba ativa); as setas esquerda e direita trocam de aba; o Tab seguinte vai para o conteúdo. O mesmo em `?compare=4HHB,1CRN`. Clicar com o mouse continua funcionando, e os botões "Abrir cadeias", "Estatísticas" etc. do fim da Visão geral continuam trocando de aba.
- **Se der errado:** se o bloco das setas em `init` estiver diferente do descrito (por exemplo, já generalizado), pare.

### T17 (A3) — Modal de exportação acessível
- **Modelo:** SONNET. Foco, Esc e ciclo do Tab em dois arquivos de script.
- **Arquivos:** `docs/index.html`, `docs/export.js`, `docs/app.js`
- **Localizar:**
  - HTML: dentro de `<div id="export-modal" class="modal-overlay" hidden>`, as linhas `<div class="modal">` e `<h3>Exportar análise</h3>`.
  - `docs/export.js`: `let exportContexto = "single";`, `function abrirExport(ctx)` e `function fecharExport() { $("#export-modal").hidden = true; }`.
  - `docs/app.js`, em `init`: a linha `$("#export-modal").addEventListener("click", (e) => { if (e.target.id === "export-modal") fecharExport(); });`.
- **Fazer:**
  1. HTML: `<div class="modal">` vira `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="exp-titulo">`; `<h3>Exportar análise</h3>` vira `<h3 id="exp-titulo">Exportar análise</h3>`.
  2. `export.js`: logo depois de `let exportContexto = "single";`, acrescentar `let exportGatilho = null;`.
  3. `export.js`, `abrirExport`: como primeira linha do corpo, `exportGatilho = document.activeElement || null;`. Como últimas linhas (depois de `$("#export-modal").hidden = false;`):
     ```js
     const primeiro = document.querySelector('input[name="exp-fmt"]:checked');
     if (primeiro && primeiro.focus) primeiro.focus();
     ```
  4. `export.js`: trocar `fecharExport` por:
     ```js
     function fecharExport() {
       const modal = $("#export-modal");
       const estavaAberto = !modal.hidden;
       modal.hidden = true;
       if (estavaAberto && exportGatilho && exportGatilho.focus) exportGatilho.focus();
       exportGatilho = null;
     }
     ```
  5. `app.js`, `init`: logo depois da linha do clique em `#export-modal`, acrescentar:
     ```js
     document.addEventListener("keydown", (e) => {
       const modal = $("#export-modal");
       if (!modal || modal.hidden) return;
       if (e.key === "Escape") { e.preventDefault(); fecharExport(); return; }
       if (e.key !== "Tab") return;
       const focaveis = Array.from(modal.querySelectorAll("input, button")).filter((el) => !el.hidden && !el.disabled);
       if (!focaveis.length) return;
       const primeiro = focaveis[0];
       const ultimo = focaveis[focaveis.length - 1];
       if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
       else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
     });
     ```
- **Não fazer:** não mexer em `confirmarExport` nem nas funções `exportar…`. Não trocar o modal por `<dialog>`.
- **Depende de:** nada.
- **Verificar:** em `?pdb=4HHB`, só com teclado: Enter em "Exportar" abre o modal e o foco vai para a opção "PDF"; Tab percorre os controles e, no último, volta ao primeiro, sem sair do modal; Esc fecha e o foco volta ao botão "Exportar". "Cancelar" e clicar fora continuam fechando. Exportar em Markdown ainda gera o arquivo.
- **Se der errado:** se o foco não voltar ao botão que abriu, pare e reporte o que acontece.

### T18 (M11) — Cabeçalhos ordenáveis da tabela de pockets por teclado
- **Modelo:** SONNET. Muda HTML gerado que um teste exercita.
- **Arquivos:** `docs/app.js`, `docs/style.css`
- **Localizar:**
  - `docs/app.js`, `function renderTabelaPockets(pockets)`: o trecho
    ```js
    const th = POCKET_TABELA.map((c) => {
      const seta = s && s.col === c.key ? (s.dir === 1 ? " ▲" : " ▼") : "";
      return `<th class="th-sort" data-col="${c.key}" title="${c.dica}">${c.label}${seta}</th>`;
    }).join("");
    ```
    e, mais abaixo na mesma função, o bloco `$$("#pockets-resultado .th-sort").forEach((th) => { th.addEventListener("click", () => { … renderTabelaPockets(estado.pockets); }); });`.
  - `docs/style.css`: `.th-sort { cursor: pointer; user-select: none; white-space: nowrap; }`.
- **Fazer:**
  1. Trocar o primeiro trecho por:
     ```js
     const th = POCKET_TABELA.map((c) => {
       const ativo = s && s.col === c.key;
       const seta = ativo ? (s.dir === 1 ? " ▲" : " ▼") : "";
       const ordem = ativo ? (s.dir === 1 ? "ascending" : "descending") : "none";
       return `<th aria-sort="${ordem}"><button type="button" class="th-sort" data-col="${c.key}" title="${c.dica}">${c.label}${seta}</button></th>`;
     }).join("");
     ```
  2. No listener de clique, logo depois de `renderTabelaPockets(estado.pockets);`, acrescentar:
     ```js
     const deNovo = $$("#pockets-resultado .th-sort").find((b) => b.dataset.col === col);
     if (deNovo && deNovo.focus) deNovo.focus();
     ```
  3. CSS: trocar a regra `.th-sort` por:
     ```css
     .th-sort { cursor: pointer; user-select: none; white-space: nowrap; background: none; border: none; padding: 0; color: inherit; font: inherit; font-weight: 600; }
     .th-sort:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
     ```
- **Não fazer:** não renomear a classe `th-sort` nem o atributo `data-col` (o teste `tests/pocket-view.test.js` os usa). Não alterar `POCKET_TABELA`, `pocketsOrdenados` nem a lógica de `estado.pocketSort`.
- **Depende de:** nada.
- **Verificar:** `node tests/pocket-view.test.js` passa. Em `?pdb=4HHB`, aba Pockets, depois de "Detectar pockets": Tab chega aos cabeçalhos; Enter em "Volume (Å³)" ordena e mostra ▲; outro Enter mostra ▼; o foco permanece no cabeçalho. Clique com o mouse continua ordenando. O visual dos cabeçalhos é o mesmo de antes.
- **Se der errado:** se `tests/pocket-view.test.js` falhar, pare e reporte a saída; não altere o teste.

### T19 (M4) — Espera dos pockets com tempo, cancelamento e resposta atrasada ignorada
- **Modelo:** OPUS. Mexe em fluxo assíncrono e em estado que entra no arquivo salvo.
- **Arquivos:** `docs/index.html`, `docs/app.js`
- **Localizar:**
  - HTML: `<button id="btn-pockets" class="primary-btn">` e `<div id="pockets-status" class="muted small" style="margin-top:10px"></div>`; e `<div id="cmp-pockets-status" class="muted small" style="margin-top:10px"></div>`.
  - `docs/app.js`: `async function detectarPockets()` e, em `init`, `$("#btn-pockets").addEventListener("click", detectarPockets);`.
  - Contexto que você precisa ler antes: em `docs/dogsite-client.js`, `obterPockets(id, onTick, deveParar)` e `dogsitePoll`. `dogsitePoll` faz até 45 verificações com 4 s entre elas (cerca de 180 s), chama `onTick(n)` a cada verificação e lança `new Error("Cálculo cancelado.")` quando `deveParar()` devolve verdadeiro. Em `docs/analysis-snapshot.js`, a função que monta a parte de pockets do JSON salvo lê `estado.pocketsInfo` e `estado.pockets`: `pocketsInfo.estado === "erro"` vira "erro"; sem `pocketsInfo` e sem `pockets` vira "nao_solicitado".
- **Fazer:**
  1. HTML: logo depois do botão `id="btn-pockets"`, acrescentar `<button id="btn-pockets-cancelar" class="ghost-btn" type="button" hidden>Cancelar detecção</button>`. Nos dois `div` de status (`pockets-status` e `cmp-pockets-status`), acrescentar `role="status"`.
  2. `app.js`: logo antes de `async function detectarPockets()`, acrescentar `let pocketsCancelado = false;`.
  3. Reescrever `detectarPockets` mantendo o comportamento atual e acrescentando:
     - guardar `const idPedido = estado.pdbId;` no início e usar `idPedido` no lugar de `estado.pdbId` no resto da função;
     - `pocketsCancelado = false;` e mostrar o botão de cancelar (`hidden = false`) ao começar; esconder no fim, em `finally`. Proteja com `if (botao)`, porque o DOM de teste não tem esse elemento;
     - montar o status **uma vez**, com três partes: `<span class="spinner" aria-hidden="true"></span>`, um texto fixo `Calculando pockets no servidor. Pode levar até 3 minutos.` e um `<span aria-hidden="true" id="pockets-tempo"></span>`. A cada `onTick`, atualizar **só** o `textContent` do `#pockets-tempo` com ` (${segundos} s)`, onde `segundos` vem de `Math.round((Date.now() - t0) / 1000)`. Não reescreva o `innerHTML` do status a cada verificação: isso faria o leitor de tela repetir a frase a cada 4 s. Se `$("#pockets-tempo")` vier nulo, simplesmente não atualize. Quando o resultado já está no cache (`POCKETS_CACHE`), mantenha o comportamento atual de não mostrar o indicador;
     - passar `() => pocketsCancelado` como terceiro argumento de `obterPockets`;
     - depois do `await`, se `estado.pdbId !== idPedido`, retornar sem escrever em `estado`, no status nem na tabela (a pessoa já abriu outra estrutura);
     - no `catch`: se `estado.pdbId !== idPedido`, retornar. Se `e.message === "Cálculo cancelado."`, fazer `estado.pockets = null; estado.pocketsInfo = null;`, escrever no status `Detecção cancelada. Nenhum pocket foi registrado. O cálculo já enviado ao servidor não é interrompido; só esta página deixou de esperar.` e reabilitar o botão. Nos outros erros, manter exatamente o que existe hoje (`estado.pockets = null`, `estado.pocketsInfo = { estado: "erro", motivo: e.message }`, status com `❌`, botão reabilitado).
  4. `init`: logo depois de `$("#btn-pockets").addEventListener("click", detectarPockets);`, acrescentar:
     ```js
     const cancelarPockets = $("#btn-pockets-cancelar");
     if (cancelarPockets) cancelarPockets.addEventListener("click", () => { pocketsCancelado = true; });
     ```
- **Não fazer:** não alterar `docs/dogsite-client.js`, `docs/analysis-snapshot.js` nem `detectarPocketsComparacao`. Não mudar as mensagens de sucesso (`✓ N pocket(s) … para ID.`) nem a de erro. Não criar estado novo no JSON salvo: cancelado deve sair como "nao_solicitado", o que já acontece com `pocketsInfo = null` e `pockets = null`.
- **Depende de:** nada. Se T07 já foi feita, o botão `btn-pockets` contém um `<span aria-hidden="true">`; isso não muda esta tarefa.
- **Verificar:** todos os testes passam, em especial `tests/pocket-view.test.js` e `tests/characterization.test.js`. Em `?pdb=4HHB`, aba Pockets: clicar em "Detectar pockets" mostra a frase fixa e um contador de segundos; "Cancelar detecção" aparece e, ao clicar, em poucos segundos o status mostra a mensagem de cancelamento e o botão principal volta a ficar ativo. Repetir sem cancelar: a tabela aparece e o botão de cancelar some. Iniciar a detecção em 4HHB, clicar em "Nova análise" e abrir 1CRN: quando a resposta do 4HHB chegar, a aba Pockets do 1CRN não deve mudar. Clicar em "Guardar análise" depois de cancelar: no JSON, `pockets.estado` é `"nao_solicitado"`.
- **Se der errado:** se a string `"Cálculo cancelado."` não existir em `docs/dogsite-client.js`, pare. Se `tests/characterization.test.js` falhar no caso `pockets` ou `snapshots`, pare e reporte; não regenere as referências.

### T20 (M5) — Avisar cedo que upload não roda pockets e oferecer abrir pelo código
- **Modelo:** SONNET. Um texto e um ramo novo numa função.
- **Arquivos:** `docs/index.html`, `docs/app.js`
- **Localizar:**
  - HTML: dentro de `<div id="dropzone" class="dropzone">`, o parágrafo que começa com `<p class="muted small">Sem limite de tamanho`.
  - `docs/app.js`, `function renderPockets()`: o ramo `if (!estado.pdbId) { … return; }`, que desabilita o botão e escreve em `status.innerHTML` um texto começando por `⚠️ A detecção de pockets usa a API do DoGSiteScorer`.
- **Fazer:**
  1. HTML: logo depois desse parágrafo, ainda dentro do `dropzone`, acrescentar:
     ```html
     <p class="muted small">Por arquivo, a detecção de pockets, a comparação e o ensemble não rodam: eles pedem o código PDB.</p>
     ```
  2. JS: no ramo `if (!estado.pdbId)`, entre a atribuição de `status.innerHTML` e o `return;`, acrescentar:
     ```js
     const idArquivo = estado.meta && estado.meta.id ? String(estado.meta.id).trim().toUpperCase() : "";
     if (/^[0-9][A-Z0-9]{3}$/.test(idArquivo)) {
       status.innerHTML += ` O arquivo cita o código <strong>${esc(idArquivo)}</strong>. <button type="button" class="link-btn" id="btn-pockets-abrir-id">Abrir ${esc(idArquivo)} pelo RCSB</button> troca o arquivo enviado pela versão do depósito, e as anotações desta análise são perdidas.`;
       const abrir = $("#btn-pockets-abrir-id");
       if (abrir) abrir.addEventListener("click", () => analisar({ pdbId: idArquivo }));
     }
     ```
- **Não fazer:** não alterar o texto existente do aviso. Não habilitar o botão "Detectar pockets" nesse ramo. Não enviar o arquivo a nenhum serviço.
- **Depende de:** nada.
- **Verificar:** todos os testes passam. Baixar `https://files.rcsb.org/download/1CRN.pdb`, enviar pelo upload e abrir a aba Pockets: o aviso atual aparece, seguido de "O arquivo cita o código 1CRN." e do link "Abrir 1CRN pelo RCSB"; clicar nele recarrega a análise por código e o botão "Detectar pockets" fica ativo. Com um arquivo sem linha HEADER, só o aviso antigo aparece.
- **Se der errado:** se o ramo `if (!estado.pdbId)` de `renderPockets` não tiver a forma descrita, pare.

### T21 (M12) — Confirmar antes de descartar anotações da ficha
- **Modelo:** SONNET. Função nova com condição e dois pontos de ligação.
- **Arquivos:** `docs/app.js`
- **Localizar:** `function irParaHome()` e, em `init`, os listeners de clique de `#brand-home` e de `#btn-novo`. O de `#btn-novo` é `$("#btn-novo").addEventListener("click", irParaHome);`. O de `#brand-home` é `$("#brand-home").addEventListener("click", irParaHome);` ou, se a tarefa T10 já foi feita, uma função de seta que chama `e.preventDefault()` e depois `irParaHome();`.
- **Fazer:**
  1. Logo depois do fim de `function irParaHome() { … }`, acrescentar:
     ```js
     // Só pergunta quando há texto ou caixa na ficha de preparo, que se perdem ao sair.
     function haAnotacoesNaFicha() {
       if ($("#workspace").hidden) return false;
       if (typeof PrepUI === "undefined" || !PrepUI.resumoAnalise) return false;
       let r = null;
       try { r = PrepUI.resumoAnalise(); } catch (e) { return false; }
       if (!r || r.estado !== "ok") return false;
       const temNota = r.anotacoes ? Object.values(r.anotacoes).some(Boolean) : false;
       return temNota || !!r.caixaVina;
     }

     function pedirNovaAnalise() {
       if (haAnotacoesNaFicha() && typeof window.confirm === "function"
         && !window.confirm("Sair desta análise? As anotações e a caixa da ficha de preparo serão perdidas. Para mantê-las, cancele e use Guardar análise.")) return;
       irParaHome();
     }
     ```
  2. No listener de `#btn-novo`, trocar `irParaHome` por `pedirNovaAnalise`.
  3. No listener de `#brand-home`, trocar a chamada a `irParaHome` por `pedirNovaAnalise` (mantendo o `preventDefault`, se existir).
- **Não fazer:** não alterar `irParaHome` nem `PrepUI.resumoAnalise`. Não mexer nos listeners de `#btn-cmp-novo`, `#btn-an-voltar` nem no botão `ens-novo` (tratado em `docs/ensemble-ui.js`): esses continuam chamando `irParaHome` direto.
- **Depende de:** D9. Funciona com ou sem T10.
- **Verificar:** todos os testes passam. Em `?pdb=4HHB`, sem escrever nada na aba Preparo, "Nova análise" volta à tela inicial sem perguntar. Escrever algo em "Decisão do pesquisador" de qualquer seção da aba Preparo e clicar em "Nova análise": aparece a pergunta; "Cancelar" mantém a análise e o texto; "OK" volta à tela inicial. O mesmo ao clicar no logo.
- **Se der errado:** se o listener de `#brand-home` não tiver nenhuma das duas formas descritas, pare.

### T22 (M1) — Tirar do card "Sobre" o que a Visão geral já diz
- **Modelo:** HAIKU. Remoção de um bloco com antes e depois.
- **Arquivos:** `docs/app.js`
- **Localizar:** em `function renderMeta()`, o trecho
  ```js
  const est = estado.estrutura;
  const leitura = est
    ? `<p class="ov-resumo">${esc(est.lacunas.resumo)}</p><p class="muted small">${esc(est.componentes.holo.motivo)} Formato lido: ${esc(rotuloFormato(est.formato))}. Contrato ${esc(est.schema)}.</p>`
    : "";
  ```
  e, no fim da atribuição de `el.innerHTML`, as duas linhas
  ```js
    (avisoPrev ? `<p class="aviso-predita">${esc(avisoPrev)}</p>` : "") +
    leitura;
  ```
- **Fazer:**
  1. Apagar o primeiro trecho inteiro (a declaração de `est` e a de `leitura`).
  2. Trocar as duas últimas linhas por uma só: ``(avisoPrev ? `<p class="aviso-predita">${esc(avisoPrev)}</p>` : "");``
- **Não fazer:** não mexer no resto de `renderMeta` (título, etiquetas, linha de heterocomponentes, aviso de estrutura predita, a condição `if (!temClassico && !estado.estrutura)`). Não mexer em `renderVisao`, que continua mostrando essas informações. Não apagar a função `rotuloFormato`, usada em outros lugares.
- **Depende de:** D6.
- **Verificar:** todos os testes passam. Em `?pdb=4HHB`, o card sob o título termina na linha "Heterocomponentes no modelo: HEM ×4, PO4 ×2. …"; as frases sobre resíduo não resolvido e "Contrato peki-estrutura-1" não aparecem mais ali, mas continuam na aba Visão geral. Em 375 px o card fica visivelmente mais curto.
- **Se der errado:** se os trechos não estiverem como mostrado, pare.

### T23 (M2) — Termos internos fora do primeiro plano
- **Modelo:** SONNET. Cinco trocas de texto em dois arquivos, com referências de teste por perto.
- **Arquivos:** `docs/app.js`, `docs/quality-ui.js`
- **Localizar e fazer:**
  1. `docs/app.js`, `function renderVisao()`: trocar
     `<p class="muted small">Contrato ${esc(est.schema)}. Os números abaixo saem do arquivo; campo ausente não aparece como zero.</p>`
     por
     `<p class="muted small">Os números abaixo saem do arquivo; campo ausente não aparece como zero.</p>`.
  2. Na mesma função, dentro de `<details class="ov-detalhe">`, logo depois da linha `<summary>Limites desta versão</summary>`, acrescentar a linha
     `<p class="muted small">Formato interno desta leitura: ${esc(est.schema)}.</p>`.
  3. `docs/app.js`, `function rotuloCadeiaVisao(c)`: trocar `` return `author ${c.auth} · label ${c.label}`; `` por `` return `${c.auth} (rótulo interno do arquivo: ${c.label})`; ``.
  4. `docs/app.js`, `function renderVisao()`: trocar `` `posição ${r.seqIndex} na SEQRES, numeração author não depositada` `` por `` `posição ${r.seqIndex} na SEQRES, número do resíduo não informado no arquivo` ``.
  5. `docs/quality-ui.js`, `function render()`: trocar
     `<p class="muted small">Contrato ${esc(QualityModel.SCHEMA)}. Valores só entram quando a fonte os devolve. Campo ausente não vira zero.</p>`
     por
     `<p class="muted small">Valores só entram quando a fonte os devolve. Campo ausente não vira zero. Formato interno: ${esc(QualityModel.SCHEMA)}.</p>`.
- **Não fazer:** não alterar `docs/structure-model.js` (a função `textoVisao` alimenta as exportações e tem saída fixada por teste) nem `docs/quality-model.js`. Não trocar "author" nos outros textos da aba Qualidade. Não mexer em `renderMeta`.
- **Depende de:** D2.
- **Verificar:** todos os testes passam. Em `?pdb=4HHB`, aba Visão geral: o primeiro parágrafo não cita "Contrato"; "Limites desta versão", aberto, começa com "Formato interno desta leitura: peki-estrutura-1.". Aba Qualidade: a linha de abertura termina com "Formato interno: peki-qualidade-1.". Exportar em Markdown com "Visão geral" marcada: a seção continua começando com "Contrato peki-estrutura-1." (a exportação não muda).
- **Se der errado:** se `tests/characterization.test.js` ou `tests/quality-model.test.js` falhar, pare e reporte a diferença; não regenere referências.

---

# Lote 5 — layout

### T24 (A2) — Abas em uma linha com rolagem horizontal
- **Modelo:** HAIKU. Troca de duas regras de CSS e inclusão de uma terceira, com texto pronto.
- **Arquivos:** `docs/style.css`
- **Localizar:** as duas regras
  ```css
  .abas { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--border); margin: -18px -18px 16px; padding: 0 10px; }
  .aba { background: none; color: var(--muted); padding: 14px 16px; border-bottom: 2px solid transparent; font-weight: 600; }
  ```
  e, um pouco abaixo, a regra de foco que começa com `.aba:focus-visible, .ghost-btn:focus-visible, .primary-btn:focus-visible,` e termina com `outline-offset: 2px; }`.
- **Fazer:**
  1. Trocar as duas primeiras regras por:
     ```css
     .abas { display: flex; flex-wrap: nowrap; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--border); margin: -18px -18px 16px; padding: 0 10px; scrollbar-width: thin; }
     .aba { flex: 0 0 auto; white-space: nowrap; background: none; color: var(--muted); padding: 14px 16px; border-bottom: 2px solid transparent; font-weight: 600; }
     ```
  2. Logo **depois** do fim da regra de foco citada, acrescentar:
     ```css
     .aba:focus-visible { outline-offset: -2px; }
     ```
     (Dentro de uma área com rolagem, o contorno para fora seria cortado; por isso ele passa para dentro só nas abas.)
- **Não fazer:** não alterar a regra `@media (max-width: 420px)` que ajusta as margens de `.abas`. Não mexer no HTML das abas. Não alterar a regra de foco existente.
- **Depende de:** nada.
- **Verificar:** em `?pdb=4HHB`, em 1222 px de largura as 8 abas ficam em uma linha (antes eram duas). Em 375 px ficam em uma linha que rola para os lados com o dedo, sem criar rolagem horizontal na página inteira. Com teclado, a seta direita leva até "Preparo" e a aba focada rola para dentro da vista, com o contorno de foco visível por inteiro. Em `?compare=4HHB,1CRN` as 3 abas continuam normais.
- **Se der errado:** se a página inteira ganhar rolagem horizontal em 375 px, pare e reporte.

### T25 (A1, A8) — Workspace no celular: viewer menor e abas fixas
- **Modelo:** SONNET. CSS curto, mas precisa conferir o 3D e o `sticky` no navegador.
- **Arquivos:** `docs/style.css`
- **Localizar:** a regra `.legenda .swatch { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }`.
- **Fazer:** logo depois dela, acrescentar:
  ```css
  /* Celular: o viewer não empurra as abas para fora da tela nem captura toda a largura do toque. */
  @media (max-width: 700px) {
    .viewer-card .viewer { max-height: 240px; width: calc(100% - 40px); margin: 0 auto; }
    #workspace .painel > .abas { position: sticky; top: 0; z-index: 3; background: var(--card); }
    .prep-secao, .ov h3, .ql h3 { scroll-margin-top: 64px; }
  }
  ```
  Contexto: o JavaScript define a altura do viewer com estilo em linha (`height: 360px`, `460px` ou `620px`); o `max-height` do CSS é o que limita no celular, do mesmo jeito que as regras de desktop já fazem.
- **Não fazer:** não alterar `docs/viewer.js`. Não mexer nas regras de `@media (min-width: 981px)`. Não aplicar `overflow: hidden` em `.painel` (quebraria o `sticky`).
- **Depende de:** T24 (com as abas em várias linhas, a barra fixa ocuparia tela demais). D11.
- **Verificar:** em 375 px com `?pdb=4HHB`: o viewer tem 240 px de altura com uma margem de 20 px de cada lado, onde dá para rolar a página com o dedo; a estrutura aparece inteira e gira; ao rolar o conteúdo de uma aba longa (Preparo), a barra de abas fica presa no topo, com fundo opaco, nos temas claro e escuro. Em 1222 px nada muda. O seletor "Tamanho" (P, M, G) continua funcionando no desktop.
- **Se der errado:** se o 3D aparecer cortado, esticado ou em branco em 375 px, ou se a barra de abas não fixar, pare e reporte com uma captura; não tente corrigir pelo JavaScript.

### T26 (M13) — Gráfico não pode alargar a página no celular
- **Modelo:** HAIKU. Uma regra de CSS defensiva.
- **Arquivos:** `docs/style.css`
- **Localizar:** a regra `.grafico { width: 100%; height: 380px; }`.
- **Fazer:** trocar por `.grafico { width: 100%; max-width: 100%; height: 380px; overflow: hidden; }`.
- **Não fazer:** não alterar a regra `@media (max-width: 700px) { .grafico { height: 280px; } }`. Não mexer nas chamadas do Plotly.
- **Depende de:** nada.
- **Verificar:** em 375 px com `?pdb=4HHB`, abrir a aba Aminoácidos logo após o carregamento: a página não ganha rolagem horizontal e o gráfico se ajusta à largura em menos de 1 s. No desktop os gráficos de Aminoácidos e de Pockets aparecem inteiros, com os rótulos dos eixos visíveis.
- **Se der errado:** se algum rótulo de eixo ou título de gráfico ficar cortado no desktop, pare e reporte.

### T27 (A6, B1, B10) — Tela inicial: campo principal primeiro, opções avançadas recolhidas
- **Modelo:** SONNET. Reordenação grande de HTML, com ids que o JavaScript usa.
- **Arquivos:** `docs/index.html`, `docs/style.css`
- **Localizar:** `<div class="card entrada-card">` dentro de `<section id="entrada" class="entrada">`. No CSS: `.entrada-card { width: 100%; max-width: 680px; text-align: center; }` e `.hero-logo { display: block; width: min(320px, 85%); height: auto; margin: 0 auto 18px; border-radius: 12px; }`.
- **Fazer:**
  1. Reordenar os filhos diretos de `.entrada-card` para esta sequência, **movendo os blocos inteiros sem alterar seu conteúdo** (exceto o item 6):
     1. `<img class="hero-logo" …>`
     2. `<h2>Comece por aqui</h2>`
     3. o parágrafo `<p class="muted">Informe um código PDB ou o nome da proteína…</p>`
     4. o grupo do campo principal, na ordem atual: `<label for="pdb-id" …>`, `<div class="entrada-row entrada-id">`, `<p id="entrada-dica" …>`, `<div id="busca-nome" …>` e, se já estiverem logo depois dele (tarefa T15), `<div id="erro" …>` e `<div id="loading" …>`
     5. `<div class="ou">— ou —</div>` e `<div id="dropzone" class="dropzone">…</div>`
     6. `<div class="exemplos">`, com os três botões trocados por:
        ```html
        <button class="chip" type="button" data-id="4HHB">4HHB (4 cadeias, com heme)</button>
        <button class="chip" type="button" data-id="1CRN">1CRN (1 cadeia, 46 resíduos)</button>
        <button class="chip" type="button" data-id="1A00">1A00 (4 cadeias)</button>
        ```
     7. um bloco novo `<details class="mais-opcoes">` com `<summary>Mais opções: comparar proteínas, comparar análises guardadas e ensemble</summary>`, contendo, nesta ordem e sem alteração: o separador `<div class="ou">— ou compare proteínas —</div>` com a `div.entrada-row` do campo `cmp-ids` e o parágrafo "De 2 a 4 PDBs…"; o separador `<div class="ou">— ou compare análises guardadas —</div>` com o parágrafo e a `div.entrada-row` do botão `btn-abrir-analises`; e o bloco `<div id="ens-entrada" class="ens-entrada">…</div>` inteiro. Fechar `</details>`.
     8. `<div class="escopo">…</div>` (o bloco "O que o PEKI Fold faz / O que não faz")
     9. `<details class="ajuda">…</details>`
     10. se `#erro` e `#loading` ainda estiverem no fim (T15 não feita), deixá-los onde estão, como últimos filhos.
  2. CSS: em `.entrada-card`, trocar `text-align: center` por `text-align: left`. Em `.hero-logo`, trocar `width: min(320px, 85%)` por `width: min(200px, 60%)`.
  3. CSS: logo depois da regra `.entrada-card`, acrescentar:
     ```css
     .entrada-card > h2, .entrada-card .ou, .entrada-card .dropzone { text-align: center; }
     .mais-opcoes { margin-top: 18px; }
     .mais-opcoes summary { cursor: pointer; font-weight: 600; color: var(--primary); min-height: 44px; display: flex; align-items: center; }
     ```
- **Não fazer:** não alterar nenhum `id`, `for` ou `data-id` existente, nem os atributos do `<input id="pdb-id">` (um teste lê os 280 caracteres depois de `id="pdb-id"` e exige `maxlength="80"` e `placeholder="ex.: 1A00 ou hemoglobin"`). Não alterar os textos dos blocos movidos. Não mexer nas outras telas (`<main …>`). Não alterar `docs/app.js`: os listeners usam os ids e continuam valendo.
- **Depende de:** D4, D5, D10. Recomendado depois de T15.
- **Verificar:** todos os testes passam. Na tela inicial em 1222×940, o campo "Código PDB ou nome da proteína" aparece sem rolar (antes ficava a 666 px do topo). Os três exemplos abrem a estrutura. "Mais opções" abre e, dentro dele, "Comparar" com `4HHB 1CRN`, "Abrir comparação de análises" e "Exemplo sintético" do ensemble funcionam. Os links diretos `?compare=4HHB,1CRN` e `?ensemble=exemplo` continuam abrindo as telas certas. Em 375 px não há rolagem horizontal. Conferir nos dois temas.
- **Se der errado:** se, ao reordenar, algum bloco tiver filhos que você não consegue atribuir com certeza a um dos 10 itens, pare e liste o que sobrou.

### T28 (A7) — Ficha de preparo com índice e sem perder a posição ao recalcular
- **Modelo:** OPUS. Arquivo grande, HTML fixado por referência de teste, foco e rolagem.
- **Arquivos:** `docs/prep-ui.js`, `docs/style.css`, `tests/fixtures/characterization/prep-ui.json` (só regenerado pelo comando indicado)
- **Localizar:** em `docs/prep-ui.js`: `function htmlControlesPreparo()`, as sete `<section class="prep-secao"…>` (títulos `Inventário`, `Limpeza e exportação`, `Íons metálicos`, `Pontes dissulfeto`, `Glicosilação (Asn–açúcar)`, `Histidinas`, `Caixa sugerida para o Vina`; a última já tem `id="prep-vina"`), `function montar()`, `function render()` e `async function onClick(e)`.
- **Fazer:**
  1. Dar `id` às seis seções que não têm, nesta correspondência: `prep-sec-inventario`, `prep-sec-limpeza`, `prep-sec-ions`, `prep-sec-dissulfetos`, `prep-sec-glicosilacao`, `prep-sec-histidinas`. A do Vina mantém `id="prep-vina"`.
  2. Em `htmlControlesPreparo`, dar `id="prep-btn-raios"` ao botão `data-acao="raios"` (para o foco poder voltar a ele).
  3. Criar `function htmlIndicePreparo()` que devolve:
     ```html
     <nav class="prep-indice" aria-label="Seções da ficha de preparo">
       <button type="button" class="link-btn" data-acao="ir-secao" data-alvo="prep-sec-inventario">Inventário</button>
       <button type="button" class="link-btn" data-acao="ir-secao" data-alvo="prep-sec-limpeza">Limpeza</button>
       <button type="button" class="link-btn" data-acao="ir-secao" data-alvo="prep-sec-ions">Íons</button>
       <button type="button" class="link-btn" data-acao="ir-secao" data-alvo="prep-sec-dissulfetos">Dissulfetos</button>
       <button type="button" class="link-btn" data-acao="ir-secao" data-alvo="prep-sec-glicosilacao">Glicosilação</button>
       <button type="button" class="link-btn" data-acao="ir-secao" data-alvo="prep-sec-histidinas">Histidinas</button>
       <button type="button" class="link-btn" data-acao="ir-secao" data-alvo="prep-vina">Caixa do Vina</button>
     </nav>
     ```
     e, em `montar()`, inserir `${htmlIndicePreparo()}` na linha seguinte a `${htmlControlesPreparo()}`.
  4. Em `onClick`, logo depois de `const acao = btn.dataset.acao;`, acrescentar:
     ```js
     if (acao === "ir-secao") {
       const alvo = document.getElementById(btn.dataset.alvo);
       if (!alvo) return;
       if (alvo.scrollIntoView) alvo.scrollIntoView({ block: "start" });
       const titulo = alvo.querySelector ? alvo.querySelector("h3") : null;
       if (titulo && titulo.focus) {
         titulo.setAttribute("tabindex", "-1");
         titulo.focus({ preventScroll: true });
       }
       return;
     }
     ```
  5. Trocar `render()` por uma versão que preserva rolagem e foco:
     ```js
     function render() {
       const cont = document.getElementById("tab-preparo");
       if (!cont) return;
       const temJanela = typeof window !== "undefined";
       const ativo = document.activeElement;
       const focoId = ativo && ativo.id && cont.contains && cont.contains(ativo) ? ativo.id : "";
       const y = temJanela ? window.scrollY : 0;
       cont.innerHTML = montar();
       atualizarPrevia();
       if (temJanela && window.scrollTo && !cont.hidden) window.scrollTo(0, y);
       if (focoId) {
         const deNovo = document.getElementById(focoId);
         if (deNovo && deNovo.focus) deNovo.focus({ preventScroll: true });
       }
     }
     ```
     O ambiente de teste roda este arquivo sem `window`, com um `document` mínimo e com `setTimeout` que lança erro. Por isso todas as proteções acima são necessárias e não se deve usar temporizador.
  6. CSS: logo depois da regra `.het-grupo { margin: 6px 0; }`, acrescentar:
     ```css
     .prep-indice { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 10px 0; font-size: .88rem; }
     .prep-indice .link-btn { min-height: 32px; }
     .prep-secao { scroll-margin-top: 64px; }
     .prep-secao h3:focus { outline: 2px solid var(--primary); outline-offset: 2px; }
     ```
  7. Rodar os testes. `tests/characterization.test.js` vai falhar no caso `prep-ui`, porque o HTML da ficha mudou de propósito. Então, e só então, regenerar essa referência:
     ```
     node tests/helpers/capture-characterization.js --write prep-ui
     ```
     Depois conferir com `git diff tests/fixtures/characterization/prep-ui.json` que as diferenças são **apenas**: o bloco `<nav class="prep-indice"…>`, os seis `id="prep-sec-…"` e o `id="prep-btn-raios"`. Rodar os testes de novo; todos devem passar. Incluir o arquivo regenerado no commit.
- **Não fazer:** não alterar a instrução `return { ativo, temFicha, reiniciar, aoCarregar, aposEstilo, aoMostrar, markdown, anexarPdf, resumoAnalise };` no fim do módulo (o teste de caracterização a usa como âncora e exige que ela apareça uma única vez). Não alterar `resumoAnalise`, `documento`, `markdown`, `csvFicha` nem `anexarPdf`: são o formato salvo e as exportações. Não alterar textos, tabelas ou campos das seções. Não transformar as seções em `<details>`. Não regenerar nenhuma outra referência além de `prep-ui`.
- **Depende de:** nada. Convive com T25 (que também define `scroll-margin-top` para `.prep-secao`, com o mesmo valor).
- **Verificar:** todos os testes passam depois do passo 7. Em `?pdb=4HHB`, aba Preparo:
  - o índice aparece abaixo dos botões de ficha; clicar em "Histidinas" rola até a seção e o título recebe o foco;
  - rolar a página até a seção "Íons metálicos" e clicar em um "ver" de um íon; depois, sem rolar, usar Shift+Tab até o campo "Metais (Å)", mudar o valor e sair do campo: a ficha recalcula, a página não salta para o topo e o foco fica no campo seguinte;
  - escrever em "Decisão do pesquisador" e clicar em "Atualizar raios": o texto continua lá e o foco volta ao botão;
  - "Ficha Markdown" baixa um arquivo sem o índice, com as mesmas seções de antes;
  - "Guardar análise" gera JSON com `preparo.estado` igual a `"ok"`.
- **Se der errado:** se o diff da referência `prep-ui.json` mostrar qualquer mudança além das três listadas, desfaça a regeneração (`git checkout tests/fixtures/characterization/prep-ui.json`) e pare. Se algum outro caso de caracterização falhar, pare. Se a instrução `return { ativo, … }` não estiver como mostrada, pare.

---

## Tabela-resumo

| Tarefa | Itens | Título curto | Modelo | Risco |
|---|---|---|---|---|
| T01 | M9 | Cor do texto secundário | HAIKU | baixo |
| T02 | M6 | Rótulo e placeholder de "Comparar" | HAIKU | baixo |
| T03 | M10 | Alvos de toque do viewer | HAIKU | baixo |
| T04 | B5 | Subtítulo oculto no celular | HAIKU | baixo |
| T05 | B2 | Botão FASTA igual aos downloads | HAIKU | baixo |
| T06 | B9 | Destaque de "Guardar análise" | HAIKU | baixo |
| T07 | B3 | Emojis com `aria-hidden` | HAIKU | baixo |
| T08 | B4 | Glossário no "Como usar" | HAIKU | baixo |
| T09 | M3 | Avisos do Ensemble recolhidos | HAIKU | baixo |
| T10 | A5, B6 | Logo por teclado e botão de tema | SONNET | médio |
| T11 | M8 | `alert()` vira mensagem na aba | HAIKU | baixo |
| T12 | A8 | Nome acessível dos viewers | HAIKU | baixo |
| T13 | B7 | Descrição dos gráficos | HAIKU | baixo |
| T14 | B8 | Aviso de cores repetidas | HAIKU | baixo |
| T15 | M7 | Erro e loading junto do campo | HAIKU | baixo |
| T16 | A4 | ARIA e foco das abas | SONNET | médio |
| T17 | A3 | Modal de exportação acessível | SONNET | médio |
| T18 | M11 | Ordenação da tabela por teclado | SONNET | médio |
| T19 | M4 | Espera e cancelamento dos pockets | OPUS | alto |
| T20 | M5 | Upload sem ID: aviso e atalho | SONNET | médio |
| T21 | M12 | Confirmação ao sair | SONNET | médio |
| T22 | M1 | Card "Sobre" enxuto | HAIKU | baixo |
| T23 | M2 | Termos internos fora do topo | SONNET | médio |
| T24 | A2 | Abas em uma linha | HAIKU | médio |
| T25 | A1, A8 | Celular: viewer menor e abas fixas | SONNET | alto |
| T26 | M13 | Gráfico não alarga a página | HAIKU | baixo |
| T27 | A6, B1, B10 | Tela inicial reorganizada | SONNET | alto |
| T28 | A7 | Índice e posição na ficha de preparo | OPUS | alto |

Totais: 16 tarefas para Haiku, 10 para Sonnet, 2 para Opus. Fable fica só com a revisão final.

Itens da auditoria que este plano **não** cobre por inteiro, de propósito:

- **B2:** só o botão FASTA foi unificado. Reduzir os seis estilos de botão a três é trabalho de design, não uma tarefa mecânica.
- **B3:** os emojis continuam visíveis; só deixam de ser lidos em voz alta. Os que são escritos por `textContent` (ver/ocultar, status) não foram tocados.
- **B7:** os gráficos ganham descrição, mas não uma tabela de dados recolhível.
- **B8:** não há rótulo de cadeia ao passar o mouse no 3D.
- **A7:** a ficha ganha índice e mantém a posição, mas continua sendo redesenhada por inteiro.

---

## Prompt de revisão final

Depois de todas as tarefas executadas e commitadas, envie este texto para o Claude Fable 5.2, com o repositório aberto no branch das mudanças:

```
Revise a execução do PLANO-EXECUCAO.md (na raiz do repositório PEKI-Fold). As 28
tarefas (T01–T28) foram executadas por outros modelos, um commit por tarefa, com
mensagens no formato "ux(TNN): ...". Não altere nenhum arquivo nesta revisão.

1. Liste os commits ux(T..) e diga quais tarefas do plano não têm commit e quais
   têm mais de um.
2. Para cada commit, compare o diff com o "Fazer" e o "Não fazer" da tarefa.
   Aponte: o que foi pedido e não foi feito; o que foi feito e não foi pedido;
   qualquer arquivo tocado fora da lista "Arquivos" da tarefa.
3. Confirme que o formato do JSON salvo não mudou: docs/analysis-snapshot.js e a
   função resumoAnalise de docs/prep-ui.js devem estar idênticos ao commit
   anterior ao primeiro ux(T..). Confirme também que a ordem das tags <script>
   em docs/index.html é a mesma.
4. Rode todos os testes (for f in tests/*.test.js; do node "$f" || echo "FALHOU:
   $f"; done) e mostre a saída. Se alguma referência em
   tests/fixtures/characterization/ foi alterada, confira que só prep-ui.json
   mudou e que o diff dela contém apenas o índice e os ids previstos na T28.
5. Abra o site (servidor local em docs/ ou a versão publicada, se já estiver no
   ar) e repita a auditoria original com 4HHB e 1CRN: desktop em 1222 px, 375 px
   de largura, tema claro e escuro, e navegação só por teclado. Para cada item
   A1–A8, M1–M13 e B1–B10, diga: resolvido, parcialmente resolvido ou não
   resolvido, com a evidência (medida, captura ou comportamento observado).
6. Confira o que a auditoria apontou como bom e não podia piorar: contraste no
   tema escuro, ausência de rolagem horizontal em 375 px, rótulos de todos os
   campos da ficha de preparo e aria-pressed nos botões ver/ocultar.
7. Procure regressões que nenhuma tarefa previa: algo que funcionava e parou,
   mensagens que sumiram, foco que se perde, layout quebrado entre 700 e 980 px.
8. Entregue: uma tabela tarefa → conforme / com desvios / refazer; a lista de
   problemas por prioridade com arquivo e sugestão; e uma recomendação clara de
   publicar ou não.

Diga o que você verificou de fato e o que não conseguiu verificar.
```
