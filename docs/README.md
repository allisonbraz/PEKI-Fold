# PEKI Fold — App estático (GitHub Pages)

> **PEKI Fold** = *Protein Exploration Kit for Insights*

Aplicação web **100% estática** para análise estrutural de proteínas (formato PDB).
Toda a análise roda **no navegador** — não há servidor, banco de dados nem limite de
tamanho de arquivo. Versão visual dos Programas 01–05 do Trabalho Final de Algoritmos.

Cole um **ID do PDB** (ex.: `1A00`) ou faça **upload** de um `.pdb`, veja a estrutura
em **3D** e explore:

- **Cadeias** — detecção e download de cada cadeia (Programas 01/02)
- **Estatísticas** — átomos, resíduos e aminoácidos diferentes; maior/menor (Programa 03)
- **Aminoácidos** — frequência e porcentagem dos 20 aminoácidos, em gráfico (Programa 04)
- **Motivos** — busca de padrões (ex.: `GLY-LYS-SER`) com destaque na 3D (Programa 05)
- **Pockets** — detecção de cavidades com descritores (volume, superfície, profundidade,
  hidrofobicidade, aceptores, doadores, drugScore), respostas analíticas, gráficos e
  destaque dos resíduos na 3D (Programa 06, via API DoGSiteScorer/ProteinsPlus)
- **Comparação** — compare de 2 a 4 PDBs lado a lado: estatísticas, composição de
  aminoácidos (gráfico agrupado) e pockets cross-protein, respondendo às 5 perguntas
  do trabalho entre as proteínas (maior volume, mais profundo, relação volume×profundidade,
  mais hidrofóbicas, escolha para docking)

## Arquivos

```
web/
├── index.html        # interface
├── style.css         # visual (tema claro/escuro)
├── pdb-analysis.js   # lógica de análise (porta JS de pdb_analysis.py)
└── app.js            # interface + viewer 3D (3Dmol.js) + gráficos (Plotly)
```

As bibliotecas 3Dmol.js e Plotly são carregadas via CDN — não há build nem dependências.

## Testar localmente

Abra com um servidor simples (recomendado, evita restrições do `file://`):

```bash
cd web
python -m http.server 8080
```

Acesse: http://localhost:8080

## Publicar no GitHub Pages (grátis)

**Opção A — usar a pasta `/docs` do repositório (mais simples):**
1. Renomeie a pasta `web/` para `docs/` no repositório.
2. Faça commit e push para o branch `main`.
3. No GitHub: *Settings → Pages → Source = Deploy from a branch*; escolha
   `main` e a pasta `/docs`. Salve.
4. Em ~1 min o site fica em `https://<seu-usuario>.github.io/<repo>/`.

**Opção B — repositório dedicado só do site:**
1. Crie um repositório novo e coloque o **conteúdo** de `web/` na raiz dele.
2. *Settings → Pages → Source = main / (root)*.

## Notas técnicas

- A busca por ID baixa o PDB direto do **RCSB** (`files.rcsb.org`, com CORS).
  Precisa de internet; estruturas que não existem retornam erro amigável.
- O upload é lido com `FileReader` — o arquivo **não sai do computador** do usuário.
- Estruturas NMR multi-modelo (ex.: 1A0N) podem inflar a contagem de átomos.
- A detecção de pockets chama a API do **DoGSiteScorer** (`proteins.plus`) direto do
  navegador (CORS habilitado). Requer um **ID do PDB** (a API trabalha por ID, não por
  upload) e está sujeita ao *rate limit* do serviço. O cálculo roda no servidor da
  ProteinsPlus e leva alguns segundos.

## Backend opcional

A versão com backend FastAPI (mesmas análises via API) está em `../webapp/`, caso
no futuro seja necessário processamento no servidor (ex.: integração com DoGSite3).
