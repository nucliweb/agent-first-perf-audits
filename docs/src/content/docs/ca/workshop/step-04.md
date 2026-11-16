---
title: "Pas 4: el Judge"
description: Les regles decideixen el veredicte, l'LLM local n'explica la causa i les troballes dels subagents la sostenen.
sidebar:
  order: 14
---

## Què aprendràs

- Qui decideix en un gate de rendiment, les regles i la seva estadística, i quin paper li queda a l'LLM.
- Llegir un informe del Judge: el veredicte, la causa i les troballes que la sostenen.
- Passar de l'evidència a una proposta de solució.

## Temps

Aquest pas té 20 minuts a l'agenda. El temps de màquina està mesurat al Mac de referència, amb l'[assaig cronometrat](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.ca.md):

| | `llm` | `lite` |
|---|---|---|
| Temps de màquina del pas | 4,6 min | 4,0 min |
| Punt 5, mesurar l'LCP i passar el Judge | 3,9 min | 3,3 min |

## La idea en un minut

Un veredicte que es pugui defensar no pot sortir d'un model de llenguatge. El Judge executa el mateix gate que `ci`, i cada part té un amo:

<img src="/diagrams/gate.svg" alt="El gate mesura el baseline i la branca alternant les seves execucions; si el canvi supera el llindar i p és menor que 0,05, surt amb 1, trace-engine-cli atribueix el canvi i l'LLM l'explica; si supera el llindar i p no hi arriba, mesura dues execucions més per costat i decideix una altra vegada; si no, surt amb 0" width="1120" height="340" loading="lazy" decoding="async">

- **Les regles decideixen.** La CLI de WebPerf Snippets mesura les dues botigues i diu si la branca empitjora, amb un test estadístic (Mann-Whitney U), un llindar per mètrica i un exit code.
- **trace-engine-cli atribueix.** Sobre els traces dels dos costats, anomena l'element, l'script o la funció que canvia.
- **L'LLM local explica.** Rep el que ja s'ha mesurat i redacta la causa de cada mètrica que empitjora. Si contradiu les regles, guanyen les regles.
- **Les troballes dels subagents sostenen.** Són els fets que les regles trien del que van mesurar els passos 2 i 3, i van a l'informe al costat de l'explicació.

Com decideix el gate, i què és p, és a [Conceptes](../../concepts/#com-decideix-el-gate). En aquest pas passes de l'evidència a la causa i a la proposta de solució, amb la branca `pr/lcp-hero-lazy`.

## Abans de començar

Continues a la teva branca `taller`, amb el laboratori aixecat. Si no has acabat els passos anteriors, no passa res: la solució d'aquest pas porta també la dels anteriors.

## Pas a pas

1. Llança els tests del pas:

   ```bash
   docker compose run --rm agents node --test test/judge/findings.test.ts
   ```

   Els 5 tests fallen (`fail 5`) amb missatges com aquest:

   ```text
   Step 4 of the workshop: the facts of the LCP subagent for a regressed LCP. Its tests: test/judge/findings.test.ts
   ```

   És el punt de partida, no un error: `lcpFacts`, `clsFacts` i `inpFacts`, a `agents/src/judge/findings.ts`, encara són un `throw`.

2. Aplica la solució del pas:

   ```bash
   git checkout step-04-solution -- agents/src
   ```

3. Torna a llançar els tests:

   ```bash
   docker compose run --rm agents node --test test/judge/findings.test.ts
   ```

   Tots 5 passen (`pass 5`) en uns segons.

4. Canvia la botiga candidata per la branca del hero:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose up -d
   ```

5. Mesura l'LCP i passa el Judge:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
   ```

   És l'espera del pas. Després de les dues línies de l'LCP, el Judge escriu cada fase; aquestes són les que importen:

   ```text
   [orchestrator] judge: pr/lcp-hero-lazy against main, llm profile
   [orchestrator] judge: gate: fail
   [orchestrator] judge: explanation: 1 call(s) to llama3.2:3b
   [orchestrator] judge: fail: report in report.md, report.html and report.json
   [orchestrator] judge: findings of the subagents: LCP in home (4 facts)
   ```

6. Llegeix l'informe, `out/agents/judge/report.md`. És on es veu el diagnòstic complet:

   - **El veredicte** és de les regles: el gate falla per l'LCP de la home.
   - **La causa** l'explica l'LLM: anomena el `loading="lazy"` del hero.
   - **Les troballes**, al final, afegeixen el que l'LLM no diu: el preload i el `fetchpriority` que perd la imatge. Amb els fixtures dels tests són aquestes quatre frases:

     ```text
     LCP of the home: 760 ms in the baseline, 1168 ms in the branch (median of 3 runs)
     The phase that grows the most is resourceLoadDelay: 188 ms to 741 ms
     The LCP image changes: loading (not set) to lazy, fetchpriority high to (not set), preload removed
     New warnings of the LCP image: lcp-no-fetchpriority, lcp-lazy, lcp-not-preloaded
     ```

   La proposta de solució surt d'aquí: tornar al hero el preload i `fetchpriority="high"`, i treure-li `loading="lazy"`. Amb el perfil `lite` no hi ha explicació de l'LLM: l'informe remet a `handoff.md`, que porta la mateixa entrada per a un agent que triïs, i les troballes hi són igual.

7. Passa la comprovació del pas:

   ```bash
   docker compose run --rm agents npm run check -- step-04
   ```

   ```text
   step-04: The Judge

     OK  tests: test/judge/findings.test.ts
     OK  out/agents/judge/report.json

   step-04 is done.
   ```

## Mentre esperes

El punt 5 mesura el gate sencer: cinc execucions per costat a cada escenari, alternant les dues botigues. Mentrestant:

- Segueix les línies `judge: gate`, `judge: trace` i `judge: explanation`: són les tres parts, en ordre. A quina es decideix el veredicte?
- Obre `agents/schemas/verdict.schema.json`: és la forma que ha de tenir la resposta de l'LLM. Què passaria amb una resposta que no la compleix?
- Si l'LLM digués que la branca passa i les regles que falla, què sortiria a l'informe?

## Punt de control

En pantalla, `[orchestrator] judge: gate: fail` i `step-04 is done.`, i a `out/agents/judge/` un `report.md` amb el veredicte, la causa i les troballes de l'LCP.

## Si alguna cosa falla

| Què veus | Per què | Què fer |
|---|---|---|
| `judge: gate: pass`, i l'informe porta a dalt el bloc "Inconclusive: run the gate again." | El canvi supera el llindar, però les mesures no basten per afirmar-ho | Repeteix el punt 5. La comprovació del punt 7 diu el mateix |
| Amb `lite`, la primera línia diu `lite profile` i no surt la d'`explanation` | És l'esperat: no hi ha LLM local | L'informe remet a `handoff.md`, amb la mateixa entrada per a un agent que triïs |
| L'informe porta el veredicte, i un error on aniria l'explicació | L'LLM local no ha respost, o ha respost alguna cosa que no compleix el schema | El veredicte no en depèn. Comprova amb `docker compose ps` que `ollama` està en marxa i repeteix el punt 5 |
| L'explicació només anomena `loading="lazy"` | El model local és petit i es queda amb un canvi | Les troballes, al final de l'informe, donen els altres dos |

## Què t'emportes

- Les regles decideixen i l'LLM explica. Si es contradiuen, guanyen les regles i l'informe ho diu.
- Un veredicte es defensa amb l'estadística, l'atribució i els fets. La frase de l'LLM és l'últim que arriba, no el primer.
- Amb el perfil `lite`, el veredicte i les troballes són els mateixos, i l'explicació es pot demanar fora amb el handoff.

Per pensar: al teu equip, qui llegiria aquest informe, i què necessita veure per refiar-se'n?

## Què fa el codi que has aplicat

Per veure'l:

```bash
git diff workshop-start -- agents/src/judge/findings.ts
```

Són tres funcions:

| Funció | Per a una mètrica que empitjora | Amb el que va mesurar |
|---|---|---|
| `lcpFacts` | LCP, només a la home, que és el que mesura el subagent | El subagent d'LCP |
| `clsFacts` | CLS, al recorregut que es diu com l'escenari del gate | El subagent de CLS |
| `inpFacts` | INP, al recorregut que es diu com l'escenari del gate | El subagent de LoAF/INP |

Cadascuna retorna una llista de frases, buida si el subagent no ha corregut als dos costats. `findingsFor` les crida en l'ordre de les mètriques que decideixen les regles. Aquí no hi ha MCP: són regles sobre els JSON dels subagents.

L'LLM no veu aquests fets: rep el mateix prompt que a `ci`, el que s'ha comprovat al benchmark de models. Per què està separat ho explica [Learnings](../../learnings/), a "L'LLM explica, les regles decideixen".

## Si el vols escriure tu (opcional)

En lloc del punt 2, escriu les tres funcions a `agents/src/judge/findings.ts`, cadascuna entre les seves marques `// workshop: step 4`. Després continua des del punt 3: les frases exactes són a `agents/test/judge/findings.test.ts`. Si t'encalles, el punt 2 sobreescriu el que hagis escrit amb la solució.

El fitxer ja porta el que necessites:

- `bothSides(found, name)`: el resultat d'un subagent al baseline i a la branca, o `null` si en falta un.
- `grownPhase(baseline, candidate, unit)`: la frase de la fase que més creix.
- `scriptKey`: un script dels long frames sense l'origen ni el hash del bundle, que canvien d'un costat a l'altre.
- `suspectsFor` de `suspects.ts`: les funcions que creixen al trace de la branca, les mateixes regles que fa servir el Judge per al seu prompt.

Pistes:

- Una frase només hi entra si diu alguna cosa: si la imatge no canvia, no hi ha frase de canvis; si no hi ha avisos nous, tampoc.
- A CLS, els nodes que compten són els que es mouen a la branca i no al baseline, com a molt tres.
- A INP, els scripts nous són els de la branca la clau dels quals no és al baseline, i la funció surt del trace del clic de cada costat.
