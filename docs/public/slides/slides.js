// Navigation of the slides: arrow keys, Page Up and Down, space, Home and End, the buttons and a
// swipe; the hash keeps the slide (#3), so a link opens on it. The canvas scales to the window.
const slides = [...document.querySelectorAll(".slide")];
const counter = document.querySelector("[data-counter]");
const progress = document.querySelector(".progress");
let current = 0;

function fit() {
  const scale = Math.min(innerWidth / 1600, innerHeight / 900);
  for (const slide of slides) slide.style.transform = `scale(${scale})`;
}

function show(index, { updateHash = true } = {}) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides.forEach((slide, i) => {
    slide.classList.toggle("is-current", i === current);
    slide.setAttribute("aria-hidden", String(i !== current));
  });
  counter.textContent = `${current + 1} / ${slides.length}`;
  progress.style.width = `${((current + 1) / slides.length) * 100}%`;
  document.title = `${slides[current].dataset.title ?? ""} · ${document.body.dataset.deck}`;
  if (updateHash) history.replaceState(null, "", `#${current + 1}`);
}

const fromHash = () => Number(location.hash.slice(1)) - 1 || 0;

addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (["ArrowRight", "PageDown", " "].includes(event.key)) show(current + 1);
  else if (["ArrowLeft", "PageUp"].includes(event.key)) show(current - 1);
  else if (event.key === "Home") show(0);
  else if (event.key === "End") show(slides.length - 1);
  else return;
  event.preventDefault();
});

document.querySelector("[data-prev]").addEventListener("click", () => show(current - 1));
document.querySelector("[data-next]").addEventListener("click", () => show(current + 1));

let touchX = null;
addEventListener("touchstart", (event) => (touchX = event.touches[0].clientX), { passive: true });
addEventListener("touchend", (event) => {
  if (touchX === null) return;
  const dx = event.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
  touchX = null;
});

addEventListener("hashchange", () => show(fromHash(), { updateHash: false }));
addEventListener("resize", fit);
fit();
show(fromHash(), { updateHash: false });
