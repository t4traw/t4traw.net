import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";

// https://astro.build/config
import prefetch from "@astrojs/prefetch";

// https://astro.build/config
export default defineConfig({
  integrations: [mdx(), prefetch()],
});
