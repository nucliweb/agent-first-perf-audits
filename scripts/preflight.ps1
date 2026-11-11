# Checks at home, with a good connection, that this machine is ready for the workshop, the same as
# scripts/preflight.sh: the container runtime and its version of Compose, the architecture, the
# memory of the VM, the regression branches and the free disk. Then it pulls every image and runs a
# smoke test inside Compose: Chromium starts, a trace is recorded, both shops answer, the lab has no
# internet and, with the llm profile, the local LLM answers JSON within the time limit of its test.
# It prints OK or KO for each check and exits with 0 when the machine is ready.
#   powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
#   $env:COMPOSE_PROFILES = 'lite'; powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
# It runs on Windows PowerShell 5.1 and on PowerShell 7, so it avoids the syntax of PowerShell 7
# and keeps to ASCII: Windows PowerShell reads a file without BOM in the code page of the system.

$ErrorActionPreference = 'Continue'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
# The smoke test runs in a Compose project of its own, so it does not touch a running lab
$Project = 'agent-first-perf-audits-preflight'
$MinCompose = [version]'2.20.2'
# What the images need on a first pull, as the README asks
$MinDiskGb = 15
$GiB = 1073741824

$script:failures = 0
function Ok($check) { Write-Output "  OK  $check" }
function Skip($check) { Write-Output "  --  $check" }
# The first argument is the check; the rest, one line each, say how to fix it
function Ko($check) {
  Write-Output "  KO  $check"
  foreach ($line in $args) { Write-Output "      $line" }
  $script:failures++
}

function Summary {
  Write-Output ''
  if ($script:failures -eq 0) {
    Write-Output "Ready for the workshop with the $labProfile profile."
    if ($labProfile -eq 'lite') {
      Write-Output 'Without the local LLM, ci gives the same verdict and attribution, and writes the explanation'
      Write-Output 'request to out/handoff.md for an agent of your choice. Sending the diff to an external service'
      Write-Output 'is a decision of each team for its own code.'
    }
    exit 0
  }
  if ($script:failures -eq 1) {
    Write-Output '1 check failed. Fix it and run scripts\preflight.ps1 again.'
  } else {
    Write-Output "$($script:failures) checks failed. Fix them and run scripts\preflight.ps1 again."
  }
  exit 1
}

# A native command, with stderr as text and without the error records of Windows PowerShell
function Native {
  $command = $args[0]
  $rest = @()
  if ($args.Count -gt 1) { $rest = $args[1..($args.Count - 1)] }
  & $command @rest 2>&1 | ForEach-Object { "$_" }
}

function Compose { Native docker compose --project-directory $Repo @args }

# docker compose with CANDIDATE set for that call only
function ComposeFor($candidate) {
  $env:CANDIDATE = $candidate
  try { Native docker compose --project-directory $Repo @args } finally { Remove-Item Env:CANDIDATE }
}

# The profile, as Compose resolves it: the environment first, then the .env of the repo
$profiles = $env:COMPOSE_PROFILES
if ($null -eq $profiles -and (Test-Path (Join-Path $Repo '.env'))) {
  $line = Get-Content (Join-Path $Repo '.env') | Where-Object { $_ -match '^COMPOSE_PROFILES=' } | Select-Object -Last 1
  if ($line) { $profiles = $line -replace '^COMPOSE_PROFILES=', '' }
}
if ($null -eq $profiles) { $profiles = '' }
$env:COMPOSE_PROFILES = $profiles
if ((",$profiles,") -match ',llm,') {
  $labProfile = 'llm'; $minMemoryGb = 8; $profileFlags = @('--profile', 'llm', '--profile', 'run'); $skippedTests = 1
} else {
  $labProfile = 'lite'; $minMemoryGb = 4; $profileFlags = @('--profile', 'run'); $skippedTests = 3
}

Write-Output "Preflight of the workshop with the $labProfile profile"
Write-Output ''

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Ko 'docker command not found' 'Install a container runtime: Docker Desktop, OrbStack, Colima or Podman (see the README)'
  Summary
}

$info = Native docker info --format '{{.OperatingSystem}}|{{.Architecture}}|{{.MemTotal}}|{{.KernelVersion}}'
if ($LASTEXITCODE -ne 0) {
  Ko 'The container runtime is not running' 'Start Docker Desktop, or run podman machine start'
  Summary
}
$os, $arch, $memory, $kernel = ("$($info | Select-Object -Last 1)").Split('|')

$components = "$(Native docker version --format '{{range .Server.Components}}{{.Name}} {{end}}')"
$context = "$(Native docker context show)"
if ($components -match 'Podman') { $runtime = 'Podman' }
elseif ($os -eq 'Docker Desktop') { $runtime = 'Docker Desktop' }
elseif ($os -eq 'OrbStack' -or $context -eq 'orbstack') { $runtime = 'OrbStack' }
elseif ($context -like 'colima*') { $runtime = 'Colima' }
else { $runtime = 'Docker Engine' }
Ok "$runtime is running"

# podman-compose, or an old docker-compose, does not print "Docker Compose version v2..."
$composeOutput = @(Native docker compose version)
$composeVersion = $null
foreach ($line in $composeOutput) {
  if ($line -match 'Docker Compose version v?(\d+\.\d+\.\d+)') { $composeVersion = $Matches[1]; break }
}
$composeReady = $true
if (-not $composeVersion) {
  $first = $composeOutput | Where-Object { $_ -notmatch '^>>>>' } | Select-Object -First 1
  Ko "docker compose is not Docker Compose v2: $first" `
    "The lab needs Docker Compose $MinCompose or later behind the docker compose command." `
    'With Podman, use Docker Compose as its compose provider, not podman-compose.'
  $composeReady = $false
} elseif ([version]$composeVersion -lt $MinCompose) {
  Ko "Docker Compose $composeVersion, the lab needs $MinCompose or later" `
    'compose.yaml uses depends_on with required: false, which older versions do not support. Update the runtime.'
  $composeReady = $false
} else {
  Ok "Docker Compose $composeVersion"
}

$archReady = $true
switch ($arch) {
  { $_ -in 'x86_64', 'amd64' } { Ok 'Architecture amd64'; break }
  { $_ -in 'aarch64', 'arm64' } { Ok 'Architecture arm64'; break }
  default { Ko "Architecture ${arch}: the images are built for amd64 and arm64"; $archReady = $false }
}

# A VM of 8 GB reports a bit less than 8 GiB (7.65 GiB on Docker Desktop), so the check leaves half a GiB
$memoryBytes = [double]$memory
$memoryGb = ($memoryBytes / $GiB).ToString('0.0', [Globalization.CultureInfo]::InvariantCulture)
$memoryReady = $memoryBytes -ge ($minMemoryGb - 0.5) * $GiB
if ($memoryReady) {
  Ok "Memory of the VM: $memoryGb GB"
} else {
  if ($kernel -match 'WSL2') {
    $fix = "Set memory=$($minMemoryGb)GB under [wsl2] in %UserProfile%\.wslconfig, run wsl --shutdown and start Docker Desktop"
  } elseif ($runtime -eq 'Docker Desktop') {
    $fix = "Docker Desktop > Settings > Resources > Memory: $minMemoryGb GB, then Apply & restart"
  } elseif ($runtime -eq 'OrbStack') {
    $fix = "OrbStack > Settings > System > Memory limit: $minMemoryGb GB"
  } elseif ($runtime -eq 'Colima') {
    $fix = "colima stop && colima start --memory $minMemoryGb --cpu 4"
  } elseif ($runtime -eq 'Podman') {
    $fix = "podman machine stop; podman machine set --memory $($minMemoryGb * 1024); podman machine start"
  } else {
    $fix = 'Docker uses the memory of this machine: close other applications'
  }
  $check = "Memory of the VM: $memoryGb GB, the $labProfile profile needs $minMemoryGb GB"
  if ($labProfile -eq 'llm' -and $memoryBytes -ge 3.5 * $GiB) {
    Ko $check $fix "Or use the lite profile, without the local LLM: `$env:COMPOSE_PROFILES = 'lite'; scripts\preflight.ps1"
  } else {
    Ko $check $fix
  }
}

# ci reads the diff of each branch from the repo; a fresh clone has them only on the remote
$tags = @()
if (Get-Command git -ErrorAction SilentlyContinue) {
  $branches = @(Native git -C $Repo for-each-ref '--format=%(refname:lstrip=2)' 'refs/heads/pr/') +
    @(Native git -C $Repo for-each-ref '--format=%(refname:lstrip=3)' 'refs/remotes/origin/pr/')
  $tags = @($branches | Where-Object { $_ } | Sort-Object -Unique | ForEach-Object { $_ -replace '/', '-' })
}
if ($tags.Count -gt 0) {
  Ok "Regression branches: $(($tags | ForEach-Object { $_ -replace '^pr-', 'pr/' }) -join ' ')"
} else {
  Ko 'No pr/* branches in the repo' 'Clone the repo with git clone, without --single-branch, or run git fetch origin'
}

# On Linux, Docker creates a missing out/ as root and the container cannot write the reports
$out = Join-Path $Repo 'out'
$probe = Join-Path $out '.preflight'
try {
  New-Item -ItemType Directory -Force -Path $out -ErrorAction Stop | Out-Null
  Set-Content -Path $probe -Value '' -ErrorAction Stop
  # -Force: outside Windows, PowerShell treats a file that starts with a dot as hidden
  Remove-Item $probe -Force -ErrorAction SilentlyContinue
  Ok 'out/ is writable'
} catch {
  Ko 'out/ is not writable' 'Give your user write access to the out folder of the repo'
}

if (-not $composeReady -or -not $archReady) {
  Skip 'Pull of the images'
  Skip 'Smoke test'
  Summary
}

# Every image of the profile, plus the shop of each branch
$images = @(Compose @profileFlags config --images)
foreach ($tag in $tags) { $images += @(ComposeFor $tag config --images) }
$images = @($images | Where-Object { $_ -match '^\S+:\S+$' } | Sort-Object -Unique)
$missing = @($images | Where-Object { Native docker image inspect $_ | Out-Null; $LASTEXITCODE -ne 0 })

# The free disk is the smaller of the host and the disk of the VM: Docker Desktop on macOS reports
# hundreds of GB inside its VM while the disk of the Mac has much less
$onWindows = $PSVersionTable.PSEdition -eq 'Desktop' -or $IsWindows
if ($onWindows) {
  $freeKb = [math]::Floor((New-Object System.IO.DriveInfo ([System.IO.Path]::GetPathRoot($Repo))).AvailableFreeSpace / 1024)
} else {
  $freeKb = [double]((Native df -Pk $Repo | Select-Object -Index 1) -split '\s+')[3]
}
$thirdparty = $images | Where-Object { $_ -match '/thirdparty:' } | Select-Object -First 1
if ($missing -contains $thirdparty) { Compose pull --quiet thirdparty | Out-Null }
$vmLine = Native docker run --rm --entrypoint df $thirdparty -Pk / | Select-Object -Index 1
if ($LASTEXITCODE -eq 0 -and $vmLine) {
  $vmFreeKb = [double](($vmLine -split '\s+')[3])
  if ($vmFreeKb -lt $freeKb) { $freeKb = $vmFreeKb }
}
$freeGb = [math]::Floor($freeKb / 1048576)
if ($missing.Count -gt 0 -and $freeGb -lt $MinDiskGb) {
  Ko "Free disk: $freeGb GB, the images need $MinDiskGb GB free" `
    "Free space on this machine, or raise the disk limit of the VM of $runtime, and run it again"
  Skip 'Pull of the images'
  Skip 'Smoke test'
  Summary
}
Ok "Free disk: $freeGb GB"

Write-Output ''
Write-Output "Pulling the images of the $labProfile profile and the shop of each branch..."
# Without capturing the output, so the progress of the pull shows
function PullAll {
  & docker compose --project-directory $Repo @profileFlags pull | Out-Host
  if ($LASTEXITCODE -ne 0) { return $false }
  foreach ($tag in $tags) {
    $env:CANDIDATE = $tag
    try { & docker compose --project-directory $Repo pull shop-candidate | Out-Host } finally { Remove-Item Env:CANDIDATE }
    if ($LASTEXITCODE -ne 0) { return $false }
  }
  return $true
}
$pulled = PullAll
Write-Output ''
if ($pulled) {
  Ok 'Pull of the images'
} else {
  Ko 'Pull of the images' 'Check the connection and run it again; the images that finished are kept'
  Skip 'Smoke test'
  Summary
}

if (-not $memoryReady) {
  Skip 'Smoke test, until the VM has enough memory'
  Summary
}

Write-Output 'Running the smoke test inside Compose...'
$start = Get-Date
try {
  $smokeOutput = @(Native docker compose --project-directory $Repo -p $Project run --rm -T agents `
    node --test --test-reporter=spec test/smoke.test.ts test/compose.test.ts test/ollama.test.ts)
  $smokeStatus = $LASTEXITCODE
} finally {
  Native docker compose --project-directory $Repo -p $Project down --remove-orphans | Out-Null
}
$elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds)
# The benchmark test of ollama.test.ts needs experiments/ mounted, so one test is always skipped;
# with the lite profile, the two tests of the local LLM too. The summary line starts with a symbol
# that Windows PowerShell may decode in another code page, so only its words count.
$skipped = $null
foreach ($line in $smokeOutput) { if ($line -match '\bskipped (\d+)\s*$') { $skipped = $Matches[1] } }
$indented = $smokeOutput | ForEach-Object { "      $_" }
if ($smokeStatus -ne 0) {
  Ko "Smoke test failed after $($elapsed)s"
  $indented
} elseif ("$skipped" -ne "$skippedTests") {
  if ($null -eq $skipped) { $skipped = 'no' }
  Ko "Smoke test: $skipped tests skipped, $skippedTests expected"
  $indented
} elseif ($labProfile -eq 'llm') {
  Ok "Smoke test in $($elapsed)s: Chromium, a trace, both shops, no internet and the local LLM"
} else {
  Ok "Smoke test in $($elapsed)s: Chromium, a trace, both shops and no internet"
}

Summary
