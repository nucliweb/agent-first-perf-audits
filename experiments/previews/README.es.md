# Experimento: las ramas en el navegador

[English](README.md) · Castellano · [Català](README.ca.md)

Reproduce las cifras de la página "Las ramas en el navegador": la tienda de `main` en producción y las previews de las cuatro ramas de regresión en Vercel, medidas como las vería una persona en su navegador.

## Qué hace

1. Abre la home de cada sitio de [`sites.mjs`](sites.mjs) en un contexto nuevo de Chromium, con el viewport de un móvil, y mide el LCP, el CLS y los atributos de la imagen del hero.
2. Abre la ficha de `kenya-aa`, hace click en "Add to cart" y mide esa interacción con Event Timing: su duración y sus tres fases, calculadas sobre todos sus eventos (`pointerdown`, `pointerup` y `click`) como las calcula web-vitals para el INP.
3. Lo repite cinco veces por sitio en dos condiciones: CPU 4x sin limitar la red, y CPU 4x con `fast-4g`, el preset de WebPerf Snippets 1.15.0 que usa el gate del taller.
4. Guarda cada ejecución y las medianas en [`results.json`](results.json), con la fecha.
5. `evidence.mjs` genera las imágenes de la página y de las slides en `docs/public/evidence/`, en los tres idiomas: el filmstrip de la carga de `main` y de `pr/lcp-hero-lazy` (de cinco cargas, la del LCP mediano), la home de `pr/cls-promo-banner` justo después de su desplazamiento, junto a la de `main`, y las fases del click de `pr/loaf-cart-handler` frente a `main`, con las medianas de `results.json`. Guarda en [`evidence.json`](evidence.json) las cifras que citan los pies de las imágenes.

Los tests no miden: comprueban las conclusiones de la página sobre `results.json` y `evidence.json`, que las cifras de la página y de las slides en los tres idiomas son las de esos ficheros, y que las imágenes existen y se muestran.

## Requisitos

- Node 22 o superior y conexión a internet.
- El Chromium de Playwright 1.63.0: `npx playwright install chromium`.

## Uso

```bash
npm install
npm run measure     # mide los cinco sitios y reescribe results.json, unos 7 minutos
npm run evidence    # genera las imágenes y evidence.json, unos 2 minutos
npm test            # comprueba las conclusiones y las cifras de la página
```

Cada medida pasa por la red hasta Vercel, así que las cifras cambian de una ejecución a otra y de una conexión a otra. Las conclusiones son las que se mantienen: con `fast-4g`, cada rama empeora su métrica frente a `main`; sin limitar la red, la regresión de LCP no se ve, y la de CLS y la de INP sí. Si después de medir de nuevo las cifras de la página ya no coinciden, `npm test` lo dice: actualiza la página en los tres idiomas.
