import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Le backend FastAPI n'active pas CORS : en développement, Vite sert de
// relais (proxy). Le frontend appelle /api/... et Vite transmet au backend
// en retirant le préfixe /api.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const cible = env.VITE_PROXY_TARGET || "http://localhost:8000";
  return {
    plugins: [react()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: cible,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
  };
});
