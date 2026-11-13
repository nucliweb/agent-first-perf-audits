# Experiment: les branques al navegador

[English](README.md) · [Castellano](README.es.md) · Català

Reprodueix les xifres de la pàgina "Les branques al navegador": la botiga de `main` en producció i les previews de les quatre branques de regressió a Vercel, mesurades com les veuria una persona al seu navegador.

## Què fa

1. Obre la home de cada lloc de [`sites.mjs`](sites.mjs) en un context nou de Chromium, amb el viewport d'un mòbil, i mesura l'LCP, el CLS i els atributs de la imatge del hero.
2. Obre la fitxa de `kenya-aa`, fa clic a "Add to cart" i mesura aquesta interacció amb Event Timing: la seva durada i les seves tres fases, calculades sobre tots els seus esdeveniments (`pointerdown`, `pointerup` i `click`) com les calcula web-vitals per a l'INP.
3. Ho repeteix cinc vegades per lloc en dues condicions: CPU 4x sense limitar la xarxa, i CPU 4x amb `fast-4g`, el preset de WebPerf Snippets 1.15.0 que fa servir el gate del taller.
4. Desa cada execució i les medianes a [`results.json`](results.json), amb la data.
5. `evidence.mjs` genera les imatges de la pàgina i de les slides a `docs/public/evidence/`, en els tres idiomes: el filmstrip de la càrrega de `main` i de `pr/lcp-hero-lazy` (de cinc càrregues, la de l'LCP medià), la home de `pr/cls-promo-banner` just després del seu desplaçament, al costat de la de `main`, i les fases del clic de `pr/loaf-cart-handler` davant de `main`, amb les medianes de `results.json`. Desa a [`evidence.json`](evidence.json) les xifres que citen els peus de les imatges.

Els tests no mesuren: comproven les conclusions de la pàgina sobre `results.json` i `evidence.json`, que les xifres de la pàgina i de les slides en els tres idiomes són les d'aquests fitxers, i que les imatges existeixen i es mostren.

## Requisits

- Node 22 o superior i connexió a internet.
- El Chromium de Playwright 1.63.0: `npx playwright install chromium`.

## Ús

```bash
npm install
npm run measure     # mesura els cinc llocs i reescriu results.json, uns 7 minuts
npm run evidence    # genera les imatges i evidence.json, uns 2 minuts
npm test            # comprova les conclusions i les xifres de la pàgina
```

Cada mesura passa per la xarxa fins a Vercel, així que les xifres canvien d'una execució a una altra i d'una connexió a una altra. Les conclusions són les que es mantenen: amb `fast-4g`, cada branca empitjora la seva mètrica davant de `main`; sense limitar la xarxa, la regressió d'LCP no es veu, i la de CLS i la d'INP sí. Si després de tornar a mesurar les xifres de la pàgina ja no coincideixen, `npm test` ho diu: actualitza la pàgina en els tres idiomes.
