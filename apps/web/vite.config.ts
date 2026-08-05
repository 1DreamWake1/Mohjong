import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 与 apps/web/nginx.conf 的代理前缀保持一致，避免开发与生产行为不一致。
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/rooms": "http://localhost:3000",
      "/games": "http://localhost:3000",
      "/admin": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/ready": "http://localhost:3000",
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true
      }
    }
  }
});
