---
title: Glosario
description: Los términos que usan las guías del taller, cada uno en una o dos líneas.
sidebar:
  order: 92
---

Los términos que aparecen en las guías, por orden alfabético. Los de las métricas se explican con más calma en [Conceptos](../concepts/).

## Métricas

| Término | Qué es |
|---|---|
| CLS | Cumulative Layout Shift. Cuánto se desplaza el contenido sin que la persona lo provoque. Es una puntuación sin unidad; "good" hasta 0,1 |
| Core Web Vitals | Las tres métricas con las que Google resume la experiencia de una página: LCP, CLS e INP |
| Fases del LCP | Los cuatro tiempos que suman el LCP: TTFB, retraso de carga del recurso, tiempo de carga del recurso y retraso de render. En el código, `subparts` |
| INP | Interaction to Next Paint. Cuánto tarda la página en pintar la respuesta a una interacción; "good" hasta 200 ms |
| LCP | Largest Contentful Paint. Cuándo se pinta el elemento más grande de la pantalla; "good" hasta 2,5 s |
| LoAF | Long Animation Frame. Un frame que tarda más de 50 ms en pintarse, con los scripts que lo ocupan y quién los invoca |
| TTFB | Time to First Byte. Lo que tarda en llegar el primer byte del HTML |

## Medir

| Término | Qué es |
|---|---|
| Baseline | La versión con la que se compara: en el taller, la tienda de `main` |
| Campo | Las medidas de personas reales, con sus dispositivos y sus redes |
| Candidate | La versión que se evalúa: la tienda de la rama de la pull request |
| Escenario | Lo que mide el gate en una página: `home` es la carga de la portada y `add-to-cart`, la ficha de un producto con un click |
| `fast-4g` | La red simulada del taller, la Fast 4G de DevTools |
| Laboratorio | Una medida en condiciones fijas y repetibles. También, los servicios de Docker Compose del taller |
| Recorrido | Un journey: una página y los pasos de interacción que se hacen en ella (`click`, `type`, `scroll`), escritos en un JSON de `agents/journeys/` |
| Throttling | Frenar a propósito la CPU y la red para que la medida se parezca a un móvil de gama media y no a tu portátil |
| Trace | La grabación de todo lo que hace el navegador durante una carga o un click. Es el fichero que abre el panel Performance de DevTools |

## Decidir

| Término | Qué es |
|---|---|
| Exit code | El número con el que termina un comando. El del gate es el veredicto: 0 si pasa, 1 si falla y 2 si no ha podido medir |
| Gate | El control que decide si una pull request puede seguir. El del taller compara la rama con `main` y falla si alguna métrica empeora |
| Mann-Whitney U | El test estadístico del gate. Mira el orden de las ejecuciones de los dos lados, no sus milisegundos, y dice si la diferencia puede ser ruido |
| p | La probabilidad de ver una diferencia así si las dos versiones fueran igual de rápidas. Por debajo de 0,05, el gate la da por real |
| Regresión | Un cambio que empeora una métrica más que su umbral y que no es ruido |
| Umbral | Lo mínimo que tiene que empeorar una métrica para contar. No es el umbral de "good" de Google, sino el del gate frente al baseline |
| Veredicto | El resultado del gate: `pass` o `fail` |

## Agentes

| Término | Qué es |
|---|---|
| Atribución | Pasar de "el INP empeora" a "esta función, en este fichero y esta línea" |
| Fixture | Una respuesta real guardada en un fichero, para que los tests no tengan que medir cada vez |
| Handoff | El fichero con la entrada completa para el modelo, que escribe el gate para pasarla a otro agente |
| Herramienta MCP | Una función que un servidor MCP ofrece, con un nombre y unos argumentos, como `performance_start_trace` |
| Judge | El subagente que junta el veredicto de las reglas, la atribución y la explicación del modelo |
| MCP | Model Context Protocol. La forma estándar de que un programa, o un modelo, llame a las herramientas de otro |
| Navigator | El subagente que recorre la tienda y comprueba que cada paso de cada recorrido funciona |
| Orquestador | El programa que pasa cada subagente por las dos tiendas, uno detrás de otro |
| Schema | La forma que tiene que tener un JSON. La respuesta del modelo se valida contra uno |
| stdio | La manera en que el taller habla con los servidores MCP: los arranca como procesos y les escribe por su entrada estándar |
| Subagente | En el taller, código que llama a herramientas MCP con argumentos fijos y devuelve un JSON. No es un modelo |
| TOON | Token-Oriented Object Notation. Un formato más compacto que JSON para pasar datos a un modelo |
