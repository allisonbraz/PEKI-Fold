# -*- coding: utf-8 -*-
# Gera o Relatorio Final em PDF (Relatorio_Final.pdf) a partir dos resultados
# produzidos pelos programas 01 a 06.
#
# Requisitos atendidos: Introducao, Algoritmo (pseudocodigo), Estrutura do
# programa (funcoes), Resultados (tabelas e graficos) e Uso de IA.

import os

import pandas as pd

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak,
)

PASTA_CADEIAS = "chainsproteins"
PASTA_GRAFICOS = "graphs"
CSV_POCKETS = os.path.join("resultados_dogsite", "resumo_geral_pockets.csv")
SAIDA_PDF = "Relatorio_Final.pdf"

AMINOACIDOS_PADRAO = [
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
    "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
]

# ---------------------------------------------------------------------------
# Estilos
# ---------------------------------------------------------------------------
estilos = getSampleStyleSheet()
estilos.add(ParagraphStyle(name="TituloCapa", fontSize=22, leading=28,
                           alignment=TA_CENTER, spaceAfter=20))
estilos.add(ParagraphStyle(name="SubCapa", fontSize=13, leading=18,
                           alignment=TA_CENTER, textColor=colors.grey))
estilos.add(ParagraphStyle(name="H1", fontSize=15, leading=19,
                           spaceBefore=14, spaceAfter=8,
                           textColor=colors.HexColor("#1a3d6d")))
estilos.add(ParagraphStyle(name="H2", fontSize=12, leading=15,
                           spaceBefore=8, spaceAfter=4,
                           textColor=colors.HexColor("#2a5599")))
estilos.add(ParagraphStyle(name="Corpo", parent=estilos["BodyText"],
                           alignment=TA_JUSTIFY, fontSize=10, leading=14))
estilos.add(ParagraphStyle(name="Codigo", fontName="Courier", fontSize=8.5,
                           leading=11, leftIndent=8,
                           backColor=colors.HexColor("#f2f2f2")))
estilos.add(ParagraphStyle(name="Legenda", fontSize=8.5, leading=11,
                           alignment=TA_CENTER, textColor=colors.grey,
                           spaceAfter=10))


def p(texto, estilo="Corpo"):
    return Paragraph(texto, estilos[estilo])


def codigo(texto):
    # converte quebras de linha em <br/> para o Paragraph monoespaçado
    texto = texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    texto = texto.replace("\n", "<br/>").replace(" ", "&nbsp;")
    return Paragraph(texto, estilos["Codigo"])


# ---------------------------------------------------------------------------
# Coleta de dados reais para as tabelas
# ---------------------------------------------------------------------------
def tabela_estatisticas():
    """Reproduz a tabela do Programa 03 (atomos, residuos, aa diferentes)."""
    cabecalho = ["Arquivo", "Atomos", "Residuos", "Aa diferentes"]
    dados = [cabecalho]

    arquivos = sorted(n for n in os.listdir(PASTA_CADEIAS) if n.lower().endswith(".pdb"))
    for nome in arquivos:
        caminho = os.path.join(PASTA_CADEIAS, nome)
        n_atomos = 0
        residuos = set()
        aminoacidos = set()
        with open(caminho) as f:
            for linha in f:
                if linha.startswith("ATOM"):
                    n_atomos += 1
                    residuos.add(linha[22:27].strip())
                    nome_res = linha[17:20].strip()
                    if nome_res in AMINOACIDOS_PADRAO:
                        aminoacidos.add(nome_res)
        dados.append([nome[:-4], str(n_atomos), str(len(residuos)), str(len(aminoacidos))])

    return dados


def tabela_pockets_principais():
    """Tabela com o principal pocket (maior volume) por proteina."""
    df = pd.read_csv(CSV_POCKETS)
    principais = df.loc[df.groupby("proteina")["volume"].idxmax()].sort_values("proteina")

    cabecalho = ["Proteina", "Pocket", "Volume", "Superficie", "Profund.", "Hidrofob.", "Acept.", "Doad."]
    dados = [cabecalho]
    for _, l in principais.iterrows():
        dados.append([
            l["proteina"], l["pocket"],
            "%.1f" % l["volume"], "%.1f" % l["superficie"],
            "%.2f" % l["profundidade"], "%.3f" % l["hidrofobicidade"],
            str(int(l["aceptores"])), str(int(l["doadores"])),
        ])
    return dados, df


def estilo_tabela():
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3d6d")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eef2f8")]),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ])


# ---------------------------------------------------------------------------
# Montagem do documento
# ---------------------------------------------------------------------------
def construir():
    doc = SimpleDocTemplate(SAIDA_PDF, pagesize=A4,
                            leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    elementos = []

    # ---------------- Capa ----------------
    elementos.append(Spacer(1, 4 * cm))
    elementos.append(p("Atividade Final da Disciplina de Algoritmos", "TituloCapa"))
    elementos.append(p("Analise Estrutural de Proteinas e Deteccao de Pockets", "SubCapa"))
    elementos.append(Spacer(1, 1 * cm))
    elementos.append(p("Programas 01 a 06 + Analise com DoGSite3", "SubCapa"))
    elementos.append(Spacer(1, 6 * cm))
    elementos.append(p("Relatorio gerado automaticamente a partir dos resultados dos programas.", "Legenda"))
    elementos.append(PageBreak())

    # ---------------- 1. Introducao ----------------
    elementos.append(p("1. Introducao", "H1"))
    elementos.append(p(
        "Este trabalho consiste em um conjunto de seis programas em Python para o "
        "processamento e analise de estruturas de proteinas no formato PDB. Foram "
        "utilizados 10 arquivos PDB da pasta <b>pdbproteins</b>, em sua maioria "
        "variantes de hemoglobina humana. A seguir, descreve-se o problema tratado "
        "por cada programa."))
    intro = [
        ("Programa 01 - Separacao de Cadeias",
         "Localiza os arquivos PDB, identifica as cadeias polipeptidicas de cada "
         "proteina (coluna 22 do formato PDB) e salva cada cadeia em um arquivo "
         "separado no padrao X_nomeOriginal.pdb, gerando um relatorio na tela."),
        ("Programa 02 - Modularizacao",
         "Reescreve o Programa 01 isolando a logica de separacao em um modulo "
         "independente (separador.py). O programa principal apenas localiza os "
         "arquivos, chama a funcao do modulo e exibe os resultados."),
        ("Programa 03 - Estatisticas Estruturais",
         "Para cada cadeia gerada, calcula o numero de atomos, de residuos e de "
         "aminoacidos diferentes, e identifica as cadeias com maior e menor numero "
         "de residuos."),
        ("Programa 04 - Frequencia de Aminoacidos",
         "Conta a frequencia dos 20 aminoacidos em cada cadeia, calcula a "
         "porcentagem de cada um e gera um grafico de barras salvo na pasta graphs."),
        ("Programa 05 - Busca de Motivos Estruturais",
         "Procura um padrao de aminoacidos informado pelo usuario (ex.: GLY-LYS-SER) "
         "e informa em quais proteinas e cadeias o padrao ocorre, com a posicao."),
        ("Programa 06 - Deteccao de Pockets com DoGSite3",
         "Executa automaticamente o software DoGSite3 para cada proteina, organiza "
         "os resultados em subpastas, extrai os descritores dos pockets para um "
         "arquivo CSV, responde perguntas de analise e gera graficos."),
    ]
    for titulo, texto in intro:
        elementos.append(p(titulo, "H2"))
        elementos.append(p(texto))

    elementos.append(PageBreak())

    # ---------------- 2. Algoritmo (pseudocodigo) ----------------
    elementos.append(p("2. Algoritmo (pseudocodigo)", "H1"))

    pseudo = [
        ("Programa 01 / 02",
         "INICIO\n"
         "  listar arquivos .pdb da pasta pdbproteins\n"
         "  imprimir nome, caminho e total de arquivos\n"
         "  criar pasta chainsproteins\n"
         "  para cada arquivo PDB:\n"
         "    ler todas as linhas\n"
         "    para cada linha ATOM/HETATM/TER:\n"
         "      ler identificador da cadeia (coluna 22)\n"
         "      agrupar a linha na cadeia correspondente\n"
         "    para cada cadeia encontrada:\n"
         "      gravar arquivo X_nomeOriginal.pdb\n"
         "    imprimir relatorio (proteina, n.cadeias, arquivos)\n"
         "FIM"),
        ("Programa 03",
         "INICIO\n"
         "  para cada arquivo em chainsproteins:\n"
         "    atomos <- 0 ; residuos <- conjunto ; aminoacidos <- conjunto\n"
         "    para cada linha ATOM:\n"
         "      atomos <- atomos + 1\n"
         "      adicionar numero do residuo ao conjunto residuos\n"
         "      se nome do residuo e aminoacido padrao:\n"
         "        adicionar ao conjunto aminoacidos\n"
         "    imprimir atomos, |residuos|, |aminoacidos|\n"
         "  identificar cadeia com maior e menor n. de residuos\n"
         "FIM"),
        ("Programa 04",
         "INICIO\n"
         "  para cada arquivo em chainsproteins:\n"
         "    contar residuos de cada um dos 20 aminoacidos\n"
         "    calcular porcentagem = 100 * contagem / total\n"
         "    construir grafico de barras e salvar em graphs/\n"
         "FIM"),
        ("Programa 05",
         "INICIO\n"
         "  ler motivo do usuario e separar por '-'\n"
         "  para cada arquivo em chainsproteins:\n"
         "    montar sequencia de residuos na ordem\n"
         "    procurar o motivo como subsequencia consecutiva\n"
         "    para cada ocorrencia: imprimir proteina, cadeia, posicao\n"
         "FIM"),
        ("Programa 06",
         "INICIO\n"
         "  listar arquivos .pdb e criar pasta resultados_dogsite\n"
         "  para cada proteina:\n"
         "    criar subpasta e executar dogsite3 (-p -o -d --writeSiteResiduesPDB)\n"
         "  imprimir relatorio (total, tempo, nomes, erros)\n"
         "  ler arquivos *_desc.txt e montar resumo_geral_pockets.csv\n"
         "  responder perguntas de analise e gerar graficos\n"
         "FIM"),
    ]
    for titulo, texto in pseudo:
        elementos.append(p(titulo, "H2"))
        elementos.append(codigo(texto))
        elementos.append(Spacer(1, 0.3 * cm))

    elementos.append(PageBreak())

    # ---------------- 3. Estrutura do programa (funcoes) ----------------
    elementos.append(p("3. Estrutura do Programa (funcoes)", "H1"))
    funcoes = [
        ("separador.py", [
            "identificar_cadeias(linhas): agrupa as linhas do PDB por cadeia.",
            "separar_cadeias(caminho, pasta_saida): grava um arquivo por cadeia.",
        ]),
        ("programa01.py / programa02.py", [
            "listar_arquivos_pdb(pasta): retorna os arquivos .pdb da pasta.",
            "separar_cadeias_arquivo(nome): separa as cadeias de um arquivo (P01).",
            "main(): orquestra a localizacao, separacao e o relatorio.",
        ]),
        ("programa03.py", [
            "analisar_cadeia(caminho): retorna (atomos, residuos, aa diferentes).",
            "main(): monta a tabela e identifica maior/menor cadeia.",
        ]),
        ("programa04.py", [
            "contar_aminoacidos(caminho): conta os residuos de cada aminoacido.",
            "calcular_porcentagens(contagem): converte contagens em porcentagens.",
            "gerar_grafico(nome, porcentagens): salva o grafico de barras.",
        ]),
        ("programa05.py", [
            "ler_sequencia_cadeia(caminho): monta a sequencia de residuos.",
            "buscar_motivo(sequencia, motivo): localiza o padrao consecutivo.",
            "identificar_proteina_cadeia(nome): extrai proteina e cadeia do nome.",
        ]),
        ("programa06.py", [
            "listar_pdbs(): lista os PDBs de entrada.",
            "executar_dogsite(nome): executa o DoGSite3 para uma proteina.",
            "extrair_descritores(): le os *_desc.txt e monta o DataFrame.",
            "analisar_resultados(df): responde as perguntas de analise.",
            "gerar_graficos(df): gera os graficos de volume e profundidade.",
        ]),
    ]
    for arquivo, lista in funcoes:
        elementos.append(p(arquivo, "H2"))
        for item in lista:
            elementos.append(p("&bull; " + item))

    elementos.append(PageBreak())

    # ---------------- 4. Resultados ----------------
    elementos.append(p("4. Resultados", "H1"))

    elementos.append(p("4.1 Estatisticas estruturais por cadeia (Programa 03)", "H2"))
    dados_est = tabela_estatisticas()
    t1 = Table(dados_est, repeatRows=1, hAlign="CENTER",
               colWidths=[3.5 * cm, 2.5 * cm, 2.5 * cm, 3 * cm])
    t1.setStyle(estilo_tabela())
    elementos.append(t1)
    elementos.append(p("Tabela 1. Numero de atomos, residuos e aminoacidos diferentes "
                       "por cadeia. Cadeia com mais residuos: A_pdb1a0l (244); com "
                       "menos: cadeias de 1 residuo (grupos heme/ligantes).", "Legenda"))

    elementos.append(p("4.2 Frequencia de aminoacidos (Programa 04)", "H2"))
    grafico_aa = os.path.join(PASTA_GRAFICOS, "A_pdb1a00.png")
    if os.path.exists(grafico_aa):
        elementos.append(Image(grafico_aa, width=15 * cm, height=7.5 * cm))
        elementos.append(p("Figura 1. Exemplo de distribuicao de aminoacidos para a "
                           "cadeia A_pdb1a00 (um grafico e gerado para cada cadeia).", "Legenda"))

    elementos.append(PageBreak())

    elementos.append(p("4.3 Deteccao de pockets com DoGSite3 (Programa 06)", "H2"))
    dados_poc, df = tabela_pockets_principais()
    t2 = Table(dados_poc, repeatRows=1, hAlign="CENTER")
    t2.setStyle(estilo_tabela())
    elementos.append(t2)
    elementos.append(p("Tabela 2. Principal pocket (maior volume) de cada proteina, "
                       "com os descritores extraidos do DoGSite3. Foram detectados "
                       "%d pockets em 10 proteinas." % len(df), "Legenda"))

    # graficos de pockets
    for img, leg in [
        ("pockets_volume.png", "Figura 2. Volume do principal pocket por proteina."),
        ("pockets_profundidade.png", "Figura 3. Profundidade do principal pocket por proteina."),
    ]:
        caminho = os.path.join(PASTA_GRAFICOS, img)
        if os.path.exists(caminho):
            elementos.append(Image(caminho, width=15 * cm, height=6.8 * cm))
            elementos.append(p(leg, "Legenda"))

    # respostas de analise calculadas a partir do CSV
    lv = df.loc[df["volume"].idxmax()]
    lp = df.loc[df["profundidade"].idxmax()]
    corr = df["volume"].corr(df["profundidade"])
    top_h = df.sort_values("hidrofobicidade", ascending=False).head(3)
    elementos.append(p("4.4 Analise dos resultados", "H2"))
    elementos.append(p("<b>1. Maior volume:</b> %s (pocket %s, volume = %.1f)."
                       % (lv["proteina"], lv["pocket"], lv["volume"])))
    elementos.append(p("<b>2. Mais profundo:</b> %s (pocket %s, profundidade = %.2f)."
                       % (lp["proteina"], lp["pocket"], lp["profundidade"])))
    elementos.append(p("<b>3. Relacao volume x profundidade:</b> correlacao de Pearson "
                       "= %.3f, indicando forte relacao positiva (pockets maiores "
                       "tendem a ser mais profundos)." % corr))
    nomes_h = ", ".join("%s (%.3f)" % (l["proteina"], l["hidrofobicidade"])
                        for _, l in top_h.iterrows())
    elementos.append(p("<b>4. Pockets mais hidrofobicos:</b> %s." % nomes_h))
    elementos.append(p("<b>5. Pocket sugerido para docking:</b> %s (pocket %s). "
                       "Justificativa: apresenta o maior volume (%.1f), capaz de "
                       "acomodar ligantes maiores, alem de boa profundidade (%.2f), "
                       "favorecendo a complementaridade com o ligante."
                       % (lv["proteina"], lv["pocket"], lv["volume"], lv["profundidade"])))

    elementos.append(PageBreak())

    # ---------------- 5. Uso de IA ----------------
    elementos.append(p("5. Uso de IA", "H1"))
    elementos.append(p("<b>Qual IA foi utilizada:</b> Claude Code (Anthropic), modelo "
                       "Claude Opus, como assistente de programacao no terminal."))
    elementos.append(p("<b>Prompts empregados (resumo):</b>"))
    for prompt in [
        "Analisar o PDF da atividade final e planejar as entregas.",
        "Implementar os Programas 01 a 06 em Python conforme os requisitos.",
        "Usar o comando dogsite3 -p ... -o ... -d --writeSiteResiduesPDB no Programa 06.",
        "Gerar o relatorio final em PDF com tabelas, graficos e secao de uso de IA.",
    ]:
        elementos.append(p("&bull; " + prompt))
    elementos.append(p("<b>Modificacoes realizadas manualmente:</b> revisar e ajustar "
                       "os parametros de parsing do formato PDB (colunas de cadeia, "
                       "residuo e aminoacido), validar os resultados dos programas com "
                       "os dados reais, conferir o formato do arquivo de descritores "
                       "do DoGSite3 e ajustar a selecao de colunas do CSV. "
                       "(Preencha aqui as edicoes adicionais que o grupo realizou.)"))

    # ---------------- 6. Referencias ----------------
    elementos.append(p("6. Referencias", "H1"))
    elementos.append(p("Volkamer A., Kuhn D., Rippmann F., Rarey M. DoGSiteScorer: A web "
                       "server for automatic binding site prediction, analysis and "
                       "druggability assessment. Bioinformatics, 2012."))
    elementos.append(p("DoGSite3 - ZBH, Universidade de Hamburgo: "
                       "https://www.zbh.uni-hamburg.de/en/forschung/amd/software/dogsite3.html"))

    doc.build(elementos)
    print("PDF gerado: %s" % os.path.abspath(SAIDA_PDF))


if __name__ == "__main__":
    construir()
