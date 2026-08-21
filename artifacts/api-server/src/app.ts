import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { handleResendWebhook } from "./routes/resendWebhook";
import { handleLocalObjectPut } from "./routes/storage";

const app: Express = express();
app.set("trust proxy", 1);

// Readiness gate — flipped to true once migrations have completed.
// Health-check probes hit /api/healthz which is registered before this
// middleware in the router, so they always return 200 regardless.
let ready = false;
export function setReady(value: boolean) {
  ready = value;
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
// Keep this route ahead of express.json(): Resend signs the raw payload bytes.
app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "1mb" }), handleResendWebhook);
app.put(
  "/api/storage/uploads/:objectId",
  express.raw({ type: "*/*", limit: "50mb" }),
  handleLocalObjectPut,
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(authMiddleware);

// Block all /api routes except /api/healthz while migrations are running.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (!ready && req.path !== "/healthz") {
    res.status(503).json({ error: "Service starting — please retry in a moment" });
    return;
  }
  next();
});

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const publicDir =
    process.env.STATIC_DIR ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../closer/dist/public");

  app.use(express.static(publicDir, { index: false, maxAge: "1h" }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
