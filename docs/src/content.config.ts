import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// Spanish is the root locale of the site, served without a prefix, but its Markdown lives in
// es/ next to ca/ and en/, so the three languages have the same layout in the repo and on GitHub.
// The id drops the es/ folder, the extension and a trailing index, as the default loader does.
export const pageId = (entry: string) => {
  const id = entry.replace(/\.mdx?$/, "").replace(/^es\//, "");
  return id === "index" ? id : id.replace(/\/index$/, "");
};

export const collections = {
  docs: defineCollection({ loader: docsLoader({ generateId: ({ entry }) => pageId(entry) }), schema: docsSchema() }),
};
