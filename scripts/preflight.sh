#!/usr/bin/env sh
# Checks at home, with a good connection, that this machine is ready for the workshop: the container
# runtime and its version of Compose, the architecture, the memory of the VM, the regression
# branches and the free disk. Then it pulls every image and runs a smoke test inside Compose:
# Chromium starts, a trace is recorded, both shops answer, the lab has no internet and, with the
# llm profile, the local LLM answers JSON within the time limit of its test. It prints OK or KO for
# each check and exits with 0 when the machine is ready.
#   scripts/preflight.sh                              the profile of .env (llm)
#   COMPOSE_PROFILES=lite scripts/preflight.sh        for machines with 8 GB, without the local LLM
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
# The smoke test runs in a Compose project of its own, so it does not touch a running lab
PROJECT=agent-first-perf-audits-preflight
MIN_COMPOSE=2.20.2
# What the images need on a first pull, as the README asks
MIN_DISK_GB=15

failures=0
ok() { printf '  OK  %s\n' "$1"; }
skip() { printf '  --  %s\n' "$1"; }
# The first argument is the check; the rest, one line each, say how to fix it
ko() {
  printf '  KO  %s\n' "$1"
  shift
  for line in "$@"; do printf '      %s\n' "$line"; done
  failures=$((failures + 1))
}

summary() {
  echo
  if [ "$failures" -eq 0 ]; then
    echo "Ready for the workshop with the $profile profile."
    if [ "$profile" = lite ]; then
      echo "Without the local LLM, ci gives the same verdict and attribution, and writes the explanation"
      echo "request to out/handoff.md for an agent of your choice. Sending the diff to an external service"
      echo "is a decision of each team for its own code."
    fi
    exit 0
  fi
  if [ "$failures" -eq 1 ]; then
    echo "1 check failed. Fix it and run scripts/preflight.sh again."
  else
    echo "$failures checks failed. Fix them and run scripts/preflight.sh again."
  fi
  exit 1
}

compose() { docker compose --project-directory "$REPO" "$@"; }

# 0 when version $1 is lower than version $2
version_lt() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if (x[i] + 0 < y[i] + 0) exit 0; if (x[i] + 0 > y[i] + 0) exit 1 }
    exit 1
  }'
}

# The profile, as Compose resolves it: the environment first, then the .env of the repo
if [ -z "${COMPOSE_PROFILES+set}" ] && [ -f "$REPO/.env" ]; then
  COMPOSE_PROFILES="$(sed -n 's/^COMPOSE_PROFILES=//p' "$REPO/.env" | tail -n 1)"
fi
export COMPOSE_PROFILES="${COMPOSE_PROFILES:-}"
case ",$COMPOSE_PROFILES," in
  *,llm,*) profile=llm; min_memory_gb=8; profile_flags="--profile llm --profile run"; skipped_tests=1 ;;
  *) profile=lite; min_memory_gb=4; profile_flags="--profile run"; skipped_tests=3 ;;
esac

echo "Preflight of the workshop with the $profile profile"
echo

if ! command -v docker >/dev/null 2>&1; then
  ko "docker command not found" "Install a container runtime: Docker Desktop, OrbStack, Colima or Podman (see the README)"
  summary
fi

if ! info="$(docker info --format '{{.OperatingSystem}}|{{.Architecture}}|{{.MemTotal}}|{{.KernelVersion}}' 2>/dev/null)"; then
  ko "The container runtime is not running" \
    "Start Docker Desktop or OrbStack, or run colima start --memory 8 --cpu 4, or podman machine start"
  summary
fi
IFS='|' read -r os arch memory kernel <<EOF
$info
EOF

components="$(docker version --format '{{range .Server.Components}}{{.Name}} {{end}}' 2>/dev/null || true)"
context="$(docker context show 2>/dev/null || true)"
case "$components|$os|$context" in
  *Podman*) runtime=Podman ;;
  *"|Docker Desktop|"*) runtime="Docker Desktop" ;;
  *"|OrbStack|"* | *"|orbstack") runtime=OrbStack ;;
  *"|colima"*) runtime=Colima ;;
  *) runtime="Docker Engine" ;;
esac
ok "$runtime is running"

# podman-compose, or an old docker-compose, does not print "Docker Compose version v2..."
compose_output="$(docker compose version 2>&1)"
compose_version="$(printf '%s\n' "$compose_output" |
  sed -n 's/.*Docker Compose version v\{0,1\}\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' | head -n 1)"
compose_ready=true
if [ -z "$compose_version" ]; then
  ko "docker compose is not Docker Compose v2: $(printf '%s\n' "$compose_output" | grep -v '^>>>>' | head -n 1)" \
    "The lab needs Docker Compose $MIN_COMPOSE or later behind the docker compose command." \
    "With Podman, use Docker Compose as its compose provider, not podman-compose."
  compose_ready=false
elif version_lt "$compose_version" "$MIN_COMPOSE"; then
  ko "Docker Compose $compose_version, the lab needs $MIN_COMPOSE or later" \
    "compose.yaml uses depends_on with required: false, which older versions do not support. Update the runtime."
  compose_ready=false
else
  ok "Docker Compose $compose_version"
fi

case "$arch" in
  x86_64 | amd64) ok "Architecture amd64"; arch_ready=true ;;
  aarch64 | arm64) ok "Architecture arm64"; arch_ready=true ;;
  *) ko "Architecture $arch: the images are built for amd64 and arm64"; arch_ready=false ;;
esac

# A VM of 8 GB reports a bit less than 8 GiB (7.65 GiB on Docker Desktop), so the check leaves half a GiB
memory_gb="$(awk -v b="$memory" 'BEGIN { printf "%.1f", b / 1073741824 }')"
if awk -v b="$memory" -v gb="$min_memory_gb" 'BEGIN { exit !(b >= (gb - 0.5) * 1073741824) }'; then
  ok "Memory of the VM: $memory_gb GB"
  memory_ready=true
else
  case "$runtime|$kernel" in
    *WSL2*) fix="Set memory=${min_memory_gb}GB under [wsl2] in %UserProfile%\\.wslconfig, run wsl --shutdown and start Docker Desktop" ;;
    "Docker Desktop|"*) fix="Docker Desktop > Settings > Resources > Memory: $min_memory_gb GB, then Apply & restart" ;;
    OrbStack*) fix="OrbStack > Settings > System > Memory limit: $min_memory_gb GB" ;;
    Colima*) fix="colima stop && colima start --memory $min_memory_gb --cpu 4" ;;
    Podman*) fix="podman machine stop && podman machine set --memory $((min_memory_gb * 1024)) && podman machine start" ;;
    *) fix="Docker uses the memory of this machine: close other applications" ;;
  esac
  if [ "$profile" = llm ] && awk -v b="$memory" 'BEGIN { exit !(b >= 3.5 * 1073741824) }'; then
    ko "Memory of the VM: $memory_gb GB, the $profile profile needs $min_memory_gb GB" "$fix" \
      "Or use the lite profile, without the local LLM: COMPOSE_PROFILES=lite scripts/preflight.sh"
  else
    ko "Memory of the VM: $memory_gb GB, the $profile profile needs $min_memory_gb GB" "$fix"
  fi
  memory_ready=false
fi

# ci reads the diff of each branch from the repo; a fresh clone has them only on the remote
if command -v git >/dev/null 2>&1; then
  branches="$({
    git -C "$REPO" for-each-ref --format='%(refname:lstrip=2)' 'refs/heads/pr/'
    git -C "$REPO" for-each-ref --format='%(refname:lstrip=3)' 'refs/remotes/origin/pr/'
  } 2>/dev/null | sort -u)"
else
  branches=""
fi
tags="$(printf '%s\n' "$branches" | tr '/' '-' | sed '/^$/d')"
if [ -n "$tags" ]; then
  ok "Regression branches: $(printf '%s\n' "$tags" | sed 's/^pr-/pr\//' | tr '\n' ' ' | sed 's/ $//')"
else
  ko "No pr/* branches in the repo" "Clone the repo with git clone, without --single-branch, or run git fetch origin"
fi

# On Linux, Docker creates a missing out/ as root and the container cannot write the reports
mkdir -p "$REPO/out" 2>/dev/null
if [ -w "$REPO/out" ]; then
  ok "out/ is writable"
else
  ko "out/ is not writable" "Docker created it as root: sudo chown -R \"\$(id -u):\$(id -g)\" out"
fi

if [ "$compose_ready" != true ] || [ "$arch_ready" != true ]; then
  skip "Pull of the images"
  skip "Smoke test"
  summary
fi

# Every image of the profile, plus the shop of each branch
# shellcheck disable=SC2086 # the profile flags split on spaces on purpose
images="$({
  compose $profile_flags config --images
  for tag in $tags; do env CANDIDATE="$tag" docker compose --project-directory "$REPO" config --images; done
} 2>/dev/null | sort -u)"
missing=""
for image in $images; do
  docker image inspect "$image" >/dev/null 2>&1 || missing="$missing $image"
done

# The free disk is the smaller of the host and the disk of the VM: Docker Desktop on macOS reports
# hundreds of GB inside its VM while the disk of the Mac has much less
free_kb="$(df -Pk "$REPO" | awk 'NR == 2 { print $4 }')"
thirdparty="$(printf '%s\n' "$images" | grep '/thirdparty:' | head -n 1)"
case "$missing " in *" $thirdparty "*) compose pull --quiet thirdparty >/dev/null 2>&1 ;; esac
vm_free_kb="$(docker run --rm --entrypoint df "$thirdparty" -Pk / 2>/dev/null | awk 'NR == 2 { print $4 }')"
if [ -n "$vm_free_kb" ] && [ "$vm_free_kb" -lt "$free_kb" ]; then free_kb="$vm_free_kb"; fi
free_gb=$((free_kb / 1048576))
if [ -n "$missing" ] && [ "$free_gb" -lt "$MIN_DISK_GB" ]; then
  ko "Free disk: $free_gb GB, the images need $MIN_DISK_GB GB free" \
    "Free space on this machine, or raise the disk limit of the VM of $runtime, and run it again"
  skip "Pull of the images"
  skip "Smoke test"
  summary
fi
ok "Free disk: $free_gb GB"

echo
echo "Pulling the images of the $profile profile and the shop of each branch..."
pull_all() {
  # shellcheck disable=SC2086
  compose $profile_flags pull || return 1
  for tag in $tags; do
    env CANDIDATE="$tag" docker compose --project-directory "$REPO" pull shop-candidate || return 1
  done
}
if pull_all; then
  echo
  ok "Pull of the images"
else
  echo
  ko "Pull of the images" "Check the connection and run it again; the images that finished are kept"
  skip "Smoke test"
  summary
fi

if [ "$memory_ready" != true ]; then
  skip "Smoke test, until the VM has enough memory"
  summary
fi

cleanup() { docker compose --project-directory "$REPO" -p "$PROJECT" down --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
echo "Running the smoke test inside Compose..."
start="$(date +%s)"
smoke_output="$(docker compose --project-directory "$REPO" -p "$PROJECT" run --rm -T agents \
  node --test --test-reporter=spec test/smoke.test.ts test/compose.test.ts test/ollama.test.ts 2>&1)"
smoke_status=$?
elapsed=$(($(date +%s) - start))
cleanup
# The benchmark test of ollama.test.ts needs experiments/ mounted, so one test is always skipped;
# with the lite profile, the two tests of the local LLM too
skipped="$(printf '%s\n' "$smoke_output" | sed -n 's/^ℹ skipped \([0-9][0-9]*\).*/\1/p' | tail -n 1)"
indented="$(printf '%s\n' "$smoke_output" | sed 's/^/      /')"
if [ "$smoke_status" -ne 0 ]; then
  ko "Smoke test failed after ${elapsed}s"
  printf '%s\n' "$indented"
elif [ "${skipped:-}" != "$skipped_tests" ]; then
  ko "Smoke test: ${skipped:-no} tests skipped, $skipped_tests expected"
  printf '%s\n' "$indented"
elif [ "$profile" = llm ]; then
  ok "Smoke test in ${elapsed}s: Chromium, a trace, both shops, no internet and the local LLM"
else
  ok "Smoke test in ${elapsed}s: Chromium, a trace, both shops and no internet"
fi

summary
