# Experimento: Chrome DevTools MCP

Reproduce los datos de la sección "Chrome DevTools MCP fuera del editor" de la página Learnings.

## Qué hace

Arranca [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) por stdio con el cliente del SDK de MCP, como lo hacen los subagentes del taller, contra una página servida en local. Cada test arranca un servidor con unos flags distintos y comprueba un valor por defecto que los subagentes cambian.

## Requisitos

- Node 22 o superior.
- El Chromium de Playwright 1.63.0. Dentro del contenedor del taller ya está instalado. Fuera de él: `npx playwright install chromium`.

## Uso

```bash
npm install
npm test
```

Para ejecutarlo en Linux, dentro de la imagen `agents`:

```bash
docker run --rm --network none -v "$PWD":/exp -w /exp agent-first-perf-audits/agents:dev node --test
```

## Qué comprueba el test

| Afirmación | Cómo |
|---|---|
| Por defecto, las tools de página exigen `pageId` | `navigate_page` sin `pageId` devuelve un error que lo nombra |
| `--no-page-id-routing` lo desactiva | `navigate_page` sin `pageId` funciona |
| Por defecto, se puede guardar un trace en el directorio temporal del servidor | `performance_start_trace` con `filePath` en ese directorio funciona |
| Ese directorio no es el del cliente si `TMPDIR` lo cambia | Un `filePath` en el `os.tmpdir()` del cliente devuelve `Access denied`. Solo se ejecuta si los dos directorios son distintos, como en macOS |
| Por defecto, no se puede guardar fuera del directorio temporal | `filePath` en `out/` devuelve un error y el fichero no existe |
| `--workspace` añade una carpeta y solo esa | Se puede guardar en `out/workspace/` pero no en `out/` |
| `--workspace` no quita el directorio temporal | Con `--workspace`, el directorio temporal del servidor sigue permitido |
| El cliente stdio no pasa `PLAYWRIGHT_BROWSERS_PATH` al servidor | Con la variable en el cliente, Node arrancado con el entorno que el cliente pasa al servidor busca el Chromium de Playwright en la ruta por defecto, no en la de la variable |

El directorio temporal del servidor se calcula arrancando Node con el mismo entorno que el cliente stdio pasa al servidor (`getDefaultEnvironment()` del SDK).

Si una versión futura de Chrome DevTools MCP cambia alguno de estos valores por defecto, el test fallará y habrá que actualizar la página Learnings.

## Versiones

`chrome-devtools-mcp` 1.12.0, `@modelcontextprotocol/client` 2.4.0 y `playwright` 1.63.0, fijadas en [`package.json`](package.json).
