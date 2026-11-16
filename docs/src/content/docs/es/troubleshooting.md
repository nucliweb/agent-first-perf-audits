---
title: Problemas frecuentes
description: Qué mirar cuando el laboratorio no arranca, una medida no sale como en la guía o el modelo local no contesta, y cómo volver a empezar.
sidebar:
  order: 93
---

Cada guía tiene su apartado "Si algo falla", con los fallos de ese paso, y [Preparación](../setup/#los-fallos-más-frecuentes) tiene los de la instalación. Esta página reúne los que no son de un paso concreto.

## Por dónde empezar

Tres comandos dicen casi siempre qué pasa:

```bash
docker compose ps
docker compose run --rm agents npm run check -- step-03
scripts/preflight.sh
```

- `docker compose ps` lista los servicios en marcha. Tienen que estar `thirdparty`, `shop-baseline` y `shop-candidate`, y con el perfil `llm` también `ollama`, todos como `healthy`. Si falta alguno, `docker compose up -d` lo levanta.
- La comprobación de un paso, aquí la del 3, da un `OK` o un `KO` por cada cosa que el paso tiene que dejar hecha, y escribe el comando que falta.
- El preflight comprueba el equipo y pasa un smoke test en un laboratorio aparte, sin tocar el tuyo. Se puede lanzar en cualquier momento, menos durante una medida.

| Dónde falla | Dónde mirar |
|---|---|
| Al instalar, o en el preflight | [Preparación](../setup/#los-fallos-más-frecuentes) |
| En un paso | El apartado "Si algo falla" de su guía, del [paso 1](../workshop/step-01/#si-algo-falla) al [paso 5](../workshop/step-05/#si-algo-falla) |
| En un reto | [Retos](../challenges/#antes-de-empezar) explica cómo se prueba un cambio en la tienda |

## El laboratorio

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| Docker deja de responder, o una descarga se queda a medias | El disco de la máquina virtual de Docker está lleno | `docker system df` dice cuánto ocupa cada cosa. Libera espacio y reinicia el runtime antes de seguir: una imagen que se descargó con el disco lleno puede haber quedado mal |
| Con 8 GB, Compose descarga o arranca `ollama` | Falta `COMPOSE_PROFILES=lite` en esa terminal | `export COMPOSE_PROFILES=lite`, y vale para todos los comandos |
| No sabes con qué perfil estás midiendo | El perfil sale de `COMPOSE_PROFILES`, o del fichero `.env` del repo, que pone `llm` | La primera línea de `ci` lo dice: `llm profile` o `lite profile` |
| En Linux, un comando no puede escribir en `out/` | Docker creó la carpeta como root | `sudo chown -R "$(id -u):$(id -g)" out` |
| La tienda del laboratorio no abre en el navegador | El laboratorio no publica puertos, y su red no tiene salida a internet | Las mismas tiendas están desplegadas: [Las ramas en el navegador](../previews/) |
| Un comando dentro del contenedor no puede descargar nada | Es la misma red sin salida: lo que mide el gate no depende de internet | Lo que haga falta descargar se descarga fuera, con el preflight o con `scripts/build-shop.sh` |

## Las medidas

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| Tus cifras no son las de la guía | Cada ejecución mide de nuevo, y cada máquina es distinta | Compara los dos lados entre sí. Lo que tiene que coincidir con la guía es el veredicto y la fase o la función que cambia |
| Las dos tiendas miden lo mismo | La tienda candidata no es la que crees: sin `CANDIDATE`, el laboratorio usa `pr-noop-refactor` | Pon `CANDIDATE=<rama>` delante del comando, con la rama escrita con guiones: `pr-lcp-hero-lazy` |
| Una rama con regresión pasa el gate | Su métrica quedó como no concluyente, y el informe lo dice arriba | Lanza el gate otra vez. Por qué pasa, en [Conceptos](../concepts/#por-qué-importa-cuántas-veces-se-mide) |
| `pr-noop-refactor` falla el gate | La máquina estaba ocupada en otra cosa durante la medida | Cierra lo que consuma CPU y lanza esa rama otra vez |
| El INP de `pr/loaf-cart-handler` cambia de una sesión a otra | El handler hace un trabajo fijo, y tarda menos cuanto más rápida va la máquina en ese momento | Compara con el baseline de la misma ejecución, no con la cifra de otro día |
| Una medida tarda mucho más que en la tabla de Tiempo de su guía | Otra carga en la máquina, o un equipo más lento que el de referencia | Déjala terminar, y no lances otra a la vez: dos Chromium se reparten la CPU y las dos medidas salen peor |

Las medidas van siempre de una en una. Es la razón por la que `docker compose up -d` no arranca ningún Chromium, y por la que cada comando del taller espera al anterior.

## El modelo local

El veredicto no depende del modelo: lo deciden las reglas antes de preguntarle. Lo que puede fallar es la explicación.

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| El informe trae el veredicto, y un error donde iría la explicación | El modelo no respondió, o respondió algo que no cumple el schema | Comprueba con `docker compose ps` que `ollama` está en marcha, y lanza el comando otra vez |
| La explicación tarda mucho | El modelo corre en la CPU, al lado de todo lo demás | Espera. Durante la llamada usa casi todos los núcleos de la máquina virtual, y es normal que el equipo vaya lento |
| La explicación nombra una sola causa cuando hay varias | El modelo es pequeño, para que quepa en un portátil | Los hechos de las reglas, al final del informe, dan las demás. Para otra explicación, `handoff.md` lleva la misma entrada: es el [reto 2](../challenges/#reto-2-pide-la-explicación-a-otro-modelo) |
| El informe no trae explicación y remite a `handoff.md` | Estás con el perfil `lite`, sin modelo local | Es lo esperado: el veredicto y los hechos son los mismos |

## Si escribes tu propio código

Quien escribe los subagentes en lugar de aplicar la solución, o lleva el flujo a su plataforma, se encuentra con los valores por defecto de los servidores MCP, que están pensados para un editor:

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| `navigate_page` devuelve un error de validación | Chrome DevTools MCP pide un `pageId` en cada tool de página | Arranca el servidor con `--no-page-id-routing` |
| `Access denied` al guardar un trace | El servidor solo escribe en su directorio temporal | Graba ahí y copia el fichero, o dale la carpeta con `--workspace` |
| `No usable sandbox!` | Chromium no tiene sandbox dentro del contenedor | `--chromeArg=--no-sandbox`, solo en el contenedor |
| El servidor no encuentra el navegador | El cliente stdio no le pasa tus variables de entorno, tampoco `PLAYWRIGHT_BROWSERS_PATH` | Instala el Chromium de Playwright en su ruta por defecto |

El contexto de los cuatro está en [Learnings](../learnings/#chrome-devtools-mcp-fuera-del-editor), y los flags con los que el taller arranca el servidor, en `agents/src/mcp/client.ts`.

## Volver a empezar

Para repetir el taller desde el paso 1, con tu rama `taller` tal como salió de `workshop-start`:

```bash
docker compose down
git checkout workshop-start -- agents/src
rm -rf out
mkdir out
docker compose up -d
```

La carpeta `out/` se crea vacía a mano para que en Linux no la cree Docker como root. Solo tiene lo que escriben los comandos del taller: los traces, los JSON de los subagentes y los informes. Las imágenes descargadas se conservan.
