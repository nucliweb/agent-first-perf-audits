---
title: "Paso 4: el Judge"
description: Las reglas deciden el veredicto, el LLM local explica la causa y los hallazgos de los subagentes la respaldan.
sidebar:
  order: 14
---

## Objetivo

Juntar todo en un veredicto que se pueda defender. El Judge corre el mismo gate que `ci`: la CLI de WebPerf Snippets decide si la rama empeora (Mann-Whitney U, umbrales y exit code), trace-engine-cli atribuye y el LLM local explica la causa de cada métrica que empeora. En este paso escribes la parte que une a los subagentes con el Judge: los hechos que las reglas escogen de lo que han medido, y que van al informe junto a la explicación.

## Qué vas a escribir

Tres funciones de `agents/src/judge/findings.ts`, cada una entre sus marcas `// workshop: step 4`:

| Función | Para una métrica que empeora | Con lo que midió |
|---|---|---|
| `lcpFacts` | LCP, solo en la home, que es lo que mide el subagente | El subagente de LCP |
| `clsFacts` | CLS, en el recorrido que se llama como el escenario del gate | El subagente de CLS |
| `inpFacts` | INP, en el recorrido que se llama como el escenario del gate | El subagente de LoAF/INP |

Cada una devuelve una lista de frases, vacía si el subagente no corrió en los dos lados. `findingsFor`, que ya está, las llama en el orden de las métricas que deciden las reglas.

## Las herramientas

Aquí no hay MCP: son reglas sobre los JSON de los subagentes. El fichero ya trae lo que necesitas:

- `bothSides(found, name)`: el resultado de un subagente en el baseline y en la rama, o `null` si falta uno.
- `grownPhase(baseline, candidate, unit)`: la frase de la fase que más crece.
- `scriptKey`: un script de los long frames sin el origen ni el hash del bundle, que cambian de un lado a otro.
- `suspectsFor` de `suspects.ts`: las funciones que crecen en el trace de la rama, las mismas reglas que usa el Judge para su prompt.

## Pistas

Las frases exactas están en `agents/test/judge/findings.test.ts`, con resultados reales de los subagentes. Por ejemplo, para el LCP de `pr/lcp-hero-lazy`:

```text
LCP of the home: 760 ms in the baseline, 1168 ms in the branch (median of 3 runs)
The phase that grows the most is resourceLoadDelay: 188 ms to 741 ms
The LCP image changes: loading (not set) to lazy, fetchpriority high to (not set), preload removed
New warnings of the LCP image: lcp-no-fetchpriority, lcp-lazy, lcp-not-preloaded
```

- Una frase solo entra si dice algo: si la imagen no cambia, no hay frase de cambios; si no hay avisos nuevos, tampoco.
- En CLS, los nodos que cuentan son los que se mueven en la rama y no en el baseline, como mucho tres.
- En INP, los scripts nuevos son los de la rama cuya clave no está en el baseline, y la función sale del trace del click de cada lado.

El LLM no ve estos hechos: recibe el mismo prompt que en `ci`, el que se ha comprobado en el benchmark de modelos. Por qué está separado lo cuenta [Learnings](../../learnings/), en "El LLM explica, las reglas deciden".

## Compruébalo

```bash
docker compose run --rm agents node --test test/judge/findings.test.ts
```

Después, el LCP y el Judge contra la rama del hero:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
```

El Judge escribe en `out/agents/judge/` el informe en `report.md`, `report.html` y `report.json`, y el handoff. El gate tiene que fallar por el LCP, la explicación del LLM tiene que nombrar el `loading="lazy"` del hero y tus hallazgos tienen que añadir lo que no dice: el preload y el `fetchpriority` que pierde la imagen. Con el perfil `lite` no hay explicación del LLM: el informe remite a `handoff.md`, que lleva la misma entrada para un agente de tu elección, y los hallazgos están igual.

```bash
docker compose run --rm agents npm run check -- step-04
```

## Si te descuelgas

```bash
git checkout step-04-solution -- agents/src
```
