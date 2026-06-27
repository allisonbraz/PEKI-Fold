# PRD — Plataforma Web de Análise Estrutural de Proteínas

**Projeto:** PEKI Fold — Protein Exploration Kit for Insights
**Autor:** Allison Braz
**Instituição:** Universidade Federal de Jataí (UFJ)
**Orientador:** Prof. Dr. Roosevelt Alves da Silva
**Data:** 2026-06-27
**Status:** Rascunho para discussão
**Base:** Evolução dos Programas 01–06 (CLI em Python) do Trabalho Final de Algoritmos para uma aplicação web online, visual e capaz de processar qualquer PDB.

---

## 1. Visão geral

Hoje o projeto é um conjunto de 6 scripts de linha de comando que analisam 10 arquivos PDB fixos de hemoglobina (separação de cadeias, estatísticas, frequência de aminoácidos, busca de motivos e detecção de pockets com DoGSite3) e geram um relatório PDF.

**Objetivo:** transformar esses scripts numa **aplicação web** onde qualquer pessoa possa enviar (ou buscar pelo ID) uma estrutura PDB, visualizá-la em 3D, rodar as análises de forma interativa e exportar os resultados — sem precisar de terminal nem instalar nada.

**Frase-resumo:** *"Cole um ID do PDB (ou faça upload), veja a proteína em 3D e obtenha cadeias, estatísticas, composição e pockets em segundos."*

---

## 2. Problema e contexto

| Limitação atual | Impacto |
|---|---|
| Roda só em terminal (Python + libs instaladas) | Barreira para usuários não-técnicos |
| Conjunto de PDBs fixo (`pdbproteins/`) | Não serve para outras proteínas |
| Sem visualização da molécula | Resultados abstratos, pouco intuitivos |
| Saída em texto/PDF estático | Não é interativo nem explorável |
| DoGSite3 exige instalação local + licença | Difícil de reproduzir/compartilhar |

---

## 3. Público-alvo (personas)

1. **Estudante/pesquisador de bioinformática** — quer analisar uma proteína rapidamente sem montar ambiente.
2. **Professor/avaliador** — quer reproduzir e explorar os resultados do trabalho de forma visual.
3. **Autor do projeto (você)** — quer um portfólio online demonstrável e reutilizável.

---

## 4. Objetivos e métricas de sucesso

- **O1 — Acessibilidade:** rodar todas as análises pelo navegador, sem instalação. → *Métrica: 100% das funções dos Programas 01–05 disponíveis na web.*
- **O2 — Generalização:** aceitar qualquer PDB (upload ou ID RCSB). → *Métrica: análise bem-sucedida de PDBs fora do conjunto original.*
- **O3 — Visualização:** estrutura 3D + gráficos interativos. → *Métrica: viewer 3D com seleção de cadeia e destaque de pocket.*
- **O4 — Exportação:** baixar resultados (CSV, PNG, PDF). → *Métrica: relatório PDF equivalente ao atual, gerado on-demand.*

---

## 5. Escopo

### Dentro do escopo (MVP + v1)
- Upload de `.pdb`/`.cif` e busca por ID no RCSB.
- Visualização 3D interativa.
- Análises dos Programas 01–05 na web.
- Detecção de pockets (Programa 06) — ver decisão na seção 8.
- **Comparação de 2 a 4 proteínas** (estatísticas, composição de aminoácidos e pockets cross-protein).
- Exportação CSV/PNG/PDF.

### Fora do escopo (por enquanto)
- Docking molecular real (apenas sugestão de pocket, como hoje).
- Contas de usuário / histórico persistente (avaliar na v2).
- Edição/mutação de estruturas.
- Comparação simultânea de muitas proteínas (batch grande).

---

## 6. Funcionalidades (mapeando os programas atuais)

| Programa atual | Feature web | Visualização |
|---|---|---|
| 01/02 — Separação de cadeias | Lista de cadeias detectadas; download individual | Cadeias coloridas no viewer 3D; toggle por cadeia |
| 03 — Estatísticas | Tabela interativa (ordenável/filtrável) | Cards-resumo + destaque maior/menor cadeia |
| 04 — Frequência de aminoácidos | Gráfico de barras interativo por cadeia | Hover com %; opção empilhar cadeias |
| 05 — Busca de motivos | Campo de busca (ex.: `GLY-LYS-SER`) | Resíduos do motivo destacados na 3D |
| 06 — Pockets (DoGSite3) | Tabela de pockets + ranking | Pockets renderizados como superfície/esferas na 3D |
| **Comparação (novo)** | Comparar 2–4 PDBs: estatísticas, aminoácidos e pockets | Tabelas e gráficos comparativos; 5 perguntas cross-protein |
| Relatório PDF | Botão "Exportar relatório" | PDF gerado on-demand com os resultados da sessão |

---

## 7. Requisitos funcionais

- **RF1** Entrada: upload de arquivo `.pdb`/`.cif` (até ~20 MB) **ou** campo "ID do PDB" que busca em `https://files.rcsb.org/download/{ID}.pdb`.
- **RF2** Validação do arquivo PDB (registros mínimos, mensagem de erro amigável).
- **RF3** Detecção e separação de cadeias; permitir download de cada cadeia.
- **RF4** Estatísticas por cadeia (átomos, resíduos, aminoácidos diferentes; maior/menor).
- **RF5** Frequência e porcentagem dos 20 aminoácidos por cadeia, com gráfico.
- **RF6** Busca de motivo informado pelo usuário → proteína, cadeia, posição; destaque na 3D.
- **RF7** Detecção de pockets com descritores (volume, superfície, profundidade, hidrofobicidade, aceptores, doadores) + respostas analíticas e ranking.
- **RF8** Viewer 3D com: rotação/zoom, cor por cadeia, destaque de motivo e de pockets.
- **RF9** Exportação: CSV (estatísticas/pockets), PNG (gráficos) e PDF (relatório).
- **RF10** Processamento assíncrono para tarefas longas (pockets), com indicador de progresso.
- **RF11** Comparação de 2 a 4 proteínas (por ID do PDB) lado a lado:
  - **Estatísticas comparadas:** cadeias, átomos, resíduos e aminoácidos diferentes por proteína, em tabela e gráfico.
  - **Aminoácidos comparados:** porcentagem dos 20 aminoácidos por proteína, em gráfico de barras agrupado.
  - **Pockets cross-protein:** pocket principal de cada proteína (volume, profundidade, hidrofobicidade, drugScore) e respostas às 5 perguntas do enunciado entre as proteínas (maior volume, mais profundo, relação volume×profundidade, mais hidrofóbicas, escolha para docking), com gráficos de volume/profundidade/hidrofobicidade do pocket principal por proteína.

---

## 8. Decisão crítica — DoGSite3 online

DoGSite3 é um binário com **registro acadêmico/licença** e custo de processamento. Não pode simplesmente ser empacotado num servidor público. Opções:

| Opção | Prós | Contras | Recomendação |
|---|---|---|---|
| **A. Server-side em container** (binário no backend, fila de jobs) | UX integrada | Verificar licença para uso em servidor; custo de CPU | Boa se a licença permitir e o deploy for restrito |
| **B. Integração com API ProteinsPlus/DoGSiteScorer** (serviço oficial ZBH) | Sem hospedar o binário; mantido pelos autores | Depende de API externa, limites de uso | **Recomendada para v1** |
| **C. Pocket opcional / "traga seu DoGSite"** | Sem risco de licença | Recurso só local; perde valor online | Fallback |

**Recomendação:** MVP entrega os Programas 01–05 (puro Python, sem dependência externa); o Programa 06 entra na **v1** via Opção B (API oficial) com fallback para A em deploy privado.

---

## 9. Arquitetura técnica proposta

```
[Navegador]
  React + Mol* (viewer 3D) + Plotly/Recharts (gráficos)
        │  REST/JSON
        ▼
[Backend FastAPI (Python)]  ← reaproveita a lógica dos Programas 01–06
  ├── /chains   (separação)
  ├── /stats    (estatísticas)
  ├── /aafreq   (frequência)
  ├── /motif    (busca)
  ├── /pockets  (DoGSite3 — assíncrono)
  └── /report   (PDF on-demand)
        │
        ├── Fila de jobs (Redis + RQ/Celery) para tarefas longas
        └── Armazenamento temporário de uploads/resultados
        │
        ▼
[Fonte externa] RCSB (download por ID) | API DoGSiteScorer (pockets)
```

**Stack recomendada (justificativa: reaproveitar o Python já escrito):**
- **Backend:** FastAPI — refatorar os scripts em módulos importáveis (`separador.py` já é um bom começo) expostos como endpoints.
- **Frontend:** React + **Mol\*** ou **NGL Viewer** (visualização molecular padrão da área) + Plotly para gráficos interativos.
- **Async:** Redis + RQ para os jobs de pocket.
- **Deploy:** Docker; hospedagem em Render / Railway / Fly.io / Hugging Face Spaces (opções gratuitas/baratas para projeto acadêmico).

---

## 10. Fluxo de UX (telas)

1. **Home / Entrada** — campo "ID do PDB" + área de upload (drag-and-drop). Exemplos clicáveis (ex.: 1A00).
2. **Workspace** — layout em duas colunas:
   - Esquerda: **viewer 3D** (Mol*), controles de cor/cadeia/destaque.
   - Direita: **abas** → Cadeias | Estatísticas | Aminoácidos | Motivos | Pockets.
3. **Cada aba** mostra tabela/gráfico interativo e botão de exportar.
4. **Barra superior** — botão "Exportar relatório PDF" e indicador de jobs em andamento.

Princípios de UX: feedback imediato (loading/skeleton), mensagens de erro claras, mobile-friendly, tema claro/escuro.

---

## 11. Requisitos não-funcionais

- **Desempenho:** análises 01–05 em < 3 s para um PDB típico; pockets assíncronos com progresso.
- **Limites:** tamanho máx. de upload; rate-limit por IP.
- **Segurança:** sanitizar uploads, isolar execução, não persistir dados sensíveis por padrão.
- **Observabilidade:** logs de erro e de jobs.
- **Acessibilidade:** contraste, navegação por teclado, textos alternativos nos gráficos.

---

## 12. Roadmap por fases

### Fase 0 — Refatoração (base)
Transformar os scripts em módulos limpos e testáveis (separar I/O da lógica). Aproveita o que já existe.

### Fase 1 — MVP (Programas 01–05 online)
- Upload + busca por ID RCSB.
- Backend FastAPI com endpoints 01–05.
- Frontend com viewer 3D + abas + gráficos interativos.
- Exportar CSV/PNG/PDF.
- Deploy público inicial.

### Fase 2 — v1 (Pockets + polimento)
- Integração DoGSite (Opção B) com jobs assíncronos.
- Pockets visualizados na 3D + ranking e respostas analíticas.
- Melhorias de UX e responsividade.

### Fase 3 — v2 (extras, se desejado)
- Contas/histórico de análises.
- Comparação entre proteínas.
- Compartilhar link de resultado.

---

## 13. Riscos

| Risco | Mitigação |
|---|---|
| Licença do DoGSite3 para uso online | Usar API oficial (Opção B) ou deploy privado |
| Custo de hospedagem | Tier gratuito acadêmico; análises 01–05 são leves |
| PDBs grandes/atípicos (NMR multi-modelo como 1a0n) | Tratar múltiplos modelos; limites e validação |
| Tempo de processamento de pockets | Fila assíncrona + feedback de progresso |
| Complexidade do viewer 3D | Usar biblioteca pronta (Mol*/NGL), não reinventar |

---

## 14. Decisões em aberto (preciso da sua escolha)

1. **Público:** uso pessoal/acadêmico (deploy simples, sem login) **ou** ferramenta pública (precisa rate-limit, talvez login)?
2. **DoGSite3:** seguir com a API oficial (Opção B) ou você tem licença que permita rodar o binário no servidor (Opção A)?
3. **Hospedagem:** preferência de plataforma/orçamento (gratuito vs. pago)?
4. **Identidade visual:** nome do produto e estilo (cores, logo)?
5. **Prioridade do MVP:** focar primeiro em "visualização 3D + análises 01–05" e deixar pockets para a fase 2 (recomendado)?
