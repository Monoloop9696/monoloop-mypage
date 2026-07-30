import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));

// .env の非 VITE_ 変数も process.env に載せる（serverless 関数がローカルで読めるように）
function loadDotEnvIntoProcess() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/i.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// 開発時のみ：/api/* を Vercel 関数と同じハンドラで処理するミドルウェア
function devApiPlugin() {
  return {
    name: "monoloop-dev-api",
    apply: "serve",
    configureServer(server) {
      loadDotEnvIntoProcess();
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();
        const path = req.url.split("?")[0].replace(/\/$/, "");
        const file = join(ROOT, path + ".js"); // /api/send-code -> api/send-code.js
        if (!file.startsWith(join(ROOT, "api")) || !existsSync(file)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          return res.end(JSON.stringify({ error: "Not Found" }));
        }
        // Vercel の res.status() を Node の res にポリフィル
        res.status = (code) => { res.statusCode = code; return res; };
        try {
          const mod = await import(pathToFileURL(file).href);
          await mod.default(req, res);
        } catch (err) {
          // 個人情報を出さないよう、詳細はサーバーログのみ（メッセージは汎用）
          console.error(`[dev-api] ${path} error:`, err && err.message);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "サーバーエラー（ローカル）" }));
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  server: { port: 5173 },
});
