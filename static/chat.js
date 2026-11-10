
const chatToggle = document.getElementById("chat-toggle");
const chatWindow = document.getElementById("chat-window");
const chatClose = document.getElementById("chat-close");
const chatSend = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

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

function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

// =======================================
// DETECTAR PREGUNTAS SOBRE RENDIMIENTO
// =======================================

function necesitaAnalizarPC(mensaje) {
    const texto = normalizar(mensaje);

    const mencionaSuEquipo =
        /\b(mi|mis|esta|este)\s+(pc|laptop|computadora|notebook|equipo|maquina)\b/
        .test(texto);

    const preguntaRendimiento =
        /\b(corre|correr|correra|corra|soporta|soporte|soportara|aguanta|aguantara|jugar|juega|ejecutar|ejecuta|fps|rendimiento|funciona|funcionara)\b/
        .test(texto);

    const preguntaDirecta =
        /\b(puedo|podre|podria)\s+(correr|jugar|ejecutar)\b/
        .test(texto);

    const preguntaJuegos =
        /\b(que|cuales)\s+juegos\s+(puedo|me)\b/
        .test(texto);

    const meCorre =
        /\bme\s+(corre|correra|funciona|funcionara|aguanta)\b/
        .test(texto);

    return (
        (mencionaSuEquipo && preguntaRendimiento) ||
        preguntaDirecta ||
        preguntaJuegos ||
        meCorre
    );
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
// =======================================

async function detectarConPermiso() {
    const autorizado = window.confirm(
        "ConnectPC necesita analizar los componentes " +
        "de esta computadora.\n\n" +
        "Se consultarán CPU, GPU, RAM y Windows.\n\n" +
        "¿Autorizas el análisis?"
    );

    if (!autorizado) {
        addMessage(
            "No se realizó el análisis. " +
            "Puedes continuar preguntando sin compartir tu hardware.",
            "bot"
        );
        return false;
    }

    const esLocal = [
        "localhost",
        "127.0.0.1"
    ].includes(window.location.hostname);

    if (!esLocal) {
        addMessage(
            "La detección automática solo está disponible " +
            "cuando ConnectPC se ejecuta en tu propia PC.\n\n" +
            "En la versión web, utiliza '📂 Cargar informe' " +
            "para compartir un reporte generado localmente.",
            "bot"
        );
        return false;
    }

    const estado = addMessage(
        "🔍 Analizando los componentes de tu PC...",
        "bot"
    );

    try {
        const respuesta = await fetch("/api/detectar-pc", {
            method: "POST",
            headers: {
                "X-ConnectPC-Consent": "si"
            }
        });

        const datos = await respuesta.json();

        if (!respuesta.ok || !datos.equipo) {
            throw new Error(
                datos.error || "No se pudo detectar el hardware."
            );
        }

        equipoActual = validarEquipo(datos.equipo);

        estado.textContent =
            "✅ Análisis completado.\n\n" +
            resumenEquipo(equipoActual) +
            "\n\nAhora analizaré tu consulta.";

        return true;

    } catch (error) {
        estado.textContent =
            "No pude analizar automáticamente tu PC.\n\n" +
            error.message +
            "\n\nTambién puedes utilizar '📂 Cargar informe'.";

        return false;
    }
}

// =======================================
// CONSULTAR GEMINI
// =======================================

async function consultarGemini(mensaje, burbujaExistente = null) {
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
                equipo: equipoActual
            })
        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                datos.error || "No se pudo consultar Gemini."
            );
        }

        // Si Python pide analizar la PC, solicitar
        // permiso y continuar la misma pregunta.
        if (datos.requiere_analisis && !equipoActual) {
            visual.textContent = datos.respuesta;
            preguntaPendiente = mensaje;

            const detectado = await detectarConPermiso();

            if (detectado) {
                preguntaPendiente = null;

                visual.textContent =
                    "Comparando los componentes con tu consulta...";

                await consultarGemini(mensaje, visual);
            }

            return;
        }

        if (!datos.respuesta) {
            throw new Error("Gemini devolvió una respuesta vacía.");
        }

        visual.textContent = datos.respuesta;

        // Guardar conversación con contexto
        historial.push(
            { role: "user", text: mensaje },
            { role: "model", text: datos.respuesta }
        );

        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {
        visual.textContent =
            "Ocurrió un problema: " + error.message;
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
        if (!equipoActual && necesitaAnalizarPC(mensaje)) {
            preguntaPendiente = mensaje;

            const detectado = await detectarConPermiso();

            if (!detectado) return;

            preguntaPendiente = null;
        }

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
        const detectado = await detectarConPermiso();

        if (detectado && preguntaPendiente) {
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

    addMessage(
        "¡Hola! 👋 Soy ConnectPC.\n\n" +
        "Puedo ayudarte con hardware, software, " +
        "videojuegos y diagnósticos de computadoras.\n\n" +
        "Si necesitas comprobar un juego, " +
        "te pediré autorización para analizar tu PC.",
        "bot"
    );

    chatInput.value = "";
    bloquearChat(false);
    chatInput.focus();
});

// =======================================
// EVENTOS PRINCIPALES
// =======================================

chatToggle.addEventListener("click", openChat);
chatClose.addEventListener("click", closeChat);

chatSend.addEventListener("click", () => {
    const mensaje = chatInput.value.trim();
    chatInput.value = "";

    procesarPregunta(mensaje);
});

chatInput.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.isComposing) {
        evento.preventDefault();

        const mensaje = chatInput.value.trim();
        chatInput.value = "";

        procesarPregunta(mensaje);
    }
});

bloquearChat(false);
