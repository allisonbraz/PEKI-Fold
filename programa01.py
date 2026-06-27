# -*- coding: utf-8 -*-
# Programa 01 - Separacao de Cadeias de Proteinas
#
# Localiza os arquivos PDB da pasta "pdbproteins", identifica as cadeias
# de cada proteina e salva cada cadeia em um novo arquivo dentro da pasta
# "chainsproteins", usando o formato A_nomeOriginal.pdb, B_nomeOriginal.pdb, ...

import os

# Pastas de entrada (PDBs originais) e de saida (cadeias separadas)
PASTA_ENTRADA = "pdbproteins"
PASTA_SAIDA = "chainsproteins"


def listar_arquivos_pdb(pasta):
    """Retorna a lista de arquivos .pdb encontrados na pasta indicada."""
    arquivos = []
    for nome in sorted(os.listdir(pasta)):
        if nome.lower().endswith(".pdb"):
            arquivos.append(nome)
    return arquivos


def identificar_cadeias(linhas):
    """Percorre as linhas do PDB e agrupa as linhas de coordenada por cadeia.

    No formato PDB, o identificador da cadeia fica na coluna 22 (indice 21).
    Sao consideradas as linhas ATOM, HETATM, TER e ANISOU.
    Retorna um dicionario: {identificador_da_cadeia: [linhas]}.
    """
    cadeias = {}
    for linha in linhas:
        registro = linha[0:6].strip()
        if registro in ("ATOM", "HETATM", "TER", "ANISOU"):
            # Garante que a linha tem tamanho suficiente para ler a coluna 22
            if len(linha) >= 22:
                id_cadeia = linha[21]
                if id_cadeia == " ":
                    id_cadeia = "_"  # cadeia sem identificador
                if id_cadeia not in cadeias:
                    cadeias[id_cadeia] = []
                cadeias[id_cadeia].append(linha)
    return cadeias


def separar_cadeias_arquivo(nome_arquivo):
    """Separa as cadeias de um unico arquivo PDB e grava os novos arquivos.

    Retorna uma tupla (lista_de_cadeias, lista_de_arquivos_gerados).
    """
    caminho = os.path.join(PASTA_ENTRADA, nome_arquivo)

    with open(caminho, "r") as f:
        linhas = f.readlines()

    cadeias = identificar_cadeias(linhas)

    arquivos_gerados = []
    for id_cadeia in sorted(cadeias):
        nome_saida = id_cadeia + "_" + nome_arquivo
        caminho_saida = os.path.join(PASTA_SAIDA, nome_saida)
        with open(caminho_saida, "w") as f:
            for linha in cadeias[id_cadeia]:
                f.write(linha)
            f.write("END\n")
        arquivos_gerados.append(nome_saida)

    return sorted(cadeias), arquivos_gerados


def main():
    # Requisito (a): localizar e imprimir os arquivos encontrados
    if not os.path.isdir(PASTA_ENTRADA):
        print("Pasta '%s' nao encontrada." % PASTA_ENTRADA)
        return

    arquivos = listar_arquivos_pdb(PASTA_ENTRADA)

    print("=" * 60)
    print("ARQUIVOS PDB ENCONTRADOS")
    print("=" * 60)
    for nome in arquivos:
        caminho_completo = os.path.abspath(os.path.join(PASTA_ENTRADA, nome))
        print("Nome do arquivo : %s" % nome)
        print("Caminho (path)  : %s" % caminho_completo)
        print("-" * 60)
    print("Numero total de arquivos encontrados: %d" % len(arquivos))

    # Requisito (b): criar a pasta de saida
    os.makedirs(PASTA_SAIDA, exist_ok=True)

    # Requisitos (c) e (d): separar cadeias e gerar relatorio
    print()
    print("=" * 60)
    print("RELATORIO DE SEPARACAO DE CADEIAS")
    print("=" * 60)
    for nome in arquivos:
        cadeias, arquivos_gerados = separar_cadeias_arquivo(nome)
        print("Proteina: %s" % nome)
        print("Cadeias encontradas: %d" % len(cadeias))
        print("Arquivos gerados: %s" % "; ".join(arquivos_gerados))
        print("-" * 60)


if __name__ == "__main__":
    main()
