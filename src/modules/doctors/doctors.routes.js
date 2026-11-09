import { Router } from "express";
import Doctor from "./doctor.model.js";
import Report from "../reports/report.model.js";
import CommissionPayment from "../accounts/commissionPayment.model.js";
import { HttpError } from "../../utils/httpError.js";
import { str } from "../../utils/clean.js";

const router = Router();

const fields = (body) => ({
  name: str(body?.name, 80),
  phone: str(body?.phone, 20),
  clinic: str(body?.clinic, 120),
  commissionPercent: Number(body?.commissionPercent) || 0,
  ...(typeof body?.active === "boolean" ? { active: body.active } : {}),
});

router.get("/", async (_req, res) => {
  res.json({ doctors: await Doctor.find().sort({ name: 1 }) });
});

router.post("/", async (req, res) => {
  res.status(201).json({ doctor: await Doctor.create(fields(req.body)) });
});

router.patch("/:id", async (req, res) => {
  const doctor = await Doctor.findByIdAndUpdate(req.params.id, fields(req.body), { new: true, runValidators: true });
  if (!doctor) throw new HttpError(404, "Doctor not found");
  res.json({ doctor });
});

// A doctor with entries stays in the database (inactive), so old accounts remain correct
router.delete("/:id", async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) throw new HttpError(404, "Doctor not found");
  if ((await Report.exists({ doctor: doctor._id })) || (await CommissionPayment.exists({ doctor: doctor._id }))) {
    doctor.active = false;
    await doctor.save();
    return res.json({ deactivated: true, doctor });
  }
  await doctor.deleteOne();
  res.json({ deleted: true });
});

export default router;
