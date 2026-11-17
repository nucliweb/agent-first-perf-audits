---
title: Guia de qui presenta
description: Com impartir el taller. Quin format triar, què preparar abans, què dir a cada bloc i a cada espera, i què fer quan alguna cosa es torça.
sidebar:
  order: 95
---

Les guies dels passos diuen què executa cada assistent. Aquesta diu què fas tu mentrestant: què expliques abans de cada ordre, quines preguntes fas durant les esperes i quan dónes un pas per bo.

## Tria el format amb la sala al davant

[Com seguir el taller](../workshop/) descriu tres recorreguts. El taller guiat només funciona si la sala arriba amb el laboratori descarregat: les imatges pesen diversos GB i la Wi-Fi d'un esdeveniment no dona per a tothom.

| El que tens | Format |
|---|---|
| Dues hores, i la majoria amb el preflight en verd | Taller guiat |
| Menys temps, o una sala que no ha preparat l'equip | Xerrada amb demo |
| Una sala mixta | Taller guiat. Qui no té el laboratori segueix cada regressió a [Les branques al navegador](../previews/), o s'asseu amb algú que sí |

Decideix en començar, preguntant qui té el preflight en verd. Començar per la xerrada és millor que canviar de format a mitja sessió.

Si la sala pregunta molt per les mètriques, dedica-hi el temps: els [Conceptes](../concepts/) són el que resol més dubtes, i retallar un pas per explicar-los bé és un bon canvi.

## Una setmana abans

- Envia [Preparació](../setup/) a qui s'apunta i demana que la faci a casa. El preflight ha d'acabar sense cap `KO`.
- Demana que llancin també el `git fetch` del principi del [pas 1](../workshop/step-01/#abans-de-començar). És l'única ordre dels passos que necessita xarxa.
- Digues que portin el carregador.

## La vigília

A l'equip amb què presentes:

- Actualitza el repo i passa el preflight: `scripts/preflight.sh`.
- Assaja el [pas 5](../workshop/step-05/) sencer una vegada, amb la màquina sola. Ha de donar tres fallades i un pass.
- Deixa lliures la CPU i el disc. Tanca còpies de seguretat, videotrucades i altres contenidors: `docker ps` no hauria de llistar res que no sigui el laboratori, i `docker system df` diu quant ocupa Docker.
- Obre en pestanyes les diapositives, [Les branques al navegador](../previews/) i les pull requests de [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1) i de [`pr/noop-refactor`](https://github.com/nucliweb/agent-first-perf-audits/pull/4). Desa captures del check i del comentari de cadascuna, per si la xarxa de la sala falla.
- Prova la vista de qui presenta de les diapositives: la tecla `n` obre una segona finestra amb les notes de cada diapositiva, la diapositiva següent, el temps total i el temps del bloc davant del seu forat a l'agenda. La tecla `r` posa el rellotge a zero.
- Puja la mida de lletra del terminal: les línies que cal llegir a cada punt de control són llargues.

El dia del taller, presenta amb el portàtil endollat. L'INP de `pr/loaf-cart-handler` depèn de com de ràpida vagi la CPU, i amb ella canvien les xifres que surten en pantalla.

## Tres regles per a tota la sessió

- **Una ordre, una espera, una pregunta.** Cada pas té una mesura llarga. Llança l'ordre i fes servir l'espera per a les preguntes de l'apartat "Mentre esperes" de la seva guia. És el moment en què s'entén el que s'acaba d'executar.
- **El punt de control és de la sala, no teu.** No continuïs fins que la línia `step-0N is done.` sigui a la majoria de les pantalles. Qui es queda enrere aplica la solució del pas en curs i llança la seva mesura. La comprovació del pas li escriu l'ordre que li falta.
- **Les mesures, una darrere l'altra, també al teu equip.** Mentre es projecta una mesura, no llancis res més. Una mesura amb la màquina ocupada pot donar un altre veredicte, i explicar-ho en directe costa més que evitar-ho.

Els temps de cada bloc són a [l'agenda](../workshop/#taller-guiat), amb el temps de màquina de cada pas. El que sobra de cada forat és teu.

## Bloc a bloc

### Context

- **Què expliques.** Comença pel problema, no per les eines: quatre pull requests contra una botiga, els tests de l'app passen a les quatre i tres d'elles empitjoren el que nota qui la fa servir. Ensenya'n una al navegador, la del hero, des de [Les branques al navegador](../previews/).
- **Què deixes per després.** Dels conceptes, només l'LCP i les seves fases, que calen al pas 2. L'INP i el CLS s'expliquen millor durant l'espera del pas 3.

### Pas 1: la primera crida a un MCP

- **Què expliques.** Un servidor MCP publica eines amb nom i arguments, i qui les crida pot ser un programa. Explica aquí, una sola vegada, el ritme de tots els passos: tests en vermell, solució amb `git`, tests en verd, mesura i comprovació.
- **L'espera.** No n'hi ha: cap ordre arriba al minut.
- **Punt de control.** `step-01 is done.` en pantalla. Obre el teu `out/first-trace.json` al panell Performance de DevTools perquè es vegi que un trace és evidència per a persones.
- **Si no surt.** Quan un laboratori no arrenca, el més freqüent és la memòria de la màquina virtual. Que continuï amb el perfil `lite` o amb qui tingui al costat, i no ho depuris davant de tothom.

### Pas 2: el subagent d'LCP

- **Què expliques.** L'LCP es llegeix per fases, i el subagent mesura sense decidir res: deixa un JSON.
- **L'espera.** La mesura de les dues botigues. Demana que obrin les dues al navegador i pregunta si noten la diferència a simple vista. Després, per què el subagent es queda amb la mediana de tres mesures.
- **Punt de control.** Les dues línies `[orchestrator] lcp`, amb una fase més lenta diferent a cada costat: `resourceLoadTime` al baseline i `resourceLoadDelay` a la branca.
- **Si no surt.** Si a algú les dues línies li diuen el mateix, li falta `CANDIDATE=pr-lcp-hero-lazy` davant de les ordres.

### Pas 3: Navigator, CLS i LoAF/INP

- **Què expliques.** Un recorregut és un fitxer de dades, el mateix per al Navigator, per als subagents i per al gate.
- **L'espera.** És la més llarga dels quatre primers passos, i el lloc de les diapositives de l'INP i del CLS: les tres fases d'una interacció, els long animation frames i quins desplaçaments compten. Acaba amb la pregunta de la guia: per què el Navigator va abans que els altres dos.
- **Punt de control.** La línia `loaf, candidate`, amb `add-to-cart` com a recorregut més lent i `DIV#root.onclick` com a script.
- **Si no surt.** Un INP diferent del de la guia és el normal: depèn de la màquina. El que ha de coincidir és quin recorregut és el lent i quin script el bloqueja.
- **Si vas tard.** El punt 7, el CLS amb la branca del bàner, és opcional. Ensenya'l a la teva pantalla i continua.

### Pas 4: el Judge

- **Què expliques.** La idea del taller sencer: les regles decideixen i l'LLM explica. Amb l'informe en pantalla, llegeix en aquest ordre: el veredicte, la causa i les troballes que la recolzen.
- **L'espera.** La mesura del gate. Les tres línies `judge: gate`, `judge: trace` i `judge: explanation` surten en ordre: pregunta en quina es decideix el veredicte, i què sortiria a l'informe si l'LLM digués el contrari que les regles.
- **Punt de control.** `[orchestrator] judge: gate: fail`, i un `report.md` a `out/agents/judge/`.
- **Si no surt.** Amb `lite` no hi ha explicació del model i l'informe remet a `handoff.md`: digues-ho abans que ho preguntin. Si un informe porta a dalt el bloc "Inconclusive", es repeteix la mesura, i és una bona ocasió per explicar per què un gate ha de saber dir que no ho sap.

### Pas 5: el gate a ci

- **Què expliques.** Tot l'anterior cap en un servei i un exit code. El gate compara amb `main`, no amb els llindars de Google: les tres regressions queden dins de "good".
- **L'espera.** És la més llarga del taller. Llança el bucle tot just començar el bloc i explica la resta mentre corre. Quan acabi la primera branca, llegeix-ne el `report.md` en pantalla. Després ensenya el mateix gate a GitHub: el check i el comentari de la pull request de `pr/lcp-hero-lazy`, i la de `pr/noop-refactor`, que passa sense que ningú pregunti res al model.
- **Punt de control.** Els quatre exit codes, `1`, `1`, `1` i `0`.
- **Si no surt.** Una branca amb regressió que surt amb 0 ha quedat com a no concloent: es llança una altra vegada aquesta branca. Si `pr-noop-refactor` surt amb 1, la màquina estava ocupada.
- **Si vas tard.** Ensenya a les pull requests les branques que no hagin acabat, i deixa que el bucle acabi mentre tanques.

### Pas 6 i tancament

- **Què expliques.** Què canvia i què es conserva en portar-ho a una altra plataforma. Deixa uns minuts per a la taula "El teu pla" i demana a dues persones que llegeixin una fila de la seva.
- **Amb què tanques.** Tres idees: les regles decideixen i l'LLM explica; es compara amb la versió base, no amb un llindar; i un gate ha de dir quan les dades no li basten. Per a qui vulgui continuar, els [Reptes](../challenges/) i els [Learnings](../learnings/).

## Si alguna cosa es torça

| Què passa | Què fas |
|---|---|
| La xarxa de la sala no va | Els passos no la necessiten després del `git fetch` del pas 1. La demo de GitHub, amb les captures de la vigília |
| A algú no li arrenca el laboratori | Perfil `lite` si és la memòria, o en parella. [Problemes freqüents](../troubleshooting/) per a després de la sessió |
| Vas tard | Retalla per aquest ordre: el punt 7 del pas 3, la taula del pas 6 i el final del bucle del pas 5. El pas 4 no es retalla |
| El teu equip falla | Passa a la xerrada amb demo: diapositives, les branques al navegador i les pull requests |
| Un veredicte no és el de la guia a la teva pantalla | És material, no un accident. Ensenya el bloc "Inconclusive" de l'informe i explica amb [Conceptes](../concepts/#per-què-importa-quantes-vegades-es-mesura) per què el gate mesura més vegades abans de decidir |

## La xerrada amb demo

El mateix fil en menys temps i sense terminal:

1. El problema, amb la branca del hero al navegador.
2. Els conceptes, amb les diapositives: les mètriques, les seves fases i com decideix el gate.
3. Les altres dues regressions al navegador, amb DevTools obert. [Les branques al navegador](../previews/#com-veure-cada-regressió) diu què mirar a cadascuna.
4. El gate a les pull requests: la que falla, amb el seu check i el seu comentari, i la que passa.
5. El tancament, amb les mateixes tres idees.
