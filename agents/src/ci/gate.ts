// The ci service: the performance gate of a pull request, inside Docker Compose. It runs the gate,
// the traces and the explanation of the Judge (pipeline.ts) and writes the reports and the handoff
// to OUT. It exits with 0 when the gate passes, 1 when it fails and 2 when it could not run.
import { gateRunFromEnv, runGate } from "./pipeline.ts";

const log = (message: string) => console.error(`[ci] ${message}`);

// Inside the chain, so a variable that is not set also exits with 2
process.exitCode = await Promise.resolve()
  .then(() => runGate(gateRunFromEnv(process.env.OUT || "/out", log)))
  .then((report) => (report.verdict === "pass" ? 0 : 1))
  .catch((error) => {
    console.error(error);
    return 2;
  });
