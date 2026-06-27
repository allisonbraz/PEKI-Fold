# dogsite_frames_local.py
# Executa DoGSite/DoGSiteScorer localmente para todos os PDBs da pasta pdbproteins

import subprocess
from pathlib import Path
import pandas as pd


# Pasta com os PDBs ou frames da trajetória
PASTA_ENTRADA = Path("pdbproteins")

# Pasta onde os resultados serão salvos
PASTA_SAIDA = Path("resultados_dogsite")

# Ajuste este comando conforme a instalação local do DoGSite
# Exemplos possíveis:
# "dogsite3 -i {input} -o {output}"
# "dogsite -i {input} -o {output}"
# "DogSiteScorer -i {input} -o {output}"
COMANDO_DOGSITE = "dogsite3 -i {input} -o {output}"


def listar_pdbs():
    """
    Lista todos os arquivos .pdb da pasta pdbproteins.
    """

    if not PASTA_ENTRADA.exists():
        raise FileNotFoundError("A pasta pdbproteins não foi encontrada.")

    arquivos = sorted(PASTA_ENTRADA.glob("*.pdb"))

    if len(arquivos) == 0:
        raise FileNotFoundError("Nenhum arquivo .pdb encontrado em pdbproteins.")

    return arquivos


def executar_dogsite(arquivo_pdb):
    """
    Executa o DoGSite para um arquivo PDB.
    """

    nome_base = arquivo_pdb.stem
    pasta_resultado = PASTA_SAIDA / nome_base
    pasta_resultado.mkdir(parents=True, exist_ok=True)

    comando = COMANDO_DOGSITE.format(
        input=str(arquivo_pdb),
        output=str(pasta_resultado)
    )

    print(f"\nProcessando: {arquivo_pdb.name}")
    print(f"Comando: {comando}")

    resultado = subprocess.run(
        comando,
        shell=True,
        capture_output=True,
        text=True
    )

    if resultado.returncode != 0:
        print("Erro durante a execução:")
        print(resultado.stderr)
        return False

    print("Finalizado com sucesso.")
    return True


def procurar_tabelas_resultado():
    """
    Procura arquivos CSV, TSV ou TXT gerados pelo DoGSite.
    """

    tabelas = []

    for arquivo in PASTA_SAIDA.rglob("*"):
        if arquivo.suffix.lower() in [".csv", ".tsv", ".txt"]:
            tabelas.append(arquivo)

    return tabelas


def juntar_resultados():
    """
    Tenta juntar tabelas geradas pelo DoGSite em um único arquivo CSV.
    """

    tabelas = procurar_tabelas_resultado()
    dados = []

    for tabela in tabelas:
        try:
            if tabela.suffix.lower() == ".csv":
                df = pd.read_csv(tabela)
            else:
                df = pd.read_csv(tabela, sep=None, engine="python")

            df["arquivo_resultado"] = tabela.name
            df["pasta_origem"] = tabela.parent.name
            dados.append(df)

        except Exception:
            pass

    if dados:
        resumo = pd.concat(dados, ignore_index=True)
        resumo.to_csv(PASTA_SAIDA / "resumo_geral_pockets.csv", index=False)
        print("\nResumo geral salvo em:")
        print(PASTA_SAIDA / "resumo_geral_pockets.csv")
    else:
        print("\nNenhuma tabela foi juntada automaticamente.")


def main():
    PASTA_SAIDA.mkdir(exist_ok=True)

    arquivos_pdb = listar_pdbs()

    print(f"Foram encontrados {len(arquivos_pdb)} arquivos PDB.")

    for arquivo_pdb in arquivos_pdb:
        executar_dogsite(arquivo_pdb)

    juntar_resultados()


if __name__ == "__main__":
    main()
