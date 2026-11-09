import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AUTH_COOKIE, SESSION_DAYS, authCookieOptions, sessionVersion } from "../../middleware/auth.js";
import { safeEqual } from "../../utils/secure.js";
import { HttpError } from "../../utils/httpError.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// The admin comes from .env (ADMIN_USERNAME / ADMIN_PASSWORD), there is no users collection yet
export function login(req, res) {
  const { username, password } = req.body ?? {};
  if (!username || !password) throw new HttpError(400, "Username and password are required");

  // Both compared every time, so the answer time doesn't reveal which one was wrong
  const userOk = safeEqual(String(username).toLowerCase().trim(), env.admin.username);
  const passOk = safeEqual(String(password), env.admin.password);
  if (!userOk || !passOk) throw new HttpError(401, "Invalid username or password");

  const token = jwt.sign({ sub: env.admin.username, sv: sessionVersion() }, env.jwtSecret, { algorithm: "HS256", expiresIn: `${SESSION_DAYS}d` });
  res.cookie(AUTH_COOKIE, token, { ...authCookieOptions, maxAge: SESSION_DAYS * DAY_MS });
  res.json({ user: { username: env.admin.username } });
}

export function logout(_req, res) {
  res.clearCookie(AUTH_COOKIE, authCookieOptions);
  res.json({ message: "Logged out" });
}

export function me(req, res) {
  res.json({ user: { username: req.username } });
}
