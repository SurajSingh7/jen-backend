import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/auth.js";
import authRoutes from "./modules/auth/auth.routes.js";
import titlesRoutes from "./modules/titles/titles.routes.js";
import doctorsRoutes from "./modules/doctors/doctors.routes.js";
import mastersRoutes from "./modules/masters/masters.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import testsRoutes from "./modules/tests/tests.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";
import publicRoutes from "./modules/reports/public.routes.js";
import accountsRoutes from "./modules/accounts/accounts.routes.js";

// The Express app on its own (no listen): server.js runs it locally, Vercel runs it as a function.
const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());

// Every request waits for the (cached) DB connection, so a cold serverless start works too
app.use(async (_req, _res, next) => {
  await connectDB();
  next();
});

// Patient data must never be cached by the browser or a CDN
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/titles", requireAuth, titlesRoutes);
app.use("/api/doctors", requireAuth, doctorsRoutes);
app.use("/api/masters/:kind", requireAuth, mastersRoutes);
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/tests", requireAuth, testsRoutes);
app.use("/api/reports", requireAuth, reportsRoutes);
app.use("/api/accounts", requireAuth, accountsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
