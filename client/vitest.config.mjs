import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { transformWithEsbuild } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "source-js-as-jsx",
      enforce: "pre",
      async transform(code, id) {
        if (/\/src\/.*\.js$/.test(id)) {
          return transformWithEsbuild(code, id, { loader: "jsx", jsx: "automatic" });
        }
      },
    },
    react({
      include: /\.(js|jsx|ts|tsx)$/,
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.js$/,
  },
});
