# Experiment: alternatives descartades

[English](README.md) · [Castellano](README.es.md) · Català

Reprodueix les dades de tres files de la pàgina mapa ("Per què aquest stack"). En cadascuna, mesura l'alternativa descartada al costat del que fa servir el taller, amb les mateixes eines que el gate i el Judge.

| Decisió del taller | Alternativa descartada | Què es mesura |
|---|---|---|
| El gate mesura amb xarxa fast-4g | Mesurar sense throttling de xarxa | El gate a `pr/lcp-hero-lazy` amb `--cpu 4 --runs 5 --max-runs 7`, sense `--network fast-4g` |
| El servidor de la botiga fa preload de la imatge LCP | Una versió base sense preload | El gate a `pr/lcp-hero-lazy` contra un `main` sense el preload del hero |
| El build conserva els noms de funció (`keepNames`) | La minificació per defecte | Els sospitosos de l'INP de `pr/loaf-cart-handler` i la línia del diff amb què els relaciona el Judge, amb un build de `main` i de la branca sense `keepNames` |

## Què fa

1. Construeix sis versions de la botiga amb el `build` d'[`experiments/regressions`](../regressions/README.ca.md): `main`, `pr/lcp-hero-lazy` i `pr/loaf-cart-handler` tal com són; `main` sense la marca `<!-- lcp-preload -->` d'`index.html`, on `server.mjs` posa el preload de la imatge LCP de cada ruta; i `main` i `pr/loaf-cart-handler` amb `keepNames: false` a `vite.config.ts`.
2. Les serveix alhora, cadascuna al seu port, amb els mocks de third parties de `main`.
3. Passa el gate de la home a `pr/lcp-hero-lazy` tres vegades: amb les condicions del gate, sense throttling de xarxa i contra el `main` sense preload. És la mateixa crida a la CLI que [`agents/src/judge/gate.ts`](../../agents/src/judge/gate.ts), amb les condicions de cada cas: una crida per cas, amb `--baseline` apuntant a la URL de la botiga base, que la CLI mesura en la mateixa crida, alternant una execució de cada una, 5 per costat i fins a 7 si el resultat no és concloent.
4. Grava el trace del clic a "Add to cart" de cada costat amb [`record`](../../agents/src/judge/traces.ts), el resumeix amb trace-engine-cli i aplica les regles del Judge: [`suspectsFor`](../../agents/src/judge/suspects.ts) i [`matchSuspects`](../../agents/src/judge/match.ts) amb el diff de `pr/loaf-cart-handler`.
5. Escriu `out/results.json` i imprimeix un resum.

Les mesures van una darrere l'altra, perquè dos Chromium no es reparteixin la CPU.

## Requisits

Els mateixos que `experiments/regressions`: Node 22.18 o superior, `npm ci` a `apps/shop`, les branques `pr/*` en local o a `origin` i el Chromium de Playwright 1.63.0 (`npx playwright install chromium`).

## Ús

```bash
npm install
npm run measure     # construeix i mesura les sis versions, uns 3 minuts
npm test            # mesura una altra vegada i comprova cada afirmació
```

## Què comprova el test

| Afirmació | Com |
|---|---|
| Amb les condicions del gate, l'LCP de `pr/lcp-hero-lazy` empitjora | L'LCP surt `regressed` i la CLI surt amb 1 |
| Sense throttling de xarxa, el gate no veu la regressió | L'LCP no surt `regressed` i la CLI surt amb 0 |
| Sense el preload del hero a `main`, el gate no veu la regressió | L'LCP no surt `regressed` i la CLI surt amb 0 |
| Amb `keepNames`, el Judge relaciona l'INP amb el diff | El sospitós és `recommendFor` i la regla el relaciona amb la línia que el crida |
| Sense `keepNames`, el Judge no pot | Continua havent-hi un sospitós, però no es diu `recommendFor` i cap línia relacionada no l'anomena |

El test comprova els veredictes, no les xifres: els mil·lisegons canvien d'una màquina a una altra.

## Resultats al Mac de referència

Una execució en un Apple Silicon de 16 GB, amb el Chromium complet de Playwright. L'LCP de `pr/lcp-hero-lazy` a la home:

| Cas | Versió base | Branca | Canvi | p | Llindar | Veredicte |
|---|---|---|---|---|---|---|
| Condicions del gate | 648 ms | 1060 ms | +63,6 % | 0,0058 | 100 ms | `regressed` |
| Sense throttling de xarxa | 484 ms | 492 ms | +1,7 % | 0,1217 | 100 ms | `unchanged` |
| Sense preload a `main` | 1028 ms | 1056 ms | +2,7 % | 0,0055 | 102,8 ms | `unchanged` |

El llindar de l'LCP a la CLI és el més gran entre 100 ms i el 10 % de la versió base.

- **Sense throttling de xarxa**, la imatge del hero arriba gairebé a l'instant encara que es demani tard: l'LCP puja 8 ms, molt per sota del llindar, i la diferència no és significativa (p 0,1217). Sense preload sí que ho és (p 0,0055) però no supera el llindar: el gate només falla si es donen les dues coses.
- **Sense preload**, la imatge ja es descobreix tard a `main`, quan el JavaScript pinta la pàgina, i el seu LCP passa de 648 ms a 1028. Treure `fetchpriority` i afegir `loading="lazy"` només hi suma 28 ms més.

L'INP de `pr/loaf-cart-handler`, amb les regles del Judge:

| Build | Sospitós | Self time | Línia del diff relacionada |
|---|---|---|---|
| Amb `keepNames` | `recommendFor` | 78 ms | `setRecommended(recommendFor(product.slug));` a `apps/shop/src/pages.tsx` |
| Sense `keepNames` | `Ae` | 78 ms | Cap |

Sense `keepNames`, el Judge continua veient que una funció nova triga uns 78 ms al clic, però el profiler l'anomena `Ae`, un nom que no és al diff. trace-engine-cli no llegeix source maps, així que el Judge no té manera de saber que és `recommendFor`.

## Versions

`webperf-snippets` 1.17.0, `trace-engine-cli` 0.2.0 i `playwright` 1.63.0, fixades a [`package.json`](package.json), les mateixes que a `experiments/regressions` i `experiments/models`.
