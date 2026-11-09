import mongoose from "mongoose";

// Money the lab has handed over to a doctor against earned commission
const commissionPaymentSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    amount: { type: Number, required: true },
    mode: { type: String, enum: ["Cash", "UPI", "Bank"], default: "Cash" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("CommissionPayment", commissionPaymentSchema);
