
const chatToggle = document.getElementById("chat-toggle");
const chatWindow = document.getElementById("chat-window");
const chatClose = document.getElementById("chat-close");
const chatSend = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");

// Memoria de la conversación
const historial = [];
let enviando = false;

// Mostrar mensajes en el chatbot
function addMessage(texto, tipo) {
    const div = document.createElement("div");

    div.className = `message ${tipo}`;
    div.textContent = texto;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return div;
}

// Abrir ventana del chatbot
function openChat() {
    chatWindow.classList.add("open");
    chatToggle.style.display = "none";
    chatInput.focus();
}

// Cerrar sin borrar la conversación
function closeChat() {
    chatWindow.classList.remove("open");
    chatToggle.style.display = "block";
}

// Enviar pregunta a Gemini mediante Flask
async function sendMessage() {
    const mensaje = chatInput.value.trim();

    if (!mensaje || enviando) {
        return;
    }

    enviando = true;
    chatSend.disabled = true;

    addMessage(mensaje, "user");
    chatInput.value = "";

    const respuestaVisual = addMessage(
        "ConnectPC está pensando...",
        "bot"
    );

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                mensaje: mensaje,
                historial: historial.slice(-16)
            })
        });

        const data = await response.json();

        if (!response.ok || !data.respuesta) {
            throw new Error(
                data.error || "No se obtuvo respuesta de la IA."
            );
        }

        // Mostrar respuesta real de Gemini
        respuestaVisual.textContent = data.respuesta;

        // Guardar pregunta y respuesta para recordar el contexto
        historial.push(
            {
                role: "user",
                text: mensaje
            },
            {
                role: "model",
                text: data.respuesta
            }
        );

    } catch (error) {
        respuestaVisual.textContent =
            "No pude responder en este momento. " +
            error.message;

    } finally {
        enviando = false;
        chatSend.disabled = false;

        chatMessages.scrollTop = chatMessages.scrollHeight;
        chatInput.focus();
    }
}

// Eventos
chatToggle.addEventListener("click", openChat);
chatClose.addEventListener("click", closeChat);
chatSend.addEventListener("click", sendMessage);

// Enviar presionando Enter
chatInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        sendMessage();
    }
});
