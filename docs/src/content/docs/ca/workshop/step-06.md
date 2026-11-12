---
title: "Pas 6: portar-ho a la teva plataforma"
description: Què cal canviar per portar el gate i els subagents a la teva aplicació, i quines decisions del taller convé conservar.
sidebar:
  order: 16
---

## Objectiu

Sortir del taller amb un pla per a la teva plataforma: quines peces es queden tal qual, quines canvies i quines decisions de disseny convé conservar.

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
