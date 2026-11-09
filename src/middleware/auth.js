import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { fingerprint } from "../utils/secure.js";
import { HttpError } from "../utils/httpError.js";

export const AUTH_COOKIE = "jen_token";
export const SESSION_DAYS = 30;

export const authCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: "lax",
  path: "/",
};

// Changes when the username or password in .env changes, which ends every existing session
export const sessionVersion = () => fingerprint(`${env.admin.username}:${env.admin.password}`);

// For public pages that only need to know who is looking; never throws
export function isAdminRequest(req) {
  try {
    return jwt.verify(req.cookies?.[AUTH_COOKIE] ?? "", env.jwtSecret, { algorithms: ["HS256"] }).sv === sessionVersion();
  } catch {
    return false;
  }
}

// Single admin: a valid cookie with the current session version is enough (no DB lookup)
export function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw new HttpError(401, "Not logged in");

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    payload = null;
  }
  if (!payload || payload.sv !== sessionVersion()) {
    res.clearCookie(AUTH_COOKIE, authCookieOptions);
    throw new HttpError(401, "Session expired, please log in again");
  }

  req.username = payload.sub;
  next();
}
