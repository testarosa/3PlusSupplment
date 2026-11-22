import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createApInvoiceExtractionHandler, createCrdrExtractionHandler } from "./server/crdrExtraction.mjs";

const isLocalRequest = (req) =>
  /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(req.headers.host ?? "") &&
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) &&
  (!req.headers.origin || req.headers.origin === "http://" + req.headers.host);

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: "billing-document-extraction",
      configureServer(server) {
        const env = loadEnv(mode, server.config.envDir, "AZURE_OPENAI_");
        const localOnly = (handler) => (req, res) => {
          if (!isLocalRequest(req)) {
            res.writeHead(403, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Use localhost for development extraction." }));
          }
          return handler(req, res);
        };
        server.middlewares.use("/crdr-ai/extract", localOnly(createCrdrExtractionHandler(env)));
        server.middlewares.use("/ap-invoice-ai/extract", localOnly(createApInvoiceExtractionHandler(env)));
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
      "^/ap-backend/api/(?:accounts-payable/(?:invoices(?:/\\d+(?:/(?:lines|edit))?)?|vendors|billing-codes)|air-import/shipment-by-reference|credit-debit-memos/memos|billing-users|accounts-receivable/invoices)(?:\\?|$)": {
        target: "http://127.0.0.1:5164",
        changeOrigin: true,
        bypass: (req) => req.method === "GET" && isLocalRequest(req) ? undefined : false,
        rewrite: (path) => path.replace(/^\/ap-backend/, ""),
      },
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
