---
title: "Paso 6: llevarlo a tu plataforma"
description: Qué cambiar para pasar el gate y los subagentes a tu aplicación, y qué decisiones del taller conviene conservar.
sidebar:
  order: 16
---

## Qué vas a aprender

- Qué piezas del taller se quedan tal cual en tu plataforma y cuáles cambias.
- Qué decisiones de diseño conviene conservar, y con qué datos se tomaron.
- Cómo empezar: un plan de una página, con tu aplicación y tus recorridos.

## Qué cambias

| Pieza del taller | En tu plataforma |
|---|---|
| `shop-baseline` y `shop-candidate`, construidas desde dos refs git | Tu aplicación construida desde la rama principal y desde la de la pull request, en la misma máquina y en la misma ejecución |
| `thirdparty`, los mocks de terceros | Tus terceros reales, o mocks con su latencia y su coste de CPU si quieres un gate sin red |
| Los recorridos de `agents/journeys/` | Los recorridos que importan en tu producto, con selectores estables |
| Los escenarios del gate en `agents/src/judge/gate.ts` | Las páginas y los recorridos que tu gate tiene que proteger |
| Las condiciones (CPU 4x, `fast-4g`, cinco ejecuciones) | Las de tus usuarios: el throttling forma parte de lo que el gate puede ver |

## Qué conservas

- **Las reglas deciden, el LLM explica.** El veredicto es la estadística de la CLI y su exit code; el LLM redacta la causa a partir de datos ya medidos, con salida validada por un schema, y si contradice a las reglas, ganan las reglas.
- **No todo tiene que ser un MCP.** El orquestador ya sabe qué comando ejecutar y cuándo, y trace-engine-cli ya da una salida compacta pensada para LLMs: un MCP encima no añadiría información, solo una capa más.
- **Comparar con la versión base, no con umbrales absolutos.** Las tres regresiones del taller quedan dentro de "good".
- **Medir de una en una.** Dos Chromium a la vez se reparten la CPU y contaminan las métricas.
- **Nombres de función en el build.** Minificado del todo, el profiler nombra cada función con una letra y el Judge no la puede relacionar con el diff; trace-engine-cli no lee source maps.
- **El handoff.** Quien no puede correr un LLM local tiene la misma entrada para un agente de su elección, y cada equipo decide si su código sale de su máquina.

El contexto y los datos de estas decisiones están en [Learnings](../../learnings/) y en [Por qué este stack](../../stack/), que explica cada pieza del stack, qué se descartó y el dato que lo decidió.

## Tu plan

Copia esta tabla y rellena la última columna. Con las seis filas escritas tienes el primer borrador del gate de tu producto:

| Pregunta | En el taller | En tu plataforma |
|---|---|---|
| ¿Qué aplicación se mide, y cómo se construyen sus dos versiones? | La tienda, desde `main` y desde la rama, con `scripts/build-shop.sh` | |
| ¿Qué recorridos protege el gate? | Cargar la home y añadir un producto al carrito | |
| ¿En qué condiciones se mide? | CPU 4x y `fast-4g`, cinco ejecuciones por lado | |
| ¿Cuánto tiene que empeorar una métrica para parar una pull request? | Los umbrales de la CLI, en [Conceptos](../../concepts/#cómo-decide-el-gate) | |
| ¿Dónde corre el gate? | Docker Compose en un portátil, y GitHub Actions en las pull requests | |
| ¿Quién explica la causa? | Un LLM local, o el handoff a un agente de tu elección | |
