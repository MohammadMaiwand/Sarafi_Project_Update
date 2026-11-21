[CmdletBinding()]
param([switch]$NoBrowser, [switch]$NoDialog)
$ErrorActionPreference = 'Stop'
$launcherDirectory = $PSScriptRoot
$projectDirectory = [System.IO.Path]::GetFullPath((Join-Path $launcherDirectory '..'))
$runtimeDirectory = Join-Path $launcherDirectory 'logs'
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
$launcherLog = Join-Path $runtimeDirectory 'launcher.log'
$startedProcesses = @()
$mutex = $null
$locked = $false

function Write-LauncherLog([string]$Message) {
    Add-Content -LiteralPath $launcherLog -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding UTF8
}
function Test-Port([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $listenHost = if ($Port -eq 8000) { '127.0.0.1' } else { 'localhost' }
        $task = $client.ConnectAsync($listenHost, $Port)
        return ($task.Wait(500) -and $client.Connected)
    } catch { return $false } finally { $client.Dispose() }
}
function Test-ProjectBackendProcess($Process, [string]$PythonPath) {
    if ($null -eq $Process -or [string]::IsNullOrWhiteSpace($Process.CommandLine)) { return $false }
    $usesProjectPython = $Process.CommandLine.IndexOf($PythonPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    $runsProjectServer = $Process.CommandLine -match '(?i)\bmanage\.py"?\s+runserver\s+127\.0\.0\.1:8000\b'
    return ($usesProjectPython -and $runsProjectServer)
}
function Stop-StaleProjectBackend([string]$PythonPath) {
    $connections = @(Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue)
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    foreach ($ownerId in @($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
        $root = $processes | Where-Object { $_.ProcessId -eq $ownerId } | Select-Object -First 1
        if (-not (Test-ProjectBackendProcess $root $PythonPath)) { continue }
        while ($null -ne $root) {
            $parent = $processes | Where-Object { $_.ProcessId -eq $root.ParentProcessId } | Select-Object -First 1
            if (-not (Test-ProjectBackendProcess $parent $PythonPath)) { break }
            $root = $parent
        }
        Write-LauncherLog "Restarting this project's outdated backend process tree (PID $($root.ProcessId))."
        $taskkill = Join-Path $env:WINDIR 'System32\taskkill.exe'
        $stop = Start-Process -FilePath $taskkill -ArgumentList "/PID $($root.ProcessId) /T /F" -Wait -PassThru -NoNewWindow
        if ($stop.ExitCode -ne 0) { throw 'Could not stop this project''s old backend. Close it manually and run the launcher again.' }
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        while ((Test-Port 8000) -and $timer.Elapsed.TotalSeconds -lt 10) {
            Start-Sleep -Milliseconds 250
        }
        if (Test-Port 8000) { throw 'The old backend process stopped, but port 8000 is still occupied. Close the other application and try again.' }
        Write-LauncherLog 'The outdated backend stopped; a fresh backend will be started.'
        return $true
    }
    return $false
}
function Get-LocalResponse([string]$Url) {
    try { return Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop }
    catch { return $null }
}
function Get-LocalStatusCode([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}
function Test-OutgoingApiRoute([string]$BaseUrl) {
    $statusCode = Get-LocalStatusCode "$BaseUrl/api/outgoing/agencies/"
    return ($statusCode -in @(200, 401, 403))
}
function Test-TomanProfitApiRoute([string]$BaseUrl) {
    $statusCode = Get-LocalStatusCode "$BaseUrl/api/toman-profit/?month=1405-08"
    return ($statusCode -in @(200, 401, 403))
}
function Test-DashboardWorkspaceApiRoute([string]$BaseUrl) {
    $statusCode = Get-LocalStatusCode "$BaseUrl/api/dashboard/workspace/?month=1405-08"
    return ($statusCode -in @(200, 401, 403))
}
function Test-CreditorsApiRoute([string]$BaseUrl) {
    $statusCode = Get-LocalStatusCode "$BaseUrl/api/creditors/"
    return ($statusCode -in @(200, 401, 403))
}
function Test-ProvincialPaymentsApiRoute([string]$BaseUrl) {
    $statusCode = Get-LocalStatusCode "$BaseUrl/api/provincial/accounts/1/customer-payments/?workspace=provincial"
    return ($statusCode -in @(200, 401, 403))
}
function Test-Backend {
    $response = Get-LocalResponse 'http://127.0.0.1:8000/api/hello/'
    if (-not $response -or $response.Headers['X-Remittance-QA']) { return $false }
    try {
        $data = $response.Content | ConvertFrom-Json
        return ($null -ne $data.message -and [int]$data.features.outgoing_province_filter -ge 1 -and (Test-OutgoingApiRoute 'http://127.0.0.1:8000') -and (Test-TomanProfitApiRoute 'http://127.0.0.1:8000') -and (Test-DashboardWorkspaceApiRoute 'http://127.0.0.1:8000') -and (Test-CreditorsApiRoute 'http://127.0.0.1:8000') -and (Test-ProvincialPaymentsApiRoute 'http://127.0.0.1:8000'))
    } catch { return $false }
}
function Test-Frontend {
    $response = Get-LocalResponse 'http://localhost:5173/login'
    if ($null -eq $response -or $response.Content -notmatch '<title>Amiri Workspace</title>' -or $response.Content -notmatch '/src/main.jsx') {
        return $false
    }
    $entry = Get-LocalResponse 'http://localhost:5173/src/main.jsx'
    $outgoingPage = Get-LocalResponse 'http://localhost:5173/src/pages/OutgoingWorkspace.jsx'
    return ($null -ne $entry -and $null -ne $outgoingPage)
}
function Wait-ForServer([string]$Name, [scriptblock]$Check, $Process, [int]$Seconds = 75) {
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $Seconds) {
        if (& $Check) { Write-LauncherLog "$Name is ready."; return }
        if ($null -ne $Process) {
            $Process.Refresh()
            if ($Process.HasExited) { throw "$Name stopped before becoming ready. See the logs folder." }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$Name did not become ready within $Seconds seconds. See the logs folder."
}
function Start-HiddenServer([string]$Executable, [string]$Arguments, [string]$Directory, [string]$Name) {
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDirectory "$Name.log") -RedirectStandardError (Join-Path $runtimeDirectory "$Name-error.log")
    # Retain the handle before exit so Windows PowerShell can report ExitCode reliably.
    $null = $process.Handle
    Write-LauncherLog "Started $Name (PID $($process.Id))."
    return $process
}
try {
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectDirectory))).Replace('-', '').Substring(0, 20) }
    finally { $hash.Dispose() }
    $mutex = New-Object System.Threading.Mutex($false, "Local\AmiriLauncher_$key")
    try { $locked = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { exit 0 }
    Write-LauncherLog 'Starting system.'
    $backendDirectory = Join-Path $projectDirectory 'MyFullStackApp'
    $frontendDirectory = Join-Path $projectDirectory 'frontend'
    $python = Join-Path $backendDirectory 'venv\Scripts\python.exe'
    $manage = Join-Path $backendDirectory 'manage.py'
    $vite = Join-Path $frontendDirectory 'node_modules\vite\bin\vite.js'
    $node = (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if (-not $node) {
        foreach ($candidate in @((Join-Path $env:ProgramFiles 'nodejs\node.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))) {
            if (Test-Path -LiteralPath $candidate) { $node = $candidate; break }
        }
    }
    if (-not (Test-Path -LiteralPath $python)) { throw 'The project Python environment is missing: MyFullStackApp\venv\Scripts\python.exe' }
    if (-not (Test-Path -LiteralPath $manage)) { throw 'Django manage.py was not found. Keep this launcher folder inside the project.' }
    if (-not $node) { throw 'Node.js was not found. Install Node.js, then run the launcher again.' }
    if (-not (Test-Path -LiteralPath $vite)) { throw 'Frontend dependencies are missing. Run npm install inside the frontend folder first.' }
    $backendProcess = $null
    $frontendProcess = $null
    if (Test-Backend) { Write-LauncherLog 'Reusing the running backend.' }
    else {
        if (Test-Port 8000) {
            $healthResponse = Get-LocalResponse 'http://127.0.0.1:8000/api/hello/'
            if ($healthResponse) {
                if (-not (Stop-StaleProjectBackend $python)) {
                    throw 'Port 8000 is serving an incompatible backend that does not belong to this project. Close it manually, then run the launcher again.'
                }
            } else {
                throw 'Port 8000 is in use by another application. Close that application, then run the launcher again.'
            }
        }
        if (Test-Port 8000) { throw 'Port 8000 is still in use. Close the other application, then run the launcher again.' }
        $migration = Start-HiddenServer $python ('"' + $manage + '" migrate --noinput') $backendDirectory 'migration'
        if (-not $migration.WaitForExit(120000)) { $migration.Kill(); throw 'Database migrations timed out. See migration-error.log.' }
        $migration.Refresh()
        if ($migration.ExitCode -ne 0) { throw 'Database migrations failed. See migration-error.log.' }
        $backendProcess = Start-HiddenServer $python ('"' + $manage + '" runserver 127.0.0.1:8000 --noreload') $backendDirectory 'backend'
        $startedProcesses += $backendProcess
        Wait-ForServer 'Backend' { Test-Backend } $backendProcess
    }
    if (Test-Frontend) { Write-LauncherLog 'Reusing the running frontend.' }
    elseif (Test-Port 5173) { throw 'Port 5173 is in use by another application. Close that application and try again.' }
    else {
        $frontendProcess = Start-HiddenServer $node ('"' + $vite + '" --host localhost --port 5173 --strictPort') $frontendDirectory 'frontend'
        $startedProcesses += $frontendProcess
        Wait-ForServer 'Frontend' { Test-Frontend } $frontendProcess
    }
    $proxy = Get-LocalResponse 'http://localhost:5173/api/hello/'
    if (-not $proxy -or $proxy.Headers['X-Remittance-QA']) { throw 'The frontend cannot reach the main backend. See the server logs.' }
    try {
        $proxyData = $proxy.Content | ConvertFrom-Json
        if ($null -eq $proxyData.message -or [int]$proxyData.features.outgoing_province_filter -lt 1) { throw 'invalid API response' }
    } catch { throw 'The frontend API connection is not configured correctly.' }
    if (-not (Test-OutgoingApiRoute 'http://localhost:5173')) {
        throw 'The frontend proxy cannot reach the current outgoing-agencies API. See the server logs.'
    }
    if (-not (Test-TomanProfitApiRoute 'http://localhost:5173')) {
        throw 'The frontend proxy cannot reach the current toman-profit API. See the server logs.'
    }
    if (-not (Test-DashboardWorkspaceApiRoute 'http://localhost:5173')) {
        throw 'The frontend proxy cannot reach the current dashboard-workspace API. See the server logs.'
    }
    if (-not (Test-CreditorsApiRoute 'http://localhost:5173')) {
        throw 'The frontend proxy cannot reach the current creditors API. See the server logs.'
    }
    $state = @{ project = $projectDirectory; loginUrl = 'http://localhost:5173/login'; readyAt = (Get-Date -Format o); startedPids = @($startedProcesses | ForEach-Object { $_.Id }); backendReused = ($null -eq $backendProcess); frontendReused = ($null -eq $frontendProcess) }
    $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDirectory 'last-start.json') -Encoding UTF8
    Write-LauncherLog 'Both servers are ready. Opening login.'
    if (-not $NoBrowser) { Start-Process 'http://localhost:5173/login' }
    exit 0
} catch {
    $message = $_.Exception.Message
    Write-LauncherLog "ERROR: $message"
    foreach ($process in $startedProcesses) {
        try { $process.Refresh(); if (-not $process.HasExited) { $process.Kill() } } catch { }
    }
    if (-not $NoDialog) {
        try { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("$message`r`n`r`nLogs: $runtimeDirectory", 'Amiri System Launcher', 'OK', 'Error') | Out-Null } catch { }
    }
    [Console]::Error.WriteLine($message)
    exit 1
} finally {
    if ($locked -and $mutex) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}

