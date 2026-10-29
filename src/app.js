import express from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { fileURLToPath } from "node:url";
import { authRouter, requireAdmin, publicUser } from "./auth.js";
import { fail } from "./errors.js";
import { quizRouter } from "./quizzes.js";
import { historyRouter } from "./history.js";
import { leaderboardRouter } from "./leaderboards.js";
import { adminRouter } from "./admin.js";

export function createApp(
  pool,
  { sessionSecret = process.env.SESSION_SECRET } = {},
) {
  if (!sessionSecret || sessionSecret.length < 32)
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  const app = express();
  app.disable("x-powered-by");
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "upgrade-insecure-requests":
            process.env.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
      if (req.get("X-Hosh-Request") !== "1")
        fail(403, "Missing request verification header.");
      const origin = req.get("Origin");
      const expectedOrigin =
        process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
      if (origin && origin !== expectedOrigin)
        fail(403, "Cross-origin requests are not allowed.");
      const csvUpload =
        req.path === "/admin/upload-csv" && req.is("multipart/form-data");
      if (!csvUpload && !req.is("application/json"))
        fail(415, "Send JSON data.");
      if (
        !csvUpload &&
        (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
      )
        fail(400, "Send a JSON object.");
    }
    next();
  });
  const Store = pgSession(session);
  const sessionStore = new Store({
    pool,
    tableName: "sessions",
    pruneSessionInterval: false,
  });
  app.use(
    session({
      name: "hosh.sid",
      store: sessionStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 86400000,
      },
    }),
  );
  app.use(async (req, res, next) => {
    if (req.session.userId) {
      const {
        rows: [user],
      } = await pool.query(
        "SELECT id,username,email,role FROM users WHERE id=$1",
        [req.session.userId],
      );
      if (user) req.user = publicUser(user);
    }
    next();
  });
  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 40,
      skip: (req) => req.method === "GET",
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (req, res) =>
        res
          .status(429)
          .json({
            error: "Too many sign-in attempts. Please try again later.",
          }),
    }),
    authRouter(pool),
  );
  app.get("/api/admin/status", requireAdmin, (req, res) =>
    res.json({ role: "admin" }),
  );
  app.use("/api", quizRouter(pool));
  app.use("/api", historyRouter(pool));
  app.use("/api", leaderboardRouter(pool));
  app.use("/api/admin", adminRouter(pool));
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.name === "MulterError" ? 400 : 500);
    if (status >= 500)
      console.error("Request failed:", error.code || error.name);
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? "Something went wrong. Please try again."
            : error.type === "entity.parse.failed"
              ? "Send a valid JSON object."
              : error.message,
      });
  });
  return app;
}
