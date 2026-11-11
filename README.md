# agent-first-perf-audits

Repositorio del taller **Multi-Agent Performance Audits: Automatizando Core Web Vitals en tu plataforma interna con MCP**, de PerfReviews.

Construimos un gate de rendimiento para pull requests con agentes: miden una tienda de ejemplo antes y después de un cambio, deciden si ha empeorado y explican por qué. Todo corre en tu portátil con Docker Compose, sin salida a internet.

La idea que recorre el taller: **las reglas deciden, el LLM explica**. El veredicto lo da la estadística de la CLI de WebPerf Snippets (Mann-Whitney U, umbrales y exit code). Un modelo local solo redacta la causa a partir de datos ya medidos, con una salida JSON validada por un schema. Si contradice a las reglas, ganan las reglas.

## Cómo funciona

```
shop-baseline ─┐                         ┌─ veredicto: CLI de WebPerf Snippets (exit code)
               ├─ agents / ci ── Chromium ┤─ atribución: trace-engine-cli (función, URL, línea)
shop-candidate ┘        │                 └─ explicación: llama3.2:3b en Ollama, o handoff
                    thirdparty
```

| Servicio | Qué hace |
|---|---|
| `shop-baseline` y `shop-candidate` | La tienda Perf Coffee construida desde dos refs git: `main` y la rama que se compara |
| `thirdparty` | Mocks locales de scripts de terceros (analytics, chat, banner de promo, A/B testing) |
| `agents` | Node 22, el Chromium de Playwright, Chrome DevTools MCP, WebPerf Snippets y trace-engine-cli |
| `ci` | El gate de una PR: mide, atribuye, explica, escribe los informes y sale con 0 o 1 |
| `ollama` | El LLM local del Judge, con `llama3.2:3b` dentro de la imagen |

La comparación ocurre en la misma máquina y en la misma ejecución, así que la diferencia entre portátiles no afecta al veredicto.

## Requisitos

- 16 GB de RAM. Con 8 GB, el perfil `lite`, sin LLM local.
- Un runtime de contenedores con el comando `docker compose`, Compose v2.20.2 o superior (`docker compose version`), y **al menos 8 GB asignados a la VM**. En Docker Desktop el valor por defecto suele ser menor.
  - Docker Desktop y OrbStack: tal cual.
  - Colima: arráncala con memoria suficiente, por ejemplo `colima start --memory 8 --cpu 4`.
  - Podman: usa su modo compatible con Docker y el comando `docker compose`, no `podman-compose`, que no cubre todo lo que usa el laboratorio.

  Solo se ha probado Docker Desktop en macOS; el resto de runtimes se probará antes del taller.
- 15 GB libres de disco.
- macOS, Linux o Windows con WSL2, y git.

Descarga las imágenes en casa: son varios GB y la Wi-Fi de un evento no da para todos.

## Puesta en marcha

En casa, con buena conexión:

```bash
git clone https://github.com/nucliweb/agent-first-perf-audits.git
cd agent-first-perf-audits
scripts/preflight.sh                                  # con 8 GB: COMPOSE_PROFILES=lite scripts/preflight.sh
```

El preflight comprueba el runtime, la versión de Compose, la arquitectura, la memoria de la VM, las ramas de regresión y el disco libre. Después descarga todas las imágenes y pasa un smoke test dentro de Compose: Chromium arranca, se graba un trace, las dos tiendas responden, el laboratorio no tiene salida a internet y, con el perfil `llm`, el modelo responde. Imprime OK o KO en cada paso, con lo que hay que cambiar en tu runtime cuando algo falla, y sale con 0 si el equipo está listo.

En Windows, desde PowerShell (Windows no ejecuta scripts sin `-ExecutionPolicy Bypass`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
$env:COMPOSE_PROFILES = 'lite'; powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1   # con 8 GB
```

Desde WSL2 sirve `scripts/preflight.sh`. El `.ps1` hace lo mismo que el `.sh`, pero todavía no se ha probado en Windows.

Las descargas del preflight, por si prefieres hacerlas a mano:

```bash
docker compose --profile llm --profile run pull       # Ollama, los mocks, agents y la tienda de main
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose pull shop-candidate # la tienda de cada rama
done
```

`agents` y `ci` comparten imagen y están en el perfil `run`, que no se descarga sin pedirlo: `docker compose up` arranca el laboratorio, no un Chromium que se repartiría la CPU con la medida.

Para pasar el gate a una rama:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d       # las dos tiendas, los mocks y Ollama
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm ci
```

`ci` compara la tienda de `CANDIDATE` con la de `BASELINE` (por defecto, `main`) y escribe en `out/`:

| Fichero | Contenido |
|---|---|
| `report.md`, `report.html` y `report.json` | El veredicto de las reglas, las métricas de cada escenario y la explicación de cada métrica que empeora |
| `handoff.md` y `handoff.json` | La misma entrada que recibe el LLM local, con el prompt y el schema, para pasarla a otro agente |
| `gate/` y `traces/` | Los informes de la CLI y los traces de Chromium |

El exit code de `ci` es el veredicto: 0 si pasa, 1 si alguna métrica empeora y 2 si el gate no ha podido ejecutarse.

El preflight crea `out/`. Si no lo has pasado, en Linux créala antes de la primera ejecución (`mkdir out`): si no existe, Docker la crea como root y el contenedor no puede escribir en ella.

### Los subagentes

El orquestador pasa cada subagente por la tienda de `BASELINE` y por la de `CANDIDATE`, una medida detrás de otra para que dos Chromium no se repartan la CPU, y escribe lo que encuentra en `out/agents/`, un JSON por subagente y lado:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts
CANDIDATE=pr-cls-promo-banner docker compose run --rm agents node src/orchestrator.ts cls   # uno, con lo que necesita
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
```

Sin nombres pasa todos los subagentes y después el Judge; con nombres, solo esos y los que necesitan, como el Navigator para el de CLS, y el Judge si se nombra.

El Navigator va primero: recorre en las dos tiendas los cuatro recorridos de `agents/journeys/` (home, listado, ficha y añadir al carrito), paso a paso y con el throttling del gate, y anota la URL en la que deja la página cada paso y los errores de la página. Si el elemento de un paso no aparece, el orquestador se para con el recorrido, el lado y el paso: medir un recorrido que no termina da cifras que no significan nada. Cada recorrido es un JSON con su página y sus pasos (`click`, `type`, `hover`, `scroll` y `wait`), el mismo formato que `--interact-script` de la CLI, y el gate mide añadir al carrito con el mismo fichero.

El subagente de LCP mide la home con el throttling del gate (CPU 4x y fast-4g) y la mediana de 3 ejecuciones. Con WebPerf Snippets MCP obtiene el LCP, su elemento, el desglose en sus cuatro fases (TTFB, retraso y tiempo de carga del recurso y retraso de render) y, cuando el LCP es una imagen, cómo carga: `loading`, `fetchpriority`, si tiene preload y los avisos de la auditoría. Con Chrome DevTools MCP graba un trace de la carga en `out/agents/traces/`. Mide, no decide: el veredicto es del gate.

El subagente de CLS mide cada recorrido del Navigator, desde la carga de su página hasta el último paso, con los pasos que el Navigator ha comprobado, el throttling del gate y la mediana de 3 ejecuciones. Con el snippet `Layout-Shift-Loading-and-Interaction` de WebPerf Snippets MCP obtiene el CLS, cuántos desplazamientos cuentan y cuántos no (los que siguen a una interacción) y los selectores de los nodos que se mueven, del que más al que menos. En `pr/cls-promo-banner`, el CLS pasa de 0 a 0,053 en la home y a 0,0547 en los otros tres recorridos, y el primer nodo es siempre `main.main`: el banner empuja la página hacia abajo.

El subagente de LoAF/INP mide lo que bloquea el hilo principal en cada recorrido del Navigator, con el workflow `interaction` de WebPerf Snippets MCP, los pasos del Navigator, el throttling del gate y la mediana de 3 ejecuciones: el INP del click con sus tres fases (retraso de entrada, procesamiento y presentación), los long animation frames con los scripts que los provocan y su invoker, y las tareas largas. En los recorridos con un click graba además un trace del click con el mismo código que el Judge, y trace-engine-cli lo resume: los snippets nombran el script y el trace nombra la función. En `pr/loaf-cart-handler`, el INP de añadir al carrito pasa de 32 a 192 ms, casi todo procesamiento (169 ms), el script es el handler del click (`DIV#root.onclick`) y el trace nombra `recommendFor`.

El Judge va al final y hace lo mismo que `ci`: el gate de la CLI, los traces, las reglas y la explicación del LLM local (o el handoff con `lite`), en `out/agents/judge/`. Además, para cada métrica que empeora, su informe añade los hallazgos del subagente que la mide, escogidos por reglas: las fases del LCP y los cambios de la imagen LCP, los nodos que se mueven en el CLS, y las fases del INP, los scripts que solo ejecuta la rama y la función del trace. El LLM no los ve: recibe el mismo prompt que en `ci`, el que se ha comprobado en el benchmark de modelos.

### Perfil `lite`, para equipos de 8 GB

```bash
COMPOSE_PROFILES=lite scripts/preflight.sh            # o a mano: docker compose --profile run pull, todo menos Ollama
COMPOSE_PROFILES=lite CANDIDATE=pr-lcp-hero-lazy docker compose up -d
COMPOSE_PROFILES=lite CANDIDATE=pr-lcp-hero-lazy docker compose run --rm ci
```

Las tiendas de las ramas se descargan igual que con el perfil por defecto.

Sin Ollama, `ci` da el mismo veredicto y la misma atribución, y el informe remite al handoff para la explicación: `handoff.md` se pega en el chat de un agente, por ejemplo en el cloud, y `handoff.json` sirve para un script. El handoff lleva el diff de la rama y los resúmenes de los traces. **Enviarlo a un servicio externo es una decisión de cada equipo para su propio código.**

El perfil por defecto, `llm`, lo activa el fichero `.env` del repo.

### Construir las imágenes en local

Si prefieres no descargarlas, o quieres comparar una rama tuya:

```bash
docker compose build thirdparty agents ollama         # sin ollama con el perfil lite
scripts/build-shop.sh main pr/lcp-hero-lazy           # una imagen de la tienda por ref git
```

## Las ramas de regresión

| Rama | Cambio | Qué empeora |
|---|---|---|
| `pr/lcp-hero-lazy` | La imagen del hero pierde el preload y el `fetchpriority`, y pasa a `loading="lazy"` | LCP |
| `pr/cls-promo-banner` | El banner de un tercero sin espacio reservado y un swap de fuente sin preload | CLS |
| `pr/loaf-cart-handler` | Un script síncrono de A/B testing y recomendaciones calculadas en el handler de añadir al carrito | INP y LCP |
| `pr/noop-refactor` | Extrae el hero a un componente | Nada: el control de falsos positivos |

Las tres regresiones quedan dentro de "good" en valor absoluto. El gate las detecta porque compara con la versión base, no con los umbrales de Google. Los tests de la app pasan en las cuatro ramas: el CI clásico no ve ninguna.

## Estructura

```
├── compose.yaml          # el laboratorio, con los perfiles llm y lite
├── apps/shop/            # la tienda Perf Coffee (React 19 y Vite)
├── apps/thirdparty/      # los mocks de terceros
├── agents/
│   ├── src/judge/        # gate, traces, diff, reglas, prompt y handoff
│   ├── src/ci/           # el servicio ci y su informe
│   ├── src/orchestrator.ts  # pasa los subagentes por las dos tiendas
│   ├── src/subagents/    # los subagentes: Navigator, LCP, CLS, LoAF/INP y el Judge
│   ├── journeys/         # los recorridos en JSON, uno por página
│   └── schemas/          # el schema de la explicación del LLM
├── docker/               # un Dockerfile por imagen
├── experiments/          # los experimentos que respaldan cada cifra de la documentación
├── scripts/              # preflight.sh y .ps1, build-shop.sh y publish-images.sh
└── docs/                 # la documentación del taller (Astro Starlight)
```

## Documentación

- [Por qué este stack](docs/src/content/docs/es/stack.md): cada pieza, qué descartamos y el dato que lo decidió.
- [Learnings](docs/src/content/docs/es/learnings.md): las decisiones de diseño con su contexto y sus datos.

Cada cifra de la documentación sale de un experimento de [`experiments/`](experiments), con su test:

| Experimento | Qué reproduce |
|---|---|
| [`regressions`](experiments/regressions) | El veredicto del gate en las cuatro ramas |
| [`models`](experiments/models) | El benchmark de los modelos del Judge |
| [`trace-engine-cli`](experiments/trace-engine-cli) | Por qué trace-engine-cli se llama como CLI y no como MCP |
| [`chrome-devtools-mcp`](experiments/chrome-devtools-mcp) | Chrome DevTools MCP fuera del editor |

## Licencia

[MIT](LICENSE)
