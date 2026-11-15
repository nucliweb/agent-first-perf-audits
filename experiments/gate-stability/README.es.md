# Experimento: fiabilidad del gate

[English](README.md) · Castellano · [Català](README.ca.md)

Mide cuántas veces acierta el gate del taller en cada rama, según cuántas ejecuciones hace por lado y qué hace cuando un cambio supera su umbral y la estadística no lo separa del ruido.

## Por qué

El gate mide el baseline y la rama con `--runs 5`, y la CLI de WebPerf Snippets solo da una regresión por buena cuando supera su umbral y el test de Mann-Whitney U da p < 0,05. Con 5 ejecuciones por lado, una sola ejecución lenta del baseline deja p en 0,0754, y una regresión del 50 % pasa el gate. Esta tabla es el p-value de la CLI cuando todas las ejecuciones de la rama son más lentas que las del baseline, menos algunas del baseline que son más lentas que todas:

| Ejecuciones por lado | Ninguna lenta | Una lenta | Dos lentas |
|---|---|---|---|
| 5 | 0,004 | 0,0754 | 0,3452 |
| 7 | 0,0003 | 0,0131 | 0,1043 |
| 9 | < 0,0001 | 0,002 | 0,0252 |

Cinco ejecuciones no toleran ninguna; 6, 7 y 8 toleran una, y 9, que es el máximo de la CLI, dos.

## Qué hace

1. `collect.mjs` mide ejecuciones sueltas (`--runs 1`, con el throttling del gate) de la tienda de `main` y de cada rama `pr/*`, dentro del laboratorio del repo y con un solo Chromium a la vez. En cada ronda mide cada escenario en dos órdenes:
   - `adjacent`: todas las de `main` y después todas las de una rama, como hace el gate.
   - `interleaved`: `main`, cada rama, y vuelta a empezar.
2. Guarda cada ejecución en `results/<etiqueta>.json`, con el `benchmarkIndex` de la máquina en ese momento. Con `--load`, el servicio `ollama` del laboratorio genera texto mientras se mide.
3. `policies.mjs` decide sobre esas ejecuciones con el código de la propia CLI (`summarizeRuns` y `compareRun`), así que cada política da lo que habría dicho el gate con ellas: 5, 7 o 9 ejecuciones fijas, o 5 y hasta 9 solo cuando el resultado no es concluyente.
4. `report.mjs` imprime, por rama, escenario y orden, cuántas rondas falla cada política, cuántas quedan sin concluir y cuántas ejecuciones por lado gasta.

`home` mide las cuatro ramas; `add-to-cart`, las dos que lo cambian: `pr/loaf-cart-handler` y `pr/noop-refactor`.

## La regla para escoger

Escrita antes de medir. Se queda la política más barata que cumpla las cuatro condiciones:

1. Con la máquina en reposo, falla en todas las rondas de cada rama con regresión.
2. Con `ollama` generando al lado, falla al menos en el 90 % de esas rondas.
3. No falla en ninguna ronda de `pr/noop-refactor`, en reposo ni con carga.
4. El paso 5 del taller, con el gate en las ramas que se lanzan en directo, cabe en su hueco de la agenda.

## Resultados en el Mac de referencia

Dos noches de medida en un Apple Silicon de 16 GB, con 8 GB para la máquina virtual de Docker: 25 rondas con la máquina en reposo (4.500 ejecuciones) y 20 con `ollama` generando (3.600). Las regresiones son las rondas de `pr/lcp-hero-lazy`, `pr/cls-promo-banner` y `pr/loaf-cart-handler` en el escenario de su métrica; el control, las de `pr/noop-refactor` en los dos escenarios.

### En reposo

| Orden | Ejecuciones por lado | Regresiones que se escapan | Veces que falla el control | Ejecuciones de media |
|---|---|---|---|---|
| Adyacente | 5 | 1 de 75 | 0 de 50 | 5,00 |
| Adyacente | 7 | 0 de 75 | 0 de 50 | 7,00 |
| Adyacente | 9 | 0 de 75 | 0 de 50 | 9,00 |
| Adyacente | 5, y 7 si no es concluyente | 0 de 75 | 0 de 50 | 5,03 |
| Adyacente | 5, y 9 si no es concluyente | 0 de 75 | 0 de 50 | 5,06 |
| Intercalado | 5 | 1 de 75 | 0 de 50 | 5,00 |
| Intercalado | 7 | 0 de 75 | 0 de 50 | 7,00 |
| Intercalado | 9 | 0 de 75 | 0 de 50 | 9,00 |
| Intercalado | 5, y 7 si no es concluyente | 0 de 75 | 0 de 50 | 5,03 |
| Intercalado | 5, y 9 si no es concluyente | 0 de 75 | 0 de 50 | 5,06 |

### Con ollama generando

| Orden | Ejecuciones por lado | Regresiones que se escapan | Veces que falla el control | Ejecuciones de media |
|---|---|---|---|---|
| Adyacente | 5 | 4 de 60 | 3 de 40 | 5,00 |
| Adyacente | 7 | 1 de 60 | 3 de 40 | 7,00 |
| Adyacente | 9 | 0 de 60 | 4 de 40 | 9,00 |
| Adyacente | 5, y 7 si no es concluyente | 1 de 60 | 3 de 40 | 5,10 |
| Adyacente | 5, y 9 si no es concluyente | 0 de 60 | 3 de 40 | 5,20 |
| Intercalado | 5 | 2 de 60 | 0 de 40 | 5,00 |
| Intercalado | 7 | 2 de 60 | 0 de 40 | 7,00 |
| Intercalado | 9 | 0 de 60 | 1 de 40 | 9,00 |
| Intercalado | 5, y 7 si no es concluyente | 2 de 60 | 0 de 40 | 5,08 |
| Intercalado | 5, y 9 si no es concluyente | 0 de 60 | 1 de 40 | 5,16 |

Con `ollama` generando, la mediana del `benchmarkIndex` de las ejecuciones baja de 2154 a 1059: la máquina va a la mitad de velocidad.

## Qué dicen los datos

- **El gate de 5 ejecuciones por lado deja escapar regresiones.** En reposo, 1 de 75, el INP de `pr/loaf-cart-handler`. Con carga, 4 de 60, y 3 de ellas son el LCP de `pr/lcp-hero-lazy`: 3 de sus 20 rondas, el pass que nos encontramos preparando el taller.
- **Ampliar solo cuando no es concluyente las recupera casi gratis.** Con 5 ejecuciones y hasta 7 o 9 cuando el cambio supera el umbral y p no llega, en reposo no se escapa ninguna, y la media no pasa de 5,2 ejecuciones por lado.
- **Con carga, medir primero todo el baseline hace fallar al control**, 3 o 4 veces de 40 con cualquier política. Más ejecuciones no lo arreglan, porque no es ruido de muestreo: la máquina cambia de velocidad entre el bloque del baseline y el de la rama, y el test lo ve como un cambio real. Intercalando las ejecuciones de los dos lados, el control falla 0 o 1 veces de 40.
- **La política que cumple la regla es intercalar, con 5 ejecuciones por lado y 7 cuando no es concluyente.** Es la más barata sin ningún fallo en reposo, con menos de un 10 % de regresiones escapadas con carga y sin ningún fallo del control.
- **Lo que estos datos no separan.** Con 20 o 25 rondas, 0 de 40 y 1 de 40 son indistinguibles: los datos separan bien el orden adyacente del intercalado y las 5 ejecuciones fijas de ampliar, pero no ampliar hasta 7 de ampliar hasta 9.

## Requisitos

- Node 22.18 o superior, y Docker con las imágenes del taller ya descargadas (`scripts/preflight.sh`).
- El laboratorio sin medidas en marcha: `collect.mjs` se niega a empezar si hay un contenedor de `ci` o de `agents` trabajando.
- La máquina sola durante la medida.

## Uso

```bash
npm install
npm test                                              # las políticas, el plan de una ronda y la tabla
node collect.mjs --label idle --rounds 25             # unos 18 minutos por ronda
node collect.mjs --label loaded --rounds 20 --load    # con ollama generando mientras mide
node report.mjs idle                                  # la tabla de cada política
node report.mjs idle --policies 5,7,9,5-7,5-9 --summary # el resumen de la noche, por orden y política
```

Una medida interrumpida conserva sus rondas: el mismo comando con `--resume` sigue donde se quedó.

## Qué comprueban los tests

- Las políticas deciden como la CLI: una regresión clara falla con 5 ejecuciones, una ejecución lenta del baseline la esconde con 5 y no con 7, y una diferencia significativa por debajo de su umbral pasa.
- La tabla de tolerancia de arriba.
- El orden de las medidas de una ronda, qué guarda de cada ejecución, cómo se reanuda y la tabla del informe.

## Versiones

`webperf-snippets` 1.15.0, fijada en [`package.json`](package.json) a propósito: es la medida que llevó a la política del gate. La CLI implementa esa política desde la 1.17.0 (`--baseline` con una URL y `--max-runs`), que es la que usa el gate. Las condiciones y los escenarios son los del gate, de [`agents/src/judge/gate.ts`](../../agents/src/judge/gate.ts).
