const mongoose = require("mongoose");

const LessonSchema = new mongoose.Schema({
  level: { type: String, required: true }, // beginner | medium | expert
  lessonNumber: { type: Number, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },   // Full lesson text
}, { timestamps: true });

module.exports = mongoose.model("Lesson", LessonSchema);
