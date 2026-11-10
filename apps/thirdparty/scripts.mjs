// The code of each third-party script. Every script first blocks the main thread for `cpu` ms,
// as the parsing and setup of a real vendor script would, and then does its job.

const prelude = (cpu) => `
  const end = performance.now() + ${cpu};
  while (performance.now() < end) {}
  const origin = document.currentScript ? new URL(document.currentScript.src).origin : "";
`;

// Sends a pageview beacon, like any analytics tag
const analytics = `
  navigator.sendBeacon(origin + "/collect", JSON.stringify({ type: "pageview", path: location.pathname }));
`;

// A floating chat button. It is fixed to the viewport, so it does not move the page
const chat = `
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Chat with us";
  button.setAttribute("data-third-party", "chat");
  button.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:10;padding:12px 18px;border:0;border-radius:24px;background:#1f2937;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer";
  document.body.append(button);
`;

// A promo banner that goes into the slot the page reserves for it. If the page renders the
// slot later, as a single-page app does, the script waits for it.
const promo = `
  const fill = (slot) => {
    const banner = document.createElement("div");
    banner.setAttribute("data-third-party", "promo");
    banner.textContent = "Free shipping over 30 euros with code PERF30";
    banner.style.cssText = "display:flex;align-items:center;justify-content:center;height:48px;padding:0 16px;background:#b45309;color:#fff;font:600 14px system-ui,sans-serif;text-align:center";
    slot.append(banner);
  };
  const find = () => document.querySelector("[data-promo-slot]");
  const slot = find();
  if (slot) {
    fill(slot);
  } else {
    const observer = new MutationObserver(() => {
      const found = find();
      if (found) {
        observer.disconnect();
        fill(found);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
`;

// Picks a variant for an A/B test. Vendors ask for it to load synchronously in the head
const ab = `
  document.documentElement.dataset.abVariant = "b";
`;

const BODIES = {
  "analytics.js": analytics,
  "chat.js": chat,
  "promo.js": promo,
  "ab.js": ab,
};

export const SCRIPT_NAMES = Object.keys(BODIES);

export function scriptSource(name, { cpu }) {
  return `(() => {${prelude(cpu)}${BODIES[name]}})();\n`;
}
