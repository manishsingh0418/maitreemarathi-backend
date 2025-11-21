const mongoose = require("mongoose");

const QuizSchema = new mongoose.Schema({
  level: { type: String, required: true }, // beginner | medium | expert
  quizNumber: { type: Number, required: true }, // Quiz number (1, 2, 3...)
  afterLesson: { type: Number, default: 5 }, // Quiz appears after this lesson number (default: 5)
  questions: [{
    question: { type: String, required: true },
    options: [{ type: String }],
    correctAnswer: { type: String, required: true }
  }]
}, { timestamps: true });

module.exports = mongoose.model("Quiz", QuizSchema);
