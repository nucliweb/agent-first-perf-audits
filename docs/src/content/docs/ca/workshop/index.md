---
title: Com seguir el taller
description: Tres maneres de recórrer el mateix material, segons el temps que tinguis i si vas a aixecar el laboratori. Una xerrada amb demo, el taller guiat o el taller pel teu compte.
sidebar:
  order: 1
---

El taller construeix un gate de rendiment per a pull requests: uns agents mesuren una botiga abans i després d'un canvi, unes regles decideixen si ha empitjorat i un LLM n'explica la causa. És un sol material, i es recorre de tres maneres.

## Tres recorreguts

| Recorregut | Durada | Què necessites | Què inclou |
|---|---|---|---|
| [Xerrada amb demo](#xerrada-amb-demo) | 45 a 60 min | Un navegador | Els conceptes, les quatre branques al navegador i el gate en una pull request de GitHub |
| [Taller guiat](#taller-guiat) | 2 h | El laboratori, descarregat a casa | Els sis passos, amb algú que marca el ritme |
| [Pel teu compte](#pel-teu-compte) | 2 a 3 h | El laboratori | Els mateixos sis passos al teu ritme, i els reptes |

Els tres expliquen el mateix: el CI clàssic no veu les regressions de rendiment, les regles decideixen i l'LLM explica. El que canvia és quant executes tu.

Amb 8 GB de RAM, els dos recorreguts amb laboratori es poden seguir amb el perfil `lite`, sense model local: ho explica [Preparació](../setup/#amb-8-gb-el-perfil-lite).

## Xerrada amb demo

Per a una audiència que no obrirà el terminal, o per decidir si t'interessa el taller sencer. No cal Docker.

1. **Els conceptes.** Què mesuren LCP, CLS i INP, les seves fases i com decideix el gate, a [Conceptes](../concepts/) o a [les diapositives](/slides/ca/).
2. **Les quatre branques al navegador.** La botiga de `main` i la de cada branca estan desplegades, i [Les branques al navegador](../previews/) diu què mirar a DevTools a cadascuna.
3. **El gate en una pull request.** Cada branca `pr/*` del repo té la seva pull request, amb el check del gate i l'informe en un comentari. Comença per la de [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1), que falla, i compara-la amb la de [`pr/noop-refactor`](https://github.com/nucliweb/agent-first-perf-audits/pull/4), que passa.

A GitHub Actions l'explicació la redacta Claude Sonnet 5.5 en lloc del model local, i el veredicte surt de les mateixes regles. [Learnings](../learnings/#la-mateixa-entrada-a-un-model-més-gran) compara les dues explicacions amb la mateixa entrada.

## Taller guiat

Dues hores, amb algú que presenta i marca el ritme; per a aquesta persona hi ha la [guia de qui presenta](../facilitator/). Els assistents arriben amb el laboratori descarregat i el preflight en verd: [Preparació](../setup/) es fa a casa, perquè les imatges pesen diversos GB.

L'agenda, amb el temps de màquina de cada pas. El que sobra de cada forat és per explicar, mirar els resultats i esperar qui va més a poc a poc:

| Inici | Bloc | A l'agenda | Màquina, `llm` | Màquina, `lite` |
|---|---|---|---|---|
| 0:00 | Context: per què el CI clàssic no veu aquestes regressions | 10 min | | |
| 0:10 | [1. La primera crida a un MCP](step-01/) | 15 min | 0,8 min | 0,8 min |
| 0:25 | [2. El subagent d'LCP](step-02/) | 20 min | 2,9 min | 2,9 min |
| 0:45 | [3. Navigator, CLS i LoAF/INP](step-03/) | 20 min | 6,9 min | 6,9 min |
| 1:05 | [4. El Judge](step-04/) | 20 min | 4,6 min | 4,0 min |
| 1:25 | [5. El gate a `ci` contra les quatre branques](step-05/) | 20 min | 11,3 min | 9,5 min |
| 1:45 | [6. Portar-ho a la teva plataforma](step-06/), learnings i preguntes | 15 min | | |
| | Total | 120 min | 26,5 min | 24,0 min |

Els temps de màquina són els del Mac de referència, mesurats amb l'[assaig cronometrat](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.ca.md), que executa les ordres de les guies en un clon net. En un altre equip canvien. El total se suma abans d'arrodonir.

## Pel teu compte

Els mateixos sis passos, sense ningú que marqui el ritme. Les guies dels passos 1 a 5 estan escrites per seguir-se soles:

- **Què aprendràs** i **La idea en un minut** posen el concepte abans de les ordres.
- **Pas a pas** dona cada ordre amb la sortida que ha de donar.
- **Mentre esperes** diu què mirar durant les mesures llargues, del pas 2 al 5.
- **Punt de control** i **Si alguna cosa falla** diuen quan donar el pas per bo i què fer quan no surt.

L'ordre:

1. [Preparació](../setup/): comprova el teu equip i descarrega el laboratori.
2. [Conceptes](../concepts/): les mètriques i com decideix el gate. Si un terme no et sona, és al [Glossari](../glossary/).
3. Els passos, de l'[1](step-01/) al [6](step-06/). No cal programar: els passos 1 a 4 apliquen el seu codi amb `git checkout`, i escriure'l tu és opcional.
4. Els [Reptes](../challenges/), quan el gate ja et funcioni: arreglar una regressió i veure passar el gate, demanar l'explicació a un altre model, treure el throttling per veure què deixa de veure's i crear la teva pròpia regressió.

Es pot partir en diversos dies. `docker compose down` atura el laboratori i `docker compose up -d` l'aixeca una altra vegada; el que has fet continua a la teva branca `taller` i a la carpeta `out/`. Amb `lite`, posa-hi `COMPOSE_PROFILES=lite` al davant, com a la resta del taller.
