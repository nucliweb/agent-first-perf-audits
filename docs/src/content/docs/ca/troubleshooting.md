---
title: Problemes freqüents
description: Què mirar quan el laboratori no arrenca, una mesura no surt com a la guia o el model local no respon, i com tornar a començar.
sidebar:
  order: 93
---

Cada guia té el seu apartat "Si alguna cosa falla", amb els errors d'aquell pas, i [Preparació](../setup/#els-errors-més-freqüents) té els de la instal·lació. Aquesta pàgina reuneix els que no són d'un pas concret.

## Per on començar

Tres ordres diuen quasi sempre què passa:

```bash
docker compose ps
docker compose run --rm agents npm run check -- step-03
scripts/preflight.sh
```

- `docker compose ps` llista els serveis en marxa. Han de ser-hi `thirdparty`, `shop-baseline` i `shop-candidate`, i amb el perfil `llm` també `ollama`, tots com a `healthy`. Si en falta algun, `docker compose up -d` l'aixeca.
- La comprovació d'un pas, aquí la del 3, dona un `OK` o un `KO` per cada cosa que el pas ha de deixar feta, i escriu l'ordre que falta.
- El preflight comprova l'equip i passa un smoke test en un laboratori a part, sense tocar el teu. Es pot llançar en qualsevol moment, menys durant una mesura.

| On falla | On mirar |
|---|---|
| En instal·lar, o al preflight | [Preparació](../setup/#els-errors-més-freqüents) |
| En un pas | L'apartat "Si alguna cosa falla" de la seva guia, del [pas 1](../workshop/step-01/#si-alguna-cosa-falla) al [pas 5](../workshop/step-05/#si-alguna-cosa-falla) |
| En un repte | [Reptes](../challenges/#abans-de-començar) explica com es prova un canvi a la botiga |

## El laboratori

| Què veus | Per què | Què fer |
|---|---|---|
| Docker deixa de respondre, o una descàrrega es queda a mitges | El disc de la màquina virtual de Docker és ple | `docker system df` diu quant ocupa cada cosa. Allibera espai i reinicia el runtime abans de continuar: una imatge que es va descarregar amb el disc ple pot haver quedat malament |
| Amb 8 GB, Compose descarrega o arrenca `ollama` | Falta `COMPOSE_PROFILES=lite` en aquest terminal | `export COMPOSE_PROFILES=lite`, i val per a totes les ordres |
| No saps amb quin perfil estàs mesurant | El perfil surt de `COMPOSE_PROFILES`, o del fitxer `.env` del repo, que posa `llm` | La primera línia de `ci` ho diu: `llm profile` o `lite profile` |
| A Linux, una ordre no pot escriure a `out/` | Docker va crear la carpeta com a root | `sudo chown -R "$(id -u):$(id -g)" out` |
| La botiga del laboratori no s'obre al navegador | El laboratori no publica ports, i la seva xarxa no té sortida a internet | Les mateixes botigues estan desplegades: [Les branques al navegador](../previews/) |
| Una ordre dins del contenidor no pot descarregar res | És la mateixa xarxa sense sortida: el que mesura el gate no depèn d'internet | El que calgui descarregar es descarrega fora, amb el preflight o amb `scripts/build-shop.sh` |

## Les mesures

| Què veus | Per què | Què fer |
|---|---|---|
| Les teves xifres no són les de la guia | Cada execució mesura de nou, i cada màquina és diferent | Compara els dos costats entre ells. El que ha de coincidir amb la guia és el veredicte i la fase o la funció que canvia |
| Les dues botigues mesuren el mateix | La botiga candidata no és la que creus: sense `CANDIDATE`, el laboratori fa servir `pr-noop-refactor` | Posa `CANDIDATE=<branca>` davant de l'ordre, amb la branca escrita amb guions: `pr-lcp-hero-lazy` |
| Una branca amb regressió passa el gate | La seva mètrica ha quedat com a no concloent, i l'informe ho diu a dalt | Llança el gate una altra vegada. Per què passa, a [Conceptes](../concepts/#per-què-importa-quantes-vegades-es-mesura) |
| `pr-noop-refactor` falla el gate | La màquina estava ocupada en una altra cosa durant la mesura | Tanca el que consumeixi CPU i llança aquesta branca una altra vegada |
| L'INP de `pr/loaf-cart-handler` canvia d'una sessió a una altra | El handler fa una feina fixa, i triga menys com més ràpida va la màquina en aquell moment | Compara amb el baseline de la mateixa execució, no amb la xifra d'un altre dia |
| Una mesura triga molt més que a la taula de Temps de la seva guia | Una altra càrrega a la màquina, o un equip més lent que el de referència | Deixa-la acabar, i no n'obris una altra alhora: dos Chromium es reparteixen la CPU i les dues mesures surten pitjor |

Les mesures van sempre una darrere l'altra. És la raó per la qual `docker compose up -d` no arrenca cap Chromium, i per la qual cada ordre del taller espera l'anterior.

## El model local

El veredicte no depèn del model: el decideixen les regles abans de preguntar-li. El que pot fallar és l'explicació.

| Què veus | Per què | Què fer |
|---|---|---|
| L'informe porta el veredicte, i un error on aniria l'explicació | El model no ha respost, o ha respost alguna cosa que no compleix el schema | Comprova amb `docker compose ps` que `ollama` està en marxa, i llança l'ordre una altra vegada |
| L'explicació triga molt | El model corre a la CPU, al costat de tota la resta | Espera. Durant la crida fa servir quasi tots els nuclis de la màquina virtual, i és normal que l'equip vagi lent |
| L'explicació anomena una sola causa quan n'hi ha diverses | El model és petit, perquè càpiga en un portàtil | Els fets de les regles, al final de l'informe, donen les altres. Per a una altra explicació, `handoff.md` porta la mateixa entrada: és el [repte 2](../challenges/#repte-2-demana-lexplicació-a-un-altre-model) |
| L'informe no porta explicació i remet a `handoff.md` | Estàs amb el perfil `lite`, sense model local | És l'esperat: el veredicte i els fets són els mateixos |

## Si escrius el teu propi codi

Qui escriu els subagents en lloc d'aplicar la solució, o porta el flux a la seva plataforma, es troba amb els valors per defecte dels servidors MCP, que estan pensats per a un editor:

| Què veus | Per què | Què fer |
|---|---|---|
| `navigate_page` retorna un error de validació | Chrome DevTools MCP demana un `pageId` a cada tool de pàgina | Arrenca el servidor amb `--no-page-id-routing` |
| `Access denied` en desar un trace | El servidor només escriu al seu directori temporal | Grava allà i copia el fitxer, o dona-li la carpeta amb `--workspace` |
| `No usable sandbox!` | Chromium no té sandbox dins del contenidor | `--chromeArg=--no-sandbox`, només al contenidor |
| El servidor no troba el navegador | El client stdio no li passa les teves variables d'entorn, tampoc `PLAYWRIGHT_BROWSERS_PATH` | Instal·la el Chromium de Playwright a la seva ruta per defecte |

El context dels quatre és a [Learnings](../learnings/#chrome-devtools-mcp-fora-de-leditor), i els flags amb què el taller arrenca el servidor, a `agents/src/mcp/client.ts`.

## Tornar a començar

Per repetir el taller des del pas 1, amb la teva branca `taller` tal com va sortir de `workshop-start`:

```bash
docker compose down
git checkout workshop-start -- agents/src
rm -rf out
mkdir out
docker compose up -d
```

La carpeta `out/` es crea buida a mà perquè a Linux no la creï Docker com a root. Només té el que escriuen les ordres del taller: els traces, els JSON dels subagents i els informes. Les imatges descarregades es conserven.
