# Experiment: Chrome DevTools MCP

[English](README.md) · [Castellano](README.es.md) · Català

Reprodueix les dades de la secció "Chrome DevTools MCP fora de l'editor" de la pàgina Learnings.

## Què fa

Arrenca [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) per stdio amb el client de l'SDK de MCP, com ho fan els subagents del taller, contra una pàgina servida en local. Cada test arrenca un servidor amb uns flags diferents i comprova un valor per defecte que els subagents canvien.

## Requisits

- Node 22 o superior.
- El Chromium de Playwright 1.63.0. Dins del contenidor del taller ja està instal·lat. Fora: `npx playwright install chromium`.

## Ús

```bash
npm install
npm test
```

Per executar-lo a Linux, dins de la imatge `agents`:

```bash
docker run --rm --network none -v "$PWD":/exp -w /exp agent-first-perf-audits/agents:dev node --test
```

## Què comprova el test

| Afirmació | Com |
|---|---|
| Per defecte, les tools de pàgina exigeixen `pageId` | `navigate_page` sense `pageId` retorna un error que l'anomena |
| `--no-page-id-routing` ho desactiva | `navigate_page` sense `pageId` funciona |
| Per defecte, es pot desar un trace al directori temporal del servidor | `performance_start_trace` amb `filePath` en aquest directori funciona |
| Aquest directori no és el del client si `TMPDIR` el canvia | Un `filePath` a l'`os.tmpdir()` del client retorna `Access denied`. Només s'executa si els dos directoris són diferents, com a macOS |
| Per defecte, no es pot desar fora del directori temporal | `filePath` a `out/` retorna un error i el fitxer no existeix |
| `--workspace` afegeix una carpeta i només aquesta | Es pot desar a `out/workspace/` però no a `out/` |
| `--workspace` no treu el directori temporal | Amb `--workspace`, el directori temporal del servidor continua permès |
| El client stdio no passa `PLAYWRIGHT_BROWSERS_PATH` al servidor | Amb la variable al client, Node arrencat amb l'entorn que el client passa al servidor busca el Chromium de Playwright a la ruta per defecte, no a la de la variable |

El directori temporal del servidor es calcula arrencant Node amb el mateix entorn que el client stdio passa al servidor (`getDefaultEnvironment()` de l'SDK).

Si una versió futura de Chrome DevTools MCP canvia algun d'aquests valors per defecte, el test fallarà i caldrà actualitzar la pàgina Learnings.

## Versions

`chrome-devtools-mcp` 1.12.0, `@modelcontextprotocol/client` 2.4.0 i `playwright` 1.63.0, fixades a [`package.json`](package.json).
