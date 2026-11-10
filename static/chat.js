"use strict";

// ConnectPC - frontend sin frameworks. El navegador no puede leer CPU/GPU exactas
// sin un programa local autorizado; los datos basicos se etiquetan como tales.
(() => {
  const $ = (id) => document.getElementById(id);
  const panel = $("chat-panel");
  const overlay = $("chat-overlay");
  const fab = $("chat-fab");
  const messages = $("chat-messages");
  const chatInput = $("chat-input");
  const sendButton = $("chat-send");
  const form = $("chat-form");
  const gameInput = $("game-input");
  const fileInput = $("report-file");
  const toast = $("toast");
  const ENDPOINT_LOCAL = "http://127.0.0.1:8765/analizar";
  const state = { equipo: null, historial: [], enviando: false, analizando: false, abierto: false };
  let toastTimer = null;
  let linkDetector = "";

  function notificar(texto, tipo = "ok", duracion = 6000) {
    clearTimeout(toastTimer);
    toast.textContent = texto;
    toast.className = "toast" + (tipo === "ok" ? "" : " " + tipo);
    toast.hidden = false;
    if (duracion > 0) toastTimer = setTimeout(() => { toast.hidden = true; }, duracion);
  }

  function abrirChat() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    overlay.hidden = false;
    fab.setAttribute("aria-expanded", "true");
    state.abierto = true;
    if (window.innerWidth < 621) fab.hidden = true;
    setTimeout(() => chatInput.focus({ preventScroll: true }), 80);
  }

  function cerrarChat() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    overlay.hidden = true;
    fab.setAttribute("aria-expanded", "false");
    fab.hidden = false;
    state.abierto = false;
  }

  function fragmentoTexto(texto, nodo) {
    // Negritas basicas con nodos DOM; nunca se inserta HTML del modelo.
    const partes = String(texto).split(/(\*\*[^*]{1,160}\*\*)/g);
    for (const parte of partes) {
      if (parte.startsWith("**") && parte.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = parte.slice(2, -2);
        nodo.appendChild(strong);
      } else {
        nodo.appendChild(document.createTextNode(parte));
      }
    }
  }

  function addMessage(texto, role = "bot", fuentes = []) {
    const item = document.createElement("div");
    item.className = "message " + role;
    const bubble = document.createElement("span");
    bubble.className = "bubble";
    fragmentoTexto(texto, bubble);
    item.appendChild(bubble);
    if (role === "bot" && Array.isArray(fuentes) && fuentes.length) {
      const lista = document.createElement("div");
      lista.className = "sources";
      for (const fuente of fuentes.slice(0, 5)) {
        if (!fuente || typeof fuente.url !== "string" || !fuente.url.startsWith("https://")) continue;
        const enlace = document.createElement("a");
        enlace.href = fuente.url;
        enlace.target = "_blank";
        enlace.rel = "noopener noreferrer";
        enlace.textContent = fuente.titulo || "Consultar fuente";
        lista.appendChild(enlace);
      }
      if (lista.childNodes.length) bubble.appendChild(lista);
    }
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return { item, bubble };
  }

  function addTyping() {
    const item = document.createElement("div");
    item.className = "message bot";
    const bubble = document.createElement("span");
    bubble.className = "bubble";
    bubble.setAttribute("aria-label", "ConnectPC est\u00e1 escribiendo");
    const anim = document.createElement("span");
    anim.className = "typing";
    for (let i = 0; i < 3; i += 1) anim.appendChild(document.createElement("i"));
    bubble.appendChild(anim);
    item.appendChild(bubble);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function resumenEquipo(equipo) {
    if (equipo.formato === "connectpc-hardware-v1") {
      return [
        "Procesador: " + (equipo.procesador || "No identificado"),
        "Gr\u00e1ficos: " + ((equipo.graficas || []).join(", ") || "No identificados"),
        "RAM: " + (equipo.ram_gb ? equipo.ram_gb + " GB" : "Sin dato"),
        "Sistema: " + (equipo.sistema_operativo || "Sin dato"),
      ].join("\n");
    }
    return [
      "N\u00facleos l\u00f3gicos (reportados por navegador): " + (equipo.nucleos_logicos || "Sin dato"),
      "RAM aproximada: " + (equipo.ram_aproximada_gb ? equipo.ram_aproximada_gb + " GB" : "No disponible"),
      "Gr\u00e1ficos WebGL: " + (equipo.gpu_webgl || "No disponibles"),
      "Plataforma: " + (equipo.plataforma || "No disponible"),
    ].join("\n");
  }

  function renderEquipo(equipo, aviso = "") {
    state.equipo = equipo;
    const exacto = equipo && equipo.formato === "connectpc-hardware-v1";
    const badge = $("hw-badge");
    badge.className = "hw-badge" + (equipo ? (exacto ? " full" : " basic") : "");
    badge.textContent = equipo ? (exacto ? "DETECCI\u00d3N COMPLETA" : "REVISI\u00d3N B\u00c1SICA") : "SIN ANALIZAR";
    $("hw-cpu").textContent = equipo ? (exacto ? equipo.procesador : (equipo.nucleos_logicos || "?") + " n\u00facleos l\u00f3gicos") : "Sin identificar";
    $("hw-gpu").textContent = equipo ? (exacto ? (equipo.graficas || []).join(" / ") : equipo.gpu_webgl) || "No identificado" : "Sin identificar";
    $("hw-ram").textContent = equipo ? (exacto ? (equipo.ram_gb ? equipo.ram_gb + " GB" : "Sin dato") : (equipo.ram_aproximada_gb ? "~" + equipo.ram_aproximada_gb + " GB" : "No disponible")) : "Sin identificar";
    $("hw-os").textContent = equipo ? (exacto ? equipo.sistema_operativo : equipo.plataforma) || "No disponible" : "Sin identificar";
    $("hardware-hint").textContent = aviso || (equipo ? (exacto ? "Datos obtenidos con permiso desde el detector de Windows. No se incluye informaci\u00f3n personal." : "Estos datos del navegador son aproximados: no identifican de forma fiable CPU, GPU ni RAM exactas.") : "Pulsa 'Analizar mi PC' para comenzar.");
  }

  function validarInforme(raw) {
    if (!raw || typeof raw !== "object") return null;
    const equipo = raw.equipo && typeof raw.equipo === "object" ? raw.equipo : raw;
    if (equipo.formato !== "connectpc-hardware-v1") return null;
    if (typeof equipo.procesador !== "string" || !Array.isArray(equipo.graficas)) return null;
    return {
      formato: "connectpc-hardware-v1",
      procesador: equipo.procesador.slice(0, 140),
      ram_gb: Number.isFinite(Number(equipo.ram_gb)) && Number(equipo.ram_gb) > 0 ? Number(equipo.ram_gb) : null,
      graficas: equipo.graficas.filter((v) => typeof v === "string").slice(0, 5).map((v) => v.slice(0, 140)),
      sistema_operativo: typeof equipo.sistema_operativo === "string" ? equipo.sistema_operativo.slice(0, 140) : "No identificado",
      fuente: "informe_usuario",
    };
  }

  function informeNavegador() {
    let renderer = "No disponible";
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "No disponible").slice(0, 140);
      }
    } catch (_err) { /* bloqueado por navegador */ }
    return {
      formato: "connectpc-browser-v1",
      nucleos_logicos: Number.isInteger(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null,
      ram_aproximada_gb: Number.isFinite(navigator.deviceMemory) ? navigator.deviceMemory : null,
      gpu_webgl: renderer,
      plataforma: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "No disponible",
    };
  }

  async function analizarPC() {
    if (state.analizando) return;
    state.analizando = true;
    document.querySelectorAll('[data-action="analyze"]').forEach((b) => { b.disabled = true; });
    notificar("Buscando el detector seguro de ConnectPC en esta computadora...", "ok", 0);
    const aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), 40000);
    try {
      // Chrome/Edge moderno: declara explicitamente que apunta a loopback.
      // El navegador decide si debe pedir permiso de acceso a red local.
      const respuesta = await fetch(ENDPOINT_LOCAL, {
        method: "POST",
        mode: "cors",
        targetAddressSpace: "loopback",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "analizar" }),
        signal: aborter.signal,
      });
      let datos = {};
      try { datos = await respuesta.json(); } catch (_err) { /* sin cuerpo JSON */ }
      if (!respuesta.ok || !datos.equipo) throw new Error(datos.error || "Detector no disponible");
      const validado = validarInforme(datos.equipo);
      if (!validado) throw new Error("El detector devolvi\u00f3 un informe inv\u00e1lido");
      renderEquipo(validado);
      notificar("Equipo detectado: CPU, gr\u00e1ficos, RAM y sistema operativo listos para la IA.");
      if (state.abierto) addMessage("An\u00e1lisis completo autorizado.\n\n" + resumenEquipo(validado) + "\n\nYa puedes preguntarme si tu PC corre un juego.", "bot");
      return validado;
    } catch (err) {
      const basico = informeNavegador();
      renderEquipo(basico, "Revisi\u00f3n b\u00e1sica: los datos son aproximados. Para detectar modelos exactos, instala e inicia ConnectPC Detector en Windows y permite el acceso local del navegador.");
      notificar("Revisi\u00f3n b\u00e1sica completada. El detector completo no est\u00e1 conectado. Puedes seguir usando la IA.", "warning", 10500);
      if (state.abierto) addMessage(
        "No se pudo conectar con ConnectPC Detector. He realizado una **revisi\u00f3n b\u00e1sica** con la informaci\u00f3n que permite el navegador:\n\n" +
        resumenEquipo(basico) +
        "\n\n**Importante:** esto no identifica necesariamente el modelo exacto del procesador, de la GPU ni la RAM f\u00edsica. Para el an\u00e1lisis completo necesitas instalar y autorizar el detector Windows." +
        (linkDetector ? "\n\nEnlace de descarga configurado en la web." : "\n\nEl ZIP del proyecto incluye los archivos para crear e instalar el detector."),
        "bot",
        linkDetector ? [{ titulo: "Descargar detector Windows", url: linkDetector }] : []
      );
      console.info("ConnectPC: detector no accesible", err && err.message);
      return basico;
    } finally {
      clearTimeout(timeout);
      state.analizando = false;
      document.querySelectorAll('[data-action="analyze"]').forEach((b) => { b.disabled = false; });
    }
  }

  async function cargarInforme() {
    const fichero = fileInput.files && fileInput.files[0];
    if (!fichero) return;
    if (fichero.size > 32 * 1024) {
      notificar("El informe debe ser un JSON peque\u00f1o (m\u00e1ximo 32 KB).", "error");
      fileInput.value = "";
      return;
    }
    try {
      const datos = JSON.parse(await fichero.text());
      const equipo = validarInforme(datos);
      if (!equipo) throw new Error("Faltan los campos formato, procesador o graficas.");
      renderEquipo(equipo, "Informe cargado por ti. No se ha realizado una detecci\u00f3n independiente.");
      notificar("Informe importado correctamente. Ahora puedes comparar juegos con la IA.");
      if (state.abierto) addMessage("Informe cargado:\n\n" + resumenEquipo(equipo), "bot");
    } catch (_err) {
      notificar("No es un informe ConnectPC v\u00e1lido. Utiliza el JSON generado por nuestro detector.", "error");
    }
    fileInput.value = "";
  }

  async function enviarMensaje(mensaje, opciones = {}) {
    const texto = String(mensaje || "").trim();
    if (!texto || state.enviando) return;
    state.enviando = true;
    sendButton.disabled = true;
    abrirChat();
    addMessage(texto, "user");
    const escribiendo = addTyping();
    const historialAnterior = state.historial.slice(-12);
    try {
      const respuesta = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: texto,
          historial: historialAnterior,
          equipo: state.equipo,
          juego: opciones.juego || undefined,
        }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok || typeof datos.respuesta !== "string") {
        throw new Error(datos.error || "No se pudo consultar el asistente.");
      }
      const fuentes = Array.isArray(datos.fuentes) ? [...datos.fuentes] : [];
      if (datos.juego && datos.juego.url && datos.juego.verificado) {
        fuentes.unshift({ titulo: "Requisitos en Steam: " + datos.juego.nombre, url: datos.juego.url });
      }
      escribiendo.remove();
      addMessage(datos.respuesta, "bot", fuentes);
      state.historial.push({ role: "user", text: texto }, { role: "model", text: datos.respuesta });
      state.historial = state.historial.slice(-12);
      if (datos.modo === "demo") notificar("Modo demostraci\u00f3n: configura GEMINI_API_KEY para activar la IA.", "warning", 6500);
    } catch (err) {
      escribiendo.remove();
      addMessage("No pude procesar esa consulta. " + (err && err.message ? err.message : "Verifica la conexi\u00f3n e int\u00e9ntalo de nuevo."), "bot");
    } finally {
      state.enviando = false;
      sendButton.disabled = false;
      chatInput.focus({ preventScroll: true });
    }
  }

  async function consultarJuego(nombre) {
    const campo = $("game-result");
    campo.textContent = "Buscando requisitos publicados en Steam...";
    try {
      const respuesta = await fetch("/api/juegos/requisitos?nombre=" + encodeURIComponent(nombre));
      const datos = await respuesta.json();
      if (datos.encontrado && datos.juego) {
        const juego = datos.juego;
        campo.textContent = juego.verificado
          ? "Encontrado: " + juego.nombre + ". Consulta los requisitos m\u00ednimos y recomendados en la respuesta de IA. "
          : "Encontrado: " + juego.nombre + ". La ficha no publica requisitos de PC verificables. ";
        const link = document.createElement("a");
        link.href = juego.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Ver ficha oficial en Steam";
        campo.appendChild(link);
      } else {
        campo.textContent = "No se localiz\u00f3 ficha fiable en Steam. Aun as\u00ed, la IA intentar\u00e1 orientarte sin fingir requisitos verificados.";
      }
    } catch (_err) {
      campo.textContent = "Steam no respondi\u00f3. Puedes continuar con la IA, pero los requisitos no se han verificado.";
    }
  }

  document.querySelectorAll("[data-action]").forEach((elemento) => {
    elemento.addEventListener("click", () => {
      const accion = elemento.dataset.action;
      if (accion === "open-chat") abrirChat();
      if (accion === "analyze") analizarPC();
      if (accion === "upload") fileInput.click();
    });
  });
  document.querySelectorAll("[data-prompt]").forEach((elemento) => {
    elemento.addEventListener("click", () => enviarMensaje(elemento.dataset.prompt));
  });

  fab.addEventListener("click", abrirChat);
  $("chat-close").addEventListener("click", cerrarChat);
  overlay.addEventListener("click", cerrarChat);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.abierto) cerrarChat(); });
  fileInput.addEventListener("change", cargarInforme);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const mensaje = chatInput.value.trim();
    if (!mensaje || state.enviando) return;
    chatInput.value = "";
    chatInput.style.height = "";
    enviarMensaje(mensaje);
  });
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(100, chatInput.scrollHeight) + "px";
  });
  $("chat-reset").addEventListener("click", () => {
    state.historial = [];
    messages.replaceChildren();
    addMessage("Conversaci\u00f3n reiniciada. Puedes hacer una nueva pregunta. Los datos de la PC siguen disponibles hasta que recargues la p\u00e1gina.", "bot");
  });

  $("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const valor = $("search-input").value.trim();
    if (valor) enviarMensaje(valor);
    $("search-input").value = "";
  });

  $("game-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const nombre = gameInput.value.trim();
    if (!nombre) return;
    consultarJuego(nombre);
    enviarMensaje(
      "\u00bfMi PC puede ejecutar " + nombre + "? Compara los requisitos del juego con mi hardware. " +
      "Distingue lo confirmado de lo desconocido y no inventes FPS.",
      { juego: nombre }
    );
  });

  const menuToggle = $("menu-toggle");
  menuToggle.addEventListener("click", () => {
    const abierto = $("nav-links").classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(abierto));
  });
  document.querySelectorAll(".nav-links a").forEach((enlace) => {
    enlace.addEventListener("click", () => {
      $("nav-links").classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });

  fetch("/api/estado")
    .then((r) => r.ok ? r.json() : Promise.reject(new Error("Sin servicio")))
    .then((datos) => {
      $("ai-label").textContent = datos.ia_activa ? "Gemini conectado" : "Modo demostraci\u00f3n";
      $("ai-subtitle").textContent = datos.ia_activa ? "Asesor tech disponible" : "Configura tu API Key";
      if (typeof datos.detector_url === "string" && datos.detector_url.startsWith("https://")) {
        linkDetector = datos.detector_url;
      }
    })
    .catch(() => {
      $("ai-label").textContent = "Servicio no disponible";
      $("ai-subtitle").textContent = "Intenta actualizar";
    });
})();
