---
title: Preparación
description: Qué necesita tu equipo, cómo descargar el laboratorio en casa y cómo comprobar que está listo antes del taller.
sidebar:
  order: 2
---

Todo el taller corre en tu portátil con Docker Compose, sin claves de API. Lo único que pide es descargar las imágenes antes: son varios GB y la Wi-Fi de un evento no da para todos. Esta página se hace en casa, con buena conexión.

Esto es lo que descargas: dos tiendas, los mocks de terceros, los agentes y el modelo, en una red sin salida a internet.

<img src="/diagrams/lab.svg" alt="Los servicios del laboratorio: agents y ci miden shop-baseline y shop-candidate, que cargan los scripts de thirdparty; agents pide la explicación a ollama y escribe los informes en out/" width="960" height="420" loading="lazy" decoding="async">

## Qué necesitas

- **16 GB de RAM.** Con 8 GB el taller se sigue con el perfil `lite`, sin modelo local (más abajo).
- **Un runtime de contenedores** con el comando `docker compose`, Compose v2.20.2 o superior (`docker compose version`), y **al menos 8 GB asignados a su máquina virtual**. En Docker Desktop el valor por defecto suele ser menor: es el fallo más frecuente.
  - Docker Desktop y OrbStack: tal cual.
  - Colima: arráncala con memoria suficiente, por ejemplo `colima start --memory 8 --cpu 4`.
  - Podman: con su modo compatible con Docker y el comando `docker compose`, no `podman-compose`.
- **15 GB libres de disco.**
- **macOS, Linux o Windows con WSL2**, git y un editor. Node no hace falta: todo corre dentro de los contenedores.

El laboratorio está probado con Docker Desktop en macOS. En los demás runtimes, el preflight dice qué cambiar si algo no encaja.

## Descarga y comprueba

```bash
git clone https://github.com/nucliweb/agent-first-perf-audits.git
cd agent-first-perf-audits
scripts/preflight.sh
```

El preflight hace tres cosas, y escribe `OK` o `KO` en cada una:

1. **Comprueba el equipo**: el runtime, la versión de Compose, la arquitectura, la memoria de la máquina virtual, las ramas de regresión y el disco libre.
2. **Descarga las imágenes**: el laboratorio y la tienda de cada rama.
3. **Pasa un smoke test** dentro de Compose: Chromium arranca, se graba un trace, las dos tiendas responden, el laboratorio no tiene salida a internet y el modelo local contesta.

Cada `KO` dice qué cambiar en tu runtime. Cuando sale con 0, el equipo está listo.

En Windows, desde PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
```

Desde WSL2 sirve `scripts/preflight.sh`.

## Con 8 GB: el perfil lite

El modelo local es lo que más memoria pide. El perfil `lite` no lo descarga ni lo arranca:

```bash
COMPOSE_PROFILES=lite scripts/preflight.sh
```

Con `lite` no te pierdes el taller. Esto es lo que cambia:

| | Perfil `llm` (por defecto) | Perfil `lite` |
|---|---|---|
| Medidas de los subagentes | Sí | Sí |
| Veredicto del gate | Sí | Sí, el mismo |
| Atribución con los traces | Sí | Sí, la misma |
| Explicación en una frase | La escribe el modelo local | El informe remite a `handoff.md` |

`handoff.md` lleva la misma entrada que recibiría el modelo local (el veredicto, las métricas, los resúmenes de los traces y el diff de la rama), con el prompt y el schema de la respuesta. Se la puedes pasar a un agente de tu elección para tener la explicación. Enviar el diff de tu código a un servicio externo es una decisión de cada equipo: en el taller el diff es el de una tienda de ejemplo.

Para usar `lite` durante todo el taller, pon la variable delante de cada comando o expórtala una vez en tu terminal:

```bash
export COMPOSE_PROFILES=lite
```

## Las descargas, a mano

Lo mismo que descarga el preflight, por si prefieres hacerlo paso a paso:

```bash
docker compose --profile llm --profile run pull
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose pull shop-candidate
done
```

La primera línea trae el modelo, los mocks de terceros, los agentes y la tienda de `main`; el bucle, la tienda de cada rama.

## Los fallos más frecuentes

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| `KO` en la memoria | La máquina virtual del runtime tiene menos de 8 GB | Súbela en los ajustes del runtime, o usa el perfil `lite`, que pide 4 GB |
| `KO` en Compose | Es `podman-compose` o una versión anterior a la 2.20.2 | Instala Docker Compose v2 y comprueba `docker compose version` |
| `KO` en el disco | No hay 15 GB libres y todavía faltan imágenes por descargar | Libera espacio; `docker system df` dice cuánto ocupa Docker |
| `KO` en las ramas | El clon no tiene las ramas `pr/*` | `git fetch origin` |
| `KO` en `out/`, que no se puede escribir | En Linux, Docker creó la carpeta como root | `sudo chown -R "$(id -u):$(id -g)" out` |
| `KO` en la descarga de las imágenes | Conexión lenta o disco de la máquina virtual lleno | Vuelve a lanzar el preflight: las imágenes que terminaron se conservan |

## Sin Docker

Si tu equipo no puede con el laboratorio, las cuatro ramas están desplegadas para verlas en el navegador: [Las ramas en el navegador](../previews/). No sustituye al taller, pero permite seguir las explicaciones y ver cada regresión en DevTools.

Con el equipo listo, repasa los [Conceptos](../concepts/) y empieza por el [paso 1](../workshop/step-01/).
