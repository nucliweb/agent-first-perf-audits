---
title: Reptes
description: Quatre reptes per després del pas 5. Arreglar una regressió i veure el gate passar, demanar l'explicació a un altre model, treure el throttling i crear una regressió pròpia.
sidebar:
  order: 17
---

El taller ensenya a detectar una regressió i a explicar-la. Aquests reptes responen quatre preguntes que les guies deixen obertes, per a qui acaba abans al taller guiat o vol continuar després pel seu compte.

| Repte | La pregunta | Què necessita |
|---|---|---|
| [1. Arregla una regressió](#repte-1-arregla-una-regressió-i-mira-passar-el-gate) | Com sé que l'arranjament és complet? | Internet, per construir una botiga |
| [2. Demana l'explicació a un altre model](#repte-2-demana-lexplicació-a-un-altre-model) | Què canvia amb un model més gran? | Un agent o un xat amb un LLM |
| [3. Treu el throttling](#repte-3-treu-el-throttling-i-mira-què-deixa-de-veures) | Per què el gate no mesura a tota velocitat? | Res més |
| [4. Crea la teva pròpia regressió](#repte-4-crea-la-teva-pròpia-regressió) | Què veu el gate, i què no? | Internet, per construir una botiga |

## Abans de començar

Els reptes parteixen del final del [pas 5](../workshop/step-05/): el laboratori aixecat, la teva branca `taller` i la solució del pas 4 aplicada. No tenen comprovació amb `npm run check`. El resultat de cadascun és l'exit code del gate i el seu informe.

Per fer-los sense haver seguit els passos, aquestes ordres deixen el repo en aquest mateix punt:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
git checkout step-04-solution -- agents/src
docker compose up -d
```

Els reptes 2 i 3 comparen amb els informes del pas 5. Si no els tens, llança abans el punt 1 de la seva guia.

Els reptes 1 i 4 canvien la botiga. El gate compara dues imatges de la botiga, i cadascuna es construeix des d'una ref de git, així que provar un canvi són tres coses:

1. **Una branca amb el canvi en un commit.** Es crea en una altra carpeta, amb `git worktree`. La teva carpeta de treball es queda a `taller`, perquè el laboratori executa el codi d'`agents/src` que hi ha: canviar de branca allà canviaria també el gate.
2. **La imatge d'aquesta branca.** La construeix `scripts/build-shop.sh`, amb el nom de la branca com a tag. Fa servir `docker build`, que descarrega la imatge base de Node i les dependències de la botiga: necessita internet.
3. **El gate**, amb aquest tag a `CANDIDATE`.

## Repte 1: arregla una regressió i mira passar el gate

El pas 4 acaba amb una proposta de solució per a `pr/lcp-hero-lazy`, i ningú no la prova. Un arranjament està fet quan el gate passa.

1. Crea una branca des de la de la regressió, en una carpeta al costat del repo:

   ```bash
   git worktree add -b fix-lcp-hero ../fix-lcp-hero origin/pr/lcp-hero-lazy
   ```

2. Arregla el que anomena l'explicació de l'LLM. A `../fix-lcp-hero/apps/shop/src/pages.tsx`, la imatge del hero porta `loading="lazy"`: canvia-ho per `fetchPriority="high"` i desa el canvi en un commit:

   ```bash
   git -C ../fix-lcp-hero commit -am "Load the hero image with high priority"
   ```

3. Construeix la botiga de la teva branca i passa-li el gate:

   ```bash
   scripts/build-shop.sh fix-lcp-hero
   CANDIDATE=fix-lcp-hero docker compose run --rm -e OUT=/out/ci/fix-lcp-hero ci
   echo "exit $?"
   ```

   ```text
   exit 1
   ```

   Continua fallant. Obre `out/ci/fix-lcp-hero/report.md`: l'LCP continua per sobre del seu llindar, i al final, als fets de les regles, hi ha la causa que queda. La branca treu de `lcpImageFor`, a `apps/shop/src/products.ts`, la línia que feia el preload de la imatge del hero.

4. Torna aquesta línia. És la primera de la funció `lcpImageFor`:

   ```ts
   if (pathname === "/") return { href: "/images/hero-1200.webp", srcset: heroSrcSet(), sizes: HERO_SIZES };
   ```

   Un altre commit, la botiga una altra vegada i el gate una altra vegada:

   ```bash
   git -C ../fix-lcp-hero commit -am "Preload the hero image on the home page"
   scripts/build-shop.sh fix-lcp-hero
   CANDIDATE=fix-lcp-hero docker compose run --rm -e OUT=/out/ci/fix-lcp-hero ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   L'informe diu que res no ha empitjorat i ho signen les regles: sense regressió, l'LLM no arriba a ser consultat.

**Què t'emportes.** La regressió tenia dues causes i l'explicació de l'LLM n'anomenava una. L'altra era als fets de les regles, i el que diu que l'arranjament és complet és el gate en verd, no l'explicació.

## Repte 2: demana l'explicació a un altre model

Cada execució del gate deixa un `handoff.md` al costat de l'informe: la mateixa entrada que rep el model local, amb el prompt de sistema, una petició per cada mètrica que empitjora i el schema de la resposta. Amb el perfil `lite` és la manera de tenir l'explicació; amb `llm` serveix per comparar.

1. Obre `out/ci/pr-loaf-cart-handler/handoff.md`, el de la branca que empitjora dues mètriques per dues causes diferents.
2. Passa-li el fitxer sencer a un agent o a un xat amb el model que vulguis. El handoff porta les instruccions: una resposta en JSON per petició.
3. Compara les seves respostes amb la secció "Explanation" d'`out/ci/pr-loaf-cart-handler/report.md`:
   - Anomena el fitxer i el canvi del diff, o parla en general?
   - Dona una causa diferent a cada mètrica, o la mateixa a les dues?
   - Les seves evidències són a l'entrada, o se les ha tret de la màniga?

**Què t'emportes.** El veredicte no canvia, contesti qui contesti: el handoff diu que ja està decidit, i el model només en redacta la causa. Un model més gran relaciona més canvis del diff amb la regressió, i [Learnings](../learnings/#la-mateixa-entrada-a-un-model-més-gran) ho mesura amb la mateixa entrada.

El handoff porta el diff de la branca i els resums dels traces. Aquí són els d'una botiga d'exemple; amb el teu codi, enviar-los a un servei extern és una decisió del teu equip.

## Repte 3: treu el throttling i mira què deixa de veure's

El gate mesura amb la CPU quatre vegades més lenta i amb la xarxa de `fast-4g`. Aquestes condicions decideixen quines regressions es veuen.

1. Les condicions són a `agents/src/judge/gate.ts`:

   ```ts
   export const CONDITIONS = ["--cpu", "4", "--network", "fast-4g", "--runs", "5"];
   ```

   Deixa només les execucions:

   ```ts
   export const CONDITIONS = ["--runs", "5"];
   ```

2. Passa el gate per les tres branques amb regressió, a una altra carpeta d'`out/` per conservar els informes del pas 5:

   ```bash
   for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler; do
     CANDIDATE=$branch docker compose run --rm -e OUT=/out/unthrottled/$branch ci
     echo "$branch: exit $?"
   done
   ```

   Al Mac de referència:

   ```text
   pr-lcp-hero-lazy: exit 0
   pr-cls-promo-banner: exit 1
   pr-loaf-cart-handler: exit 1
   ```

3. Compara cada `out/unthrottled/<branca>/report.md` amb el d'`out/ci/<branca>/`:

   - `pr/lcp-hero-lazy` passa. El canvi de l'LCP ja no supera el seu llindar.
   - `pr/cls-promo-banner` falla igual. Un desplaçament no depèn de la velocitat de la màquina ni de la xarxa.
   - `pr/loaf-cart-handler` continua fallant per l'LCP. El seu INP també és pitjor i l'estadística el veu, però el canvi queda a prop del seu llindar: per sota en un equip ràpid, per sobre en un de més lent.

4. Torna les condicions del taller:

   ```bash
   git checkout step-04-solution -- agents/src/judge/gate.ts
   ```

El teu resultat pot ser un altre: sense throttling, el que es veu depèn de com de ràpid sigui el teu equip.

**Què t'emportes.** Les condicions formen part del gate. Un portàtil de desenvolupament, amb la seva CPU i la seva xarxa, deixa passar regressions que amb la CPU i la xarxa d'un mòbil sí que es veuen. És la fila de les condicions de la taula del [pas 6](../workshop/step-06/#què-canvies).

## Repte 4: crea la teva pròpia regressió

El gate detecta les tres regressions del taller, que estan preparades per a ell. Detecta la teva?

1. Crea una branca des de `main`, en una altra carpeta:

   ```bash
   git worktree add -b my-regression ../my-regression origin/main
   ```

2. Empitjora alguna cosa a `../my-regression/apps/shop`. Per començar, un clàssic. A `index.html`, l'script del xat es carrega amb `defer`:

   ```html
   <script defer src="__THIRDPARTY_ORIGIN__/chat.js?delay=300&cpu=60"></script>
   ```

   Treu-li el `defer`, perquè bloquegi el parser, i desa el canvi en un commit:

   ```bash
   git -C ../my-regression commit -am "Load the chat widget without defer"
   ```

3. La botiga i el gate:

   ```bash
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   Passa, i a l'informe l'LCP no es mou. No és un error del gate: en aquesta pàgina, treure el `defer` no canvia quan es pinta el hero. L'app és un script de tipus mòdul, i un mòdul espera els scripts amb `defer` que té al davant al document. El xat ja anava per davant de l'app amb `defer`, i continua anant-hi sense.

4. Ara fes que es noti. Els tercers del laboratori són mocks, i el que triguen va a la URL: `delay` són els mil·lisegons que triga el servidor a respondre i `cpu`, els que l'script ocupa el fil principal. Torna el `defer` i puja el `delay` a 1500, com si el proveïdor del xat tingués un mal dia:

   ```html
   <script defer src="__THIRDPARTY_ORIGIN__/chat.js?delay=1500&cpu=60"></script>
   ```

   Un altre commit, la botiga i el gate:

   ```bash
   git -C ../my-regression commit -am "Simulate a slow day of the chat provider"
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 1
   ```

   Falla per l'LCP, amb el `defer` posat: l'app espera el xat.

5. Arregla-ho sense tocar el `delay`, que a la vida real no és teu: canvia `defer` per `async`, perquè el xat no guardi torn davant de l'app:

   ```html
   <script async src="__THIRDPARTY_ORIGIN__/chat.js?delay=1500&cpu=60"></script>
   ```

   Un altre commit, la botiga i el gate:

   ```bash
   git -C ../my-regression commit -am "Load the chat widget with async"
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   Passa, i a l'informe l'LCP de la teva branca surt una mica millor que el de `main`: la botiga del taller també espera el xat.

**Què t'emportes.** El gate mesura el que canvia per a qui fa servir la pàgina, no si el codi segueix les bones pràctiques: un canvi que sona malament pot no moure res, i un que sembla innocent pot endarrerir tota l'app. I un límit: en producció, el mal dia del proveïdor arriba sense cap diff teu. Un gate de pull requests no el veu; això ho veuen les mesures de camp, i [Conceptes](../concepts/#laboratori-i-camp) explica la diferència.

Per continuar, tres idees més. No totes fan saltar el gate, i esbrinar per què una no ho fa ensenya tant com veure-la fallar:

- Una imatge sense `width` ni `height` a sobre del contingut de la home.
- Un càlcul llarg al handler d'un botó, per exemple al selector de quantitat de la pàgina de producte.
- Un `cpu` més alt en un dels scripts de tercers.

## Per deixar-ho com estava

Aixeca una altra vegada el laboratori amb la botiga candidata per defecte, i esborra les carpetes, les branques i les imatges dels reptes:

```bash
docker compose up -d
git worktree remove ../fix-lcp-hero
git worktree remove ../my-regression
git branch -D fix-lcp-hero my-regression
docker image rm ghcr.io/nucliweb/agent-first-perf-audits/shop:fix-lcp-hero ghcr.io/nucliweb/agent-first-perf-audits/shop:my-regression
```
