
# ConnectPC - Detector de componentes para Windows
# Este programa solo consulta información del hardware.
# No accede a archivos personales ni envía datos a internet.

$ErrorActionPreference = "Stop"

try {

    # Obtener el procesador
    $cpu = Get-CimInstance -ClassName Win32_Processor |
        Select-Object -First 1

    # Obtener la memoria RAM instalada
    $equipo = Get-CimInstance -ClassName Win32_ComputerSystem

    # Obtener el sistema operativo
    $so = Get-CimInstance -ClassName Win32_OperatingSystem

    # Obtener las tarjetas graficas
    $graficas = @(
        Get-CimInstance -ClassName Win32_VideoController |
            Where-Object { $_.Name } |
            ForEach-Object { $_.Name.Trim() } |
            Select-Object -Unique
    )

    # Organizar la informacion
    $informe = [ordered]@{
        formato = "connectpc-hardware-v1"
        fuente = "deteccion_windows"
        procesador = $cpu.Name.Trim()
        ram_gb = [Math]::Round(
            [double]$equipo.TotalPhysicalMemory / 1GB, 1
        )
        graficas = @($graficas)
        sistema_operativo = $so.Caption.Trim()
    }

    # Crear el archivo JSON
    $ruta = Join-Path $PSScriptRoot "reporte_pc.json"

    $json = $informe | ConvertTo-Json -Depth 4

    $utf8 = [System.Text.UTF8Encoding]::new($false)

    [System.IO.File]::WriteAllText(
        $ruta,
        $json,
        $utf8
    )

    Write-Host ""
    Write-Host "ConnectPC - Analisis completado" -ForegroundColor Green
    Write-Host ""
    Write-Host "Procesador: $($informe.procesador)"
    Write-Host "RAM: $($informe.ram_gb) GB"
    Write-Host "Tarjetas graficas: $($graficas -join ', ')"
    Write-Host "Sistema operativo: $($informe.sistema_operativo)"
    Write-Host ""
    Write-Host "Informe guardado en: $ruta" -ForegroundColor Green

} catch {

    Write-Host "Error al detectar componentes:" -ForegroundColor Red
    Write-Host $_.Exception.Message

}
