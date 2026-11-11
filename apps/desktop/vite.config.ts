import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 1420,
        strictPort: true,
    },
    build: {
        outDir: "../../dist/apps/desktop",
        emptyOutDir: true,
    },
});
