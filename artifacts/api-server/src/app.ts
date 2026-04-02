import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
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

app.use(cors({ origin: true, credentials: true }));
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

app.use("/api", router);
app.use(errorHandler);

export default app;
