import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves from a subpath (/<repo>/). Override with VITE_BASE at build time.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
