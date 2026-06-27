# -*- coding: utf-8 -*-
# Programa 03 - Estatisticas Estruturais
#
# Para cada cadeia gerada na pasta "chainsproteins", calcula:
#   a) numero total de atomos
#   b) numero total de residuos
#   c) numero total de aminoacidos diferentes
# Ao final, identifica a cadeia com maior e a com menor numero de residuos.

import os

PASTA_CADEIAS = "chainsproteins"

# Lista dos 20 aminoacidos padrao (usada para contar aminoacidos diferentes)
AMINOACIDOS_PADRAO = [
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
    "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
]


def analisar_cadeia(caminho_arquivo):
    """Le um arquivo PDB de cadeia e retorna (n_atomos, n_residuos, n_aa_diferentes)."""
    n_atomos = 0
    residuos = set()          # identificadores unicos de residuo
    aminoacidos = set()       # nomes de aminoacidos distintos

    with open(caminho_arquivo, "r") as f:
        for linha in f:
            if linha.startswith("ATOM"):
                n_atomos += 1

                # Nome do residuo: colunas 18-20 (indice 17:20)
                nome_residuo = linha[17:20].strip()

                # Identificador do residuo: numero (cols 23-26) + codigo de
                # insercao (col 27). Juntos identificam um residuo unico.
                num_residuo = linha[22:27].strip()
                residuos.add(num_residuo)

                if nome_residuo in AMINOACIDOS_PADRAO:
                    aminoacidos.add(nome_residuo)

    return n_atomos, len(residuos), len(aminoacidos)


def main():
    if not os.path.isdir(PASTA_CADEIAS):
        print("Pasta '%s' nao encontrada. Execute antes o Programa 01 ou 02." % PASTA_CADEIAS)
        return

    arquivos = sorted(
        nome for nome in os.listdir(PASTA_CADEIAS) if nome.lower().endswith(".pdb")
    )

    # Cabecalho da tabela
    print("%-16s %-8s %-10s %-22s" % ("Arquivo", "Atomos", "Residuos", "Aminoacidos diferentes"))
    print("-" * 60)

    resultados = []  # guarda (nome, n_residuos) para achar maior/menor
    for nome in arquivos:
        caminho = os.path.join(PASTA_CADEIAS, nome)
        n_atomos, n_residuos, n_aa = analisar_cadeia(caminho)

        # Remove a extensao .pdb apenas para exibir mais limpo
        nome_exibicao = nome[:-4] if nome.lower().endswith(".pdb") else nome

        print("%-16s %-8d %-10d %-22d" % (nome_exibicao, n_atomos, n_residuos, n_aa))
        resultados.append((nome_exibicao, n_residuos))

    if not resultados:
        print("Nenhum arquivo de cadeia encontrado.")
        return

    # Identifica maior e menor numero de residuos
    maior = max(resultados, key=lambda item: item[1])
    menor = min(resultados, key=lambda item: item[1])

    print("-" * 60)
    print("Cadeia com MAIOR numero de residuos: %s (%d residuos)" % (maior[0], maior[1]))
    print("Cadeia com MENOR numero de residuos: %s (%d residuos)" % (menor[0], menor[1]))


if __name__ == "__main__":
    main()
