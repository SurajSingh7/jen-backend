import { Router } from "express";
import mongoose from "mongoose";
import CommissionPayment from "./commissionPayment.model.js";
import Doctor from "../doctors/doctor.model.js";
import Report from "../reports/report.model.js";
import { HttpError } from "../../utils/httpError.js";
import { isId, round2, str } from "../../utils/clean.js";

const router = Router();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 50;
const MODES = ["Cash", "UPI", "Bank"];

function dateRange({ from, to }) {
  const date = { ...(DATE.test(from ?? "") ? { $gte: from } : {}), ...(DATE.test(to ?? "") ? { $lte: to } : {}) };
  return Object.keys(date).length ? { date } : {};
}

// Both return a Map of doctor id -> totals
async function earnings(match) {
  const rows = await Report.aggregate([{ $match: { doctor: { $ne: null }, ...match } }, { $group: { _id: "$doctor", patients: { $sum: 1 }, amount: { $sum: "$commission.amount" }, updated: { $max: "$updatedAt" } } }]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

async function payments(match) {
  const rows = await CommissionPayment.aggregate([{ $match: match }, { $group: { _id: "$doctor", amount: { $sum: "$amount" }, updated: { $max: "$updatedAt" } } }]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

async function allTimeOf(id) {
  const doctor = new mongoose.Types.ObjectId(id);
  const [earned, paid] = await Promise.all([earnings({ doctor }), payments({ doctor })]);
  const earnedTotal = earned.get(id)?.amount ?? 0;
  const paidTotal = paid.get(id)?.amount ?? 0;
  return { earned: round2(earnedTotal), paid: round2(paidTotal), balance: round2(earnedTotal - paidTotal) };
}

const statusOf = ({ paid, balance }) => (balance <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid");

// One line per doctor. Patients, Earned and Paid follow the dates; Balance and Status are all time.
router.get("/doctors", async (req, res) => {
  const range = dateRange(req.query);
  const [doctors, earnedAll, earnedRange, paidAll, paidRange] = await Promise.all([Doctor.find().sort({ name: 1 }).select("name clinic").lean(), earnings({}), earnings(range), payments({}), payments(range)]);

  const rows = doctors
    .map((d) => {
      const id = String(d._id);
      const allTime = { earned: earnedAll.get(id)?.amount ?? 0, paid: paidAll.get(id)?.amount ?? 0 };
      const balance = round2(allTime.earned - allTime.paid);
      return { _id: id, name: d.name, clinic: d.clinic, patients: earnedRange.get(id)?.patients ?? 0, earned: round2(earnedRange.get(id)?.amount ?? 0), paid: round2(paidRange.get(id)?.amount ?? 0), balance, status: statusOf({ paid: allTime.paid, balance }), active: allTime.earned > 0 || allTime.paid > 0, updated: Math.max(earnedAll.get(id)?.updated?.getTime() ?? 0, paidAll.get(id)?.updated?.getTime() ?? 0) };
    })
    .filter((row) => row.active)
    .sort((a, b) => b.updated - a.updated); // latest entry or payment first

  res.json({ rows });
});

router.get("/doctors/:id", async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Doctor not found");
  const doctor = await Doctor.findById(req.params.id).select("name clinic phone commissionPercent");
  if (!doctor) throw new HttpError(404, "Doctor not found");

  const range = dateRange(req.query);
  const filter = { doctor: doctor._id, ...range };
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = [10, 25, 50, 75, 100].includes(Number(req.query.limit)) ? Number(req.query.limit) : PAGE_SIZE;
  const [entries, total, list, [sum], allTime] = await Promise.all([
    Report.find(filter).sort({ date: -1, labNo: -1 }).skip((page - 1) * perPage).limit(perPage).select("labNo date patientInfo.name bill.basic bill.extra commission"),
    Report.countDocuments(filter),
    CommissionPayment.find(filter).sort({ date: -1, createdAt: -1 }),
    Report.aggregate([{ $match: filter }, { $group: { _id: null, amount: { $sum: "$commission.amount" } } }]),
    allTimeOf(req.params.id),
  ]);

  res.json({
    doctor,
    entries,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    payments: list,
    range: { patients: total, earned: round2(sum?.amount ?? 0), paid: round2(list.reduce((n, p) => n + p.amount, 0)) },
    balance: allTime.balance,
  });
});

router.post("/doctors/:id/payments", async (req, res) => {
  if (!isId(req.params.id) || !(await Doctor.exists({ _id: req.params.id }))) throw new HttpError(404, "Doctor not found");
  const date = String(req.body?.date ?? "");
  if (!DATE.test(date)) throw new HttpError(400, "Enter a valid date");
  const amount = round2(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "Enter a valid amount");
  if (!MODES.includes(req.body?.mode)) throw new HttpError(400, "Select a payment mode");
  const { balance } = await allTimeOf(req.params.id);
  if (amount > balance) throw new HttpError(400, "Amount cannot be more than the commission balance");

  const payment = await CommissionPayment.create({ doctor: req.params.id, date, amount, mode: req.body.mode, note: str(req.body?.note, 200) });
  res.status(201).json({ payment });
});

router.delete("/payments/:id", async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, "Payment not found");
  const payment = await CommissionPayment.findByIdAndDelete(req.params.id);
  if (!payment) throw new HttpError(404, "Payment not found");
  res.json({ deleted: true });
});

export default router;
