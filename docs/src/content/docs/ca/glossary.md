---
title: Glossari
description: Els termes que fan servir les guies del taller, cadascun en una o dues línies.
sidebar:
  order: 92
---

Els termes que apareixen a les guies, per ordre alfabètic. Els de les mètriques s'expliquen amb més calma a [Conceptes](../concepts/).

## Mètriques

| Terme | Què és |
|---|---|
| CLS | Cumulative Layout Shift. Quant es desplaça el contingut sense que la persona ho provoqui. És una puntuació sense unitat; "good" fins a 0,1 |
| Core Web Vitals | Les tres mètriques amb què Google resumeix l'experiència d'una pàgina: LCP, CLS i INP |
| Fases de l'LCP | Els quatre temps que sumen l'LCP: TTFB, retard de càrrega del recurs, temps de càrrega del recurs i retard de render. Al codi, `subparts` |
| INP | Interaction to Next Paint. Quant triga la pàgina a pintar la resposta a una interacció; "good" fins a 200 ms |
| LCP | Largest Contentful Paint. Quan es pinta l'element més gran de la pantalla; "good" fins a 2,5 s |
| LoAF | Long Animation Frame. Un frame que triga més de 50 ms a pintar-se, amb els scripts que l'ocupen i qui els invoca |
| TTFB | Time to First Byte. El que triga a arribar el primer byte de l'HTML |

## Mesurar

| Terme | Què és |
|---|---|
| Baseline | La versió amb què es compara: al taller, la botiga de `main` |
| Camp | Les mesures de persones reals, amb els seus dispositius i les seves xarxes |
| Candidate | La versió que s'avalua: la botiga de la branca de la pull request |
| Escenari | El que mesura el gate en una pàgina: `home` és la càrrega de la portada i `add-to-cart`, la fitxa d'un producte amb un click |
| `fast-4g` | La xarxa simulada del taller, la Fast 4G de DevTools |
| Laboratori | Una mesura en condicions fixes i repetibles. També, els serveis de Docker Compose del taller |
| Recorregut | Un journey: una pàgina i els passos d'interacció que s'hi fan (`click`, `type`, `scroll`), escrits en un JSON d'`agents/journeys/` |
| Throttling | Frenar a propòsit la CPU i la xarxa perquè la mesura s'assembli a un mòbil de gamma mitjana i no al teu portàtil |
| Trace | La gravació de tot el que fa el navegador durant una càrrega o un click. És el fitxer que obre el panell Performance de DevTools |

## Decidir

| Terme | Què és |
|---|---|
| Exit code | El número amb què acaba una ordre. El del gate és el veredicte: 0 si passa, 1 si falla i 2 si no ha pogut mesurar |
| Gate | El control que decideix si una pull request pot continuar. El del taller compara la branca amb `main` i falla si alguna mètrica empitjora |
| Llindar | El mínim que ha d'empitjorar una mètrica per comptar. No és el llindar de "good" de Google, sinó el del gate davant del baseline |
| Mann-Whitney U | El test estadístic del gate. Mira l'ordre de les execucions dels dos costats, no els seus mil·lisegons, i diu si la diferència pot ser soroll |
| p | La probabilitat de veure una diferència així si les dues versions fossin igual de ràpides. Per sota de 0,05, el gate la dona per real |
| Regressió | Un canvi que empitjora una mètrica més que el seu llindar i que no és soroll |
| Veredicte | El resultat del gate: `pass` o `fail` |

## Agents

| Terme | Què és |
|---|---|
| Atribució | Passar de "l'INP empitjora" a "aquesta funció, en aquest fitxer i aquesta línia" |
| Eina MCP | Una funció que un servidor MCP ofereix, amb un nom i uns arguments, com `performance_start_trace` |
| Fixture | Una resposta real desada en un fitxer, perquè els tests no hagin de mesurar cada vegada |
| Handoff | El fitxer amb l'entrada completa per al model, que escriu el gate per passar-la a un altre agent |
| Judge | El subagent que ajunta el veredicte de les regles, l'atribució i l'explicació del model |
| MCP | Model Context Protocol. La manera estàndard que un programa, o un model, cridi les eines d'un altre |
| Navigator | El subagent que recorre la botiga i comprova que cada pas de cada recorregut funciona |
| Orquestrador | El programa que passa cada subagent per les dues botigues, un darrere l'altre |
| Schema | La forma que ha de tenir un JSON. La resposta del model es valida contra un |
| stdio | La manera com el taller parla amb els servidors MCP: els arrenca com a processos i els escriu per la seva entrada estàndard |
| Subagent | Al taller, codi que crida eines MCP amb arguments fixos i retorna un JSON. No és un model |
| TOON | Token-Oriented Object Notation. Un format més compacte que JSON per passar dades a un model |
