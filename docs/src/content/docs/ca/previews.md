---
title: Les branques al navegador
description: La botiga de main i les quatre branques de regressió desplegades a Vercel, per veure cada regressió sense Docker.
sidebar:
  order: 70
---

La botiga Perf Coffee està desplegada a Vercel: `main` en producció i cada branca `pr/*` com a preview. Serveixen per veure cada regressió al navegador, sense Docker, per exemple si el teu entorn no arrenca o per ensenyar-les en una pantalla. El gate del taller continua mesurant en local, amb les dues botigues a la mateixa màquina.

## Les URL

| Branca | Preview | Què canvia |
|---|---|---|
| `main` | [perf-coffee.vercel.app](https://perf-coffee.vercel.app/) | La versió base |
| `pr/lcp-hero-lazy` | [preview](https://perf-coffee-git-pr-lcp-hero-lazy-nucliweb-projects.vercel.app/) | La imatge del hero perd el preload i el `fetchpriority`, i passa a `loading="lazy"` |
| `pr/cls-promo-banner` | [preview](https://perf-coffee-git-pr-cls-promo-banner-nucliweb-projects.vercel.app/) | El bàner d'un tercer sense espai reservat i un swap de font sense preload |
| `pr/loaf-cart-handler` | [preview](https://perf-coffee-git-pr-loaf-cart-handler-nucliweb-projects.vercel.app/) | Un script síncron d'A/B testing i recomanacions calculades al handler d'afegir a la cistella |
| `pr/noop-refactor` | [preview](https://perf-coffee-git-pr-noop-refactor-nucliweb-projects.vercel.app/) | Extreu el hero a un component: no canvia res |

A Vercel, els scripts de tercers se serveixen des de la mateixa botiga, a `/thirdparty/`, amb la mateixa latència i el mateix cost de CPU que els mocks del laboratori.

## Com veure cada regressió

Obre les dues versions a Chrome amb el panell Performance de DevTools, en un viewport de mòbil, amb **CPU 4x** i la xarxa a **Fast 4G**, les condicions del gate:

- **LCP a `pr/lcp-hero-lazy`:** enregistra la càrrega de la home. La imatge del hero es demana tard, i el retard de càrrega del recurs és la fase que creix.
- **CLS a `pr/cls-promo-banner`:** enregistra la càrrega de la home. El bàner de promo empeny la pàgina cap avall.
- **INP a `pr/loaf-cart-handler`:** a la fitxa d'un producte, enregistra el clic a "Add to cart". El handler triga molt més, i l'LCP de la home també empitjora per l'script síncron.

Sense limitar la xarxa, la regressió d'LCP no es veu: en una connexió ràpida, la imatge `lazy` arriba a temps igualment. Les de CLS i INP es veuen també sense limitar la xarxa.

## Les xifres

Medianes de cinc execucions per lloc, cadascuna en un context nou de Chromium amb viewport de mòbil: l'LCP i el CLS de la home, i la durada del clic a "Add to cart" a la fitxa de `kenya-aa`. Mesurades el 12 de novembre de 2026 des d'un portàtil contra Vercel; cada execució passa per la xarxa, així que les teves xifres seran semblants, no iguals.

Amb CPU 4x i `fast-4g`, les condicions del gate:

| Branca | LCP | CLS | Clic |
|---|---|---|---|
| `main` | 1000 ms | 0 | 64 ms |
| `pr/lcp-hero-lazy` | 1488 ms | 0 | 56 ms |
| `pr/cls-promo-banner` | 1100 ms | 0,0524 | 64 ms |
| `pr/loaf-cart-handler` | 1296 ms | 0 | 216 ms |
| `pr/noop-refactor` | 1024 ms | 0 | 64 ms |

Amb CPU 4x, sense limitar la xarxa:

| Branca | LCP | CLS | Clic |
|---|---|---|---|
| `main` | 940 ms | 0 | 64 ms |
| `pr/lcp-hero-lazy` | 940 ms | 0 | 64 ms |
| `pr/cls-promo-banner` | 964 ms | 0,0524 | 56 ms |
| `pr/loaf-cart-handler` | 1236 ms | 0 | 216 ms |
| `pr/noop-refactor` | 852 ms | 0 | 64 ms |

La regressió d'LCP i la de CLS queden dins de "good" en valor absolut: es veuen comparant amb `main`, com fa el gate.

## Comprova-ho

L'experiment [`experiments/previews`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/previews) mesura els cinc llocs en les dues condicions i comprova aquestes conclusions:

```bash
cd experiments/previews
npm install
npx playwright install chromium
npm run measure     # mesura de nou i reescriu results.json
npm test            # comprova les conclusions i les xifres d'aquesta pàgina
```

## El que no són

Les previews no substitueixen el gate. Cada mesura passa per la xarxa fins a Vercel i depèn de la teva connexió, i la versió base i la branca no es mesuren a la mateixa màquina ni en la mateixa execució. El gate del taller compara les dues botigues en local, en les mateixes condicions, i decideix amb estadística.
