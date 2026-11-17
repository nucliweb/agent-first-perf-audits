# Experiment: els reptes del taller

[English](README.md) · [Castellano](README.es.md) · Català

Executa els [reptes](../../docs/src/content/docs/ca/challenges.md) del taller tal com els escriu la seva pàgina i desa què dona el gate a cadascun.

## Per què

La pàgina dels reptes diu què surt després de cada canvi: "continua fallant", "passa", "falla només per l'LCP". Són veredictes, i un veredicte escrit a mà en una guia deixa de ser cert el dia que canvia la botiga, el gate o la CLI. Aquest experiment els lliga a una execució desada.

## Què fa

1. Clona el repo en net i executa en ordre els blocs `bash` de la pàgina dels reptes en castellà, amb l'[arnès de l'assaig](../rehearsal/README.ca.md).
2. Fa els canvis que la pàgina demana fer a mà, cadascun just abans de l'ordre que el segueix. Són a `EDITS`, a [`run.mjs`](run.mjs), amb el seu fitxer, el text que cerca i el que deixa. Si el fitxer no té aquest text exactament una vegada, l'experiment s'atura: la botiga ha canviat, i la pàgina ha de canviar amb ella.
3. Després de cada gate llegeix el seu `report.json` i desa a `results.json` el veredicte, les condicions, cada mètrica amb la seva p i el seu veredicte, i els fets de les regles. El text de l'explicació del model no es desa: cap afirmació de la pàgina en depèn.
4. En acabar, les últimes ordres de la pàgina esborren les carpetes, les branques i les imatges dels reptes, i l'experiment atura el laboratori del clon.

El repte 2, demanar l'explicació a un altre model, no té ordres ni veredicte per comprovar.

## Els canvis

| Canvi | Repte | Fitxer | Què canvia |
|---|---|---|---|
| `fix-attribute` | 1 | `apps/shop/src/pages.tsx`, a la branca de l'arranjament | `loading="lazy"` per `fetchPriority="high"` a la imatge del hero |
| `fix-preload` | 1 | `apps/shop/src/products.ts`, a la branca de l'arranjament | `lcpImageFor` recupera la línia del preload del hero |
| `unthrottled` | 3 | `agents/src/judge/gate.ts` | Les condicions del gate es queden en `--runs 5` |
| `no-defer` | 4 | `apps/shop/index.html`, a la branca de la regressió | L'script del xat perd el `defer` |
| `slow-defer` | 4 | `apps/shop/index.html`, a la branca de la regressió | Torna el `defer`, i el `delay` del xat puja a 1500 |
| `slow-async` | 4 | `apps/shop/index.html`, a la branca de la regressió | `async` en lloc de `defer` |

## Requisits

Els del taller, que comprova `scripts/preflight.sh`, i Node 22.18 o superior, git i bash. No té dependències de npm.

Construeix imatges de la botiga, així que necessita internet. I mesura: a la màquina de referència no corre res més alhora, i el laboratori del repo de treball ha d'estar aturat, perquè el del clon es diu igual.

## Ús

```bash
node run.mjs --dry-run     # llista les ordres de la pàgina, amb el canvi que va abans de cadascuna
node run.mjs               # des d'un clon d'aquest repo a main
npm test                   # els tests de l'experiment i les comprovacions sobre results.json
```

`--source` accepta una ruta o una URL de git, `--ref` una branca, un tag o un commit, `--dir` tria la carpeta del clon i `--timeout` dona els minuts d'espera per ordre.

## Què comproven els tests

`npm test` passa els tests de l'experiment (quin canvi va abans de quina ordre, com s'aplica i d'on es llegeixen els informes) i `claims.test.mjs`, que comprova sobre `results.json` que:

1. Les ordres executades són les que la pàgina escriu avui. Si la pàgina canvia les seves ordres, cal repetir l'execució.
2. Totes les ordres acaben bé, i la sortida de cadascuna té les línies que ensenya la pàgina, entre elles l'exit code de cada gate.
3. Repte 1: amb l'atribut arreglat, l'LCP de la home continua empitjorant i un fet de les regles anomena `lcpImageFor`. Amb el preload de tornada, el gate passa i la resposta és de les regles.
4. Repte 3: sense throttling, `pr/lcp-hero-lazy` passa, `pr/cls-promo-banner` falla pel CLS i `pr/loaf-cart-handler` falla per l'LCP, amb un INP pitjor i significatiu. Que aquest INP superi o no el seu llindar depèn de la velocitat de la màquina, i no es comprova.
5. Repte 4: sense `defer` el gate passa i l'LCP no canvia; amb el xat lent i `defer`, falla per l'LCP; amb `async`, passa i l'LCP de la branca és menor que el de `main`.
6. La pàgina ensenya, en els tres idiomes, les línies que l'experiment canvia.

Sense `results.json`, les comprovacions sobre l'execució se salten i ho diuen.

## Resultats al Mac de referència

Una execució en un Apple Silicon de 16 GB, amb el perfil `llm` i les imatges del taller ja descarregades:

| Repte | Canvi | Branca | Gate | Mètriques que empitjoren |
|---|---|---|---|---|
| 1 | `fix-attribute` | `fix-lcp-hero` | exit 1 | home: LCP |
| 1 | `fix-preload` | `fix-lcp-hero` | exit 0 | Cap |
| 3 | `unthrottled` | `pr/lcp-hero-lazy` | exit 0 | Cap |
| 3 | `unthrottled` | `pr/cls-promo-banner` | exit 1 | home: CLS, add-to-cart: CLS |
| 3 | `unthrottled` | `pr/loaf-cart-handler` | exit 1 | home: LCP |
| 4 | `no-defer` | `my-regression` | exit 0 | Cap |
| 4 | `slow-defer` | `my-regression` | exit 1 | home: LCP |
| 4 | `slow-async` | `my-regression` | exit 0 | Cap |

Cada fila és un gate. Els canvis d'un mateix repte s'acumulen: `fix-preload` va a sobre de `fix-attribute`, i `slow-async` a sobre dels altres dos.

Les xifres de cada informe són a [`results.json`](results.json). Canvien d'una execució a una altra i d'una màquina a una altra; el que les comprovacions lliguen a la pàgina són els veredictes.
