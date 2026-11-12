# Experimento: las ramas en el navegador

Reproduce las cifras de la página "Las ramas en el navegador": la tienda de `main` en producción y las previews de las cuatro ramas de regresión en Vercel, medidas como las vería una persona en su navegador.

## Qué hace

1. Abre la home de cada sitio de [`sites.mjs`](sites.mjs) en un contexto nuevo de Chromium, con el viewport de un móvil, y mide el LCP, el CLS y los atributos de la imagen del hero.
2. Abre la ficha de `kenya-aa`, hace click en "Add to cart" y mide la duración de esa interacción (Event Timing, el evento `click` o `pointerdown` más largo).
3. Lo repite cinco veces por sitio en dos condiciones: CPU 4x sin limitar la red, y CPU 4x con `fast-4g`, el preset de WebPerf Snippets 1.15.0 que usa el gate del taller.
4. Guarda cada ejecución y las medianas en [`results.json`](results.json), con la fecha.

Los tests no miden: comprueban las conclusiones de la página sobre el `results.json` guardado, y que las cifras de la página en los tres idiomas son las de ese fichero.

## Requisitos

- Node 22 o superior y conexión a internet.
- El Chromium de Playwright 1.63.0: `npx playwright install chromium`.

## Uso

```bash
npm install
npm run measure     # mide los cinco sitios y reescribe results.json, unos 7 minutos
npm test            # comprueba las conclusiones y las cifras de la página
```

Cada medida pasa por la red hasta Vercel, así que las cifras cambian de una ejecución a otra y de una conexión a otra. Las conclusiones son las que se mantienen: con `fast-4g`, cada rama empeora su métrica frente a `main`; sin limitar la red, la regresión de LCP y la de CLS no se ven. Si después de medir de nuevo las cifras de la página ya no coinciden, `npm test` lo dice: actualiza la página en los tres idiomas.
