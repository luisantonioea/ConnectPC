# ConnectPC IA - interfaz de tienda estilo Memory Kings (demo academica)

Esta edicion conserva la logica de Gemini, Steam y detector de Windows de la version ConnectPC_Completo y sustituye la portada por una tienda de referencia, con encabezado verde, banner WOW historico, categorias, productos simulados, marcas y chat flotante. **No es un sitio oficial ni realiza ventas.**

**IMPORTANTE para ti:** Si tu chatbot ya funcionaba en `ConnectPC_Completo`, copia el archivo `.env` privado desde esa carpeta a esta nueva carpeta. No necesitas cambiar la API Key. No compartas ni subas ese archivo.

Los precios del banner WOW son de una promocion anterior, NO estan vigentes. Las tarjetas del catalogo no publican precios ni stock: solo son ejemplos visuales.

Para instrucciones muy rapidas abre `LEEME_PRIMERO.txt`.

---

# ConnectPC IA — Proyecto completo de demostración

**Proyecto académico, no afiliado a Memory Kings.** Tienda tecnológica demostrativa + chat Gemini + comparador de requisitos de videojuegos + detector de hardware para Windows.

## EMPIEZA AQUÍ — probar en Windows

1. Descomprime el ZIP en una carpeta propia, por ejemplo `Escritorio\ConnectPC_Completo`.
2. En esa carpeta, **copia `.env.example` y renombra la copia a `.env`** (no renombres el archivo original). Abre `.env` y añade tu `GEMINI_API_KEY` tras el signo `=`. Mantén esa clave privada. Se obtiene desde Google AI Studio. Si no pones una clave, el servidor funcionará en **modo demostración**, sin IA real.
3. Haz doble clic en **`INICIAR_WINDOWS.bat`**. La primera vez instalará las dependencias de Python y abrirá `http://127.0.0.1:5000`. Necesitas Python instalado **en la PC que ejecuta Flask** y conexión a internet para descargar dependencias.
4. Usa el chat y el buscador de videojuegos. Prueba `¿Mi PC puede correr Dota 2?`.
5. Pulsa **«Analizar mi PC»**. Sin el detector, obtendrás únicamente una **revisión básica** del navegador; NO identifica con certeza tu CPU, GPU o RAM. Para detección completa ve a la sección siguiente.

### Detección completa (CPU, GPU, RAM y Windows)

El navegador **no puede** obtener el modelo exacto de todos los componentes de una PC sin un programa local. No hay forma segura de iniciarlo o instalarlo silenciosamente desde una página web.

1. En **la computadora Windows donde quieras analizar el hardware**, abre `detector\crear_exe.bat`. Ese paso necesita Python para **compilar**, pero el `.exe` resultante **NO necesita Python**.
2. El ejecutable aparece en `detector\dist\ConnectPC-Detector.exe`. Abre ese EXE con doble clic; verás una aplicación con ventana propia. Deja abierta o minimizada esa aplicación.
3. Abre la web publicada en `https://connectpc-ia.onrender.com` o la página local y pulsa **«Analizar mi PC»**. Autoriza la comunicación con la red local si el navegador lo solicita, y después autoriza la ventana del detector. El informe incluye *solo* CPU, RAM, GPU y nombre de Windows.
4. En otras computadoras Windows, puedes **copiar solo el `.exe` compilado** y abrirlo sin instalar Python. El programa debe estar en ejecución para que la web lo encuentre.
5. **Opcional:** para que la aplicación arranque automáticamente *después de instalarla con permiso del usuario*, ejecuta `detector\instalar_inicio_automatico.bat` **junto a la carpeta `detector\dist`**. Esto configura un acceso directo de inicio de sesión de Windows. Se revierte con `detector\quitar_inicio_automatico.bat`.

**Importante para la exposición:** si la PC del profesor impide instalar o ejecutar software no firmado, no intentes desactivar su antivirus. Usa el análisis básico o «Cargar informe JSON». Chrome/Edge pueden pedir permisos adicionales; su compatibilidad no es universal. El detector solo funciona en Windows 10/11 con PowerShell y CIM disponibles.

## Publicar en Render

1. Sube el contenido del proyecto a un repositorio GitHub. **Nunca subas `.env`**: está ignorado por Git.
2. En Render, conecta el repositorio como servicio web Python, o usa el archivo `render.yaml` incluido.
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 90 app:app`
5. En **Environment**, define `GEMINI_API_KEY` con tu clave real. `GEMINI_MODEL` usa por defecto `gemini-3.5-flash-lite`; si tu cuenta tiene otro modelo habilitado, cambia esa variable. `ENABLE_GOOGLE_SEARCH=0` por defecto (activar grounding puede consumir cuota).
6. Si cambias el dominio del servicio, agrega ese dominio a los orígenes autorizados de `detector\detector_windows.py` antes de volver a compilar el detector. El ZIP viene configurado para `https://connectpc-ia.onrender.com`.

## Requisitos de juegos

ConnectPC busca en la **API pública de Steam** cuando detecta una consulta sobre un videojuego. Si Steam no devuelve una ficha de PC verificable, lo indica; la IA puede dar orientación general, pero no debe presentar requisitos no comprobados como oficiales. El proyecto **no** necesita un JSON escrito manualmente para cada videojuego. La compatibilidad y los FPS son *orientativos*, no una prueba real del juego.

## Archivos principales

- `app.py`: Flask y endpoints `/api/chat`, `/api/juegos/requisitos`, `/api/estado`.
- `core/assistant.py`: integración Gemini y respuestas en modo demostración cuando no hay clave.
- `core/games.py`: búsqueda y requisitos publicados en Steam.
- `core/hardware.py`: validación de informes de hardware.
- `templates/index.html`, `static/style.css`, `static/chat.js`: interfaz y chatbot.
- `static/img/`: ilustraciones vectoriales propias para la tienda.
- `detector/detector_windows.py`: detector Windows con autorización por solicitud.
- `detector/crear_exe.bat`: compilación del ejecutable en Windows mediante PyInstaller.
- `detector/instalar_inicio_automatico.bat` y `quitar_inicio_automatico.bat`: inicio automático **voluntario** y reversión.

## Seguridad y limitaciones

- La API Key de Gemini debe permanecer **en el servidor**; no se incluye en los archivos JS ni en el detector.
- El detector escucha únicamente en `127.0.0.1:8765`, exige un origen permitido y confirma **cada lectura** en Windows.
- Para responder sobre tu hardware, el navegador puede compartir el informe autorizado con el servidor y con Gemini. **No se leen archivos personales ni números de serie.**
- La revisión sin detector solo expone lo que el navegador permita (núcleos lógicos, memoria aproximada si existe, datos WebGL si están disponibles).
- El ZIP **contiene el código y el script para crear el EXE, pero NO incluye un EXE Windows precompilado**: debe generarse en Windows.
- Prototipo educativo. Los botones de catálogo son demostrativos y no realizan compras.

## Solución rápida de problemas

- **No responde la IA:** revisa `GEMINI_API_KEY` en `.env` o en las variables de Render; visita `/api/estado` para comprobar si hay una clave cargada.
- **Error de modelo 404:** selecciona en `GEMINI_MODEL` un modelo accesible para tu cuenta. No modifiques el código para cambiarlo.
- **No detecta la PC exacta:** comprueba que el EXE esté abierto, que sea Windows y que el navegador permita la conexión local; usa la importación de JSON si está bloqueado.
- **Puerto 8765 ocupado:** cierra otras copias de ConnectPC Detector y vuelve a abrir una sola.
- **Requisitos de Steam no disponibles:** la API puede fallar, estar bloqueada o no incluir ese juego; el asistente lo señalará.
