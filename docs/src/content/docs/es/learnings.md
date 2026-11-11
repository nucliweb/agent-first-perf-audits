---
title: Learnings
description: Decisiones de diseño que tomamos al construir el taller, y por qué.
sidebar:
  order: 90
---

Decisiones que tomamos al construir este flujo. Cada una incluye el contexto, la decisión y los datos que la justifican, para que puedas aplicarla, o descartarla, en tu plataforma.

## No todo tiene que ser un MCP

### Contexto

Para atribuir una regresión a una función concreta, el Judge necesita analizar el trace de Chromium de cada ejecución. Usamos [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli), una CLI del equipo de Chrome DevTools construida sobre el Trace Engine del panel Performance. Convierte un trace en un resumen compacto en formato [TOON](https://github.com/toon-format/toon), pensado para el contexto de un LLM.

trace-engine-cli no tiene servidor MCP. Teníamos dos opciones: envolverla en un servidor MCP propio o llamarla directamente como CLI desde el orquestador.

### Decisión

La llamamos directamente como CLI.

- **No hay que resolverlo todo con MCP.** MCP aporta valor cuando el modelo tiene que descubrir herramientas y decidir cuál usar. En este flujo, el orquestador ya sabe qué comando ejecutar y cuándo.
- **Si una CLI ya es óptima, usamos la CLI.** trace-engine-cli ya produce una salida compacta, estable y pensada para LLMs. Un MCP encima no añade información, solo una capa más.
- **Probar algo nuevo no requiere sobrearquitectura.** La herramienta está en su versión 0.2.0. Llamarla como CLI nos permite probarla y sustituirla sin tocar el resto del sistema.

### Datos

Trace de 1,4 MB, grabado con Playwright y CPU throttling 4x, de una página con un banner que provoca layout shift y un handler de click que bloquea 180 ms:

| Comando | Salida | Qué encontró |
|---|---|---|
| `overview` | 566 bytes | CLS 0,148 e INP 199 ms |
| `interactions` | 191 bytes | INP: input delay 3 ms, processing 186 ms, presentation 9 ms |
| `tasks --tree bottom-up --top 5` | 428 bytes | `addToCart`, 182 ms de self time, línea 21 |
| `shifts --events` | 829 bytes | Cluster de 0,148 con un nodo culpable |

Los cuatro resúmenes suman 2.014 bytes, un 99,85 % menos que el trace original: caben sin problema en el contexto de un modelo de 1,7B.

### ¿Y los insights de Chrome DevTools MCP?

Chrome DevTools MCP ya ofrece los insights del panel Performance. Antes de sumar una herramienta más, comprobamos si bastaban. Grabamos el mismo recorrido con Chrome DevTools MCP y pasamos ese mismo trace por trace-engine-cli:

| | Chrome DevTools MCP | trace-engine-cli |
|---|---|---|
| Texto que recibe el agente | Unos 11.400 bytes: el resumen de `performance_stop_trace` y tres insights | Unos 2.000 bytes: los cuatro comandos |
| LCP, CLS e INP | Sí | Sí |
| Desglose del INP | Sí | Sí |
| Función que causa el INP | No | `addToCart`, con su URL y su línea |

Unos 4.500 bytes del resumen de `performance_stop_trace` son una explicación de sus formatos que se repite igual en cada trace. Y ningún insight nombra la función del handler: el de INP da el desglose, pero no qué código lo provoca. El Judge necesita justo esa atribución para relacionar la regresión con el diff de la rama.

Por eso cada herramienta hace una cosa: Chrome DevTools MCP captura el trace y trace-engine-cli lo resume.

### Compruébalo

El experimento está en [`experiments/trace-engine-cli`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/trace-engine-cli). Graba un trace nuevo en tu máquina y comprueba cada afirmación de esta página:

```bash
cd experiments/trace-engine-cli
npm install
npm test            # graba un trace y verifica las conclusiones
npm run record      # graba out/trace.json
npm run summarize   # muestra los resúmenes y la tabla de tamaños
npm run compare     # compara Chrome DevTools MCP y trace-engine-cli sobre el mismo trace
```

Los milisegundos cambian de una máquina a otra, así que el test comprueba umbrales y no valores exactos: cada resumen ocupa menos de 2 KB, los cuatro juntos reducen el trace más de un 99 %, el CLS es de al menos 0,1, el INP lo domina el processing y `addToCart` aparece con al menos 150 ms de self time. En la comparación, Chrome DevTools MCP da más del triple de texto y `addToCart` no aparece en ninguna de sus salidas.

### Qué no hace

- **No compara dos traces.** `diff` compara dos ventanas de tiempo dentro del mismo trace. La comparación entre baseline y candidate la hace la CLI de WebPerf Snippets.
- **No da selectores de los nodos DOM.** Los nodos culpables de CLS aparecen como `Node #9` y el target de INP como `null`. Los selectores vienen de WebPerf Snippets.
- **Devuelve tiempos absolutos.** Los rangos de entrada son relativos al inicio del trace, pero los tiempos de salida no. El orquestador los normaliza antes de pasarlos al LLM.

### Cómo aplicarlo en tu plataforma

Antes de envolver una herramienta en un servidor MCP, pregúntate:

1. ¿El modelo tiene que decidir cuándo usarla, o lo decide el código?
2. ¿Su salida ya es compacta y estable?
3. ¿Es una herramienta madura, o la estás probando?

Si lo decide el código, la salida ya sirve y la herramienta es nueva, una llamada directa a la CLI es suficiente.

## Chrome DevTools MCP fuera del editor

### Contexto

[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) está pensado para un agente en tu editor: una sesión interactiva, un navegador que varios agentes pueden compartir y un cliente que le dice al servidor en qué carpetas puede escribir.

En el taller lo usan los subagentes dentro de un contenedor sin red. Cada subagente arranca su propio servidor por stdio, con una sola página, y los traces tienen que acabar en una carpeta que después lee el Judge.

### Qué falla con los valores por defecto

- **Cada tool de página exige `pageId`.** Sirve para que varios agentes compartan un navegador sin pisarse. Sin él, `navigate_page` devuelve un error de validación.
- **Los ficheros solo se pueden escribir en el directorio temporal del servidor.** Es la restricción que se aplica cuando el cliente no declara roots, una capacidad que la versión 2026-07-28 del protocolo marca como deprecada. Un trace guardado en otra carpeta devuelve `Access denied`.
- **Ese directorio temporal puede no ser el del cliente.** El cliente stdio del SDK de MCP arranca el servidor solo con `HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM` y `USER`. En macOS, `TMPDIR` apunta a `/var/folders/...`; el servidor no lo recibe y usa `/tmp`. Una ruta que el orquestador crea con `os.tmpdir()` queda fuera. En Linux los dos usan `/tmp` y no se nota.
- **Chromium no arranca en el contenedor.** Sin privilegios extra no tiene un sandbox utilizable y aborta con `No usable sandbox!`.

### Decisión

Arrancamos el servidor con estos flags:

| Flag | Para qué |
|---|---|
| `--no-page-id-routing` | Cada subagente tiene su navegador, así que las tools funcionan sin `pageId` |
| `--workspace=<carpeta>` | Permite guardar los traces en la carpeta de salida. Se suma al directorio temporal del servidor, no lo sustituye |
| `--chromeArg=--no-sandbox` | Solo en el contenedor, que ya aísla el proceso |
| `--headless`, `--isolated` y `--executablePath` | Sin ventana, con un perfil temporal y con el Chromium de Playwright, el mismo que usa WebPerf Snippets |
| `--usageStatistics=false` y `--performanceCrux=false` | El gate corre sin red |

Descartamos `--allow-unrestricted-paths`: abre todo el sistema de ficheros y el propio servidor lo marca como deprecado en favor de `--workspace=/`.

### Compruébalo

El experimento está en [`experiments/chrome-devtools-mcp`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/chrome-devtools-mcp). Cada test arranca un servidor con unos flags distintos y comprueba uno de estos comportamientos:

```bash
cd experiments/chrome-devtools-mcp
npm install
npm test
```

En macOS se ejecutan los siete tests. En Linux se salta el del `TMPDIR`, porque el cliente y el servidor comparten el directorio temporal.

### Cómo aplicarlo en tu plataforma

1. Un MCP pensado para el editor trae valores por defecto pensados para el editor. Revisa sus flags antes de meterlo en un pipeline.
2. No des por hecho que el servidor ve tu entorno. Con stdio, pásale lo que necesite como flags o como variables explícitas.
3. Escribe un test por cada valor por defecto que cambies. Si una versión nueva lo cambia, te enteras antes que tu pipeline.

## El LLM explica, las reglas deciden

### Contexto

El Judge tiene que contar por qué falla una rama, no solo que falla. Para eso tiene un modelo local en Ollama, en CPU, que debe caber en un portátil de 16 GB junto a Chromium y el resto del laboratorio. Probamos cuatro candidatos de 1 a 3B (`llama3.2:3b`, `qwen3:1.7b`, `qwen2.5-coder:1.5b` y `gemma3:1b`) con la entrada real de cada rama de regresión: el veredicto del gate, el diff y los resúmenes de trace-engine-cli de la versión base y de la candidata.

La primera versión le pedía al modelo todo: repetir el veredicto, elegir la métrica que más empeora y explicar la causa. Cada vez que algo fallaba, pasamos una parte más del trabajo a las reglas.

### Qué probamos

| Etapa | Qué hacen las reglas antes del LLM | `llama3.2:3b` nombra la causa: primera medida | Con los fixtures actuales, en frío |
|---|---|---|---|
| `llm` | Deciden el veredicto y qué métrica explicar | 9 de 15 | 3 de 5 |
| `suspects` | Además, comparan los traces y dan al modelo los sospechosos: funciones y scripts nuevos o que crecen | 9 de 15 | 3 de 5 |
| `rules` | Además, no preguntan al modelo si nada empeora, y relacionan cada sospechoso con la línea del diff que lo añade | 14 de 15 | 5 de 5 |
| `quotes` | Además, escapan las comillas dobles del diff y de la línea relacionada | 15 de 15, en frío | 5 de 5 |

La primera medida se hizo en caliente y con tres repeticiones de cada caso, sobre los fixtures del 10 de noviembre. Los fixtures actuales tienen traces nuevos y el gate de otra ejecución, y en frío basta una repetición, porque todas dan la misma respuesta.

Por el camino:

- **El JSON se pide con el schema como salida estructurada.** Con el JSON descrito solo en el prompt, `qwen2.5-coder:1.5b` lo envolvía siempre en un bloque de código y no se podía procesar. Con el schema, los cuatro modelos devuelven JSON válido.
- **La métrica la decide la regla.** Es lo que más fallaban los modelos. Además, `pr/loaf-cart-handler` empeora dos métricas por dos causas: el LCP por un script síncrono, `ab.js`, y el INP por un handler pesado, `recommendFor`. Una sola explicación no puede cubrir las dos, así que el Judge pide una por métrica.
- **Las métricas se ordenan por cuántas veces superan su umbral, no por porcentaje.** El CLS de la versión base es 0, así que su porcentaje no existe.
- **Los modelos pequeños ignoran las pistas.** Con `recommendFor` listado como sospechoso (80 ms en la candidata, 0 en la base), `llama3.2:3b` seguía culpando a `ab.js` del INP. Y en el refactor, con la regla diciendo que nada había empeorado, se inventaba una regresión del LCP.
- **Lo que funcionó fue que la regla encontrara la causa.** `recommendFor` y `ab.js` aparecen literalmente en las líneas añadidas del diff. Cuando la regla da al modelo el sospechoso y su línea, el modelo solo tiene que redactar.

### Decisión

- **El modelo del taller es `llama3.2:3b`.** Ollama le asigna 3,3 GB con un contexto de 8.192 tokens.
- **Las reglas deciden el veredicto, la métrica y, cuando pueden, la causa.**
- **El LLM la explica con el schema del veredicto.** Cuando nada empeora, el Judge responde sin preguntarle.

El último fallo no era de razonamiento. En la rama del hero, el modelo copia `loading="lazy"` del diff a su respuesta sin escapar la comilla, y en el JSON restringido por el schema esa comilla cierra la cadena: la frase se queda en `loading=`. Las reglas no pueden darle la causa, porque quitar el preload no añade ninguna tarea al trace, así que el modelo la busca en el diff y copia el código.

Además, el fallo no salía siempre. En la etapa `rules`, solo una de las tres repeticiones se cortaba, con la misma entrada, la temperatura a 0 y la semilla fija. La diferencia era la caché del prompt de Ollama: la primera llamada llega con el modelo recién cargado, y las siguientes reutilizan el prompt de sistema de la anterior, que es el mismo. Al descargar el modelo antes de cada llamada, las tres repeticiones de cada caso salen idénticas, y la frase del hero se corta en las tres: 12 de 15.

Con las comillas del diff escapadas en la entrada (`loading=\"lazy\"`), el modelo copia una forma válida dentro de una cadena JSON, y en frío nombra la causa en 15 de 15. Escapar en la entrada no depende de que el modelo obedezca una instrucción más del prompt.

Con los fixtures actuales la frase ya no se corta sin escapar, pero tampoco es buena: dice que se añadió "el atributo `loading` a la propiedad `fetchPriority`", que ahora valdría `'lazy'` en lugar de `'high'`. La puntuación la da por buena, porque nombra `lazy`. Con las comillas escapadas, la frase nombra el atributo `loading="lazy"` del `img`.

- **El Judge escapa las comillas dobles del código que pone en el prompt.** El handoff lleva la misma entrada.
- **Las pruebas de un modelo se hacen en frío.** En caliente, la misma entrada puede dar otra redacción, y un fallo puede salir en una repetición y no en otra. En frío, la imagen `ollama` del taller da las mismas respuestas que el contenedor del benchmark.

### Compruébalo

El experimento está en [`experiments/models`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/models). Las respuestas están guardadas, las actuales en `results/` y las de la primera medida en `history/2026-11-10/` con sus fixtures, así que el test comprueba estas cifras sin necesitar Ollama:

```bash
cd experiments/models
npm install
npm test                          # reglas, puntuación y las cifras de cada etapa
STAGE=llm COLD=1 REPS=1 MODES=schema node bench.mjs   # una etapa con los cuatro modelos, en frío
STAGE=quotes COLD=1 REPS=1 MODES=schema node bench.mjs llama3.2:3b   # la etapa del Judge
```

La latencia depende mucho de la carga de la máquina. En caliente, en la etapa `quotes` y con la máquina en reposo al empezar, las 12 llamadas de `llama3.2:3b` tardaron entre 13,7 y 40,3 segundos, con una mediana de 23,2 s. En la etapa `rules` de la primera medida, en un portátil en uso normal, entre 9 y 37 segundos, con una mediana de 15,8 s. En frío, cada llamada incluye cargar el modelo y la mediana sube a 46-48 s. La carga media del host no sirve para vigilar la medida mientras corre: durante cada llamada, Ollama usa casi todos los núcleos de la VM de Docker y la carga se dispara. Hay que mirarla antes de empezar.

### Cómo aplicarlo en tu plataforma

1. Antes de preguntar a un LLM, pregúntate qué parte de la respuesta puede calcular el código. Esa parte no se la pidas.
2. Pide el JSON con el schema como salida estructurada, no solo en el prompt. Si el modelo puede copiar código con comillas a su respuesta, escápalas en la entrada.
3. Si nada ha empeorado, no hay nada que explicar. No preguntes.
4. Mide el acierto con un criterio estricto y con las respuestas guardadas. Un criterio generoso esconde lo que el modelo se inventa.
5. Mide en frío, descargando el modelo antes de cada llamada. Con la caché del prompt, la temperatura 0 y la semilla fija no bastan para repetir una respuesta.
