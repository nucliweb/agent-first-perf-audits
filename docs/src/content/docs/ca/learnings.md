---
title: Learnings
description: Decisions de disseny que vam prendre en construir el taller, i per què.
sidebar:
  order: 90
---

Decisions que vam prendre en construir aquest flux. Cadascuna inclou el context, la decisió i les dades que la justifiquen, perquè la puguis aplicar, o descartar, a la teva plataforma.

## No tot ha de ser un MCP

### Context

Per atribuir una regressió a una funció concreta, el Judge ha d'analitzar el trace de Chromium de cada execució. Fem servir [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli), una CLI de l'equip de Chrome DevTools construïda sobre el Trace Engine del panell Performance. Converteix un trace en un resum compacte en format [TOON](https://github.com/toon-format/toon), pensat per al context d'un LLM.

trace-engine-cli no té servidor MCP. Teníem dues opcions: embolcallar-la en un servidor MCP propi o cridar-la directament com a CLI des de l'orquestrador.

### Decisió

La cridem directament com a CLI.

- **No cal resoldre-ho tot amb MCP.** MCP aporta valor quan el model ha de descobrir eines i decidir quina fa servir. En aquest flux, l'orquestrador ja sap quina ordre ha d'executar i quan.
- **Si una CLI ja és òptima, fem servir la CLI.** trace-engine-cli ja produeix una sortida compacta, estable i pensada per a LLMs. Un MCP a sobre no hi afegeix informació, només una capa més.
- **Provar una cosa nova no requereix sobrearquitectura.** L'eina és a la versió 0.2.0. Cridar-la com a CLI ens permet provar-la i substituir-la sense tocar la resta del sistema.

### Dades

Trace d'1,4 MB, enregistrat amb Playwright i CPU throttling 4x, d'una pàgina amb un bàner que provoca layout shift i un handler de click que bloqueja 180 ms:

| Ordre | Sortida | Què va trobar |
|---|---|---|
| `overview` | 566 bytes | CLS 0,148 i INP 199 ms |
| `interactions` | 191 bytes | INP: input delay 3 ms, processing 186 ms, presentation 9 ms |
| `tasks --tree bottom-up --top 5` | 428 bytes | `addToCart`, 182 ms de self time, línia 21 |
| `shifts --events` | 829 bytes | Clúster de 0,148 amb un node culpable |

Els quatre resums sumen 2.014 bytes, un 99,85 % menys que el trace original: hi caben sense problemes en el context d'un model d'1,7B.

### I els insights de Chrome DevTools MCP?

Chrome DevTools MCP ja ofereix els insights del panell Performance. Abans d'afegir-hi una eina més, vam comprovar si n'hi havia prou. Vam enregistrar el mateix recorregut amb Chrome DevTools MCP i vam passar aquest mateix trace per trace-engine-cli:

| | Chrome DevTools MCP | trace-engine-cli |
|---|---|---|
| Text que rep l'agent | Uns 11.400 bytes: el resum de `performance_stop_trace` i tres insights | Uns 2.000 bytes: les quatre ordres |
| LCP, CLS i INP | Sí | Sí |
| Desglossament de l'INP | Sí | Sí |
| Funció que causa l'INP | No | `addToCart`, amb la seva URL i la seva línia |

Uns 4.500 bytes del resum de `performance_stop_trace` són una explicació dels seus formats que es repeteix igual a cada trace. I cap insight no anomena la funció del handler: el d'INP dona el desglossament, però no quin codi el provoca. El Judge necessita justament aquesta atribució per relacionar la regressió amb el diff de la branca.

Per això cada eina fa una cosa: Chrome DevTools MCP captura el trace i trace-engine-cli el resumeix.

### Comprova-ho

L'experiment és a [`experiments/trace-engine-cli`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/trace-engine-cli/README.ca.md). Enregistra un trace nou a la teva màquina i comprova cada afirmació d'aquesta pàgina:

```bash
cd experiments/trace-engine-cli
npm install
npm test            # enregistra un trace i verifica les conclusions
npm run record      # enregistra out/trace.json
npm run summarize   # mostra els resums i la taula de mides
npm run compare     # compara Chrome DevTools MCP i trace-engine-cli sobre el mateix trace
```

Els mil·lisegons canvien d'una màquina a una altra, així que el test comprova llindars i no valors exactes: cada resum ocupa menys de 2 KB, els quatre junts redueixen el trace més d'un 99 %, el CLS és com a mínim de 0,1, l'INP el domina el processing i `addToCart` apareix amb almenys 150 ms de self time. En la comparació, Chrome DevTools MCP dona més del triple de text i `addToCart` no apareix en cap de les seves sortides.

### Què no fa

- **No compara dos traces.** `diff` compara dues finestres de temps dins del mateix trace. La comparació entre baseline i candidate la fa la CLI de WebPerf Snippets.
- **No dona selectors dels nodes DOM.** Els nodes culpables de CLS apareixen com a `Node #9` i el target d'INP com a `null`. Els selectors surten de WebPerf Snippets.
- **Retorna temps absoluts.** Els rangs d'entrada són relatius a l'inici del trace, però els temps de sortida no. L'orquestrador els normalitza abans de passar-los a l'LLM.

### Com aplicar-ho a la teva plataforma

Abans d'embolcallar una eina en un servidor MCP, pregunta't:

1. El model ha de decidir quan fer-la servir, o ho decideix el codi?
2. La seva sortida ja és compacta i estable?
3. És una eina madura, o l'estàs provant?

Si ho decideix el codi, la sortida ja serveix i l'eina és nova, n'hi ha prou amb una crida directa a la CLI.

## Chrome DevTools MCP fora de l'editor

### Context

[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) està pensat per a un agent al teu editor: una sessió interactiva, un navegador que diversos agents poden compartir i un client que diu al servidor en quines carpetes pot escriure.

Al taller el fan servir els subagents dins d'un contenidor sense xarxa. Cada subagent arrenca el seu propi servidor per stdio, amb una sola pàgina, i els traces han d'acabar en una carpeta que després llegeix el Judge.

### Què falla amb els valors per defecte

- **Cada tool de pàgina exigeix `pageId`.** Serveix perquè diversos agents comparteixin un navegador sense trepitjar-se. Sense ell, `navigate_page` retorna un error de validació.
- **Els fitxers només es poden escriure al directori temporal del servidor.** És la restricció que s'aplica quan el client no declara roots, una capacitat que la versió 2026-07-28 del protocol marca com a obsoleta. Un trace desat en una altra carpeta retorna `Access denied`.
- **Aquest directori temporal pot no ser el del client.** El client stdio de l'SDK de MCP arrenca el servidor només amb `HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM` i `USER`. A macOS, `TMPDIR` apunta a `/var/folders/...`; el servidor no el rep i fa servir `/tmp`. Una ruta que l'orquestrador crea amb `os.tmpdir()` en queda fora. A Linux tots dos fan servir `/tmp` i no es nota.
- **Tampoc no rep `PLAYWRIGHT_BROWSERS_PATH`.** Li passa igual a WebPerf Snippets MCP, que llança el Chromium de Playwright: si instal·les el navegador en una ruta pròpia, el servidor el busca a la ruta per defecte i no el troba.
- **Chromium no arrenca al contenidor.** Sense privilegis extra no té un sandbox utilitzable i avorta amb `No usable sandbox!`.

### Decisió

Arrenquem el servidor amb aquests flags:

| Flag | Per a què |
|---|---|
| `--no-page-id-routing` | Cada subagent té el seu navegador, així que les tools funcionen sense `pageId` |
| `--chromeArg=--no-sandbox` | Només al contenidor, que ja aïlla el procés |
| `--headless`, `--isolated` i `--executablePath` | Sense finestra, amb un perfil temporal i amb el Chromium de Playwright, el mateix que fa servir WebPerf Snippets |
| `--usageStatistics=false` i `--performanceCrux=false` | El gate s'executa sense xarxa |

Els traces no necessiten cap altre flag. El subagent grava cadascun al directori temporal, que al contenidor és `/tmp` per al client i per al servidor, i el copia a la carpeta de sortida. `--workspace=<carpeta>` permetria desar-lo allà directament, afegint aquesta carpeta al directori temporal del servidor, i estalviaria la còpia. Vam descartar `--allow-unrestricted-paths`: obre tot el sistema de fitxers i el mateix servidor el marca com a obsolet en favor de `--workspace=/`.

El Chromium de Playwright s'instal·la a la ruta per defecte, `~/.cache/ms-playwright`, l'única on el troben tots dos servidors.

### Comprova-ho

L'experiment és a [`experiments/chrome-devtools-mcp`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/chrome-devtools-mcp/README.ca.md). Cada test arrenca un servidor amb uns flags diferents i comprova un d'aquests comportaments; un altre arrenca Node amb l'entorn que el client stdio passa al servidor i comprova on busca Playwright el navegador:

```bash
cd experiments/chrome-devtools-mcp
npm install
npm test
```

A macOS s'executen els vuit tests. A Linux se salta el del `TMPDIR`, perquè el client i el servidor comparteixen el directori temporal.

### Com aplicar-ho a la teva plataforma

1. Un MCP pensat per a l'editor porta valors per defecte pensats per a l'editor. Revisa'n els flags abans de posar-lo en un pipeline.
2. No donis per fet que el servidor veu el teu entorn. Amb stdio, passa-li el que necessiti com a flags o com a variables explícites.
3. Escriu un test per cada valor per defecte que canviïs. Si una versió nova el canvia, te n'assabentes abans que el teu pipeline.

## Un sol Chromium per als dos MCP

### Context

Al contenidor `agents` hi ha dos servidors MCP que obren un navegador: Chrome DevTools MCP, que grava els traces del subagent d'LCP, i WebPerf Snippets MCP, que mesura per al gate i per a la resta de subagents. Per defecte cadascun busca el seu: Chrome DevTools MCP, el Google Chrome instal·lat al sistema; WebPerf Snippets, el Chromium de Playwright.

La imatge es publica per a amd64 i arm64, i és la d'arm64 la que corre en un Mac amb Apple Silicon. Quan la vam dissenyar, Google no publicava Chrome per a Linux ARM64, així que la imatge d'arm64 no podia tenir el navegador que Chrome DevTools MCP espera.

### Decisió

Un sol navegador a la imatge: el Chromium complet de Playwright, sense el headless shell.

- **Chrome DevTools MCP l'arrenca per la seva ruta**, amb `--executablePath` i la ruta que dona `chromium.executablePath()` de Playwright.
- **WebPerf Snippets el llança quan està instal·lat** en lloc del headless shell, i anota a les condicions de la mesura quin binari ha fet servir.
- **Tots dos mesuren amb el mateix binari**, a amd64 i a arm64, i la versió la fixa la de Playwright. Un trace de Chrome DevTools MCP i una mesura de WebPerf Snippets surten del mateix navegador.

Avui Google sí que publica Chrome estable per a Linux ARM64. Tot i així, la decisió es manté: amb dos navegadors, cada servidor mesuraria amb un de diferent, i la imatge pesaria més.

### Comprova-ho

El repositori apt de Google llista els seus paquets per arquitectura, i Chrome for Testing, les seves plataformes:

```bash
curl -s https://dl.google.com/linux/chrome/deb/dists/stable/main/binary-arm64/Packages | grep -A1 "^Package: google-chrome-stable"
curl -s https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json | grep -o '"platform":"linux-arm64"' | head -1
```

La instal·lació és a [`docker/agents/Dockerfile`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/docker/agents/Dockerfile) i els flags del servidor, a [`agents/src/mcp/client.ts`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/agents/src/mcp/client.ts).

### Com aplicar-ho a la teva plataforma

1. Si diverses eines obren un navegador, decideix quin és i passa'l a totes. El que cadascuna porta per defecte no té per què coincidir.
2. Comprova a les dues arquitectures que el navegador existeix abans de triar-lo: el que tens al teu equip no és el que té un Mac amb Apple Silicon dins d'un contenidor.
3. Revisa la decisió quan canviï el motiu, però canvia-la només si el nou motiu també s'aguanta.

## L'LLM explica, les regles decideixen

### Context

El Judge ha d'explicar per què falla una branca, no només que falla. Per això té un model local a Ollama, en CPU, que ha de cabre en un portàtil de 16 GB al costat de Chromium i la resta del laboratori. Vam provar quatre candidats d'1 a 3B (`llama3.2:3b`, `qwen3:1.7b`, `qwen2.5-coder:1.5b` i `gemma3:1b`) amb l'entrada real de cada branca de regressió: el veredicte del gate, el diff i els resums de trace-engine-cli de la versió base i de la candidata.

La primera versió li demanava tot al model: repetir el veredicte, triar la mètrica que empitjora més i explicar la causa. Cada vegada que alguna cosa fallava, vam passar una part més de la feina a les regles.

### Què vam provar

| Etapa | Què fan les regles abans de l'LLM | `llama3.2:3b` anomena la causa: primera mesura | Amb els fixtures actuals, en fred |
|---|---|---|---|
| `llm` | Decideixen el veredicte i quina mètrica cal explicar | 9 de 15 | 3 de 5 |
| `suspects` | A més, comparen els traces i donen al model els sospitosos: funcions i scripts nous o que creixen | 9 de 15 | 3 de 5 |
| `rules` | A més, no pregunten al model si res no empitjora, i relacionen cada sospitós amb la línia del diff que l'afegeix | 14 de 15 | 5 de 5 |
| `quotes` | A més, escapen les cometes dobles del diff i de la línia relacionada | 15 de 15, en fred | 5 de 5 |

La primera mesura es va fer en calent i amb tres repeticions de cada cas, sobre els fixtures del 10 de novembre. Els fixtures actuals tenen traces nous i el gate d'una altra execució, i en fred n'hi ha prou amb una repetició, perquè totes donen la mateixa resposta.

Pel camí:

- **El JSON es demana amb l'schema com a sortida estructurada.** Amb el JSON descrit només al prompt, `qwen2.5-coder:1.5b` l'embolcallava sempre en un bloc de codi i no es podia processar. Amb l'schema, els quatre models retornen JSON vàlid.
- **La mètrica la decideix la regla.** És on més fallaven els models. A més, `pr/loaf-cart-handler` empitjora dues mètriques per dues causes: l'LCP per un script síncron, `ab.js`, i l'INP per un handler pesat, `recommendFor`. Una sola explicació no les pot cobrir totes dues, així que el Judge en demana una per mètrica.
- **Les mètriques s'ordenen per quantes vegades superen el seu llindar, no per percentatge.** El CLS de la versió base és 0, així que el seu percentatge no existeix.
- **Els models petits ignoren les pistes.** Amb `recommendFor` llistat com a sospitós (80 ms a la candidata, 0 a la base), `llama3.2:3b` continuava culpant `ab.js` de l'INP. I en el refactor, amb la regla dient que res no havia empitjorat, s'inventava una regressió de l'LCP.
- **El que va funcionar va ser que la regla trobés la causa.** `recommendFor` i `ab.js` apareixen literalment a les línies afegides del diff. Quan la regla dona al model el sospitós i la seva línia, el model només ha de redactar.

### Decisió

- **El model del taller és `llama3.2:3b`.** Ollama li assigna 3,3 GB amb un context de 8.192 tokens.
- **Les regles decideixen el veredicte, la mètrica i, quan poden, la causa.**
- **L'LLM l'explica amb l'schema del veredicte.** Quan res no empitjora, el Judge respon sense preguntar-li.

L'última fallada no era de raonament. A la branca del hero, el model copia `loading="lazy"` del diff a la seva resposta sense escapar la cometa, i en el JSON restringit per l'schema aquesta cometa tanca la cadena: la frase es queda en `loading=`. Les regles no li poden donar la causa, perquè treure el preload no afegeix cap tasca al trace, així que el model la busca al diff i copia el codi.

A més, la fallada no sortia sempre. A l'etapa `rules`, només una de les tres repeticions es tallava, amb la mateixa entrada, la temperatura a 0 i la llavor fixa. La diferència era la memòria cau del prompt d'Ollama: la primera crida arriba amb el model acabat de carregar, i les següents reutilitzen el prompt de sistema de l'anterior, que és el mateix. En descarregar el model abans de cada crida, les tres repeticions de cada cas surten idèntiques, i la frase del hero es talla en totes tres: 12 de 15.

Amb les cometes del diff escapades a l'entrada (`loading=\"lazy\"`), el model copia una forma vàlida dins d'una cadena JSON, i en fred anomena la causa en 15 de 15. Escapar a l'entrada no depèn que el model obeeixi una instrucció més del prompt.

Amb els fixtures actuals la frase ja no es talla sense escapar, però tampoc no és bona: diu que es va afegir "l'atribut `loading` a la propietat `fetchPriority`", que ara valdria `'lazy'` en lloc de `'high'`. La puntuació la dona per bona, perquè anomena `lazy`. Amb les cometes escapades, la frase anomena l'atribut `loading="lazy"` de l'`img`.

- **El Judge escapa les cometes dobles del codi que posa al prompt.** El handoff porta la mateixa entrada.
- **Les proves d'un model es fan en fred.** En calent, la mateixa entrada pot donar una altra redacció, i una fallada pot sortir en una repetició i no en una altra. En fred, la imatge `ollama` del taller dona les mateixes respostes que el contenidor del benchmark.

### Comprova-ho

L'experiment és a [`experiments/models`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/models/README.ca.md). Les respostes estan desades, les actuals a `results/` i les de la primera mesura a `history/2026-11-10/` amb els seus fixtures, així que el test comprova aquestes xifres sense necessitar Ollama:

```bash
cd experiments/models
npm install
npm test                          # regles, puntuació i les xifres de cada etapa
STAGE=llm COLD=1 REPS=1 MODES=schema node bench.mjs   # una etapa amb els quatre models, en fred
STAGE=quotes COLD=1 REPS=1 MODES=schema node bench.mjs llama3.2:3b   # l'etapa del Judge
```

La latència depèn molt de la càrrega de la màquina. En calent, a l'etapa `quotes` i amb la màquina en repòs en començar, les 12 crides de `llama3.2:3b` van trigar entre 13,7 i 40,3 segons, amb una mediana de 23,2 s. A l'etapa `rules` de la primera mesura, en un portàtil en ús normal, entre 9 i 37 segons, amb una mediana de 15,8 s. En fred, cada crida inclou carregar el model i la mediana puja a 46-48 s. La càrrega mitjana del host no serveix per vigilar la mesura mentre s'executa: durant cada crida, Ollama fa servir gairebé tots els nuclis de la VM de Docker i la càrrega es dispara. Cal mirar-la abans de començar.

### Com aplicar-ho a la teva plataforma

1. Abans de preguntar a un LLM, pregunta't quina part de la resposta pot calcular el codi. Aquesta part, no la hi demanis.
2. Demana el JSON amb l'schema com a sortida estructurada, no només al prompt. Si el model pot copiar codi amb cometes a la seva resposta, escapa-les a l'entrada.
3. Si res no ha empitjorat, no hi ha res a explicar. No preguntis.
4. Mesura l'encert amb un criteri estricte i amb les respostes desades. Un criteri generós amaga el que el model s'inventa.
5. Mesura en fred, descarregant el model abans de cada crida. Amb la memòria cau del prompt, la temperatura 0 i la llavor fixa no n'hi ha prou per repetir una resposta.

## Arreglar l'eina abans que apedaçar el taller

### Context

Els subagents de CLS i de LoAF/INP i el gate mesuren amb WebPerf Snippets, per MCP i per CLI. En construir-los vam trobar tres forats a l'eina:

- **L'MCP no aplicava throttling ni mesurava interaccions en una crida.** La CLI ja tenia `--cpu`, `--network` i `--interact-script`, però les tools de l'MCP no. Mesurar un clic amb diverses execucions i contra un baseline obligava a obrir una pàgina, interactuar i calcular la mediana a mà.
- **L'execució mediana d'una interacció es triava pel temps de navegació.** Una mesura d'interaccions no té LCP, FCP ni TTFB, així que l'INP de la resposta era el de l'execució amb la navegació mediana, no l'INP medià.
- **Scroll-Performance comptava els listeners de Playwright.** En fer clic, Playwright afegeix listeners de `touchstart`, `touchend` i `touchcancel` a `window`, i el snippet els comptava com a listeners no passius de la pàgina.

Cada forat tenia un pedaç fàcil al codi del taller: un bucle d'`open_page` i `interact` amb la seva pròpia mediana, recalcular l'execució mediana o filtrar els listeners de Playwright al subagent.

### Decisió

Ho vam arreglar a l'eina, en tres pull requests de WebPerf Snippets que van sortir a la 1.14.0:

| PR | Canvi |
|---|---|
| [#404](https://github.com/nucliweb/webperf-snippets/pull/404) | `cpu` i `network` a les tools que mesuren una càrrega, i `interactions` amb `runs` i `baseline` a `run_snippet` i `run_workflow` |
| [#405](https://github.com/nucliweb/webperf-snippets/pull/405) | Sense LCP, FCP ni TTFB, l'execució mediana es tria per INP |
| [#406](https://github.com/nucliweb/webperf-snippets/pull/406) | Scroll-Performance deixa fora els listeners que afegeix Playwright |

- **El taller queda petit.** Cada subagent és una crida a una tool amb els seus arguments, i això és el que escriu qui hi assisteix al pas 3.
- **L'arranjament té el seu test on és l'error.** Cada PR afegeix un test que falla sense el canvi i passa amb ell. Si una versió futura el trenca, falla el test de l'eina, no el taller.
- **N'aprofita qualsevol que faci servir l'eina**, no només aquest taller. Un pedaç al taller hauria deixat l'eina igual per a tots els altres.
- **La versió queda fixada** a les imatges, amb la taula de versions del pla com a referència.

### Comprova-ho

Cada pull request descriu l'error, el canvi i els tests que ho comproven, al repositori de [WebPerf Snippets](https://github.com/nucliweb/webperf-snippets). Al taller, les tools es criden amb aquests arguments a `agents/src/subagents/cls.ts` i `loaf.ts`, i la guia del pas 3 els explica.

### Com aplicar-ho a la teva plataforma

1. Abans d'escriure un pedaç al teu codi, pregunta't si el necessitaria qualsevol que faci servir l'eina. Si és així, el seu lloc és l'eina.
2. Porta l'arranjament amb un test que falli sense ell, al repositori de l'eina.
3. Fixa la versió que l'inclou, i no la canviïs sense tornar a passar els teus tests.
4. Si no pots canviar l'eina, deixa el pedaç aïllat i amb un enllaç a l'issue, per treure'l quan arribi l'arranjament.

## Si vols que un agent atribueixi, conserva els noms

### Context

El Judge atribueix una regressió d'INP o d'LCP a una funció. Compara els resums `tasks` de trace-engine-cli de la versió base i de la branca, es queda amb les funcions noves o que creixen, i en busca el nom a les línies que afegeix el diff. Si el troba, la causa la dona la regla i l'LLM només l'ha de redactar.

El build de producció de la botiga està minificat, i la minificació per defecte de Rolldown reanomena les funcions. trace-engine-cli no llegeix source maps: el nom que dona és el del bundle.

### Què vam provar

Vam construir `main` i `pr/loaf-cart-handler` amb `keepNames` i sense, vam gravar el trace del clic a "Add to cart" de cada costat i vam aplicar les mateixes regles del Judge:

| Build | Sospitós de l'INP | Self time | Línia del diff relacionada |
|---|---|---|---|
| Amb `keepNames` | `recommendFor` | 78 ms | `setRecommended(recommendFor(product.slug));` |
| Sense `keepNames` | `Ae` | 80 ms | Cap |

Sense `keepNames`, les regles continuen veient que una funció nova triga uns 80 ms al clic. El que es perd és el nom: `Ae` no és al diff, així que res no la relaciona amb el canvi que l'afegeix, i l'LLM hauria d'endevinar la causa.

### Decisió

- **El build de la botiga conserva els noms de funció**, amb `keepNames: true` a la sortida de Rolldown (`apps/shop/vite.config.ts`). El bundle continua minificat.
- **Un test ho comprova**: `apps/shop/build.test.mjs` construeix la botiga i busca al bundle els noms de diverses funcions.
- **Vam descartar els source maps.** trace-engine-cli no els llegeix, i resoldre'ls seria un pas més entre el trace i el Judge.

### Comprova-ho

L'experiment és a [`experiments/discarded`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/discarded/README.ca.md). Construeix les dues versions de cada costat, grava els traces i aplica `suspectsFor` i `matchSuspects`, les regles del Judge:

```bash
cd experiments/discarded
npm install
npm test            # comprova el sospitós i la línia relacionada amb keepNames i sense
npm run measure     # imprimeix els sospitosos i les línies del diff que relacionen
```

Els mil·lisegons canvien d'una màquina a una altra; el test comprova que amb `keepNames` el sospitós és `recommendFor` i es relaciona amb la línia que el crida, i que sense `keepNames` no. El test del build és a [`apps/shop/build.test.mjs`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/apps/shop/build.test.mjs).

### Com aplicar-ho a la teva plataforma

1. Si un agent ha de relacionar un perfil amb un diff, el perfil ha de fer servir els noms del diff. Mesura el build que l'agent pot llegir.
2. Conserva els noms en aquest build: `keepNames` a Rolldown i esbuild, `keep_fnames` a Terser.
3. Si no els pots conservar, resol els source maps abans de passar el trace a l'agent, no després.
4. Comprova en un test que el bundle conserva els noms. Una actualització del bundler pot canviar el valor per defecte sense avisar.
