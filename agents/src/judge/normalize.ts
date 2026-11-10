// Removes the absolute timestamps and the ids of a trace from a TOON summary of trace-engine-cli,
// before it goes into the prompt of the LLM. They change in every trace and tell a small model
// nothing; the durations, the names and the URLs stay.

const DROP_COLUMNS = new Set(["startTimeMs", "interactionId"]);
const DROP_KEYS = new Set(["minMs", "maxMs", "navigationStartMs", "timestampMs", "navigationId", "interactionId"]);

const TABLE = /^(\s*)(\w+)\[(\d+)\]\{([^}]*)\}:$/;
const KEY = /^(\s*)(- )?(\w+):/;

// Splits a TOON row on its commas, keeping the commas inside double quotes
export function splitRow(row: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (const char of row) {
    if (char === '"') quoted = !quoted;
    if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

export function normalizeSummary(toon: string): string {
  const lines = toon.split("\n");
  const out: string[] = [];
  // While reading the rows of a table: its indent and which columns stay
  let table: { indent: number; keep: boolean[] } | null = null;
  let pendingDash: number | null = null; // the "- " of a dropped list item, for the next key of that item

  for (const line of lines) {
    if (table) {
      const indent = line.match(/^\s*/)![0].length;
      if (line.trim() && indent > table.indent) {
        const cells = splitRow(line.trim()).filter((_, i) => table!.keep[i]);
        out.push(`${" ".repeat(indent)}${cells.join(",")}`);
        continue;
      }
      table = null;
    }

    const header = line.match(TABLE);
    if (header) {
      const [, indent, name, count, columns] = header;
      const names = columns.split(",");
      const keep = names.map((column) => !DROP_COLUMNS.has(column));
      out.push(`${indent}${name}[${count}]{${names.filter((_, i) => keep[i]).join(",")}}:`);
      table = { indent: indent.length, keep };
      continue;
    }

    const key = line.match(KEY);
    if (key && DROP_KEYS.has(key[3])) {
      if (key[2]) pendingDash = key[1].length;
      continue;
    }
    if (key && pendingDash !== null && key[1].length === pendingDash + 2 && !key[2]) {
      out.push(`${" ".repeat(pendingDash)}- ${line.trimStart()}`);
      pendingDash = null;
      continue;
    }
    pendingDash = null;
    out.push(line);
  }
  return out.join("\n");
}
