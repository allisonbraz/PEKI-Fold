# -*- coding: utf-8 -*-
# Programa 02 - Modularizacao
#
# Reescreve o Programa 01 utilizando o modulo "separador".
# O programa principal apenas: localiza os arquivos, chama a funcao do
# modulo e exibe os resultados. O resultado e identico ao do Programa 01.

import os

from separador import separar_cadeias

PASTA_ENTRADA = "pdbproteins"
PASTA_SAIDA = "chainsproteins"


def listar_arquivos_pdb(pasta):
    """Retorna a lista de arquivos .pdb encontrados na pasta indicada."""
    arquivos = []
    for nome in sorted(os.listdir(pasta)):
        if nome.lower().endswith(".pdb"):
            arquivos.append(nome)
    return arquivos


def main():
    if not os.path.isdir(PASTA_ENTRADA):
        print("Pasta '%s' nao encontrada." % PASTA_ENTRADA)
        return

    # 1) Localizar os arquivos
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

    # 2) Chamar a funcao do modulo e 3) exibir os resultados
    print()
    print("=" * 60)
    print("RELATORIO DE SEPARACAO DE CADEIAS")
    print("=" * 60)
    for nome in arquivos:
        caminho = os.path.join(PASTA_ENTRADA, nome)
        cadeias, arquivos_gerados = separar_cadeias(caminho, PASTA_SAIDA)
        print("Proteina: %s" % nome)
        print("Cadeias encontradas: %d" % len(cadeias))
        print("Arquivos gerados: %s" % "; ".join(arquivos_gerados))
        print("-" * 60)


if __name__ == "__main__":
    main()
