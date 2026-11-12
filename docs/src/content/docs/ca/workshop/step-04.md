---
title: "Pas 4: el Judge"
description: Les regles decideixen el veredicte, l'LLM local explica la causa i les troballes dels subagents la sustenten.
sidebar:
  order: 14
---

## Objectiu

Ajuntar-ho tot en un veredicte que es pugui defensar. El Judge executa el mateix gate que `ci`: la CLI de WebPerf Snippets decideix si la branca empitjora (Mann-Whitney U, llindars i exit code), trace-engine-cli atribueix i l'LLM local explica la causa de cada mètrica que empitjora. En aquest pas escrius la part que uneix els subagents amb el Judge: els fets que les regles trien del que han mesurat, i que van a l'informe al costat de l'explicació.

## Què escriuràs

Tres funcions d'`agents/src/judge/findings.ts`, cadascuna entre les seves marques `// workshop: step 4`:

| Funció | Per a una mètrica que empitjora | Amb el que va mesurar |
|---|---|---|
| `lcpFacts` | LCP, només a la home, que és el que mesura el subagent | El subagent d'LCP |
| `clsFacts` | CLS, al recorregut que es diu com l'escenari del gate | El subagent de CLS |
| `inpFacts` | INP, al recorregut que es diu com l'escenari del gate | El subagent de LoAF/INP |

Cadascuna retorna una llista de frases, buida si el subagent no s'ha executat als dos costats. `findingsFor`, que ja hi és, les crida en l'ordre de les mètriques que decideixen les regles.

## Les eines

Aquí no hi ha MCP: són regles sobre els JSON dels subagents. El fitxer ja porta el que necessites:

- `bothSides(found, name)`: el resultat d'un subagent al baseline i a la branca, o `null` si en falta un.
- `grownPhase(baseline, candidate, unit)`: la frase de la fase que més creix.
- `scriptKey`: un script dels long frames sense l'origen ni el hash del bundle, que canvien d'un costat a l'altre.
- `suspectsFor` de `suspects.ts`: les funcions que creixen al trace de la branca, les mateixes regles que fa servir el Judge per al seu prompt.

## Pistes

Les frases exactes són a `agents/test/judge/findings.test.ts`, amb resultats reals dels subagents. Per exemple, per a l'LCP de `pr/lcp-hero-lazy`:

```text
LCP of the home: 760 ms in the baseline, 1168 ms in the branch (median of 3 runs)
The phase that grows the most is resourceLoadDelay: 188 ms to 741 ms
The LCP image changes: loading (not set) to lazy, fetchpriority high to (not set), preload removed
New warnings of the LCP image: lcp-no-fetchpriority, lcp-lazy, lcp-not-preloaded
```

- Una frase només entra si diu alguna cosa: si la imatge no canvia, no hi ha frase de canvis; si no hi ha avisos nous, tampoc.
- En el CLS, els nodes que compten són els que es mouen a la branca i no al baseline, com a màxim tres.
- En l'INP, els scripts nous són els de la branca la clau dels quals no és al baseline, i la funció surt del trace del click de cada costat.

L'LLM no veu aquests fets: rep el mateix prompt que a `ci`, el que s'ha comprovat al benchmark de models. Per què està separat ho explica [Learnings](../../learnings/), a "L'LLM explica, les regles decideixen".

## Comprova-ho

```bash
docker compose run --rm agents node --test test/judge/findings.test.ts
```

Després, l'LCP i el Judge contra la branca del hero:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
```

El Judge escriu a `out/agents/judge/` l'informe a `report.md`, `report.html` i `report.json`, i el handoff. El gate ha de fallar per l'LCP, l'explicació de l'LLM ha d'anomenar el `loading="lazy"` del hero i les teves troballes han d'afegir el que no diu: el preload i el `fetchpriority` que perd la imatge. Amb el perfil `lite` no hi ha explicació de l'LLM: l'informe remet a `handoff.md`, que porta la mateixa entrada per a un agent de la teva elecció, i les troballes hi són igualment.

```bash
docker compose run --rm agents npm run check -- step-04
```

## Si et quedes enrere

```bash
git checkout step-04-solution -- agents/src
```
