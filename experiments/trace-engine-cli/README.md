# Experimento: trace-engine-cli

Reproduce los datos de la sección "No todo tiene que ser un MCP" de la página Learnings.

## Qué hace

1. Sirve [`fixture/index.html`](fixture/index.html) en local. La página tiene dos regresiones:
   - un banner que llega 600 ms después de la carga sin espacio reservado (CLS),
   - un handler de click, `addToCart`, que bloquea el hilo principal 180 ms (INP).
2. Graba un trace de Chromium con Playwright y CPU throttling 4x: carga, espera de 1,5 s, click y espera de 800 ms.
3. Ejecuta los cuatro comandos de [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli) que usa el Judge del taller y mide el tamaño de cada resumen.
4. Graba otro trace del mismo recorrido con [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) y compara lo que un agente recibe de cada herramienta para ese mismo fichero: el resumen de `performance_stop_trace` y cada insight de `performance_analyze_insight`, frente a los cuatro resúmenes de trace-engine-cli.

## Requisitos

- Node 22 o superior.
- El Chromium de Playwright 1.63.0. Dentro del contenedor del taller ya está instalado. Fuera de él: `npx playwright install chromium`.

## Uso

```bash
npm install
npm test            # graba un trace y verifica las conclusiones
npm run record      # graba out/trace.json
npm run summarize   # muestra los resúmenes y la tabla de tamaños
npm run compare     # compara Chrome DevTools MCP y trace-engine-cli sobre el mismo trace
```

Los tests se ejecutan uno detrás de otro (`--test-concurrency=1`): dos Chromium a la vez se reparten la CPU y contaminan las medidas.

`summarize` acepta otro trace como argumento, por ejemplo uno exportado desde el panel Performance de DevTools:

```bash
npm run summarize -- ~/Downloads/Trace-20261109.json.gz
```

## Qué comprueba el test

Los milisegundos cambian de una máquina a otra, así que [`summary.test.mjs`](summary.test.mjs) usa umbrales:

| Afirmación | Umbral |
|---|---|
| Cada resumen es compacto | Menos de 2 KB |
| Los cuatro resúmenes reducen el trace | Más de un 99 % |
| `overview` detecta el CLS | CLS de al menos 0,1 |
| `interactions` atribuye el INP al handler | INP de más de 150 ms, con el processing mayor que el input delay y que el presentation delay |
| `tasks` nombra la función | `addToCart` con al menos 150 ms de self time, su URL y su línea |
| `shifts` no da selectores | El nodo culpable aparece como `Node #<id>` |

La última aserción documenta una limitación: los selectores vienen de WebPerf Snippets. Si una versión futura de trace-engine-cli los añade, el test fallará y habrá que actualizar la página Learnings.

## Qué comprueba la comparación

[`compare.test.mjs`](compare.test.mjs) también usa umbrales:

| Afirmación | Umbral |
|---|---|
| Chrome DevTools MCP da más texto al agente | Más del triple de bytes que trace-engine-cli |
| Las dos detectan el CLS | CLS de al menos 0,1 en las dos |
| Las dos desglosan el INP | INP de más de 150 ms, con el processing mayor que el input delay y que el presentation delay |
| Solo trace-engine-cli nombra la función | `addToCart` aparece en `tasks` y en ninguna salida de Chrome DevTools MCP |

La última aserción documenta otra limitación, esta vez de Chrome DevTools MCP. Si una versión futura atribuye el INP a la función, el test fallará y habrá que revisar la decisión de usar trace-engine-cli.

## Versiones

`trace-engine-cli` 0.2.0, `chrome-devtools-mcp` 1.12.0, `@modelcontextprotocol/client` 2.4.0 y `playwright` 1.63.0, fijadas en [`package.json`](package.json).
