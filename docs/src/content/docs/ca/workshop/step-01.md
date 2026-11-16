---
title: "Pas 1: la primera crida a un MCP"
description: Enregistrar des del contenidor el trace de la càrrega de la botiga amb Chrome DevTools MCP.
sidebar:
  order: 11
---

## Què aprendràs

- Què és una eina MCP i com la crida un programa, sense editor ni xat pel mig.
- Com enregistrar el trace de la càrrega d'una pàgina des d'un contenidor, amb Chrome DevTools MCP.
- El ritme de cada pas del taller: tests en vermell, solució amb `git`, tests en verd, mesura i comprovació.

## Temps

Aquest pas té 15 minuts a l'agenda. El temps de màquina està mesurat al Mac de referència, amb l'[assaig cronometrat](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.ca.md):

| | `llm` | `lite` |
|---|---|---|
| Temps de màquina del pas | 0,8 min | 0,8 min |

Cap ordre d'aquest pas arriba al minut.

## La idea en un minut

Un servidor MCP publica eines: accions amb un nom i uns arguments. Qui les crida és un client. En un editor, el client és l'agent del xat; aquí és un programa, i això és tot el que cal perquè "miri" una pàgina: obrir-la, enregistrar-ne la càrrega i deixar el resultat en un fitxer. És el que farà després el subagent d'LCP.

<img src="/diagrams/lab.svg" alt="Els serveis del laboratori: agents i ci mesuren shop-baseline i shop-candidate, que carreguen els scripts de thirdparty; agents demana l'explicació a ollama i escriu els informes a out/" width="960" height="420" loading="lazy" decoding="async">

Tot corre al laboratori de Docker Compose. El programa viu al servei `agents`, que arrenca Chrome DevTools MCP com un procés a part i, a través d'ell, un Chrome headless. Les pàgines que mira són les dues botigues: `shop-baseline`, construïda des de `main`, i `shop-candidate`, construïda des de la branca que es compara. En aquest pas només s'usa la primera.

## Abans de començar

Amb les imatges descarregades i el preflight en verd, crea la teva branca des de l'inici del taller i aixeca el laboratori:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
docker compose up -d
```

Totes les ordres del taller es llancen al teu terminal, des de l'arrel del repo. Amb el perfil `lite`, posa `COMPOSE_PROFILES=lite` davant de cada ordre de `docker compose`.

A cada pas, el codi que fa la feina comença com un `throw` que diu el pas i els seus tests. El veus fallar, n'apliques la solució amb `git` i el veus funcionar. Escriure'l tu és opcional: ho explica l'última secció de cada pas.

## Pas a pas

1. Llança els tests del pas:

   ```bash
   docker compose run --rm agents node --test test/mcp/trace.test.ts
   ```

   Els 2 tests fallen (`fail 2`) amb aquest missatge:

   ```text
   Step 1 of the workshop: record the load of url with Chrome DevTools MCP. Its tests: test/mcp/trace.test.ts
   ```

   És el punt de partida, no un error: `recordTrace`, a `agents/src/mcp/trace.ts`, encara és un `throw`.

2. Aplica la solució del pas:

   ```bash
   git checkout step-01-solution -- agents/src
   ```

   No surt res. No cal reconstruir ni reiniciar: el contenidor llegeix `agents/src` de la teva còpia del repo.

3. Torna a llançar els tests:

   ```bash
   docker compose run --rm agents node --test test/mcp/trace.test.ts
   ```

   Tots 2 passen (`pass 2`). Triguen uns segons perquè enregistren una pàgina local amb un Chrome de veritat.

4. Enregistra la càrrega de la home de la botiga:

   ```bash
   docker compose run --rm agents node src/first-trace.ts
   ```

   En acabar, escriu:

   ```text
   [first-trace] http://shop-baseline:3000/ -> /out/first-trace.json
   ```

   `/out` dins del contenidor és la carpeta `out/` del repo: el trace queda a `out/first-trace.json`.

5. Obre el trace al teu Chrome: DevTools, panell Performance, botó "Load profile" i el fitxer `out/first-trace.json`. És el mateix que rep un agent: uns 2 MB d'esdeveniments. Per això, més endavant, els subagents no el passen sencer a l'LLM.

6. Passa la comprovació del pas:

   ```bash
   docker compose run --rm agents npm run check -- step-01
   ```

   ```text
   step-01: The first call to an MCP server

     OK  tests: test/mcp/trace.test.ts
     OK  out/first-trace.json

   step-01 is done.
   ```

   Si una línia surt amb `KO`, la comprovació diu quina ordre falta.

## Punt de control

En pantalla, `step-01 is done.`, i a la carpeta `out/` un `first-trace.json` que s'obre al panell Performance de DevTools.

## Si alguna cosa falla

| Què veus | Per què | Què fer |
|---|---|---|
| `fatal: a branch named 'taller' already exists` | Ja vas crear la branca en una altra sessió | `git switch taller` |
| Els tests del punt 1 passen en lloc de fallar | `agents/src` ja té la solució, d'una sessió anterior | Continua des del punt 4. Per començar de zero, `git checkout workshop-start -- agents/src` |
| `KO  out/first-trace.json: missing` a la comprovació | Falta el punt 4 | La comprovació escriu l'ordre sota "To make the files of out/, run:" |
| Amb 8 GB, Compose descarrega i arrenca `ollama` | Falta `COMPOSE_PROFILES=lite` davant de l'ordre | `export COMPOSE_PROFILES=lite` en aquest terminal, i val per a totes les ordres |

Si el laboratori no arrenca, els errors del runtime són a [Preparació](../../setup/#els-errors-més-freqüents).

## Què t'emportes

- Una eina MCP és una acció amb nom i arguments. Un agent "mira" una pàgina cridant-les, i un programa pot fer el mateix.
- El trace d'una càrrega pesa uns 2 MB: és evidència per a persones i per a eines, no un prompt.
- El ritme de cada pas: vermell, solució, verd, mesura i comprovació.

Per pensar: del que avui mires a mà a DevTools, què podria demanar un programa pel seu nom?

## Què fa el codi que has aplicat

Per veure'l:

```bash
git diff workshop-start -- agents/src/mcp/trace.ts
```

`recordTrace(url, file, emulation?)` rep l'URL de la pàgina, el fitxer on desar el trace i, opcionalment, una emulació (throttling i viewport). No retorna res: deixa el trace a `file`.

Tot passa en aquest codi, dins del contenidor: ningú obre Chrome ni la consola de DevTools. El codi arrenca Chrome DevTools MCP com un procés a part i li demana accions pel seu nom; el servidor les executa en un Chrome headless. Per parlar-hi fa servir dues funcions d'`agents/src/mcp/client.ts`:

- `connect("devtools")` arrenca el servidor per stdio i retorna un client, que es tanca amb `client.close()` també si alguna cosa falla.
- `callTool(client, name, args)` demana al servidor que executi l'eina `name` amb `args`, i converteix un error del servidor en una excepció amb el seu missatge.

Per exemple, obrir la pàgina és `await callTool(client, "navigate_page", { type: "url", url })`. `recordTrace` fa servir tres eines:

| Eina (`name`) | Arguments (`args`) | Per a què |
|---|---|---|
| `emulate` | l'objecte `emulation` tal qual, per exemple `{ cpuThrottlingRate: 4, networkConditions: "Fast 4G", viewport: "412x823x1,mobile,touch" }` | Només si li passen una emulació |
| `navigate_page` | `{ type: "url", url }` | Obrir la pàgina |
| `performance_start_trace` | `{ reload: true, autoStop: true, filePath }` | Recarregar, enregistrar la càrrega i aturar-se sol, amb el trace a `filePath` |

## Si el vols escriure tu (opcional)

En lloc del punt 2, escriu el cos de `recordTrace` a `agents/src/mcp/trace.ts`, entre les marques `// workshop: step 1` i `// workshop: end`, amb les eines de la taula anterior. Després continua des del punt 3: els tests diuen si ho tens. Si t'encalles, el punt 2 sobreescriu el que hagis escrit amb la solució.

Pistes:

- Chrome DevTools MCP només escriu fitxers dins de la carpeta temporal del seu client: el client de l'SDK no negocia els roots de MCP, i el servidor n'avisa en arrencar. Enregistra en una carpeta de `tmpdir()` (per exemple amb `mkdtemp`) i després copia el fitxer a `file`. La història completa és a [Learnings](../../learnings/), a "Chrome DevTools MCP fora de l'editor".
- `file` pot ser en una carpeta que encara no existeix: crea-la amb `mkdir(..., { recursive: true })`.
- El servidor crea el trace només per al seu usuari. Deixa'l llegible per a tothom (`chmod` a `0o644`), com la resta de fitxers d'`out/`.
