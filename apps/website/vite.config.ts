import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    plugins: [react(), tailwindcss()],
    server: {
        port: 1422,
        strictPort: true,
    },
    build: {
        outDir: "../../dist/apps/website",
        emptyOutDir: true,
    },
});
