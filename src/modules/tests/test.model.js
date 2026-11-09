import mongoose from "mongoose";

export const RANGE_WHO = ["All", "Male", "Female", "Child"];

const rangeSchema = new mongoose.Schema(
  {
    who: { type: String, enum: RANGE_WHO, default: "All" },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    text: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const parameterSchema = new mongoose.Schema({
  name: { type: String, required: [true, "Parameter name is required"], trim: true, maxlength: 100 },
  unit: { type: String, trim: true, default: "" },
  defaultValue: { type: String, trim: true, default: "" },
  type: { type: String, enum: ["value", "heading"], default: "value" },
  bold: { type: Boolean, default: false },
  ranges: { type: [rangeSchema], default: [] },
});

const testSchema = new mongoose.Schema(
  {
    group: { type: String, required: [true, "Test group is required"], trim: true },
    name: { type: String, required: [true, "Test name is required"], trim: true, maxlength: 120 },
    printHeading: { type: String, trim: true, default: "" },
    shortName: { type: String, trim: true, default: "" },
    mrp: { type: Number, min: [0, "MRP can't be negative"], default: 0 },
    cost: { type: Number, min: [0, "Cost can't be negative"], default: 0 },
    method: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    parameters: { type: [parameterSchema], default: [] },
  },
  { timestamps: true }
);
testSchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default mongoose.model("Test", testSchema);
