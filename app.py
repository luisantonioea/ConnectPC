"""ConnectPC IA - prototipo academico de asesoria sobre hardware y juegos."""
from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

load_dotenv()

from core.assistant import generar_respuesta
from core.games import detectar_juego, obtener_requisitos, limpiar_nombre
from core.hardware import normalizar_equipo

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 72 * 1024
app.json.ensure_ascii = False


@app.after_request
def seguridad(respuesta):
    respuesta.headers["X-Content-Type-Options"] = "nosniff"
    respuesta.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    respuesta.headers["X-Frame-Options"] = "DENY"
    if request.path.startswith("/api/"):
        respuesta.headers["Cache-Control"] = "no-store"
    return respuesta


@app.get("/")
def inicio():
    return render_template("index.html")


@app.get("/api/estado")
def estado():
    return jsonify({
        "ok": True,
        "ia_activa": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "modelo": os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        "busqueda_web_activa": os.getenv("ENABLE_GOOGLE_SEARCH", "0") == "1",
        "detector_url": os.getenv("DETECTOR_DOWNLOAD_URL", "").strip(),
    })


@app.get("/api/juegos/requisitos")
def requisitos():
    nombre = limpiar_nombre(request.args.get("nombre", ""))
    if not 2 <= len(nombre) <= 90:
        return jsonify({"error": "Escribe el nombre de un videojuego."}), 400
    datos = obtener_requisitos(nombre)
    if datos:
        return jsonify({"encontrado": True, "juego": datos})
    return jsonify({
        "encontrado": False,
        "aviso": "No se encontro una coincidencia confiable con ficha de PC en Steam.",
    })


@app.post("/api/chat")
def chat():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Solicitud JSON invalida."}), 400

    mensaje = payload.get("mensaje")
    if not isinstance(mensaje, str) or not mensaje.strip():
        return jsonify({"error": "Escribe una pregunta."}), 400
    mensaje = mensaje.strip()
    if len(mensaje) > 2000:
        return jsonify({"error": "Maximo 2000 caracteres por pregunta."}), 400

    historial = payload.get("historial")
    if not isinstance(historial, list):
        historial = []
    historial = historial[-12:]

    equipo = normalizar_equipo(payload.get("equipo") or payload.get("datos_pc"))
    nombre_juego = detectar_juego(mensaje, payload.get("juego"))
    juego = obtener_requisitos(nombre_juego) if nombre_juego else None
    try:
        texto, fuentes = generar_respuesta(
            mensaje, historial, equipo=equipo, juego=juego, nombre_juego=nombre_juego
        )
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503

    return jsonify({
        "respuesta": texto,
        "modo": "gemini" if os.getenv("GEMINI_API_KEY", "").strip() else "demo",
        "equipo_detectado": equipo is not None,
        "nivel_equipo": equipo["nivel"] if equipo else None,
        "juego": juego,
        "juego_consultado": nombre_juego,
        "fuentes": fuentes,
    })


@app.errorhandler(413)
def demasiado_grande(_exc):
    return jsonify({"error": "El archivo o mensaje es demasiado grande."}), 413


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
