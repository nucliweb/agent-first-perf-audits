---
title: Retos
description: Cuatro retos para después del paso 5. Arreglar una regresión y ver el gate pasar, pedir la explicación a otro modelo, quitar el throttling y crear una regresión propia.
sidebar:
  order: 17
---

El taller enseña a detectar una regresión y a explicarla. Estos retos responden a cuatro preguntas que las guías dejan abiertas, para quien acaba antes en el taller guiado o quiere seguir después por su cuenta.

| Reto | La pregunta | Qué necesita |
|---|---|---|
| [1. Arregla una regresión](#reto-1-arregla-una-regresión-y-mira-el-gate-pasar) | ¿Cómo sé que el arreglo está completo? | Internet, para construir una tienda |
| [2. Pide la explicación a otro modelo](#reto-2-pide-la-explicación-a-otro-modelo) | ¿Qué cambia con un modelo más grande? | Un agente o un chat con un LLM |
| [3. Quita el throttling](#reto-3-quita-el-throttling-y-mira-qué-deja-de-verse) | ¿Por qué el gate no mide a toda velocidad? | Nada más |
| [4. Crea tu propia regresión](#reto-4-crea-tu-propia-regresión) | ¿Qué ve el gate, y qué no? | Internet, para construir una tienda |

## Antes de empezar

Los retos parten del final del [paso 5](../workshop/step-05/): el laboratorio levantado, tu rama `taller` y la solución del paso 4 aplicada. No tienen comprobación con `npm run check`. El resultado de cada uno es el exit code del gate y su informe.

Para hacerlos sin haber seguido los pasos, estos comandos dejan el repo en ese mismo punto:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
git checkout step-04-solution -- agents/src
docker compose up -d
```

Los retos 2 y 3 comparan con los informes del paso 5. Si no los tienes, lanza antes el punto 1 de su guía.

Los retos 1 y 4 cambian la tienda. El gate compara dos imágenes de la tienda, y cada una se construye desde una ref de git, así que probar un cambio son tres cosas:

1. **Una rama con el cambio en un commit.** Se crea en otra carpeta, con `git worktree`. Tu carpeta de trabajo se queda en `taller`, porque el laboratorio ejecuta el código de `agents/src` que hay en ella: cambiar de rama ahí cambiaría también el gate.
2. **La imagen de esa rama.** La construye `scripts/build-shop.sh`, con el nombre de la rama como tag. Usa `docker build`, que descarga la imagen base de Node y las dependencias de la tienda: necesita internet.
3. **El gate**, con ese tag en `CANDIDATE`.

## Reto 1: arregla una regresión y mira el gate pasar

El paso 4 termina con una propuesta de solución para `pr/lcp-hero-lazy`, y nadie la prueba. Un arreglo está hecho cuando el gate pasa.

1. Crea una rama desde la de la regresión, en una carpeta al lado del repo:

   ```bash
   git worktree add -b fix-lcp-hero ../fix-lcp-hero origin/pr/lcp-hero-lazy
   ```

2. Arregla lo que nombra la explicación del LLM. En `../fix-lcp-hero/apps/shop/src/pages.tsx`, la imagen del hero lleva `loading="lazy"`: cámbialo por `fetchPriority="high"` y guarda el cambio en un commit:

   ```bash
   git -C ../fix-lcp-hero commit -am "Load the hero image with high priority"
   ```

3. Construye la tienda de tu rama y pásale el gate:

   ```bash
   scripts/build-shop.sh fix-lcp-hero
   CANDIDATE=fix-lcp-hero docker compose run --rm -e OUT=/out/ci/fix-lcp-hero ci
   echo "exit $?"
   ```

   ```text
   exit 1
   ```

   Sigue fallando. Abre `out/ci/fix-lcp-hero/report.md`: el LCP sigue por encima de su umbral, y al final, en los hechos de las reglas, está la causa que queda. La rama quita de `lcpImageFor`, en `apps/shop/src/products.ts`, la línea que hacía el preload de la imagen del hero.

4. Devuelve esa línea. Es la primera de la función `lcpImageFor`:

   ```ts
   if (pathname === "/") return { href: "/images/hero-1200.webp", srcset: heroSrcSet(), sizes: HERO_SIZES };
   ```

   Otro commit, la tienda otra vez y el gate otra vez:

   ```bash
   git -C ../fix-lcp-hero commit -am "Preload the hero image on the home page"
   scripts/build-shop.sh fix-lcp-hero
   CANDIDATE=fix-lcp-hero docker compose run --rm -e OUT=/out/ci/fix-lcp-hero ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   El informe dice que nada ha empeorado y lo firman las reglas: sin regresión, el LLM no llega a ser consultado.

**Qué te llevas.** La regresión tenía dos causas y la explicación del LLM nombraba una. La otra estaba en los hechos de las reglas, y lo que dice que el arreglo está completo es el gate en verde, no la explicación.

## Reto 2: pide la explicación a otro modelo

Cada ejecución del gate deja un `handoff.md` junto al informe: la misma entrada que recibe el modelo local, con el prompt de sistema, una petición por cada métrica que empeora y el schema de la respuesta. Con el perfil `lite` es la forma de tener la explicación; con `llm` sirve para comparar.

1. Abre `out/ci/pr-loaf-cart-handler/handoff.md`, el de la rama que empeora dos métricas por dos causas distintas.
2. Pásale el fichero entero a un agente o a un chat con el modelo que quieras. El handoff lleva las instrucciones: una respuesta en JSON por petición.
3. Compara sus respuestas con la sección "Explanation" de `out/ci/pr-loaf-cart-handler/report.md`:
   - ¿Nombra el fichero y el cambio del diff, o habla en general?
   - ¿Da una causa distinta a cada métrica, o la misma a las dos?
   - ¿Sus evidencias están en la entrada, o las ha puesto de su cosecha?

**Qué te llevas.** El veredicto no cambia, conteste quien conteste: el handoff dice que ya está decidido, y el modelo solo redacta la causa. Un modelo más grande relaciona más cambios del diff con la regresión, y [Learnings](../learnings/#la-misma-entrada-a-un-modelo-más-grande) lo mide con la misma entrada.

El handoff lleva el diff de la rama y los resúmenes de los traces. Aquí son los de una tienda de ejemplo; con tu código, enviarlos a un servicio externo es una decisión de tu equipo.

## Reto 3: quita el throttling y mira qué deja de verse

El gate mide con la CPU cuatro veces más lenta y con la red de `fast-4g`. Esas condiciones deciden qué regresiones se ven.

1. Las condiciones están en `agents/src/judge/gate.ts`:

   ```ts
   export const CONDITIONS = ["--cpu", "4", "--network", "fast-4g", "--runs", "5"];
   ```

   Deja solo las ejecuciones:

   ```ts
   export const CONDITIONS = ["--runs", "5"];
   ```

2. Pasa el gate por las tres ramas con regresión, a otra carpeta de `out/` para conservar los informes del paso 5:

   ```bash
   for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler; do
     CANDIDATE=$branch docker compose run --rm -e OUT=/out/unthrottled/$branch ci
     echo "$branch: exit $?"
   done
   ```

   En el Mac de referencia:

   ```text
   pr-lcp-hero-lazy: exit 0
   pr-cls-promo-banner: exit 1
   pr-loaf-cart-handler: exit 1
   ```

3. Compara cada `out/unthrottled/<rama>/report.md` con el de `out/ci/<rama>/`:

   - `pr/lcp-hero-lazy` pasa. El cambio del LCP ya no supera su umbral.
   - `pr/cls-promo-banner` falla igual. Un desplazamiento no depende de la velocidad de la máquina ni de la red.
   - `pr/loaf-cart-handler` sigue fallando por el LCP. Su INP también es peor y la estadística lo ve, pero el cambio queda cerca de su umbral: por debajo en un equipo rápido, por encima en uno más lento.

4. Devuelve las condiciones del taller:

   ```bash
   git checkout step-04-solution -- agents/src/judge/gate.ts
   ```

Tu resultado puede ser otro: sin throttling, lo que se ve depende de lo rápido que sea tu equipo.

**Qué te llevas.** Las condiciones forman parte del gate. Un portátil de desarrollo, con su CPU y su red, deja pasar regresiones que con la CPU y la red de un móvil sí se ven. Es la fila de las condiciones de la tabla del [paso 6](../workshop/step-06/#qué-cambias).

## Reto 4: crea tu propia regresión

El gate detecta las tres regresiones del taller, que están preparadas para él. ¿Detecta la tuya?

1. Crea una rama desde `main`, en otra carpeta:

   ```bash
   git worktree add -b my-regression ../my-regression origin/main
   ```

2. Empeora algo en `../my-regression/apps/shop`. Para empezar, un clásico. En `index.html`, el script del chat se carga con `defer`:

   ```html
   <script defer src="__THIRDPARTY_ORIGIN__/chat.js?delay=300&cpu=60"></script>
   ```

   Quítale el `defer`, para que bloquee el parser, y guarda el cambio en un commit:

   ```bash
   git -C ../my-regression commit -am "Load the chat widget without defer"
   ```

3. La tienda y el gate:

   ```bash
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   Pasa, y en el informe el LCP no se mueve. No es un fallo del gate: en esta página, quitar el `defer` no cambia cuándo se pinta el hero. La app es un script de tipo módulo, y un módulo espera a los scripts con `defer` que tiene delante en el documento. El chat ya iba por delante de la app con `defer`, y sigue yendo por delante sin él.

4. Ahora haz que se note. Los terceros del laboratorio son mocks, y lo que tardan va en la URL: `delay` son los milisegundos que tarda el servidor en responder y `cpu`, los que el script ocupa el hilo principal. Devuelve el `defer` y sube el `delay` a 1500, como si el proveedor del chat tuviera un mal día:

   ```html
   <script defer src="__THIRDPARTY_ORIGIN__/chat.js?delay=1500&cpu=60"></script>
   ```

   Otro commit, la tienda y el gate:

   ```bash
   git -C ../my-regression commit -am "Simulate a slow day of the chat provider"
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 1
   ```

   Falla por el LCP, con el `defer` puesto: la app espera al chat.

5. Arréglalo sin tocar el `delay`, que en la vida real no es tuyo: cambia `defer` por `async`, para que el chat no guarde turno delante de la app:

   ```html
   <script async src="__THIRDPARTY_ORIGIN__/chat.js?delay=1500&cpu=60"></script>
   ```

   Otro commit, la tienda y el gate:

   ```bash
   git -C ../my-regression commit -am "Load the chat widget with async"
   scripts/build-shop.sh my-regression
   CANDIDATE=my-regression docker compose run --rm -e OUT=/out/ci/my-regression ci
   echo "exit $?"
   ```

   ```text
   exit 0
   ```

   Pasa, y en el informe el LCP de tu rama sale algo mejor que el de `main`: la tienda del taller también espera al chat.

**Qué te llevas.** El gate mide lo que cambia para quien usa la página, no si el código sigue las buenas prácticas: un cambio que suena mal puede no mover nada, y uno que parece inocente puede retrasar toda la app. Y un límite: en producción, el mal día del proveedor llega sin ningún diff tuyo. Un gate de pull requests no lo ve; eso lo ven las medidas de campo, y [Conceptos](../concepts/#laboratorio-y-campo) explica la diferencia.

Para seguir, tres ideas más. No todas hacen saltar el gate, y averiguar por qué una no lo hace enseña tanto como verlo fallar:

- Una imagen sin `width` ni `height` encima del contenido de la home.
- Un cálculo largo en el handler de un botón, por ejemplo en el selector de cantidad de la página de producto.
- Un `cpu` más alto en uno de los scripts de terceros.

## Para dejarlo como estaba

Levanta otra vez el laboratorio con la tienda candidata por defecto, y borra las carpetas, las ramas y las imágenes de los retos:

```bash
docker compose up -d
git worktree remove ../fix-lcp-hero
git worktree remove ../my-regression
git branch -D fix-lcp-hero my-regression
docker image rm ghcr.io/nucliweb/agent-first-perf-audits/shop:fix-lcp-hero ghcr.io/nucliweb/agent-first-perf-audits/shop:my-regression
```
