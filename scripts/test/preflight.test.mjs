// Runs scripts/preflight.sh against a fake docker and a fake df on the PATH, one case per decision
// of the script: the runtime, the version of Compose, the architecture, the memory of the VM, the
// disk, the pull and the smoke test. The run against a real runtime is the script itself:
//   scripts/preflight.sh
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../preflight.sh", import.meta.url));
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

function preflight(env = {}, { docker = true } = {}) {
  const bin = mkdtempSync(join(tmpdir(), "preflight-bin-"));
  const log = join(bin, "calls.log");
  writeFileSync(log, "");
  if (docker) writeFileSync(join(bin, "docker"), FAKE_DOCKER);
  writeFileSync(join(bin, "df"), FAKE_DF);
  if (docker) chmodSync(join(bin, "docker"), 0o755);
  chmodSync(join(bin, "df"), 0o755);
  const result = spawnSync("sh", [SCRIPT], {
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: process.env.HOME, FAKE_LOG: log, ...DESKTOP, ...env },
  });
  return { ...result, output: result.stdout + result.stderr, calls: readFileSync(log, "utf8") };
}

test("a ready machine passes every check with the llm profile of the .env", () => {
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

test("without docker on the PATH it stops at the first check", () => {
  const { status, output } = preflight({}, { docker: false });
  assert.equal(status, 1);
  assert.match(output, /KO +docker command not found/);
});

test("a runtime that is not running stops before Compose", () => {
  const { status, output, calls } = preflight({ FAKE_DAEMON_DOWN: "1" });
  assert.equal(status, 1);
  assert.match(output, /KO +The container runtime is not running/);
  assert.match(output, /^1 check failed\. Fix it and run/m);
  assert.doesNotMatch(calls, /pull/);
});

test("Compose older than 2.20.2 fails and nothing is pulled", () => {
  const { status, output, calls } = preflight({ FAKE_COMPOSE_VERSION: "Docker Compose version v2.19.1" });
  assert.equal(status, 1);
  assert.match(output, /KO +Docker Compose 2\.19\.1, the lab needs 2\.20\.2 or later/);
  assert.doesNotMatch(calls, /pull/);
});

test("podman-compose behind docker compose is not Compose v2", () => {
  const { status, output } = preflight({ FAKE_COMPOSE_VERSION: "podman-compose version 1.2.0\npodman version 5.2.2" });
  assert.equal(status, 1);
  assert.match(output, /KO +docker compose is not Docker Compose v2: podman-compose version 1\.2\.0/);
});

test("Compose v2 through the external provider of Podman passes", () => {
  const { status, output } = preflight({
    FAKE_COMPONENTS: "Podman Engine",
    FAKE_COMPOSE_VERSION: ">>>> Executing external compose provider \"/usr/local/bin/docker-compose\". <<<<\nDocker Compose version v2.29.7",
  });
  assert.equal(status, 0, output);
  assert.match(output, /OK +Podman/);
  assert.match(output, /OK +Docker Compose 2\.29\.7/);
});

test("an architecture without images fails", () => {
  const { status, output } = preflight({ FAKE_ARCH: "armv7l" });
  assert.equal(status, 1);
  assert.match(output, /KO +Architecture armv7l: the images are built for amd64 and arm64/);
});

test("x86_64 is amd64", () => {
  const { output } = preflight({ FAKE_ARCH: "x86_64" });
  assert.match(output, /OK +Architecture amd64/);
});

const lowMemory = String(4 * GiB);

test("Docker Desktop with too little memory for the llm profile says where to change it and offers lite", () => {
  const { status, output } = preflight({ FAKE_MEM: lowMemory });
  assert.equal(status, 1);
  assert.match(output, /KO +Memory of the VM: 4\.0 GB, the llm profile needs 8 GB/);
  assert.match(output, /Settings > Resources > Memory/);
  assert.match(output, /COMPOSE_PROFILES=lite scripts\/preflight\.sh/);
});

test("Docker Desktop on WSL2 sets the memory in .wslconfig", () => {
  const { output } = preflight({ FAKE_MEM: lowMemory, FAKE_KERNEL: "5.15.167.4-microsoft-standard-WSL2" });
  assert.match(output, /\.wslconfig/);
  assert.match(output, /memory=8GB/);
});

test("Colima with too little memory is restarted with more", () => {
  const { output } = preflight({ FAKE_OS: "Ubuntu 24.04 LTS", FAKE_CONTEXT: "colima", FAKE_MEM: lowMemory });
  assert.match(output, /OK +Colima/);
  assert.match(output, /colima stop && colima start --memory 8 --cpu 4/);
});

test("Podman with too little memory resizes its machine", () => {
  const { output } = preflight({ FAKE_OS: "fedora", FAKE_COMPONENTS: "Podman Engine", FAKE_MEM: lowMemory });
  assert.match(output, /podman machine set --memory 8192/);
});

test("OrbStack with too little memory raises its limit", () => {
  const { output } = preflight({ FAKE_OS: "OrbStack", FAKE_CONTEXT: "orbstack", FAKE_MEM: lowMemory });
  assert.match(output, /OK +OrbStack/);
  assert.match(output, /Settings > System > Memory limit/);
});

test("the lite profile fits in 4 GB, pulls no ollama and expects the LLM tests skipped", () => {
  const { status, output, calls } = preflight({ COMPOSE_PROFILES: "lite", FAKE_MEM: lowMemory, FAKE_SMOKE_OUTPUT: smokeOutput(3) });
  assert.equal(status, 0, output);
  assert.match(output, /OK +Memory of the VM: 4\.0 GB/);
  assert.match(output, /Ready for the workshop with the lite profile/);
  assert.doesNotMatch(calls, /--profile llm/);
  assert.match(calls, /COMPOSE_PROFILES=lite .*run --rm -T agents/);
});

test("the lite profile needs memory too", () => {
  const { status, output } = preflight({ COMPOSE_PROFILES: "lite", FAKE_MEM: String(2 * GiB) });
  assert.equal(status, 1);
  assert.match(output, /KO +Memory of the VM: 2\.0 GB, the lite profile needs 4 GB/);
});

const ALL_IMAGES = "ghcr.io/nucliweb/agent-first-perf-audits/ollama:llama3.2-3b ghcr.io/nucliweb/agent-first-perf-audits/agents:main";

test("missing images with little disk on the host fail before the pull", () => {
  const { status, output, calls } = preflight({ FAKE_MISSING: ALL_IMAGES, FAKE_HOST_FREE_KB: String(9 * 1024 * 1024) });
  assert.equal(status, 1);
  assert.match(output, /KO +Free disk: 9 GB, the images need 15 GB free/);
  assert.doesNotMatch(calls, /--profile run pull/);
});

test("the disk of the VM counts when it is smaller than the host", () => {
  const { status, output } = preflight({ FAKE_MISSING: ALL_IMAGES, FAKE_VM_FREE_KB: String(6 * 1024 * 1024) });
  assert.equal(status, 1);
  assert.match(output, /KO +Free disk: 6 GB/);
});

test("with every image pulled, the free disk is only reported", () => {
  const { status, output } = preflight({ FAKE_HOST_FREE_KB: String(9 * 1024 * 1024) });
  assert.equal(status, 0, output);
  assert.match(output, /OK +Free disk: 9 GB/);
});

test("a failed pull skips the smoke test", () => {
  const { status, output, calls } = preflight({ FAKE_PULL_EXIT: "1" });
  assert.equal(status, 1);
  assert.match(output, /KO +Pull of the images/);
  assert.doesNotMatch(calls, /run --rm -T agents/);
});

test("a failed smoke test shows its output", () => {
  const { status, output } = preflight({ FAKE_SMOKE_EXIT: "1", FAKE_SMOKE_OUTPUT: "✖ Chrome DevTools MCP records a trace of a local page to a file\nℹ fail 1" });
  assert.equal(status, 1);
  assert.match(output, /KO +Smoke test/);
  assert.match(output, /Chrome DevTools MCP records a trace/);
});

test("a skipped LLM test with the llm profile fails the smoke test", () => {
  const { status, output } = preflight({ FAKE_SMOKE_OUTPUT: smokeOutput(3) });
  assert.equal(status, 1);
  assert.match(output, /KO +Smoke test: 3 tests skipped, 1 expected/);
});
