---
title: "Pas 1: la primera crida a un MCP"
description: Enregistrar des del contenidor el trace de la càrrega de la botiga amb Chrome DevTools MCP.
sidebar:
  order: 11
---

## Objectiu

Parlar amb un servidor MCP des de codi, sense editor ni xat pel mig: obrir la home de la botiga amb Chrome DevTools MCP i enregistrar el trace de la seva càrrega en un fitxer. És el que farà després el subagent d'LCP, i el que fa qualsevol agent quan "mira" una pàgina.

## Abans de començar

Amb les imatges descarregades i el preflight en verd, crea la teva branca des de l'inici del taller i aixeca el laboratori:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
docker compose up -d
```

Amb el perfil `lite`, afegeix `COMPOSE_PROFILES=lite` davant de cada ordre de `docker compose`.

## Què escriuràs

El cos de `recordTrace(url, file, emulation?)` a `agents/src/mcp/trace.ts`, entre les marques `// workshop: step 1` i `// workshop: end`. D'entrada és un `throw` que indica el pas i els seus tests.

Rep la URL de la pàgina, el fitxer on desar el trace i, opcionalment, una emulació (throttling i viewport). No retorna res: deixa el trace a `file`.

## Les eines

- `connect("devtools")` d'`agents/src/mcp/client.ts` arrenca Chrome DevTools MCP per stdio i retorna un client. Tanca'l sempre amb `close()`, també si alguna cosa falla.
- `callTool(client, name, args)` crida una eina i converteix un error del servidor en una excepció amb el seu missatge.

Les tres eines de Chrome DevTools MCP que necessites:

| Eina | Arguments | Per a què |
|---|---|---|
| `emulate` | l'objecte `emulation` tal qual, per exemple `{ cpuThrottlingRate: 4, networkConditions: "Fast 4G", viewport: "412x823x1,mobile,touch" }` | Només si et passen una emulació |
| `navigate_page` | `{ type: "url", url }` | Obrir la pàgina |
| `performance_start_trace` | `{ reload: true, autoStop: true, filePath }` | Recarregar, enregistrar la càrrega i aturar-se sol, amb el trace a `filePath` |

## Pistes

- Chrome DevTools MCP només escriu fitxers dins de la carpeta temporal del seu client: el client de l'SDK no negocia els roots de MCP, i el servidor n'avisa en arrencar. Enregistra en una carpeta de `tmpdir()` (per exemple amb `mkdtemp`) i després copia el fitxer a `file`. La història completa és a [Learnings](../../learnings/), a "Chrome DevTools MCP fora de l'editor".
- `file` pot ser en una carpeta que encara no existeix: crea-la amb `mkdir(..., { recursive: true })`.
- El servidor crea el trace només per al seu usuari. Deixa'l llegible per a tothom (`chmod` a `0o644`), com la resta de fitxers d'`out/`.

## Comprova-ho

Els tests enregistren una pàgina local amb el servidor real, així que s'executen dins del contenidor:

```bash
docker compose run --rm agents node --test test/mcp/trace.test.ts
```

Quan passin, enregistra la home de la botiga del baseline:

```bash
docker compose run --rm agents node src/first-trace.ts
```

El trace queda a `out/first-trace.json`. Obre'l al panell Performance de Chrome DevTools: és el mateix que rep un agent, uns 2 MB d'esdeveniments. Per això, més endavant, els subagents no el passen sencer a l'LLM.

I la comprovació del pas:

```bash
docker compose run --rm agents npm run check -- step-01
```

## Si et quedes enrere

```bash
git checkout step-01-solution -- agents/src
```
