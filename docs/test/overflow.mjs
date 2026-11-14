// Walks every slide of a deck at the current viewport and reports the content that
// leaves the canvas of the slide: a descendant box beyond the box of the slide, or a
// scroll size bigger than the client size. Slides are numbered from 1.
const TOLERANCE = 0.5;

export async function findOverflows(page) {
  const total = await page.locator(".slide").count();
  const overflows = [];
  await page.keyboard.press("Home");
  for (let slide = 1; slide <= total; slide++) {
    const found = await page.evaluate(
      ({ slide, tolerance }) => {
        const el = document.querySelectorAll(".slide")[slide - 1];
        if (!el.classList.contains("is-current")) return { notCurrent: true };
        const box = el.getBoundingClientRect();
        const outside = [];
        for (const child of el.querySelectorAll("*")) {
          const rect = child.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const px = {
            top: box.top - rect.top,
            left: box.left - rect.left,
            bottom: rect.bottom - box.bottom,
            right: rect.right - box.right,
          };
          const sides = Object.entries(px).filter(([, value]) => value > tolerance);
          if (sides.length === 0) continue;
          outside.push({
            element: `${child.tagName.toLowerCase()}${child.className ? "." + String(child.className).trim().replace(/\s+/g, ".") : ""}`,
            text: (child.textContent ?? "").trim().slice(0, 40),
            px: Object.fromEntries(sides.map(([side, value]) => [side, Math.round(value * 10) / 10])),
          });
        }
        return {
          outside,
          scroll: {
            x: el.scrollWidth - el.clientWidth,
            y: el.scrollHeight - el.clientHeight,
          },
        };
      },
      { slide, tolerance: TOLERANCE },
    );
    if (found.notCurrent) throw new Error(`slide ${slide} is not the current one`);
    if (found.outside.length > 0 || found.scroll.x > 0 || found.scroll.y > 0) {
      overflows.push({ slide, ...found });
    }
    await page.keyboard.press("ArrowRight");
  }
  return overflows;
}
