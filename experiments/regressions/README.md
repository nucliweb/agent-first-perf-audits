# Experimento: ramas de regresión

Reproduce las cifras de las cuatro ramas de regresión del taller: el gate de WebPerf Snippets sobre cada rama `pr/*`, con `main` como baseline.

## Qué hace

1. Extrae `apps/` de `main` y de cada rama con `git archive`, sin tocar tu árbol de trabajo, y construye la tienda de cada una.
2. Sirve las cinco versiones a la vez, cada una en su puerto, con los mocks de third parties de `main`.
3. Mide dos escenarios, uno detrás de otro para que dos Chromium no se repartan la CPU:
   - `home`: la carga de `/`, con LCP y CLS.
   - `add-to-cart`: la carga de `/product/kenya-aa` y un click en "Add to cart" ([`agents/journeys/add-to-cart.json`](../../agents/journeys/add-to-cart.json)), con `--workflow interaction` para tener el INP.
4. En cada escenario, mide `main` y guarda su JSON como baseline. Después pasa el gate en cada rama: `--baseline` y `--fail-on-regression`, con `--cpu 4 --network fast-4g --runs 5`.
5. Escribe `out/results.json` e imprime una tabla.

## Requisitos

- Node 22.18 o superior.
- Las dependencias de la tienda instaladas: `npm ci` en `apps/shop`. El script las reutiliza en cada rama y se detiene si una rama tiene otro `package-lock.json`.
- Las ramas `pr/*`, en local o en `origin`.
- El Chromium de Playwright 1.63.0: `npx playwright install chromium`.

## Uso

```bash
npm install
npm run measure     # mide main y las cuatro ramas, unos 5 minutos
npm test            # mide otra vez y comprueba los veredictos
```

## Qué comprueba el test

| Rama | Veredicto esperado |
|---|---|
| `pr/lcp-hero-lazy` | El gate falla en `home` con el LCP en `regressed` |
| `pr/cls-promo-banner` | El gate falla en `home` con el CLS en `regressed` |
| `pr/loaf-cart-handler` | El gate falla en `add-to-cart` con el INP en `regressed` |
| `pr/noop-refactor` | El gate pasa en los dos escenarios y ninguna métrica empeora |

El test comprueba el veredicto, no las cifras: los milisegundos cambian de una máquina a otra.

## Resultados en el Mac de referencia

Una ejecución de `npm run measure` en un Apple Silicon de 16 GB:

| Rama | Escenario | Métrica | `main` | Rama | Cambio | p | Exit |
|---|---|---|---|---|---|---|---|
| `pr/lcp-hero-lazy` | home | LCP | 652 ms | 1048 ms | +60,7 % | 0,006 | 1 |
| `pr/cls-promo-banner` | home | CLS | 0 | 0,070 | | 0,002 | 1 |
| `pr/cls-promo-banner` | add-to-cart | CLS | 0 | 0,055 | | 0,002 | 1 |
| `pr/loaf-cart-handler` | add-to-cart | INP | 40 ms | 112 ms | +180 % | 0,005 | 1 |
| `pr/loaf-cart-handler` | home | LCP | 652 ms | 964 ms | +47,9 % | 0,0049 | 1 |
| `pr/noop-refactor` | home | LCP | 652 ms | 644 ms | -1,2 % | 0,084 | 0 |
| `pr/noop-refactor` | add-to-cart | INP | 40 ms | 40 ms | 0 % | 0,5593 | 0 |

Dos ramas empeoran más de una métrica, como pasa en una PR real:

- **El script síncrono de A/B testing de `pr/loaf-cart-handler`** está en el `index.html` común, así que también retrasa el LCP de la home.
- **El hueco del banner sin altura reservada de `pr/cls-promo-banner`** está en todas las páginas, así que también mueve la ficha de producto.

El Judge tiene que atribuir cada métrica a su causa, no solo dar el veredicto.

## Versiones

`webperf-snippets` 1.14.0 y `playwright` 1.63.0, fijadas en [`package.json`](package.json).
