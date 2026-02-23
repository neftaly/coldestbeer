import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import compression from "vite-plugin-compression";

export default defineConfig({
  base: "/",
  optimizeDeps: {
    esbuildOptions: { target: "es2022" },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        entryFileNames: "bundle.js",
        assetFileNames: "bundle.[ext]",
      },
    },
  },
  plugins: [
    react(),
    compression({
      algorithm: "brotliCompress",
      ext: ".br",
    }),
  ],
});
