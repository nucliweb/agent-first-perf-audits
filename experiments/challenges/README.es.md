# Experimento: los retos del taller

[English](README.md) · Castellano · [Català](README.ca.md)

Ejecuta los [retos](../../docs/src/content/docs/es/challenges.md) del taller tal como los escribe su página y guarda qué da el gate en cada uno.

## Por qué

La página de los retos dice qué sale después de cada cambio: "sigue fallando", "pasa", "falla solo por el LCP". Son veredictos, y un veredicto escrito a mano en una guía deja de ser cierto el día que cambia la tienda, el gate o la CLI. Este experimento los ata a una ejecución guardada.

## Qué hace

1. Clona el repo en limpio y ejecuta en orden los bloques `bash` de la página de los retos en castellano, con el [arnés del ensayo](../rehearsal/README.es.md).
2. Hace los cambios que la página pide hacer a mano, cada uno justo antes del comando que lo sigue. Están en `EDITS`, en [`run.mjs`](run.mjs), con su fichero, el texto que busca y el que deja. Si el fichero no tiene ese texto exactamente una vez, el experimento se para: la tienda ha cambiado, y la página tiene que cambiar con ella.
3. Después de cada gate lee su `report.json` y guarda en `results.json` el veredicto, las condiciones, cada métrica con su p y su veredicto, y los hechos de las reglas. El texto de la explicación del modelo no se guarda: ninguna afirmación de la página depende de él.
4. Al terminar, los últimos comandos de la página borran las carpetas, las ramas y las imágenes de los retos, y el experimento para el laboratorio del clon.

El reto 2, pedir la explicación a otro modelo, no tiene comandos ni veredicto que comprobar.

## Los cambios

| Cambio | Reto | Fichero | Qué cambia |
|---|---|---|---|
| `fix-attribute` | 1 | `apps/shop/src/pages.tsx`, en la rama del arreglo | `loading="lazy"` por `fetchPriority="high"` en la imagen del hero |
| `fix-preload` | 1 | `apps/shop/src/products.ts`, en la rama del arreglo | `lcpImageFor` recupera la línea del preload del hero |
| `unthrottled` | 3 | `agents/src/judge/gate.ts` | Las condiciones del gate se quedan en `--runs 5` |
| `no-defer` | 4 | `apps/shop/index.html`, en la rama de la regresión | El script del chat pierde el `defer` |
| `slow-defer` | 4 | `apps/shop/index.html`, en la rama de la regresión | Vuelve el `defer`, y el `delay` del chat sube a 1500 |
| `slow-async` | 4 | `apps/shop/index.html`, en la rama de la regresión | `async` en lugar de `defer` |

## Requisitos

Los del taller, que comprueba `scripts/preflight.sh`, y Node 22.18 o superior, git y bash. No tiene dependencias de npm.

Construye imágenes de la tienda, así que necesita internet. Y mide: en la máquina de referencia no corre nada más a la vez, y el laboratorio del repo de trabajo tiene que estar parado, porque el del clon se llama igual.

## Uso

```bash
node run.mjs --dry-run     # lista los comandos de la página, con el cambio que va antes de cada uno
node run.mjs               # desde un clon de este repo en main
npm test                   # los tests del experimento y las comprobaciones sobre results.json
```

`--source` acepta una ruta o una URL de git, `--ref` una rama, un tag o un commit, `--dir` escoge la carpeta del clon y `--timeout` da los minutos de espera por comando.

## Qué comprueban los tests

`npm test` pasa los tests del experimento (qué cambio va antes de qué comando, cómo se aplica y de dónde se leen los informes) y `claims.test.mjs`, que comprueba sobre `results.json` que:

1. Los comandos ejecutados son los que la página escribe hoy. Si la página cambia sus comandos, hay que repetir la ejecución.
2. Todos los comandos terminan bien, y la salida de cada uno tiene las líneas que enseña la página, entre ellas el exit code de cada gate.
3. Reto 1: con el atributo arreglado, el LCP de la home sigue empeorando y un hecho de las reglas nombra `lcpImageFor`. Con el preload de vuelta, el gate pasa y la respuesta es de las reglas.
4. Reto 3: sin throttling, `pr/lcp-hero-lazy` pasa, `pr/cls-promo-banner` falla por el CLS y `pr/loaf-cart-handler` falla por el LCP, con un INP peor y significativo. Que ese INP supere o no su umbral depende de la velocidad de la máquina, y no se comprueba.
5. Reto 4: sin `defer` el gate pasa y el LCP no cambia; con el chat lento y `defer`, falla por el LCP; con `async`, pasa y el LCP de la rama es menor que el de `main`.
6. La página enseña, en los tres idiomas, las líneas que el experimento cambia.

Sin `results.json`, las comprobaciones sobre la ejecución se saltan y lo dicen.

## Resultados en el Mac de referencia

Una ejecución en un Apple Silicon de 16 GB, con el perfil `llm` y las imágenes del taller ya descargadas:

| Reto | Cambio | Rama | Gate | Métricas que empeoran |
|---|---|---|---|---|
| 1 | `fix-attribute` | `fix-lcp-hero` | exit 1 | home: LCP |
| 1 | `fix-preload` | `fix-lcp-hero` | exit 0 | Ninguna |
| 3 | `unthrottled` | `pr/lcp-hero-lazy` | exit 0 | Ninguna |
| 3 | `unthrottled` | `pr/cls-promo-banner` | exit 1 | home: CLS, add-to-cart: CLS |
| 3 | `unthrottled` | `pr/loaf-cart-handler` | exit 1 | home: LCP |
| 4 | `no-defer` | `my-regression` | exit 0 | Ninguna |
| 4 | `slow-defer` | `my-regression` | exit 1 | home: LCP |
| 4 | `slow-async` | `my-regression` | exit 0 | Ninguna |

Cada fila es un gate. Los cambios de un mismo reto se acumulan: `fix-preload` va encima de `fix-attribute`, y `slow-async` encima de los otros dos.

Las cifras de cada informe están en [`results.json`](results.json). Cambian de una ejecución a otra y de una máquina a otra; lo que las comprobaciones atan a la página son los veredictos.
