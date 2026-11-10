"""Consulta publica de requisitos de juegos disponibles en la tienda Steam.

No dispone de un listado manual de juegos: usa el buscador de la tienda y
la ficha publicada por el desarrollador. Cuando no hay coincidencia
confiable, devuelve None, nunca finge una fuente oficial.
"""
from __future__ import annotations

import re
import threading
import time
import unicodedata
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup

STEAM_BUSCAR = "https://store.steampowered.com/api/storesearch/"
STEAM_FICHA = "https://store.steampowered.com/api/appdetails"
CABECERAS = {"User-Agent": "ConnectPC-Academic-Demo/2.0", "Accept": "application/json"}
_CACHE = {}
_LOCK = threading.Lock()
_TTL = 6 * 60 * 60


def _normalizar(texto):
    texto = unicodedata.normalize("NFKD", str(texto).lower())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", texto).strip()


ALIAS = {
    "cs2": "Counter-Strike 2",
    "cs 2": "Counter-Strike 2",
    "gta 5": "Grand Theft Auto V",
    "gta v": "Grand Theft Auto V",
    "dota": "Dota 2",
}


def limpiar_nombre(nombre):
    if not isinstance(nombre, str):
        return ""
    nombre = nombre.strip().strip("!?\u00bf\u00a1.,:;\"' ")
    nombre = re.sub(
        r"\s+(?:en|con)\s+(?:mi|una|el|la)\s+"
        r"(?:pc|laptop|computadora|equipo).*$", "", nombre, flags=re.I
    )
    nombre = re.sub(r"\s+(?:a|en)\s+(?:cuantos|cu\u00e1ntos)\s+fps.*$", "", nombre, flags=re.I)
    nombre = nombre[:90].strip()
    return ALIAS.get(_normalizar(nombre), nombre)


def detectar_juego(mensaje, nombre_explicito=None):
    """Extraccion conservadora: si no hay certeza, no consulta Steam."""
    if nombre_explicito:
        return limpiar_nombre(nombre_explicito)
    if not isinstance(mensaje, str):
        return ""
    patrones = [
        r"(?:mi\s+(?:pc|laptop|computadora|equipo)\s+)"
        r"(?:puede\s+)?(?:correr|corre|soporta|aguanta|ejecuta|mueve)\s+(.+)",
        r"(?:puedo|podr\u00e9|podria|podr\u00eda)\s+(?:jugar|correr|ejecutar)\s+(?:a\s+)?(.+)",
        r"(?:requisitos|requerimientos)\s+(?:m\u00ednimos\s+|recomendados\s+)?"
        r"(?:de|del|para)\s+(.+)",
        r"(?:que\s+tal\s+(?:me\s+)?(?:corre|ir\u00eda)\s+)(.+)",
    ]
    for patron in patrones:
        encontrado = re.search(patron, mensaje, flags=re.I)
        if encontrado:
            return limpiar_nombre(encontrado.group(1))
    return ""


def _texto_html(html):
    if not isinstance(html, str) or not html.strip():
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    texto = soup.get_text("\n", strip=True)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto[:4200]


def _consultar_steam(nombre):
    response = requests.get(
        STEAM_BUSCAR,
        params={"term": nombre, "l": "english", "cc": "us"},
        headers=CABECERAS,
        timeout=(4, 7),
    )
    response.raise_for_status()
    items = response.json().get("items", [])
    if not isinstance(items, list):
        return None
    buscado = _normalizar(nombre)
    candidatos = []
    for item in items[:20]:
        if not isinstance(item, dict):
            continue
        titulo = str(item.get("name", ""))
        appid = item.get("id")
        if not isinstance(appid, int):
            continue
        clave = _normalizar(titulo)
        puntaje = SequenceMatcher(None, buscado, clave).ratio()
        if clave == buscado:
            puntaje = 1.0
        elif clave.startswith(buscado + " "):
            puntaje = max(puntaje, 0.87)
        candidatos.append((puntaje, titulo, appid))
    if not candidatos:
        return None
    puntaje, titulo, appid = max(candidatos, key=lambda x: x[0])
    if puntaje < 0.79:
        return None

    ficha_resp = requests.get(
        STEAM_FICHA,
        params={"appids": str(appid), "cc": "us", "l": "english"},
        headers=CABECERAS,
        timeout=(4, 7),
    )
    ficha_resp.raise_for_status()
    datos_app = ficha_resp.json().get(str(appid), {})
    if not datos_app.get("success"):
        return None
    datos = datos_app.get("data") or {}
    requisitos = datos.get("pc_requirements") or {}
    if not isinstance(requisitos, dict):
        requisitos = {}
    return {
        "nombre": str(datos.get("name") or titulo)[:120],
        "url": "https://store.steampowered.com/app/{}/".format(appid),
        "minimos": _texto_html(requisitos.get("minimum", "")),
        "recomendados": _texto_html(requisitos.get("recommended", "")),
        "fuente": "Ficha de Steam publicada por el desarrollador/editor",
        "verificado": bool(requisitos.get("minimum") or requisitos.get("recommended")),
    }


def obtener_requisitos(nombre):
    nombre = limpiar_nombre(nombre)
    if len(nombre) < 2:
        return None
    clave = _normalizar(nombre)
    ahora = time.time()
    with _LOCK:
        hit = _CACHE.get(clave)
        if hit and hit[0] > ahora:
            return hit[1]
    try:
        resultado = _consultar_steam(nombre)
    except (requests.RequestException, ValueError, KeyError, TypeError):
        resultado = None
    with _LOCK:
        if len(_CACHE) > 200:
            _CACHE.clear()
        _CACHE[clave] = (ahora + (3600 if resultado is None else _TTL), resultado)
    return resultado
