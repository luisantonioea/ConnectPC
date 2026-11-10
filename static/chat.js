
const chatToggle = document.getElementById("chat-toggle");
const chatWindow = document.getElementById("chat-window");
const chatClose = document.getElementById("chat-close");
const chatSend = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

// El saludo se define una sola vez, en index.html
const saludoInicial = chatMessages.firstElementChild.textContent.trim();

const historial = [];

let equipoActual = null;
let enviando = false;
let preguntaPendiente = null;

// =======================================
// MENSAJES Y VENTANA
// =======================================

function addMessage(texto, tipo) {
    const div = document.createElement("div");
    div.className = "message " + tipo;
    div.textContent = texto;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return div;
}

// Muestra texto plano en una burbuja del bot
function mostrarTexto(burbuja, texto) {
    burbuja.className = "message bot";
    burbuja.textContent = texto;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Muestra la respuesta de Gemini con formato markdown.
// DOMPurify limpia el HTML; si las librerías no cargaron
// (sin internet), se muestra como texto plano.
function mostrarRespuesta(burbuja, texto, fuentes = []) {
    if (window.marked && window.DOMPurify) {
        burbuja.className = "message bot md";
        burbuja.innerHTML = DOMPurify.sanitize(
            marked.parse(texto, { breaks: true })
        );
    } else {
        mostrarTexto(burbuja, texto);
    }

    const validas = fuentes.filter(
        f => /^https?:\/\//.test(f.url)
    );

    if (validas.length) {
        const bloque = document.createElement("div");
        bloque.className = "fuentes";
        bloque.append("Fuentes consultadas:");

        for (const f of validas) {
            const enlace = document.createElement("a");
            enlace.href = f.url;
            enlace.textContent = f.titulo;
            enlace.target = "_blank";
            enlace.rel = "noopener noreferrer";
            bloque.append(enlace);
        }

        burbuja.append(bloque);
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

if (window.DOMPurify) {
    // Los enlaces de las respuestas se abren en otra pestaña
    DOMPurify.addHook("afterSanitizeAttributes", (nodo) => {
        if (nodo.tagName === "A") {
            nodo.setAttribute("target", "_blank");
            nodo.setAttribute("rel", "noopener noreferrer");
        }
    });
}

// Pantalla completa del chat (Esc para salir)
const chatFull = document.getElementById("chat-full");

function pantallaCompleta(activa) {
    chatWindow.classList.toggle("fullscreen", activa);
    chatFull.textContent = activa ? "🗗" : "⛶";
    chatFull.title = activa ? "Salir de pantalla completa" : "Pantalla completa";
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatFull.addEventListener("click", () => {
    pantallaCompleta(!chatWindow.classList.contains("fullscreen"));
});

document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") pantallaCompleta(false);
});

function openChat() {
    chatWindow.classList.add("open");
    chatToggle.style.display = "none";
    chatInput.focus();
}

function closeChat() {
    chatWindow.classList.remove("open");
    chatToggle.style.display = "block";
}

// =======================================
// BOTONES DEL CHAT
// =======================================

const herramientas = document.createElement("div");

herramientas.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px;
    background: #f5f8f5;
    border-top: 1px solid #dddddd;
`;

function crearBoton(nombre) {
    const boton = document.createElement("button");

    boton.type = "button";
    boton.textContent = nombre;

    boton.style.cssText = `
        border: 1px solid #008e39;
        border-radius: 7px;
        padding: 8px;
        background: white;
        color: #007b33;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
    `;

    return boton;
}

const botonAnalizar = crearBoton("🖥️ Analizar mi PC");
const botonArchivo = crearBoton("📂 Cargar informe");
const botonQuitar = crearBoton("✕ Quitar datos");
const botonNuevo = crearBoton("↻ Nuevo chat");

const selector = document.createElement("input");
selector.type = "file";
selector.accept = ".json,application/json";
selector.style.display = "none";

herramientas.append(
    botonAnalizar,
    botonArchivo,
    botonQuitar,
    botonNuevo,
    selector
);

const zonaEntrada = chatWindow.querySelector(".chat-input-area");

chatWindow.insertBefore(herramientas, zonaEntrada);

// Mostrar u ocultar la barra de botones (se recuerda en el navegador)
function mostrarHerramientas(visible) {
    herramientas.style.display = visible ? "flex" : "none";

    try {
        localStorage.setItem("connectpc-herramientas", visible ? "1" : "0");
    } catch (e) { /* sin almacenamiento: se ignora */ }
}

document.getElementById("chat-tools").addEventListener("click", () => {
    mostrarHerramientas(herramientas.style.display === "none");
});

try {
    if (localStorage.getItem("connectpc-herramientas") === "0") {
        mostrarHerramientas(false);
    }
} catch (e) { /* sin almacenamiento: barra visible */ }

// =======================================
// CONTROL DEL CHAT
// =======================================

function bloquearChat(estado) {
    enviando = estado;

    chatSend.disabled = estado;
    botonAnalizar.disabled = estado;
    botonArchivo.disabled = estado;
    botonNuevo.disabled = estado;

    botonQuitar.disabled = estado || equipoActual === null;
}

// =======================================
// VALIDAR INFORME
// =======================================

function validarEquipo(datos) {
    if (
        !datos ||
        datos.formato !== "connectpc-hardware-v1" ||
        typeof datos.procesador !== "string" ||
        typeof datos.sistema_operativo !== "string" ||
        !Array.isArray(datos.graficas)
    ) {
        throw new Error("Informe de hardware inválido.");
    }

    const ram = Number(datos.ram_gb);

    if (!Number.isFinite(ram) || ram <= 0 || ram > 1024) {
        throw new Error("La memoria RAM no es válida.");
    }

    return {
        formato: "connectpc-hardware-v1",
        procesador: datos.procesador.slice(0, 150),
        ram_gb: ram,
        graficas: datos.graficas
            .filter(gpu => typeof gpu === "string")
            .slice(0, 5)
            .map(gpu => gpu.slice(0, 150)),
        sistema_operativo: datos.sistema_operativo.slice(0, 150)
    };
}

function resumenEquipo(equipo) {
    return (
        "CPU: " + equipo.procesador + "\n" +
        "RAM: " + equipo.ram_gb + " GB\n" +
        "GPU: " + equipo.graficas.join(", ") + "\n" +
        "Sistema: " + equipo.sistema_operativo
    );
}

// =======================================
// DETECCION AUTOMATICA CON PERMISO
// Devuelve "ok", "rechazado" o "error".
// =======================================

async function detectarConPermiso() {

    const autorizado = window.confirm(
        "ConnectPC necesita analizar los componentes " +
        "de esta computadora.\n\n" +
        "Se consultarán:\n" +
        "• Procesador\n" +
        "• Memoria RAM\n" +
        "• Tarjetas gráficas\n" +
        "• Sistema operativo\n\n" +
        "Estos datos se enviarán a Gemini (Google) junto con " +
        "tus preguntas hasta que pulses «Quitar datos». " +
        "No se guardan en disco.\n\n" +
        "¿Autorizas el análisis?"
    );

    if (!autorizado) {
        addMessage(
            "No autorizaste el análisis. " +
            "Responderé con información general, sin usar tu equipo.",
            "bot"
        );
        return "rechazado";
    }

    const esLocal = (
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "localhost"
    );

    if (!esLocal) {
        addMessage(
            "⚠️ La detección automática solo funciona ejecutando " +
            "ConnectPC en tu propia PC con Windows.\n\n" +
            "Puedes usar '📂 Cargar informe' con el archivo " +
            "reporte_pc.json.",
            "bot"
        );
        return "error";
    }

    const estado = addMessage(
        "🔍 ConnectPC está analizando tu computadora...",
        "bot"
    );

    try {
        const respuesta = await fetch("/api/detectar-pc", {
            method: "POST",
            headers: { "X-ConnectPC-Consent": "si" }
        });

        const datos = await respuesta.json();

        if (!respuesta.ok || !datos.equipo) {
            throw new Error(
                datos.error ||
                "No fue posible obtener los componentes."
            );
        }

        equipoActual = validarEquipo(datos.equipo);

        estado.textContent =
            "✅ Análisis completado.\n\n" +
            resumenEquipo(equipoActual) +
            "\n\nAhora analizaré tu pregunta " +
            "utilizando estos componentes.";

        return "ok";

    } catch (error) {

        estado.textContent = (
            "⚠️ No pude analizar tu PC: " + error.message +
            "\n\nComprueba que Flask esté ejecutándose en Windows " +
            "o usa '📂 Cargar informe'."
        );

        console.error("ConnectPC detector:", error);

        return "error";
    }
}

// =======================================
// CONSULTAR GEMINI
// =======================================

async function consultarGemini(
    mensaje, burbujaExistente = null, omitirAnalisis = false
) {
    const visual = burbujaExistente || addMessage(
        "🤖 ConnectPC está analizando tu pregunta...",
        "bot"
    );

    try {
        const respuesta = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                mensaje: mensaje,
                historial: historial.slice(-16),
                equipo: equipoActual,
                omitir_analisis: omitirAnalisis
            })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                datos.error || "No se pudo consultar Gemini."
            );
        }

        // El servidor pide analizar la PC: se solicita permiso
        // y se continúa con la misma pregunta.
        if (datos.requiere_analisis && !equipoActual) {
            mostrarTexto(visual, datos.respuesta);
            preguntaPendiente = mensaje;

            const resultado = await detectarConPermiso();

            if (resultado === "ok") {
                preguntaPendiente = null;

                mostrarTexto(
                    visual,
                    "Comparando los componentes con tu consulta..."
                );

                await consultarGemini(mensaje, visual);

            } else if (resultado === "rechazado") {
                // Sin permiso se responde igual, sin datos del equipo
                preguntaPendiente = null;

                mostrarTexto(
                    visual,
                    "🤖 ConnectPC está analizando tu pregunta..."
                );

                await consultarGemini(mensaje, visual, true);
            }

            return;
        }

        if (!datos.respuesta) {
            throw new Error("Gemini devolvió una respuesta vacía.");
        }

        mostrarRespuesta(visual, datos.respuesta, datos.fuentes || []);

        // Guardar conversación con contexto
        historial.push(
            { role: "user", text: mensaje },
            { role: "model", text: datos.respuesta }
        );

    } catch (error) {
        mostrarTexto(
            visual,
            "Ocurrió un problema: " + error.message
        );
    }
}

// =======================================
// PROCESAR PREGUNTA DEL USUARIO
// =======================================

async function procesarPregunta(mensaje, mostrar = true) {
    if (!mensaje || enviando) return;

    bloquearChat(true);

    if (mostrar) {
        addMessage(mensaje, "user");
    }

    try {
        await consultarGemini(mensaje);

    } finally {
        bloquearChat(false);
        chatInput.focus();
    }
}

// =======================================
// CARGAR INFORME MANUALMENTE
// =======================================

botonArchivo.addEventListener("click", () => {
    if (enviando) return;
    selector.click();
});

selector.addEventListener("change", async () => {
    const archivo = selector.files[0];

    if (!archivo) return;

    try {
        if (archivo.size > 20000) {
            throw new Error("El archivo es demasiado grande.");
        }

        const texto = await archivo.text();
        const informe = validarEquipo(JSON.parse(texto));

        const aceptado = window.confirm(
            "Componentes identificados:\n\n" +
            resumenEquipo(informe) +
            "\n\n¿Autorizas utilizar estos datos " +
            "en las consultas a Gemini?"
        );

        if (!aceptado) return;

        equipoActual = informe;

        addMessage(
            "✅ Informe cargado correctamente.\n\n" +
            resumenEquipo(informe),
            "bot"
        );

        bloquearChat(false);

        // Responder automáticamente una pregunta pendiente
        if (preguntaPendiente) {
            const pregunta = preguntaPendiente;
            preguntaPendiente = null;

            await procesarPregunta(pregunta, false);
        }

    } catch (error) {
        addMessage(
            "No se pudo cargar el informe: " + error.message,
            "bot"
        );

    } finally {
        selector.value = "";
    }
});

// =======================================
// ANALISIS MANUAL DESDE BOTON
// =======================================

botonAnalizar.addEventListener("click", async () => {
    if (enviando) return;

    bloquearChat(true);

    try {
        const resultado = await detectarConPermiso();

        if (resultado === "ok" && preguntaPendiente) {
            const pregunta = preguntaPendiente;
            preguntaPendiente = null;

            await consultarGemini(pregunta);
        }

    } finally {
        bloquearChat(false);
    }
});

// =======================================
// QUITAR DATOS DEL EQUIPO
// =======================================

botonQuitar.addEventListener("click", () => {
    if (enviando) return;

    equipoActual = null;
    preguntaPendiente = null;
    historial.length = 0;

    addMessage(
        "Datos del equipo retirados del contexto. " +
        "También se limpió la memoria enviada a Gemini.",
        "bot"
    );

    bloquearChat(false);
});

// =======================================
// NUEVO CHAT
// =======================================

botonNuevo.addEventListener("click", () => {
    if (enviando) return;

    equipoActual = null;
    preguntaPendiente = null;
    historial.length = 0;

    chatMessages.replaceChildren();

    addMessage(saludoInicial, "bot");

    chatInput.value = "";
    bloquearChat(false);
    chatInput.focus();
});

// =======================================
// EVENTOS PRINCIPALES
// =======================================

chatToggle.addEventListener("click", openChat);
chatClose.addEventListener("click", closeChat);

function enviarDesdeCaja() {
    const mensaje = chatInput.value.trim();
    chatInput.value = "";

    procesarPregunta(mensaje);
}

chatSend.addEventListener("click", enviarDesdeCaja);

chatInput.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.isComposing) {
        evento.preventDefault();
        enviarDesdeCaja();
    }
});

bloquearChat(false);
