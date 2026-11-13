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

El experimento está en [`experiments/trace-engine-cli`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/trace-engine-cli/README.es.md). Graba un trace nuevo en tu máquina y comprueba cada afirmación de esta página:

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
- **Tampoco recibe `PLAYWRIGHT_BROWSERS_PATH`.** Le pasa igual a WebPerf Snippets MCP, que lanza el Chromium de Playwright: si instalas el navegador en una ruta propia, el servidor lo busca en la ruta por defecto y no lo encuentra.
- **Chromium no arranca en el contenedor.** Sin privilegios extra no tiene un sandbox utilizable y aborta con `No usable sandbox!`.

### Decisión

Arrancamos el servidor con estos flags:

| Flag | Para qué |
|---|---|
| `--no-page-id-routing` | Cada subagente tiene su navegador, así que las tools funcionan sin `pageId` |
| `--chromeArg=--no-sandbox` | Solo en el contenedor, que ya aísla el proceso |
| `--headless`, `--isolated` y `--executablePath` | Sin ventana, con un perfil temporal y con el Chromium de Playwright, el mismo que usa WebPerf Snippets |
| `--usageStatistics=false` y `--performanceCrux=false` | El gate corre sin red |

Los traces no necesitan otro flag. El subagente graba cada uno en el directorio temporal, que en el contenedor es `/tmp` para el cliente y para el servidor, y lo copia a la carpeta de salida. `--workspace=<carpeta>` permitiría guardarlo allí directamente, sumando esa carpeta al directorio temporal del servidor, y ahorraría la copia. Descartamos `--allow-unrestricted-paths`: abre todo el sistema de ficheros y el propio servidor lo marca como deprecado en favor de `--workspace=/`.

El Chromium de Playwright se instala en la ruta por defecto, `~/.cache/ms-playwright`, la única en la que lo encuentran los dos servidores.

### Compruébalo

El experimento está en [`experiments/chrome-devtools-mcp`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/chrome-devtools-mcp/README.es.md). Cada test arranca un servidor con unos flags distintos y comprueba uno de estos comportamientos; otro arranca Node con el entorno que el cliente stdio pasa al servidor y comprueba dónde busca Playwright el navegador:

```bash
cd experiments/chrome-devtools-mcp
npm install
npm test
```

En macOS se ejecutan los ocho tests. En Linux se salta el del `TMPDIR`, porque el cliente y el servidor comparten el directorio temporal.

### Cómo aplicarlo en tu plataforma

1. Un MCP pensado para el editor trae valores por defecto pensados para el editor. Revisa sus flags antes de meterlo en un pipeline.
2. No des por hecho que el servidor ve tu entorno. Con stdio, pásale lo que necesite como flags o como variables explícitas.
3. Escribe un test por cada valor por defecto que cambies. Si una versión nueva lo cambia, te enteras antes que tu pipeline.

## Un solo Chromium para los dos MCP

### Contexto

En el contenedor `agents` hay dos servidores MCP que abren un navegador: Chrome DevTools MCP, que graba los traces del subagente de LCP, y WebPerf Snippets MCP, que mide para el gate y para el resto de subagentes. Por defecto cada uno busca el suyo: Chrome DevTools MCP, el Google Chrome instalado en el sistema; WebPerf Snippets, el Chromium de Playwright.

La imagen se publica para amd64 y arm64, y es arm64 la que corre en un Mac con Apple Silicon. Cuando la diseñamos, Google no publicaba Chrome para Linux ARM64, así que la imagen de arm64 no podía tener el navegador que Chrome DevTools MCP espera.

### Decisión

Un solo navegador en la imagen: el Chromium completo de Playwright, sin el headless shell.

- **Chrome DevTools MCP lo arranca por su ruta**, con `--executablePath` y la ruta que da `chromium.executablePath()` de Playwright.
- **WebPerf Snippets lo lanza cuando está instalado** en lugar del headless shell, y anota en las condiciones de la medida qué binario ha usado.
- **Los dos miden con el mismo binario**, en amd64 y en arm64, y su versión la fija la de Playwright. Un trace de Chrome DevTools MCP y una medida de WebPerf Snippets salen del mismo navegador.

Hoy Google sí publica Chrome estable para Linux ARM64. Aun así, la decisión se mantiene: con dos navegadores, cada servidor mediría con uno distinto, y la imagen pesaría más.

### Compruébalo

El repositorio apt de Google lista sus paquetes por arquitectura, y Chrome for Testing, sus plataformas:

```bash
curl -s https://dl.google.com/linux/chrome/deb/dists/stable/main/binary-arm64/Packages | grep -A1 "^Package: google-chrome-stable"
curl -s https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json | grep -o '"platform":"linux-arm64"' | head -1
```

La instalación está en [`docker/agents/Dockerfile`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/docker/agents/Dockerfile) y los flags del servidor, en [`agents/src/mcp/client.ts`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/agents/src/mcp/client.ts).

### Cómo aplicarlo en tu plataforma

1. Si varias herramientas abren un navegador, decide cuál es y pásaselo a todas. Lo que cada una trae por defecto no tiene por qué coincidir.
2. Comprueba en las dos arquitecturas que el navegador existe antes de elegirlo: lo que tienes en tu equipo no es lo que tiene un Mac con Apple Silicon dentro de un contenedor.
3. Revisa la decisión cuando cambie el motivo, pero cámbiala solo si el nuevo motivo también se sostiene.

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

Con varias causas a la vez, el modelo nombra una. `pr/lcp-hero-lazy` quita el preload del hero, quita `fetchPriority="high"` y añade `loading="lazy"`, y la frase de `llama3.2:3b` en la etapa `quotes` solo nombra `loading="lazy"`. En el trace no aparece ninguna función nueva, así que no hay sospechoso que relacionar con el diff, y darle la causa ya escrita en el prompt tampoco bastó en las pruebas: el modelo siguió quedándose con un cambio.

- **El informe de `ci` añade los hechos de las reglas**: el elemento LCP del trace y las líneas del diff que cambian cómo carga, también las que nombran su imagen ([`lcp-loading.ts`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/agents/src/judge/lcp-loading.ts)). El LLM no los ve, así que su entrada y las cifras de esta sección no cambian.
- **Un modelo más potente recibe la misma entrada en `handoff.md`.** El modelo del taller es pequeño para que quepa en un portátil; el handoff lo dice, para quien quiera probar la misma entrada con Claude, Gemini u otro.

### La misma entrada a un modelo más grande

En la demo de GitHub Actions, Claude Sonnet 5.5 explica las regresiones de las cuatro pull requests con la misma entrada que recibe `llama3.2:3b`. Sobre esas mismas entradas, `llama3.2:3b` en frío:

| Rama y métrica | Claude Sonnet 5.5 | `llama3.2:3b` |
|---|---|---|
| `pr/lcp-hero-lazy`, LCP | Los tres cambios: `fetchPriority`, `loading="lazy"` y el preload | Solo `loading="lazy"` |
| `pr/cls-promo-banner`, CLS | El `min-height` borrado de `.promo-slot`, que reservaba el hueco del banner | El `font-display: swap` |
| `pr/loaf-cart-handler`, LCP | `ab.js` síncrono | `ab.js` síncrono |
| `pr/loaf-cart-handler`, INP | `recommendFor` en el handler del click | `recommendFor` en el handler del click |

Con el criterio del benchmark, los dos nombran la causa de las cuatro métricas. La diferencia está en cuál y en cuántas: con varios cambios en el diff, el modelo grande los relaciona todos con la regresión, y el pequeño se queda con uno, que no siempre es el principal. Además, `llama3.2:3b` copia la redacción del prompt en 2 de las 4 frases, y Claude en ninguna. El veredicto no cambia con el modelo: lo deciden las reglas. Las entradas y las respuestas están en [`experiments/models/same-input`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/models/same-input).

### Compruébalo

El experimento está en [`experiments/models`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/models/README.es.md). Las respuestas están guardadas, las actuales en `results/` y las de la primera medida en `history/2026-11-10/` con sus fixtures, así que el test comprueba estas cifras sin necesitar Ollama:

```bash
cd experiments/models
npm install
npm test                          # reglas, puntuación y las cifras de cada etapa
STAGE=llm COLD=1 REPS=1 MODES=schema node bench.mjs   # una etapa con los cuatro modelos, en frío
STAGE=quotes COLD=1 REPS=1 MODES=schema node bench.mjs llama3.2:3b   # la etapa del Judge
node same-input.mjs                # la misma entrada que Claude en la demo, a llama3.2:3b en frío
```

La latencia depende mucho de la carga de la máquina. En caliente, en la etapa `quotes` y con la máquina en reposo al empezar, las 12 llamadas de `llama3.2:3b` tardaron entre 13,7 y 40,3 segundos, con una mediana de 23,2 s. En la etapa `rules` de la primera medida, en un portátil en uso normal, entre 9 y 37 segundos, con una mediana de 15,8 s. En frío, cada llamada incluye cargar el modelo y la mediana sube a 46-48 s. La carga media del host no sirve para vigilar la medida mientras corre: durante cada llamada, Ollama usa casi todos los núcleos de la VM de Docker y la carga se dispara. Hay que mirarla antes de empezar.

### Cómo aplicarlo en tu plataforma

1. Antes de preguntar a un LLM, pregúntate qué parte de la respuesta puede calcular el código. Esa parte no se la pidas.
2. Pide el JSON con el schema como salida estructurada, no solo en el prompt. Si el modelo puede copiar código con comillas a su respuesta, escápalas en la entrada.
3. Si nada ha empeorado, no hay nada que explicar. No preguntes.
4. Mide el acierto con un criterio estricto y con las respuestas guardadas. Un criterio generoso esconde lo que el modelo se inventa.
5. Mide en frío, descargando el modelo antes de cada llamada. Con la caché del prompt, la temperatura 0 y la semilla fija no bastan para repetir una respuesta.

## Arreglar la herramienta antes que parchear el taller

### Contexto

Los subagentes de CLS y de LoAF/INP y el gate miden con WebPerf Snippets, por MCP y por CLI. Al construirlos encontramos tres huecos en la herramienta:

- **El MCP no aplicaba throttling ni medía interacciones en una llamada.** La CLI ya tenía `--cpu`, `--network` y `--interact-script`, pero las tools del MCP no. Medir un click con varias ejecuciones y contra un baseline exigía abrir una página, interactuar y calcular la mediana a mano.
- **La ejecución mediana de una interacción se elegía por el tiempo de navegación.** Una medida de interacciones no tiene LCP, FCP ni TTFB, así que el INP de la respuesta era el de la ejecución con la navegación mediana, no el INP mediano.
- **Scroll-Performance contaba los listeners de Playwright.** Al hacer click, Playwright añade listeners de `touchstart`, `touchend` y `touchcancel` a `window`, y el snippet los contaba como listeners no pasivos de la página.

Cada hueco tenía un parche fácil en el código del taller: un bucle de `open_page` e `interact` con su propia mediana, recalcular la ejecución mediana o filtrar los listeners de Playwright en el subagente.

### Decisión

Lo arreglamos en la herramienta, en tres pull requests de WebPerf Snippets que salieron en la 1.14.0:

| PR | Cambio |
|---|---|
| [#404](https://github.com/nucliweb/webperf-snippets/pull/404) | `cpu` y `network` en las tools que miden una carga, e `interactions` con `runs` y `baseline` en `run_snippet` y `run_workflow` |
| [#405](https://github.com/nucliweb/webperf-snippets/pull/405) | Sin LCP, FCP ni TTFB, la ejecución mediana se elige por INP |
| [#406](https://github.com/nucliweb/webperf-snippets/pull/406) | Scroll-Performance deja fuera los listeners que añade Playwright |

- **El taller se queda pequeño.** Cada subagente es una llamada a una tool con sus argumentos, y eso es lo que escribe quien asiste en el paso 3.
- **El arreglo tiene su test donde está el fallo.** Cada PR añade un test que falla sin el cambio y pasa con él. Si una versión futura lo rompe, falla el test de la herramienta, no el taller.
- **Lo aprovecha cualquiera que use la herramienta**, no solo este taller. Un parche en el taller habría dejado la herramienta igual para todos los demás.
- **La versión queda fijada** en las imágenes, con la tabla de versiones del plan como referencia.

### Compruébalo

Cada pull request describe el fallo, el cambio y los tests que lo comprueban, en el repositorio de [WebPerf Snippets](https://github.com/nucliweb/webperf-snippets). En el taller, las tools se llaman con estos argumentos en `agents/src/subagents/cls.ts` y `loaf.ts`, y la guía del paso 3 los explica.

### Cómo aplicarlo en tu plataforma

1. Antes de escribir un parche en tu código, pregúntate si lo necesitaría cualquiera que use la herramienta. Si es así, su sitio es la herramienta.
2. Lleva el arreglo con un test que falle sin él, en el repositorio de la herramienta.
3. Fija la versión que lo incluye, y no la cambies sin volver a pasar tus tests.
4. Si no puedes cambiar la herramienta, deja el parche aislado y con un enlace al issue, para quitarlo cuando llegue el arreglo.

## Si quieres que un agente atribuya, conserva los nombres

### Contexto

El Judge atribuye una regresión de INP o de LCP a una función. Compara los resúmenes `tasks` de trace-engine-cli de la versión base y de la rama, se queda con las funciones nuevas o que crecen, y busca su nombre en las líneas que añade el diff. Si lo encuentra, la causa la da la regla y el LLM solo tiene que redactarla.

El build de producción de la tienda está minificado, y la minificación por defecto de Rolldown renombra las funciones. trace-engine-cli no lee source maps: el nombre que da es el del bundle.

### Qué probamos

Construimos `main` y `pr/loaf-cart-handler` con y sin `keepNames`, grabamos el trace del click en "Add to cart" de cada lado y aplicamos las mismas reglas del Judge:

| Build | Sospechoso del INP | Self time | Línea del diff relacionada |
|---|---|---|---|
| Con `keepNames` | `recommendFor` | 78 ms | `setRecommended(recommendFor(product.slug));` |
| Sin `keepNames` | `Ae` | 80 ms | Ninguna |

Sin `keepNames`, las reglas siguen viendo que una función nueva tarda unos 80 ms en el click. Lo que se pierde es el nombre: `Ae` no está en el diff, así que nada la relaciona con el cambio que la añade, y el LLM tendría que adivinar la causa.

### Decisión

- **El build de la tienda conserva los nombres de función**, con `keepNames: true` en la salida de Rolldown (`apps/shop/vite.config.ts`). El bundle sigue minificado.
- **Un test lo comprueba**: `apps/shop/build.test.mjs` construye la tienda y busca en el bundle los nombres de varias funciones.
- **Descartamos los source maps.** trace-engine-cli no los lee, y resolverlos sería un paso más entre el trace y el Judge.

### Compruébalo

El experimento está en [`experiments/discarded`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/discarded/README.es.md). Construye las dos versiones de cada lado, graba los traces y aplica `suspectsFor` y `matchSuspects`, las reglas del Judge:

```bash
cd experiments/discarded
npm install
npm test            # comprueba el sospechoso y la línea relacionada con y sin keepNames
npm run measure     # imprime los sospechosos y las líneas del diff que relacionan
```

Los milisegundos cambian de una máquina a otra; el test comprueba que con `keepNames` el sospechoso es `recommendFor` y se relaciona con la línea que lo llama, y que sin `keepNames` no. El test del build está en [`apps/shop/build.test.mjs`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/apps/shop/build.test.mjs).

### Cómo aplicarlo en tu plataforma

1. Si un agente tiene que relacionar un perfil con un diff, el perfil tiene que usar los nombres del diff. Mide el build que el agente puede leer.
2. Conserva los nombres en ese build: `keepNames` en Rolldown y esbuild, `keep_fnames` en Terser.
3. Si no puedes conservarlos, resuelve los source maps antes de pasarle el trace al agente, no después.
4. Comprueba en un test que el bundle conserva los nombres. Una actualización del bundler puede cambiar el valor por defecto sin avisar.
