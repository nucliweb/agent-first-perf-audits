// Serves local mocks of third-party scripts. Each script accepts two query parameters:
//   delay: server latency before the response, in ms (0 to 10000)
//   cpu:   main-thread time the script blocks when it runs, in ms (0 to 5000)
// Usage: node server.mjs   (PORT, default 4000)
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { SCRIPT_NAMES, scriptSource } from "./scripts.mjs";

const LIMITS = { delay: 10000, cpu: 5000 };

function parseParam(params, name) {
  const raw = params.get(name);
  if (raw === null) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > LIMITS[name]) {
    throw new RangeError(`${name} must be an integer from 0 to ${LIMITS[name]}`);
  }
  return value;
}

// The handler of the mocks, for the server below and for a serverless function
export async function handleThirdParty(req, res) {
  const url = new URL(req.url, "http://localhost");
  const name = url.pathname.slice(1);

  if (req.method === "POST" && name === "collect") {
    req.resume();
    res.writeHead(204, { "access-control-allow-origin": "*" }).end();
    return;
  }

  if (req.method !== "GET" || !SCRIPT_NAMES.includes(name)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found\n");
    return;
  }

  let delay;
  let cpu;
  try {
    delay = parseParam(url.searchParams, "delay");
    cpu = parseParam(url.searchParams, "cpu");
  } catch (err) {
    res.writeHead(400, { "content-type": "text/plain" }).end(`${err.message}\n`);
    return;
  }

  if (delay) await new Promise((ok) => setTimeout(ok, delay));
  res.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "no-store",
    "timing-allow-origin": "*",
  });
  res.end(scriptSource(name, { cpu }));
}

export const createThirdPartyServer = () => createServer(handleThirdParty);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4000);
  createThirdPartyServer().listen(port, () => console.log(`thirdparty listening on http://localhost:${port}`));
}
