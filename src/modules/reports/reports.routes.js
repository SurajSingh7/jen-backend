import { randomBytes } from "crypto";
import { Router } from "express";
import mongoose from "mongoose";
import Report, { Patient } from "./report.model.js";
import Test from "../tests/test.model.js";
import Doctor from "../doctors/doctor.model.js";
import { getSettings } from "../settings/settings.routes.js";
import { changesBetween, detailsOf, flagFor, moneyFor, rangeFields, statusFor } from "./report.logic.js";
import { HttpError } from "../../utils/httpError.js";
import { str, isId, escapeRegex, round2 } from "../../utils/clean.js";

const router = Router();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 50;

async function nextLabNo() {
  const [last, settings] = await Promise.all([Report.findOne().sort({ labNo: -1 }).select("labNo"), getSettings()]);
  return Math.max((last?.labNo ?? 0) + 1, settings.startLabNo);
}

function cleanInfo(body) {
  const info = {
    title: str(body?.title, 20),
    name: str(body?.name, 100),
    mobile: str(body?.mobile, 15),
    age: Number(body?.age),
    ageType: body?.ageType,
    gender: body?.gender,
  };
  if (!info.name) throw new HttpError(400, "Enter the patient name");
  if (!Number.isFinite(info.age) || info.age < 0 || info.age > 150) throw new HttpError(400, "Enter a valid age");
  if (!["Years", "Months", "Days"].includes(info.ageType)) throw new HttpError(400, "Select a valid age type");
  if (!["Male", "Female", "Other"].includes(info.gender)) throw new HttpError(400, "Select a gender");
  return info;
}

// Same name + mobile = the same patient; without a mobile each entry is a new patient
async function linkPatient(info) {
  if (info.mobile) {
    const found = await Patient.findOneAndUpdate({ mobile: info.mobile, name: info.name }, info, { new: true }).collation({ locale: "en", strength: 2 });
    if (found) return found._id;
  }
  return (await Patient.create(info))._id;
}

const newParam = (p, info) => ({
  paramId: String(p._id),
  name: p.name,
  unit: p.unit,
  type: p.type,
  bold: p.bold,
  ...rangeFields(p, info),
  result: p.type === "heading" ? "" : p.defaultValue,
  flag: "",
});

// Keeps what the report already has; new tests / parameters are copied from the Tests list
async function buildTests(input, info, existing) {
  const rows = (Array.isArray(input) ? input : []).filter((t) => isId(t?.testId));
  if (!rows.length) throw new HttpError(400, "Select at least one test");

  const masters = await Test.find({ _id: { $in: rows.map((t) => t.testId) } }).lean();
  const masterOf = new Map(masters.map((m) => [String(m._id), m]));
  const oldOf = new Map((existing?.tests ?? []).map((t) => [String(t.test), t.toObject()]));
  const demographicsChanged = existing && (existing.patientInfo.gender !== info.gender || existing.patientInfo.age !== info.age || existing.patientInfo.ageType !== info.ageType);
  let addedParam = false;

  const tests = rows.map(({ testId, paramIds }) => {
    const master = masterOf.get(testId);
    const old = oldOf.get(testId);
    if (!master && !old) throw new HttpError(400, "A selected test is no longer in the list");
    const wanted = new Set((Array.isArray(paramIds) ? paramIds : []).map(String));
    const oldParams = new Map((old?.params ?? []).map((p) => [p.paramId, p]));
    const masterParams = new Map((master?.parameters ?? []).map((p) => [String(p._id), p]));
    const order = old ? [...oldParams.keys(), ...masterParams.keys()] : [...masterParams.keys()];

    const params = [...new Set(order)]
      .filter((id) => wanted.has(id))
      .map((id) => {
        const kept = oldParams.get(id);
        const parameter = masterParams.get(id);
        if (!kept) {
          addedParam = true;
          return newParam(parameter, info);
        }
        if (demographicsChanged && parameter) {
          const range = rangeFields(parameter, info);
          return { ...kept, ...range, flag: flagFor(kept.result, range.min, range.max) };
        }
        return kept;
      });
    if (!params.length) throw new HttpError(400, `${(old ?? master).name}: select at least one parameter`);

    const source = old ?? master;
    return { test: testId, group: source.group, name: source.name, printHeading: source.printHeading, mrp: source.mrp, method: source.method, notes: source.notes, params };
  });
  return { tests, addedParam };
}

async function applyBody(report, body) {
  const info = cleanInfo(body?.patient);
  if (info.mobile && info.mobile !== report.patientInfo?.mobile && !/^[6-9]\d{9}$/.test(info.mobile)) throw new HttpError(400, "Enter a valid 10 digit mobile number");
  const date = String(body?.date ?? "");
  if (!DATE.test(date)) throw new HttpError(400, "Enter a valid date");

  let doctor = null;
  if (body?.doctor) {
    doctor = await Doctor.findById(body.doctor);
    if (!doctor) throw new HttpError(400, "Doctor not found");
  }

  const added = report.isNew;
  const before = added ? null : detailsOf(report);
  const { tests, addedParam } = await buildTests(body?.tests, info, added ? null : report);
  const basic = round2(tests.reduce((sum, t) => sum + (t.mrp || 0), 0));
  const { discountBase, commissionBase } = await getSettings();
  const { bill, commission } = moneyFor({ ...body?.bill, basic, hasDoctor: Boolean(doctor), discountBase, commissionBase, percent: body?.commission?.percent });
  if (bill.received > bill.net) throw new HttpError(400, "Received amount cannot be more than the net amount");

  report.date = date;
  report.patient = await linkPatient(info);
  report.patientInfo = info;
  report.doctor = doctor?._id ?? null;
  report.doctorName = doctor?.name ?? "Self";
  report.sampleType = str(body?.sampleType, 60);
  report.tests = tests;
  report.bill = { ...bill, extraNote: bill.extra > 0 ? str(body?.bill?.extraNote, 60) : "" };
  report.commission = commission;
  if (addedParam) report.resultsSaved = false;
  report.status = statusFor(report.resultsSaved, tests);

  const changes = changesBetween(before, detailsOf(report));
  if (added || changes.length) report.history.push({ action: added ? "Patient added" : "Patient details changed", changes });
}

function labNoFrom(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Enter a valid Lab No");
  return n;
}

function listFilter(query) {
  const filter = {};
  const from = DATE.test(query.from ?? "") ? query.from : null;
  const to = DATE.test(query.to ?? "") ? query.to : null;
  if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (["Pending", "Complete"].includes(query.status)) filter.status = query.status;
  if (query.payment === "Paid") filter["bill.balance"] = { $lte: 0 };
  if (query.payment === "Partial") Object.assign(filter, { "bill.balance": { $gt: 0 }, "bill.received": { $gt: 0 } });
  if (query.payment === "Unpaid") Object.assign(filter, { "bill.balance": { $gt: 0 }, "bill.received": { $lte: 0 } });
  if (isId(query.doctor)) filter.doctor = query.doctor;
  if (query.doctor === "self") filter.doctor = null;
  if (isId(query.test)) filter["tests.test"] = query.test;
  const q = str(query.q, 60);
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ "patientInfo.name": re }, { "patientInfo.mobile": re }, ...(/^\d+$/.test(q) ? [{ labNo: Number(q) }] : [])];
  }
  return filter;
}

// aggregate() doesn't convert id strings the way find() does
function aggregateMatch(filter) {
  const match = { ...filter };
  if (filter.doctor) match.doctor = new mongoose.Types.ObjectId(filter.doctor);
  if (filter["tests.test"]) match["tests.test"] = new mongoose.Types.ObjectId(filter["tests.test"]);
  return match;
}

router.get("/", async (req, res) => {
  const filter = listFilter(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const perPage = [10, 25, 50, 75, 100].includes(Number(req.query.limit)) ? Number(req.query.limit) : PAGE_SIZE;
  const balanceDue = { $gt: ["$bill.balance", 0] };
  const anyReceived = { $gt: ["$bill.received", 0] };
  const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
  const [reports, total, [sums], [payment], [result]] = await Promise.all([
    Report.find(filter).sort({ date: -1, labNo: -1 }).skip((page - 1) * perPage).limit(perPage).select("labNo date patientInfo doctorName bill commission status tests.name"),
    Report.countDocuments(filter),
    Report.aggregate([{ $match: aggregateMatch(filter) }, { $group: { _id: null, net: { $sum: "$bill.net" }, received: { $sum: "$bill.received" }, balance: { $sum: "$bill.balance" }, pending: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } } } }]),
    // Counts on the payment buttons ignore the payment filter itself
    Report.aggregate([{ $match: aggregateMatch(listFilter({ ...req.query, payment: "" })) }, { $group: { _id: null, Paid: countIf({ $not: [balanceDue] }), Partial: countIf({ $and: [balanceDue, anyReceived] }), Unpaid: countIf({ $and: [balanceDue, { $not: [anyReceived] }] }) } }]),
    Report.aggregate([{ $match: aggregateMatch(listFilter({ ...req.query, status: "" })) }, { $group: { _id: null, Pending: countIf({ $eq: ["$status", "Pending"] }), Complete: countIf({ $eq: ["$status", "Complete"] }) } }]),
  ]);
  res.json({ reports, total, page, pages: Math.max(1, Math.ceil(total / perPage)), totals: { net: sums?.net ?? 0, received: sums?.received ?? 0, balance: sums?.balance ?? 0, pending: sums?.pending ?? 0 }, payment: { Paid: payment?.Paid ?? 0, Partial: payment?.Partial ?? 0, Unpaid: payment?.Unpaid ?? 0 }, result: { Pending: result?.Pending ?? 0, Complete: result?.Complete ?? 0 } });
});

router.get("/next-lab-no", async (_req, res) => {
  res.json({ labNo: await nextLabNo() });
});

router.post("/", async (req, res) => {
  const report = new Report({ labNo: req.body?.labNo ? labNoFrom(req.body.labNo) : await nextLabNo() });
  await applyBody(report, req.body);
  await report.save();
  res.status(201).json({ report });
});

router.get("/:id", async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new HttpError(404, "Report not found");
  res.json({ report });
});

router.patch("/:id", async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new HttpError(404, "Report not found");
  if (req.body?.labNo) report.labNo = labNoFrom(req.body.labNo);
  await applyBody(report, req.body);
  await report.save();
  res.json({ report });
});

router.patch("/:id/results", async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new HttpError(404, "Report not found");
  const values = new Map((Array.isArray(req.body?.results) ? req.body.results : []).map((r) => [String(r?.paramId), str(r?.value, 200)]));
  const changes = [];
  for (const test of report.tests) {
    for (const param of test.params) {
      if (param.type !== "heading" && values.has(param.paramId)) {
        const value = values.get(param.paramId);
        if (value !== param.result) changes.push({ field: `${test.name}: ${param.name}`, from: param.result, to: value });
        param.result = value;
        param.flag = flagFor(param.result, param.min, param.max);
      }
    }
  }
  if (changes.length) report.history.push({ action: report.resultsSaved ? "Result modified" : "Result entered", changes });
  report.resultsSaved = true;
  report.status = statusFor(true, report.tests);
  await report.save();
  res.json({ report });
});

const SHARE_DAYS = 30;
const SHARE_LABELS = { report: "Report", bill: "Customer Bill", doctor: "Report (to doctor)" };

const newShare = (now) => ({ token: randomBytes(24).toString("base64url"), expiresAt: new Date(now.getTime() + SHARE_DAYS * 86400000), viewCount: 0 });

// Makes the link ready before the click, so the browser can open WhatsApp straight from it.
// `renew` replaces a live link, which ends the old one.
router.post("/:id/share/prepare", async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new HttpError(404, "Report not found");
  const kind = req.body?.kind;
  if (!SHARE_LABELS[kind]) throw new HttpError(400, "Select a document");
  const now = new Date();
  const old = report.shares?.[kind];
  if (req.body?.renew || !old?.token || old.expiresAt <= now) {
    report.set(`shares.${kind}`, newShare(now));
    await report.save();
  }
  res.json({ shares: report.shares });
});

// Records that the prepared link was sent
router.post("/:id/share", async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new HttpError(404, "Report not found");
  const kind = req.body?.kind;
  if (!SHARE_LABELS[kind]) throw new HttpError(400, "Select a document");
  const mobile = str(req.body?.mobile, 15);
  if (!/^[6-9]\d{9}$/.test(mobile)) throw new HttpError(400, "Enter a valid 10 digit mobile number");

  const now = new Date();
  const old = report.shares?.[kind];
  const live = old?.token && old.expiresAt > now;
  const firstSend = !live || !old.sentAt;
  // The 30 days start from the first send, not from when the page was opened
  const base = live ? old.toObject() : newShare(now);
  report.set(`shares.${kind}`, { ...base, ...(firstSend ? { expiresAt: new Date(now.getTime() + SHARE_DAYS * 86400000) } : {}), sentAt: now, sentTo: mobile, letterhead: req.body?.letterhead !== false });
  report.history.push({
    action: "Link sent on WhatsApp",
    changes: [
      { field: "Document", from: "", to: SHARE_LABELS[kind] },
      { field: "Send to", from: "", to: mobile },
    ],
  });
  await report.save();
  res.json({ share: report.shares[kind], shares: report.shares });
});

// Money collected later against the remaining balance
router.patch("/:id/payment", async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new HttpError(404, "Report not found");
  const amount = round2(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "Enter a valid amount");
  if (amount > report.bill.balance) throw new HttpError(400, "Amount cannot be more than the balance due");
  if (!["Cash", "UPI", "Bank"].includes(req.body?.mode)) throw new HttpError(400, "Select a payment mode");

  const { received, balance } = report.bill;
  report.bill.received = round2(received + amount);
  report.bill.balance = round2(balance - amount);
  const note = str(req.body?.note, 200);
  report.history.push({
    action: "Payment received",
    changes: [
      { field: "Amount paid", from: "", to: String(amount) },
      { field: "Mode", from: "", to: req.body.mode },
      { field: "Received", from: String(received), to: String(report.bill.received) },
      { field: "Balance", from: String(balance), to: String(report.bill.balance) },
      ...(note ? [{ field: "Note", from: "", to: note }] : []),
    ],
  });
  await report.save();
  res.json({ report });
});

router.delete("/:id", async (req, res) => {
  const report = await Report.findByIdAndDelete(req.params.id);
  if (!report) throw new HttpError(404, "Report not found");
  res.json({ deleted: true });
});

export default router;
