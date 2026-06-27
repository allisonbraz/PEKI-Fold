# -*- coding: utf-8 -*-
"""Backend FastAPI da plataforma de analise estrutural de proteinas (MVP).

Expoe as analises dos Programas 01-05 como uma API JSON e serve o frontend
estatico. A estrutura PDB pode vir de upload ou ser buscada no RCSB por ID.
"""

from __future__ import annotations

import io
import re
import urllib.request
import urllib.error
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse, FileResponse
from fastapi.staticfiles import StaticFiles

import pdb_analysis as analise

app = FastAPI(title="PEKI Fold", version="0.1.0")

DIR_BASE = Path(__file__).resolve().parent
DIR_STATIC = DIR_BASE / "static"

# Limite de tamanho do PDB (~20 MB) para uploads e downloads do RCSB
TAMANHO_MAX = 20 * 1024 * 1024

RCSB_URL = "https://files.rcsb.org/download/{id}.pdb"
ID_PDB_REGEX = re.compile(r"^[0-9][A-Za-z0-9]{3}$")  # ex.: 1A00, 4HHB


def _validar_pdb(texto: str) -> None:
    """Validacao minima: precisa conter ao menos uma linha de coordenada."""
    if "ATOM" not in texto and "HETATM" not in texto:
        raise HTTPException(
            status_code=400,
            detail="Arquivo invalido: nenhuma linha ATOM/HETATM encontrada.",
        )


def _buscar_rcsb(pdb_id: str) -> str:
    """Baixa o texto PDB do RCSB a partir do ID (4 caracteres)."""
    pdb_id = pdb_id.strip()
    if not ID_PDB_REGEX.match(pdb_id):
        raise HTTPException(status_code=400, detail="ID de PDB invalido (ex.: 1A00).")

    url = RCSB_URL.format(id=pdb_id.upper())
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PEKIFold/0.1"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            dados = resp.read(TAMANHO_MAX + 1)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise HTTPException(status_code=404, detail="PDB '%s' nao encontrado no RCSB." % pdb_id)
        raise HTTPException(status_code=502, detail="Erro ao acessar o RCSB (%s)." % e.code)
    except urllib.error.URLError:
        raise HTTPException(status_code=502, detail="Sem conexao com o RCSB.")

    if len(dados) > TAMANHO_MAX:
        raise HTTPException(status_code=413, detail="Estrutura muito grande (limite 20 MB).")

    return dados.decode("utf-8", errors="replace")


async def _ler_entrada(arquivo: UploadFile | None, pdb_id: str | None) -> tuple[str, str]:
    """Resolve a entrada (upload OU id) e retorna (nome, texto_pdb)."""
    if arquivo is not None:
        conteudo = await arquivo.read(TAMANHO_MAX + 1)
        if len(conteudo) > TAMANHO_MAX:
            raise HTTPException(status_code=413, detail="Arquivo muito grande (limite 20 MB).")
        texto = conteudo.decode("utf-8", errors="replace")
        nome = arquivo.filename or "estrutura.pdb"
        _validar_pdb(texto)
        return nome, texto

    if pdb_id:
        texto = _buscar_rcsb(pdb_id)
        _validar_pdb(texto)
        return "%s.pdb" % pdb_id.upper(), texto

    raise HTTPException(status_code=400, detail="Envie um arquivo PDB ou informe um ID.")


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/pdb", response_class=PlainTextResponse)
def obter_pdb(id: str = Query(..., description="ID do PDB no RCSB, ex.: 1A00")):
    """Retorna o texto bruto do PDB (usado pelo viewer 3D ao buscar por ID)."""
    return _buscar_rcsb(id)


@app.post("/api/analyze")
async def analisar(
    file: UploadFile | None = File(default=None),
    pdb_id: str | None = Form(default=None),
):
    """Roda todas as analises (Programas 01-05) e devolve o resultado + o PDB.

    O texto PDB e devolvido junto para o frontend carregar no viewer 3D.
    """
    nome, texto = await _ler_entrada(file, pdb_id)
    resultado = analise.analisar_completo(texto)
    resultado["nome"] = nome
    resultado["pdb_text"] = texto
    return JSONResponse(resultado)


@app.post("/api/motif")
async def motivo(
    motif: str = Form(...),
    file: UploadFile | None = File(default=None),
    pdb_id: str | None = Form(default=None),
):
    """Busca um motivo (ex.: GLY-LYS-SER) na estrutura informada."""
    _nome, texto = await _ler_entrada(file, pdb_id)
    lista = [m for m in re.split(r"[-,\s]+", motif) if m]
    ocorrencias = analise.buscar_motivo(texto, lista)
    return {"motivo": [m.upper() for m in lista], "ocorrencias": ocorrencias}


@app.post("/api/chain", response_class=PlainTextResponse)
async def baixar_cadeia(
    chain: str = Form(...),
    file: UploadFile | None = File(default=None),
    pdb_id: str | None = Form(default=None),
):
    """Retorna o PDB de uma unica cadeia (Programa 01 - separacao)."""
    _nome, texto = await _ler_entrada(file, pdb_id)
    cadeias = analise.separar_cadeias(texto)
    if chain not in cadeias:
        raise HTTPException(status_code=404, detail="Cadeia '%s' nao encontrada." % chain)
    return cadeias[chain]


# --------------------------------------------------------------------------
# Frontend estatico (montado por ultimo para nao capturar as rotas /api)
# --------------------------------------------------------------------------
if DIR_STATIC.is_dir():
    app.mount("/", StaticFiles(directory=str(DIR_STATIC), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
