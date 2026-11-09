import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:5000", changeOrigin: false },
      "/auth": { target: "http://127.0.0.1:5000", changeOrigin: false },
      "/join": { target: "http://127.0.0.1:5000", changeOrigin: false },
    },
  },
});
