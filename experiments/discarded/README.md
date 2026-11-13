# Experimento: alternativas descartadas

Reproduce los datos de tres filas de la página mapa ("Por qué este stack"). En cada una, mide la alternativa descartada al lado de lo que usa el taller, con las mismas herramientas que el gate y el Judge.

| Decisión del taller | Alternativa descartada | Qué se mide |
|---|---|---|
| El gate mide con red fast-4g | Medir sin throttling de red | El gate en `pr/lcp-hero-lazy` con `--cpu 4 --runs 5`, sin `--network fast-4g` |
| El servidor de la tienda hace preload de la imagen LCP | Una versión base sin preload | El gate en `pr/lcp-hero-lazy` contra un `main` sin el preload del hero |
| El build conserva los nombres de función (`keepNames`) | La minificación por defecto | Los sospechosos del INP de `pr/loaf-cart-handler` y la línea del diff con la que los relaciona el Judge, con un build de `main` y de la rama sin `keepNames` |

## Qué hace

1. Construye seis versiones de la tienda con el `build` de [`experiments/regressions`](../regressions): `main`, `pr/lcp-hero-lazy` y `pr/loaf-cart-handler` tal cual; `main` sin la marca `<!-- lcp-preload -->` de `index.html`, donde `server.mjs` pone el preload de la imagen LCP de cada ruta; y `main` y `pr/loaf-cart-handler` con `keepNames: false` en `vite.config.ts`.
2. Las sirve a la vez, cada una en su puerto, con los mocks de third parties de `main`.
3. Pasa el gate de la home en `pr/lcp-hero-lazy` tres veces: con las condiciones del gate, sin throttling de red y contra el `main` sin preload. Es la misma llamada a la CLI que [`agents/src/judge/gate.ts`](../../agents/src/judge/gate.ts), con las condiciones de cada caso.
4. Graba el trace del click en "Add to cart" de cada lado con [`record`](../../agents/src/judge/traces.ts), lo resume con trace-engine-cli y aplica las reglas del Judge: [`suspectsFor`](../../agents/src/judge/suspects.ts) y [`matchSuspects`](../../agents/src/judge/match.ts) con el diff de `pr/loaf-cart-handler`.
5. Escribe `out/results.json` e imprime un resumen.

Las mediciones van una detrás de otra, para que dos Chromium no se repartan la CPU.

## Requisitos

Los mismos que `experiments/regressions`: Node 22.18 o superior, `npm ci` en `apps/shop`, las ramas `pr/*` en local o en `origin` y el Chromium de Playwright 1.63.0 (`npx playwright install chromium`).

## Uso

```bash
npm install
npm run measure     # construye y mide las seis versiones, unos 3 minutos
npm test            # mide otra vez y comprueba cada afirmación
```

## Qué comprueba el test

| Afirmación | Cómo |
|---|---|
| Con las condiciones del gate, el LCP de `pr/lcp-hero-lazy` empeora | El LCP sale `regressed` y la CLI sale con 1 |
| Sin throttling de red, el gate no ve la regresión | El LCP no sale `regressed` y la CLI sale con 0 |
| Sin el preload del hero en `main`, el gate no ve la regresión | El LCP no sale `regressed` y la CLI sale con 0 |
| Con `keepNames`, el Judge relaciona el INP con el diff | El sospechoso es `recommendFor` y la regla lo relaciona con la línea que lo llama |
| Sin `keepNames`, el Judge no puede | Sigue habiendo un sospechoso, pero no se llama `recommendFor` y ninguna línea relacionada lo nombra |

El test comprueba los veredictos, no las cifras: los milisegundos cambian de una máquina a otra.

## Resultados en el Mac de referencia

Dos ejecuciones seguidas en un Apple Silicon de 16 GB, con el Chromium completo de Playwright. El LCP de `pr/lcp-hero-lazy` en la home:

| Caso | Versión base | Rama | Cambio | p | Umbral | Veredicto |
|---|---|---|---|---|---|---|
| Condiciones del gate | 652 y 648 ms | 1060 ms | +62,6 y +63,6 % | 0,0056 y 0,0058 | 100 ms | `regressed` |
| Sin throttling de red | 484 ms | 500 y 504 ms | +3,3 y +4,1 % | 0,0058 y 0,0688 | 100 ms | `unchanged` |
| Sin preload en `main` | 1028 y 1032 ms | 1068 ms | +3,9 y +3,5 % | 0,006 y 0,0055 | 102,8 y 103,2 ms | `unchanged` |

El umbral del LCP en la CLI es el mayor entre 100 ms y el 10 % de la versión base.

- **Sin throttling de red**, la imagen del hero llega casi al instante aunque se pida tarde: el LCP sube entre 16 y 20 ms, muy por debajo del umbral. A veces la diferencia es significativa (p menor que 0,05), pero el gate solo falla si además supera el umbral.
- **Sin preload**, la imagen ya se descubre tarde en `main`, cuando el JavaScript pinta la página, y su LCP pasa de unos 650 ms a unos 1030. Quitar `fetchpriority` y añadir `loading="lazy"` solo suma entre 36 y 40 ms más.

El INP de `pr/loaf-cart-handler`, con las reglas del Judge:

| Build | Sospechoso | Self time | Línea del diff relacionada |
|---|---|---|---|
| Con `keepNames` | `recommendFor` | 78 y 78 ms | `setRecommended(recommendFor(product.slug));` en `apps/shop/src/pages.tsx` |
| Sin `keepNames` | `Ae` | 80 y 80 ms | Ninguna |

Sin `keepNames`, el Judge sigue viendo que una función nueva tarda unos 80 ms en el click, pero el profiler la llama `Ae`, un nombre que no está en el diff. trace-engine-cli no lee source maps, así que el Judge no tiene forma de saber que es `recommendFor`.

## Versiones

`webperf-snippets` 1.15.0, `trace-engine-cli` 0.2.0 y `playwright` 1.63.0, fijadas en [`package.json`](package.json), las mismas que en `experiments/regressions` y `experiments/models`.
