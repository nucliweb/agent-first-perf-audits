---
title: "Pas 6: portar-ho a la teva plataforma"
description: Què cal canviar per portar el gate i els subagents a la teva aplicació, i quines decisions del taller convé conservar.
sidebar:
  order: 16
---

## Què aprendràs

- Quines peces del taller es queden tal qual a la teva plataforma i quines canvies.
- Quines decisions de disseny convé conservar, i amb quines dades es van prendre.
- Com començar: un pla d'una pàgina, amb la teva aplicació i els teus recorreguts.

## Què canvies

| Peça del taller | A la teva plataforma |
|---|---|
| `shop-baseline` i `shop-candidate`, construïdes des de dues refs git | La teva aplicació construïda des de la branca principal i des de la de la pull request, a la mateixa màquina i en la mateixa execució |
| `thirdparty`, els mocks de tercers | Els teus tercers reals, o mocks amb la seva latència i el seu cost de CPU si vols un gate sense xarxa |
| Els recorreguts d'`agents/journeys/` | Els recorreguts que importen al teu producte, amb selectors estables |
| Els escenaris del gate a `agents/src/judge/gate.ts` | Les pàgines i els recorreguts que el teu gate ha de protegir |
| Les condicions (CPU 4x, `fast-4g`, cinc execucions) | Les dels teus usuaris: el throttling forma part del que el gate pot veure |

## Què conserves

- **Les regles decideixen, l'LLM explica.** El veredicte és l'estadística de la CLI i el seu exit code; l'LLM redacta la causa a partir de dades ja mesurades, amb sortida validada per un schema, i si contradiu les regles, guanyen les regles.
- **No tot ha de ser un MCP.** L'orquestrador ja sap quina ordre executar i quan, i trace-engine-cli ja dona una sortida compacta pensada per a LLMs: un MCP a sobre no hi afegiria informació, només una capa més.
- **Comparar amb la versió base, no amb llindars absoluts.** Les tres regressions del taller queden dins de "good".
- **Mesurar d'una en una.** Dos Chromium alhora es reparteixen la CPU i contaminen les mètriques.
- **Noms de funció al build.** Minificat del tot, el profiler anomena cada funció amb una lletra i el Judge no la pot relacionar amb el diff; trace-engine-cli no llegeix source maps.
- **El handoff.** Qui no pot executar un LLM local té la mateixa entrada per a un agent de la seva elecció, i cada equip decideix si el seu codi surt de la seva màquina.

El context i les dades d'aquestes decisions són a [Learnings](../../learnings/) i a [Per què aquest stack](../../stack/), que explica cada peça de l'stack, què es va descartar i la dada que ho va decidir.

## El teu pla

Copia aquesta taula i omple l'última columna. Amb les sis files escrites tens el primer esborrany del gate del teu producte:

| Pregunta | Al taller | A la teva plataforma |
|---|---|---|
| Quina aplicació es mesura, i com es construeixen les seves dues versions? | La botiga, des de `main` i des de la branca, amb `scripts/build-shop.sh` | |
| Quins recorreguts protegeix el gate? | Carregar la home i afegir un producte al carretó | |
| En quines condicions es mesura? | CPU 4x i `fast-4g`, cinc execucions per costat | |
| Quant ha d'empitjorar una mètrica per aturar una pull request? | Els llindars de la CLI, a [Conceptes](../../concepts/#com-decideix-el-gate) | |
| On corre el gate? | Docker Compose en un portàtil, i GitHub Actions a les pull requests | |
| Qui explica la causa? | Un LLM local, o el handoff a un agent que triïs | |
