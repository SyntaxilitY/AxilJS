# Type-check AxilJS packages (no emit, dist/ untouched) and run their vitest suites.
# Usage (Windows PowerShell 5.1+ or pwsh):
#   powershell -ExecutionPolicy Bypass -File .claude\skills\axiljs-verify\verify.ps1
#   powershell -ExecutionPolicy Bypass -File .claude\skills\axiljs-verify\verify.ps1 core orm
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Packages)

$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
Set-Location $Root
$env:NO_COLOR = '1'

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Write-Host 'node_modules missing - run: npm ci' -ForegroundColor Red
  exit 2
}

if (-not $Packages -or $Packages.Count -eq 0) {
  # -Force: some Windows setups flag the folders hidden, and plain -Directory then returns nothing
  $Packages = Get-ChildItem -Directory -Force (Join-Path $Root 'packages') |
    Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } |
    ForEach-Object { $_.Name }
}
if (-not $Packages -or $Packages.Count -eq 0) {
  Write-Host 'No packages found under packages\ - refusing to report success' -ForegroundColor Red
  exit 2
}

$failed = 0
$rows = @()
foreach ($p in $Packages) {
  $dir = Join-Path $Root "packages\$p"
  if (-not (Test-Path (Join-Path $dir 'tsconfig.json'))) {
    Write-Host "??  ${p}: no tsconfig.json" -ForegroundColor Yellow
    $failed++
    continue
  }

  Push-Location $dir
  try {
    $tsc = (& npx tsc --noEmit -p . 2>&1 | Out-String)
    $errors = @($tsc -split "`n" | Where-Object { $_ -match 'error TS' })
    $typeStatus = if ($errors.Count -eq 0) { 'ok' } else { "$($errors.Count) errors" }
    if ($errors.Count -eq 0) {
      Write-Host "ok  ${p}: typecheck" -ForegroundColor Green
    } else {
      Write-Host "ERR ${p}: $($errors.Count) type errors" -ForegroundColor Red
      $errors | Select-Object -First 20 | ForEach-Object { Write-Host "    $_" }
      $failed++
    }

    $testStatus = '-'
    $pkgJson = Get-Content (Join-Path $dir 'package.json') -Raw | ConvertFrom-Json
    $hasTestScript = $pkgJson.scripts -and ($pkgJson.scripts.PSObject.Properties.Name -contains 'test')
    $hasTests = (Test-Path (Join-Path $dir 'tests')) -or (Test-Path (Join-Path $dir 'test'))
    if ($hasTestScript -and $hasTests) {
      $out = (& npx vitest run 2>&1 | Out-String)
      $code = $LASTEXITCODE
      $summary = ([regex]::Match($out, 'Tests\s+[^\r\n]+')).Value.Trim()
      if ($code -eq 0) {
        Write-Host "ok  ${p}: tests ($summary)" -ForegroundColor Green
        $testStatus = $summary
      } else {
        Write-Host "ERR ${p}: tests failed ($summary)" -ForegroundColor Red
        ($out -split "`n" | Where-Object { $_ -match 'FAIL|AssertionError|Error:' }) | Select-Object -First 15 | ForEach-Object { Write-Host "    $_" }
        $testStatus = "FAILED $summary"
        $failed++
      }
    }
    $rows += [pscustomobject]@{ Package = $p; Typecheck = $typeStatus; Tests = $testStatus }
  } finally {
    Pop-Location
  }
}

Write-Host ''
$rows | Format-Table -AutoSize | Out-String | Write-Host
if ($failed -gt 0) { Write-Host "$failed check(s) failed" -ForegroundColor Red; exit 1 }
Write-Host 'All checks passed' -ForegroundColor Green
exit 0
