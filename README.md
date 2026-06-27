# ProtAnalyzer

Ferramentas de **análise estrutural de proteínas** (formato PDB) desenvolvidas
como Trabalho Final da disciplina de Algoritmos (Doutorado — UFJ), com uma
**aplicação web** que torna as análises visuais e acessíveis pelo navegador.

🔬 **App online:** publicado via GitHub Pages a partir da pasta [`docs/`](docs/).

## Funcionalidades

| # | Análise | CLI (Python) | Web |
|---|---|---|---|
| 01/02 | Separação de cadeias | `programa01.py` / `programa02.py` + `separador.py` | ✅ |
| 03 | Estatísticas estruturais (átomos, resíduos, aminoácidos) | `programa03.py` | ✅ |
| 04 | Frequência de aminoácidos + gráficos | `programa04.py` | ✅ |
| 05 | Busca de motivos estruturais | `programa05.py` | ✅ |
| 06 | Detecção de pockets (DoGSite3) | `programa06.py` | ⏳ futuro |

## Estrutura do repositório

```
.
├── docs/             # App web estático (GitHub Pages) — análise no navegador
├── webapp/           # Backend FastAPI opcional (mesmas análises via API)
├── pdbproteins/      # Estruturas PDB de entrada (exemplos)
├── programa01..06.py # Programas da atividade (CLI)
├── separador.py      # Módulo de separação de cadeias
├── gerar_relatorio.py# Gera o Relatorio_Final.pdf
├── Relatorio_Final.pdf
└── PRD.md            # Documento de requisitos do produto (roadmap)
```

> As pastas `chainsproteins/`, `graphs/` e `resultados_dogsite/` são **geradas**
> ao executar os programas e por isso não são versionadas.

## App web (recomendado)

Aplicação **100% no navegador** — sem servidor, sem instalação, sem limite de
upload. Cole um ID do PDB (ex.: `1A00`) ou envie um `.pdb`, veja a estrutura em
3D e explore cadeias, estatísticas, frequência de aminoácidos e motivos.

Testar localmente:
```bash
cd docs
python -m http.server 8080   # abre http://localhost:8080
```

Detalhes e instruções de publicação: [`docs/README.md`](docs/README.md).

## Programas em Python (CLI)

Requer Python 3 (e `pandas`, `matplotlib`, `reportlab` para os programas 03–06 e
o relatório). Execução típica:
```bash
python programa01.py          # separa as cadeias em chainsproteins/
python programa03.py          # estatísticas
python programa04.py          # frequência + gráficos em graphs/
python programa05.py GLY-LYS-SER
python gerar_relatorio.py     # gera Relatorio_Final.pdf
```

## Tecnologias

- **Web:** HTML/CSS/JS estático, [3Dmol.js](https://3dmol.csb.pitt.edu/) (viewer 3D)
  e [Plotly](https://plotly.com/javascript/) (gráficos), via CDN.
- **Backend opcional:** FastAPI.
- **CLI:** Python (pandas, matplotlib, reportlab).
- **Dados:** estruturas do [RCSB PDB](https://www.rcsb.org/).

## Licença / créditos

Projeto acadêmico. Detecção de pockets baseada no DoGSite3 (ZBH, Universidade de
Hamburgo) — ver `PRD.md` para o plano de integração.
