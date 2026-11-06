# Análise guardada e comparação por pergunta

Contrato do arquivo baixado por **Guardar análise**: `peki-analise-1`, em `docs/analysis-snapshot.js`. A comparação calculada no navegador usa `peki-comparacao-1`.

O JSON fica no computador de quem analisa. Reabrir o arquivo não envia nada a um servidor e não cria conta. O PDB original não entra no arquivo. O snapshot guarda a leitura já feita, com a origem e o que estava disponível na hora.

## O que o arquivo leva

- Identificação, data, formato e proveniência (`rcsb`, arquivo local, estrutura predita citada no próprio arquivo, ou origem não identificada).
- Sequência e resíduos modelados por cadeia, no referencial author.
- Lacunas: se o diagnóstico está determinado e a lista de ausentes citados. Sem fonte explícita, a cobertura não vira zero.
- Componentes observados (heterocomponentes, íons, modificados, águas registradas). HETATM não prova estado holo.
- Qualidade no estado real: `ok`, `parcial`, `pendente`, `ausente`, `erro`, `rede` ou `nao_aplica`. Métrica que o relatório não trouxe não é preenchida.
- Pockets do DoGSiteScorer/ProteinsPlus, ou `nao_solicitado`, `pendente`, `erro` ou `nao_aplica`. O drugScore é descritor geométrico.
- Ficha de preparo quando ela rodou: contagens, seleção de HET mantidos, anotações curtas e caixa editável. mmCIF continua com a ficha bloqueada.
- Declarações de banco como intervalo. `uniprot.correspondenciaResiduo` permanece `nao_estabelecida`.

Uma versão `peki-analise-N` com N maior que 1 é recusada. A lista já importada não é apagada.

## Ranking

Entram 2 a 5 análises. Os pesos são cobertura do modelo, qualidade, presença de um componente nomeado e maior drugScore. Peso zero tira o critério. A pontuação de cada candidato é a média ponderada só dos critérios que têm dado; os pesos desses critérios são renormalizados. A fração dos pesos que tinha dado aparece à parte e não vira bônus.

Qualidade e drugScore só são normalizados quando há número em pelo menos duas análises da mesma classe experimental, no caso das métricas que dependem dela. Menor resolução, Rfree, clashscore ou outlier de Ramachandran fica mais alto **dentro deste conjunto**. Um valor isolado não vira nota.

Região opcional, no formato `A:10-40` ou `A:10-40,B:1-20`. Ela só entra na cobertura quando o número author e o acesso declarado concordam. Sem isso, e com a região marcada como essencial, não há ranking. Não há mapa UniProt nem alinhamento estrutural.

Componente ausente no inventário pode ser eliminatório. Isso é ausência observada, não nota de qualidade. Pocket sem drugScore, se marcado como eliminatório, tira o candidato em vez de atribuir zero.

O número não é verdade biológica nem nota universal de qualidade. A pessoa pode registrar outra escolha, com justificativa, e levá-la no relatório Markdown ou no JSON `peki-comparacao-1`.

## O que esta versão não faz

- Não mapeia resíduo a resíduo com UniProt/SIFTS e não sobrepõe coordenadas.
- Não declara dois pockets como o mesmo sítio.
- Não sincroniza arquivos entre aparelhos.
- Não reimporta PDF como análise.
- Não promete interpretação biológica automática.
