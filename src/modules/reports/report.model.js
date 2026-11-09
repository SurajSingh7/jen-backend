import mongoose from "mongoose";

const paramSnapshot = new mongoose.Schema(
  {
    paramId: { type: String, required: true },
    name: String,
    unit: String,
    type: { type: String, default: "value" },
    bold: { type: Boolean, default: false },
    rangeText: { type: String, default: "" },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    result: { type: String, default: "" },
    flag: { type: String, enum: ["", "H", "L"], default: "" },
  },
  { _id: false }
);

const testSnapshot = new mongoose.Schema(
  {
    test: { type: mongoose.Schema.Types.ObjectId, ref: "Test" },
    group: String,
    name: String,
    printHeading: String,
    mrp: Number,
    method: String,
    notes: String,
    params: [paramSnapshot],
  },
  { _id: false }
);

const historyEntry = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: String,
    changes: [{ _id: false, field: String, from: String, to: String }],
  },
  { _id: false }
);

// A private link sent to the patient. No file is stored: the page is drawn from this report.
const shareLink = new mongoose.Schema(
  {
    token: String,
    expiresAt: Date,
    sentAt: Date,
    sentTo: String,
    viewedAt: Date,
    viewCount: { type: Number, default: 0 },
    letterhead: { type: Boolean, default: true },
  },
  { _id: false }
);

const patientSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, default: "" },
    age: { type: Number, default: 0 },
    ageType: { type: String, enum: ["Years", "Months", "Days"], default: "Years" },
    gender: { type: String, enum: ["Male", "Female", "Other"], default: "Male" },
  },
  { timestamps: true }
);
patientSchema.index({ mobile: 1, name: 1 });
export const Patient = mongoose.model("Patient", patientSchema);

const reportSchema = new mongoose.Schema(
  {
    labNo: { type: Number, required: true, unique: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
    patientInfo: {
      title: String,
      name: String,
      mobile: String,
      age: Number,
      ageType: String,
      gender: String,
    },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null },
    doctorName: { type: String, default: "Self" },
    sampleType: { type: String, default: "" },
    tests: [testSnapshot],
    bill: {
      basic: { type: Number, default: 0 },
      extra: { type: Number, default: 0 },
      extraNote: { type: String, default: "" },
      discountBase: { type: String, enum: ["basic", "basic_extra"], default: "basic" },
      commissionBase: { type: String, enum: ["basic", "basic_extra"], default: "basic" },
      discountPercent: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 }, // doctorDiscount + labDiscount
      doctorDiscount: { type: Number, default: 0 },
      labDiscount: { type: Number, default: 0 },
      net: { type: Number, default: 0 },
      received: { type: Number, default: 0 },
      balance: { type: Number, default: 0 },
      labEarning: { type: Number, default: 0 },
    },
    commission: {
      percent: { type: Number, default: 0 },
      gross: { type: Number, default: 0 }, // doctor's share before the doctor's own discount
      amount: { type: Number, default: 0 }, // what the doctor finally gets
    },
    resultsSaved: { type: Boolean, default: false },
    status: { type: String, enum: ["Pending", "Complete"], default: "Pending", index: true },
    history: [historyEntry],
    shares: { report: shareLink, bill: shareLink, doctor: shareLink },
  },
  { timestamps: true }
);
reportSchema.index({ "shares.report.token": 1 }, { sparse: true });
reportSchema.index({ "shares.bill.token": 1 }, { sparse: true });
reportSchema.index({ "shares.doctor.token": 1 }, { sparse: true });

export default mongoose.model("Report", reportSchema);
