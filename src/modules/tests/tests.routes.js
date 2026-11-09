import { Router } from "express";
import Test, { RANGE_WHO } from "./test.model.js";
import { HttpError } from "../../utils/httpError.js";
import { str, numOrNull, money, isId } from "../../utils/clean.js";

const cleanRanges = (ranges) =>
  (Array.isArray(ranges) ? ranges : [])
    .filter((r) => RANGE_WHO.includes(r?.who))
    .map((r) => ({ who: r.who, min: numOrNull(r.min), max: numOrNull(r.max), text: str(r.text, 80) }))
    .filter((r) => r.min !== null || r.max !== null || r.text);

const cleanParameter = (p) => ({
  ...(isId(p?._id) ? { _id: p._id } : {}), // kept so old report links to this parameter stay valid
  name: str(p?.name, 100),
  unit: str(p?.unit, 30),
  defaultValue: str(p?.defaultValue, 100),
  type: p?.type === "heading" ? "heading" : "value",
  bold: Boolean(p?.bold),
  ranges: p?.type === "heading" ? [] : cleanRanges(p?.ranges),
});

function fields(body) {
  const parameters = (Array.isArray(body?.parameters) ? body.parameters : []).map(cleanParameter);
  if (!parameters.length) throw new HttpError(400, "Add at least one parameter");
  return {
    group: str(body?.group, 60),
    name: str(body?.name, 120),
    printHeading: str(body?.printHeading, 120),
    shortName: str(body?.shortName, 40),
    mrp: money(body?.mrp),
    cost: money(body?.cost),
    method: str(body?.method, 500),
    notes: str(body?.notes, 3000),
    parameters,
  };
}

const router = Router();

router.get("/", async (_req, res) => {
  res.json({ tests: await Test.find().sort({ group: 1, name: 1 }) });
});

router.post("/", async (req, res) => {
  res.status(201).json({ test: await Test.create(fields(req.body)) });
});

router.get("/:id", async (req, res) => {
  const test = await Test.findById(req.params.id);
  if (!test) throw new HttpError(404, "Test not found");
  res.json({ test });
});

router.patch("/:id", async (req, res) => {
  const test = await Test.findById(req.params.id);
  if (!test) throw new HttpError(404, "Test not found");
  test.set(fields(req.body));
  await test.save();
  res.json({ test });
});

router.post("/:id/copy", async (req, res) => {
  const source = await Test.findById(req.params.id).lean();
  if (!source) throw new HttpError(404, "Test not found");
  let name = `${source.name} (Copy)`;
  for (let i = 2; await Test.exists({ name }).collation({ locale: "en", strength: 2 }); i++) name = `${source.name} (Copy ${i})`;
  const { _id, createdAt, updatedAt, __v, ...rest } = source;
  const parameters = rest.parameters.map(({ _id: _p, ...p }) => p);
  res.status(201).json({ test: await Test.create({ ...rest, name, parameters }) });
});

// Reports keep their own copy of each test, so old reports are not affected
router.delete("/:id", async (req, res) => {
  const test = await Test.findByIdAndDelete(req.params.id);
  if (!test) throw new HttpError(404, "Test not found");
  res.json({ deleted: true });
});

export default router;
