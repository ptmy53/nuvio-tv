# Manual GitHub Pages deploy (bypasses the Actions queue).
#
# GitHub Pages for this repository is configured with build_type=legacy and
# publishes the `gh-pages` branch. This script rebuilds dist/, rewrites the
# asset cache-bust token with the current commit SHA and force-pushes dist/ to
# gh-pages, so a deployment takes seconds instead of waiting for a runner.
#
# Usage:
#   pwsh -File scripts/deploy-pages.ps1
#   pwsh -File scripts/deploy-pages.ps1 -SkipBuild

param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$sha = (git rev-parse --short=8 HEAD).Trim()
Write-Host "Deploying commit $sha"

if (-not $SkipBuild) {
  Write-Host "Building..."
  npm run build | Out-Null
}

$indexPath = Join-Path $repoRoot "dist\index.html"
$index = Get-Content $indexPath -Raw
$index = [regex]::Replace($index, "\?v=[A-Za-z0-9._-]*", "?v=$sha")
Set-Content -Path $indexPath -Value $index -NoNewline

$notFound = @"
<!doctype html><meta charset="utf-8"><title>Yönlendiriliyor…</title>
<script>location.replace("https://ptmy53.github.io/nuvio-tv/" + location.hash);</script>
<p><a href="https://ptmy53.github.io/nuvio-tv/">Nuvio TV</a></p>
"@
Set-Content -Path (Join-Path $repoRoot "dist\404.html") -Value $notFound
New-Item -ItemType File -Force -Path (Join-Path $repoRoot "dist\.nojekyll") | Out-Null

Push-Location (Join-Path $repoRoot "dist")
try {
  if (-not (Test-Path ".git")) { git init -q }
  git checkout -q -B gh-pages
  git add -A
  git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "deploy $sha"
  if (-not (git remote | Select-String -SimpleMatch "origin")) {
    git remote add origin https://github.com/ptmy53/nuvio-tv.git
  }
  git push -f origin gh-pages
} finally {
  Pop-Location
}

Write-Host "Published. Live URL: https://ptmy53.github.io/nuvio-tv/?v=$sha"
