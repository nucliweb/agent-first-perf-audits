---
title: "Paso 4: el Judge"
description: Las reglas deciden el veredicto, el LLM local explica la causa y los hallazgos de los subagentes la respaldan.
sidebar:
  order: 14
---

## Objetivo

Juntar todo en un veredicto que se pueda defender. El Judge corre el mismo gate que `ci`: la CLI de WebPerf Snippets decide si la rama empeora (Mann-Whitney U, umbrales y exit code), trace-engine-cli atribuye y el LLM local explica la causa de cada métrica que empeora. Los hallazgos de los subagentes, los hechos que las reglas escogen de lo que han medido, van al informe junto a la explicación. En este paso pasas de la evidencia a la causa y a la propuesta de solución, con la rama `pr/lcp-hero-lazy`.

## Antes de empezar

Sigues en tu rama `taller`, con el laboratorio levantado. Si no has terminado los pasos anteriores, no pasa nada: la solución de este paso trae también la de los anteriores.

## Paso a paso

1. Lanza los tests del paso:

   ```bash
   docker compose run --rm agents node --test test/judge/findings.test.ts
   ```

   Los 5 tests fallan (`fail 5`) con mensajes como este:

   ```text
   Step 4 of the workshop: the facts of the LCP subagent for a regressed LCP. Its tests: test/judge/findings.test.ts
   ```

   Es el punto de partida, no un error: `lcpFacts`, `clsFacts` e `inpFacts`, en `agents/src/judge/findings.ts`, todavía son un `throw`.

2. Aplica la solución del paso:

   ```bash
   git checkout step-04-solution -- agents/src
   ```

3. Vuelve a lanzar los tests:

   ```bash
   docker compose run --rm agents node --test test/judge/findings.test.ts
   ```

   Los 5 pasan (`pass 5`) en unos segundos.

4. Cambia la tienda candidata por la rama del hero:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose up -d
   ```

5. Mide el LCP y pasa el Judge:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
   ```

   Son unos 7 minutos. Después de las dos líneas del LCP, el Judge escribe cada fase; estas son las que importan:

   ```text
   [orchestrator] judge: pr/lcp-hero-lazy against main, llm profile
   [orchestrator] judge: gate: fail
   [orchestrator] judge: explanation: 1 call(s) to llama3.2:3b
   [orchestrator] judge: fail: report in report.md, report.html and report.json
   [orchestrator] judge: findings of the subagents: LCP in home (4 facts)
   ```

6. Lee el informe, `out/agents/judge/report.md`. Es donde se ve el diagnóstico completo:

   - **El veredicto** es de las reglas: el gate falla por el LCP de la home.
   - **La causa** la explica el LLM: nombra el `loading="lazy"` del hero.
   - **Los hallazgos**, al final, añaden lo que el LLM no dice: el preload y el `fetchpriority` que pierde la imagen. Con los fixtures de los tests son estas cuatro frases:

     ```text
     LCP of the home: 760 ms in the baseline, 1168 ms in the branch (median of 3 runs)
     The phase that grows the most is resourceLoadDelay: 188 ms to 741 ms
     The LCP image changes: loading (not set) to lazy, fetchpriority high to (not set), preload removed
     New warnings of the LCP image: lcp-no-fetchpriority, lcp-lazy, lcp-not-preloaded
     ```

   La propuesta de solución sale de ahí: devolver al hero el preload y `fetchpriority="high"`, y quitarle `loading="lazy"`. Con el perfil `lite` no hay explicación del LLM: el informe remite a `handoff.md`, que lleva la misma entrada para un agente de tu elección, y los hallazgos están igual.

7. Pasa la comprobación del paso:

   ```bash
   docker compose run --rm agents npm run check -- step-04
   ```

   ```text
   step-04: The Judge

     OK  tests: test/judge/findings.test.ts
     OK  out/agents/judge/report.json

   step-04 is done.
   ```

## Qué hace el código que has aplicado

Para verlo:

```bash
git diff workshop-start -- agents/src/judge/findings.ts
```

Son tres funciones:

| Función | Para una métrica que empeora | Con lo que midió |
|---|---|---|
| `lcpFacts` | LCP, solo en la home, que es lo que mide el subagente | El subagente de LCP |
| `clsFacts` | CLS, en el recorrido que se llama como el escenario del gate | El subagente de CLS |
| `inpFacts` | INP, en el recorrido que se llama como el escenario del gate | El subagente de LoAF/INP |

Cada una devuelve una lista de frases, vacía si el subagente no corrió en los dos lados. `findingsFor` las llama en el orden de las métricas que deciden las reglas. Aquí no hay MCP: son reglas sobre los JSON de los subagentes.

El LLM no ve estos hechos: recibe el mismo prompt que en `ci`, el que se ha comprobado en el benchmark de modelos. Por qué está separado lo cuenta [Learnings](../../learnings/), en "El LLM explica, las reglas deciden".

## Si quieres escribirlo tú (opcional)

En lugar del punto 2, escribe las tres funciones en `agents/src/judge/findings.ts`, cada una entre sus marcas `// workshop: step 4`. Después sigue desde el punto 3: las frases exactas están en `agents/test/judge/findings.test.ts`. Si te atascas, el punto 2 sobrescribe lo que hayas escrito con la solución.

El fichero ya trae lo que necesitas:

- `bothSides(found, name)`: el resultado de un subagente en el baseline y en la rama, o `null` si falta uno.
- `grownPhase(baseline, candidate, unit)`: la frase de la fase que más crece.
- `scriptKey`: un script de los long frames sin el origen ni el hash del bundle, que cambian de un lado a otro.
- `suspectsFor` de `suspects.ts`: las funciones que crecen en el trace de la rama, las mismas reglas que usa el Judge para su prompt.

Pistas:

- Una frase solo entra si dice algo: si la imagen no cambia, no hay frase de cambios; si no hay avisos nuevos, tampoco.
- En CLS, los nodos que cuentan son los que se mueven en la rama y no en el baseline, como mucho tres.
- En INP, los scripts nuevos son los de la rama cuya clave no está en el baseline, y la función sale del trace del click de cada lado.
