# PRD — PEKI Fold · Plataforma Web de Análise Estrutural de Proteínas

**Projeto:** PEKI Fold — *Protein Exploration Kit for Insights*
**Autor:** Allison Braz
**Instituição:** Universidade Federal de Jataí (UFJ)
**Orientador:** Prof. Dr. Roosevelt Alves da Silva
**Data:** 2026-06-27
**Status:** ✅ **v1 implementada e publicada** (documento consolidado)
**App online:** https://allisonbraz.github.io/PEKI-Fold/
**Repositório:** https://github.com/allisonbraz/PEKI-Fold
**Base:** Evolução dos Programas 01–06 (CLI em Python) do Trabalho Final de Algoritmos para uma aplicação web online, visual e capaz de processar qualquer PDB.

> **Nota de versão:** este PRD começou como rascunho propondo um backend FastAPI.
> Durante a implementação descobrimos que as fontes externas (RCSB e ProteinsPlus)
> liberam **CORS** para o navegador, o que permitiu entregar tudo como um app
> **100% estático**, sem servidor. As seções abaixo já refletem a **arquitetura
> e o escopo realmente entregues**; a proposta original ficou registrada na
> seção 16 (Aprendizados).

---

## 1. Visão geral

O ponto de partida eram 6 scripts de linha de comando que analisavam 10 arquivos PDB fixos de hemoglobina (separação de cadeias, estatísticas, frequência de aminoácidos, busca de motivos e detecção de pockets com DoGSite3) e geravam um relatório PDF.

O **PEKI Fold** transforma esses scripts numa **aplicação web** onde qualquer pessoa pode buscar pelo ID (ou enviar) uma estrutura PDB, visualizá-la em 3D, rodar as análises de forma interativa e exportar os resultados — sem terminal e sem instalar nada.

**Frase-resumo:** *"Cole um ID do PDB (ou faça upload), veja a proteína em 3D e obtenha cadeias, estatísticas, composição, motivos e pockets em segundos — e compare proteínas."*

---

## 2. Problema e contexto

| Limitação original (CLI) | Como o PEKI Fold resolve |
|---|---|
| Roda só em terminal (Python + libs) | App no navegador, sem instalação |
| Conjunto de PDBs fixo (`pdbproteins/`) | Aceita qualquer PDB por ID (RCSB) ou upload |
| Sem visualização da molécula | Viewer 3D (3Dmol.js) com cor por cadeia, ligantes e superfície |
| Saída em texto/PDF estático | Tabelas e gráficos interativos + exportação on-demand |
| DoGSite3 exige instalação + licença | API oficial DoGSiteScorer (ProteinsPlus) chamada do navegador |

---

## 3. Público-alvo (personas)

1. **Estudante/pesquisador de bioinformática** — analisa uma proteína rapidamente sem montar ambiente.
2. **Professor/avaliador** — reproduz e explora os resultados de forma visual (inclusive via link direto).
3. **Autor do projeto** — portfólio online demonstrável e reutilizável.

---

## 4. Objetivos e métricas (resultado)

- **O1 — Acessibilidade:** rodar as análises pelo navegador, sem instalação. → ✅ *100% dos Programas 01–06 disponíveis na web.*
- **O2 — Generalização:** aceitar qualquer PDB (upload ou ID RCSB). → ✅ *qualquer ID do RCSB; upload local para 01–05.*
- **O3 — Visualização:** estrutura 3D + gráficos interativos. → ✅ *viewer 3D com cor por cadeia, ligantes, superfície, destaque de motivo e de pocket.*
- **O4 — Exportação:** baixar resultados. → ✅ *PDF e Markdown (com imagens) + CSV por análise.*

---

## 5. Escopo (entregue)

### Dentro do escopo — implementado
- Busca por **ID no RCSB** e **upload** de `.pdb` (lido localmente).
- **Visualização 3D** interativa (3Dmol.js): cor por cadeia, ligantes (HET), superfície molecular/da cavidade, estilos, tamanho ajustável.
- Análises dos **Programas 01–05** no navegador.
- **Detecção de pockets (Programa 06)** via API oficial DoGSiteScorer/ProteinsPlus.
- **Comparação de 2 a 4 proteínas** (estatísticas, aminoácidos e pockets cross-protein, com viewers 3D lado a lado).
- **Exportação** PDF / Markdown (seções selecionáveis) e **CSV** (aminoácidos, estatísticas, pockets).
- **Card de metadados** ("Sobre a estrutura") via RCSB Data API + parse do PDB.
- **Link compartilhável** por ID (`?pdb=`, `?compare=`).

### Fora do escopo (por enquanto)
- Docking molecular real (apenas sugestão de pocket por *drugScore*).
- Contas de usuário / histórico persistente.
- Edição/mutação de estruturas.
- Comparação em lote grande (> 4 proteínas).

---

## 6. Funcionalidades (mapeando os programas)

| Programa / recurso | Feature web entregue | Visualização |
|---|---|---|
| 01/02 — Separação de cadeias | Lista de cadeias; download PDB e **FASTA** por cadeia (e "FASTA todas") | Cadeias coloridas no viewer 3D |
| 03 — Estatísticas | Tabela + cards; maior/menor; **CSV** | Destaque da maior cadeia |
| 04 — Frequência de aminoácidos | Gráfico por cadeia, **ordenável** (alfabética/percentual/contagem); **CSV** | Hover com % |
| 05 — Busca de motivos | Campo de busca (ex.: `GLY-LYS-SER`) | Resíduos do motivo destacados na 3D |
| 06 — Pockets (DoGSiteScorer) | Tabela de descritores **ordenável** + tooltips/legenda; 5 respostas analíticas; gráficos; **CSV**; cache por sessão | Resíduos destacados + **superfície da cavidade** na 3D |
| **Comparação** | 2–4 PDBs: estatísticas, aminoácidos e pockets cross-protein; **CSV** | **Viewers 3D por proteína** (tamanho ajustável) + gráficos |
| **Metadados** | Card "Sobre a estrutura" (título, método, resolução, organismo, ligantes, peso, depósito) | Link "Ver no RCSB" |
| Relatório | **Exportar PDF/Markdown** (seções selecionáveis, imagens incluídas) | Modal com escolha de formato e conteúdo |

---

## 7. Requisitos funcionais (status)

- **RF1** ✅ Entrada por upload `.pdb` **ou** ID do PDB (`files.rcsb.org`).
- **RF2** ✅ Validação do PDB com mensagem de erro amigável.
- **RF3** ✅ Detecção/separação de cadeias; download de cada cadeia (PDB e FASTA).
- **RF4** ✅ Estatísticas por cadeia (átomos, resíduos, aminoácidos diferentes; maior/menor).
- **RF5** ✅ Frequência/porcentagem dos 20 aminoácidos por cadeia, com gráfico (ordenável) e CSV.
- **RF6** ✅ Busca de motivo → cadeia, posição, resíduos; destaque na 3D.
- **RF7** ✅ Pockets com descritores (volume, superfície, profundidade, hidrofobicidade, aceptores, doadores, *drugScore*) + respostas analíticas e ranking.
- **RF8** ✅ Viewer 3D: rotação/zoom, cor por cadeia, ligantes, superfície, destaque de motivo e de pocket; tamanho ajustável.
- **RF9** ✅ Exportação: **PDF e Markdown** (com tabelas, imagens do viewer e gráficos) + **CSV** (aminoácidos/estatísticas/pockets). *Obs.: gráficos vão embutidos no PDF/MD em vez de PNGs avulsos.*
- **RF10** ✅ Pockets assíncronos (submit + polling) com indicador de progresso.
- **RF11** ✅ Comparação de 2 a 4 proteínas (estatísticas, aminoácidos agrupados, pockets cross-protein com as 5 perguntas do enunciado, viewers 3D lado a lado, CSV).
- **RF12** ✅ Card "Sobre a estrutura" (parse do PDB + RCSB Data API); aviso de NMR multi-modelo.
- **RF13** ✅ Link compartilhável (`?pdb=ID`, `?compare=ID1,ID2`); tema claro/escuro lembrado.

---

## 8. Decisão — DoGSite3 online (RESOLVIDA)

**Decisão tomada: Opção B — API oficial ProteinsPlus / DoGSiteScorer**, chamada **direto do navegador**.

| Opção | Resultado |
|---|---|
| A. Binário server-side | Descartada (exigiria backend, licença e custo) |
| **B. API oficial ProteinsPlus/DoGSiteScorer** | ✅ **Adotada** — CORS liberado, sem hospedar binário |
| C. Pocket opcional/local | Não necessária |

**Fluxo da API (validado):**
1. `POST https://proteins.plus/api/dogsite_rest` com `{"dogsite":{"pdbCode":"1a00","analysisDetail":"0","bindingSitePredictionGranularity":"1","ligand":"","chain":""}}` → `202` com a URL do job **no corpo JSON** (`location`).
2. *Polling* `GET {location}` até `200` com `result_table` (TSV de descritores), `residues` (PDBs por pocket) e `pockets`.
3. *Rate limit:* `429` → mensagem amigável. **Pockets só por ID** (a API não aceita upload).

---

## 9. Arquitetura técnica (entregue — 100% estática)

```
[ Navegador ]  — sem backend, sem build —
  index.html
  ├── pdb-analysis.js   (porta JS dos Programas 01–05; análise local)
  ├── app.js            (UI, viewer, gráficos, exportação, comparação)
  └── style.css
        │  fetch (CORS)
        ├──► RCSB  files.rcsb.org/download/{ID}.pdb     (coordenadas)
        ├──► RCSB  data.rcsb.org/rest/v1/core/entry/{ID} (metadados)
        └──► ProteinsPlus  /api/dogsite_rest             (pockets)

  Bibliotecas via CDN: 3Dmol.js (viewer 3D) · Plotly (gráficos) ·
                       jsPDF + autoTable (exportação PDF)
  Publicação: GitHub Pages (pasta docs/) — gratuito, sem servidor.
```

**Por que estático:** toda a lógica dos Programas 01–05 roda no navegador (`pdb-analysis.js`); pockets e metadados vêm de APIs públicas com CORS. Isso eliminou backend, fila de jobs, custo de hospedagem e infraestrutura — mantendo as mesmas funcionalidades.

> A variante backend **FastAPI (`webapp/`)** chegou a ser criada como alternativa, mas foi **removida** por ser redundante diante da abordagem estática.

---

## 10. Fluxo de UX (telas entregues)

1. **Home / Entrada** — campo "ID do PDB" + upload (drag-and-drop), exemplos clicáveis (1A00, 4HHB, 1CRN), bloco "Comparar proteínas" e seção recolhível **"Como usar"**.
2. **Workspace (análise única)** — cabeçalho com nome/resumo + **Exportar** e **Nova análise**; **card "Sobre a estrutura"**; layout em duas colunas:
   - Esquerda: **viewer 3D** (estilo, girar, ligantes, superfície, tamanho).
   - Direita: **abas** → Cadeias | Estatísticas | Aminoácidos | Motivos | Pockets.
3. **Workspace (comparação)** — **viewers 3D por proteína** (tamanho ajustável) + abas Estatísticas | Aminoácidos | Pockets.
4. **Exportação** — modal com formato (PDF/Markdown) e seleção de seções/imagens ("Tudo" ou atalho "Só pockets").

**Princípios de UX aplicados:** feedback imediato (spinner/status), mensagens de erro claras, **tema claro/escuro lembrado**, identidade visual PEKI Fold (logo, ícone, favicon), créditos no rodapé.

---

## 11. Requisitos não-funcionais (status)

- **Desempenho:** análises 01–05 praticamente instantâneas (no cliente); pockets em segundos no servidor da ProteinsPlus, com progresso e **cache por sessão**.
- **Custo/infra:** zero — app estático no GitHub Pages.
- **Privacidade:** upload é lido com `FileReader` e **não sai do computador**; nada é persistido em servidor.
- **Limites:** sem limite de upload local; pockets sujeitos ao *rate limit* da API externa.
- **Acessibilidade:** contraste, tooltips e textos auxiliares — navegação por teclado/mobile ainda podem ser aprimorados (ver seção 15).

---

## 12. Roadmap (executado)

- **Fase 0 — Base:** ✅ Programas 01–06 (CLI) + relatório PDF concluídos.
- **Fase 1 — MVP (01–05 web):** ✅ entrada por ID/upload, viewer 3D, abas, gráficos, deploy público.
- **Fase 2 — v1 (pockets + polimento):** ✅ pockets via DoGSiteScorer, comparação, exportação PDF/MD/CSV, metadados, FASTA, superfície, ligantes, ordenação, cache, rebrand PEKI Fold.
- **Fase 3 — extras:** ✅ link compartilhável de resultado (deep-link). ⏳ contas/histórico (não previstos para o trabalho).

---

## 13. Riscos (como foram tratados)

| Risco | Tratamento aplicado |
|---|---|
| Licença do DoGSite3 online | Resolvido com a **API oficial** (sem hospedar binário) |
| Custo de hospedagem | Eliminado — app **estático** no GitHub Pages |
| PDBs NMR multi-modelo (ex.: 1A0N, 25 modelos) | App usa **apenas o 1º MODEL** (contagens corretas) + aviso "modelo 1 de N" |
| Tempo/limite da API de pockets | Polling com progresso, tratamento de `429` e **cache por sessão** |
| Complexidade do viewer 3D | Uso de biblioteca pronta (**3Dmol.js**), sem reinventar |
| Dependência de serviço externo (pockets) | Degradação amigável; demais análises funcionam offline no cliente |

---

## 14. Decisões (RESOLVIDAS)

1. **Público:** uso **pessoal/acadêmico** — deploy simples, sem login.
2. **DoGSite3:** **API oficial (Opção B)**, do navegador.
3. **Hospedagem:** **GitHub Pages**, 100% estático, gratuito.
4. **Identidade visual:** **PEKI Fold** (verde-escuro/dourado), com logo, ícone e favicon.
5. **Prioridade:** 01–05 primeiro; pockets na sequência — ambos entregues.

---

## 15. Limitações conhecidas e ideias futuras

**Limitações atuais**
- Pockets dependem de um **serviço externo** (rate limit/disponibilidade) e **só funcionam por ID** (não por upload).
- Markdown exportado usa imagens em **base64**, que **não renderizam no preview do GitHub** (o PDF cobre esse caso).
- Acessibilidade/mobile em nível básico.

**Ideias para v2 (se desejado)**
- Acessibilidade e responsividade mobile mais completas.
- Superfície do pocket mais sofisticada (malha real da cavidade).
- Contas/histórico e compartilhamento de resultados salvos.
- Comparação em lote maior.

---

## 16. Aprendizados técnicos (consolidado)

- **Pivô para "static-first":** a arquitetura proposta (FastAPI + Redis + fila) foi substituída por um app **100% estático** após confirmar que **RCSB e ProteinsPlus liberam CORS**. Menos infra, custo zero, mesma funcionalidade.
- **API DoGSiteScorer:** a URL do job vem **no corpo JSON** (`location`), porque o header `Location` não é exposto via CORS; o `result_table` é um **TSV** de descritores; há `residues` (PDBs por pocket) usados para destacar a cavidade na 3D; **`429`** indica *rate limit*; submissão é **por `pdbCode`** (sem upload).
- **RCSB Data API** (`data.rcsb.org`): fornece metadados limpos (título, método, resolução, peso, depósito, classificação) com CORS — complementa o que se extrai do cabeçalho do próprio PDB.
- **NMR multi-modelo:** estruturas como **1A0N têm 25 modelos**; contar todos infla átomos/resíduos. Solução: usar só o **1º `MODEL`**.
- **Bugs corrigidos:**
  - atributo HTML `hidden` era anulado por regras `display:flex` → fix global `[hidden]{display:none!important}`.
  - colisão de seletores de abas entre os dois workspaces → escopar `#workspace .aba` vs `#comparacao .aba`.
  - gráfico de eixo duplo escondia uma série → simplificado para barras de resíduos por proteína.
- **Exportação:** `jsPDF` + `autoTable` para PDF; imagens do viewer via `pngURI()` e gráficos via `Plotly.toImage(spec)` (a partir de specs, independente de a aba estar visível).
- **Performance/robustez:** **cache de pockets por sessão** (por ID) evita re-chamar a API; superfícies 3D são opcionais (geração sob demanda).

---

## 17. Estado atual — resumo

PEKI Fold está **publicado e funcional** em https://allisonbraz.github.io/PEKI-Fold/, cobrindo os Programas 01–06 na web, comparação de proteínas, metadados do RCSB, exportação (PDF/Markdown/CSV) e visualização 3D rica (cadeias, ligantes, superfície, pockets), com identidade visual própria e créditos. A parte CLI (Programas 01–06 + `gerar_relatorio.py` + `Relatorio_Final.pdf`) permanece como base do trabalho.
