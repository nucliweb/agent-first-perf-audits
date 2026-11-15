---
title: Preparació
description: Què necessita el teu equip, com descarregar el laboratori a casa i com comprovar que està llest abans del taller.
sidebar:
  order: 2
---

Tot el taller corre al teu portàtil amb Docker Compose, sense claus d'API. L'únic que demana és descarregar les imatges abans: són diversos GB i la Wi-Fi d'un esdeveniment no dona per a tothom. Aquesta pàgina es fa a casa, amb bona connexió.

Això és el que descarregues: dues botigues, els mocks de tercers, els agents i el model, en una xarxa sense sortida a internet.

<img src="/diagrams/lab.svg" alt="Els serveis del laboratori: agents i ci mesuren shop-baseline i shop-candidate, que carreguen els scripts de thirdparty; agents demana l'explicació a ollama i escriu els informes a out/" width="960" height="420" loading="lazy" decoding="async">

## Què necessites

- **16 GB de RAM.** Amb 8 GB el taller se segueix amb el perfil `lite`, sense model local (més avall).
- **Un runtime de contenidors** amb l'ordre `docker compose`, Compose v2.20.2 o superior (`docker compose version`), i **almenys 8 GB assignats a la seva màquina virtual**. A Docker Desktop el valor per defecte sol ser menor: és l'error més freqüent.
  - Docker Desktop i OrbStack: tal qual.
  - Colima: arrenca'l amb prou memòria, per exemple `colima start --memory 8 --cpu 4`.
  - Podman: amb el seu mode compatible amb Docker i l'ordre `docker compose`, no `podman-compose`.
- **15 GB lliures de disc.**
- **macOS, Linux o Windows amb WSL2**, git i un editor. Node no cal: tot corre dins dels contenidors.

El laboratori està provat amb Docker Desktop a macOS. En els altres runtimes, el preflight diu què canviar si alguna cosa no encaixa.

## Descarrega i comprova

```bash
git clone https://github.com/nucliweb/agent-first-perf-audits.git
cd agent-first-perf-audits
scripts/preflight.sh
```

El preflight fa tres coses, i escriu `OK` o `KO` a cadascuna:

1. **Comprova l'equip**: el runtime, la versió de Compose, l'arquitectura, la memòria de la màquina virtual, les branques de regressió i el disc lliure.
2. **Descarrega les imatges**: el laboratori i la botiga de cada branca.
3. **Passa un smoke test** dins de Compose: Chromium arrenca, es grava un trace, les dues botigues responen, el laboratori no té sortida a internet i el model local contesta.

Cada `KO` diu què canviar al teu runtime. Quan surt amb 0, l'equip està llest.

A Windows, des de PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
```

Des de WSL2 serveix `scripts/preflight.sh`.

## Amb 8 GB: el perfil lite

El model local és el que més memòria demana. El perfil `lite` no el descarrega ni l'arrenca:

```bash
COMPOSE_PROFILES=lite scripts/preflight.sh
```

Amb `lite` no et perds el taller. Això és el que canvia:

| | Perfil `llm` (per defecte) | Perfil `lite` |
|---|---|---|
| Mesures dels subagents | Sí | Sí |
| Veredicte del gate | Sí | Sí, el mateix |
| Atribució amb els traces | Sí | Sí, la mateixa |
| Explicació en una frase | L'escriu el model local | L'informe remet a `handoff.md` |

`handoff.md` porta la mateixa entrada que rebria el model local (el veredicte, les mètriques, els resums dels traces i el diff de la branca), amb el prompt i el schema de la resposta. Pots passar-la a un agent de la teva elecció per tenir l'explicació. Enviar el diff del teu codi a un servei extern és una decisió de cada equip: al taller el diff és el d'una botiga d'exemple.

Per fer servir `lite` durant tot el taller, posa la variable davant de cada ordre o exporta-la una vegada al teu terminal:

```bash
export COMPOSE_PROFILES=lite
```

## Les descàrregues, a mà

El mateix que descarrega el preflight, per si prefereixes fer-ho pas a pas:

```bash
docker compose --profile llm --profile run pull
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose pull shop-candidate
done
```

La primera línia porta el model, els mocks de tercers, els agents i la botiga de `main`; el bucle, la botiga de cada branca.

## Els errors més freqüents

| Què veus | Per què | Què fer |
|---|---|---|
| `KO` a la memòria | La màquina virtual del runtime té menys de 8 GB | Puja-la als ajustos del runtime, o fes servir el perfil `lite`, que en demana 4 GB |
| `KO` a Compose | És `podman-compose` o una versió anterior a la 2.20.2 | Instal·la Docker Compose v2 i comprova `docker compose version` |
| `KO` al disc | No hi ha 15 GB lliures i encara falten imatges per descarregar | Allibera espai; `docker system df` diu quant ocupa Docker |
| `KO` a les branques | El clon no té les branques `pr/*` | `git fetch origin` |
| `KO` a `out/`, que no es pot escriure | A Linux, Docker va crear la carpeta com a root | `sudo chown -R "$(id -u):$(id -g)" out` |
| `KO` a la descàrrega de les imatges | Connexió lenta o disc de la màquina virtual ple | Torna a llançar el preflight: les imatges que han acabat es conserven |

## Sense Docker

Si el teu equip no pot amb el laboratori, les quatre branques estan desplegades per veure-les al navegador: [Les branques al navegador](../previews/). No substitueix el taller, però permet seguir les explicacions i veure cada regressió a DevTools.

Amb l'equip llest, repassa els [Conceptes](../concepts/) i comença pel [pas 1](../workshop/step-01/).
