// Migration script to add afterLesson field to existing quizzes
const mongoose = require("mongoose");
const Quiz = require("./models/Quiz");

mongoose
  .connect("mongodb://localhost:27017/maitreemarathi")
  .then(async () => {
    console.log("✅ MongoDB connected");
    
    try {
      // Find all quizzes without afterLesson field
      const quizzes = await Quiz.find({ afterLesson: { $exists: false } });
      
      console.log(`Found ${quizzes.length} quizzes to update`);
      
      // Update each quiz with a default afterLesson value
      for (const quiz of quizzes) {
        // Default: quiz appears after lesson (quizNumber * 5)
        const afterLesson = quiz.quizNumber * 5;
        
        await Quiz.findByIdAndUpdate(quiz._id, { afterLesson });
        console.log(`Updated quiz ${quiz._id}: afterLesson = ${afterLesson}`);
      }
      
      console.log("✅ Migration complete!");
      process.exit(0);
    } catch (err) {
      console.error("❌ Migration error:", err);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
