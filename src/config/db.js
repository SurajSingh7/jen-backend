import mongoose from "mongoose";
import { env } from "./env.js";

// One shared connection. On Vercel a warm function instance reuses it across requests.
let connecting = null;

export function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connecting) {
    connecting = mongoose
      .connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 })
      .then(() => console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`))
      .catch((err) => {
        connecting = null; // let the next request try again
        throw err;
      });
  }
  return connecting;
}
