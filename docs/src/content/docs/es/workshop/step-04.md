---
title: "Paso 4: el Judge"
description: Las reglas deciden el veredicto, el LLM local explica la causa y los hallazgos de los subagentes la respaldan.
sidebar:
  order: 14
---

## Qué vas a aprender

- Quién decide en un gate de rendimiento, las reglas y su estadística, y qué papel le queda al LLM.
- Leer un informe del Judge: el veredicto, la causa y los hallazgos que la respaldan.
- Pasar de la evidencia a una propuesta de solución.

## Tiempo

Este paso tiene 20 minutos en la agenda. El tiempo de máquina está medido en el Mac de referencia, con el [ensayo cronometrado](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.es.md):

| | `llm` | `lite` |
|---|---|---|
| Tiempo de máquina del paso | 4,6 min | 4,0 min |
| Punto 5, medir el LCP y pasar el Judge | 3,9 min | 3,3 min |

## La idea en un minuto

Un veredicto que se pueda defender no puede salir de un modelo de lenguaje. El Judge corre el mismo gate que `ci`, y cada parte tiene un dueño:

<img src="/diagrams/gate.svg" alt="El gate mide el baseline y la rama alternando sus ejecuciones; si el cambio supera el umbral y p es menor que 0,05, sale con 1, trace-engine-cli atribuye el cambio y el LLM lo explica; si supera el umbral y p no llega, mide dos ejecuciones más por lado y decide otra vez; si no, sale con 0" width="1120" height="340" loading="lazy" decoding="async">

- **Las reglas deciden.** La CLI de WebPerf Snippets mide las dos tiendas y dice si la rama empeora, con un test estadístico (Mann-Whitney U), un umbral por métrica y un exit code.
- **trace-engine-cli atribuye.** Sobre los traces de los dos lados, nombra el elemento, el script o la función que cambia.
- **El LLM local explica.** Recibe lo ya medido y redacta la causa de cada métrica que empeora. Si contradice a las reglas, ganan las reglas.
- **Los hallazgos de los subagentes respaldan.** Son los hechos que las reglas escogen de lo que midieron los pasos 2 y 3, y van al informe junto a la explicación.

Cómo decide el gate, y qué es p, está en [Conceptos](../../concepts/#cómo-decide-el-gate). En este paso pasas de la evidencia a la causa y a la propuesta de solución, con la rama `pr/lcp-hero-lazy`.

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

   Es la espera del paso. Después de las dos líneas del LCP, el Judge escribe cada fase; estas son las que importan:

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

## Mientras esperas

El punto 5 mide el gate entero: cinco ejecuciones por lado en cada escenario, alternando las dos tiendas. Mientras tanto:

- Sigue las líneas `judge: gate`, `judge: trace` y `judge: explanation`: son las tres partes, en orden. ¿En cuál se decide el veredicto?
- Abre `agents/schemas/verdict.schema.json`: es la forma que tiene que tener la respuesta del LLM. ¿Qué pasaría con una respuesta que no la cumple?
- Si el LLM dijera que la rama pasa y las reglas que falla, ¿qué saldría en el informe?

## Punto de control

En pantalla, `[orchestrator] judge: gate: fail` y `step-04 is done.`, y en `out/agents/judge/` un `report.md` con el veredicto, la causa y los hallazgos del LCP.

## Si algo falla

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| `judge: gate: pass`, y el informe lleva arriba el bloque "Inconclusive: run the gate again." | El cambio supera el umbral, pero las medidas no bastan para afirmarlo | Repite el punto 5. La comprobación del punto 7 dice lo mismo |
| Con `lite`, la primera línea dice `lite profile` y no sale la de `explanation` | Es lo esperado: no hay LLM local | El informe remite a `handoff.md`, con la misma entrada para un agente de tu elección |
| El informe trae el veredicto, y un error donde iría la explicación | El LLM local no respondió, o respondió algo que no cumple el schema | El veredicto no depende de él. Comprueba con `docker compose ps` que `ollama` está en marcha y repite el punto 5 |
| La explicación solo nombra `loading="lazy"` | El modelo local es pequeño y se queda con un cambio | Los hallazgos, al final del informe, dan los otros dos |

## Qué te llevas

- Las reglas deciden y el LLM explica. Si se contradicen, ganan las reglas y el informe lo dice.
- Un veredicto se defiende con la estadística, la atribución y los hechos. La frase del LLM es lo último que llega, no lo primero.
- Con el perfil `lite`, el veredicto y los hallazgos son los mismos, y la explicación se puede pedir fuera con el handoff.

Para pensar: en tu equipo, ¿quién leería este informe, y qué necesita ver para fiarse de él?

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
