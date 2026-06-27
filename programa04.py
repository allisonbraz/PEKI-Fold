# -*- coding: utf-8 -*-
# Programa 04 - Frequencia de Aminoacidos
#
# Para cada cadeia gerada em "chainsproteins":
#   1) conta a frequencia de ocorrencia dos 20 aminoacidos
#   2) calcula a porcentagem de cada aminoacido
#   3) constroi um grafico de barras (salvo na pasta "graphs")

import os

import matplotlib
matplotlib.use("Agg")  # backend que nao precisa de tela (salva direto em arquivo)
import matplotlib.pyplot as plt

PASTA_CADEIAS = "chainsproteins"
PASTA_GRAFICOS = "graphs"

AMINOACIDOS_PADRAO = [
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
    "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
]


def contar_aminoacidos(caminho_arquivo):
    """Conta quantos residuos de cada aminoacido existem em uma cadeia.

    Cada residuo e contado uma unica vez (identificado por nome + numero).
    Retorna um dicionario {aminoacido: contagem} com os 20 aminoacidos.
    """
    # Inicia todas as contagens em zero
    contagem = {aa: 0 for aa in AMINOACIDOS_PADRAO}

    residuos_vistos = set()
    with open(caminho_arquivo, "r") as f:
        for linha in f:
            if linha.startswith("ATOM"):
                nome_residuo = linha[17:20].strip()
                num_residuo = linha[22:27].strip()

                chave = nome_residuo + "_" + num_residuo
                if chave not in residuos_vistos:
                    residuos_vistos.add(chave)
                    if nome_residuo in contagem:
                        contagem[nome_residuo] += 1

    return contagem


def calcular_porcentagens(contagem):
    """Recebe {aminoacido: contagem} e retorna {aminoacido: porcentagem}."""
    total = sum(contagem.values())
    porcentagens = {}
    for aa in AMINOACIDOS_PADRAO:
        if total > 0:
            porcentagens[aa] = 100.0 * contagem[aa] / total
        else:
            porcentagens[aa] = 0.0
    return porcentagens


def gerar_grafico(nome_cadeia, porcentagens):
    """Cria e salva um grafico de barras das porcentagens de aminoacidos."""
    aminoacidos = AMINOACIDOS_PADRAO
    valores = [porcentagens[aa] for aa in aminoacidos]

    plt.figure(figsize=(10, 5))
    plt.bar(aminoacidos, valores, color="steelblue")
    plt.title("Frequencia de Aminoacidos - %s" % nome_cadeia)
    plt.xlabel("Aminoacido")
    plt.ylabel("Porcentagem (%)")
    plt.xticks(rotation=45)
    plt.tight_layout()

    caminho_saida = os.path.join(PASTA_GRAFICOS, "%s.png" % nome_cadeia)
    plt.savefig(caminho_saida)
    plt.close()
    return caminho_saida


def main():
    if not os.path.isdir(PASTA_CADEIAS):
        print("Pasta '%s' nao encontrada. Execute antes o Programa 01 ou 02." % PASTA_CADEIAS)
        return

    os.makedirs(PASTA_GRAFICOS, exist_ok=True)

    arquivos = sorted(
        nome for nome in os.listdir(PASTA_CADEIAS) if nome.lower().endswith(".pdb")
    )

    for nome in arquivos:
        caminho = os.path.join(PASTA_CADEIAS, nome)
        nome_cadeia = nome[:-4] if nome.lower().endswith(".pdb") else nome

        contagem = contar_aminoacidos(caminho)
        porcentagens = calcular_porcentagens(contagem)

        # Exibe na tela os aminoacidos presentes (porcentagem > 0)
        print("Cadeia: %s" % nome_cadeia)
        partes = []
        for aa in AMINOACIDOS_PADRAO:
            if contagem[aa] > 0:
                partes.append("%s = %.1f%%" % (aa, porcentagens[aa]))
        print("  " + "; ".join(partes))

        caminho_grafico = gerar_grafico(nome_cadeia, porcentagens)
        print("  Grafico salvo em: %s" % caminho_grafico)
        print("-" * 60)


if __name__ == "__main__":
    main()
