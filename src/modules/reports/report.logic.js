import { money, round2 } from "../../utils/clean.js";
import { HttpError } from "../../utils/httpError.js";

export const CHILD_AGE_YEARS = 12;

// Baby entered in months or days always counts as a child
const isChild = ({ age, ageType }) => ageType !== "Years" || age < CHILD_AGE_YEARS;

// Child range first (if the test has one), then the patient's gender, then the common range
export function pickRange(ranges, info) {
  const of = (who) => ranges.find((r) => r.who === who);
  return (isChild(info) && of("Child")) || of(info.gender) || of("All") || null;
}

export function rangeFields(parameter, info) {
  const range = pickRange(parameter.ranges ?? [], info);
  if (!range) return { rangeText: "", min: null, max: null };
  const auto = range.min !== null && range.max !== null ? `${range.min}-${range.max}` : "";
  return { rangeText: range.text || auto, min: range.min, max: range.max };
}

export function flagFor(result, min, max) {
  const text = String(result ?? "").trim();
  const n = Number(text);
  if (!text || !Number.isFinite(n)) return "";
  if (max !== null && max !== undefined && n > max) return "H";
  if (min !== null && min !== undefined && n < min) return "L";
  return "";
}

function capped(amount, limit, message) {
  const value = money(amount);
  if (value > limit) throw new HttpError(400, message);
  return value;
}

/*
 * Self: one discount, taken on Basic or on Basic + Extra (Settings).
 * Doctor: commission is a % of Basic or of Basic + Extra (Settings). The doctor and
 * the lab can each give a discount, and each comes out of that side's own share.
 */
export function moneyFor({ basic, extra: rawExtra, hasDoctor, discountBase, commissionBase, percent, discount, doctorDiscount, labDiscount, received }) {
  const extra = basic > 0 ? money(rawExtra) : 0;
  const gross = round2(basic + extra);
  const paid = money(received);
  const finish = (fields, commission, labEarning) => {
    const net = round2(gross - fields.discountAmount);
    return { bill: { basic, extra, discountBase, commissionBase, ...fields, net, received: paid, balance: round2(net - paid), labEarning }, commission };
  };

  if (!hasDoctor) {
    const base = discountBase === "basic_extra" ? gross : basic;
    const amount = capped(discount, base, "Discount cannot be more than the amount it applies to");
    return finish(
      { discountPercent: base ? round2((amount / base) * 100) : 0, discountAmount: amount, doctorDiscount: 0, labDiscount: amount },
      { percent: 0, gross: 0, amount: 0 },
      round2(gross - amount)
    );
  }

  const pct = Math.min(money(percent), 100);
  const doctorShare = round2(((commissionBase === "basic_extra" ? gross : basic) * pct) / 100);
  const labShare = round2(gross - doctorShare);
  const fromDoctor = capped(doctorDiscount, doctorShare, "Doctor discount cannot be more than the doctor's share");
  const fromLab = capped(labDiscount, labShare, "Lab discount cannot be more than the lab's share");
  const total = round2(fromDoctor + fromLab);
  return finish(
    { discountPercent: gross ? round2((total / gross) * 100) : 0, discountAmount: total, doctorDiscount: fromDoctor, labDiscount: fromLab },
    { percent: pct, gross: doctorShare, amount: round2(doctorShare - fromDoctor) },
    round2(labShare - fromLab)
  );
}

// The entry's details as label -> text, used to record what changed
export function detailsOf(report) {
  const { patientInfo: i, bill: b, commission: c } = report;
  const details = {
    Date: report.date,
    Title: i.title,
    "Patient name": i.name,
    Mobile: i.mobile,
    Age: `${i.age} ${i.ageType}`,
    Gender: i.gender,
    Doctor: report.doctorName,
    Sample: report.sampleType,
    Tests: report.tests.map((t) => `${t.name} (${t.params.length})`).join(", "),
    "Basic amount": b.basic,
    "Extra charge note": b.extraNote,
    "Extra charge": b.extra,
    Discount: b.discountAmount,
    "Doctor discount": b.doctorDiscount,
    "Lab discount": b.labDiscount,
    "Doctor commission %": c.percent,
    "Patient pays": b.net,
    Received: b.received,
    Balance: b.balance,
  };
  return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, String(value ?? "")]));
}

// With no `before` (a new entry), empty and zero values are left out
export function changesBetween(before, after) {
  return Object.keys(after)
    .filter((field) => (before ? before[field] !== after[field] : !["", "0"].includes(after[field])))
    .map((field) => ({ field, from: before?.[field] ?? "", to: after[field] }));
}

export function statusFor(resultsSaved, tests) {
  // Not every parameter is always tested, so one saved value is enough
  const anyFilled = tests.some((t) => t.params.some((p) => p.type !== "heading" && String(p.result ?? "").trim()));
  return resultsSaved && anyFilled ? "Complete" : "Pending";
}
