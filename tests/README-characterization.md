# Saídas de referência antes da refatoração

Esta suíte registra o comportamento atual dos scripts em `docs/`. Não corrige
bugs nem modifica código de produção. Usa somente módulos nativos do Node.js,
arquivos locais e respostas simuladas: não exige instalação, backend ou build.

Execute a partir da raiz do repositório, com Node.js 18 ou superior:

```sh
node --test tests/characterization.test.js
```

A execução normal é somente leitura. Uma referência ausente ou diferente causa
falha; os testes não atualizam expectativas automaticamente.

## Cobertura

| Referência em `fixtures/characterization/` | O que congela |
| --- | --- |
| `structures.json` | Contratos completos de estrutura/análise para 1A00, 1A1C, 1A0N, 1CRN mmCIF, PDB sintético e formatos inválidos. Texto das coordenadas reais é comparado por SHA-256 e tamanho para evitar duplicar arquivos grandes. |
| `classic.json` | Estatísticas, sequências, frequências, motivos e separação de cadeias; inclui a diferença atual entre análise individual e comparação de multimodelos. |
| `quality.json` | XML local, alternativa RCSB JSON, classes experimentais, indicadores locais, CCD e texto do dossiê. |
| `preparation.json` | Inventário, contatos, dissulfeto, ASN–NAG, limpeza, água, altLoc A/ocupação e caixa/configuração Vina. |
| `pockets.json` | Resposta simulada do DoGSite, parâmetros da chamada, TSV, filtragem de subpockets, URL de resíduos, cache e seleção de resíduos. |
| `snapshots.json` | `peki-analise-1`, serialização, estados de ausência/pendência/erro, mmCIF, importação do JSON antigo 4HHB e rejeição de versão futura mantendo a coleção. |
| `ranking.json` | Pesos, empate, falta de dados, critério eliminatório, região, comparação com JSON antigo, decisão e relatórios Markdown/JSON. |
| `ensemble.json` | Relatório completo, alinhamento por número/sequência, dependência da ordem de agrupamento, CSV e JSON `ensemble-1`. |
| `exports.json` | Downloads individuais e da comparação: Markdown, CSV, FASTA e JSON; especificações de gráficos e conteúdo enviado pelo aplicativo ao gerador PDF, incluindo preparo. |

As entradas reais reutilizam `pdbproteins/pdb1a00.pdb`, `pdb1a1c.pdb`,
`pdb1a0n.pdb` e as fixtures já versionadas em `fixtures/estrutura/`,
`fixtures/qualidade/` e `fixtures/analises/`. A proveniência dessas fixtures
continua nos respectivos arquivos `ORIGEM.txt`. O PDB geométrico do harness e os
candidatos `SIN-*` são sintéticos, sem significado biológico. As URLs
`fixture.invalid` não são acessadas.

Somente as entradas de texto são normalizadas de CRLF/CR para LF, permitindo
execução em Windows e Unix. Os resultados não são reordenados nem arredondados.
Datas são fixadas em `2026-11-12T15:00:00.000Z`; o texto de data local é simulado
como `12/11/2026, 12:00:00`, sem depender do fuso ou ICU da máquina.

Os objetos são comparados no formato serializável em JSON, inclusive campos
nulos e ordem dos arrays. A impressão JSON também é congelada onde há exportação.
O harness executa os scripts originais em contextos VM isolados, sem inicializar
a tela; controla apenas relógio e fronteiras de rede, download, gráficos e PDF.

Isto não é teste visual de 3Dmol/Plotly nem comparação binária de PDF. No PDF são
verificados textos, tabelas, ordem das seções, imagens solicitadas e nome do
arquivo antes do renderizador externo; paginação, fontes e rasterização exigem
verificação visual separada. A suíte também não substitui testes de navegação
ou de disponibilidade das APIs reais.

## Comportamentos conhecidos preservados

Há verificações explícitas de `null` convertido em zero no snapshot, validação
permissiva de métricas e perda de subgrupos no XML em blocos após 64 KiB. As
referências também preservam a contagem de todos os modelos na comparação,
a seleção que perde inserções e a associação posicional de URLs após o filtro
de subpockets. São registros de bugs atuais, não validação científica. Uma
correção futura deve alterar as expectativas em uma mudança separada.

## Capturar uma nova referência deliberadamente

Não execute isto para fazer passar uma refatoração com regressão. A captura
abaixo sobrescreve apenas os nove JSON desta suíte e precisa de revisão do diff:

```sh
node tests/helpers/capture-characterization.js --write
git diff -- tests/fixtures/characterization
node --test tests/characterization.test.js
```

O comando sem `--write` recusa a gravação. As referências devem permanecer
versionadas; não há captura automática durante testes ou publicação do site.
