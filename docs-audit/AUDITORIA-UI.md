# Auditoria de UI — PEKI Fold

Somente leitura. Nenhum arquivo em `docs/` foi alterado. Este relatório fica em `docs-audit/` para não entrar no `outputDirectory` da Vercel (`docs/`, plano gratuito, site estático).

Data da revisão: 2 de novembro de 2026. Pacote do detector: Impeccable 4.8.0 (`npx impeccable detect`).

## Método

O modo de interface tratado aqui é **Operar / Ler**: ferramenta científica em pt-BR, não landing page. O contexto de produto (pesquisadores e estudantes de bioinformática estrutural; PDB; 3Dmol.js; DoGSiteScorer/ProteinsPlus; aba Preparo com limpeza, LINK/SSBOND, tleap e caixa do Vina) foi usado como o `init` do Impeccable. `PRODUCT.md`, `.impeccable/`, skills e hooks **não** foram gravados no repositório.

Três passadas, nas categorias publicadas do Impeccable 4.8.0:

| Passada | O que cobre | Como rodou |
|---|---|---|
| `audit` | Acessibilidade, desempenho, tema, responsivo, integridade | Leitura de `docs/index.html`, `docs/style.css`, `docs/app.js`, `docs/prep-ui.js` e medições no Chrome |
| `critique` | Heurísticas de Nielsen, carga cognitiva, especificidade do produto | Revisão de design isolada, sem ver a saída do detector antes do julgamento |
| `adapt` | Celular ~360–430 px, tablet ~768–1024 px, desktop ≥1280 px, paisagem, toque | Mesmo Chrome, viewports abaixo |

O detector determinístico rodou em `docs/index.html`, `docs/style.css`, `docs/app.js`, `docs/prep-ui.js` e `docs/prep-analysis.js` (`--json`, código de saída 2). O catálogo `--list-rules` desta versão tem **62 regras** (31 de “slop”, 31 de qualidade). O overlay `live-server` não foi injetado: a crítica é somente leitura e o fluxo de overlay edita a página.

**Navegador.** Google Chrome headless, acionado pelo Playwright (`playwright-core`) com o binário `/usr/bin/google-chrome`, WebGL via SwiftShader. Servidor estático local em `http://127.0.0.1:8765/` com raiz em `docs/`. Estrutura de prova: upload de `pdbproteins/pdb1a00.pdb` (hemoglobina, 4 cadeias, ligantes HEM). Não houve chamada ao RCSB nem ao DoGSiteScorer.

Viewports medidos: 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800 e paisagem 844×390.

**Não testado, e portanto sem achado inventado:** iPhone/Android físicos, Safari, Firefox, zoom do navegador (Ctrl/Cmd +), rede lenta de campo, modo comparação (a UI só compara por IDs), aba Pockets com a tabela do DoGSite, gesto real de toque (o viewport emulado mede layout; não arrasta o viewer). Onde o CSS permite prever um risco, o texto diz “não medido”.

## 1. Resumo executivo

Não há P0. Com mouse, no desktop de 1280 px, o caminho ID ou arquivo → viewer 3D → abas → Preparo → download chega ao fim. O 3D da 1A00 desenhou de fato as quatro cadeias e os HEM no Chrome headless, em 390 px e em 1024 px.

O que impede um uso confortável no celular é concreto e medido: em 360 px e 390 px o botão **Analisar ID** sai da tela (a página ganha rolagem horizontal), o controle **Tamanho** do viewer é cortado pelo `overflow: hidden` do cartão, e a aba Preparo alarga a página inteira (~191–221 px além da viewport), cortando o aviso científico e as últimas colunas das tabelas. No tema escuro, o texto branco do botão primário fica em 3,23:1 sobre `#5b8def`.

Pontuação do `audit` (0–4 por eixo, teto 20):

| Eixo | Nota | Leitura |
|---|---|---|
| Acessibilidade | 2 | Botões reais, foco nativo do Chrome, `alt` nas marcas. Faltam rótulo, região viva, diálogo e contraste AA em vários textos. |
| Desempenho | 2 | CSS e JS locais são pequenos e a fonte é do sistema. Plotly, 3Dmol e jsPDF bloqueiam o parser no `<head>`; o PNG de entrada pesa 1,04 MB. |
| Tema | 3 | Tokens e tema escuro funcionam. O primário escuro, o erro claro e o verde de FASTA ficam abaixo de 4,5:1. |
| Responsivo | 1 | Há um breakpoint (980 px) e o grid empilha. Em 360–390 px a ação principal e a ficha vazam para fora. |
| Integridade | 3 | A tarefa e os avisos são deste produto. A casca visual é um dashboard genérico, sem a paleta roxa típica de UI gerada. |
| **Total** | **11/20** | **Aceitável.** O eixo fraco é o reflow estreito. |

Crítica (`critique`), 10 heurísticas, teto 40. Faixa típica de produto real: 20–32.

| # | Heurística | Nota | Evidência curta |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | Spinner e “verificação N” existem (`docs/app.js` ~544–548). `#erro` e `#loading` não são região viva (`docs/index.html` 77–78). |
| 2 | Correspondência com o mundo | 3 | Vocabulário de bancada certo. Emoji no tema e “5 perguntas do trabalho” na comparação (`docs/index.html` 215). |
| 3 | Controle e liberdade | 3 | “Nova análise”, Cancelar, restaurar caixa, limpar destaques. O modal não fecha com Escape (medido). O polling do DoGSite não tem cancelar (`docs/app.js` 588–601, até 45 × 4 s). |
| 4 | Consistência | 2 | Erro em faixa, em texto com ❌ e em `alert()` (`docs/app.js` 345). |
| 5 | Prevenção de erro | 3 | ID com regex e `maxlength` (`docs/app.js` 70–71). Upload sem ID desliga pockets com texto explicando o motivo (`docs/app.js` 514–519). |
| 6 | Reconhecimento | 2 | Chips de exemplo ajudam. A caixa do Vina manda voltar à aba Pockets (`docs/prep-ui.js` 545–547). A dica das colunas está em `title`, invisível no toque (`docs/app.js` 693). |
| 7 | Flexibilidade | 2 | Enter, `?pdb=` e `?compare=` (`docs/app.js` 1497, 1551–1556). Ordenar pockets é clique no `<th>`, fora do teclado (`docs/app.js` 751–757). |
| 8 | Estética e minimalismo | 2 | A entrada é contida. A ficha repete o mesmo bloco de avisos no topo e no fim (`docs/prep-ui.js` 311–314 e 438). |
| 9 | Recuperação | 3 | Mensagens de ID inválido, 404, rede, 429 e timeout. O `alert()` de cadeia ausente foge do padrão da faixa. |
| 10 | Ajuda | 3 | “Como usar”, escopo e rótulos fixos estão na tarefa. No workspace a ajuda da entrada some. |
| **Total** | | **26/40** | Aceitável, com folga no rigor do texto e aperto no reflow e no teclado. |

Especificidade: a tarefa não serve para outro produto. O que a identifica é o escopo “o que faz / o que não faz”, o viewer por cadeia, o DoGSiteScorer e a ficha (LINK, SSBOND, tleap, altloc, caixa editável). A casca (cartão branco, raio 14 px, Segoe UI, duas colunas, botões primary/ghost) poderia hospedar outro “analisar um ID”. Isso é observação de design, não defeito científico.

Carga cognitiva: o agrupamento em cartões e `.prep-secao` funciona. Três cargas extras, além da complexidade própria da ficha: dois botões primários iguais na entrada; o aviso repetido competindo com “Baixar proteina_limpa.pdb”; o vai-e-volta Pockets → Preparo para a caixa. A ficha longa é carga intrínseca de uma lista de conferência. Escondê-la atrás de um assistente apagaria checagens que o pesquisador precisa ver juntas.

## 2. Achados priorizados

P0 é o que impede terminar a tarefa. P1 é dificuldade grande ou falha de WCAG AA. P2 tem caminho alternativo. P3 é acabamento. Cada item abaixo saiu do código ou do Chrome. Não há P0.

### P1 — O botão “Analisar ID” sai da tela em 360 px e 390 px

- **Onde:** `docs/style.css` 67–68 (`.entrada-row` em flex, sem `flex-wrap`; o input não tem `min-width: 0`). HTML em `docs/index.html` 39–41 e 60–62.
- **O que acontece:** o input fica travado em 260 px de largura (mínimo do conteúdo do placeholder). A linha mede 372 px de scroll contra ~282 px úteis. O botão é empurrado para a direita.
- **Medido:**
  - 360×800: `scrollWidth − clientWidth` da página = **64 px**. `#btn-id` termina em x=411 (viewport 360) e tem 102×68 px, com o rótulo quebrado em duas linhas.
  - 390×844: overflow da página = **34 px**. O botão termina em x=411. No screenshot, lê-se “Analisar” e o “ID” fica cortado na borda.
  - 430×932: overflow da página = **0**. O botão termina em x=411, ainda dentro dos 430.
  - 768, 1024, 1280 e paisagem 844: overflow 0; o botão mede 124×44.
- **Dispositivo:** celular 360 e 390. Em 430 a entrada já cabe.
- **Correção:** `flex-wrap: wrap` em `.entrada-row`, `min-width: 0` no input e botão em largura total quando a linha não couber (`flex: 1 1 100%` abaixo de ~420 px). O placeholder pode continuar sendo o exemplo; o rótulo acessível entra no achado de formulário.

### P1 — A aba Preparo alarga a página inteira em 360 px e 390 px

- **Onde:** `docs/style.css` 87–88 (`.ws-grid` com `1fr`, que na prática é `minmax(auto, 1fr)`), 217–218 (`.prep-scroll` / `.prep-tabela`), 104–107 (`.viewer-card { overflow: hidden }` e `.viewer-controls` sem quebra).
- **O que acontece:** com a 1A00 aberta e a aba Preparo ativa, a coluna do grid resolve para **561 px** numa viewport de 390 (área útil do grid: 350 px). A página passa a rolar na horizontal. O aviso “Ficha auxiliar… Escore de docking não é afinidade.” e o cabeçalho da tabela de inventário são cortados na borda direita do screenshot. `.prep-scroll` mede delta 0: a tabela cresce junto com a coluna, então o scroll interno não assume a rolagem. Quem usa o celular rola a página inteira, inclusive o aviso de rigor.
- **Medido (página como está):**
  - 360: overflow da página com Preparo aberto = **221 px**.
  - 390: overflow = **191 px**. Coluna do grid = 561 px.
  - 768, 1024, 1280 e paisagem 844×390: overflow da página = **0**. Em 1024×768 o grid é de fato duas colunas (`404.9 px` + `561.1 px`) e o texto da ficha cabe; o screenshot mostra o aviso completo e o controle Tamanho visível.
- **Sonda só no Chrome, sem gravar CSS:** forçando `grid-template-columns: minmax(0, 1fr)` na página já aberta, o overflow da página em 390 caiu a **0** e as tabelas passaram a rolar dentro de `.prep-scroll`:

  | Tabela | scrollWidth | clientWidth |
  |---|---|---|
  | Íons (7 colunas) | 523 | 312 |
  | Inventário de cadeias | 481 | 312 |
  | Histidinas | 467 | 312 |
  | Heteroátomos | 426 | 312 |

  O `max-content` da tabela de íons, medido à parte, chega a 1670 px; o do `<pre class="prep-bonds">` chega a 869 px. Com a coluna livre para encolher, esse excesso fica no scroll da seção.
- **Dispositivo:** celular 360–390, e por extensão 430 (a coluna medida de 561 px é maior que a área útil de uma viewport de 430; o workspace em 430 não foi reaberto, a entrada em 430 foi).
- **Correção:** `minmax(0, 1fr)` nas colunas do grid, `min-width: 0` em `.viewer-card` e `.painel`, e manter `.prep-scroll { overflow-x: auto }` com a tabela em `min-width: max-content` se a intenção for preservar colunas legíveis em vez de espremer “Distância (Å)” até ficar ilegível. `white-space: normal` nos botões longos (“Baixar pacote…”) para o rótulo quebrar. Não transformar a tabela em cartões: o pesquisador compara colunas.

A tabela de pockets **não foi renderizada** neste teste (sem DoGSite). O CSS já pede o mesmo risco: `.pockets-tabela { display: block; overflow-x: auto; white-space: nowrap }` em `docs/style.css` 149. `nowrap` numa tabela dentro do grid, sem `minmax(0, 1fr)`, é o mesmo mecanismo. Tratar como hipótese de código, não como pixel medido.

### P1 — “Tamanho” do viewer é cortado no celular

- **Onde:** `docs/style.css` 104–107. O cartão tem `overflow: hidden`; a faixa `.viewer-controls` é flex com `flex-wrap: nowrap` e `gap: 18px`.
- **O que acontece:** em 390 px, antes da ficha alargar a coluna, a faixa mede `clientWidth` 348 e `scrollWidth` 399. O `<select id="viewer-tam">` termina em x=403, fora do cartão e fora da viewport (390). O screenshot mostra “Ta” cortado depois de “Superfície”. Não há barra nessa faixa: o `overflow: hidden` do pai descarta o controle. Em 768 e 1280 a faixa cabe (altura 52 px). Em 1024, nas duas colunas, a faixa cabe por pouco (o select termina em x=420 e o cartão em 425) e “Girar” fica com 34 px de largura.
- **Dispositivo:** celular 360–390. No tablet deitado (1024) cabe, apertado.
- **Correção:** `flex-wrap: wrap` e `row-gap` em `.viewer-controls`. O default de 460 px (`docs/style.css` 107, opção M em `docs/index.html` 114) pode continuar; em viewport baixa o usuário precisa alcançar P (360) sem caçar um select cortado.

### P1 — Contraste abaixo de WCAG AA (4,5:1 para texto comum)

Razões calculadas com a luminância relativa do sRGB a partir dos tokens de `docs/style.css` 1–22 e 77, 100, 200. O Chrome confirmou as cores computadas do tema escuro e do erro claro.

| Par | Razão | Limiar | Onde |
|---|---|---|---|
| Texto do erro `#e8513a` sobre o fundo misturado `rgba(232,81,58,.12)` em branco (`#fceae7`) | **3,19:1** | 4,5:1 (texto de 16 px) | `.erro`, `style.css` 77. Cor lida no Chrome: `rgb(232, 81, 58)`. |
| FASTA `#2ea05a` sobre o tint `rgba(46,160,90,.14)` | **2,88:1** | 4,5:1 (13,6 px) | `.fasta-btn`, `style.css` 100. Cor lida: `rgb(46, 160, 90)`. |
| FASTA `#2ea05a` sobre branco | 3,34:1 | 4,5:1 | Mesmo botão, se o tint for ignorado. |
| Branco sobre o primário escuro `#5b8def` | **3,23:1** | 4,5:1 (16 px, peso 600) | `.primary-btn` com `[data-theme="dark"]`, `style.css` 16 e 52. Chrome: fundo `rgb(91, 141, 239)`, texto branco. |
| `#3a6fd6` sobre o cartão escuro `#1a2436` | **3,28:1** | 4,5:1 para texto &lt; 18,66 px em negrito | `.prep-secao h3` é 1,02 rem (`style.css` 200). `.ws-meta .meta-titulo` é 1,05 rem e peso 700 (`style.css` 92). |
| `#6b7689` sobre `#f4f6fb` | **4,24:1** | 4,5:1 | `.muted` no fundo da página e `.resumo-card .lbl` (0,8 rem) sobre `--bg`. O detector reportou 4,2:1. Sobre o cartão branco a mesma cor dá 4,59:1 e passa. |
| Chip escuro `#5b8def` sobre o tint calculado `#1c2a42` | 4,46:1 | 4,5:1 | `.chip` no tema escuro. Margem de 0,04; tratar junto com o primário. |

O `h1` da topbar no escuro é 20,8 px e peso 700 (lido no Chrome). Texto grande em negrito pede 3:1, e 3,28:1 passa. O problema são o `h3` da ficha e o título de metadados, menores que 18,66 px.

No tema escuro o erro usa `--accent` `#ff6b52`. Sobre o tint escuro a razão calculada é **4,95:1** (passa). A falha do erro é do tema claro.

Borda de campo `#e2e7f0` sobre `#f4f6fb` é 1,15:1, e o preenchimento do input contra o cartão branco é 1,08:1 (WCAG 1.4.11 pede 3:1 para o limite do componente). No screenshot o campo ainda se reconhece pelo placeholder. Fica como parte deste achado, prioridade interna de P2: escurecer a borda para o token de texto muted, sem trocar a paleta azul.

- **Dispositivo:** os dois temas, qualquer largura. O botão claro sobre `#2a5599` dá 7,35:1 e passa. Texto principal `#1c2433` sobre branco dá 15,56:1.
- **Correção:** escurecer `--primary` escuro até o branco do botão passar de 4,5:1 (o hover `#3a6fd6` já dá 4,75:1 com branco); usar esse azul também nos `h3`. Trocar o verde de FASTA para um verde que passe sobre o tint e sobre branco. Escurecer `--accent` claro ou o fundo de `.erro` até 4,5:1. Subir `--muted` o suficiente para 4,5:1 sobre `--bg`. Manter as frases; muda só a cor.

### P1 — Formulário, diálogo e estado invisíveis para teclado e leitor de tela

Medido no Chrome, mais o que o HTML não tem.

- `#pdb-id`, `#cmp-ids` e `#motivo-input` só têm `placeholder` (`docs/index.html` 40, 61, 153). Placeholder não é rótulo (WCAG 3.3.2). A ordem de Tab medida na entrada foi: botão de tema → `#pdb-id` → Analisar ID → “selecione” → chips → `#cmp-ids` → Comparar → “Como usar”. O `div#brand-home` (`docs/index.html` 18, `cursor: pointer` em `style.css` 45) não entra na ordem. “Nova análise” cobre a volta para a entrada quando o workspace está aberto; na entrada, o clique na marca não tem equivalente de teclado.
- `#erro` e `#loading` (`docs/index.html` 77–78) e `#pockets-status` (`docs/index.html` 168) não têm `role="alert"` nem `aria-live`. O erro “ID de PDB inválido (ex.: 1A00).” apareceu no teste (ID `ABC`), sem live region.
- O modal (`docs/index.html` 227–251) não tem `role="dialog"` nem `aria-modal`. Ao abrir em 1280×800 o foco continuou em `#btn-export`. Escape não fechou (`hidden` permaneceu falso). O fechamento existe pelo botão Cancelar e pelo clique no overlay (`docs/app.js` 1549).
- A ordenação da tabela de pockets é `click` em `<th class="th-sort">` (`docs/app.js` 693 e 751–757). `<th>` não é focável. A tabela não foi desenhada neste teste; o caminho de teclado está no código.
- O botão de tema é só o caractere 🌙/☀️, com `title` (`docs/index.html` 25). `title` não é nome acessível confiável.
- As abas são `<button>` (`docs/index.html` 124–130), então Tab + Enter funciona (altura medida 54 px). Não há `aria-selected` nem `aria-controls` (`docs/app.js` 1448–1450). O estado ativo é cor e borda.
- **Dispositivo:** teclado em qualquer largura; leitor de tela em qualquer largura.
- **Correção:** `<label>` visível (pode ser o texto que já existe ao lado, associado por `for`). `aria-live="polite"` em `#erro`, `#loading` e nos status de pockets. No modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` no `h3`, foco no primeiro controle, Escape chama `fecharExport`, devolve o foco ao botão que abriu, e `inert` no resto da página. Nos `<th>` ordenáveis, `<button>` dentro do `th` com `aria-sort`. No tema, `aria-label` “Tema escuro” / “Tema claro” e `aria-pressed`. Nas abas, `aria-selected` e `aria-controls`.

O anel de foco **existe** neste Chrome: `outline` nativo `auto 1px` em `#pdb-id`, `#btn-id`, `#theme-toggle`, `#btn-file` e no `<summary>`. O CSS não zera `outline`. Não é achado de “foco ausente”. Um `:focus-visible` mais forte entra como P3, porque o anel de 1 px some sobre o viewer `#0b1020`.

### P1 — “ver” e “baixar” na ficha têm 19×20 px e 39×20 px

- **Onde:** `docs/style.css` 56 (`.link-btn { padding: 0 }`) e os botões gerados em `docs/prep-ui.js` 263 e 302.
- **Medido** na 1A00, viewport 390, aba Preparo: botões “ver” 19×20 px; “baixar” 39×20 px. WCAG 2.5.8 pede no mínimo 24×24 px, salvo exceção de espaçamento. 19 px de largura não chega a 24. O alvo de 44 px pedido para esta auditoria também falha.
- **Dispositivo:** celular e qualquer ponteiro grosso. No desktop o clique ainda acerta, com área pequena.
- **Correção:** padding que leve a caixa a pelo menos 44×44, ou um hit-area com `min-height`/`min-width` sem aumentar o corpo da tabela (padding no botão, não na célula inteira). Manter o verbo “ver” / “baixar”.

### P1 — Plotly, 3Dmol e jsPDF bloqueiam a primeira pintura; o PNG de entrada pesa 1,04 MB

- **Onde:** `docs/index.html` 10–14 (quatro `<script>` no `<head>`, sem `defer` nem `async`) e linha 31 (`peki-fold.png`, sem `width`/`height`).
- **Tamanho medido por HTTP**, com `Accept-Encoding: gzip`:

  | Recurso | Transferência gzip | Decodificado |
  |---|---|---|
  | `plotly-2.35.2.min.js` | 1 333 723 bytes | 4 558 696 bytes (`Content-Length`) |
  | `3Dmol-min.js` 2.4.0 | 122 293 bytes no timing do Chrome (pedido frio via curl: 149 652) | 513 478 bytes |
  | `jspdf.umd.min.js` 2.5.1 | 95 694 bytes | 364 463 bytes |
  | `jspdf.plugin.autotable` 3.8.2 | 10 932 bytes | 38 976 bytes |
  | `docs/peki-fold.png` | 1 088 735 bytes, 1536×1024 | imagem sem compressão extra no servidor local |

- **Chrome (Resource Timing):** `style.css`, 3Dmol, Plotly, jsPDF e autotable vieram com `renderBlockingStatus: blocking`. O Plotly, neste run, mostrou `transferSize` 0 porque as viewports anteriores já tinham aquecido o cache; o byte frio é o da linha gzip acima. Os quatro JS locais no fim do `<body>` (`pdb-analysis.js`, `prep-analysis.js`, `prep-ui.js`, `app.js`, ~167 KB no total) vieram `non-blocking`.
- O `domContentLoaded` local foi 575 ms. Isso é localhost com cache quente. Não é LCP de produção nem de celular em 4G.
- **Dispositivo:** pior no celular, na primeira visita, antes de qualquer análise. Quem só vai colar um ID baixa o gráfico e o PDF antes de precisar deles.
- **Correção, sem build:** `defer` nos scripts do `<head>` que precisem existir cedo; carregar Plotly na primeira abertura da aba de aminoácidos ou de um gráfico, e jsPDF/autotable no clique de Exportar ou “Ficha PDF”. Reexportar `peki-fold.png` perto da largura real (`min(320px, 85%)` em `style.css` 66), com `width` e `height` para reservar o espaço. 3Dmol pode continuar no carregamento da página se o workspace for o destino de `?pdb=`, ou entrar junto com o primeiro `renderViewer`.

### P2 — Alvos de toque abaixo de 44 px, com a página ainda utilizável

Medidos no Chrome. 44 px é o critério desta auditoria (e o de AAA 2.5.5 / HIG). 24 px é o chão do AA 2.5.8.

| Controle | Caixa medida | Largura | Nota |
|---|---|---|---|
| Chips 1A00 / 4HHB / 1CRN | altura 32 px, fonte 13,6 px | 360–1280 | Acima de 24, abaixo de 44. `style.css` 57. |
| “selecione” (`.link-btn`) | 70×24 px | todas | Encosta no mínimo de 24. `style.css` 56, `index.html` 48. |
| Tema | 50×42 px | 390 | Dois pixels abaixo de 44. |
| Checkbox “Girar” / “Ligantes” / “Superfície” | altura 22 px em 768 e 1280 | desktop e tablet | Largura do rótulo chega a 58–91 px. A altura é que falha. |
| Inputs numéricos da ficha | 88×27 px, fonte computada **13,33 px** | 390 | `style.css` 203–204 não define `font-size`. Abaixo de 16 px, o Safari iOS dá zoom ao focar. iOS não foi executado; o número é do Chrome. |
| `.prep-check` “Cadeia A” | rótulo 84×21 px, input 13×13 | 390 | O rótulo é a área clicável. Abaixo de 44. |
| Abas | 54 px de altura | 390 e 1024 | Passam de 44. Em 390 quebram em duas linhas (Cadeias/Estatísticas, depois Aminoácidos/Motivos, depois Pockets/Preparo). |
| Botões PDB/FASTA da cadeia | 54×53 e 62×53 | 390 | Passam de 44 na altura. |

**Correção:** um degrau só, em `@media (pointer: coarse)`, subindo padding de chip, link, ghost e checkbox até 44 px, e `font-size: 1rem` nos `input` e `select` da ficha. Não aumentar a tabela inteira.

### P2 — A ficha se reconstrói e o “ver” não traz o 3D

- `render()` faz `innerHTML = montar()` (`docs/prep-ui.js` 453–456). Atualizar raios e sugerir a caixa passam por aí (570). `<details class="het-grupo">` aberto e o foco do teclado se perdem, porque o nó é outro.
- `mostrar3d` só dispara `change` no estilo (`docs/prep-ui.js` 500–504). Não há `scrollIntoView` no `#viewer`. Em 390 o viewer fica centenas de pixels acima da ficha (no screenshot da ficha, o 3D já está fora, sobrando a legenda).
- **Dispositivo:** celular, onde viewer e ficha não cabem juntos; teclado, em qualquer largura, ao atualizar raios.
- **Correção:** atualizar só o bloco que mudou, ou guardar quais `<details>` estavam abertos e o `activeElement` antes do `innerHTML`. No “ver”, `scrollIntoView` no viewer com `behavior` respeitando `prefers-reduced-motion`. O scroll suave de `irParaHome` (`docs/app.js` 41) também ignora essa preferência. Hoje não existe nenhuma `@media (prefers-reduced-motion)` no CSS.

### P2 — Paisagem do celular: o viewer de 460 px é mais alto que a tela

- **Medido** em 844×390, depois de abrir Preparo: overflow horizontal 0, abas numa linha só, aviso completo. `viewer` continua com 460 px de altura CSS (`style.css` 107), maior que os 390 px da viewport. O screenshot mostra só a base do canvas e a legenda; as abas começam abaixo.
- **Correção:** em `@media (max-height: 500px)`, altura do `#viewer` com `min(46dvh, 460px)` ou selecionar P por padrão. Não esconder o viewer: a estrutura é a tarefa.

### P2 — Modal sem limite de altura

- Em 1280×800 o diálogo mediu 440×514, folgado (topo 143, base 657). Não foi aberto em 360×800 nem em paisagem de 390 px de altura. O CSS (`style.css` 177–178) não tem `max-height` nem `overflow: auto`.
- **Correção:** `max-height: min(90dvh, 640px); overflow: auto` em `.modal`. Confirmar em 360 px quando for implementar; este relatório não viu o modal estourar.

### P2 — Duas ações primárias iguais na entrada

- `docs/index.html` 41 e 62: “Analisar ID” e “Comparar” são os dois `.primary-btn`. No celular o segundo também é empurrado para fora (em 360, `#btn-cmp` termina em x=424).
- **Correção:** um primário (analisar / exemplos) e Comparar como `.ghost-btn`. O fluxo de comparação permanece.

### P3 — Acabamento

- O detector marca `side-tab` em `.ocorrencia` (`style.css` 145), `.rotulo-fixo` e `.aviso-predita` (`style.css` 196–197). A barra de 3 px é o que separa aviso de corpo. Se for suavizar, trocar por borda completa ou só pelo fundo que já existe. O texto do aviso fica.
- `em-dash-overuse` (13 travessões) conta “— ou —”, o título e a tagline. É pontuação da interface, não cadência de marketing. Não reescrever por causa da regra.
- `lang="pt-br"` (`index.html` 2) funciona; o tag canônico é `pt-BR`.
- Não há `color-scheme` nem leitura inicial de `prefers-color-scheme`. O tema salvo em `localStorage` (`app.js` 1461–1489) está certo para quem já escolheu.
- Plotly é criado com `displayModeBar: false` (`app.js` 439 e equivalentes). Some a barra, e com ela um caminho de exportar/zoom do próprio Plotly. A aba já tem “CSV”. P3.
- Cabeçalho em 360 px: a tagline quebra em três linhas (13,6 px, bloco de 61 px) e a topbar fica com 126 px. Cabe. Em 360 o botão “Nova análise” mediu 83×90 porque a faixa de ações estreita quebrou o rótulo. Overflow da página nesse header: 1 px. P3.
- Em 1280, com `html { font-size: 32px }` (proxy de texto a 200%, não é o zoom do navegador), o overflow horizontal foi 0. Zoom real e 200% no celular não foram testados.

## 3. Responsividade por dispositivo

Há **uma** media query no app: `@media (max-width: 980px)` empilha `.ws-grid` (`style.css` 88). Não há query de `pointer`, `hover`, `orientation` nem `prefers-reduced-motion`. O `<meta name="viewport">` está correto: `width=device-width, initial-scale=1.0` (`index.html` 4). Não trava o zoom (`user-scalable` ausente, o que é o comportamento certo). Não há `viewport-fit=cover` nem `env(safe-area-inset-*)`; notch e barra do iOS não foram vistos num aparelho.

| | Celular 360–390 | Celular 430 | Tablet 768 | Tablet 1024 deitado | Desktop 1280 | Paisagem 844×390 |
|---|---|---|---|---|---|---|
| Overflow horizontal da entrada | 64 px / 34 px | 0 | 0 | 0 | 0 | 0 |
| Grid do workspace | 1 coluna, mas a coluna cresce a 561 px com a ficha | não medido no workspace | 1 coluna de 728 px, overflow 0 | 2 colunas, overflow 0 | 2 colunas (640 + 582), overflow 0 | 1 coluna, overflow 0 |
| Painel 3D | Canvas desenhado (cadeias + HEM). Altura 460 px. “Tamanho” cortado | — | Faixa de controles cabe; checkboxes com 22 px de altura | Faixa cabe por pouco | Faixa cabe | Viewer mais alto que a tela |
| Tabelas da ficha | Página rola; o scroll interno não assume | — | Cabem na coluna de 728 px (delta interno 0) | Cabem na coluna de 561 px | Cabem | Cabem; aviso completo no screenshot |
| Abas | 54 px, duas ou três linhas | — | 54 px | quebram (Motivos na 1ª linha, Pockets/Preparo na 2ª) | cabem melhor na coluna de ~582 px | uma linha |
| Toque ≥ 44 px | falha em chip, “selecione”, “ver”/“baixar”, números | idem | checkboxes do viewer com 22 px | “Girar” com 34 px de largura | idem ao tablet largo | idem |

Orientação: a paisagem foi a viewport 844×390, não um aparelho girado. O problema visto é a altura fixa do viewer, não uma segunda folha de estilos.

Rolagem horizontal: indesejada na página (entrada e ficha). Desejada, e hoje insuficiente, dentro de `.prep-scroll` e de `.pockets-tabela`, desde que a página em si não cresça.

## 4. Acessibilidade

Além dos P1 da seção 2:

- Hierarquia: `h1` na marca (1,3 rem, negrito do user agent, 20,8 px medidos), `h2` “Comece por aqui” e o nome da estrutura no tamanho do user agent (24 px, peso 700, medido). O `h3` da ficha desce para 1,02 rem, quase o corpo. Há um `<main>` no workspace e outro na comparação; a entrada é `<section>`, sem `<main>`. Quando a entrada está visível, o landmark principal some (os mains estão `hidden`).
- Contraste de texto grande no claro passa (primário `#2a5599` sobre branco, 7,35:1). O escuro passa no corpo (`#e7edf7` sobre `#1a2436`, 13,23:1) e no muted (`#93a0b5` sobre `#1a2436`, 5,88:1).
- Cor não é o único canal nas cadeias: a legenda escreve “Cadeia A/B/C/D” junto do swatch (`app.js` 303). Maior/menor cadeia tem texto além do verde/vermelho (`app.js` 386–387). Isso deve continuar.
- Imagens: `alt` da marca e do hero existem (`index.html` 19 e 31). O canvas do 3Dmol não tem nome acessível. A legenda de cadeias e as tabelas cobrem parte da informação; a geometria em si não tem alternativa em texto. P2, junto do viewer: um `aria-label` no `#viewer` do tipo “Estrutura 3D. A descrição numérica está nas abas.” não substitui a figura e evita um canvas mudo.
- Foco: anel nativo presente neste Chrome, como acima. Não há armadilha de teclado na entrada (o Tab circula). O modal não prende o foco e também não o recebe: o Tab seguinte continua na página de baixo. Isso é o P1 do diálogo.
- Fonte: corpo 16 px (`style.css` 29, herança). `.small` é 0,85 rem (13,6 px). `.prep-tabela` é 0,82 rem. `.prep-cfg` é 0,8 rem (12,8 px) — o textarea da caixa não chegou a existir no teste, porque não houve pocket; o tamanho está no CSS (`style.css` 214). Inputs da entrada estão em 1 rem (bom para o iOS). Inputs numéricos da ficha caíram no default de 13,33 px do Chrome.

## 5. Desempenho

Sem bundler, o que dá para afirmar é o que o HTML pede e o que o Chrome cronometrou.

- Bloqueiam a renderização: `style.css` (13 KB, aceitável), 3Dmol, Plotly, jsPDF, autotable. Números na tabela do P1.
- Não bloqueiam: os quatro scripts do app no fim do body, o JPEG da marca (12 KB, 256×264), o favicon (11 KB).
- O PNG `peki-fold.png` não bloqueia o parser e pesa 1,04 MB para uma largura de no máximo 320 px CSS. É o maior arquivo local e o candidato óbvio de LCP da entrada. Sem `width`/`height`, o espaço só existe depois que a imagem chega.
- Fonte: `"Segoe UI", system-ui, -apple-system, sans-serif`. Zero webfont. Certo para um estático no plano gratuito.
- Animação: um spinner de `transform` (`style.css` 81–82), barato. O `spin` do viewer é opt-in. Não há `will-change` espalhado. Não há blur/filter em loop.
- Plotly e 3Dmol são necessários para a tarefa. O desperdício é baixá-los antes da primeira análise e baixar o jsPDF antes do primeiro export. `defer` e injeção sob demanda cabem em HTML/JS puro.
- O tempo de 575 ms até `DOMContentLoaded` **não** deve ser citado como desempenho de campo.

## 6. Resultado do detector de 62 regras

Catálogo lido com `npx impeccable detect --list-rules` (Impeccable 4.8.0): 62 regras. O scan dos arquivos de `docs/` devolveu **7 achados** (código de saída 2). Nenhuma regra de paleta roxa, gradiente, Inter/Roboto, card aninhado, glow ou hero em itálico disparou.

| Regra | Severidade no CLI | Arquivo | Julgamento nesta auditoria |
|---|---|---|---|
| `side-tab` | warning | `index.html` linha 0 (duas vezes; o CLI não deu linha útil) | Eco das regras do CSS linkado. Sem linha, não é um segundo bug. |
| `low-contrast` | advisory | `index.html` linha 0, “4.2:1, `#6b7689` sobre `#f4f6fb`” | Verdadeiro. O cálculo deu 4,24:1. Vale para muted sobre `--bg`, não sobre o cartão branco (4,59:1). Virou o P1 de contraste. O CLI não viu o tema escuro: o botão branco sobre `#5b8def` (3,23:1) é achado da conta manual e do Chrome, não do detector. |
| `em-dash-overuse` | advisory | `index.html`, “13 em-dashes” | Falso positivo de voz. Os travessões são “— ou —”, o título e a tagline. Não reescrever. |
| `side-tab` | warning | `style.css` 145 | `.ocorrencia`. Barra de resultado de motivo. P3 visual. |
| `side-tab` | warning | `style.css` 196 | `.rotulo-fixo`. É o aviso de rigor. Manter o texto; a barra é opcional. |
| `side-tab` | warning | `style.css` 197 | `.aviso-predita`. Mesmo caso, para estrutura predita. |

Regras que precisariam de página renderizada (`tiny-text`, `text-overflow`, `first-viewport-column-overflow`, `low-contrast` de pixel) não rodaram num URL: o `detect` foi no fonte. O overflow de 360/390 e o “ver” de 19 px são desta auditoria no Chrome, não do JSON do detector. Tratar o JSON como lista fechada e curta; os P1 de reflow não estão nele.

## 7. O que não deve mudar por motivo científico

A auditoria pede ajuste de layout, contraste, nome acessível e carregamento. As frases abaixo são o produto. Reescrevê-las em linguagem de marketing, suavizar a negação ou escondê-las atrás de um tooltip estraga o rigor. Podem continuar visíveis uma vez por seção, em vez de três, desde que o texto permaneça íntegro e encontrável sem hover.

Entrada, `docs/index.html` 36:

> O que não faz: docking, dinâmica molecular, minimização, protonação e cálculo de afinidade. Contato geométrico não é contribuição energética. Escore de docking não é afinidade.

Ajuda, `docs/index.html` 74:

> Preparo é uma ficha auxiliar. Ela não valida a estrutura e não substitui a conferência humana.

Pockets, `docs/index.html` 166 e a constante `AVISO_DESCRITOR` em `docs/app.js` 655:

> O drugScore e o volume são descritores geométricos da cavidade, não previsão de ligação. Escore de docking não é afinidade. Contato geométrico não é contribuição energética.

Dica da coluna DrugScore, `docs/app.js` 665: descritor geométrico, não afinidade nem previsão de ligação. A dica de volume na linha 659 (“quanto maior, mais espaço para um ligante”) é mais solta que o rótulo fixo. Se alguma frase for alinhada, alinha-se essa dica ao rótulo, e o rótulo fica.

Cânone em `docs/prep-analysis.js` 22–39, usado pela ficha e pelo arquivo exportado:

- “Contato geométrico não é contribuição energética.”
- “Escore de docking não é afinidade.”
- “Ficha auxiliar: exige conferência humana. Não faz docking, dinâmica molecular, minimização, protonação nem cálculo de afinidade.”
- “O número de série é o do arquivo original. Ele muda se outro programa renumerar os átomos. Não serve como identificador depois dessa renumeração.”
- “Estrutura predita: o pLDDT, quando está no fator de temperatura, indica a confiança por resíduo. Ele não informa se um pocket está em estado apo ou holo.”
- “Sugestão editável de caixa. Não é uma caixa validada e não é resultado de docking.”
- “Indício geométrico, não protonação. Sem hidrogênios no arquivo, a geometria não separa tautômeros com segurança.”
- “Rascunho. Não é um arquivo de entrada pronto. A numeração pode mudar depois do loadpdb e precisa ser conferida.”
- “Lacuna de numeração não prova resíduo faltante. O REMARK 465 confirma quando ele existe.”
- “O nome GLYCAM do açúcar não sai da geometria.”
- “O drugScore e o volume do DoGSite são descritores geométricos da cavidade, não previsão de ligação.”

Também ficam, na ficha: “Pode ser ponte. Não remova sem conferir.” (`prep-ui.js` 384), “Não é área de superfície.” (`prep-ui.js` 419) e “Ainda é uma sugestão editável, não uma caixa validada.” (`prep-ui.js` 593). O REMARK gravado no PDB filtrado (“Não adiciona hidrogênio…”) em `prep-analysis.js` é conteúdo do arquivo, não cópia de UI.

Terminologia que permanece: DoGSiteScorer, ProteinsPlus, drugScore, LINK, SSBOND, tleap, altloc, HETATM, pLDDT, apo/holo, center_x/size_x, Å. A comparação pode perder a frase “5 perguntas do trabalho” (`index.html` 215) sem perder ciência; é resíduo de enunciado de curso, não um descritor.

O que também já está certo e a próxima mudança visual deve preservar: processamento do PDB no navegador, pockets só com ID, viewer mostrando a estrutura original enquanto o PDB baixado é cópia filtrada, campo “Decisão do pesquisador” por seção, exemplos 1A00 / 4HHB / 1CRN, e legenda de cadeia com texto além da cor.

## 8. Ordem sugerida de correção

Lotes pequenos, cada um verificável nas mesmas larguras (360, 390, 768, 1024, 1280) mais a paisagem 844×390. Nenhum lote mexe nas frases da seção 7.

1. **Reflow, só CSS.** `minmax(0, 1fr)` no grid, `min-width: 0` nos dois cartões, `flex-wrap` em `.entrada-row` e `.viewer-controls`, `min-width: 0` no input da entrada. Critério: overflow horizontal da página = 0 em 360 e 390, com Preparo aberto; “Analisar ID” e “Tamanho” inteiros; tabelas rolando dentro de `.prep-scroll`. Conferir de novo a 1024, onde as duas colunas já funcionam.
2. **Contraste e toque, só tokens e padding.** Primário escuro, erro claro, FASTA, muted sobre `--bg`, borda de input, e a altura dos `.link-btn` / chips / checkboxes do viewer. `font-size: 1rem` nos numéricos da ficha. Critério: as razões da tabela do P1 passam de 4,5:1; “ver” mede pelo menos 24×24 e, no ponteiro grosso, 44×44.
3. **Teclado e nomes.** `label`, `aria-live`, diálogo com Escape e foco, `aria-selected` nas abas, `button` dentro do `th` ordenável, `aria-label` no tema. Critério: Tab chega ao diálogo e não ao fundo; Escape fecha; o erro de ID `ABC` é anunciável.
4. **Peso, sem build.** Adiar Plotly e jsPDF até o primeiro uso; reexportar o PNG da entrada perto de 640 px de largura (2× de 320). Critério: o primeiro HTML não pede os ~1,3 MB gzip do Plotly nem o PNG de 1 MB. 3Dmol pode ficar se `?pdb=` precisar do viewer na hora.
5. **Acabamento.** `:focus-visible` mais claro sobre o canvas; `prefers-reduced-motion` no spinner e no `scrollTo`; uma ocorrência visível de cada aviso por seção, com o texto integral; altura do viewer em `max-height` baixa. O `side-tab` só se ainda incomodar depois do lote 1.

Depois do lote 1 vale repetir `npx impeccable detect docs/` e o mesmo roteiro no Chrome. O detector não viu o overflow; o roteiro do Chrome é que fecha esse eixo.
