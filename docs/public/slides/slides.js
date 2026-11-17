// Navigation of the slides: arrow keys, Page Up and Down, space, Home and End, the buttons and a
// swipe; the hash keeps the slide (#3), so a link opens on it. The canvas scales to the window.
//
// Presenter view: the key n opens the same URL with ?presenter in a second window (or switches the
// current one when the popup is blocked). It shows the slide, the next one, the notes of the slide
// (<aside class="notes"> inside a section.slide), the counter, a clock (r resets it) and the timer
// of the block. Both windows follow each other through a BroadcastChannel.
// Blocks: consecutive slides with the same data-block form one; the first one carries its label
// (data-block-title, or its data-title) and data-minutes (the plan, optional). Slides without it have
// no timer.
// Labels of the view, on <body>; the defaults are English:
//   data-label-next ("Next"), data-label-notes ("Notes"), data-label-no-notes ("No notes for this
//   slide"), data-label-end ("End of the deck"), data-label-clock ("Time")
const slides = [...document.querySelectorAll(".slide")];
const counter = document.querySelector("[data-counter]");
const progress = document.querySelector(".progress");
const presenter = new URLSearchParams(location.search).has("presenter");
const channel = new BroadcastChannel(`slides:${location.pathname}`);
let current = 0;
let ready = false;

function fit() {
  const scale = Math.min(innerWidth / 1600, innerHeight / 900);
  for (const slide of slides) slide.style.transform = `scale(${scale})`;
  // The slides of the presenter view are copies inside frames: they scale to the width of the frame
  for (const frame of document.querySelectorAll(".presenter .frame")) {
    if (frame.firstElementChild?.matches(".slide")) frame.firstElementChild.style.transform = `scale(${frame.clientWidth / 1600})`;
  }
}

const labels = { next: "Next", notes: "Notes", noNotes: "No notes for this slide", end: "End of the deck", clock: "Time" };
const label = (name) => document.body.dataset[`label${name[0].toUpperCase()}${name.slice(1)}`] ?? labels[name];
const format = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

// The block of a slide: its label and plan live in the first slide of the run
function blockOf(index) {
  const id = slides[index].dataset.block;
  if (!id) return null;
  let first = index;
  while (first > 0 && slides[first - 1].dataset.block === id) first--;
  return { id, title: slides[first].dataset.blockTitle ?? slides[first].dataset.title, minutes: Number(slides[first].dataset.minutes) || 0 };
}

let view, startedAt = null, blockAt = null, lastBlock;

function buildPresenter() {
  document.body.classList.add("is-presenter");
  const panel = document.createElement("div");
  panel.className = "presenter";
  panel.innerHTML = `
    <div class="frame" data-presenter-current></div>
    <div class="presenter-side">
      <div class="presenter-status"><span data-presenter-counter></span><span><small data-presenter-label="clock"></small> <b data-presenter-clock>0:00</b></span></div>
      <p class="presenter-block" data-presenter-block hidden></p>
      <small data-presenter-label="next"></small>
      <div class="frame" data-presenter-next></div>
      <small data-presenter-label="notes"></small>
      <div class="presenter-notes" data-presenter-notes></div>
    </div>`;
  document.body.append(panel);
  for (const name of ["next", "notes", "clock"]) panel.querySelector(`[data-presenter-label=${name}]`).textContent = label(name);
  const find = (name) => panel.querySelector(`[data-presenter-${name}]`);
  view = { current: find("current"), next: find("next"), notes: find("notes"), counter: find("counter"), clock: find("clock"), block: find("block") };
  setInterval(tick, 1000);
}

// The clock and the timer of the block are computed from the clock of the page on every tick, so
// a throttled timer in a background window never makes them drift
function tick() {
  const now = Date.now();
  view.clock.textContent = format(startedAt === null ? 0 : now - startedAt);
  const block = blockOf(current);
  view.block.hidden = !block;
  if (!block) return;
  const spent = blockAt === null ? 0 : now - blockAt;
  const plan = block.minutes * 60000;
  view.block.textContent = `${block.title} · ${format(spent)}${plan ? ` / ${format(plan)}` : ""}`;
  view.block.classList.toggle("is-over", plan > 0 && spent > plan);
}

function renderPresenter(previous) {
  const now = Date.now();
  // Time only counts once the talk starts, which is the first slide change
  if (ready && startedAt === null && previous !== current) startedAt = blockAt = now;
  const block = blockOf(current);
  if (block?.id !== lastBlock) {
    lastBlock = block?.id;
    if (startedAt !== null) blockAt = now;
  }
  const copy = (index) => {
    const slide = slides[index].cloneNode(true);
    slide.classList.add("is-current");
    slide.setAttribute("aria-hidden", "true");
    return slide;
  };
  const message = (className, content) => Object.assign(document.createElement("p"), { className, textContent: content });
  view.current.replaceChildren(copy(current));
  view.next.replaceChildren(current + 1 < slides.length ? copy(current + 1) : message("presenter-end", label("end")));
  const notes = slides[current].querySelector(".notes");
  view.notes.replaceChildren(...(notes ? notes.cloneNode(true).childNodes : [message("presenter-empty", label("noNotes"))]));
  view.counter.textContent = `${current + 1} / ${slides.length}`;
  tick();
  fit();
}

// Opens the presenter view on the current slide; when the popup is blocked this window becomes it
function openPresenter() {
  const url = `${location.pathname}?presenter#${current + 1}`;
  if (!open(url, "slides-presenter", "popup")) location.href = url;
}

function show(index, { updateHash = true, broadcast = true } = {}) {
  const previous = current;
  current = Math.max(0, Math.min(slides.length - 1, index));
  slides.forEach((slide, i) => {
    slide.classList.toggle("is-current", i === current);
    slide.setAttribute("aria-hidden", String(i !== current));
  });
  counter.textContent = `${current + 1} / ${slides.length}`;
  progress.style.width = `${((current + 1) / slides.length) * 100}%`;
  document.title = `${slides[current].dataset.title ?? ""} · ${document.body.dataset.deck}`;
  if (updateHash) history.replaceState(null, "", `#${current + 1}`);
  if (presenter) renderPresenter(previous);
  // Each window tells the other one; the one that hears it does not answer back
  if (broadcast && ready) channel.postMessage(current);
}

const fromHash = () => Number(location.hash.slice(1)) - 1 || 0;

addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (["ArrowRight", "PageDown", " "].includes(event.key)) show(current + 1);
  else if (["ArrowLeft", "PageUp"].includes(event.key)) show(current - 1);
  else if (event.key === "Home") show(0);
  else if (event.key === "End") show(slides.length - 1);
  else if (event.key === "n" && !presenter) openPresenter();
  else if (event.key === "r" && presenter && startedAt !== null) {
    startedAt = Date.now();
    tick();
  }
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
channel.addEventListener("message", (event) => show(event.data, { broadcast: false }));
addEventListener("resize", fit);
if (presenter) buildPresenter();
fit();
show(fromHash(), { updateHash: false });
ready = true;
