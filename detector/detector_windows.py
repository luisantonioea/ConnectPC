"""ConnectPC Detector para Windows.

Servidor local HTTP limitado a 127.0.0.1. Exige origen conocido y solicita
consentimiento de Windows antes de leer CPU, GPU, RAM y sistema operativo.
No recoge seriales, usuarios, archivos, IP ni identificadores privados.
Se empaqueta en .exe desde Windows usando PyInstaller.
"""
from __future__ import annotations

import base64
import ctypes
import json
import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

PORT = 8765
HOST = "127.0.0.1"
ORIGENES_PERMITIDOS = {
    "https://connectpc-ia.onrender.com",
    "http://127.0.0.1:5000",
    "http://localhost:5000",
}
# Puedes agregar otro Render propio explicitamente, separado por comas.
for extra in os.getenv("CONNECTPC_ORIGINS", "").split(","):
    origen = extra.strip().rstrip("/")
    if origen.startswith("https://") and "/" not in origen[len("https://"):]:
        ORIGENES_PERMITIDOS.add(origen)

EVENTOS = queue.SimpleQueue()
PS_SCRIPT = r'''
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$p = Get-CimInstance Win32_Processor | Select-Object -First 1
$r = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
$g = @(Get-CimInstance Win32_VideoController | Where-Object {$_.Name} | ForEach-Object {$_.Name})
$s = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1
[PSCustomObject]@{
 formato = 'connectpc-hardware-v1'
 procesador = [string]$p.Name
 ram_gb = [math]::Round(($r.TotalPhysicalMemory / 1GB), 1)
 graficas = @($g)
 sistema_operativo = [string]$s.Caption
} | ConvertTo-Json -Compress -Depth 5
'''


def informe_windows():
    """Recoge solo cuatro especificaciones mediante PowerShell CIM."""
    if sys.platform != "win32":
        raise RuntimeError("La deteccion completa solo esta disponible en Windows.")
    comando = base64.b64encode(PS_SCRIPT.encode("utf-16le")).decode("ascii")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = subprocess.run(
        ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", comando],
        check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
        creationflags=flags, timeout=45,
    )
    texto = result.stdout.strip().lstrip("\ufeff")
    datos = json.loads(texto)
    if (not isinstance(datos, dict) or datos.get("formato") != "connectpc-hardware-v1"
            or not isinstance(datos.get("graficas"), list)):
        raise ValueError("La respuesta de Windows no contiene un informe valido.")
    return {
        "formato": "connectpc-hardware-v1",
        "procesador": str(datos.get("procesador", "No identificado"))[:140],
        "ram_gb": datos.get("ram_gb"),
        "graficas": [str(x)[:140] for x in datos["graficas"][:5]],
        "sistema_operativo": str(datos.get("sistema_operativo", "No identificado"))[:140],
        "fuente": "deteccion_windows",
    }


def pedir_permiso(origen):
    mensaje = (
        "La pagina ConnectPC solicita leer estos datos de esta PC:\n\n"
        "- Modelo del procesador\n"
        "- Memoria RAM total\n"
        "- Nombres de las tarjetas graficas\n"
        "- Version de Windows\n\n"
        "El navegador recibira este informe y puede enviarlo al servicio "
        "ConnectPC / Gemini para responder consultas.\n\n"
        "Sitio solicitante:\n" + origen + "\n\n"
        "No se leeran archivos personales ni numeros de serie.\n"
        "Quieres permitir el analisis?"
    )
    # MB_YESNO | MB_ICONQUESTION | MB_TOPMOST. 6 significa YES.
    return ctypes.windll.user32.MessageBoxW(
        0, mensaje, "ConnectPC - Autorizacion de hardware", 0x00000004 | 0x00000020 | 0x00040000
    ) == 6


class ServidorLocal(BaseHTTPRequestHandler):
    server_version = "ConnectPCDetector/2.0"
    sys_version = ""

    def log_message(self, fmt, *args):
        # Evita imprimir rutas, valores de cabecera o datos sensibles.
        pass

    def _origen_valido(self):
        origen = self.headers.get("Origin", "").rstrip("/")
        host = self.headers.get("Host", "")
        return (
            self.client_address[0] == "127.0.0.1"
            and host in {"127.0.0.1:8765", "localhost:8765"}
            and origen in ORIGENES_PERMITIDOS
        )

    def _enviar(self, codigo, datos=None, cors=True):
        contenido = json.dumps(datos if datos is not None else {}, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(contenido)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cors and self._origen_valido():
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin"))
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            # Compatibilidad con el permiso de red local de Chrome/Edge.
            # Solo se emite para un origen permitido; nunca para sitios ajenos.
            if self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(contenido)

    def do_OPTIONS(self):
        if not self._origen_valido():
            self._enviar(403, {"error": "Origen no autorizado"}, cors=False)
            return
        self._enviar(200, {"ok": True})

    def do_GET(self):
        if self.path != "/estado" or not self._origen_valido():
            self._enviar(403, {"error": "Acceso denegado"}, cors=False)
            return
        self._enviar(200, {"estado": "listo", "aplicacion": "ConnectPC Detector 2.0"})

    def do_POST(self):
        if self.path != "/analizar" or not self._origen_valido():
            self._enviar(403, {"error": "Acceso denegado"}, cors=False)
            return
        try:
            largo = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            largo = -1
        if not 0 <= largo <= 1024:
            self._enviar(400, {"error": "Solicitud demasiado grande"})
            return
        self.rfile.read(largo)
        origen = self.headers.get("Origin", "")
        EVENTOS.put("Solicitud desde " + origen)
        if not pedir_permiso(origen):
            EVENTOS.put("Analisis rechazado por el usuario")
            self._enviar(403, {"error": "El usuario no autorizo el analisis"})
            return
        try:
            informe = informe_windows()
            EVENTOS.put("Analisis autorizado y completado")
            self._enviar(200, {"estado": "correcto", "equipo": informe})
        except Exception as exc:
            EVENTOS.put("Error al analizar hardware")
            self._enviar(500, {"error": "Windows no pudo analizar el hardware: " + str(exc)[:120]})


class Aplicacion:
    def __init__(self, root):
        self.root = root
        root.title("ConnectPC Detector")
        root.geometry("530x415")
        root.minsize(480, 390)
        root.configure(bg="#092f26")
        root.protocol("WM_DELETE_WINDOW", self.salir)
        self.servidor = None
        self.hilo = None
        self.estado = tk.StringVar(value="Preparando servidor local...")
        self.ultimo = tk.StringVar(value="Ninguna solicitud por ahora")
        self._dibujar()
        try:
            self.servidor = ThreadingHTTPServer((HOST, PORT), ServidorLocal)
            self.servidor.daemon_threads = True
            self.hilo = threading.Thread(target=self.servidor.serve_forever, daemon=True)
            self.hilo.start()
            self.estado.set("ACTIVO - esperando autorizaciones")
        except OSError as exc:
            self.estado.set("NO INICIADO - puerto ocupado")
            messagebox.showerror(
                "ConnectPC Detector",
                "No puedo iniciar el detector en el puerto 8765. "
                "Cierra otras copias del detector y vuelve a intentar.\n\n" + str(exc),
            )
        root.after(600, self._leer_eventos)

    def _dibujar(self):
        tk.Label(self.root, text="CONNECTPC  /  DETECTOR", fg="#c8f47a", bg="#092f26",
                 font=("Segoe UI", 12, "bold")).pack(anchor="w", padx=28, pady=(25, 9))
        tk.Label(self.root, text="Tu hardware. Tu permiso.", fg="#ffffff", bg="#092f26",
                 font=("Segoe UI", 21, "bold")).pack(anchor="w", padx=28)
        tk.Label(self.root, text="Mantiene una conexion segura solo en esta computadora.",
                 fg="#bdd9c8", bg="#092f26", font=("Segoe UI", 10)).pack(anchor="w", padx=28, pady=(6, 18))
        caja = tk.Frame(self.root, bg="#ffffff", bd=0)
        caja.pack(fill="both", expand=True, padx=24, pady=(0, 16))
        tk.Label(caja, text="ESTADO", fg="#678775", bg="#fff", font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=20, pady=(20, 4))
        tk.Label(caja, textvariable=self.estado, fg="#067346", bg="#fff", font=("Segoe UI", 12, "bold"),
                 wraplength=440).pack(anchor="w", padx=20)
        tk.Label(caja, text="ULTIMA ACTIVIDAD", fg="#678775", bg="#fff", font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=20, pady=(18, 4))
        tk.Label(caja, textvariable=self.ultimo, fg="#314c3d", bg="#fff", font=("Segoe UI", 10),
                 wraplength=440).pack(anchor="w", padx=20)
        tk.Label(caja, text="CPU, GPU, RAM y Windows. No accede a tus documentos.",
                 fg="#84998b", bg="#fff", font=("Segoe UI", 9)).pack(anchor="w", padx=20, pady=(16, 6))
        botones = tk.Frame(caja, bg="#ffffff")
        botones.pack(anchor="w", padx=20, pady=(8, 18))
        tk.Button(botones, text="Guardar informe JSON", command=self.guardar,
                  bg="#c8f47a", fg="#143e2a", activebackground="#dbffa9",
                  border=0, font=("Segoe UI", 10, "bold"), padx=15, pady=9).pack(side="left", padx=(0, 9))
        tk.Button(botones, text="Minimizar", command=self.root.iconify,
                  bg="#e6f2e8", fg="#315b45", border=0, font=("Segoe UI", 10), padx=13, pady=9).pack(side="left", padx=(0, 9))
        tk.Button(botones, text="Salir", command=self.salir,
                  bg="#f6e9e9", fg="#954848", border=0, font=("Segoe UI", 10), padx=13, pady=9).pack(side="left")

    def _leer_eventos(self):
        while True:
            try:
                texto = EVENTOS.get_nowait()
            except queue.Empty:
                break
            self.ultimo.set(datetime.now().strftime("%H:%M:%S") + "  " + texto)
        self.root.after(600, self._leer_eventos)

    def guardar(self):
        try:
            informe = informe_windows()
        except Exception as exc:
            messagebox.showerror("ConnectPC", "No fue posible leer el hardware:\n" + str(exc))
            return
        ubicacion = filedialog.asksaveasfilename(
            defaultextension=".json", filetypes=[("Informes JSON", "*.json")],
            initialfile="reporte_pc.json", title="Guardar informe de ConnectPC",
        )
        if not ubicacion:
            return
        try:
            Path(ubicacion).write_text(json.dumps(informe, indent=2, ensure_ascii=False), encoding="utf-8")
            messagebox.showinfo("ConnectPC", "Informe guardado. Puedes cargarlo en la pagina de ConnectPC.")
        except OSError as exc:
            messagebox.showerror("ConnectPC", "No se pudo guardar el informe:\n" + str(exc))

    def salir(self):
        if self.servidor:
            self.servidor.shutdown()
            self.servidor.server_close()
            self.servidor = None
        self.root.destroy()


def main():
    if sys.platform != "win32":
        print("El detector completo requiere Windows 10 u 11.")
        return 1
    root = tk.Tk()
    Aplicacion(root)
    if "--minimizado" in sys.argv:
        root.after(900, root.iconify)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
