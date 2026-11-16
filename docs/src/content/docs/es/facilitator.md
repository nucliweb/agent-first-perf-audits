---
title: Guía de quien presenta
description: Cómo impartir el taller. Qué formato escoger, qué preparar antes, qué decir en cada bloque y en cada espera, y qué hacer cuando algo se tuerce.
sidebar:
  order: 95
---

Las guías de los pasos dicen qué ejecuta cada asistente. Esta dice qué haces tú mientras tanto: qué cuentas antes de cada comando, qué preguntas durante las esperas y cuándo das un paso por bueno.

## Escoge el formato con la sala delante

[Cómo seguir el taller](../workshop/) describe tres recorridos. El taller guiado solo funciona si la sala llega con el laboratorio descargado: las imágenes pesan varios GB y la Wi-Fi de un evento no da para todos.

| Lo que tienes | Formato |
|---|---|
| Dos horas, y la mayoría con el preflight en verde | Taller guiado |
| Menos tiempo, o una sala que no ha preparado el equipo | Charla con demo |
| Una sala mixta | Taller guiado. Quien no tiene el laboratorio sigue cada regresión en [Las ramas en el navegador](../previews/), o se sienta con alguien que sí |

Decide al empezar, preguntando quién tiene el preflight en verde. Empezar por la charla es mejor que cambiar de formato a media sesión.

Si la sala pregunta mucho por las métricas, dedícales el tiempo: los [Conceptos](../concepts/) son lo que más dudas resuelve, y recortar un paso para explicarlos bien es un buen cambio.

## Una semana antes

- Envía [Preparación](../setup/) a quien se apunta y pide que la haga en casa. El preflight tiene que terminar sin ningún `KO`.
- Pide que lancen también el `git fetch` del principio del [paso 1](../workshop/step-01/#antes-de-empezar). Es el único comando de los pasos que necesita red.
- Di que traigan el cargador.

## La víspera

En el equipo con el que presentas:

- Actualiza el repo y pasa el preflight: `scripts/preflight.sh`.
- Ensaya el [paso 5](../workshop/step-05/) entero una vez, con la máquina sola. Tiene que dar tres fallos y un pass.
- Deja libres la CPU y el disco. Cierra copias de seguridad, videollamadas y otros contenedores: `docker ps` no debería listar nada que no sea el laboratorio, y `docker system df` dice cuánto ocupa Docker.
- Abre en pestañas las slides, [Las ramas en el navegador](../previews/) y las pull requests de [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1) y de [`pr/noop-refactor`](https://github.com/nucliweb/agent-first-perf-audits/pull/4). Guarda capturas del check y del comentario de cada una, por si la red de la sala falla.
- Sube el tamaño de letra de la terminal: las líneas que hay que leer en cada punto de control son largas.

El día del taller, presenta con el portátil enchufado. El INP de `pr/loaf-cart-handler` depende de lo rápido que vaya la CPU, y con ella cambian las cifras que salen en pantalla.

## Tres reglas para toda la sesión

- **Un comando, una espera, una pregunta.** Cada paso tiene una medida larga. Lanza el comando y usa la espera para las preguntas del apartado "Mientras esperas" de su guía. Es el momento en que se entiende lo que se acaba de ejecutar.
- **El punto de control es de la sala, no tuyo.** No sigas hasta que la línea `step-0N is done.` esté en la mayoría de las pantallas. Quien se queda atrás aplica la solución del paso en curso y lanza su medida. La comprobación del paso le escribe el comando que le falta.
- **Las medidas, de una en una, también en tu equipo.** Mientras una medida se proyecta, no lances nada más. Una medida con la máquina ocupada puede dar otro veredicto, y explicarlo en directo cuesta más que evitarlo.

Los tiempos de cada bloque están en [la agenda](../workshop/#taller-guiado), con el tiempo de máquina de cada paso. Lo que sobra de cada hueco es tuyo.

## Bloque a bloque

### Contexto

- **Qué cuentas.** Empieza por el problema, no por las herramientas: cuatro pull requests contra una tienda, los tests de la app pasan en las cuatro y tres de ellas empeoran lo que nota quien la usa. Enseña una en el navegador, la del hero, desde [Las ramas en el navegador](../previews/).
- **Qué dejas para después.** De los conceptos, solo el LCP y sus fases, que hacen falta en el paso 2. El INP y el CLS se explican mejor durante la espera del paso 3.

### Paso 1: la primera llamada a un MCP

- **Qué cuentas.** Un servidor MCP publica herramientas con nombre y argumentos, y quien las llama puede ser un programa. Explica aquí, una sola vez, el ritmo de todos los pasos: tests en rojo, solución con `git`, tests en verde, medida y comprobación.
- **La espera.** No hay: ningún comando llega al minuto.
- **Punto de control.** `step-01 is done.` en pantalla. Abre tu `out/first-trace.json` en el panel Performance de DevTools para que se vea que un trace es evidencia para personas.
- **Si no sale.** Cuando un laboratorio no arranca, lo más frecuente es la memoria de la máquina virtual. Que siga con el perfil `lite` o con quien tenga al lado, y no lo depures delante de todos.

### Paso 2: el subagente de LCP

- **Qué cuentas.** El LCP se lee por fases, y el subagente mide sin decidir nada: deja un JSON.
- **La espera.** La medida de las dos tiendas. Pide que abran las dos en el navegador y pregunta si notan la diferencia a simple vista. Después, por qué el subagente se queda con la mediana de tres medidas.
- **Punto de control.** Las dos líneas `[orchestrator] lcp`, con una fase más lenta distinta en cada lado: `resourceLoadTime` en el baseline y `resourceLoadDelay` en la rama.
- **Si no sale.** Si a alguien las dos líneas le dicen lo mismo, le falta `CANDIDATE=pr-lcp-hero-lazy` delante de los comandos.

### Paso 3: Navigator, CLS y LoAF/INP

- **Qué cuentas.** Un recorrido es un fichero de datos, el mismo para el Navigator, para los subagentes y para el gate.
- **La espera.** Es la más larga de los cuatro primeros pasos, y el sitio de las slides del INP y del CLS: las tres fases de una interacción, los long animation frames y qué desplazamientos cuentan. Termina con la pregunta de la guía: por qué el Navigator va antes que los otros dos.
- **Punto de control.** La línea `loaf, candidate`, con `add-to-cart` como recorrido más lento y `DIV#root.onclick` como script.
- **Si no sale.** Un INP distinto al de la guía es lo normal: depende de la máquina. Lo que tiene que coincidir es qué recorrido es el lento y qué script lo bloquea.
- **Si vas tarde.** El punto 7, el CLS con la rama del banner, es opcional. Enséñalo en tu pantalla y sigue.

### Paso 4: el Judge

- **Qué cuentas.** La idea del taller entero: las reglas deciden y el LLM explica. Con el informe en pantalla, lee en este orden: el veredicto, la causa y los hallazgos que la respaldan.
- **La espera.** La medida del gate. Las tres líneas `judge: gate`, `judge: trace` y `judge: explanation` salen en orden: pregunta en cuál se decide el veredicto, y qué saldría en el informe si el LLM dijera lo contrario que las reglas.
- **Punto de control.** `[orchestrator] judge: gate: fail`, y un `report.md` en `out/agents/judge/`.
- **Si no sale.** Con `lite` no hay explicación del modelo y el informe remite a `handoff.md`: dilo antes de que pregunten. Si un informe trae arriba el bloque "Inconclusive", se repite la medida, y es una buena ocasión para explicar por qué un gate tiene que saber decir que no lo sabe.

### Paso 5: el gate en ci

- **Qué cuentas.** Todo lo anterior cabe en un servicio y un exit code. El gate compara con `main`, no con los umbrales de Google: las tres regresiones quedan dentro de "good".
- **La espera.** Es la más larga del taller. Lanza el bucle nada más empezar el bloque y cuenta lo demás mientras corre. Cuando termine la primera rama, lee su `report.md` en pantalla. Después enseña el mismo gate en GitHub: el check y el comentario de la pull request de `pr/lcp-hero-lazy`, y la de `pr/noop-refactor`, que pasa sin que nadie le pregunte al modelo.
- **Punto de control.** Los cuatro exit codes, `1`, `1`, `1` y `0`.
- **Si no sale.** Una rama con regresión que sale con 0 quedó como no concluyente: se lanza otra vez esa rama. Si `pr-noop-refactor` sale con 1, la máquina estaba ocupada.
- **Si vas tarde.** Enseña en las pull requests las ramas que no hayan terminado, y deja que el bucle acabe mientras cierras.

### Paso 6 y cierre

- **Qué cuentas.** Qué cambia y qué se conserva al llevarlo a otra plataforma. Deja unos minutos para la tabla "Tu plan" y pide a dos personas que lean una fila de la suya.
- **Con qué cierras.** Tres ideas: las reglas deciden y el LLM explica; se compara con la versión base, no con un umbral; y un gate tiene que decir cuándo los datos no le alcanzan. Para quien quiera seguir, los [Retos](../challenges/) y los [Learnings](../learnings/).

## Si algo se tuerce

| Qué pasa | Qué haces |
|---|---|
| La red de la sala no va | Los pasos no la necesitan después del `git fetch` del paso 1. La demo de GitHub, con las capturas de la víspera |
| A alguien no le arranca el laboratorio | Perfil `lite` si es la memoria, o en pareja. [Problemas frecuentes](../troubleshooting/) para después de la sesión |
| Vas tarde | Recorta por este orden: el punto 7 del paso 3, la tabla del paso 6 y el final del bucle del paso 5. El paso 4 no se recorta |
| Tu equipo falla | Pasa a la charla con demo: slides, las ramas en el navegador y las pull requests |
| Un veredicto no es el de la guía en tu pantalla | Es material, no un accidente. Enseña el bloque "Inconclusive" del informe y explica con [Conceptos](../concepts/#por-qué-importa-cuántas-veces-se-mide) por qué el gate mide más veces antes de decidir |

## La charla con demo

El mismo hilo en menos tiempo y sin terminal:

1. El problema, con la rama del hero en el navegador.
2. Los conceptos, con las slides: las métricas, sus fases y cómo decide el gate.
3. Las otras dos regresiones en el navegador, con DevTools abierto. [Las ramas en el navegador](../previews/#cómo-ver-cada-regresión) dice qué mirar en cada una.
4. El gate en las pull requests: la que falla, con su check y su comentario, y la que pasa.
5. El cierre, con las mismas tres ideas.
