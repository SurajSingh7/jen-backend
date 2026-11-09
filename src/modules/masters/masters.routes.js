import { Router } from "express";
import mongoose from "mongoose";
import Test from "../tests/test.model.js";
import { HttpError } from "../../utils/httpError.js";
import { str } from "../../utils/clean.js";

// Simple name lists used in dropdowns: test groups and sample types
const masterSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["group", "sample"], required: true },
    name: { type: String, required: [true, "Name is required"], trim: true, maxlength: 60 },
  },
  { timestamps: true }
);
masterSchema.index({ kind: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
const Master = mongoose.model("Master", masterSchema);

const DEFAULTS = {
  group: ["HEMATOLOGY", "SEROLOGY", "BIOCHEMISTRY", "URINE EXAMINATION", "CLINICAL PATHOLOGY"],
  sample: ["Blood", "Serum", "Urine", "Stool", "Sputum"],
};

const router = Router({ mergeParams: true });

router.use((req, _res, next) => {
  if (!DEFAULTS[req.params.kind]) throw new HttpError(404, "Unknown list");
  next();
});

const list = (kind) => Master.find({ kind }).sort({ name: 1 }).collation({ locale: "en", strength: 2 });

router.get("/", async (req, res) => {
  res.json({ items: await list(req.params.kind) });
});

router.post("/", async (req, res) => {
  res.status(201).json({ item: await Master.create({ kind: req.params.kind, name: str(req.body?.name, 60) }) });
});

router.post("/defaults", async (req, res) => {
  const { kind } = req.params;
  if (await Master.exists({ kind })) throw new HttpError(409, "List already has items");
  await Master.insertMany(DEFAULTS[kind].map((name) => ({ kind, name })));
  res.status(201).json({ items: await list(kind) });
});

router.patch("/:id", async (req, res) => {
  const { kind, id } = req.params;
  const name = str(req.body?.name, 60);
  const item = await Master.findOne({ _id: id, kind });
  if (!item) throw new HttpError(404, "Item not found");
  const oldName = item.name;
  item.name = name;
  await item.save();
  if (kind === "group") await Test.updateMany({ group: oldName }, { group: name });
  res.json({ item });
});

router.delete("/:id", async (req, res) => {
  const { kind, id } = req.params;
  const item = await Master.findOne({ _id: id, kind });
  if (!item) throw new HttpError(404, "Item not found");
  if (kind === "group" && (await Test.exists({ group: item.name }))) {
    throw new HttpError(409, "This group has tests. Move them to another group first.");
  }
  await item.deleteOne();
  res.json({ deleted: true });
});

export default router;
