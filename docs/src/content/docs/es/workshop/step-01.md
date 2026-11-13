---
title: "Paso 1: la primera llamada a un MCP"
description: Grabar desde el contenedor el trace de la carga de la tienda con Chrome DevTools MCP.
sidebar:
  order: 11
---

## Objetivo

Ver cómo un agente "mira" una página: un programa abre la home de la tienda con Chrome DevTools MCP y graba el trace de su carga en un fichero, sin editor ni chat de por medio. Es lo que hará después el subagente de LCP.

## Antes de empezar

Con las imágenes descargadas y el preflight en verde, crea tu rama desde el inicio del taller y levanta el laboratorio:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
docker compose up -d
```

Todos los comandos del taller se lanzan en tu terminal, desde la raíz del repo. Con el perfil `lite`, antepón `COMPOSE_PROFILES=lite` a cada comando de `docker compose`.

En cada paso, el código que hace el trabajo empieza como un `throw` que dice el paso y sus tests. Lo ves fallar, aplicas la solución con `git` y lo ves funcionar. Escribirlo tú es opcional: lo explica la última sección de cada paso.

## Paso a paso

1. Lanza los tests del paso:

   ```bash
   docker compose run --rm agents node --test test/mcp/trace.test.ts
   ```

   Los 2 tests fallan (`fail 2`) con este mensaje:

   ```text
   Step 1 of the workshop: record the load of url with Chrome DevTools MCP. Its tests: test/mcp/trace.test.ts
   ```

   Es el punto de partida, no un error: `recordTrace`, en `agents/src/mcp/trace.ts`, todavía es un `throw`.

2. Aplica la solución del paso:

   ```bash
   git checkout step-01-solution -- agents/src
   ```

   No sale nada. No hace falta reconstruir ni reiniciar: el contenedor lee `agents/src` de tu copia del repo.

3. Vuelve a lanzar los tests:

   ```bash
   docker compose run --rm agents node --test test/mcp/trace.test.ts
   ```

   Los 2 pasan (`pass 2`). Tardan unos segundos porque graban una página local con un Chrome de verdad.

4. Graba la carga de la home de la tienda:

   ```bash
   docker compose run --rm agents node src/first-trace.ts
   ```

   Al terminar, escribe:

   ```text
   [first-trace] http://shop-baseline:3000/ -> /out/first-trace.json
   ```

   `/out` dentro del contenedor es la carpeta `out/` del repo: el trace queda en `out/first-trace.json`.

5. Abre el trace en tu Chrome: DevTools, panel Performance, botón "Load profile" y el fichero `out/first-trace.json`. Es lo mismo que recibe un agente: unos 2 MB de eventos. Por eso, más adelante, los subagentes no se lo pasan entero al LLM.

6. Pasa la comprobación del paso:

   ```bash
   docker compose run --rm agents npm run check -- step-01
   ```

   ```text
   step-01: The first call to an MCP server

     OK  tests: test/mcp/trace.test.ts
     OK  out/first-trace.json

   step-01 is done.
   ```

   Si una línea sale con `KO`, la comprobación dice qué comando falta.

## Qué hace el código que has aplicado

Para verlo:

```bash
git diff workshop-start -- agents/src/mcp/trace.ts
```

`recordTrace(url, file, emulation?)` recibe la URL de la página, el fichero donde guardar el trace y, opcionalmente, una emulación (throttling y viewport). No devuelve nada: deja el trace en `file`.

Todo pasa en ese código, dentro del contenedor: nadie abre Chrome ni la consola de DevTools. El código arranca Chrome DevTools MCP como un proceso aparte y le pide acciones por su nombre; el servidor las ejecuta en un Chrome headless. Para hablar con él usa dos funciones de `agents/src/mcp/client.ts`:

- `connect("devtools")` arranca el servidor por stdio y devuelve un cliente, que se cierra con `client.close()` también si algo falla.
- `callTool(client, name, args)` pide al servidor que ejecute la herramienta `name` con `args`, y convierte un error del servidor en una excepción con su mensaje.

Una herramienta MCP es una acción que el servidor publica con un nombre y unos argumentos; es lo que usa un agente cuando "mira" una página. Por ejemplo, abrir la página es `await callTool(client, "navigate_page", { type: "url", url })`. `recordTrace` usa tres:

| Herramienta (`name`) | Argumentos (`args`) | Para qué |
|---|---|---|
| `emulate` | el objeto `emulation` tal cual, por ejemplo `{ cpuThrottlingRate: 4, networkConditions: "Fast 4G", viewport: "412x823x1,mobile,touch" }` | Solo si le pasan una emulación |
| `navigate_page` | `{ type: "url", url }` | Abrir la página |
| `performance_start_trace` | `{ reload: true, autoStop: true, filePath }` | Recargar, grabar la carga y parar solo, con el trace en `filePath` |

## Si quieres escribirlo tú (opcional)

En lugar del punto 2, escribe el cuerpo de `recordTrace` en `agents/src/mcp/trace.ts`, entre las marcas `// workshop: step 1` y `// workshop: end`, con las herramientas de la tabla anterior. Después sigue desde el punto 3: los tests dicen si lo tienes. Si te atascas, el punto 2 sobrescribe lo que hayas escrito con la solución.

Pistas:

- Chrome DevTools MCP solo escribe ficheros dentro de la carpeta temporal de su cliente: el cliente del SDK no negocia los roots de MCP, y el servidor avisa al arrancar. Graba en una carpeta de `tmpdir()` (por ejemplo con `mkdtemp`) y copia el fichero a `file` después. La historia completa está en [Learnings](../../learnings/), en "Chrome DevTools MCP fuera del editor".
- `file` puede estar en una carpeta que todavía no existe: créala con `mkdir(..., { recursive: true })`.
- El servidor crea el trace solo para su usuario. Déjalo legible para todos (`chmod` a `0o644`), como el resto de ficheros de `out/`.
