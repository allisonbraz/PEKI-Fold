# Qualidade e componentes — contrato `peki-qualidade-1`

A leitura do arquivo continua no contrato `peki-estrutura-1`. Esta aba não recalcula geometria no navegador e não transforma campo ausente em zero.

## O que é consultado

Há ID clássico de 4 caracteres:

1. **Relatório wwPDB em XML**, na cópia da PDBe, que envia `Access-Control-Allow-Origin: *`:
   `https://www.ebi.ac.uk/pdbe/entry-files/download/{id}_validation.xml`
   O elemento raiz é `wwPDB-validation-information`. O esquema citado nos arquivos lidos é `http://wwpdb.org/validation/schema/wwpdb_validation_v6.06.xsd`.
2. Se esse XML não entra (404, rede, CORS, corpo inválido ou ID diferente do pedido), a reserva global é a **RCSB Data API**, também com CORS `*`:
   `https://data.rcsb.org/rest/v1/core/entry/{ID}`
   Entram as categorias `pdbx_vrpt_summary*` e, para raio X, `Rwork`/`Rfree` da categoria `refine` quando o JSON os traz. A nota da RCSB sobre o relatório na Data API é `https://www.rcsb.org/news/feature/67edb6c196cbbd16fc52edb0`.
   Nesse caminho o painel por resíduo fica **pendente**. Ele não é simulado.

O gzip em `https://files.rcsb.org/pub/pdb/validation_reports/{mid}/{id}/{id}_validation.xml.gz` **não** envia CORS. O aplicativo não lê esse endereço por script e não usa proxy de terceiro. O PDF correspondente fica como link para a pessoa abrir.

Sem ID de depósito, nenhuma dessas consultas de relatório roda.

## O que pode aparecer

A classe efetiva sai do método no arquivo e, no XML, de `percentilebins` (`xray`, `nmr` ou `em`). Se um dos lados é NMR, crio-EM ou modelo, `Rwork`, `Rfree` e o ajuste cristalográfico não entram, mesmo que o texto exista.

Para raio X, quando o valor está presente e não é `NotAvailable`: resolução, `Rwork`, `Rfree`, clashscore, percentuais de Ramachandran e rotâmero outliers, RMSZ de ligação e ângulo, e o ajuste que o relatório trouxer (`EDS_R`, `DCC_R`, completude, RSRZ, correlação Fo–Fc, reflexões livres da reanálise). `NotAvailable` sai da tabela e é citado como ausente.

Para NMR entram geometria e os campos de ensemble que o relatório traz (medóide, NMRCLUST, CYRANGE). Para EM entram resolução da reconstrução, resolução EMDB, Q-score e inclusão no mapa, se existirem. Um zero só aparece se a fonte escreveu zero. Clashscore `0.00` em 1CRN é valor do relatório, não preenchimento.

O texto fixo da aba diz que o relatório e os indicadores globais não garantem a qualidade local do sítio.

## Qualidade local

Ela só é montada com o XML completo, dentro do limite de 2 MB. Cada `ModelledSubgroup` precisa de `chain` (`_atom_site.auth_asym_id`), `resnum` (`auth_seq_id`) e `model`, como o esquema descreve. `icode` vem de `pdbx_PDB_ins_code`, `altcode` de `label_alt_id`, `said` de `label_asym_id`.

O cruzamento usa o modelo selecionado pelo `peki-estrutura-1`. Subgrupo de outro modelo é contado e não vira nota deste modelo. Sem chain, resnum ou model, o subgrupo não é associado. Sem coordenada no modelo, não há qualidade local: lacuna não ganha nota. Resíduo com coordenada que não está no relatório também não ganha zero.

A cobertura da cadeia diz quantas posições com coordenada têm indicador e quantas lacunas ficaram de fora. A tabela começa pelos outliers e pelas falhas de mapeamento.

Resíduos próximos por distância não entram nesta versão.

## Componentes

A separação polímero, modificação de cadeia, água registrada, íon da lista parcial, terminal e outro HETATM continua sendo a leitura do arquivo. HETATM não fecha estado holo. Resíduo modificado na cadeia não é ligante livre. A contagem não duplica altLoc nem mistura outro modelo.

Para esses códigos, e não para cada um dos 20 aminoácidos padrão, a aba pede o Chemical Component Dictionary:

- `https://data.rcsb.org/rest/v1/core/chemcomp/{CCD}`
- se essa ficha não vem, `https://www.ebi.ac.uk/pdbe/api/pdb/compound/summary/{CCD}`

Entram nome, tipo químico, fórmula e massa quando a resposta os traz. O acesso ChEBI, se `rcsb_chem_comp_related` o devolver, vira só link (`https://www.ebi.ac.uk/chebi/searchId.do?chebiId=CHEBI:…`). O registro ChEBI não é baixado. Não há desenho 2D, nem papel de cofator, substrato, inibidor ou aditivo. Glicerol com nome `GLYCEROL` no dicionário não prova aditivo. A lista de íons do PEKI Fold continua hipótese de leitura.

A consulta de componentes também roda em upload, porque o código CCD não depende do ID do depósito. Falha de um código não zera os outros nem trava o viewer.

## Cache, erro e exportação

O cache da sessão guarda relatório e componente pela chave do ID ou do código. Resposta de `1CRN` não é servida para `1A00`. Erro, 404, 429, rede e cancelamento não entram no cache e não criam métrica. O pedido seguinte de outra estrutura ignora a resposta atrasada.

O export de PDF ou Markdown, quando a seção está marcada, grava o contrato `peki-qualidade-1`, a fonte e a URL que de fato responderam.

O drugScore dos pockets permanece descritor geométrico, não afinidade.
