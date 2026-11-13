# Experiment: Chrome DevTools MCP

English · [Castellano](README.es.md) · [Català](README.ca.md)

Reproduces the data of the "Chrome DevTools MCP outside the editor" section of the Learnings page.

## What it does

It starts [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) over stdio with the MCP SDK client, the way the workshop subagents do, against a page served locally. Each test starts a server with different flags and checks a default that the subagents change.

## Requirements

- Node 22 or later.
- The Chromium of Playwright 1.63.0. It is already installed inside the workshop container. Outside it: `npx playwright install chromium`.

## Usage

```bash
npm install
npm test
```

To run it on Linux, inside the `agents` image:

```bash
docker run --rm --network none -v "$PWD":/exp -w /exp agent-first-perf-audits/agents:dev node --test
```

## What the test checks

| Claim | How |
|---|---|
| By default, page tools require `pageId` | `navigate_page` without `pageId` returns an error that names it |
| `--no-page-id-routing` turns it off | `navigate_page` without `pageId` works |
| By default, a trace can be saved in the server's temporary directory | `performance_start_trace` with `filePath` in that directory works |
| That directory is not the client's when `TMPDIR` moves it | A `filePath` in the client's `os.tmpdir()` returns `Access denied`. It only runs when both directories differ, as on macOS |
| By default, nothing can be saved outside the temporary directory | `filePath` in `out/` returns an error and the file does not exist |
| `--workspace` adds one folder and only that one | A trace can be saved in `out/workspace/` but not in `out/` |
| `--workspace` does not remove the temporary directory | With `--workspace`, the server's temporary directory is still allowed |
| The stdio client does not pass `PLAYWRIGHT_BROWSERS_PATH` to the server | With the variable set in the client, Node started with the environment the client passes to the server looks for the Chromium of Playwright in the default path, not in the one of the variable |

The server's temporary directory is computed by starting Node with the same environment that the stdio client passes to the server (`getDefaultEnvironment()` of the SDK).

If a future version of Chrome DevTools MCP changes any of these defaults, the test fails and the Learnings page needs an update.

## Versions

`chrome-devtools-mcp` 1.12.0, `@modelcontextprotocol/client` 2.4.0 and `playwright` 1.63.0, pinned in [`package.json`](package.json).
