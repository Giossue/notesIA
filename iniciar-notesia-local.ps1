#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Service = "",
  [switch]$Check,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectDir = $PSScriptRoot
$ScriptPath = $MyInvocation.MyCommand.Path

function Write-Info {
  param([string]$Message)
  Write-Host "[NotesIA] $Message"
}

function Fail {
  param([string]$Message)
  Write-Host "[NotesIA] ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Show-Usage {
  Write-Host @"
Uso:
  .\iniciar-notesia-local.ps1           Abre NotesIA en pestañas de Windows Terminal.
  .\iniciar-notesia-local.ps1 -Check    Comprueba el entorno sin abrir ventanas.
  .\iniciar-notesia-local.ps1 -Help     Muestra esta ayuda.

La ventana contiene pestañas para API, worker, admin, Metro y Android.
La pestaña Android espera un dispositivo USB autorizado, configura adb reverse,
compila de forma incremental e instala/abre la app.

Si Windows Terminal no está instalado, se abren ventanas de PowerShell separadas.

Requisitos: Bun, PostgreSQL, JDK 17, Android SDK con platform-tools
y el archivo .env en la raíz del proyecto.
"@
}

function Require-Command {
  param([string]$Name, [string]$Hint)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "No se encontró '$Name'. $Hint"
  }
}

function Assert-NodeVersion {
  Require-Command node "Instala Node.js 22 LTS desde https://nodejs.org"
  $versionText = & node -v
  if ($versionText -notmatch '^v(\d+)\.(\d+)\.') {
    Fail "No se pudo interpretar la versión de Node.js: $versionText"
  }

  $major = [int]$Matches[1]
  $minor = [int]$Matches[2]
  if ($major -lt 20 -or ($major -eq 20 -and $minor -lt 12)) {
    Fail "Node.js $versionText es demasiado antiguo. Metro y el panel requieren Node 20.12 o superior; instala Node 22 LTS."
  }
}

function Get-Java17Home {
  $candidates = @($env:NOTESIA_JAVA_HOME, $env:JAVA_HOME)
  foreach ($root in @(
      "C:\Program Files\Eclipse Adoptium",
      "C:\Program Files\Microsoft",
      "C:\Program Files\Java",
      "C:\Program Files\Amazon Corretto"
    )) {
    if (Test-Path $root) {
      $candidates += Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "jdk-17*" -or $_.Name -like "jdk17*" } |
        Select-Object -ExpandProperty FullName
    }
  }

  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    $java = Join-Path $candidate "bin\java.exe"
    if (-not (Test-Path $java)) { continue }
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      $versionText = (& $java -version 2>&1 | Out-String)
    } finally {
      $ErrorActionPreference = $previousErrorAction
    }
    if ($versionText -match 'version "17[."]') { return $candidate }
  }

  return $null
}

function Get-AndroidHome {
  $candidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA "Android\Sdk")
  )
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    if (-not (Test-Path (Join-Path $candidate "platform-tools"))) { continue }
    return $candidate
  }
  return $null
}

function Test-PortOpen {
  param([int]$Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    if (-not $task.Wait(300)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-WorkerRunning {
  $processes = Get-CimInstance Win32_Process -Filter "Name = 'bun.exe'" -ErrorAction SilentlyContinue
  foreach ($process in $processes) {
    if ($process.CommandLine -and $process.CommandLine -match 'apps[\\/]worker[\\/]src[\\/]index\.ts') {
      return $true
    }
  }
  return $false
}

function Initialize-DebugKeystore {
  $keystore = Join-Path $ProjectDir "apps\mobile\android\app\debug.keystore"
  if (Test-Path $keystore) { return }

  $keytool = Join-Path $env:JAVA_HOME "bin\keytool.exe"
  if (-not (Test-Path $keytool)) {
    Fail "No se encontró keytool en $env:JAVA_HOME\bin."
  }

  Write-Info "Creando keystore de depuración..."
  & $keytool -genkeypair -noprompt -v -storetype PKCS12 -keystore $keystore `
    -alias androiddebugkey -storepass android -keypass android `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -dname "CN=Android Debug,O=Android,C=US"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $keystore)) {
    Fail "No se pudo crear el keystore de depuración en $keystore."
  }
}

function Test-BinExists {
  param([string]$Name)
  $binDir = Join-Path $ProjectDir "node_modules\.bin"
  if (-not (Test-Path $binDir)) { return $false }
  return [bool](Get-ChildItem $binDir -Filter "$Name*" -File -ErrorAction SilentlyContinue)
}

function Invoke-Migrations {
  $prompted = $false
  Push-Location $ProjectDir
  try {
    & bun run db:migrate:local
    if ($LASTEXITCODE -eq 0) { return }

    if (-not $env:PGPASSWORD) {
      Write-Info "La migración debe autenticarse como el usuario 'postgres' por TCP."
      $secure = Read-Host "Contraseña del usuario postgres" -AsSecureString
      $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
      try {
        $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $prompted = $true
      } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
      }
      & bun run db:migrate:local
      if ($LASTEXITCODE -eq 0) { return }
    }
  } finally {
    Pop-Location
    if ($prompted) { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
  }

  Fail "No se pudieron aplicar las migraciones locales. Revisa PostgreSQL y PGPASSWORD (se usa el usuario postgres en 127.0.0.1:5432)."
}

function Invoke-Preflight {
  Require-Command bun "Instala Bun desde https://bun.sh"
  Require-Command adb "Instala Android platform-tools y agrégalo al PATH."
  Assert-NodeVersion

  $envFile = Join-Path $ProjectDir ".env"
  if (-not (Test-Path $envFile)) {
    Fail "Falta $envFile. Copia .env.example a .env y completa DATABASE_URL, BETTER_AUTH_SECRET y AI_ENCRYPTION_KEY."
  }

  $androidHome = Get-AndroidHome
  if (-not $androidHome) {
    Fail "No se encontró el Android SDK. ANDROID_HOME debe apuntar a la raíz del SDK (contiene la carpeta platform-tools), no a platform-tools; o instala Android Studio."
  }
  $env:ANDROID_HOME = $androidHome

  if (-not (Test-BinExists "react-native") -or -not (Test-BinExists "vite")) {
    Write-Info "Instalando dependencias que faltan..."
    Push-Location $ProjectDir
    try {
      & bun install --frozen-lockfile
      if ($LASTEXITCODE -ne 0) { Fail "bun install terminó con código $LASTEXITCODE." }
    } finally {
      Pop-Location
    }
  }

  if (Get-Command pg_isready -ErrorAction SilentlyContinue) {
    & pg_isready -q -h 127.0.0.1 -p 5432 -d notesia_dev
    if ($LASTEXITCODE -ne 0) {
      Fail "PostgreSQL local no responde. Inicia el servicio (por ejemplo: Start-Service postgresql-x64-17)."
    }
  } elseif (-not (Test-PortOpen 5432)) {
    Fail "PostgreSQL local no responde en 127.0.0.1:5432. Inicia el servicio."
  }

  foreach ($port in @(3000, 5173, 8082)) {
    if (Test-PortOpen $port) {
      Fail "El puerto $port ya está ocupado. Cierra la sesión local anterior de NotesIA."
    }
  }

  if (Test-WorkerRunning) {
    Fail "Ya existe un worker local de NotesIA. Cierra la sesión anterior."
  }

  $javaHome = Get-Java17Home
  if (-not $javaHome) {
    Fail "No se encontró JDK 17. Instala Temurin 17 o define JAVA_HOME o NOTESIA_JAVA_HOME."
  }
  $env:JAVA_HOME = $javaHome
  Initialize-DebugKeystore

  Write-Info "Aplicando migraciones locales pendientes..."
  Invoke-Migrations
  Write-Info "Entorno local comprobado."
}

function Wait-ForUrl {
  param(
    [string]$Name,
    [string]$Url,
    [int]$MaxSeconds = 180
  )

  Write-Info "Esperando $Name..."
  for ($elapsed = 0; $elapsed -lt $MaxSeconds; $elapsed++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        Write-Info "$Name listo."
        return $true
      }
    } catch {
    }
    Start-Sleep -Seconds 1
  }

  Write-Host "[NotesIA] $Name no respondió después de $MaxSeconds segundos." -ForegroundColor Yellow
  return $false
}

function Select-AndroidDevice {
  $configured = $env:ANDROID_SERIAL
  if (-not [string]::IsNullOrWhiteSpace($configured)) {
    $state = (& adb -s $configured get-state 2>$null)
    if ($state -match "^\s*device\s*$") { return $configured }
  }

  $lines = & adb devices
  foreach ($line in ($lines | Select-Object -Skip 1)) {
    if ($line -match '^(\S+)\s+device\s*$') { return $Matches[1] }
  }
  return $null
}

function Resolve-AndroidToolchain {
  $javaHome = Get-Java17Home
  if (-not $javaHome) { Fail "No se encontró JDK 17 para compilar Android." }
  $env:JAVA_HOME = $javaHome
  Initialize-DebugKeystore

  $androidHome = Get-AndroidHome
  if (-not $androidHome) {
    Fail "No se encontró el Android SDK. ANDROID_HOME debe apuntar a la raíz del SDK (contiene la carpeta platform-tools), no a platform-tools."
  }
  $env:ANDROID_HOME = $androidHome
}

function Invoke-Android {
  Resolve-AndroidToolchain

  if (-not (Wait-ForUrl "la API" "http://127.0.0.1:3000/v1/health")) { return }
  if (-not (Wait-ForUrl "Metro" "http://127.0.0.1:8082/status")) { return }

  & adb start-server | Out-Null
  Write-Info "Conecta y desbloquea el teléfono; acepta la autorización USB si aparece."

  $serial = $null
  while (-not $serial) {
    $serial = Select-AndroidDevice
    if (-not $serial) { Start-Sleep -Seconds 2 }
  }

  $env:ANDROID_SERIAL = $serial
  Write-Info "Dispositivo Android listo: $serial"
  & adb reverse tcp:3000 tcp:3000
  & adb reverse tcp:8082 tcp:8082

  Push-Location (Join-Path $ProjectDir "apps\mobile")
  try {
    & bun run android
  } finally {
    Pop-Location
  }
}

function Invoke-Service {
  param([string]$Name)

  Push-Location $ProjectDir
  try {
    switch ($Name.ToLowerInvariant()) {
      "api" {
        Write-Info "API: http://127.0.0.1:3000/v1"
        & bun run dev:api
      }
      "worker" {
        Write-Info "Worker de avisos, correo y procesos diferidos"
        & bun run dev:worker
      }
      "admin" {
        Write-Info "Admin: http://127.0.0.1:5173/login"
        & bun run dev:admin
      }
      "metro" {
        Write-Info "Metro: http://127.0.0.1:8082"
        & bun run dev:mobile
      }
      "android" {
        Invoke-Android
      }
      default {
        Fail "Servicio interno desconocido: $Name"
      }
    }
  } finally {
    Pop-Location
  }
}

function Start-TabCommand {
  param([string]$Title, [string]$Name)
  return "new-tab --title `"$Title`" -d `"$ProjectDir`" powershell.exe -NoExit -ExecutionPolicy Bypass -File `"$ScriptPath`" -Service $Name"
}

function Start-All {
  Invoke-Preflight

  $tabs = @(
    @{ Title = "API"; Name = "api" },
    @{ Title = "Worker"; Name = "worker" },
    @{ Title = "Admin"; Name = "admin" },
    @{ Title = "Metro"; Name = "metro" },
    @{ Title = "Android"; Name = "android" }
  )

  if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
    $arguments = ($tabs | ForEach-Object { Start-TabCommand $_.Title $_.Name }) -join " ; "
    Start-Process -FilePath "wt.exe" -ArgumentList $arguments | Out-Null
    Write-Info "Windows Terminal abierto con API, worker, admin, Metro y Android."
  } else {
    foreach ($tab in $tabs) {
      $line = "-NoExit -ExecutionPolicy Bypass -File `"$ScriptPath`" -Service $($tab.Name)"
      Start-Process -FilePath "powershell.exe" -ArgumentList $line | Out-Null
    }
    Write-Info "Se abrieron cinco ventanas de PowerShell: API, worker, admin, Metro y Android."
    Write-Info "Instala Windows Terminal para tenerlas en pestañas de una sola ventana."
  }

  Write-Info "Cierra las pestañas o ventanas para detener la sesión."
}

if ($Help) {
  Show-Usage
  exit 0
}

if (-not [string]::IsNullOrWhiteSpace($Service)) {
  Invoke-Service $Service
  exit 0
}

if ($Check) {
  Invoke-Preflight
  Write-Info "Sesión local preparada correctamente."
  exit 0
}

Start-All
