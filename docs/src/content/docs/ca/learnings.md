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

L'experiment és a [`experiments/trace-engine-cli`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/trace-engine-cli). Enregistra un trace nou a la teva màquina i comprova cada afirmació d'aquesta pàgina:

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
- **Chromium no arrenca al contenidor.** Sense privilegis extra no té un sandbox utilitzable i avorta amb `No usable sandbox!`.

### Decisió

Arrenquem el servidor amb aquests flags:

| Flag | Per a què |
|---|---|
| `--no-page-id-routing` | Cada subagent té el seu navegador, així que les tools funcionen sense `pageId` |
| `--workspace=<carpeta>` | Permet desar els traces a la carpeta de sortida. S'afegeix al directori temporal del servidor, no el substitueix |
| `--chromeArg=--no-sandbox` | Només al contenidor, que ja aïlla el procés |
| `--headless`, `--isolated` i `--executablePath` | Sense finestra, amb un perfil temporal i amb el Chromium de Playwright, el mateix que fa servir WebPerf Snippets |
| `--usageStatistics=false` i `--performanceCrux=false` | El gate s'executa sense xarxa |

Vam descartar `--allow-unrestricted-paths`: obre tot el sistema de fitxers i el mateix servidor el marca com a obsolet en favor de `--workspace=/`.

### Comprova-ho

L'experiment és a [`experiments/chrome-devtools-mcp`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/chrome-devtools-mcp). Cada test arrenca un servidor amb uns flags diferents i comprova un d'aquests comportaments:

```bash
cd experiments/chrome-devtools-mcp
npm install
npm test
```

A macOS s'executen els set tests. A Linux se salta el del `TMPDIR`, perquè el client i el servidor comparteixen el directori temporal.

### Com aplicar-ho a la teva plataforma

1. Un MCP pensat per a l'editor porta valors per defecte pensats per a l'editor. Revisa'n els flags abans de posar-lo en un pipeline.
2. No donis per fet que el servidor veu el teu entorn. Amb stdio, passa-li el que necessiti com a flags o com a variables explícites.
3. Escriu un test per cada valor per defecte que canviïs. Si una versió nova el canvia, te n'assabentes abans que el teu pipeline.

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

L'experiment és a [`experiments/models`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/models). Les respostes estan desades, les actuals a `results/` i les de la primera mesura a `history/2026-11-10/` amb els seus fixtures, així que el test comprova aquestes xifres sense necessitar Ollama:

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
