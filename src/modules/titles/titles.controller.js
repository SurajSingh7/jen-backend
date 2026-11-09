import Title from "./title.model.js";
import { HttpError } from "../../utils/httpError.js";

const DEFAULT_TITLES = [
  { name: "Mr", gender: "Male" },
  { name: "Mrs", gender: "Female" },
  { name: "Miss", gender: "Female" },
  { name: "Master", gender: "Male" },
  { name: "Baby", gender: "" },
  { name: "Dr", gender: "" },
];

const fields = (body) => ({ name: String(body?.name ?? "").trim(), gender: String(body?.gender ?? "") });

export async function listTitles(_req, res) {
  res.json({ titles: await Title.find().sort({ createdAt: 1, _id: 1 }) });
}

export async function createTitle(req, res) {
  res.status(201).json({ title: await Title.create(fields(req.body)) });
}

export async function updateTitle(req, res) {
  const title = await Title.findByIdAndUpdate(req.params.id, fields(req.body), { new: true, runValidators: true });
  if (!title) throw new HttpError(404, "Title not found");
  res.json({ title });
}

export async function deleteTitle(req, res) {
  const title = await Title.findByIdAndDelete(req.params.id);
  if (!title) throw new HttpError(404, "Title not found");
  res.json({ message: "Deleted" });
}

// Starter list, only offered while the list is empty
export async function addDefaultTitles(_req, res) {
  if (await Title.exists({})) throw new HttpError(409, "Titles already exist");
  await Title.insertMany(DEFAULT_TITLES);
  res.status(201).json({ titles: await Title.find().sort({ createdAt: 1, _id: 1 }) });
}
