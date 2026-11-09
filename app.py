
import os

from flask import Flask, request, jsonify, render_template
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

app = Flask(__name__)

API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("No se encontró GEMINI_API_KEY en .env")

client = genai.Client(api_key=API_KEY)

MODELO = "gemini-3.5-flash-lite"

INSTRUCCIONES = """
Eres ConnectPC, un asistente de inteligencia artificial
especializado en computadoras, informática y tecnología.

Formas parte de un prototipo académico no oficial,
inspirado en la atención técnica y preventa de
Memory Kings Perú.

TU OBJETIVO:
Ayudar a cualquier persona a resolver preguntas sobre
computadoras, componentes, problemas técnicos y compras.

DEBES CONOCER Y EXPLICAR:

- Computadoras de escritorio y laptops.
- Procesadores Intel y AMD.
- Tarjetas gráficas NVIDIA, AMD e Intel.
- Memoria RAM, DDR4, DDR5 y compatibilidad.
- SSD, HDD, NVMe y almacenamiento.
- Placas madre, sockets, chipsets y BIOS.
- Fuentes de poder, refrigeración y temperaturas.
- Armado y actualización de computadoras.
- Gaming, rendimiento, FPS y cuellos de botella.
- Windows, Linux, drivers y programas.
- Redes, Wi-Fi, internet y periféricos.
- Diagnóstico de fallas y mantenimiento.
- Comparación de marcas, modelos y tecnologías.
- Asesoría de compras según uso y presupuesto.

REGLAS IMPORTANTES:

1. Responde directamente a la pregunta actual.

2. Puedes hablar de cualquier marca y modelo de PC.

3. Nunca te limites a una computadora específica.

4. Si el usuario cambia de laptop o componente,
   cambia también el contexto de tu respuesta.

5. Utiliza el historial de conversación cuando
   sea relevante, pero no repitas respuestas antiguas.

6. Explica los temas de forma clara y profesional.

7. Para problemas técnicos, proporciona pasos
   de diagnóstico ordenados y seguros.

8. Si preguntan por una compra, considera el uso,
   el presupuesto y la compatibilidad.

9. No inventes compatibilidades, especificaciones
   exactas, precios ni disponibilidad comercial.

10. Si no puedes confirmar una especificación,
    acláralo y explica cómo comprobarla.

11. No afirmes haber consultado una página web,
    un fabricante o un catálogo si no lo has hecho.

12. No hagas preguntas innecesarias. Primero ofrece
    una respuesta útil con la información disponible.

13. No repitas saludos en cada respuesta.

14. Responde normalmente a preguntas nuevas,
    incluso cuando no estén relacionadas con
    el tema anterior.

15. Responde siempre en español, salvo que
    el usuario solicite otro idioma.
"""


@app.route("/")
def inicio():
    return render_template("index.html")

@app.route("/api/chat", methods=["POST"])
def chat():

    datos = request.get_json(silent=True)

    if not isinstance(datos, dict):
        return jsonify({
            "error": "Solicitud inválida."
        }), 400

    mensaje = datos.get("mensaje", "")
    historial = datos.get("historial", [])

    if not isinstance(mensaje, str) or not mensaje.strip():
        return jsonify({
            "error": "Debes escribir una pregunta."
        }), 400

    mensaje = mensaje.strip()

    if len(mensaje) > 2000:
        return jsonify({
            "error": "La pregunta es demasiado larga."
        }), 400

    if not isinstance(historial, list):
        historial = []

    conversacion = []

    # Recuperar los últimos mensajes de la conversación
    for turno in historial[-16:]:

        if not isinstance(turno, dict):
            continue

        rol = turno.get("role")
        texto = turno.get("text")

        if rol not in ["user", "model"]:
            continue

        if not isinstance(texto, str):
            continue

        if not texto.strip():
            continue

        conversacion.append(
            types.Content(
                role=rol,
                parts=[
                    types.Part.from_text(text=texto[:2000])
                ]
            )
        )

    # Agregar la nueva pregunta
    conversacion.append(
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=mensaje)
            ]
        )
    )

    try:
        respuesta_ia = client.models.generate_content(
            model=MODELO,
            contents=conversacion,
            config=types.GenerateContentConfig(
                system_instruction=INSTRUCCIONES,
                temperature=0.4
            )
        )

        respuesta = (respuesta_ia.text or "").strip()

        if not respuesta:
            return jsonify({
                "error": "La IA no generó una respuesta."
            }), 502

        return jsonify({
            "respuesta": respuesta
        })

    except Exception:
        app.logger.exception("Error de Gemini")

        return jsonify({
            "error": "No se pudo consultar la IA."
        }), 503


if __name__ == "__main__":
    app.run(debug=False)
