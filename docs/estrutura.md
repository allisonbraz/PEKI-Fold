# Leitura de estrutura — contrato `peki-estrutura-1`

Esta é a primeira fatia da evolução do PEKI Fold. O objetivo é ler o alvo sem misturar formatos e mostrar só o que o arquivo sustenta. Preparo, Pockets, exportação, Comparação e Ensemble continuam nas telas que já existiam.

O contrato público é o objeto `estrutura` devolvido por `StructureModel.ler` em `docs/structure-model.js`. A versão é `peki-estrutura-1`. Uma mudança de campos incompatível precisa de outro número.

## O que esta versão lê

- **PDB** pelas colunas fixas do wwPDB. Cadeia em branco vira `_`, como no restante do app. O resíduo clássico continua sendo o texto das colunas 23–27, para a estatística bater com `ProtAnalysis`.
- **mmCIF** pelas categorias. A coordenada sai de `_atom_site`. Não há leitura de mmCIF por coluna de PDB.
- **Um modelo.** No PDB, do primeiro `MODEL` até o `ENDMDL`. No mmCIF, o menor `pdbx_PDB_model_num`. Os outros modelos não entram na conta nem no viewer.
- **altLoc** não cria outra posição de resíduo. A estatística clássica de átomos ATOM continua contando as linhas, inclusive as alternativas, porque esse já era o comportamento dos programas 01–05.
- **Código de inserção** e, no mmCIF, cadeia e numeração *author* e *label* ficam separados. A interface e o 3Dmol usam a cadeia author quando ela existe, porque é o campo que o viewer 2.4.0 lê em `_atom_site.auth_asym_id`.
- **ID clássico** de 4 caracteres, começando por dígito. ID estendido não foi habilitado.

Pelo ID, a análise individual baixa o PDB. Se esse arquivo não tiver linha `ATOM`/`HETATM`, baixa o mmCIF. Comparação e Ensemble continuam pedindo o PDB por `baixarRCSB` e não recebem mmCIF.

## Lacunas

Um resíduo só entra como não resolvido quando uma fonte explícita o nomeia e o modelo selecionado não tem coordenadas naquele número:

| Fonte | Quando vale |
|---|---|
| `REMARK 465` com a seção `MISSING RESIDUES` | Lista exaustiva do depósito para o modelo coberto, inclusive a linha `MODELS` |
| `_pdbx_unobs_or_zero_occ_residues` | Flag 1: não observado. Flag 0: ocupação zero, fica fora da lista de ausentes |
| `_pdbx_poly_seq_scheme` | `pdb_mon_id` vazio: não observado. O número author é o do arquivo |
| `SEQRES` | Só se o alinhamento com as coordenadas é único. A posição citada é a da SEQRES. O número author não é calculado por deslocamento. Resíduo modificado cujo nome não está na SEQRES torna o alinhamento inutilizável |

Se nenhuma dessas fontes cobre a cadeia, o estado é **não determinado**. Um salto de numeração sem essa fonte não vira resíduo ausente e não aparece como zero. Se a fonte é exaustiva e não cita aqueles inteiros, o salto fica marcado como salto de numeração.

A distância só é calculada para resíduo ausente que já tem número author depositado e dois flanqueadores com coordenadas. É a distância entre um átomo de cada flanco (de preferência CA sem altLoc). O rótulo diz que isso não é distância do resíduo ausente. Nenhuma coordenada é reconstruída. Ausência de `REMARK 465`, de SEQRES e das categorias mmCIF não é lida como zero lacunas.

Um loop `_atom_site` com `group_PDB` inválido, coordenada não numérica ou linha incompleta rejeita o arquivo. `.` e `?` continuam nulos. altLoc não duplica componente nem resíduo. Água conta só os códigos HOH, WAT, H2O e DOD presentes no modelo selecionado; zero registros não significa amostra sem água.

`DBREF` e `_struct_ref_seq` são guardados como intervalo declarado. `uniprot.correspondenciaResiduo` fica `nao_estabelecida`. Resíduo fora do constructo fica `nao_avaliado`: a sequência completa do UniProt não é consultada e o intervalo não é expandido.

## O que segue para o resto do app

| Recurso | PDB | mmCIF |
|---|---|---|
| Visão geral, cadeias, estatística, aminoácidos, motivos, FASTA | sim | sim, a partir do modelo |
| Viewer | texto PDB do modelo | mmCIF gerado só com o modelo selecionado |
| Ficha de preparo | sim | bloqueada; o CIF não é entregue ao leitor de colunas |
| Download da cadeia em PDB | sim | bloqueado |
| DoGSite | só por ID clássico, como antes | o mesmo; o texto CIF não é enviado |
| Comparação e Ensemble | PDB por ID | não recebem o mmCIF |

O drugScore continua descrito como descritor geométrico, não como afinidade.

## Casos conferidos

Os números abaixo são a saída de `StructureModel.ler` nestes arquivos, não uma estimativa.

**1A00** — `pdbproteins/pdb1a00.pdb`, entrada RCSB 1A00, um modelo, raio X, resolução 2,00 Å no `REMARK 2`. Cadeias A/C com 141 posições e B/D com 146. Nenhum resíduo não resolvido: a `SEQRES` alinha e não há `REMARK 465` de resíduo. Isso não avalia trecho fora do constructo. Há 216 águas e 4 `HEM`. Os `DBREF` citam UniProt P69905 (cadeias A e C, 1–141) e P68871 (B e D, 2–146). Não há mapa resíduo a resíduo. O intervalo da cadeia B não começa em 1; os resíduos anteriores do banco não foram listados.

**1A1C** — `pdbproteins/pdb1a1c.pdb`. Cinco resíduos não resolvidos, com origem `remark465` e `seqres`: MET A 143, ASP A 144, MET B 143, ASP B 144, SER B 145. As coordenadas da cadeia A começam em 145 e as da B em 146, então esses cinco ficam antes do primeiro resíduo com coordenada e não ganham distância de flanqueadores. Os `DBREF` de A e B citam UniProt P12931; os de C e D citam o próprio PDB `1A1C`, não um acesso UniProt.

**1CRN** — `tests/fixtures/estrutura/1CRN.cif`, cópia de `https://files.rcsb.org/download/1CRN.cif`. mmCIF, resolução 1,5 Å em `_refine.ls_d_res_high`, método `X-RAY DIFFRACTION`, 46 posições na cadeia A, nenhum resíduo não resolvido segundo `_pdbx_poly_seq_scheme`. `_struct_ref_seq` cita UniProt P01542 no intervalo 1–46, sem correspondência resíduo a resíduo. O `_atom_site` dessa cópia não tem `HOH`; a visão geral conta zero águas registradas no modelo. O título fala em estrutura de água, e essa frase não foi usada para inventar água. A ficha de preparo fica bloqueada para esse arquivo.

**1A0N** — `pdbproteins/pdb1a0n.pdb`, 25 modelos. A estatística usa só o modelo 1 e coincide com `ProtAnalysis`. GLY B 80 está no `REMARK 465` (`MODELS 1-25`) e não tem coordenada no modelo 1.

4EYL e 1GZM não foram usados como exemplo de lacuna.

## Checklist

Entregue nesta versão:

- Leitor PDB e mmCIF com diagnóstico quando o formato não é suportado (texto solto, mmCIF sem `_atom_site`, CIF 2).
- Modelo único, altLoc sem duplicar resíduo, inserção, cadeia author/label.
- Lacunas com origem, salto de numeração, estado não determinado e proxy de flanqueadores.
- Visão geral no fluxo principal, sem apagar as abas atuais.
- mmCIF fora do preparo, do download PDB e da comparação/ensemble.
- Testes em `tests/structure-model.test.js`, inclusive os arquivos reais acima.

Pendente, de propósito:

- Correspondência resíduo a resíduo PDB–UniProt e distinção do que ficou fora do constructo.
- Qualidade global e local saíram da leitura do arquivo. Com ID do PDB, a aba Qualidade usa o contrato `peki-qualidade-1` ([qualidade.md](qualidade.md)). `REMARK 470` continua de fora.
- Reconstrução de coordenadas e SWISS-MODEL.
- Conversão mmCIF→PDB correta para a ficha de preparo.
- Ensemble com alinhamento estrutural.
- ID estendido do PDB, mmCIF 2 e formatos binários.
- Troca do viewer. O 3Dmol 2.4.0, no mmCIF em texto, não separa altLoc nem usa `pdbx_PDB_ins_code` na seleção; o aviso fica na visão geral quando isso ocorre.
