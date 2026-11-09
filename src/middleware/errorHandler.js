import { env } from "../config/env.js";

export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON" });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(", ") });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid id" });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? err.keyPattern ?? {})[0] ?? "value";
    return res.status(409).json({ message: `This ${field} already exists` });
  }

  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 && env.isProd ? "Something went wrong" : err.message,
    ...(status < 500 ? err.extra : undefined),
  });
}
