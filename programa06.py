# -*- coding: utf-8 -*-
# Programa 06 - Analise automatica de pockets em proteinas com DoGSite3
#
# O programa:
#   a) localiza os arquivos .pdb da pasta pdbproteins;
#   b) cria a pasta resultados_dogsite (se nao existir);
#   c) executa o DoGSite3 para cada proteina, em uma subpasta propria;
#   d) ao final informa: total de proteinas, tempo total, nomes e erros;
#   e) monta a tabela resumo_geral_pockets.csv com os descritores;
#   f) responde as perguntas de analise;
#   g) constroi graficos.
#
# Comando do DoGSite3 (conforme instrucoes do exercicio):
#   dogsite3 -p pdbproteins/proteina.pdb -o resultados_dogsite/proteina/proteina -d --writeSiteResiduesPDB

import os
import time
import subprocess

import pandas as pd

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

PASTA_ENTRADA = "pdbproteins"
PASTA_SAIDA = "resultados_dogsite"
PASTA_GRAFICOS = "graphs"
ARQUIVO_RESUMO = os.path.join(PASTA_SAIDA, "resumo_geral_pockets.csv")

# Colunas do arquivo *_desc.txt do DoGSite3 que nos interessam,
# mapeadas para os nomes pedidos no exercicio.
COLUNAS_DESC = {
    "name": "pocket",
    "volume": "volume",
    "surface": "superficie",
    "depth": "profundidade",
    "hydrophobicity": "hidrofobicidade",
    "accept": "aceptores",
    "donor": "doadores",
}


def listar_pdbs():
    """Lista os arquivos .pdb da pasta de entrada."""
    if not os.path.isdir(PASTA_ENTRADA):
        raise FileNotFoundError("A pasta '%s' nao foi encontrada." % PASTA_ENTRADA)

    arquivos = sorted(
        nome for nome in os.listdir(PASTA_ENTRADA) if nome.lower().endswith(".pdb")
    )
    if not arquivos:
        raise FileNotFoundError("Nenhum arquivo .pdb encontrado em '%s'." % PASTA_ENTRADA)
    return arquivos


def executar_dogsite(nome_arquivo):
    """Executa o DoGSite3 para uma proteina. Retorna True em caso de sucesso."""
    nome_base = nome_arquivo[:-4] if nome_arquivo.lower().endswith(".pdb") else nome_arquivo

    caminho_entrada = os.path.join(PASTA_ENTRADA, nome_arquivo)
    pasta_resultado = os.path.join(PASTA_SAIDA, nome_base)
    os.makedirs(pasta_resultado, exist_ok=True)

    # prefixo dos arquivos de saida dentro da subpasta da proteina
    prefixo_saida = os.path.join(pasta_resultado, nome_base)

    comando = [
        "dogsite3",
        "-p", caminho_entrada,
        "-o", prefixo_saida,
        "-d",
        "--writeSiteResiduesPDB",
    ]

    print("\nProcessando: %s" % nome_arquivo)
    print("Comando: %s" % " ".join(comando))

    resultado = subprocess.run(comando, capture_output=True, text=True)

    if resultado.returncode != 0:
        print("Erro durante a execucao:")
        print(resultado.stderr.strip())
        return False

    print("Finalizado com sucesso.")
    return True


def extrair_descritores():
    """Le todos os arquivos *_desc.txt gerados e monta um DataFrame unico."""
    linhas_resumo = []

    for raiz, _pastas, arquivos in os.walk(PASTA_SAIDA):
        for arquivo in arquivos:
            if arquivo.endswith("_desc.txt"):
                caminho = os.path.join(raiz, arquivo)
                # nome da proteina = nome da subpasta
                nome_proteina = os.path.basename(raiz)

                try:
                    df = pd.read_csv(caminho, sep="\t")
                except Exception as erro:
                    print("Nao foi possivel ler %s: %s" % (caminho, erro))
                    continue

                # mantem apenas as colunas de interesse que existirem
                colunas_existentes = [c for c in COLUNAS_DESC if c in df.columns]
                df = df[colunas_existentes].rename(columns=COLUNAS_DESC)
                df.insert(0, "proteina", nome_proteina)
                linhas_resumo.append(df)

    if linhas_resumo:
        return pd.concat(linhas_resumo, ignore_index=True)
    return pd.DataFrame()


def analisar_resultados(df):
    """Responde as perguntas de analise a partir do DataFrame de pockets."""
    print("\n" + "=" * 60)
    print("ANALISE DOS RESULTADOS")
    print("=" * 60)

    if df.empty:
        print("Nenhum descritor disponivel para analise.")
        return

    # 1) Maior volume
    linha_volume = df.loc[df["volume"].idxmax()]
    print("1. Pocket de maior volume: %s (pocket %s, volume = %.2f)"
          % (linha_volume["proteina"], linha_volume["pocket"], linha_volume["volume"]))

    # 2) Mais profundo
    linha_prof = df.loc[df["profundidade"].idxmax()]
    print("2. Pocket mais profundo: %s (pocket %s, profundidade = %.2f)"
          % (linha_prof["proteina"], linha_prof["pocket"], linha_prof["profundidade"]))

    # 3) Relacao entre volume e profundidade (correlacao de Pearson)
    correlacao = df["volume"].corr(df["profundidade"])
    print("3. Correlacao entre volume e profundidade: %.3f" % correlacao)
    if correlacao > 0.5:
        print("   -> Ha relacao positiva: pockets maiores tendem a ser mais profundos.")
    elif correlacao < -0.5:
        print("   -> Ha relacao negativa.")
    else:
        print("   -> Relacao fraca entre volume e profundidade.")

    # 4) Pockets mais hidrofobicos
    if "hidrofobicidade" in df.columns:
        top_hidro = df.sort_values("hidrofobicidade", ascending=False).head(3)
        print("4. Proteinas com pockets mais hidrofobicos:")
        for _, linha in top_hidro.iterrows():
            print("   - %s (pocket %s, hidrofobicidade = %.3f)"
                  % (linha["proteina"], linha["pocket"], linha["hidrofobicidade"]))

    # 5) Sugestao de pocket para docking
    # Criterio simples: maior volume entre os mais profundos (bom espaco e acesso)
    melhor = df.loc[df["volume"].idxmax()]
    print("5. Sugestao de pocket para docking molecular:")
    print("   %s (pocket %s)." % (melhor["proteina"], melhor["pocket"]))
    print("   Justificativa: maior volume disponivel (%.2f), o que tende a"
          % melhor["volume"])
    print("   acomodar melhor um ligante; recomenda-se confirmar com a")
    print("   profundidade (%.2f) e a hidrofobicidade para a escolha final."
          % melhor["profundidade"])


def gerar_graficos(df):
    """Constroi pelo menos dois graficos a partir do principal pocket por proteina."""
    if df.empty:
        print("\nSem dados para gerar graficos.")
        return

    os.makedirs(PASTA_GRAFICOS, exist_ok=True)

    # Para cada proteina, considera o principal pocket = o de maior volume
    principais = df.loc[df.groupby("proteina")["volume"].idxmax()].sort_values("proteina")

    # Grafico 1: volume do principal pocket por proteina
    plt.figure(figsize=(11, 5))
    plt.bar(principais["proteina"], principais["volume"], color="steelblue", label="Volume")
    plt.title("Volume do principal pocket por proteina")
    plt.xlabel("Proteina")
    plt.ylabel("Volume (A^3)")
    plt.xticks(rotation=45, ha="right")
    plt.legend()
    plt.tight_layout()
    caminho1 = os.path.join(PASTA_GRAFICOS, "pockets_volume.png")
    plt.savefig(caminho1)
    plt.close()
    print("\nGrafico salvo em: %s" % caminho1)

    # Grafico 2: profundidade do principal pocket por proteina
    plt.figure(figsize=(11, 5))
    plt.bar(principais["proteina"], principais["profundidade"], color="indianred", label="Profundidade")
    plt.title("Profundidade do principal pocket por proteina")
    plt.xlabel("Proteina")
    plt.ylabel("Profundidade")
    plt.xticks(rotation=45, ha="right")
    plt.legend()
    plt.tight_layout()
    caminho2 = os.path.join(PASTA_GRAFICOS, "pockets_profundidade.png")
    plt.savefig(caminho2)
    plt.close()
    print("Grafico salvo em: %s" % caminho2)


def main():
    os.makedirs(PASTA_SAIDA, exist_ok=True)

    arquivos = listar_pdbs()
    print("Foram encontrados %d arquivos PDB." % len(arquivos))

    inicio = time.time()
    processadas = []
    com_erro = []

    for nome in arquivos:
        sucesso = executar_dogsite(nome)
        if sucesso:
            processadas.append(nome)
        else:
            com_erro.append(nome)

    tempo_total = time.time() - inicio

    # Relatorio de execucao (item e)
    print("\n" + "=" * 60)
    print("RELATORIO DE EXECUCAO")
    print("=" * 60)
    print("Numero total de proteinas analisadas: %d" % len(arquivos))
    print("Tempo total de execucao: %.1f segundos" % tempo_total)
    print("Proteinas processadas com sucesso: %s"
          % (", ".join(processadas) if processadas else "nenhuma"))
    if com_erro:
        print("Proteinas com erro: %s" % ", ".join(com_erro))
    else:
        print("Nenhum erro durante a execucao.")

    # Tabela resumo (item f)
    df = extrair_descritores()
    if not df.empty:
        df.to_csv(ARQUIVO_RESUMO, index=False)
        print("\nResumo geral salvo em: %s" % ARQUIVO_RESUMO)
        print("Total de pockets encontrados: %d" % len(df))
    else:
        print("\nNenhum descritor encontrado para montar o resumo.")

    # Analise e graficos (itens analise e graficos)
    analisar_resultados(df)
    gerar_graficos(df)


if __name__ == "__main__":
    main()
