import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// In production, server.mjs puts the origin of the third-party mocks into index.html.
// The dev server does the same here.
const thirdPartyOrigin = (): Plugin => ({
  name: "third-party-origin",
  apply: "serve",
  transformIndexHtml: (html) =>
    html.replaceAll("__THIRDPARTY_ORIGIN__", process.env.THIRDPARTY_ORIGIN ?? "http://localhost:4000"),
});

export default defineConfig({
  plugins: [react(), thirdPartyOrigin()],
});
