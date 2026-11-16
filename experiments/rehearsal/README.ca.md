# Experiment: assaig cronometrat

[English](README.md) · [Castellano](README.es.md) · Català

Executa el taller com ho faria un assistent: clona el repo en net, treu les ordres del README i de les guies de cada pas, les executa en ordre i desa què ha passat amb cadascuna. Les durades i els recomptes de tests que donen les guies surten d'aquest fitxer, i un test comprova que continuen sent els mesurats.

## Què fa

1. Clona el repo en una carpeta temporal, a la ref que se li demani (`main` per defecte) i en una carpeta `agent-first-perf-audits`, la del README. El projecte de Compose del clon es diu igual que el d'un assistent.
2. Llegeix els blocs `bash` de la secció "Puesta en marcha" de [`README.es.md`](../../README.es.md) i de les guies en castellà de [`docs/src/content/docs/es/workshop/`](../../docs/src/content/docs/es/workshop/), en ordre, amb [`scripts/lib/markdown.mjs`](../../scripts/lib/markdown.mjs), el mateix codi que fa servir el comprovador de la documentació.
3. Executa cada bloc amb `bash` des de l'arrel del clon, amb el perfil de `COMPOSE_PROFILES` (`llm` per defecte, o `lite`) i sense les variables del laboratori que tingui el terminal (`CANDIDATE`, `BASELINE`, `OUT`, `COMPOSE_PROJECT_NAME` i `COMPOSE_FILE`). Una ordre que passa de 30 minuts s'atura.
4. Desa per ordre, a `results/<perfil>.json`: el fitxer i la línia de la guia, l'exit code, la durada, els recomptes `pass` i `fail` de `node --test`, si la sortida té les línies del bloc `text` que segueix l'ordre a la guia (amb `…` com a comodí) i les últimes 20 línies de la sortida. La sortida completa queda a `rehearsal.log`, a la carpeta temporal.

El fitxer es desa després de cada ordre, amb `complete: false` fins que l'assaig acaba. El clon i el seu laboratori continuen en marxa en acabar, tret de amb `--profiles`; `docker compose down` des del clon l'atura.

L'assaig mesura, així que a la màquina de referència no hi corre res més alhora. El laboratori del clon té el mateix nom de projecte que el del repo de treball: cal aturar aquest abans de començar.

## Les marques de les guies

Un comentari HTML just a sobre d'un bloc `bash` diu a l'assaig què fer-ne, sense canviar la pàgina. Una marca desconeguda, o una que no és a sobre d'un bloc `bash`, atura l'assaig amb el seu número de línia.

| Marca | Què fa l'assaig |
|---|---|
| `<!-- rehearsal: optional -->` | Executa el bloc, però el seu temps no compta en el forat del seu pas |
| `<!-- rehearsal: skip, <motiu> -->` | No l'executa |
| `<!-- rehearsal: clone -->` | L'executa sense les seves línies `git clone` i `cd`, perquè l'assaig ja ha clonat el repo |

## Requisits

Els del taller, que comprova `scripts/preflight.sh`, i Node 22 o superior, git i bash. No té dependències de npm.

## Ús

```bash
node rehearse.mjs --dry-run                 # llista les ordres de les guies, sense executar res
node rehearse.mjs                           # perfil llm, des d'un clon d'aquest repo a main
COMPOSE_PROFILES=lite node rehearse.mjs     # perfil lite
node rehearse.mjs --profiles llm,lite       # una passada amb cada perfil, una darrere l'altra
node rehearse.mjs --only step-01,step-02    # només aquests passos, a results/llm-step-01-step-02.json
npm test                                    # els tests de l'assaig i les comprovacions sobre results/
```

Amb `--profiles`, cada passada va en el seu propi clon i atura el seu laboratori en acabar, així que la següent té la màquina sola. `--source` accepta una ruta o una URL de git, `--ref` una branca, un tag o un commit, `--skip-optional` deixa fora els blocs opcionals, `--dir` tria la carpeta del clon i `--timeout` dona els minuts d'espera per ordre.

## Què comproven els tests

`npm test` passa els tests del mateix assaig (la lectura de les guies, la comparació de les sortides i un assaig sencer sobre un repo de prova) i `claims.test.mjs`, que llegeix cada fitxer de `results/` d'un assaig acabat i comprova que:

1. Les ordres assajades són les que les guies escriuen avui. Si una guia canvia, cal repetir l'assaig.
2. Els `pass N` i `fail N` que les guies donen després d'una ordre són els mesurats.
3. Cada ordre surt amb 1 quan la seva guia anuncia tests que fallen, i amb 0 en la resta de casos.
4. El temps de màquina de cada pas, sense els blocs opcionals, no passa del 60 % del seu forat a l'agenda de [`PLAN.md`](../../PLAN.md).
5. El pas 5 surt amb 1, 1, 1 i 0, en l'ordre de les seves branques.
6. Amb el perfil `llm`, la sortida de cada ordre té les línies que ensenya la seva guia. Les guies ensenyen la sortida d'aquest perfil.

Sense fitxers a `results/`, aquestes comprovacions se salten i ho diuen.

## Resultats al Mac de referència

Una passada amb cada perfil en un Apple Silicon de 16 GB, des de `main` i amb les imatges ja descarregades. El temps de màquina d'un pas és la suma de les seves ordres, sense els blocs opcionals, i el forat és el de l'agenda de [`PLAN.md`](../../PLAN.md):

| Pas | `llm` | `lite` | Forat |
|---|---|---|---|
| 1 | 0,9 min | 0,8 min | 15 min |
| 2 | 2,9 min | 2,9 min | 20 min |
| 3 | 6,9 min | 6,9 min | 20 min |
| 4 | 4,5 min | 4,0 min | 20 min |
| 5 | 11,2 min | 9,3 min | 20 min |
| Total | 26,3 min | 23,8 min | 95 min |

El pas 5 dona 1, 1, 1 i 0 amb els dos perfils, i amb `llm` la sortida de cada ordre té les línies de la seva guia. El que queda de cada forat és per explicar i per a qui va més a poc a poc que la màquina de referència.
