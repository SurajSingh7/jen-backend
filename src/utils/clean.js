import mongoose from "mongoose";

export const str = (value, max = 200) => String(value ?? "").trim().slice(0, max);

// Empty / invalid becomes null (a range limit that isn't set)
export function numOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function money(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const isId = (value) => mongoose.isValidObjectId(value);

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
