---
title: "Paso 6: llevarlo a tu plataforma"
description: Qué cambiar para pasar el gate y los subagentes a tu aplicación, y qué decisiones del taller conviene conservar.
sidebar:
  order: 16
---

## Objetivo

Salir del taller con un plan para tu plataforma: qué piezas se quedan tal cual, cuáles cambias y qué decisiones de diseño conviene conservar.

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
