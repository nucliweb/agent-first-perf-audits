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
```

Una mesura interrompuda conserva les seves rondes: la mateixa ordre amb `--resume` continua on es va quedar.

## Què comproven els tests

- Les polítiques decideixen com la CLI: una regressió clara falla amb 5 execucions, una execució lenta del baseline l'amaga amb 5 i no amb 7, i una diferència significativa per sota del seu llindar passa.
- La taula de tolerància de dalt.
- L'ordre de les mesures d'una ronda, què desa de cada execució, com es reprèn i la taula de l'informe.

## Versions

`webperf-snippets` 1.15.0, fixada a [`package.json`](package.json). Les condicions i els escenaris són els del gate, d'[`agents/src/judge/gate.ts`](../../agents/src/judge/gate.ts).
