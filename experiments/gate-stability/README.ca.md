# Experiment: fiabilitat del gate

[English](README.md) · [Castellano](README.es.md) · Català

Mesura quantes vegades encerta el gate del taller a cada branca, segons quantes execucions fa per costat i què fa quan un canvi supera el seu llindar i l'estadística no el separa del soroll.

## Per què

El gate mesura el baseline i la branca amb `--runs 5`, i la CLI de WebPerf Snippets només dona una regressió per bona quan supera el seu llindar i el test de Mann-Whitney U dona p < 0,05. Amb 5 execucions per costat, una sola execució lenta del baseline deixa p en 0,0754, i una regressió del 50 % passa el gate. Aquesta taula és el p-value de la CLI quan totes les execucions de la branca són més lentes que les del baseline, menys algunes del baseline que són més lentes que totes:

| Execucions per costat | Cap de lenta | Una de lenta | Dues de lentes |
|---|---|---|---|
| 5 | 0,004 | 0,0754 | 0,3452 |
| 7 | 0,0003 | 0,0131 | 0,1043 |
| 9 | < 0,0001 | 0,002 | 0,0252 |

Cinc execucions no en toleren cap; 6, 7 i 8 en toleren una, i 9, que és el màxim de la CLI, dues.

## Què fa

1. `collect.mjs` mesura execucions soltes (`--runs 1`, amb el throttling del gate) de la botiga de `main` i de cada branca `pr/*`, dins del laboratori del repo i amb un sol Chromium alhora. A cada ronda mesura cada escenari en dos ordres:
   - `adjacent`: totes les de `main` i després totes les d'una branca, com fa el gate.
   - `interleaved`: `main`, cada branca, i tornar a començar.
2. Desa cada execució a `results/<etiqueta>.json`, amb el `benchmarkIndex` de la màquina en aquell moment. Amb `--load`, el servei `ollama` del laboratori genera text mentre es mesura.
3. `policies.mjs` decideix sobre aquestes execucions amb el codi de la mateixa CLI (`summarizeRuns` i `compareRun`), de manera que cada política dona el que hauria dit el gate amb elles: 5, 7 o 9 execucions fixes, o 5 i fins a 9 només quan el resultat no és concloent.
4. `report.mjs` imprimeix, per branca, escenari i ordre, quantes rondes falla cada política, quantes queden sense concloure i quantes execucions per costat gasta.

`home` mesura les quatre branques; `add-to-cart`, les dues que el canvien: `pr/loaf-cart-handler` i `pr/noop-refactor`.

## La regla per triar

Escrita abans de mesurar. Es queda la política més barata que compleixi les quatre condicions:

1. Amb la màquina en repòs, falla a totes les rondes de cada branca amb regressió.
2. Amb `ollama` generant al costat, falla almenys al 90 % d'aquestes rondes.
3. No falla a cap ronda de `pr/noop-refactor`, en repòs ni amb càrrega.
4. El pas 5 del taller, amb el gate a les branques que es llancen en directe, cap al seu espai de l'agenda.

## Resultats al Mac de referència

Dues nits de mesura en un Apple Silicon de 16 GB, amb 8 GB per a la màquina virtual de Docker: 25 rondes amb la màquina en repòs (4.500 execucions) i 20 amb `ollama` generant (3.600). Les regressions són les rondes de `pr/lcp-hero-lazy`, `pr/cls-promo-banner` i `pr/loaf-cart-handler` a l'escenari de la seva mètrica; el control, les de `pr/noop-refactor` als dos escenaris.

### En repòs

| Ordre | Execucions per costat | Regressions que s'escapen | Vegades que falla el control | Execucions de mitjana |
|---|---|---|---|---|
| Adjacent | 5 | 1 de 75 | 0 de 50 | 5,00 |
| Adjacent | 7 | 0 de 75 | 0 de 50 | 7,00 |
| Adjacent | 9 | 0 de 75 | 0 de 50 | 9,00 |
| Adjacent | 5, i 7 si no és concloent | 0 de 75 | 0 de 50 | 5,03 |
| Adjacent | 5, i 9 si no és concloent | 0 de 75 | 0 de 50 | 5,06 |
| Intercalat | 5 | 1 de 75 | 0 de 50 | 5,00 |
| Intercalat | 7 | 0 de 75 | 0 de 50 | 7,00 |
| Intercalat | 9 | 0 de 75 | 0 de 50 | 9,00 |
| Intercalat | 5, i 7 si no és concloent | 0 de 75 | 0 de 50 | 5,03 |
| Intercalat | 5, i 9 si no és concloent | 0 de 75 | 0 de 50 | 5,06 |

### Amb ollama generant

| Ordre | Execucions per costat | Regressions que s'escapen | Vegades que falla el control | Execucions de mitjana |
|---|---|---|---|---|
| Adjacent | 5 | 4 de 60 | 3 de 40 | 5,00 |
| Adjacent | 7 | 1 de 60 | 3 de 40 | 7,00 |
| Adjacent | 9 | 0 de 60 | 4 de 40 | 9,00 |
| Adjacent | 5, i 7 si no és concloent | 1 de 60 | 3 de 40 | 5,10 |
| Adjacent | 5, i 9 si no és concloent | 0 de 60 | 3 de 40 | 5,20 |
| Intercalat | 5 | 2 de 60 | 0 de 40 | 5,00 |
| Intercalat | 7 | 2 de 60 | 0 de 40 | 7,00 |
| Intercalat | 9 | 0 de 60 | 1 de 40 | 9,00 |
| Intercalat | 5, i 7 si no és concloent | 2 de 60 | 0 de 40 | 5,08 |
| Intercalat | 5, i 9 si no és concloent | 0 de 60 | 1 de 40 | 5,16 |

Amb `ollama` generant, la mediana del `benchmarkIndex` de les execucions baixa de 2154 a 1059: la màquina va a la meitat de velocitat.

## Què diuen les dades

- **El gate de 5 execucions per costat deixa escapar regressions.** En repòs, 1 de 75, l'INP de `pr/loaf-cart-handler`. Amb càrrega, 4 de 60, i 3 d'elles són l'LCP de `pr/lcp-hero-lazy`: 3 de les seves 20 rondes, el pass que ens vam trobar preparant el taller.
- **Ampliar només quan no és concloent les recupera gairebé gratis.** Amb 5 execucions i fins a 7 o 9 quan el canvi supera el llindar i p no hi arriba, en repòs no se n'escapa cap, i la mitjana no passa de 5,2 execucions per costat.
- **Amb càrrega, mesurar primer tot el baseline fa fallar el control**, 3 o 4 vegades de 40 amb qualsevol política. Més execucions no ho arreglen, perquè no és soroll de mostreig: la màquina canvia de velocitat entre el bloc del baseline i el de la branca, i el test ho veu com un canvi real. Intercalant les execucions dels dos costats, el control falla 0 o 1 vegades de 40.
- **La política que compleix la regla és intercalar, amb 5 execucions per costat i 7 quan no és concloent.** És la més barata sense cap fallada en repòs, amb menys d'un 10 % de regressions escapades amb càrrega i sense cap fallada del control.
- **El que aquestes dades no separen.** Amb 20 o 25 rondes, 0 de 40 i 1 de 40 són indistingibles: les dades separen bé l'ordre adjacent de l'intercalat i les 5 execucions fixes d'ampliar, però no ampliar fins a 7 d'ampliar fins a 9.

## Requisits

- Node 22.18 o superior, i Docker amb les imatges del taller ja descarregades (`scripts/preflight.sh`).
- El laboratori sense mesures en marxa: `collect.mjs` es nega a començar si hi ha un contenidor de `ci` o d'`agents` treballant.
- La màquina sola durant la mesura.

## Ús

```bash
npm install
npm test                                              # les polítiques, el pla d'una ronda i la taula
node collect.mjs --label idle --rounds 25             # uns 18 minuts per ronda
node collect.mjs --label loaded --rounds 20 --load    # amb ollama generant mentre mesura
node report.mjs idle                                  # la taula de cada política
node report.mjs idle --policies 5,7,9,5-7,5-9 --summary # el resum de la nit, per ordre i política
```

Una mesura interrompuda conserva les seves rondes: la mateixa ordre amb `--resume` continua on es va quedar.

## Què comproven els tests

- Les polítiques decideixen com la CLI: una regressió clara falla amb 5 execucions, una execució lenta del baseline l'amaga amb 5 i no amb 7, i una diferència significativa per sota del seu llindar passa.
- La taula de tolerància de dalt.
- L'ordre de les mesures d'una ronda, què desa de cada execució, com es reprèn i la taula de l'informe.

## Versions

`webperf-snippets` 1.15.0, fixada a [`package.json`](package.json) a propòsit: és la mesura que va portar a la política del gate. La CLI implementa aquesta política des de la 1.17.0 (`--baseline` amb una URL i `--max-runs`), que és la que fa servir el gate. Les condicions i els escenaris són els del gate, d'[`agents/src/judge/gate.ts`](../../agents/src/judge/gate.ts).
