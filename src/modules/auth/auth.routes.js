import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, me } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";

const router = Router();

// Slows down password guessing: 10 failed logins per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many failed logins. Try again in 15 minutes." },
});

router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;
