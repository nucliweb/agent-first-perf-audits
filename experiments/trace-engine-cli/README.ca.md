# Experiment: trace-engine-cli

[English](README.md) · [Castellano](README.es.md) · Català

Reprodueix les dades de la secció "No tot ha de ser un MCP" de la pàgina Learnings.

## Què fa

1. Serveix [`fixture/index.html`](fixture/index.html) en local. La pàgina té dues regressions:
   - un bàner que arriba 600 ms després de la càrrega sense espai reservat (CLS),
   - un handler de clic, `addToCart`, que bloqueja el fil principal 180 ms (INP).
2. Grava un trace de Chromium amb Playwright i CPU throttling 4x: càrrega, espera d'1,5 s, clic i espera de 800 ms.
3. Executa les quatre ordres de [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli) que fa servir el Judge del taller i mesura la mida de cada resum.
4. Grava un altre trace del mateix recorregut amb [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) i compara el que un agent rep de cada eina per a aquest mateix fitxer: el resum de `performance_stop_trace` i cada insight de `performance_analyze_insight`, davant dels quatre resums de trace-engine-cli.

## Requisits

- Node 22 o superior.
- El Chromium de Playwright 1.63.0. Dins del contenidor del taller ja està instal·lat. Fora: `npx playwright install chromium`.

## Ús

```bash
npm install
npm test            # grava un trace i verifica les conclusions
npm run record      # grava out/trace.json
npm run summarize   # mostra els resums i la taula de mides
npm run compare     # compara Chrome DevTools MCP i trace-engine-cli sobre el mateix trace
```

Els tests s'executen un darrere l'altre (`--test-concurrency=1`): dos Chromium alhora es reparteixen la CPU i contaminen les mesures.

`summarize` accepta un altre trace com a argument, per exemple un d'exportat des del panell Performance de DevTools:

```bash
npm run summarize -- ~/Downloads/Trace-20261109.json.gz
```

## Què comprova el test

Els mil·lisegons canvien d'una màquina a una altra, així que [`summary.test.mjs`](summary.test.mjs) fa servir llindars:

| Afirmació | Llindar |
|---|---|
| Cada resum és compacte | Menys de 2 KB |
| Els quatre resums redueixen el trace | Més d'un 99 % |
| `overview` detecta el CLS | CLS d'almenys 0,1 |
| `interactions` atribueix l'INP al handler | INP de més de 150 ms, amb el processing més gran que l'input delay i que el presentation delay |
| `tasks` anomena la funció | `addToCart` amb almenys 150 ms de self time, la seva URL i la seva línia |
| `shifts` no dona selectors | El node culpable apareix com a `Node #<id>` |

L'última asserció documenta una limitació: els selectors vénen de WebPerf Snippets. Si una versió futura de trace-engine-cli els afegeix, el test fallarà i caldrà actualitzar la pàgina Learnings.

## Què comprova la comparació

[`compare.test.mjs`](compare.test.mjs) també fa servir llindars:

| Afirmació | Llindar |
|---|---|
| Chrome DevTools MCP dona més text a l'agent | Més del triple de bytes que trace-engine-cli |
| Totes dues detecten el CLS | CLS d'almenys 0,1 a totes dues |
| Totes dues desglossen l'INP | INP de més de 150 ms, amb el processing més gran que l'input delay i que el presentation delay |
| Només trace-engine-cli anomena la funció | `addToCart` apareix a `tasks` i a cap sortida de Chrome DevTools MCP |

L'última asserció documenta una altra limitació, aquesta vegada de Chrome DevTools MCP. Si una versió futura atribueix l'INP a la funció, el test fallarà i caldrà revisar la decisió de fer servir trace-engine-cli.

## Versions

`trace-engine-cli` 0.2.0, `chrome-devtools-mcp` 1.12.0, `@modelcontextprotocol/client` 2.4.0 i `playwright` 1.63.0, fixades a [`package.json`](package.json).
