import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://villa-bauseweinallee.de",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
