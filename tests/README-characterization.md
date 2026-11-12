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
| `prep-ui.json` | HTML integral de `montar` em sete etapas com 1CRN/4HHB: carga, seleção, decisões, caixa, edição inválida, pockets removidos e arquivo local; estado antes/depois e transição para mmCIF bloqueado. |
| `ensemble-ui.json` | HTML integral de `htmlRelatorio` e sessão antes/depois em sete etapas: primeira montagem, edições, referência 4HHB, seleções obsoletas, estrutura removida, ausência de bolsões e ensemble vazio; inclui identidades compartilhadas das caixas. |
| `diagnosticar-caminhos.json` | Dez leituras PDB/mmCIF: 1CRN/4HHB públicos, inserção 2A, saltos sem fonte, REMARK repetido/conflitante e por modelo, SEQRES com ausências, fontes concordantes e flags mmCIF. Congela todas as lacunas e a numeração lida. |
| `comparar-caminhos.json` | Empates no topo/fora do topo, tolerância não transitiva, pendências/erros e renormalização, eliminação, dados insuficientes, região com inserção e fontes diferentes; métricas e cópias de snapshots são simuladas sobre estruturas públicas. |
| `limpar-pdb-caminhos.json` | Quatorze combinações de altLoc, ocupação, cadeia A/B/sem ID/vazia/inexistente, águas/HET; primeiro modelo e limpezas de 1CRN/4HHB públicos. Guarda o PDB completo retornado, arquivos separados, contagens e mensagens. |
| `consultar-relatorio-caminhos.json` | XML, cache/hit/forçar, cancelamentos antes/durante fetch e durante o corpo, timeout disparado por relógio falso, alternativa JSON, ID divergente, truncamento e erros 404/429/503/rede/JSON. Registra respostas completas, pedidos, headers, aborts, timers e cache. |

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
a tela; controla relógio e fronteiras de rede, download, gráficos e PDF.

Para as duas interfaces, o harness acrescenta somente uma ponte de acesso no
retorno do módulo, **em memória**, sem substituir os corpos das funções ou
alterar `docs/`. O HTML retornado é comparado por inteiro, incluindo espaços,
atributos e escapes. O DOM mínimo não interpreta HTML nem simula layout.
`prep-ui` é inicializado por `aoCarregar`; seleção e edição usam os handlers
originais. `montar` é chamado com estado antes/depois; coordenadas e análise
volumosas ficam representadas por SHA-256, sem omitir as mudanças de seleção,
decisões, cache, raios e Vina. A sessão do ensemble fica explícita, incluindo
assinaturas e sugestões/edições de caixa; também são congelados os aliases e a
ausência de mutação do relatório durante o render.

As entradas novas são PDBs públicos 1CRN/4HHB em `fixtures/ui-render/`, com URLs
e hashes em `ORIGEM.md`; o mmCIF 1CRN já existente é reutilizado. Os pockets,
descritores e erros são simulados. Agrupar proteínas distintas aqui exercita a
interface e suas divergências, sem afirmar equivalência biológica ou resultado
real do DoGSite. O relógio é fixo e nenhuma rede é acessada por esses casos.

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

As interfaces também congelam caixas do preparo com dimensões não positivas,
caixa/índice antigos após remover os pockets, seleção/cache retidos ao bloquear
mmCIF e referências de caixa/pocket/grupo obsoletas no ensemble mesmo depois
de a referência do 3D ser corrigida.

Os caminhos adicionais congelam a tolerância de empate não transitiva (posição
1 sem pertencer à lista de líderes), a inserção que pode mascarar um número sem
diagnóstico na região e a limpeza por ocupação que mistura A/B por átomo. Na
consulta, o cache precede o sinal cancelado e ignora um contexto estrutural novo;
o timeout/listener termina antes da leitura do corpo, que pode ser aceito e
cacheado mesmo após cancelamento. Os testes registram esses defeitos atuais.

`edge-characterization-cases.js` reutiliza somente coordenadas públicas 1CRN e
4HHB já locais e o XML/JSON público de 1CRN. As variantes de inserção, SEQRES,
REMARK, flags mmCIF, altLoc/ocupação e ordem são derivadas em memória e estão
identificadas como testes, não como modelos depositados. As entradas públicas
não são modificadas. Descritores/pendências de ranking e todas as respostas de
rede/erros são simulados; não há consulta remota nem espera real por timeout.

## Capturar uma nova referência deliberadamente

Não execute isto para fazer passar uma refatoração com regressão. A captura
abaixo sobrescreve os quinze JSON desta suíte e precisa de revisão do diff:

```sh
node tests/helpers/capture-characterization.js --write
git diff -- tests/fixtures/characterization
node --test tests/characterization.test.js
```

O comando sem `--write` recusa a gravação. As referências devem permanecer
versionadas; não há captura automática durante testes ou publicação do site.

Para capturar deliberadamente somente as novas interfaces, preservando as
referências anteriores:

```sh
node tests/helpers/capture-characterization.js --write prep-ui ensemble-ui
```

Para capturar somente os quatro caminhos adicionais:

```sh
node tests/helpers/capture-characterization.js --write diagnosticar-caminhos comparar-caminhos limpar-pdb-caminhos consultar-relatorio-caminhos
```

Todos os arquivos de teste podem ser executados sem rede com o preload abaixo
(PowerShell). Ele serve a fronteira fetch do antigo smoke por fixture local e
recusa outras chamadas HTTP/HTTPS. A suíte antiga de preparo precisa dos seus
PDBs de teste já locais em `fixtures/`; se faltarem, falha em vez de baixá-los.

```powershell
$testFiles = (Get-ChildItem -LiteralPath tests -Filter '*.test.js' -File).FullName
node --require ./tests/helpers/offline-network.js --test @testFiles
```
