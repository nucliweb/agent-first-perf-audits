---
title: Las ramas en el navegador
description: La tienda de main y las cuatro ramas de regresión desplegadas en Vercel, para ver cada regresión sin Docker.
sidebar:
  order: 70
---

La tienda Perf Coffee está desplegada en Vercel: `main` en producción y cada rama `pr/*` como preview. Sirven para ver cada regresión en el navegador, sin Docker, por ejemplo si tu entorno no arranca o para enseñarlas en una pantalla. El gate del taller sigue midiendo en local, con las dos tiendas en la misma máquina.

## Las URL

| Rama | Preview | Qué cambia |
|---|---|---|
| `main` | [perf-coffee.vercel.app](https://perf-coffee.vercel.app/) | La versión base |
| `pr/lcp-hero-lazy` | [preview](https://perf-coffee-git-pr-lcp-hero-lazy-nucliweb-projects.vercel.app/) | La imagen del hero pierde el preload y el `fetchpriority`, y pasa a `loading="lazy"` |
| `pr/cls-promo-banner` | [preview](https://perf-coffee-git-pr-cls-promo-banner-nucliweb-projects.vercel.app/) | El banner de un tercero sin espacio reservado y un swap de fuente sin preload |
| `pr/loaf-cart-handler` | [preview](https://perf-coffee-git-pr-loaf-cart-handler-nucliweb-projects.vercel.app/) | Un script síncrono de A/B testing y recomendaciones calculadas en el handler de añadir al carrito |
| `pr/noop-refactor` | [preview](https://perf-coffee-git-pr-noop-refactor-nucliweb-projects.vercel.app/) | Extrae el hero a un componente: no cambia nada |

En Vercel, los scripts de terceros se sirven desde la propia tienda, en `/thirdparty/`, con la misma latencia y el mismo coste de CPU que los mocks del laboratorio.

## Cómo ver cada regresión

Abre las dos versiones en Chrome con el panel Performance de DevTools, en un viewport de móvil, con **CPU 4x** y la red en **Fast 4G**, las condiciones del gate:

- **LCP en `pr/lcp-hero-lazy`:** graba la carga de la home. La imagen del hero se pide tarde, y el retraso de carga del recurso es la fase que crece.
- **CLS en `pr/cls-promo-banner`:** graba la carga de la home. El banner de promo empuja la página hacia abajo.
- **INP en `pr/loaf-cart-handler`:** en la ficha de un producto, graba el click en "Add to cart". El handler tarda mucho más, y el LCP de la home también empeora por el script síncrono.

Sin limitar la red, la regresión de LCP no se ve: en una conexión rápida, la imagen `lazy` llega a tiempo igual. Las de CLS e INP se ven también sin limitar la red.

## Las cifras

Medianas de cinco ejecuciones por sitio, cada una en un contexto nuevo de Chromium con viewport de móvil: el LCP y el CLS de la home, y la duración del click en "Add to cart" en la ficha de `kenya-aa`. Medidas el 12 de noviembre de 2026 desde un portátil contra Vercel; cada ejecución pasa por la red, así que tus cifras serán parecidas, no iguales.

Con CPU 4x y `fast-4g`, las condiciones del gate:

| Rama | LCP | CLS | Click |
|---|---|---|---|
| `main` | 1000 ms | 0 | 64 ms |
| `pr/lcp-hero-lazy` | 1488 ms | 0 | 56 ms |
| `pr/cls-promo-banner` | 1100 ms | 0,0524 | 64 ms |
| `pr/loaf-cart-handler` | 1296 ms | 0 | 216 ms |
| `pr/noop-refactor` | 1024 ms | 0 | 64 ms |

Con CPU 4x, sin limitar la red:

| Rama | LCP | CLS | Click |
|---|---|---|---|
| `main` | 940 ms | 0 | 64 ms |
| `pr/lcp-hero-lazy` | 940 ms | 0 | 64 ms |
| `pr/cls-promo-banner` | 964 ms | 0,0524 | 56 ms |
| `pr/loaf-cart-handler` | 1236 ms | 0 | 216 ms |
| `pr/noop-refactor` | 852 ms | 0 | 64 ms |

La regresión de LCP y la de CLS quedan dentro de "good" en valor absoluto: se ven comparando con `main`, como hace el gate.

## Compruébalo

El experimento [`experiments/previews`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/previews) mide los cinco sitios en las dos condiciones y comprueba estas conclusiones:

```bash
cd experiments/previews
npm install
npx playwright install chromium
npm run measure     # mide de nuevo y reescribe results.json
npm test            # comprueba las conclusiones y las cifras de esta página
```

## Lo que no son

Las previews no sustituyen al gate. Cada medida pasa por la red hasta Vercel y depende de tu conexión, y la versión base y la rama no se miden en la misma máquina ni en la misma ejecución. El gate del taller compara las dos tiendas en local, en las mismas condiciones, y decide con estadística.
