import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Doctor name is required"], trim: true, maxlength: 80 },
    phone: { type: String, trim: true, default: "" },
    clinic: { type: String, trim: true, default: "" },
    commissionPercent: { type: Number, min: [0, "Commission can't be negative"], max: [100, "Commission can't be above 100%"], default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Doctor", doctorSchema);
