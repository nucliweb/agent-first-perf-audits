// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://agent-first-perf-audits.vercel.app",
  integrations: [
    starlight({
      title: "Multi-Agent Performance Audits",
      description: "Taller de PerfReviews: un gate de rendimiento para pull requests con agentes, MCP y un LLM local.",
      defaultLocale: "root",
      locales: {
        // The Markdown of the root locale lives in src/content/docs/es (see src/content.config.ts)
        root: { label: "Español", lang: "es" },
        ca: { label: "Català", lang: "ca" },
        en: { label: "English", lang: "en" },
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/nucliweb/agent-first-perf-audits" }],
      customCss: ["./src/styles/perfreviews.css"],
      sidebar: [
        {
          label: "El taller",
          translations: { ca: "El taller", en: "The workshop" },
          items: [{ autogenerate: { directory: "workshop" } }],
        },
        {
          label: "Referencia",
          translations: { ca: "Referència", en: "Reference" },
          items: ["previews", "stack", "learnings"],
        },
      ],
    }),
  ],
});
