import { Router } from "express";
import mongoose from "mongoose";
import { str } from "../../utils/clean.js";

// One document holds the lab's letterhead details and app defaults
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "app", unique: true },
    labNameLatin: { type: String, default: "JEN" },
    labNameLocal: { type: String, default: "पैथोलॉजी" },
    regNo: { type: String, default: "RMEE2662679" },
    phone: { type: String, default: "8299017168" },
    address: { type: String, default: "चण्डी होटल (तिराहा) राबर्ट्सगंज, जिला- सोनभद्र (उ0प्र0) 231216" },
    doctorName: { type: String, default: "Dr. D.K. Varma" },
    doctorDegree: { type: String, default: "M.B.B.S." },
    technicianName: { type: String, default: "Pooja Singh" },
    technicianDegree: { type: String, default: "D.M.L.T." },
    footerNote: { type: String, default: "होम कलेक्शन सुविधा उपलब्ध है।" },
    labTime: { type: String, default: "Lab Time: 08 AM To 09 PM" },
    topSpaceMm: { type: Number, default: 62 },
    bottomSpaceMm: { type: Number, default: 16 },
    startLabNo: { type: Number, default: 1 },
    discountBase: { type: String, enum: ["basic", "basic_extra"], default: "basic" }, // Self entries only
    commissionBase: { type: String, enum: ["basic", "basic_extra"], default: "basic" }, // Doctor entries only
  },
  { timestamps: true }
);
export const Settings = mongoose.model("Settings", settingsSchema);

export const getSettings = () => Settings.findOneAndUpdate({ key: "app" }, { $setOnInsert: { key: "app" } }, { upsert: true, new: true, setDefaultsOnInsert: true });

const TEXT = ["labNameLatin", "labNameLocal", "regNo", "phone", "address", "doctorName", "doctorDegree", "technicianName", "technicianDegree", "footerNote", "labTime"];
const NUMBERS = { topSpaceMm: [10, 120], bottomSpaceMm: [5, 60], startLabNo: [1, 99999999] };

const router = Router();

router.get("/", async (_req, res) => {
  res.json({ settings: await getSettings() });
});

router.patch("/", async (req, res) => {
  const body = req.body ?? {};
  const update = {};
  for (const key of TEXT) if (key in body) update[key] = str(body[key], 200);
  for (const [key, [min, max]] of Object.entries(NUMBERS)) {
    if (key in body) update[key] = Math.min(max, Math.max(min, Math.round(Number(body[key]) || min)));
  }
  for (const key of ["discountBase", "commissionBase"]) {
    if (["basic", "basic_extra"].includes(body[key])) update[key] = body[key];
  }
  await getSettings();
  res.json({ settings: await Settings.findOneAndUpdate({ key: "app" }, update, { new: true }) });
});

export default router;
