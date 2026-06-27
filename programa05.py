# -*- coding: utf-8 -*-
# Programa 05 - Busca de Motivos Estruturais
#
# Procura um padrao (motivo) de aminoacidos informado pelo usuario, por
# exemplo GLY-LYS-SER, e informa em quais proteinas e cadeias o padrao
# aparece, alem da posicao (numero do residuo inicial) de cada ocorrencia.
#
# Uso:
#   python programa05.py GLY-LYS-SER
#   ou execute sem argumento e digite o motivo quando solicitado.

import os
import sys

PASTA_CADEIAS = "chainsproteins"


def ler_sequencia_cadeia(caminho_arquivo):
    """Le um arquivo PDB de cadeia e retorna a sequencia de residuos na ordem.

    Retorna uma lista de tuplas (nome_residuo, numero_residuo), considerando
    cada residuo uma unica vez (na primeira vez em que aparece).
    """
    sequencia = []
    residuos_vistos = set()

    with open(caminho_arquivo, "r") as f:
        for linha in f:
            if linha.startswith("ATOM"):
                nome_residuo = linha[17:20].strip()
                num_residuo = linha[22:27].strip()

                chave = nome_residuo + "_" + num_residuo
                if chave not in residuos_vistos:
                    residuos_vistos.add(chave)
                    sequencia.append((nome_residuo, num_residuo))

    return sequencia


def buscar_motivo(sequencia, motivo):
    """Procura o motivo (lista de aminoacidos) na sequencia de residuos.

    Retorna a lista das posicoes (numero do residuo inicial) de cada ocorrencia.
    """
    ocorrencias = []
    nomes = [residuo[0] for residuo in sequencia]

    n = len(motivo)
    for i in range(len(nomes) - n + 1):
        if nomes[i:i + n] == motivo:
            # numero do residuo onde a ocorrencia comeca
            posicao = sequencia[i][1]
            ocorrencias.append(posicao)

    return ocorrencias


def identificar_proteina_cadeia(nome_arquivo):
    """A partir de 'B_pdb1a00.pdb' retorna ('pdb1a00', 'B')."""
    nome = nome_arquivo[:-4] if nome_arquivo.lower().endswith(".pdb") else nome_arquivo
    if "_" in nome:
        cadeia, proteina = nome.split("_", 1)
    else:
        cadeia, proteina = "?", nome
    return proteina, cadeia


def main():
    if not os.path.isdir(PASTA_CADEIAS):
        print("Pasta '%s' nao encontrada. Execute antes o Programa 01 ou 02." % PASTA_CADEIAS)
        return

    # Le o motivo da linha de comando ou pergunta ao usuario
    if len(sys.argv) > 1:
        entrada = sys.argv[1]
    else:
        entrada = input("Digite o motivo (ex: GLY-LYS-SER): ")

    motivo = [aa.strip().upper() for aa in entrada.split("-") if aa.strip()]
    if not motivo:
        print("Motivo invalido.")
        return

    print("Procurando o motivo: %s" % "-".join(motivo))
    print("=" * 60)

    arquivos = sorted(
        nome for nome in os.listdir(PASTA_CADEIAS) if nome.lower().endswith(".pdb")
    )

    total_ocorrencias = 0
    for nome in arquivos:
        caminho = os.path.join(PASTA_CADEIAS, nome)
        sequencia = ler_sequencia_cadeia(caminho)
        ocorrencias = buscar_motivo(sequencia, motivo)

        if ocorrencias:
            proteina, cadeia = identificar_proteina_cadeia(nome)
            for posicao in ocorrencias:
                print("Proteina: %s" % proteina)
                print("Cadeia: %s" % cadeia)
                print("Posicao: %s" % posicao)
                print("-" * 60)
                total_ocorrencias += 1

    if total_ocorrencias == 0:
        print("O motivo %s nao foi encontrado em nenhuma cadeia." % "-".join(motivo))
    else:
        print("Total de ocorrencias encontradas: %d" % total_ocorrencias)


if __name__ == "__main__":
    main()
