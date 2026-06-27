# -*- coding: utf-8 -*-
"""Modulo de analise estrutural de proteinas (formato PDB).

Reune, em funcoes puras que operam sobre o TEXTO de um arquivo PDB, a logica
dos Programas 01 a 05 do trabalho original:

  - separar_cadeias        (Programas 01/02)
  - estatisticas_cadeias   (Programa 03)
  - frequencia_aminoacidos (Programa 04)
  - buscar_motivo          (Programa 05)

As funcoes nao fazem I/O de arquivos: recebem texto e devolvem estruturas
Python (dicts/listas), prontas para serem expostas por uma API web.
"""

from __future__ import annotations

# 20 aminoacidos padrao e a conversao de 3 letras para 1 letra
AMINOACIDOS_PADRAO = [
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
    "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
]

TRES_PARA_UMA = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
}


def _linhas_coordenada(texto_pdb: str):
    """Itera apenas sobre as linhas de coordenada relevantes (ATOM)."""
    for linha in texto_pdb.splitlines():
        if linha.startswith("ATOM"):
            yield linha


def listar_ids_cadeias(texto_pdb: str) -> list[str]:
    """Retorna os identificadores de cadeia presentes, em ordem de aparicao."""
    vistos: list[str] = []
    for linha in texto_pdb.splitlines():
        registro = linha[0:6].strip()
        if registro in ("ATOM", "HETATM", "TER") and len(linha) >= 22:
            cid = linha[21]
            if cid == " ":
                cid = "_"
            if cid not in vistos:
                vistos.append(cid)
    return vistos


def separar_cadeias(texto_pdb: str) -> dict[str, str]:
    """Separa o PDB por cadeia. Retorna {id_cadeia: texto_pdb_da_cadeia}.

    Inclui ATOM/HETATM/TER/ANISOU e finaliza cada cadeia com END.
    """
    cadeias: dict[str, list[str]] = {}
    for linha in texto_pdb.splitlines():
        registro = linha[0:6].strip()
        if registro in ("ATOM", "HETATM", "TER", "ANISOU") and len(linha) >= 22:
            cid = linha[21]
            if cid == " ":
                cid = "_"
            cadeias.setdefault(cid, []).append(linha)

    resultado: dict[str, str] = {}
    for cid in sorted(cadeias):
        resultado[cid] = "\n".join(cadeias[cid]) + "\nEND\n"
    return resultado


def _residuos_ordenados(texto_pdb: str, id_cadeia: str | None = None):
    """Lista (nome_residuo, num_residuo) de uma cadeia, na ordem, sem repetir."""
    sequencia = []
    vistos = set()
    for linha in _linhas_coordenada(texto_pdb):
        if len(linha) < 27:
            continue
        cid = linha[21]
        if cid == " ":
            cid = "_"
        if id_cadeia is not None and cid != id_cadeia:
            continue
        nome = linha[17:20].strip()
        num = linha[22:27].strip()
        chave = (cid, nome, num)
        if chave not in vistos:
            vistos.add(chave)
            sequencia.append((nome, num))
    return sequencia


def estatisticas_cadeias(texto_pdb: str) -> dict:
    """Estatisticas por cadeia: atomos, residuos, aminoacidos diferentes.

    Retorna {"cadeias": [...], "maior": {...}, "menor": {...}}.
    """
    por_cadeia: dict[str, dict] = {}

    for linha in _linhas_coordenada(texto_pdb):
        if len(linha) < 27:
            continue
        cid = linha[21]
        if cid == " ":
            cid = "_"
        nome = linha[17:20].strip()
        num = linha[22:27].strip()

        d = por_cadeia.setdefault(cid, {"atomos": 0, "residuos": set(), "aa": set()})
        d["atomos"] += 1
        d["residuos"].add(num)
        if nome in AMINOACIDOS_PADRAO:
            d["aa"].add(nome)

    cadeias = []
    for cid in sorted(por_cadeia):
        d = por_cadeia[cid]
        cadeias.append({
            "cadeia": cid,
            "atomos": d["atomos"],
            "residuos": len(d["residuos"]),
            "aminoacidos_diferentes": len(d["aa"]),
        })

    resposta = {"cadeias": cadeias, "maior": None, "menor": None}
    if cadeias:
        resposta["maior"] = max(cadeias, key=lambda c: c["residuos"])
        resposta["menor"] = min(cadeias, key=lambda c: c["residuos"])
    return resposta


def frequencia_aminoacidos(texto_pdb: str, id_cadeia: str | None = None) -> dict:
    """Frequencia e porcentagem dos 20 aminoacidos (de uma cadeia ou de todas).

    Retorna {"total": int, "itens": [{"aa","contagem","porcentagem"}, ...]}.
    """
    contagem = {aa: 0 for aa in AMINOACIDOS_PADRAO}
    for nome, _num in _residuos_ordenados(texto_pdb, id_cadeia):
        if nome in contagem:
            contagem[nome] += 1

    total = sum(contagem.values())
    itens = []
    for aa in AMINOACIDOS_PADRAO:
        pct = (100.0 * contagem[aa] / total) if total else 0.0
        itens.append({"aa": aa, "contagem": contagem[aa], "porcentagem": round(pct, 2)})

    return {"total": total, "itens": itens}


def sequencia_uma_letra(texto_pdb: str, id_cadeia: str) -> str:
    """Sequencia de uma letra de uma cadeia (X para residuo nao-padrao)."""
    letras = []
    for nome, _num in _residuos_ordenados(texto_pdb, id_cadeia):
        letras.append(TRES_PARA_UMA.get(nome, "X"))
    return "".join(letras)


def buscar_motivo(texto_pdb: str, motivo: list[str]) -> list[dict]:
    """Procura o motivo (lista de aminoacidos de 3 letras) em todas as cadeias.

    Retorna lista de ocorrencias: {"cadeia","posicao","residuos"}.
    posicao = numero do residuo (do PDB) onde a ocorrencia comeca.
    """
    motivo = [m.strip().upper() for m in motivo if m.strip()]
    ocorrencias: list[dict] = []
    if not motivo:
        return ocorrencias

    n = len(motivo)
    for cid in listar_ids_cadeias(texto_pdb):
        seq = _residuos_ordenados(texto_pdb, cid)
        nomes = [r[0] for r in seq]
        for i in range(len(nomes) - n + 1):
            if nomes[i:i + n] == motivo:
                nums = [seq[i + k][1] for k in range(n)]
                ocorrencias.append({
                    "cadeia": cid,
                    "posicao": seq[i][1],
                    "residuos": nums,
                })
    return ocorrencias


def analisar_completo(texto_pdb: str) -> dict:
    """Roda todas as analises de uma vez (usado pelo endpoint principal)."""
    cadeias_ids = listar_ids_cadeias(texto_pdb)
    stats = estatisticas_cadeias(texto_pdb)

    freq_por_cadeia = {}
    sequencias = {}
    for cid in cadeias_ids:
        freq_por_cadeia[cid] = frequencia_aminoacidos(texto_pdb, cid)
        sequencias[cid] = sequencia_uma_letra(texto_pdb, cid)

    return {
        "cadeias": cadeias_ids,
        "estatisticas": stats,
        "frequencias": freq_por_cadeia,
        "sequencias": sequencias,
    }
