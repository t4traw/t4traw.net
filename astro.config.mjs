import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

import prefetch from "@astrojs/prefetch";

// https://astro.build/config
import tailwind from "@astrojs/tailwind";

// https://astro.build/config
export default defineConfig({
  integrations: [mdx(), prefetch(), tailwind()],
  redirects: {
    // エディタ版を「ループBGMスタジオ」として /apps/loop-bgm-studio に昇格したので旧URLを転送
    "/apps/loop-bgm-studio/editor": "/apps/loop-bgm-studio"
  }
});