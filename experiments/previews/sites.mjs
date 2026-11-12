// The shop of main in production and the preview of each regression branch, on Vercel
export const SITES = {
  main: "https://perf-coffee.vercel.app",
  "pr/lcp-hero-lazy": "https://perf-coffee-git-pr-lcp-hero-lazy-nucliweb-projects.vercel.app",
  "pr/cls-promo-banner": "https://perf-coffee-git-pr-cls-promo-banner-nucliweb-projects.vercel.app",
  "pr/loaf-cart-handler": "https://perf-coffee-git-pr-loaf-cart-handler-nucliweb-projects.vercel.app",
  "pr/noop-refactor": "https://perf-coffee-git-pr-noop-refactor-nucliweb-projects.vercel.app",
};

// The conditions of the gate (CPU 4x and fast-4g, the preset of WebPerf Snippets 1.15.0 in
// src/throttling.js), and the same CPU without network throttling
const FAST_4G = { offline: false, downloadThroughput: ((9 * 1000 * 1000) / 8) * 0.9, uploadThroughput: ((1.5 * 1000 * 1000) / 8) * 0.9, latency: 60 * 2.75 };

export const CONDITIONS = {
  "cpu-4x": { cpu: 4, network: null },
  "cpu-4x-fast-4g": { cpu: 4, network: FAST_4G },
};

export const RUNS = 5;
