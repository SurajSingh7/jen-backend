import mongoose from "mongoose";

export const GENDERS = ["", "Male", "Female", "Other"]; // "" = Manual: the title does not set a gender

const titleSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Title name is required"], trim: true, maxlength: [20, "Title name is too long"] },
    gender: { type: String, enum: { values: GENDERS, message: "Invalid gender" }, default: "" },
  },
  { timestamps: true }
);

// "Mr" and "MR" count as the same title
titleSchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default mongoose.model("Title", titleSchema);
