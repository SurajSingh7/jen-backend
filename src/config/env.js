import dotenv from "dotenv";

dotenv.config({ quiet: true });

const required = ["MONGODB_URI", "JWT_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  // Throw instead of process.exit: on Vercel the error then shows up in the function logs
  throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

// Weak secrets are refused in production
const problems = [];
if (process.env.JWT_SECRET.length < 32) problems.push("JWT_SECRET must be at least 32 characters");
if (process.env.ADMIN_PASSWORD.length < 8) problems.push("ADMIN_PASSWORD must be at least 8 characters");
if (problems.length) {
  if (process.env.NODE_ENV === "production") throw new Error(problems.join("; "));
  console.warn(`Weak settings (refused in production): ${problems.join("; ")}`);
}

export const env = {
  port: Number(process.env.PORT) || 5400,
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3004",
  admin: {
    username: process.env.ADMIN_USERNAME.toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD,
  },
};
