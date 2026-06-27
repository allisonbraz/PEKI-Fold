# -*- coding: utf-8 -*-
"""Ponto de entrada para a Vercel (runtime @vercel/python).

A Vercel detecta a variavel `app` (ASGI) e a serve como funcao serverless.
Aqui apenas reaproveitamos o app FastAPI definido em webapp/app.py.
"""

import os
import sys

# Garante que a pasta raiz do webapp (onde estao app.py e pdb_analysis.py)
# esteja no path de importacao, independente do diretorio de trabalho.
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if RAIZ not in sys.path:
    sys.path.insert(0, RAIZ)

from app import app  # noqa: E402  (import depende do ajuste de sys.path acima)

# A Vercel usa esta variavel:
app = app
