---
title: "Pas 5: el gate a ci contra les quatre branques"
description: El gate de rendiment d'una pull request, contra les tres regressions i el refactor que no canvia res.
sidebar:
  order: 15
---

## Què aprendràs

- Fer servir el gate com ho faria un equip, al CI de cada pull request, i llegir-ne els tres exit codes.
- Per què el gate compara amb `main` i no amb els llindars de Google.
- Què fer quan el gate no pot decidir.

## Temps

Aquest pas té 20 minuts a l'agenda. El temps de màquina està mesurat al Mac de referència, amb l'[assaig cronometrat](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.ca.md):

| | `llm` | `lite` |
|---|---|---|
| Temps de màquina del pas | 11,3 min | 9,5 min |
| Punt 1, el gate per les quatre branques | 11,2 min | 9,5 min |

## La idea en un minut

Tot l'anterior cap en un servei: `ci` compara la botiga d'una branca amb la de `main` i surt amb 0 si passa, amb 1 si alguna mètrica empitjora i amb 2 si no ha pogut mesurar. Un pipeline no necessita saber res més: l'exit code per a la pull request, i l'informe diu per què.

Les mesures són les d'un laboratori, així que el gate no afirma el que no pot sostenir. Quan un canvi supera el seu llindar i les mesures no basten per distingir-lo del soroll, la mètrica queda com a no concloent: el gate no falla per ella, i l'informe demana llançar-lo una altra vegada.

El repo fa servir aquest mateix gate a GitHub Actions: cada pull request d'una branca `pr/*` passa `ci` i rep l'informe en un comentari, com la de [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1). Contra les quatre branques del taller ha de donar tres fallades i un pass.

## Abans de començar

Continues a la teva branca `taller`, amb el laboratori aixecat. Aquest pas no té codi: `ci` funciona encara que no hagis aplicat cap solució.

Les branques que compararàs amb `main`:

| Branca | Canvi | Què empitjora |
|---|---|---|
| `pr/lcp-hero-lazy` | La imatge del hero perd el preload i el `fetchpriority`, i passa a `loading="lazy"` | LCP |
| `pr/cls-promo-banner` | El bàner d'un tercer sense espai reservat i un swap de font sense preload | CLS |
| `pr/loaf-cart-handler` | Un script síncron d'A/B testing i recomanacions calculades al handler d'afegir al carretó | INP i LCP |
| `pr/noop-refactor` | Extreu el hero a un component | Res: el control de falsos positius |

Els tests de l'app passen a les quatre: el CI clàssic no veu cap regressió. Amb la màquina sola, les tres queden gairebé sempre dins de "good" en valor absolut, però les xifres canvien amb l'equip i amb la càrrega de la CPU en el moment de mesurar: amb la CPU ocupada, l'INP de `pr/loaf-cart-handler` surt de "good" ([Conceptes](../../concepts/#comparar-amb-el-baseline-no-amb-el-llindar)). El gate les detecta perquè compara amb `main` a la mateixa màquina, no amb els llindars de Google.

Les quatre branques també estan desplegades a Vercel, per veure-les al navegador sense Docker: [Les branques al navegador](../../previews/).

## Pas a pas

1. Passa el gate per les quatre branques, cadascuna a la seva carpeta d'`out/ci/` perquè els informes no es trepitgin:

   ```bash
   for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
     CANDIDATE=$branch docker compose run --rm -e OUT=/out/ci/$branch ci
     echo "$branch: exit $?"
   done
   ```

   `docker compose run` arrenca la botiga de cada branca abans de mesurar-la. Cada branca triga uns minuts, perquè el gate mesura cinc vegades cada escenari a cada costat, alternant les dues botigues. En acabar cadascuna, n'escriu l'exit code:

   ```text
   pr-lcp-hero-lazy: exit 1
   pr-cls-promo-banner: exit 1
   pr-loaf-cart-handler: exit 1
   pr-noop-refactor: exit 0
   ```

2. Passa la comprovació del pas:

   ```bash
   docker compose run --rm agents npm run check -- step-05
   ```

   Dona un `OK` per branca quan el seu informe té el veredicte esperat, i acaba amb `step-05 is done.`

   Si una branca que hauria de fallar passa amb una mètrica no concloent cap a pitjor, la comprovació diu que la llancis una altra vegada.

## Mentre esperes

Cada branca triga uns minuts. Mentre corre la següent, llegeix el `report.md` de l'anterior, a `out/ci/<branca>/`. Fixa't en cinc coses:

- `pr/loaf-cart-handler` empitjora dues mètriques per dues causes diferents, i el Judge demana una explicació per a cadascuna.
- `pr/noop-refactor` passa i l'LLM no arriba a ser consultat: sense regressió, les regles responen soles, i no hi ha ocasió d'inventar-se'n una.
- A `pr/lcp-hero-lazy`, l'explicació de l'LLM anomena `loading="lazy"`, i els fets de les regles, al final de l'informe, afegeixen el que no diu: el `fetchPriority` i el preload que perd el hero.
- Si una mètrica supera el seu llindar i p no baixa de 0,05, l'informe ho diu a dalt, en un bloc "Inconclusive: run the gate again." amb la mètrica, el seu canvi i la seva p, i quantes execucions per costat va mesurar la CLI. El gate no falla per aquesta mètrica.
- Amb el perfil `lite`, cada carpeta té un `handoff.md` en lloc de l'explicació. Enviar-lo a un servei extern és una decisió de cada equip per al seu propi codi.

## Punt de control

En pantalla, els quatre exit codes, `1`, `1`, `1` i `0`, i `step-05 is done.`

## Si alguna cosa falla

| Què veus | Per què | Què fer |
|---|---|---|
| Una branca amb regressió surt amb 0 | La seva mètrica ha quedat com a no concloent | Llança aquesta branca una altra vegada. La comprovació del punt 2 escriu l'ordre |
| Una branca surt amb 2 | El gate no ha pogut mesurar: falta la imatge de la botiga d'aquesta branca, o una variable | El missatge diu què falta. El preflight de [Preparació](../../setup/) descarrega la botiga de cada branca |
| `pr-noop-refactor` surt amb 1 | Un fals positiu, gairebé sempre amb la màquina ocupada en una altra cosa | Tanca el que consumeixi CPU i llança aquesta branca una altra vegada. Per què passa, a [Conceptes](../../concepts/#per-què-importa-lordre) |
| El bucle triga molt més que a la taula de Temps | Una altra càrrega a la màquina, o un equip més lent que el de referència | Deixa'l acabar: les mesures van una darrere l'altra per no repartir-se la CPU |

## Què t'emportes

- El CI clàssic no veia cap de les tres regressions: els tests de l'app passen a les quatre branques.
- El gate les veu perquè compara amb la versió base a la mateixa màquina i en la mateixa execució, no amb un llindar absolut.
- Tres sortides, 0, 1 i 2, i un resultat no concloent que es diu en veu alta en lloc de passar per bo.

Per pensar: quina pull request dels últims mesos hauria aturat aquest gate al teu producte?
