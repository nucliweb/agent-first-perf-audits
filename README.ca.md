# agent-first-perf-audits

[English](README.md) · [Castellano](README.es.md) · Català

Repositori del taller **Multi-Agent Performance Audits: Automatizando Core Web Vitals en tu plataforma interna con MCP**, de PerfReviews.

Construïm un gate de rendiment per a pull requests amb agents: mesuren una botiga d'exemple abans i després d'un canvi, decideixen si ha empitjorat i expliquen per què. Tot s'executa al teu portàtil amb Docker Compose, sense sortida a internet.

La idea que recorre el taller: **les regles decideixen, l'LLM explica**. El veredicte el dona l'estadística de la CLI de WebPerf Snippets (Mann-Whitney U, llindars i exit code). Un model local només redacta la causa a partir de dades ja mesurades, amb una sortida JSON validada per un schema. Si contradiu les regles, guanyen les regles.

## Com funciona

```
shop-baseline ─┐                         ┌─ veredicte: CLI de WebPerf Snippets (exit code)
               ├─ agents / ci ── Chromium ┤─ atribució: trace-engine-cli (funció, URL, línia)
shop-candidate ┘        │                 └─ explicació: llama3.2:3b a Ollama, o handoff
                    thirdparty
```

| Servei | Què fa |
|---|---|
| `shop-baseline` i `shop-candidate` | La botiga Perf Coffee construïda des de dues refs git: `main` i la branca que es compara |
| `thirdparty` | Mocks locals d'scripts de tercers (analytics, xat, bàner de promoció, A/B testing) |
| `agents` | Node 22, el Chromium de Playwright, Chrome DevTools MCP, WebPerf Snippets i trace-engine-cli |
| `ci` | El gate d'una PR: mesura, atribueix, explica, escriu els informes i surt amb 0 o 1 |
| `ollama` | L'LLM local del Judge, amb `llama3.2:3b` dins de la imatge |

La comparació es fa a la mateixa màquina i en la mateixa execució, així que la diferència entre portàtils no afecta el veredicte.

## Requisits

- 16 GB de RAM. Amb 8 GB, el perfil `lite`, sense LLM local.
- Un runtime de contenidors amb l'ordre `docker compose`, Compose v2.20.2 o superior (`docker compose version`), i **almenys 8 GB assignats a la VM**. A Docker Desktop el valor per defecte sol ser més baix.
  - Docker Desktop i OrbStack: tal qual.
  - Colima: arrenca-la amb prou memòria, per exemple `colima start --memory 8 --cpu 4`.
  - Podman: fes servir el seu mode compatible amb Docker i l'ordre `docker compose`, no `podman-compose`, que no cobreix tot el que fa servir el laboratori.

  Només s'ha provat Docker Desktop a macOS; la resta de runtimes es provaran abans del taller.
- 15 GB lliures de disc.
- macOS, Linux o Windows amb WSL2, i git.

Descarrega les imatges a casa: són diversos GB i la Wi-Fi d'un esdeveniment no dona per a tothom.

## Posada en marxa

A casa, amb bona connexió:

```bash
git clone https://github.com/nucliweb/agent-first-perf-audits.git
cd agent-first-perf-audits
scripts/preflight.sh                                  # amb 8 GB: COMPOSE_PROFILES=lite scripts/preflight.sh
```

El preflight comprova el runtime, la versió de Compose, l'arquitectura, la memòria de la VM, les branques de regressió i l'espai lliure al disc. Després descarrega totes les imatges i passa un smoke test dins de Compose: Chromium arrenca, s'enregistra un trace, les dues botigues responen, el laboratori no té sortida a internet i, amb el perfil `llm`, el model respon. Imprimeix OK o KO a cada pas, amb el que cal canviar al teu runtime quan alguna cosa falla, i surt amb 0 si l'equip està a punt.

A Windows, des de PowerShell (Windows no executa scripts sense `-ExecutionPolicy Bypass`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
$env:COMPOSE_PROFILES = 'lite'; powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1   # amb 8 GB
```

Des de WSL2 serveix `scripts/preflight.sh`. El `.ps1` fa el mateix que el `.sh`, però encara no s'ha provat a Windows.

Les descàrregues del preflight, per si prefereixes fer-les a mà:

```bash
docker compose --profile llm --profile run pull       # Ollama, els mocks, agents i la botiga de main
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose pull shop-candidate # la botiga de cada branca
done
```

`agents` i `ci` comparteixen imatge i són al perfil `run`, que no es descarrega si no ho demanes: `docker compose up` arrenca el laboratori, no un Chromium que es repartiria la CPU amb la mesura.

Per passar el gate a una branca:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d       # les dues botigues, els mocks i Ollama
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm ci
```

`ci` compara la botiga de `CANDIDATE` amb la de `BASELINE` (per defecte, `main`) i escriu a `out/`:

| Fitxer | Contingut |
|---|---|
| `report.md`, `report.html` i `report.json` | El veredicte de les regles, les mètriques de cada escenari i l'explicació de cada mètrica que empitjora |
| `handoff.md` i `handoff.json` | La mateixa entrada que rep l'LLM local, amb el prompt i l'schema, per passar-la a un altre agent |
| `gate/` i `traces/` | Els informes de la CLI i els traces de Chromium |

L'exit code de `ci` és el veredicte: 0 si passa, 1 si alguna mètrica empitjora i 2 si el gate no s'ha pogut executar.

El preflight crea `out/`. Si no l'has passat, a Linux crea-la abans de la primera execució (`mkdir out`): si no existeix, Docker la crea com a root i el contenidor no hi pot escriure.

### Els subagents

L'orquestrador passa cada subagent per la botiga de `BASELINE` i per la de `CANDIDATE`, una mesura darrere l'altra perquè dos Chromium no es reparteixin la CPU, i escriu el que troba a `out/agents/`, un JSON per subagent i costat:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts
CANDIDATE=pr-cls-promo-banner docker compose run --rm agents node src/orchestrator.ts cls   # un, amb el que necessita
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
```

Sense noms passa tots els subagents i després el Judge; amb noms, només aquests i els que necessiten, com el Navigator per al de CLS, i el Judge si s'anomena.

El Navigator va primer: recorre a les dues botigues els quatre recorreguts d'`agents/journeys/` (home, llistat, fitxa i afegir a la cistella), pas a pas i amb el throttling del gate, i anota la URL on deixa la pàgina cada pas i els errors de la pàgina. Si l'element d'un pas no apareix, l'orquestrador s'atura i indica el recorregut, el costat i el pas: mesurar un recorregut que no acaba dona xifres que no signifiquen res. Cada recorregut és un JSON amb la seva pàgina i els seus passos (`click`, `type`, `hover`, `scroll` i `wait`), el mateix format que `--interact-script` de la CLI, i el gate mesura afegir a la cistella amb el mateix fitxer.

El subagent d'LCP mesura la home amb el throttling del gate (CPU 4x i fast-4g) i la mediana de 3 execucions. Amb WebPerf Snippets MCP obté l'LCP, el seu element, el desglossament en les seves quatre fases (TTFB, retard i temps de càrrega del recurs i retard de render) i, quan l'LCP és una imatge, com carrega: `loading`, `fetchpriority`, si té preload i els avisos de l'auditoria. Amb Chrome DevTools MCP enregistra un trace de la càrrega a `out/agents/traces/`. Mesura, no decideix: el veredicte és del gate.

El subagent de CLS mesura cada recorregut del Navigator, des de la càrrega de la seva pàgina fins a l'últim pas, amb els passos que el Navigator ha comprovat, el throttling del gate i la mediana de 3 execucions. Amb el snippet `Layout-Shift-Loading-and-Interaction` de WebPerf Snippets MCP obté el CLS, quants desplaçaments compten i quants no (els que segueixen una interacció) i els selectors dels nodes que es mouen, del que més al que menys. A `pr/cls-promo-banner`, el CLS passa de 0 a 0,053 a la home i a 0,0547 als altres tres recorreguts, i el primer node és sempre `main.main`: el bàner empeny la pàgina cap avall.

El subagent de LoAF/INP mesura el que bloqueja el fil principal a cada recorregut del Navigator, amb el workflow `interaction` de WebPerf Snippets MCP, els passos del Navigator, el throttling del gate i la mediana de 3 execucions: l'INP del click amb les seves tres fases (retard d'entrada, processament i presentació), els long animation frames amb els scripts que els provoquen i el seu invoker, i les tasques llargues. Als recorreguts amb un click enregistra, a més, un trace del click amb el mateix codi que el Judge, i trace-engine-cli el resumeix: els snippets anomenen l'script i el trace anomena la funció. A `pr/loaf-cart-handler`, l'INP d'afegir a la cistella passa de 32 a 192 ms en una execució i de 16 a 96 ms en una altra, gairebé tot processament, l'script és el handler del click (`DIV#root.onclick`) i el trace anomena `recommendFor`.

El Judge va al final i fa el mateix que `ci`: el gate de la CLI, els traces, les regles i l'explicació de l'LLM local (o el handoff amb `lite`), a `out/agents/judge/`. A més, per a cada mètrica que empitjora, el seu informe afegeix les troballes del subagent que la mesura, triades per regles: les fases de l'LCP i els canvis de la imatge LCP, els nodes que es mouen en el CLS, i les fases de l'INP, els scripts que només executa la branca i la funció del trace. L'LLM no les veu: rep el mateix prompt que a `ci`, el que s'ha comprovat al benchmark de models.

### Perfil `lite`, per a equips de 8 GB

```bash
COMPOSE_PROFILES=lite scripts/preflight.sh            # o a mà: docker compose --profile run pull, tot menys Ollama
COMPOSE_PROFILES=lite CANDIDATE=pr-lcp-hero-lazy docker compose up -d
COMPOSE_PROFILES=lite CANDIDATE=pr-lcp-hero-lazy docker compose run --rm ci
```

Les botigues de les branques es descarreguen igual que amb el perfil per defecte.

Sense Ollama, `ci` dona el mateix veredicte i la mateixa atribució, i l'informe remet al handoff per a l'explicació: `handoff.md` s'enganxa al xat d'un agent, per exemple al cloud, i `handoff.json` serveix per a un script. El handoff porta el diff de la branca i els resums dels traces. **Enviar-lo a un servei extern és una decisió de cada equip per al seu propi codi.**

El perfil per defecte, `llm`, l'activa el fitxer `.env` del repo.

### Construir les imatges en local

Si prefereixes no descarregar-les, o vols comparar una branca teva:

```bash
docker compose build thirdparty agents ollama         # sense ollama amb el perfil lite
scripts/build-shop.sh main pr/lcp-hero-lazy           # una imatge de la botiga per ref git
```

## El taller pas a pas

El taller no demana programar: cada pas és una llista d'ordres amb el que n'ha de sortir. El nucli de cada subagent, les funcions que criden els servidors MCP i converteixen les seves respostes en JSON, comença com un `throw` que indica el pas, la tasca i els seus tests, entre dues marques `// workshop:` (tag `workshop-start`). A cada pas llances els seus tests i els veus fallar, n'apliques la solució amb `git checkout step-0N-solution -- agents/src`, els veus passar i mesures la regressió del pas. Qui vulgui pot escriure aquestes funcions en lloc d'aplicar la solució. Tota la resta ja funciona: el laboratori, l'orquestrador, el gate, les regles i l'explicació del Judge.

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start                   # la teva branca, des de l'inici del taller
```

La punta de la branca `workshop` és la solució completa: es comença des del tag `workshop-start`.

`compose.yaml` munta `agents/src`, `agents/test` i `agents/journeys` al contenidor, així que el que s'executa és el que hi ha a la teva còpia del repo, sense reconstruir res; la imatge només hi posa Node, Chromium i les dependències. Cada pas té la seva comprovació: passa els seus tests i mira els fitxers que deixa a `out/`, i si en falta algun diu què cal executar.

```bash
docker compose run --rm agents npm run check -- step-02
```

| Pas | El codi del pas | El que deixa a `out/` |
|---|---|---|
| 1 | `recordTrace` a `agents/src/mcp/trace.ts`: la primera crida a Chrome DevTools MCP | `first-trace.json`, amb `node src/first-trace.ts` |
| 2 | `askWebPerf` i `lcpReportOf` a `agents/src/subagents/lcp.ts` | `agents/lcp-*.json`, amb `node src/orchestrator.ts lcp` |
| 3 | El recorregut del Navigator i la mesura de CLS i LoAF/INP | `agents/navigator-*.json`, `cls-*.json` i `loaf-*.json`, amb `node src/orchestrator.ts cls loaf` |
| 4 | Les troballes del Judge a `agents/src/judge/findings.ts` | `agents/judge/report.json` de `pr/lcp-hero-lazy`, amb `node src/orchestrator.ts lcp judge` |
| 5 | Res: `ci` contra les quatre branques, cadascuna a `out/ci/<rama>/` | 3 fallades i 1 pass |

Cada pas té la seva guia, amb les ordres una a una, el que n'ha de sortir, què fa el codi aplicat i, per a qui el vulgui escriure, pistes: comença pel [pas 1](docs/src/content/docs/ca/workshop/step-01.md). Els tags són acumulatius: `step-02-solution` porta també el codi del pas 1, així que pots començar qualsevol pas encara que no hagis fet l'anterior.

La branca i els seus tags surten de `main` amb `node scripts/workshop.mjs`, que comprova que cada estat compila i que, a la imatge `agents`, els tests de cada pas fallen abans de la seva solució i passen després.

## Les branques de regressió

| Branca | Canvi | Què empitjora | Preview |
|---|---|---|---|
| `pr/lcp-hero-lazy` | La imatge del hero perd el preload i el `fetchpriority`, i passa a `loading="lazy"` | LCP | [preview](https://perf-coffee-git-pr-lcp-hero-lazy-nucliweb-projects.vercel.app/) |
| `pr/cls-promo-banner` | El bàner d'un tercer sense espai reservat i un swap de font sense preload | CLS | [preview](https://perf-coffee-git-pr-cls-promo-banner-nucliweb-projects.vercel.app/) |
| `pr/loaf-cart-handler` | Un script síncron d'A/B testing i recomanacions calculades al handler d'afegir a la cistella | INP i LCP | [preview](https://perf-coffee-git-pr-loaf-cart-handler-nucliweb-projects.vercel.app/) |
| `pr/noop-refactor` | Extreu el hero a un component | Res: el control de falsos positius | [preview](https://perf-coffee-git-pr-noop-refactor-nucliweb-projects.vercel.app/) |

La botiga de `main` és a [perf-coffee.vercel.app](https://perf-coffee.vercel.app/) i cada branca té la seva preview a Vercel. Com veure cada regressió al navegador, amb les seves xifres, a [Les branques al navegador](docs/src/content/docs/ca/previews.md).

Les tres regressions queden dins de "good" en valor absolut. El gate les detecta perquè compara amb la versió base, no amb els llindars de Google. Els tests de l'app passen a les quatre branques: el CI clàssic no en veu cap.

## El gate en una pull request

Cada branca `pr/*` té una [pull request en esborrany](https://github.com/nucliweb/agent-first-perf-audits/pulls) que no es fusiona: és la demo del gate a GitHub Actions ([`perf-gate.yml`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/.github/workflows/perf-gate.yml)). A cadascuna, `ci` mesura la botiga de la branca contra la de `main` amb el perfil `lite`, les regles decideixen el veredicte i Claude Sonnet 5.5 explica cada mètrica que empitjora, amb la mateixa entrada que rep el model local del taller. L'informe arriba com a comentari a la pull request, amb els fets de les regles, i el check falla quan falla el gate.

El model local és petit perquè càpiga en un portàtil al costat de Chromium; la demo dona la mateixa entrada a un model més gran. Per fer-ho en local amb la teva clau de l'API, després de `ci`:

```bash
cd agents
ANTHROPIC_API_KEY=... node src/ci/explain.ts ../out claude-sonnet-5-5   # escriu out/report-claude-sonnet-5-5.md
```

## Estructura

```
├── compose.yaml          # el laboratori, amb els perfils llm i lite
├── apps/shop/            # la botiga Perf Coffee (React 19 i Vite)
├── apps/thirdparty/      # els mocks de tercers
├── agents/
│   ├── src/judge/        # gate, traces, diff, regles, prompt i handoff
│   ├── src/ci/           # el servei ci i el seu informe
│   ├── src/orchestrator.ts  # passa els subagents per les dues botigues
│   ├── src/subagents/    # els subagents: Navigator, LCP, CLS, LoAF/INP i el Judge
│   ├── journeys/         # els recorreguts en JSON, un per pàgina
│   └── schemas/          # el schema de l'explicació de l'LLM
├── docker/               # un Dockerfile per imatge
├── experiments/          # els experiments que avalen cada xifra de la documentació
├── scripts/              # preflight, workshop.mjs, build-shop.sh i publish-images.sh
└── docs/                 # la documentació del taller (Astro Starlight)
```

## Documentació

- [El taller pas a pas](docs/src/content/docs/ca/workshop/step-01.md): una guia per pas, del primer trace al gate contra les quatre branques.
- [Les branques al navegador](docs/src/content/docs/ca/previews.md): la botiga de `main` i les quatre branques desplegades a Vercel, per veure cada regressió sense Docker.
- [Per què aquest stack](docs/src/content/docs/ca/stack.md): cada peça, què vam descartar i la dada que ho va decidir.
- [Learnings](docs/src/content/docs/ca/learnings.md): les decisions de disseny amb el seu context i les seves dades.

Cada xifra de la documentació surt d'un experiment d'[`experiments/`](experiments), amb el seu test:

| Experiment | Què reprodueix |
|---|---|
| [`regressions`](experiments/regressions/README.ca.md) | El veredicte del gate a les quatre branques |
| [`models`](experiments/models/README.ca.md) | El benchmark dels models del Judge |
| [`trace-engine-cli`](experiments/trace-engine-cli/README.ca.md) | Per què trace-engine-cli es crida com a CLI i no com a MCP |
| [`chrome-devtools-mcp`](experiments/chrome-devtools-mcp/README.ca.md) | Chrome DevTools MCP fora de l'editor |
| [`discarded`](experiments/discarded/README.ca.md) | Les alternatives descartades de la pàgina mapa: sense throttling de xarxa, sense preload i sense `keepNames` |
| [`previews`](experiments/previews/README.ca.md) | Les branques al navegador: la botiga a Vercel, amb i sense throttling de xarxa |

## Llicència

[MIT](LICENSE)
