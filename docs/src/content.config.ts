import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// English is the root locale of the site, served without a prefix, but its Markdown lives in
// en/ next to es/ and ca/, so the three languages have the same layout in the repo and on GitHub.
// The id drops the en/ folder, the extension and a trailing index, as the default loader does.
export const pageId = (entry: string) => {
  const id = entry.replace(/\.mdx?$/, "").replace(/^en\//, "");
  return id === "index" ? id : id.replace(/\/index$/, "");
};

export const collections = {
  docs: defineCollection({ loader: docsLoader({ generateId: ({ entry }) => pageId(entry) }), schema: docsSchema() }),
};
