# Experimento: ensayo cronometrado

[English](README.md) · Castellano · [Català](README.ca.md)

Ejecuta el taller como lo haría un asistente: clona el repo en limpio, saca los comandos del README y de las guías de cada paso, los ejecuta en orden y guarda qué ha pasado con cada uno. Las duraciones y los recuentos de tests que dan las guías salen de ese fichero, y un test comprueba que siguen siendo los medidos.

## Qué hace

1. Clona el repo en una carpeta temporal, en la ref que se le pida (`main` por defecto) y en una carpeta `agent-first-perf-audits`, la del README. El proyecto de Compose del clon se llama igual que el de un asistente.
2. Lee los bloques `bash` de la sección "Puesta en marcha" de [`README.es.md`](../../README.es.md) y de las guías en castellano de [`docs/src/content/docs/es/workshop/`](../../docs/src/content/docs/es/workshop/), en orden, con [`scripts/lib/markdown.mjs`](../../scripts/lib/markdown.mjs), el mismo código que usa el comprobador de la documentación.
3. Ejecuta cada bloque con `bash` desde la raíz del clon, con el perfil de `COMPOSE_PROFILES` (`llm` por defecto, o `lite`) y sin las variables del laboratorio que tenga la terminal (`CANDIDATE`, `BASELINE`, `OUT`, `COMPOSE_PROJECT_NAME` y `COMPOSE_FILE`). Un comando que pasa de 30 minutos se para.
4. Guarda por comando, en `results/<perfil>.json`: el fichero y la línea de la guía, el exit code, la duración, los recuentos `pass` y `fail` de `node --test`, si la salida tiene las líneas del bloque `text` que sigue al comando en la guía (con `…` como comodín) y las últimas 20 líneas de la salida. La salida completa queda en `rehearsal.log`, en la carpeta temporal.

El fichero se guarda después de cada comando, con `complete: false` hasta que el ensayo termina. El clon y su laboratorio siguen en marcha al acabar; `docker compose down` desde el clon lo para.

El ensayo mide, así que en la máquina de referencia no corre nada más a la vez. El laboratorio del clon tiene el mismo nombre de proyecto que el del repo de trabajo: hay que parar ese antes de empezar.

## Las marcas de las guías

Un comentario HTML justo encima de un bloque `bash` dice al ensayo qué hacer con él, sin cambiar la página. Una marca desconocida, o una que no está encima de un bloque `bash`, para el ensayo con su número de línea.

| Marca | Qué hace el ensayo |
|---|---|
| `<!-- rehearsal: optional -->` | Ejecuta el bloque, pero su tiempo no cuenta en el hueco de su paso |
| `<!-- rehearsal: skip, <motivo> -->` | No lo ejecuta |
| `<!-- rehearsal: clone -->` | Lo ejecuta sin sus líneas `git clone` y `cd`, porque el ensayo ya ha clonado el repo |

## Requisitos

Los del taller, que comprueba `scripts/preflight.sh`, y Node 22 o superior, git y bash. No tiene dependencias de npm.

## Uso

```bash
node rehearse.mjs --dry-run                 # lista los comandos de las guías, sin ejecutar nada
node rehearse.mjs                           # perfil llm, desde un clon de este repo en main
COMPOSE_PROFILES=lite node rehearse.mjs     # perfil lite
node rehearse.mjs --only step-01,step-02    # solo esos pasos, a results/llm-step-01-step-02.json
npm test                                    # los tests del ensayo y las comprobaciones sobre results/
```

`--source` acepta una ruta o una URL de git, `--ref` una rama, un tag o un commit, `--skip-optional` deja fuera los bloques opcionales, `--dir` escoge la carpeta del clon y `--timeout` da los minutos de espera por comando.

## Qué comprueban los tests

`npm test` pasa los tests del propio ensayo (la lectura de las guías, la comparación de las salidas y un ensayo entero sobre un repo de prueba) y `claims.test.mjs`, que lee cada fichero de `results/` de un ensayo terminado y comprueba que:

1. Los comandos ensayados son los que las guías escriben hoy. Si una guía cambia, hay que repetir el ensayo.
2. Los `pass N` y `fail N` que las guías dan después de un comando son los medidos.
3. Cada comando sale con 1 cuando su guía anuncia tests que fallan, y con 0 en los demás casos.
4. El tiempo de máquina de cada paso, sin los bloques opcionales, no pasa del 60 % de su hueco en la agenda de [`PLAN.md`](../../PLAN.md).
5. El paso 5 sale con 1, 1, 1 y 0, en el orden de sus ramas.
6. Con el perfil `llm`, la salida de cada comando tiene las líneas que enseña su guía. Las guías enseñan la salida de ese perfil.

Sin ficheros en `results/`, esas comprobaciones se saltan y lo dicen.
