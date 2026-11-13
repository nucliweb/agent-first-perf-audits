---
title: "Paso 5: el gate en ci contra las cuatro ramas"
description: El gate de rendimiento de una pull request, contra las tres regresiones y el refactor que no cambia nada.
sidebar:
  order: 15
---

## Objetivo

Usar lo construido como lo usaría un equipo: un gate en el CI de cada pull request. El servicio `ci` compara la tienda de una rama con la de `main` y sale con 0 si pasa, 1 si alguna métrica empeora y 2 si no ha podido medir. Contra las cuatro ramas del taller tiene que dar tres fallos y un pass.

## Qué vas a escribir

Nada. `ci` es el Judge del paso 4 sin los subagentes: el gate de la CLI, los traces, las reglas y la explicación. En este paso se ejecuta y se leen sus informes.

## Las ramas

| Rama | Cambio | Qué empeora |
|---|---|---|
| `pr/lcp-hero-lazy` | La imagen del hero pierde el preload y el `fetchpriority`, y pasa a `loading="lazy"` | LCP |
| `pr/cls-promo-banner` | El banner de un tercero sin espacio reservado y un swap de fuente sin preload | CLS |
| `pr/loaf-cart-handler` | Un script síncrono de A/B testing y recomendaciones calculadas en el handler de añadir al carrito | INP y LCP |
| `pr/noop-refactor` | Extrae el hero a un componente | Nada: el control de falsos positivos |

Los tests de la app pasan en las cuatro: el CI clásico no ve ninguna regresión. Las tres quedan dentro de "good" en valor absoluto; el gate las detecta porque compara con `main`, no con los umbrales de Google.

Las cuatro ramas también están desplegadas en Vercel, para verlas en el navegador sin Docker: [Las ramas en el navegador](../../previews/).

## Compruébalo

Cada rama en su carpeta de `out/ci/`, para que los informes no se pisen:

```bash
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose run --rm -e OUT=/out/ci/$branch ci
  echo "$branch: exit $?"
done
```

`docker compose run` arranca la tienda de cada rama antes de medirla. Cada rama tarda unos minutos, porque el gate mide cinco veces cada escenario en cada lado; mientras corre la siguiente, lee el `report.md` de la anterior. Fíjate en cuatro cosas:

- `pr/loaf-cart-handler` empeora dos métricas por dos causas distintas, y el Judge pide una explicación por cada una.
- `pr/noop-refactor` pasa y el LLM no llega a ser consultado: sin regresión, las reglas responden solas, y no hay ocasión de inventarse una.
- En `pr/lcp-hero-lazy`, la explicación del LLM nombra `loading="lazy"`, y los hechos de las reglas, al final del informe, añaden lo que no dice: el `fetchPriority` y el preload que pierde el hero.
- Con el perfil `lite`, cada carpeta tiene un `handoff.md` en lugar de la explicación. Enviarlo a un servicio externo es una decisión de cada equipo para su propio código.

```bash
docker compose run --rm agents npm run check -- step-05
```
