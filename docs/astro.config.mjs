// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://agent-first-perf-audits.vercel.app",
  integrations: [
    starlight({
      title: "Multi-Agent Performance Audits",
      description: "A PerfReviews workshop: a performance gate for pull requests with agents, MCP and a local LLM.",
      defaultLocale: "root",
      locales: {
        // The Markdown of the root locale lives in src/content/docs/en (see src/content.config.ts)
        root: { label: "English", lang: "en" },
        es: { label: "Español", lang: "es" },
        ca: { label: "Català", lang: "ca" },
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/nucliweb/agent-first-perf-audits" }],
      customCss: ["./src/styles/perfreviews.css"],
      sidebar: [
        {
          label: "Start here",
          translations: { es: "Empezar", ca: "Comença" },
          items: ["setup", "concepts"],
        },
        {
          label: "The workshop",
          translations: { es: "El taller", ca: "El taller" },
          items: [{ autogenerate: { directory: "workshop" } }],
        },
        {
          label: "Reference",
          translations: { es: "Referencia", ca: "Referència" },
          items: ["previews", "stack", "learnings", "glossary", "references"],
        },
      ],
    }),
  ],
});
