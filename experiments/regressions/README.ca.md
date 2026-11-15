# Experiment: branques de regressió

[English](README.md) · [Castellano](README.es.md) · Català

Reprodueix les xifres de les quatre branques de regressió del taller: el gate de WebPerf Snippets sobre cada branca `pr/*`, amb `main` com a baseline.

## Què fa

1. Extreu `apps/` de `main` i de cada branca amb `git archive`, sense tocar el teu arbre de treball, i construeix la botiga de cadascuna.
2. Serveix les cinc versions alhora, cadascuna al seu port, amb els mocks de third parties de `main`.
3. Mesura dos escenaris, un darrere l'altre perquè dos Chromium no es reparteixin la CPU:
   - `home`: la càrrega de `/`, amb LCP i CLS.
   - `add-to-cart`: la càrrega de `/product/kenya-aa` i un clic a "Add to cart" ([`agents/journeys/add-to-cart.json`](../../agents/journeys/add-to-cart.json)), amb `--workflow interaction` per tenir l'INP.
4. Passa el gate a cada branca i escenari amb una sola crida a la CLI: `--baseline` amb la URL de la botiga de `main`, `--cpu 4 --network fast-4g --runs 5 --max-runs 7` i `--fail-on-regression`. La CLI mesura les dues botigues en aquesta crida, alternant una execució de cada una, 5 per costat, i fins a 7 si una mètrica queda no concloent. `main` es mesura una altra vegada amb cada branca.
5. Escriu `out/results.json` i imprimeix una taula.

## Requisits

- Node 22.18 o superior.
- Les dependències de la botiga instal·lades: `npm ci` a `apps/shop`. L'script les reutilitza a cada branca i s'atura si una branca té un altre `package-lock.json`.
- Les branques `pr/*`, en local o a `origin`.
- El Chromium de Playwright 1.63.0: `npx playwright install chromium`.

## Ús

```bash
npm install
npm run measure     # mesura main i les quatre branques, uns 7 minuts (una execució va trigar 7 min 16 s)
npm test            # mesura una altra vegada i comprova els veredictes
```

## Què comprova el test

| Branca | Veredicte esperat |
|---|---|
| `pr/lcp-hero-lazy` | El gate falla a `home` amb l'LCP a `regressed` |
| `pr/cls-promo-banner` | El gate falla a `home` amb el CLS a `regressed` |
| `pr/loaf-cart-handler` | El gate falla a `add-to-cart` amb l'INP a `regressed` |
| `pr/noop-refactor` | El gate passa als dos escenaris i cap mètrica no empitjora |

El test comprova el veredicte, no les xifres: els mil·lisegons canvien d'una màquina a una altra.

## Resultats al Mac de referència

Una execució de `npm test` en un Apple Silicon de 16 GB, amb el Chromium complet de Playwright (`"build": "chromium"` a les condicions):

| Branca | Escenari | Mètrica | `main` | Branca | Canvi | p | Exit |
|---|---|---|---|---|---|---|---|
| `pr/lcp-hero-lazy` | home | LCP | 648 ms | 1064 ms | +64,2 % | 0,004 | 1 |
| `pr/cls-promo-banner` | home | CLS | 0 | 0,070 | | 0,002 | 1 |
| `pr/cls-promo-banner` | add-to-cart | CLS | 0 | 0,055 | | 0,002 | 1 |
| `pr/loaf-cart-handler` | add-to-cart | INP | 40 ms | 120 ms | +200 % | 0,0028 | 1 |
| `pr/loaf-cart-handler` | home | LCP | 648 ms | 960 ms | +48,1 % | 0,006 | 1 |
| `pr/noop-refactor` | home | LCP | 648 ms | 644 ms | -0,6 % | 0,3691 | 0 |
| `pr/noop-refactor` | add-to-cart | INP | 40 ms | 40 ms | 0 % | 0,5596 | 0 |

A `pr/cls-promo-banner`, l'LCP de la home puja un 1,9 % amb p = 0,0063: la diferència és significativa, però no supera el llindar, així que el veredicte és `unchanged`. El gate combina les dues condicions per no donar per bona ni per dolenta una diferència de soroll. En les vuit mesures d'aquesta execució la CLI va mesurar 5 execucions per costat, i cap no va arribar a 7.

Dues branques empitjoren més d'una mètrica, com passa en una PR real:

- **L'script síncron d'A/B testing de `pr/loaf-cart-handler`** és a l'`index.html` comú, així que també retarda l'LCP de la home.
- **El forat del bàner sense alçada reservada de `pr/cls-promo-banner`** és a totes les pàgines, així que també mou la fitxa de producte.

El Judge ha d'atribuir cada mètrica a la seva causa, no només donar el veredicte.

## Versions

`webperf-snippets` 1.17.0 i `playwright` 1.63.0, fixades a [`package.json`](package.json). La CLI fa servir el Chromium complet quan està instal·lat, el mateix binari que Chrome DevTools MCP; amb només el headless shell (`npx playwright install --only-shell chromium`), les xifres poden ser una mica diferents.
