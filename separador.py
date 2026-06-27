# -*- coding: utf-8 -*-
# Modulo separador
#
# Reune a logica de separacao das cadeias de proteinas em formato PDB.
# Pode ser importado por outros programas com:
#     from separador import separar_cadeias

import os


def identificar_cadeias(linhas):
    """Agrupa as linhas de coordenada do PDB por cadeia.

    O identificador da cadeia esta na coluna 22 (indice 21) do formato PDB.
    Considera os registros ATOM, HETATM, TER e ANISOU.
    Retorna {identificador_da_cadeia: [linhas]}.
    """
    cadeias = {}
    for linha in linhas:
        registro = linha[0:6].strip()
        if registro in ("ATOM", "HETATM", "TER", "ANISOU"):
            if len(linha) >= 22:
                id_cadeia = linha[21]
                if id_cadeia == " ":
                    id_cadeia = "_"
                if id_cadeia not in cadeias:
                    cadeias[id_cadeia] = []
                cadeias[id_cadeia].append(linha)
    return cadeias


def separar_cadeias(caminho_arquivo, pasta_saida):
    """Separa as cadeias de um arquivo PDB e grava um arquivo por cadeia.

    Parametros:
        caminho_arquivo : caminho do arquivo PDB de entrada.
        pasta_saida     : pasta onde os arquivos de cadeia serao gravados.

    Retorna (lista_de_cadeias, lista_de_arquivos_gerados).
    """
    nome_arquivo = os.path.basename(caminho_arquivo)

    with open(caminho_arquivo, "r") as f:
        linhas = f.readlines()

    cadeias = identificar_cadeias(linhas)

    os.makedirs(pasta_saida, exist_ok=True)

    arquivos_gerados = []
    for id_cadeia in sorted(cadeias):
        nome_saida = id_cadeia + "_" + nome_arquivo
        caminho_saida = os.path.join(pasta_saida, nome_saida)
        with open(caminho_saida, "w") as f:
            for linha in cadeias[id_cadeia]:
                f.write(linha)
            f.write("END\n")
        arquivos_gerados.append(nome_saida)

    return sorted(cadeias), arquivos_gerados
