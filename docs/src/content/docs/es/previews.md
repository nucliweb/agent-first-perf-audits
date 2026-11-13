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

## Lo que se ve

### LCP: el hero llega tarde

<img src="/evidence/lcp-filmstrip-es.jpg" alt="La carga de la home de main y de pr/lcp-hero-lazy, fotograma a fotograma: en la rama, la página tiene el texto antes que la imagen del hero" width="2800" height="1608" loading="lazy" decoding="async">

La carga de la home en la ejecución mediana de cinco: el LCP de `main` llega a los 0,98 s y el de `pr/lcp-hero-lazy` a los 1,46 s. En la rama, la página ya tiene el texto y los botones, pero el hueco del hero sigue vacío varios fotogramas: con `loading="lazy"` y sin preload, el navegador no pide la imagen hasta que sabe que está en pantalla.

### CLS: el banner empuja la página

<img src="/evidence/cls-shift-es.jpg" alt="La home de main, con el espacio del banner reservado, junto a la de pr/cls-promo-banner, donde el contenido baja al llegar el banner" width="2264" height="1828" loading="lazy" decoding="async">

En `main`, el banner de promo tiene su espacio reservado. En `pr/cls-promo-banner` llega cuando la página ya está pintada, ocupa el sitio del hero y todo el contenido baja 48 px de golpe. La línea discontinua marca dónde empezaba el hero y la continua, dónde acaba.

### INP: el handler del carrito

<img src="/evidence/inp-phases-es.png" alt="Las tres fases del click en Add to cart en main y en pr/loaf-cart-handler: el procesamiento es la que crece" width="2800" height="480" loading="lazy" decoding="async">

El click en "Add to cart", con la mediana de cada fase: el procesamiento pasa de 9 ms a 168 ms, y el retraso de entrada y el de presentación apenas cambian. El tiempo de más está en el handler, que calcula las recomendaciones antes de pintar.

## Las cifras

Medianas de cinco ejecuciones por sitio, cada una en un contexto nuevo de Chromium con viewport de móvil: el LCP y el CLS de la home, y la duración del click en "Add to cart" en la ficha de `kenya-aa`. Medidas el 12 de noviembre de 2026 desde un portátil contra Vercel; cada ejecución pasa por la red, así que tus cifras serán parecidas, no iguales.

Con CPU 4x y `fast-4g`, las condiciones del gate:

| Rama | LCP | CLS | Click |
|---|---|---|---|
| `main` | 1028 ms | 0 | 56 ms |
| `pr/lcp-hero-lazy` | 1488 ms | 0 | 64 ms |
| `pr/cls-promo-banner` | 1016 ms | 0,0524 | 64 ms |
| `pr/loaf-cart-handler` | 1340 ms | 0 | 224 ms |
| `pr/noop-refactor` | 1072 ms | 0 | 64 ms |

Con CPU 4x, sin limitar la red:

| Rama | LCP | CLS | Click |
|---|---|---|---|
| `main` | 988 ms | 0 | 80 ms |
| `pr/lcp-hero-lazy` | 908 ms | 0 | 64 ms |
| `pr/cls-promo-banner` | 884 ms | 0,0524 | 64 ms |
| `pr/loaf-cart-handler` | 1232 ms | 0 | 224 ms |
| `pr/noop-refactor` | 864 ms | 0 | 64 ms |

La regresión de LCP y la de CLS quedan dentro de "good" en valor absoluto: se ven comparando con `main`, como hace el gate.

## Compruébalo

El experimento [`experiments/previews`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/previews/README.es.md) mide los cinco sitios en las dos condiciones y comprueba estas conclusiones:

```bash
cd experiments/previews
npm install
npx playwright install chromium
npm run measure     # mide de nuevo y reescribe results.json
npm test            # comprueba las conclusiones y las cifras de esta página
```

## Lo que no son

Las previews no sustituyen al gate. Cada medida pasa por la red hasta Vercel y depende de tu conexión, y la versión base y la rama no se miden en la misma máquina ni en la misma ejecución. El gate del taller compara las dos tiendas en local, en las mismas condiciones, y decide con estadística.
