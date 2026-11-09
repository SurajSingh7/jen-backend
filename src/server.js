// Local server (npm run dev / npm run pm2). On Vercel only app.js is used.
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import app from "./app.js";

async function start() {
  await connectDB();
  app.listen(env.port, () => console.log(`Jen Pathology backend running on http://localhost:${env.port}`));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
