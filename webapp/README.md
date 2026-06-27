# PEKI Fold — MVP

> **PEKI Fold** = *Protein Exploration Kit for Insights*

Aplicação web para análise estrutural de proteínas (formato PDB). Versão visual
e online dos Programas 01–05 do Trabalho Final de Algoritmos.

Cole um **ID do PDB** (ex.: `1A00`) ou faça **upload** de um arquivo `.pdb`, veja
a estrutura em **3D** e explore:

- **Cadeias** — detecção e download individual de cada cadeia (Programas 01/02)
- **Estatísticas** — átomos, resíduos e aminoácidos diferentes por cadeia; maior/menor (Programa 03)
- **Aminoácidos** — frequência e porcentagem dos 20 aminoácidos, em gráfico interativo (Programa 04)
- **Motivos** — busca de padrões (ex.: `GLY-LYS-SER`) com destaque na estrutura 3D (Programa 05)

> Detecção de pockets (Programa 06 / DoGSite3) **não** está no MVP — será adicionada
> depois via API oficial ou alternativa própria (licença pendente).

## Tecnologia

- **Backend:** FastAPI (Python) — reaproveita a lógica de análise em `pdb_analysis.py`
- **Frontend:** HTML/CSS/JS estático com **3Dmol.js** (viewer 3D) e **Plotly** (gráficos), via CDN
- Sem etapa de build: um único processo Python serve a API e o site.

## Como rodar localmente

```bash
cd webapp
python -m pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

Abra: http://127.0.0.1:8000

## Estrutura

```
webapp/
├── app.py            # backend FastAPI (API + serve o frontend)
├── pdb_analysis.py   # lógica de análise (funções puras sobre texto PDB)
├── requirements.txt
├── README.md
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

## API (resumo)

| Método | Rota | Descrição |
|---|---|---|
| GET  | `/api/health` | Verifica se o servidor está no ar |
| GET  | `/api/pdb?id=1A00` | Texto PDB bruto do RCSB |
| POST | `/api/analyze` | Análise completa (form: `file` ou `pdb_id`) |
| POST | `/api/motif` | Busca de motivo (form: `motif` + `file`/`pdb_id`) |
| POST | `/api/chain` | PDB de uma cadeia (form: `chain` + `file`/`pdb_id`) |

## Deploy na Vercel (gratuito)

O projeto já vem pronto para a Vercel (`vercel.json` + `api/index.py`).
**Importante:** o diretório a publicar é `webapp/` (a raiz do projeto na Vercel).

Opção A — via CLI:
```bash
npm i -g vercel
cd webapp
vercel          # primeira vez (segue o assistente)
vercel --prod   # publica em produção
```

Opção B — via GitHub: suba a pasta `webapp/` num repositório e importe em
vercel.com. Em *Root Directory*, selecione `webapp`.

**Limitações da Vercel (serverless):**
- Corpo da requisição limitado a ~4,5 MB → **upload** de PDBs grandes falha.
  A **busca por ID** (RCSB) não tem esse limite (download é feito no servidor).
- Sem estado entre requisições (o app já é stateless, então tudo bem).
- `uvicorn` não é usado na Vercel (a plataforma fornece o servidor ASGI). Ele
  fica em `requirements.txt` apenas para execução local; pode ser removido se
  quiser builds mais enxutos na Vercel.

## Deploy (quando hospedar na universidade)

O app é um único processo ASGI. Para produção:

```bash
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --workers 2
```

Recomendações:
- Rodar atrás de um proxy reverso (nginx) com HTTPS.
- Definir limite de upload e rate-limit (público).
- Pode ser empacotado em Docker facilmente (base `python:3.12-slim`, copiar `webapp/`,
  `pip install -r requirements.txt`, `CMD uvicorn app:app --host 0.0.0.0 --port 8000`).

## Limitações conhecidas (MVP)

- Estruturas grandes (NMR multi-modelo, ex.: 1A0N) podem inflar contagens de átomos.
- Sem persistência: cada análise é uma sessão; nada é salvo no servidor.
- Pockets/DoGSite3 ainda não integrados.
