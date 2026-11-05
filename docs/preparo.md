# Ficha de preparo do PEKI Fold

A ficha é uma leitura geométrica do PDB que já está aberto no navegador. Ela lista o que precisa ser decidido antes de qualquer rotina externa e deixa um campo em branco para a decisão do pesquisador. Não escolhe por ele.

Versão do módulo: `preparo-1`, em `docs/prep-analysis.js` e `docs/prep-ui.js`.

## O que ela faz

- Inventário do primeiro MODEL: cadeias, ATOM, HETATM, águas, altloc, ANISOU, código de inserção, lacunas de numeração e REMARK 465.
- Classificação grosseira dos HET (água, metal, íon não metálico, açúcar, aditivo frequente, ou não classificado). A lista de códigos foi conferida no Chemical Component Dictionary; o que não está nela fica como não classificado.
- PDB filtrado, um arquivo por íon metálico e um arquivo por cópia de HET marcada. Sem hidrogênio novo e sem ANISOU.
- Vizinhos N, O e S de cada metal até 2,8 Å, comparados aos registros LINK. O elemento sai das colunas 77–78, para não tratar carbono alfa como cálcio.
- Pares SG–SG de CYS/CYX até 2,5 Å, comparados ao SSBOND.
- Pares ND2 de ASN com C1 de açúcar até 1,8 Å, comparados ao LINK, com uma numeração sequencial só sugerida.
- Rascunho de linhas `bond` no formato genérico do tleap.
- Candidatos geométricos de histidina (HID/HIE) quando um metal está perto de ND1 ou NE2. O rótulo da seção é "indício geométrico, não protonação".
- Caixa editável no formato de configuração do Vina, a partir do centroide de um pocket já detectado pelo DoGSite, com margem. O desenho usa o `addBox` do 3Dmol.js.

Os raios são editáveis. A ficha sai em Markdown, CSV e PDF, e também entra no botão Exportar do workspace.

## O que ela não faz

- Não faz docking, dinâmica molecular, minimização nem cálculo quântico.
- Não protona e não adiciona hidrogênio. A protonação continua fora daqui.
- Não decide carga de íon ou de ligante, nem qual átomo realmente coordena.
- Não entrega arquivo pronto para rodar. O `bond` é rascunho: a cadeia não entra no nome do átomo e a numeração pode mudar depois.
- Não trata contato como energia, nem drugScore ou escore de docking como afinidade.
- Não usa o número de série do PDB original como identificador depois que outro programa renumerar o arquivo.
- Não constrói contato de simetria cristalográfica (operador diferente de 1555) nem a montagem biológica.
- Não lê mmCIF. Um arquivo mmCIF aberto na visão geral não é passado para esta ficha: o preparo continua nas colunas PDB, para não tratar o CIF como se fosse PDB. Não adiciona glicano que o arquivo não tenha.
- Não grava o nome interno de arquivo de pocket usado em rotina de laboratório. Os resíduos do pocket, se baixados, saem como `pocket_residuos.pdb`.

Estrutura predita (AlphaFold e equivalentes, pelo título, pelo método ou por pLDDT): a ficha avisa que o pLDDT é confiança por resíduo e não diz se o pocket está apo ou holo.

## Como desligar

No arquivo `docs/prep-ui.js`, troque `const ATIVO = true` por `const ATIVO = false` e recarregue a página. A aba Preparo some. Detecção DoGSite, viewer e as outras abas não mudam.

Para retirar o módulo do código: apague `docs/prep-analysis.js`, `docs/prep-ui.js` e `docs/preparo.md`, e remova em `docs/index.html` as duas tags de script e o botão/aba Preparo. Os ganchos em `docs/app.js` testam se `PrepUI` existe; sem o script, o restante segue funcionando.

## Como conferir no computador

```bash
cd docs
python -m http.server 8080
```

Abra `http://localhost:8080`. As funções puras também rodam sem navegador:

```bash
node tests/prep-analysis.test.js
```

O teste baixa 4EYL, 1GZM, 1HSG e 5ORG do RCSB na primeira execução (a pasta `tests/fixtures/` não entra no Git). Ele compara a geometria com LINK e SSBOND do próprio arquivo. Isso não é validação química.

## Limitações que já aparecem nesses quatro arquivos

- 4EYL: os 18 LINK de Zn com simetria 1555 caem dentro de 2,8 Å. Há mais dois oxigênios do ligante 0RV, a 2,73 Å e 2,80 Å, que o LINK não anota. A ocupação dos Zn não é 1.
- 1GZM: os dois SSBOND e as quatro ligações ASN–NAG do arquivo são encontradas (distâncias 1,45 Å ou 1,46 Å, como no próprio LINK). Os dois Zn têm um único vizinho N/O/S no raio (ND2 de Asn 151); só o da cadeia B está no LINK. His 152 tem ND1 a 3,16 Å do Zn: entra na seção de histidinas e fica de fora da seção de íons. O REMARK 465 cita resíduos depois do último resíduo numerado; isso não aparece como lacuna interna.
- 1HSG: nenhum metal, dissulfeto ou Asn–açúcar. O heteroátomo MK1 fica como não classificado.
- 5ORG: nove sódios. Nove dos dezessete LINK de metal com simetria 1555 estão dentro de 2,8 Å; os outros oito têm distância anotada entre 2,81 Å e 3,10 Å. Um LINK usa operador de simetria diferente de 1555. Há ANISOU e altloc na cadeia B.

Selênio não é tratado como metal, para não marcar selenometionina. Açúcar fora da lista parcial só entra se o HETNAM parecer açúcar ou se um C1 de HETATM estiver perto do ND2. A caixa do Vina depende do DoGSite e, portanto, de um ID do PDB e da rede.

## Citações

Os DOI usados no README foram conferidos no Crossref. O Vina é citado só porque a caixa editável usa o formato público de configuração; o PEKI Fold não executa docking.
