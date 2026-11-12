---
title: "Pas 5: el gate a ci contra les quatre branques"
description: El gate de rendiment d'una pull request, contra les tres regressions i el refactor que no canvia res.
sidebar:
  order: 15
---

## Objectiu

Fer servir el que has construït com ho faria un equip: un gate al CI de cada pull request. El servei `ci` compara la botiga d'una branca amb la de `main` i surt amb 0 si passa, 1 si alguna mètrica empitjora i 2 si no ha pogut mesurar. Contra les quatre branques del taller ha de donar tres errors i un pass.

## Què escriuràs

Res. `ci` és el Judge del pas 4 sense els subagents: el gate de la CLI, els traces, les regles i l'explicació. En aquest pas s'executa i se'n llegeixen els informes.

## Les branques

| Branca | Canvi | Què empitjora |
|---|---|---|
| `pr/lcp-hero-lazy` | La imatge del hero perd el preload i el `fetchpriority`, i passa a `loading="lazy"` | LCP |
| `pr/cls-promo-banner` | El bàner d'un tercer sense espai reservat i un swap de font sense preload | CLS |
| `pr/loaf-cart-handler` | Un script síncron d'A/B testing i recomanacions calculades al handler d'afegir al carretó | INP i LCP |
| `pr/noop-refactor` | Extreu el hero a un component | Res: el control de falsos positius |

Els tests de l'app passen a les quatre: el CI clàssic no veu cap regressió. Les tres queden dins de "good" en valor absolut; el gate les detecta perquè compara amb `main`, no amb els llindars de Google.

Les quatre branques també estan desplegades a Vercel, per veure-les al navegador sense Docker: [Les branques al navegador](../../previews/).

## Comprova-ho

Cada branca a la seva carpeta d'`out/ci/`, perquè els informes no es trepitgin:

```bash
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose run --rm -e OUT=/out/ci/$branch ci
  echo "$branch: exit $?"
done
```

`docker compose run` arrenca la botiga de cada branca abans de mesurar-la. Cada branca triga uns minuts, perquè el gate mesura cinc vegades cada escenari a cada costat; mentre corre la següent, llegeix el `report.md` de l'anterior. Fixa't en tres coses:

- `pr/loaf-cart-handler` empitjora dues mètriques per dues causes diferents, i el Judge demana una explicació per cadascuna.
- `pr/noop-refactor` passa i no s'arriba a consultar l'LLM: sense regressió, les regles responen soles, i no hi ha ocasió d'inventar-se'n una.
- Amb el perfil `lite`, cada carpeta té un `handoff.md` en lloc de l'explicació. Enviar-lo a un servei extern és una decisió de cada equip per al seu propi codi.

```bash
docker compose run --rm agents npm run check -- step-05
```
