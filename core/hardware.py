"""Validacion estricta de datos compartidos voluntariamente por el navegador."""
from __future__ import annotations

import math
import re

FORMATO_WINDOWS = "connectpc-hardware-v1"
FORMATO_NAVEGADOR = "connectpc-browser-v1"


def _texto(valor, limite=140):
    if not isinstance(valor, str):
        return "No identificado"
    texto = re.sub(r"[\x00-\x1f\x7f]+", " ", valor).strip()
    return texto[:limite] or "No identificado"


def _numero(valor, maximo):
    if isinstance(valor, bool):
        return None
    try:
        numero = float(valor)
    except (ValueError, TypeError):
        return None
    if not math.isfinite(numero) or not 0 < numero <= maximo:
        return None
    return round(numero, 1)


def normalizar_equipo(datos):
    """No acepta instrucciones externas ni campos sensibles como seriales/IP."""
    if not isinstance(datos, dict):
        return None
    formato = datos.get("formato")
    if formato == FORMATO_WINDOWS:
        graficas = datos.get("graficas", [])
        if not isinstance(graficas, list):
            graficas = []
        return {
            "formato": FORMATO_WINDOWS,
            "nivel": "completo",
            "procesador": _texto(datos.get("procesador")),
            "ram_gb": _numero(datos.get("ram_gb"), 2048),
            "graficas": [_texto(g) for g in graficas[:5] if isinstance(g, str)],
            "sistema_operativo": _texto(datos.get("sistema_operativo")),
            "nota": "Datos tecnicos aportados por el cliente; no verificados por el servidor.",
        }
    if formato == FORMATO_NAVEGADOR:
        cores = _numero(datos.get("nucleos_logicos"), 256)
        return {
            "formato": FORMATO_NAVEGADOR,
            "nivel": "basico",
            "nucleos_logicos": int(cores) if cores is not None else None,
            "ram_aproximada_gb": _numero(datos.get("ram_aproximada_gb"), 1024),
            "gpu_webgl": _texto(datos.get("gpu_webgl")),
            "plataforma": _texto(datos.get("plataforma")),
            "nota": (
                "Estimaciones del navegador, no son los modelos exactos de CPU/GPU "
                "ni la RAM fisica verificada."
            ),
        }
    return None
