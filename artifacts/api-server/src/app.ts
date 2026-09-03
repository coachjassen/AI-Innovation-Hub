import express, { type ErrorRequestHandler, type Express } from "express";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgSession = connectPg(session);

const app: Express = express();

app.set("trust proxy", 1);

// In self-hosted production, HTTPS is the only supported public protocol.
// Apache/nginx terminates TLS and must pass X-Forwarded-Proto: https. The
// redirect keeps direct HTTP requests from accidentally using the app without
// the secure session-cookie and origin protections.
app.use((req, res, next) => {
  const selfHostedProduction =
    process.env.NODE_ENV === "production" && process.env.REPL_ID === undefined;
  const enforceHttps = process.env.ENFORCE_HTTPS !== "false";
  if (!selfHostedProduction || !enforceHttps || req.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" || req.protocol === "https") {
    next();
    return;
  }

  const configuredOrigin = process.env.APP_URL ?? process.env.PUBLIC_APP_URL;
  if (!configuredOrigin) {
    res.status(400).json({ error: "HTTPS is required" });
    return;
  }

  try {
    const secureUrl = new URL(req.originalUrl, configuredOrigin);
    res.redirect(308, secureUrl.toString());
  } catch {
    res.status(400).json({ error: "HTTPS is required" });
  }
});

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

// The web app and API are served from the same origin. Require an exact
// first-party Origin on writes so a browser cannot attach an admin session to
// a cross-origin request.
app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");
  if (!origin) {
    if (fetchSite && fetchSite !== "same-origin") {
      res.status(403).json({ error: "Cross-origin requests are not allowed" });
      return;
    }
    next();
    return;
  }

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0] ?? req.protocol;
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0] ?? req.get("host");
  const expectedOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : "";
  if (origin !== expectedOrigin) {
    res.status(403).json({ error: "Cross-origin requests are not allowed" });
    return;
  }

  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Cookie security settings differ by environment:
//  - Inside Replit (proxied HTTPS iframe): sameSite=none + secure=true required
//    so the cookie isn't dropped as a third-party cookie.
//  - Self-hosted with HTTPS: set COOKIE_SECURE=true in .env → sameSite=lax,
//    secure=true (standard secure browser behaviour).
//  - Self-hosted plain HTTP (internal network): leave COOKIE_SECURE unset →
//    sameSite=lax, secure=false so the browser actually stores the cookie.
const isReplit = !!process.env.REPL_ID;
const cookieSecure = isReplit || process.env.COOKIE_SECURE === "true";
const cookieSameSite = isReplit ? "none" : "lax";

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: cookieSecure,
    },
  }),
);

app.use("/api", router);

// Keep database and implementation details out of browser responses. Individual
// routes still return their own expected validation errors; this is a last-resort
// response for unexpected failures, which are retained in the server logs.
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  req.log.error({ err }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong. Please try again or contact an administrator." });
};

app.use(errorHandler);

export default app;
