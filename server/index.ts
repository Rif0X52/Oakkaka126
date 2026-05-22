import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupBot, bot } from "./bot";
import { storage } from "./storage";
import { join } from "path";
import https from "https";

// Direct fetch helper to bypass node-telegram-bot-api TLS issues
function tgFetch(token: string, method: string, params?: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = params ? JSON.stringify(params) : "";
    const options = {
      hostname: "api.telegram.org",
      path: `/bot${token}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Bot is running" });
});

app.post("/bot-webhook", express.json(), (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

(async () => {
  // Connect to MongoDB first
  try {
    await storage.connect();
    // Migrate data from JSON files on first run
    await storage.initializeFromJson(join(process.cwd(), 'data'));
  } catch (error) {
    log(`MongoDB connection failed: ${error}`);
    process.exit(1);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  setupBot();

  // Auto-detect WEBHOOK_URL from Hugging Face Spaces or env
  let webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl && process.env.SPACE_HOST) {
    webhookUrl = `https://${process.env.SPACE_HOST}`;
    log(`Auto-detected HF Space host: ${webhookUrl}`);
  }

  // Set webhook directly via Telegram API (bypasses node-telegram-bot-api TLS issues)
  if (webhookUrl && BOT_TOKEN) {
    const fullWebhookUrl = `${webhookUrl}/bot-webhook`;
    let success = false;
    for (let i = 0; i < 5; i++) {
      try {
        const result = await tgFetch(BOT_TOKEN, "setWebhook", { url: fullWebhookUrl });
        if (result?.ok) {
          log(`Webhook set to: ${fullWebhookUrl}`);
          success = true;
          break;
        } else {
          log(`Webhook attempt ${i+1} API error: ${JSON.stringify(result)}`);
        }
      } catch (error) {
        log(`Webhook attempt ${i+1} failed: ${error}`);
      }
      if (i < 4) await new Promise(r => setTimeout(r, 5000));
    }
    if (!success) log("CRITICAL: Could not set webhook after 5 attempts.");
  } else {
    log("WARNING: WEBHOOK_URL or TELEGRAM_BOT_TOKEN missing.");
  }

  const PORT = parseInt(process.env.PORT || "7860", 10);
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();