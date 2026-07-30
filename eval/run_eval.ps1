param(
    [switch]$ValidateOnly,
    [switch]$CheckConnection,
    [string]$Out = "eval\run_results_latest.json",
    [string]$ResumeFrom = "",
    [double]$RequestDelaySeconds = 7
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$toolPath = Join-Path $repoRoot "codebase\tool.py"
$goldenSetPath = Join-Path $repoRoot "eval\golden_set.json"
$outPath = Join-Path $repoRoot $Out

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw ".venv does not exist. Run .\eval\setup_eval.ps1 first."
}

if ($ValidateOnly) {
    & $venvPython $toolPath --golden-set $goldenSetPath --validate-only
} elseif ($CheckConnection) {
    & $venvPython $toolPath --check-connection
} else {
    $arguments = @(
        $toolPath,
        "--golden-set", $goldenSetPath,
        "--out", $outPath,
        "--request-delay", $RequestDelaySeconds
    )
    if ($ResumeFrom) {
        $arguments += @("--resume-from", (Join-Path $repoRoot $ResumeFrom))
    }
    & $venvPython @arguments
}

exit $LASTEXITCODE
