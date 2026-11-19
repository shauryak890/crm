import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// "virtual:wb-demo" is the made-up-data client for local demos (src/lib/demo,
// never committed). It only exists on the dev server; a production build
// always gets an empty module, so demo code and data can't ship.
const DEMO = fileURLToPath(new URL("./src/lib/demo/client.js", import.meta.url));
const demoModule = (command) => ({
  name: "wb-demo",
  resolveId(id) {
    if (id !== "virtual:wb-demo") return null;
    return command === "serve" && existsSync(DEMO) ? DEMO : "\0wb-demo-empty";
  },
  load(id) {
    return id === "\0wb-demo-empty" ? "export const demoClient = null;" : null;
  },
});

export default defineConfig(({ command }) => ({
  plugins: [react(), demoModule(command)],
  server: { port: 5173 },
  build: { outDir: "dist" },
}));
