import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createCrdrExtractionHandler } from "./server/crdrExtraction.mjs";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: "crdr-extraction",
      configureServer(server) {
        const handler = createCrdrExtractionHandler(loadEnv(mode, server.config.envDir, "AZURE_OPENAI_"));
        server.middlewares.use("/crdr-ai/extract", (req, res) => {
          if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(req.headers.host ?? "") ||
              !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) ||
              (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Use localhost for development extraction." }));
          }
          return handler(req, res);
        });
      },
    },
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  // Dev server proxy to forward API requests to backend during development
  server: {
    host: "192.168.20.151",
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
}));
