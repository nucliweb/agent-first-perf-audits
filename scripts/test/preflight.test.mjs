// Runs scripts/preflight.sh and scripts/preflight.ps1 against a fake docker and a fake df on the
// PATH, one case per decision of the scripts: the runtime, the version of Compose, the architecture,
// the memory of the VM, the disk, the pull and the smoke test. The cases of preflight.ps1 need pwsh
// (or its path in PWSH); without it they are skipped. In a container, from the root of the repo:
//   docker run --rm -v "$PWD:/repo" -w /repo node:22.23.4-bookworm-slim sh scripts/test/pwsh.sh
// The run against a real runtime is the script itself: scripts/preflight.sh or scripts/preflight.ps1
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SH = fileURLToPath(new URL("../preflight.sh", import.meta.url));
const PS1 = fileURLToPath(new URL("../preflight.ps1", import.meta.url));
const PWSH = process.env.PWSH || spawnSync("sh", ["-c", "command -v pwsh"], { encoding: "utf8" }).stdout.trim();

// Each script, with the command it tells to run the preflight again with the lite profile
const SHELLS = [
  { name: "sh", command: "sh", args: [SH], lite: "COMPOSE_PROFILES=lite scripts/preflight.sh" },
  {
    name: "pwsh",
    command: PWSH,
    args: ["-NoProfile", "-NonInteractive", "-File", PS1],
    lite: "$env:COMPOSE_PROFILES = 'lite'; scripts\\preflight.ps1",
    skip: PWSH ? false : "pwsh is not installed",
  },
];
const GiB = 1024 ** 3;

const FAKE_DOCKER = `#!/bin/sh
echo "CANDIDATE=\${CANDIDATE:-} COMPOSE_PROFILES=\${COMPOSE_PROFILES:-} docker $*" >> "$FAKE_LOG"
case "$*" in
  "info "*)
    [ -z "$FAKE_DAEMON_DOWN" ] || { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    echo "$FAKE_OS|$FAKE_ARCH|$FAKE_MEM|$FAKE_KERNEL" ;;
  "version "*) echo "$FAKE_COMPONENTS" ;;
  "context show") echo "$FAKE_CONTEXT" ;;
  "compose version") printf '%s\\n' "$FAKE_COMPOSE_VERSION" ;;
  *"config --images"*)
    echo ghcr.io/nucliweb/agent-first-perf-audits/agents:main
    echo ghcr.io/nucliweb/agent-first-perf-audits/thirdparty:main
    echo ghcr.io/nucliweb/agent-first-perf-audits/shop:main
    echo "ghcr.io/nucliweb/agent-first-perf-audits/shop:\${CANDIDATE:-pr-noop-refactor}"
    case "$*" in *"--profile llm"*) echo ghcr.io/nucliweb/agent-first-perf-audits/ollama:llama3.2-3b ;; esac ;;
  "image inspect "*)
    case " $FAKE_MISSING " in *" $3 "*) exit 1 ;; esac ;;
  *" pull"*) exit "\${FAKE_PULL_EXIT:-0}" ;;
  "run --rm --entrypoint df "*)
    echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
    echo "overlay 474095688 53588836 $FAKE_VM_FREE_KB 12% /" ;;
  *" run "*) printf '%s\\n' "$FAKE_SMOKE_OUTPUT"; exit "\${FAKE_SMOKE_EXIT:-0}" ;;
  *" down"*) ;;
  *) echo "fake docker: unexpected $*" >&2; exit 99 ;;
esac
`;

const FAKE_DF = `#!/bin/sh
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/disk3s5 482797652 425292720 $FAKE_HOST_FREE_KB 96% /"
`;

const smokeOutput = (skipped) =>
  ["✔ the model answers JSON constrained by a schema", "ℹ tests 7", `ℹ pass ${7 - skipped}`, "ℹ fail 0", `ℹ skipped ${skipped}`].join("\n");

// Docker Desktop on a Mac with 8 GB for the VM, every image already pulled
const DESKTOP = {
  FAKE_OS: "Docker Desktop",
  FAKE_ARCH: "aarch64",
  FAKE_MEM: String(8218034176),
  FAKE_KERNEL: "6.10.14-linuxkit",
  FAKE_COMPONENTS: "Engine containerd runc docker-init",
  FAKE_CONTEXT: "desktop-linux",
  FAKE_COMPOSE_VERSION: "Docker Compose version v2.38.2-desktop.1",
  FAKE_MISSING: "",
  FAKE_HOST_FREE_KB: String(19 * 1024 * 1024),
  FAKE_VM_FREE_KB: String(396 * 1024 * 1024),
  FAKE_SMOKE_OUTPUT: smokeOutput(1),
};

function run(shell, env = {}, { docker = true } = {}) {
  const bin = mkdtempSync(join(tmpdir(), "preflight-bin-"));
  const log = join(bin, "calls.log");
  writeFileSync(log, "");
  if (docker) writeFileSync(join(bin, "docker"), FAKE_DOCKER);
  writeFileSync(join(bin, "df"), FAKE_DF);
  if (docker) chmodSync(join(bin, "docker"), 0o755);
  chmodSync(join(bin, "df"), 0o755);
  const result = spawnSync(shell.command, shell.args, {
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: process.env.HOME, FAKE_LOG: log, ...DESKTOP, ...env },
  });
  return { ...result, output: result.stdout + result.stderr, calls: readFileSync(log, "utf8") };
}

// Every case runs against both scripts
function both(name, fn) {
  for (const shell of SHELLS) {
    test(`${shell.name}: ${name}`, { skip: shell.skip }, () => fn((env, options) => run(shell, env, options), shell));
  }
}

both("a ready machine passes every check with the llm profile of the .env", (preflight, shell) => {
  const { status, output, calls } = preflight();
  assert.equal(status, 0, output);
  assert.match(output, /OK +Docker Desktop/);
  assert.match(output, /OK +Docker Compose 2\.38\.2/);
  assert.match(output, /OK +Architecture arm64/);
  assert.match(output, /OK +Memory of the VM: 7\.7 GB/);
  assert.match(output, /OK +Smoke test/);
  assert.match(output, /Ready for the workshop with the llm profile/);
  assert.match(calls, /docker compose .*--profile llm --profile run pull/);
  for (const branch of ["pr-lcp-hero-lazy", "pr-cls-promo-banner", "pr-loaf-cart-handler", "pr-noop-refactor"]) {
    assert.match(calls, new RegExp(`CANDIDATE=${branch} .*docker compose .*pull shop-candidate`), branch);
  }
  // The smoke test runs in a Compose project of its own, removed at the end
  assert.match(calls, /docker compose .*-p agent-first-perf-audits-preflight .*run --rm -T agents/);
  assert.match(calls, /docker compose .*-p agent-first-perf-audits-preflight .*down/);
});

both("without docker on the PATH it stops at the first check", (preflight, shell) => {
  const { status, output } = preflight({}, { docker: false });
  assert.equal(status, 1);
  assert.match(output, /KO +docker command not found/);
});

both("a runtime that is not running stops before Compose", (preflight, shell) => {
  const { status, output, calls } = preflight({ FAKE_DAEMON_DOWN: "1" });
  assert.equal(status, 1);
  assert.match(output, /KO +The container runtime is not running/);
  assert.match(output, /^1 check failed\. Fix it and run/m);
  assert.doesNotMatch(calls, /pull/);
});

both("Compose older than 2.20.2 fails and nothing is pulled", (preflight, shell) => {
  const { status, output, calls } = preflight({ FAKE_COMPOSE_VERSION: "Docker Compose version v2.19.1" });
  assert.equal(status, 1);
  assert.match(output, /KO +Docker Compose 2\.19\.1, the lab needs 2\.20\.2 or later/);
  assert.doesNotMatch(calls, /pull/);
});

both("podman-compose behind docker compose is not Compose v2", (preflight, shell) => {
  const { status, output } = preflight({ FAKE_COMPOSE_VERSION: "podman-compose version 1.2.0\npodman version 5.2.2" });
  assert.equal(status, 1);
  assert.match(output, /KO +docker compose is not Docker Compose v2: podman-compose version 1\.2\.0/);
});

both("Compose v2 through the external provider of Podman passes", (preflight, shell) => {
  const { status, output } = preflight({
    FAKE_COMPONENTS: "Podman Engine",
    FAKE_COMPOSE_VERSION: ">>>> Executing external compose provider \"/usr/local/bin/docker-compose\". <<<<\nDocker Compose version v2.29.7",
  });
  assert.equal(status, 0, output);
  assert.match(output, /OK +Podman/);
  assert.match(output, /OK +Docker Compose 2\.29\.7/);
});

both("an architecture without images fails", (preflight, shell) => {
  const { status, output } = preflight({ FAKE_ARCH: "armv7l" });
  assert.equal(status, 1);
  assert.match(output, /KO +Architecture armv7l: the images are built for amd64 and arm64/);
});

both("x86_64 is amd64", (preflight, shell) => {
  const { output } = preflight({ FAKE_ARCH: "x86_64" });
  assert.match(output, /OK +Architecture amd64/);
});

const lowMemory = String(4 * GiB);

both("Docker Desktop with too little memory for the llm profile says where to change it and offers lite", (preflight, shell) => {
  const { status, output } = preflight({ FAKE_MEM: lowMemory });
  assert.equal(status, 1);
  assert.match(output, /KO +Memory of the VM: 4\.0 GB, the llm profile needs 8 GB/);
  assert.match(output, /Settings > Resources > Memory/);
  assert.ok(output.includes(shell.lite), output);
});

both("Docker Desktop on WSL2 sets the memory in .wslconfig", (preflight, shell) => {
  const { output } = preflight({ FAKE_MEM: lowMemory, FAKE_KERNEL: "5.15.167.4-microsoft-standard-WSL2" });
  assert.match(output, /\.wslconfig/);
  assert.match(output, /memory=8GB/);
});

both("Colima with too little memory is restarted with more", (preflight, shell) => {
  const { output } = preflight({ FAKE_OS: "Ubuntu 24.04 LTS", FAKE_CONTEXT: "colima", FAKE_MEM: lowMemory });
  assert.match(output, /OK +Colima/);
  assert.match(output, /colima stop && colima start --memory 8 --cpu 4/);
});

both("Podman with too little memory resizes its machine", (preflight, shell) => {
  const { output } = preflight({ FAKE_OS: "fedora", FAKE_COMPONENTS: "Podman Engine", FAKE_MEM: lowMemory });
  assert.match(output, /podman machine set --memory 8192/);
});

both("OrbStack with too little memory raises its limit", (preflight, shell) => {
  const { output } = preflight({ FAKE_OS: "OrbStack", FAKE_CONTEXT: "orbstack", FAKE_MEM: lowMemory });
  assert.match(output, /OK +OrbStack/);
  assert.match(output, /Settings > System > Memory limit/);
});

both("the lite profile fits in 4 GB, pulls no ollama and expects the LLM tests skipped", (preflight, shell) => {
  const { status, output, calls } = preflight({ COMPOSE_PROFILES: "lite", FAKE_MEM: lowMemory, FAKE_SMOKE_OUTPUT: smokeOutput(3) });
  assert.equal(status, 0, output);
  assert.match(output, /OK +Memory of the VM: 4\.0 GB/);
  assert.match(output, /Ready for the workshop with the lite profile/);
  assert.doesNotMatch(calls, /--profile llm/);
  assert.match(calls, /COMPOSE_PROFILES=lite .*run --rm -T agents/);
});

both("the lite profile needs memory too", (preflight, shell) => {
  const { status, output } = preflight({ COMPOSE_PROFILES: "lite", FAKE_MEM: String(2 * GiB) });
  assert.equal(status, 1);
  assert.match(output, /KO +Memory of the VM: 2\.0 GB, the lite profile needs 4 GB/);
});

const ALL_IMAGES = "ghcr.io/nucliweb/agent-first-perf-audits/ollama:llama3.2-3b ghcr.io/nucliweb/agent-first-perf-audits/agents:main";

both("missing images with little disk on the host fail before the pull", (preflight, shell) => {
  const { status, output, calls } = preflight({ FAKE_MISSING: ALL_IMAGES, FAKE_HOST_FREE_KB: String(9 * 1024 * 1024) });
  assert.equal(status, 1);
  assert.match(output, /KO +Free disk: 9 GB, the images need 15 GB free/);
  assert.doesNotMatch(calls, /--profile run pull/);
});

both("the disk of the VM counts when it is smaller than the host", (preflight, shell) => {
  const { status, output } = preflight({ FAKE_MISSING: ALL_IMAGES, FAKE_VM_FREE_KB: String(6 * 1024 * 1024) });
  assert.equal(status, 1);
  assert.match(output, /KO +Free disk: 6 GB/);
});

both("with every image pulled, the free disk is only reported", (preflight, shell) => {
  const { status, output } = preflight({ FAKE_HOST_FREE_KB: String(9 * 1024 * 1024) });
  assert.equal(status, 0, output);
  assert.match(output, /OK +Free disk: 9 GB/);
});

both("a failed pull skips the smoke test", (preflight, shell) => {
  const { status, output, calls } = preflight({ FAKE_PULL_EXIT: "1" });
  assert.equal(status, 1);
  assert.match(output, /KO +Pull of the images/);
  assert.doesNotMatch(calls, /run --rm -T agents/);
});

both("a failed smoke test shows its output", (preflight, shell) => {
  const { status, output } = preflight({ FAKE_SMOKE_EXIT: "1", FAKE_SMOKE_OUTPUT: "✖ Chrome DevTools MCP records a trace of a local page to a file\nℹ fail 1" });
  assert.equal(status, 1);
  assert.match(output, /KO +Smoke test/);
  assert.match(output, /Chrome DevTools MCP records a trace/);
});

both("a skipped LLM test with the llm profile fails the smoke test", (preflight, shell) => {
  const { status, output } = preflight({ FAKE_SMOKE_OUTPUT: smokeOutput(3) });
  assert.equal(status, 1);
  assert.match(output, /KO +Smoke test: 3 tests skipped, 1 expected/);
});
