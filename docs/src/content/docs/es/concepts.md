---
title: Conceptos
description: Las métricas que mide el taller, cómo se descomponen y cómo decide el gate si una rama empeora.
sidebar:
  order: 3
---

Lo que conviene tener claro antes del paso 1: qué mide el taller, cómo se descompone cada métrica para saber dónde se va el tiempo, y cómo decide el gate si una rama ha empeorado. Cada apartado enlaza una lectura para ir más lejos; la lista completa está en [Referencias](../references/).

## Tres preguntas, tres métricas

Web Performance es lo que una persona percibe, medido. Las Core Web Vitals lo resumen en tres preguntas:

| Pregunta | Métrica | "Good" hasta |
|---|---|---|
| ¿Cuándo veo lo que vine a ver? | LCP, Largest Contentful Paint: cuándo se pinta el elemento más grande de la pantalla | 2,5 s |
| ¿Se mueve la página mientras la uso? | CLS, Cumulative Layout Shift: cuánto se desplaza el contenido sin que yo lo provoque | 0,1 |
| ¿Reacciona en cuanto toco algo? | INP, Interaction to Next Paint: cuánto tarda la página en pintar la respuesta a una interacción | 200 ms |

Los umbrales son los de Google para el percentil 75 de las visitas reales, y son los que WebPerf Snippets devuelve con cada medida. Ninguno de los tres dice por qué: para eso cada métrica se descompone.

Para leer más: [Web Vitals](https://web.dev/articles/vitals), en web.dev.

## LCP: cuatro fases

El LCP de una imagen es la suma de cuatro tiempos, uno detrás de otro:

| Fase | Qué pasa | Cuándo crece |
|---|---|---|
| TTFB | Hasta que llega el primer byte del HTML | Servidor lento, redirecciones |
| Retraso de carga del recurso | Hasta que el navegador empieza a pedir la imagen | La imagen no está en el HTML, lleva `loading="lazy"` o no tiene preload |
| Tiempo de carga del recurso | Lo que tarda en descargarse | Imagen grande, poca prioridad, red lenta |
| Retraso de render | Desde que llega hasta que se pinta | JavaScript o CSS que bloquean el hilo principal |

Saber qué fase crece dice dónde mirar. En `pr/lcp-hero-lazy` crece el retraso de carga: la imagen pierde el preload y el navegador no sabe que la necesita hasta que ejecuta el JavaScript de la página. En `pr/loaf-cart-handler` crece el retraso de render: un script síncrono ocupa el hilo principal. El mismo número, dos causas y dos arreglos distintos.

Para leer más: [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp).

## CLS: no todos los desplazamientos cuentan

Un desplazamiento cuenta cuando la persona no lo ha provocado: un banner que entra sin espacio reservado, una fuente que cambia de tamaño al cargar. No cuenta el que llega en los 500 ms siguientes a una interacción, como un panel que se abre al hacer click, porque es la respuesta que la persona espera.

El CLS no suma todos los desplazamientos de la visita: los agrupa en ráfagas y se queda con la peor. Y el número no basta para arreglarlo: hace falta saber qué nodos se mueven, que es lo que devuelve el subagente de CLS.

Para leer más: [Cumulative Layout Shift](https://web.dev/articles/cls).

## INP y los long animation frames

Una interacción tiene tres fases:

| Fase | Qué pasa |
|---|---|
| Retraso de entrada | El hilo principal está ocupado con otra cosa y el evento espera |
| Procesamiento | Corren los handlers del evento |
| Retraso de presentación | El navegador calcula estilos y layout y pinta el siguiente frame |

El INP de una página es, aproximadamente, su peor interacción. En el taller hay una sola, el click en "Add to cart", y en `pr/loaf-cart-handler` lo que crece es el procesamiento: el handler calcula recomendaciones antes de dejar pintar.

Los long animation frames (LoAF) son la pista para atribuirlo: el navegador apunta cada frame que tarda más de 50 ms, con los scripts que lo ocupan y quién los invoca. El trace del click baja un nivel más y nombra la función.

Como el procesamiento es JavaScript puro, el INP depende de la velocidad de la CPU en ese momento: la misma rama da más milisegundos en una máquina más lenta o más cargada. Por eso las guías dan sus cifras como ejemplo y el gate compara dos tiendas en la misma máquina.

Para leer más: [Interaction to Next Paint](https://web.dev/articles/inp) y [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames).

## Laboratorio y campo

| | Campo | Laboratorio |
|---|---|---|
| Qué mide | Personas reales, con sus dispositivos y sus redes | Una carga en condiciones fijas |
| Cuándo llega | Días después de publicar | Antes del merge |
| Para qué sirve | Saber qué pasa de verdad | Comparar dos versiones del código |

Un gate de pull request necesita laboratorio. Las condiciones del taller son siempre las mismas: CPU 4x (cuatro veces más lenta), la red Fast 4G de DevTools (8,1 Mbps de bajada, 1,35 Mbps de subida y 165 ms de latencia) y varias ejecuciones de cada medida, `--runs 5` en el gate.

El throttling de red no es un adorno: sin él, la prioridad de descarga de una imagen apenas pesa y la regresión de `pr/lcp-hero-lazy` no se ve. Los datos están en [Por qué este stack](../stack/).

Para leer más: [Why lab and field data can be different](https://web.dev/articles/lab-and-field-data-differences).

## Comparar con el baseline, no con el umbral

Las tres regresiones del taller dejan sus métricas dentro de "good". Un gate que solo mirase los umbrales de Google las dejaría pasar las tres, y la página iría empeorando merge a merge hasta cruzar el umbral sin que ningún cambio concreto tuviera la culpa.

Por eso el gate compara cada rama con su versión base: la tienda de `main` (el baseline) y la de la rama (el candidate), medidas en la misma máquina y en la misma ejecución. Así la diferencia entre portátiles no cuenta: un portátil lento mide las dos tiendas igual de lentas.

## Cómo decide el gate

Una métrica empeora cuando cumple dos condiciones a la vez:

1. **El cambio es grande.** La mediana de la rama supera a la del baseline en más que su umbral: el mayor entre el 10 % y 100 ms para el LCP, el mayor entre el 10 % y 50 ms para el INP, y 0,05 para el CLS.
2. **El cambio no es ruido.** Un test estadístico, Mann-Whitney U, da p < 0,05.

Si alguna métrica de algún escenario empeora, la CLI sale con 1 y el gate falla. Ningún modelo interviene en esa decisión.

<img src="/diagrams/gate.svg" alt="El gate mide el baseline y la rama; si el cambio supera el umbral y p es menor que 0,05, sale con 1, trace-engine-cli atribuye el cambio y el LLM lo explica; si no, sale con 0" width="1040" height="340" loading="lazy" decoding="async">

### Qué es p, sin fórmulas

Dos medidas de la misma página nunca dan lo mismo. Mann-Whitney U no mira los milisegundos, sino el orden: pone en fila todas las ejecuciones de los dos lados, de la más rápida a la más lenta, y mira cuánto se mezclan. Si todas las de la rama quedan detrás de todas las del baseline, es muy difícil que sea casualidad. Si se mezclan, puede ser ruido.

p es esa probabilidad: la de ver un orden así de separado si en realidad las dos tiendas fueran igual de rápidas. Por debajo de 0,05, el gate lo da por un cambio real.

### Por qué importa cuántas veces se mide

Con pocas ejecuciones, el orden tiene pocas combinaciones posibles y una sola ejecución fuera de sitio cambia el resultado. Imagina una regresión clara, en la que la rama es siempre más lenta que el baseline. Esta tabla es el p que da el gate según cuántas ejecuciones del baseline salgan, por mala suerte, más lentas que todas las de la rama, por ejemplo porque la máquina hizo otra cosa en ese momento:

| Ejecuciones por lado | Ninguna del baseline lenta | Una lenta | Dos lentas |
|---|---|---|---|
| 5 | 0,004 | 0,0754 | 0,3452 |
| 7 | 0,0003 | 0,0131 | 0,1043 |
| 9 | < 0,0001 | 0,002 | 0,0252 |

Con 5 ejecuciones por lado, una sola ejecución lenta del baseline deja p en 0,0754, por encima de 0,05, y el gate da la rama por buena aunque su LCP haya subido un 50 %. No es una hipótesis: pasó una vez con `pr/lcp-hero-lazy` mientras preparábamos el taller.

La lección vale para cualquier gate: las reglas son deterministas, pero las muestras no. Si tu gate te da un pass que no esperas, mira el informe antes de fiarte: un cambio grande con un p que no llega no es "sin cambios", es "no concluyente", y lo que toca es medir otra vez o medir más. El experimento [`gate-stability`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/gate-stability/README.es.md) mide cuántas veces acierta el gate con cada número de ejecuciones.

Para leer más: [Mann-Whitney U test](https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test) y la [variabilidad de las medidas de laboratorio](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md), en la documentación de Lighthouse.

## Quién hace qué

| Paso | Quién | Con qué |
|---|---|---|
| Medir | Los subagentes y el gate | WebPerf Snippets, por MCP o por su CLI |
| Decidir | Las reglas | El umbral y el test estadístico de la CLI, y su exit code |
| Atribuir | Las reglas | trace-engine-cli nombra la función, la URL y la línea |
| Explicar | Un LLM | Recibe el veredicto, las métricas, los resúmenes de los traces y el diff, y escribe la causa en una frase |

Los subagentes no son modelos: son código que llama a herramientas MCP con argumentos fijos. El único modelo del taller explica, y cuando contradice a las reglas, ganan las reglas. Por qué está repartido así lo cuenta [Learnings](../learnings/#el-llm-explica-las-reglas-deciden).
