$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$venvPath = Join-Path $repoRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$envExample = Join-Path $repoRoot ".env.example"
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Host "Creating Python virtual environment at $venvPath ..."
    python -m venv $venvPath
}

& $venvPython -m pip --version

if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "Created $envFile. Open it and enter GEMINI_API_KEY."
} else {
    Write-Host "$envFile already exists; keeping its current content."
}

Write-Host ""
Write-Host "Activate the environment with:"
Write-Host "  .\.venv\Scripts\Activate.ps1"
