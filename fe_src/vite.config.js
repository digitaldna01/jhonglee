import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mdx from "@mdx-js/rollup";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode from "rehype-pretty-code";
import tailwindcss from "@tailwindcss/vite";

const rehypePrettyCodeOptions = {
  theme: "github-dark-default",
  keepBackground: true,
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    mdx({
      remarkPlugins: [remarkMath],
      rehypePlugins: [[rehypePrettyCode, rehypePrettyCodeOptions], rehypeKatex],
    }),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Dev: forward API calls to the be_src backend. Host dev defaults to
      // uvicorn on :8000; inside docker-compose.dev.yml it points at the
      // `backend` service via VITE_API_PROXY.
      "/api": process.env.VITE_API_PROXY ?? "http://localhost:8000",
    },
    // macOS Docker bind mounts don't emit native fs events, so HMR needs
    // polling to notice edits. Opt-in via env so host dev is unaffected.
    ...(process.env.VITE_USE_POLLING ? { watch: { usePolling: true } } : {}),
  },
});
