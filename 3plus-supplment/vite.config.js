import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  // Dev server proxy to forward API requests to backend during development
  server: {
    host: "192.168.20.145",
    port: 5173,
    proxy: {
      // Proxy any request starting with /api to the backend server to avoid CORS in dev
      "/api": {
        target: "http://api.e3pl.com",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, "/api"),
      },
    },
  },
});
