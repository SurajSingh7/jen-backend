import { Router } from "express";
import Report from "./report.model.js";
import { getSettings } from "../settings/settings.routes.js";
import { isAdminRequest } from "../../middleware/auth.js";
import { HttpError } from "../../utils/httpError.js";

// No login here: the long random token in the link is the only key.
const router = Router();

const LETTERHEAD = ["labNameLatin", "labNameLocal", "regNo", "phone", "address", "doctorName", "doctorDegree", "technicianName", "technicianDegree", "footerNote", "labTime", "topSpaceMm", "bottomSpaceMm"];

const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, source[key]]));

// Only what the printed page shows. Never mobile, commission, doctor/lab split or history.
function publicCopy(report, kind) {
  const base = {
    labNo: report.labNo,
    date: report.date,
    patientInfo: pick(report.patientInfo, ["title", "name", "age", "ageType", "gender"]),
    doctorName: report.doctorName,
    sampleType: report.sampleType,
  };
  if (kind === "bill") {
    return { ...base, tests: report.tests.map((t) => ({ name: t.name, mrp: t.mrp })), bill: pick(report.bill, ["basic", "extra", "extraNote", "discountAmount", "net", "received", "balance"]) };
  }
  return {
    ...base,
    tests: report.tests.map((t) => ({
      name: t.name,
      printHeading: t.printHeading,
      method: t.method,
      notes: t.notes,
      params: t.params.map((p) => pick(p, ["paramId", "name", "unit", "type", "bold", "rangeText", "result", "flag"])),
    })),
  };
}

router.get("/r/:token", async (req, res) => {
  const { token } = req.params;
  if (!/^[\w-]{20,64}$/.test(token)) throw new HttpError(404, "This link is not valid");
  const report = await Report.findOne({ $or: [{ "shares.report.token": token }, { "shares.bill.token": token }, { "shares.doctor.token": token }] });
  if (!report) throw new HttpError(404, "This link is not valid");

  const kind = ["report", "bill", "doctor"].find((k) => report.shares[k]?.token === token);
  const share = report.shares[kind];
  if (share.expiresAt <= new Date()) throw new HttpError(410, "This link has expired. Please ask the lab for a new one.");

  // The lab checking its own link must not count as the patient having seen it
  if (!isAdminRequest(req)) {
    if (!share.viewedAt) {
      share.viewedAt = new Date();
      report.history.push({ action: `Link viewed by ${kind === "doctor" ? "doctor" : "patient"}`, changes: [{ field: "Document", from: "", to: kind === "bill" ? "Customer Bill" : "Report" }] });
    }
    share.viewCount += 1;
    await report.save();
  }

  res.json({ kind: kind === "bill" ? "bill" : "report", letterhead: share.letterhead !== false, report: publicCopy(report, kind), settings: pick(await getSettings(), LETTERHEAD) });
});

export default router;
