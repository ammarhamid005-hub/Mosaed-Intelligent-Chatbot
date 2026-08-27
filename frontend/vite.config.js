import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // During dev, proxy API calls to avoid CORS issues
      "/auth": "http://localhost:8000",
      "/chat": "http://localhost:8000",
      "/sessions": "http://localhost:8000",
      "/feedback": "http://localhost:8000",
      "/documents": "http://localhost:8000",
    },
  },
});
