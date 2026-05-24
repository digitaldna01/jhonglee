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
});
