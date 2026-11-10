// Ejecuta trace-engine-cli sobre un trace y muestra el tamaño de cada resumen.
// Uso: node summarize.mjs [trace]   (por defecto out/trace.json)
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const CLI = resolve(dirname(require.resolve("trace-engine-cli/package.json")), "dist/bin/trace-engine-cli.js");

// Los comandos que usa el Judge del taller
export const COMMANDS = {
  overview: ["overview"],
  interactions: ["interactions"],
  "tasks --tree bottom-up --top 5": ["tasks", "--tree", "bottom-up", "--top", "5"],
  "shifts --events": ["shifts", "--events"],
};

export function summarize(trace = resolve(HERE, "out/trace.json"), format = "toon") {
  const traceBytes = statSync(trace).size;
  const summaries = Object.entries(COMMANDS).map(([name, args]) => {
    const output = execFileSync(process.execPath, [CLI, ...args, trace, "--format", format], { encoding: "utf8" });
    return { name, bytes: Buffer.byteLength(output), output };
  });
  return { traceBytes, summaries };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { traceBytes, summaries } = summarize(process.argv[2] && resolve(process.argv[2]));
  for (const { name, output } of summaries) console.log(`## ${name}\n\n${output.trim()}\n`);
  console.log(`| Comando | Bytes | Reducción |\n|---|---|---|`);
  for (const { name, bytes } of summaries) {
    console.log(`| \`${name}\` | ${bytes} | ${(100 - (bytes / traceBytes) * 100).toFixed(2)} % |`);
  }
  console.log(`\nTrace original: ${traceBytes} bytes`);
}
