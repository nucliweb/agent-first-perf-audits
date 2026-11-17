---
title: Cómo seguir el taller
description: Tres formas de recorrer el mismo material, según el tiempo que tengas y si vas a levantar el laboratorio. Una charla con demo, el taller guiado o por tu cuenta.
sidebar:
  order: 1
---

El taller construye un gate de rendimiento para pull requests: unos agentes miden una tienda antes y después de un cambio, unas reglas deciden si ha empeorado y un LLM explica la causa. El material es uno solo y se puede recorrer de tres formas.

## Tres recorridos

| Recorrido | Duración | Qué necesitas | Qué incluye |
|---|---|---|---|
| [Charla con demo](#charla-con-demo) | 45 a 60 min | Un navegador | Los conceptos, las cuatro ramas en el navegador y el gate en una pull request de GitHub |
| [Taller guiado](#taller-guiado) | 2 h | El laboratorio, descargado en casa | Los seis pasos, con alguien que marca el ritmo |
| [Por tu cuenta](#por-tu-cuenta) | 2 a 3 h | El laboratorio | Los mismos seis pasos a tu ritmo, y los retos |

Los tres cuentan lo mismo: el CI clásico no ve las regresiones de rendimiento, las reglas deciden y el LLM explica. Cambia cuánto ejecutas tú.

Con 8 GB de RAM, los dos recorridos con laboratorio se siguen con el perfil `lite`, sin modelo local: lo explica [Preparación](../setup/#con-8-gb-el-perfil-lite).

## Charla con demo

Para una audiencia que no va a abrir la terminal, o para decidir si te interesa el taller entero. No hace falta Docker.

1. **Los conceptos.** Qué miden LCP, CLS e INP, sus fases y cómo decide el gate, en [Conceptos](../concepts/) o en [las slides](/slides/).
2. **Las cuatro ramas en el navegador.** La tienda de `main` y la de cada rama están desplegadas, y [Las ramas en el navegador](../previews/) dice qué mirar en DevTools en cada una.
3. **El gate en una pull request.** Cada rama `pr/*` del repo tiene su pull request, con el check del gate y el informe en un comentario. Empieza por la de [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1), que falla, y compárala con la de [`pr/noop-refactor`](https://github.com/nucliweb/agent-first-perf-audits/pull/4), que pasa.

En GitHub Actions la explicación la redacta Claude Sonnet 5.5 en lugar del modelo local, y el veredicto sale de las mismas reglas. [Learnings](../learnings/#la-misma-entrada-a-un-modelo-más-grande) compara las dos explicaciones con la misma entrada.

## Taller guiado

Dos horas con alguien que presenta, que tiene su propia [guía](../facilitator/). Los asistentes llegan con el laboratorio descargado y el preflight en verde: [Preparación](../setup/) se hace en casa, porque las imágenes pesan varios GB.

La agenda, con el tiempo de máquina de cada paso. Lo que queda de cada hueco es para explicar, mirar los resultados y esperar a quien va más despacio:

| Inicio | Bloque | En la agenda | Máquina, `llm` | Máquina, `lite` |
|---|---|---|---|---|
| 0:00 | Contexto: por qué el CI clásico no ve estas regresiones | 10 min | | |
| 0:10 | [1. La primera llamada a un MCP](step-01/) | 15 min | 0,8 min | 0,8 min |
| 0:25 | [2. El subagente de LCP](step-02/) | 20 min | 2,9 min | 2,9 min |
| 0:45 | [3. Navigator, CLS y LoAF/INP](step-03/) | 20 min | 6,9 min | 6,9 min |
| 1:05 | [4. El Judge](step-04/) | 20 min | 4,6 min | 4,0 min |
| 1:25 | [5. El gate en `ci` contra las cuatro ramas](step-05/) | 20 min | 11,3 min | 9,5 min |
| 1:45 | [6. Llevarlo a tu plataforma](step-06/), learnings y preguntas | 15 min | | |
| | Total | 120 min | 26,5 min | 24,0 min |

Los tiempos de máquina son los del Mac de referencia, medidos con el [ensayo cronometrado](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.es.md), que ejecuta los comandos de las guías en un clon limpio. En otro equipo cambian.

## Por tu cuenta

Los mismos seis pasos, sin nadie que marque el ritmo. Cada guía está escrita para seguirse sola:

- **Qué vas a aprender** y **La idea en un minuto** ponen el concepto antes de los comandos.
- **Paso a paso** da cada comando con la salida que tiene que dar.
- **Mientras esperas** dice qué mirar durante las medidas largas.
- **Punto de control** y **Si algo falla** dicen cuándo dar el paso por bueno y qué hacer cuando no sale.

El orden:

1. [Preparación](../setup/): comprueba tu equipo y descarga el laboratorio.
2. [Conceptos](../concepts/): las métricas y cómo decide el gate. Si un término no te suena, está en el [Glosario](../glossary/).
3. Los pasos, del [1](step-01/) al [6](step-06/). No hace falta programar: cada paso aplica su solución con `git`, y escribir el código tú es opcional.
4. Los [Retos](../challenges/), cuando el gate ya te funciona: arreglar una regresión y verlo pasar, crear la tuya y cambiar las condiciones de la medida.

Se puede partir en varios días. `docker compose down` para el laboratorio y `docker compose up -d` lo levanta otra vez; lo que has hecho sigue en tu rama `taller` y en la carpeta `out/`.
