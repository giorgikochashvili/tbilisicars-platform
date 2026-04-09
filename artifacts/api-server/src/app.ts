import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";
import router from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { seedSystemRoles } from "./services/seed-roles.service.js";

const PgSession = connectPgSimple(session);

const sessionSecret = process.env["SESSION_SECRET"];
const isProduction = process.env["NODE_ENV"] === "production";

if (!sessionSecret) {
  if (isProduction) {
    throw new Error("SESSION_SECRET environment variable must be set in production");
  }
  console.warn("[WARN] SESSION_SECRET not set — using insecure dev default");
}

const app: Express = express();

app.set("trust proxy", 1);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : null;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (!allowedOrigins || allowedOrigins.length === 0) {
      return callback(null, false);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.error(`[CORS BLOCKED] origin=${origin}`);
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: sessionSecret ?? "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

seedSystemRoles().catch((err) => {
  console.error("[seed-roles] Error during seeding:", err);
});

app.get("/", (_req, res) => {
  res.redirect("/website/");
});

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

const bookingRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many booking requests. Please try again later." },
});

const promoValidateRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many promo validation attempts. Please try again later." },
});

app.use("/api/auth/admin/login", loginRateLimit);
app.use("/api/auth/customer/login", loginRateLimit);
app.use("/api/public/bookings", bookingRateLimit);
app.use("/api/public/validate-promo", promoValidateRateLimit);

app.use("/api", router);
app.use(errorHandler);

export default app;
