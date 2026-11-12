---
title: "Paso 1: la primera llamada a un MCP"
description: Grabar desde el contenedor el trace de la carga de la tienda con Chrome DevTools MCP.
sidebar:
  order: 11
---

## Objetivo

Hablar con un servidor MCP desde código, sin editor ni chat de por medio: abrir la home de la tienda con Chrome DevTools MCP y grabar el trace de su carga en un fichero. Es lo que hará después el subagente de LCP, y lo que hace cualquier agente cuando "mira" una página.

## Antes de empezar

Con las imágenes descargadas y el preflight en verde, crea tu rama desde el inicio del taller y levanta el laboratorio:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
docker compose up -d
```

Con el perfil `lite`, antepón `COMPOSE_PROFILES=lite` a cada comando de `docker compose`.

## Qué vas a escribir

El cuerpo de `recordTrace(url, file, emulation?)` en `agents/src/mcp/trace.ts`, entre las marcas `// workshop: step 1` y `// workshop: end`. Hoy es un `throw` que dice el paso y sus tests.

Recibe la URL de la página, el fichero donde guardar el trace y, opcionalmente, una emulación (throttling y viewport). No devuelve nada: deja el trace en `file`.

## Las herramientas

- `connect("devtools")` de `agents/src/mcp/client.ts` arranca Chrome DevTools MCP por stdio y devuelve un cliente. Ciérralo siempre con `close()`, también si algo falla.
- `callTool(client, name, args)` llama a una herramienta y convierte un error del servidor en una excepción con su mensaje.

Las tres herramientas de Chrome DevTools MCP que necesitas:

| Herramienta | Argumentos | Para qué |
|---|---|---|
| `emulate` | el objeto `emulation` tal cual, por ejemplo `{ cpuThrottlingRate: 4, networkConditions: "Fast 4G", viewport: "412x823x1,mobile,touch" }` | Solo si te pasan una emulación |
| `navigate_page` | `{ type: "url", url }` | Abrir la página |
| `performance_start_trace` | `{ reload: true, autoStop: true, filePath }` | Recargar, grabar la carga y parar solo, con el trace en `filePath` |

## Pistas

- Chrome DevTools MCP solo escribe ficheros dentro de la carpeta temporal de su cliente: el cliente del SDK no negocia los roots de MCP, y el servidor avisa al arrancar. Graba en una carpeta de `tmpdir()` (por ejemplo con `mkdtemp`) y copia el fichero a `file` después. La historia completa está en [Learnings](../../learnings/), en "Chrome DevTools MCP fuera del editor".
- `file` puede estar en una carpeta que todavía no existe: créala con `mkdir(..., { recursive: true })`.
- El servidor crea el trace solo para su usuario. Déjalo legible para todos (`chmod` a `0o644`), como el resto de ficheros de `out/`.

## Compruébalo

Los tests graban una página local con el servidor real, así que corren dentro del contenedor:

```bash
docker compose run --rm agents node --test test/mcp/trace.test.ts
```

Cuando pasen, graba la home de la tienda del baseline:

```bash
docker compose run --rm agents node src/first-trace.ts
```

El trace queda en `out/first-trace.json`. Ábrelo en el panel Performance de Chrome DevTools: es lo mismo que recibe un agente, unos 2 MB de eventos. Por eso, más adelante, los subagentes no se lo pasan entero al LLM.

Y la comprobación del paso:

```bash
docker compose run --rm agents npm run check -- step-01
```

## Si te descuelgas

```bash
git checkout step-01-solution -- agents/src
```
