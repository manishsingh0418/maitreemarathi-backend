const express = require("express");
const User = require("../models/User");
const Lesson = require("../models/Lesson");
const Quiz = require("../models/Quiz");
const Redemption = require("../models/Redemption");

const router = express.Router();

// =========================
// GET USER PROGRESS
// =========================
router.get("/progress/:phone", async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.params.phone })
      .populate("completedLessons")
      .select("-password");
    
    if (!user) return res.json({ status: "error", message: "User not found" });
    
    res.json({ status: "success", user });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// GET LEVEL STATUS (UNLOCK STATUS)
// =========================
router.get("/level-status/:phone", async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.params.phone });
    if (!user) return res.json({ status: "error", message: "User not found" });

    const Lesson = require("../models/Lesson");
    
    // Get lesson counts for each level
    const beginnerLessons = await Lesson.find({ level: "beginner" });
    const mediumLessons = await Lesson.find({ level: "medium" });
    const expertLessons = await Lesson.find({ level: "expert" });

    // Count completed lessons for each level
    const completedBeginnerCount = user.completedLessons.filter(lessonId => 
      beginnerLessons.some(lesson => lesson._id.toString() === lessonId.toString())
    ).length;

    const completedMediumCount = user.completedLessons.filter(lessonId => 
      mediumLessons.some(lesson => lesson._id.toString() === lessonId.toString())
    ).length;

    const completedExpertCount = user.completedLessons.filter(lessonId => 
      expertLessons.some(lesson => lesson._id.toString() === lessonId.toString())
    ).length;

    // Check if levels are unlocked
    // A level is completed only if it has lessons AND all are completed
    const beginnerCompleted = beginnerLessons.length > 0 && completedBeginnerCount === beginnerLessons.length;
    const mediumCompleted = mediumLessons.length > 0 && completedMediumCount === mediumLessons.length;

    // Medium unlocks only when beginner is fully completed
    const mediumUnlocked = beginnerCompleted;
    
    // Expert unlocks only when medium is fully completed AND medium was unlocked
    const expertUnlocked = mediumUnlocked && mediumCompleted;

    const levelStatus = {
      beginner: {
        unlocked: true,
        completed: completedBeginnerCount,
        total: beginnerLessons.length
      },
      medium: {
        unlocked: mediumUnlocked,
        completed: completedMediumCount,
        total: mediumLessons.length
      },
      expert: {
        unlocked: expertUnlocked,
        completed: completedExpertCount,
        total: expertLessons.length
      }
    };

    console.log("Level Status Debug:", {
      beginnerLessons: beginnerLessons.length,
      completedBeginnerCount,
      beginnerCompleted,
      mediumLessons: mediumLessons.length,
      completedMediumCount,
      mediumCompleted,
      mediumUnlocked,
      expertUnlocked
    });

    res.json({ status: "success", levelStatus });
  } catch (err) {
    console.error("Level status error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// GET LESSONS BY LEVEL WITH PROGRESS
// =========================
router.get("/lessons/:level/:phone", async (req, res) => {
  try {
    const { level, phone } = req.params;
    const user = await User.findOne({ phone });
    
    if (!user) return res.json({ status: "error", message: "User not found" });
    
    // Check if subscription expired
    if (user.subscriptionType === "monthly" && user.subscriptionEndDate) {
      const now = new Date();
      if (now > user.subscriptionEndDate) {
        user.subscriptionStatus = "expired";
        user.subscriptionType = "free";
        await user.save();
      }
    }
    
    const lessons = await Lesson.find({ level }).sort({ lessonNumber: 1 });
    const Quiz = require("../models/Quiz");
    const quizzes = await Quiz.find({ level });
    
    // Mark lessons as locked/unlocked
    const lessonsWithStatus = lessons.map((lesson, index) => {
      const isCompleted = user.completedLessons.some(
        (id) => id.toString() === lesson._id.toString()
      );
      
      // STEP 1: Check sequential unlock (previous lesson must be completed)
      // First lesson is always unlocked, others unlock when previous is completed
      const isPreviousCompleted = index === 0 || 
        user.completedLessons.some(
          (id) => id.toString() === lessons[index - 1]._id.toString()
        );
      
      // STEP 2: Check if there's a quiz after the previous lesson
      const previousLessonNumber = lesson.lessonNumber - 1;
      const quiz = quizzes.find(q => {
        const afterLesson = q.afterLesson || (q.quizNumber * 5);
        return afterLesson === previousLessonNumber;
      });
      const requiresQuiz = quiz && !user.quizzesPassed.includes(quiz.quizNumber);
      
      // STEP 3: Check subscription access
      let requiresSubscription = false;
      if (user.subscriptionType === "free") {
        // Free users: only first 3 beginner lessons
        if (level === "beginner" && lesson.lessonNumber > 3) {
          requiresSubscription = true;
        } else if (level !== "beginner") {
          requiresSubscription = true;
        }
      }
      
      // FINAL: Lesson is unlocked only if ALL conditions are met:
      // 1. Previous lesson is completed (sequential)
      // 2. No quiz is blocking it
      // 3. User has subscription (if required)
      let isUnlocked = isPreviousCompleted;
      
      // If previous lesson not completed, lock it
      if (!isPreviousCompleted) {
        isUnlocked = false;
      }
      // If quiz is required and not passed, lock it
      else if (requiresQuiz) {
        isUnlocked = false;
      }
      // If subscription required and user doesn't have it, lock it
      else if (requiresSubscription) {
        isUnlocked = false;
      }
      
      return {
        ...lesson.toObject(),
        isCompleted,
        isUnlocked,
        requiresQuiz: requiresQuiz,
        requiresSubscription: requiresSubscription,
        quizNumber: quiz ? quiz.quizNumber : null
      };
    });
    
    res.json({ status: "success", lessons: lessonsWithStatus });
  } catch (err) {
    console.error("Get lessons error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// MARK LESSON AS COMPLETED
// =========================
router.post("/complete-lesson", async (req, res) => {
  try {
    const { phone, lessonId } = req.body;
    
    const user = await User.findOne({ phone });
    if (!user) return res.json({ status: "error", message: "User not found" });
    
    // Check if already completed
    if (user.completedLessons.includes(lessonId)) {
      return res.json({ status: "success", message: "Lesson already completed" });
    }
    
    user.completedLessons.push(lessonId);
    
    // Check if user completed all lessons of current level and update currentLevel
    const Lesson = require("../models/Lesson");
    const currentLesson = await Lesson.findById(lessonId);
    
    if (currentLesson) {
      const allLessonsOfLevel = await Lesson.find({ level: currentLesson.level });
      const completedInLevel = user.completedLessons.filter(id => 
        allLessonsOfLevel.some(lesson => lesson._id.toString() === id.toString())
      ).length + 1; // +1 for the lesson we just completed
      
      // If all lessons of this level are completed, update currentLevel
      if (completedInLevel === allLessonsOfLevel.length) {
        if (currentLesson.level === "beginner") {
          user.currentLevel = "medium";
        } else if (currentLesson.level === "medium") {
          user.currentLevel = "expert";
        }
      }
    }
    
    await user.save();
    
    res.json({ status: "success", message: "Lesson marked as completed" });
  } catch (err) {
    console.error("Complete lesson error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// GET QUIZ BY LEVEL AND NUMBER
// =========================
router.get("/quiz/:level/:quizNumber", async (req, res) => {
  try {
    const { level, quizNumber } = req.params;
    const Quiz = require("../models/Quiz");
    const quiz = await Quiz.findOne({ level, quizNumber: parseInt(quizNumber) });
    
    if (!quiz) return res.json({ status: "error", message: "Quiz not found" });
    
    // Don't send correct answers to frontend
    const quizData = {
      ...quiz.toObject(),
      questions: quiz.questions.map(q => ({
        question: q.question,
        options: q.options,
        _id: q._id
      }))
    };
    
    res.json({ status: "success", quiz: quizData });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// SUBMIT QUIZ
// =========================
router.post("/submit-quiz", async (req, res) => {
  try {
    const { phone, level, quizNumber, answers } = req.body;
    
    const user = await User.findOne({ phone });
    if (!user) return res.json({ status: "error", message: "User not found" });
    
    const quiz = await Quiz.findOne({ level, quizNumber });
    if (!quiz) return res.json({ status: "error", message: "Quiz not found" });
    
    // Check answers
    let correctCount = 0;
    quiz.questions.forEach((q, index) => {
      if (answers[index] === q.correctAnswer) {
        correctCount++;
      }
    });
    
    const totalQuestions = quiz.questions.length;
    const percentage = (correctCount / totalQuestions) * 100;
    const passed = percentage >= 60; // 60% passing criteria
    
    if (passed && !user.quizzesPassed.includes(quizNumber)) {
      user.quizzesPassed.push(quizNumber);
      await user.save();
    }
    
    res.json({
      status: "success",
      passed,
      correctCount,
      totalQuestions,
      percentage: percentage.toFixed(2)
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// REQUEST WALLET REDEMPTION
// =========================
router.post("/request-redemption", async (req, res) => {
  try {
    const { phone, amount } = req.body;
    
    const user = await User.findOne({ phone });
    if (!user) return res.json({ status: "error", message: "User not found" });
    
    if (user.wallet < amount) {
      return res.json({ status: "error", message: "Insufficient wallet balance" });
    }
    
    if (amount < 100) {
      return res.json({ status: "error", message: "Minimum redemption amount is ₹100" });
    }
    
    // Create redemption request
    const redemption = await Redemption.create({
      userId: user._id,
      userName: user.name,
      userPhone: user.phone,
      amount,
      status: "pending"
    });
    
    res.json({ 
      status: "success", 
      message: "Redemption request submitted successfully",
      redemption 
    });
  } catch (err) {
    console.error("Redemption error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// GET USER REDEMPTION HISTORY
// =========================
router.get("/redemptions/:phone", async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.params.phone });
    if (!user) return res.json({ status: "error", message: "User not found" });
    
    const redemptions = await Redemption.find({ userId: user._id })
      .sort({ requestedAt: -1 });
    
    res.json({ status: "success", redemptions });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// In-memory storage for testing (when MongoDB is not available)
const resetTokenStore = {};

// =========================
// FORGOT PASSWORD - SEND RESET LINK
// =========================
router.post("/forgot-password", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.json({ status: "error", message: "Phone number is required" });
    }

    // Try to find user in database
    let user = null;
    try {
      user = await User.findOne({ phone });
    } catch (dbErr) {
      console.log("Database not available, using in-memory storage for testing");
    }

    if (!user) {
      // For development/testing without MongoDB
      console.log(`User ${phone} not found in database, allowing reset for testing`);
    }

    // Generate reset token
    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store in memory for testing
    resetTokenStore[phone] = {
      token: resetToken,
      expiry: resetTokenExpiry
    };

    // If user exists in DB, update it
    if (user) {
      user.resetToken = resetToken;
      user.resetTokenExpiry = resetTokenExpiry;
      await user.save();
    }

    // Create reset link
    const resetPasswordBaseUrl = process.env.RESET_PASSWORD_URL || process.env.FRONTEND_URL + '/reset-password';
    const resetLink = `${resetPasswordBaseUrl}?token=${resetToken}&phone=${phone}`;

    // Log for development
    console.log(`Password reset link for ${phone}: ${resetLink}`);

    res.json({
      status: "success",
      message: "Password reset link sent to your email",
      // For development only - remove in production
      resetLink: resetLink
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ status: "error", message: "Server error: " + err.message });
  }
});

// =========================
// VERIFY RESET TOKEN
// =========================
router.post("/verify-reset-token", async (req, res) => {
  try {
    const { phone, token } = req.body;

    // Check in-memory store first
    if (resetTokenStore[phone]) {
      const stored = resetTokenStore[phone];
      if (stored.token === token && new Date() < stored.expiry) {
        return res.json({
          status: "success",
          message: "Token verified successfully",
          verified: true
        });
      }
    }

    // Try database
    let user = null;
    try {
      user = await User.findOne({ phone });
    } catch (dbErr) {
      console.log("Database not available");
    }

    if (!user) {
      return res.json({ status: "error", message: "User not found" });
    }

    if (!user.resetToken || user.resetToken !== token) {
      return res.json({ status: "error", message: "Invalid reset token" });
    }

    if (new Date() > user.resetTokenExpiry) {
      user.resetToken = null;
      user.resetTokenExpiry = null;
      await user.save();
      return res.json({ status: "error", message: "Reset token has expired. Please request a new one" });
    }

    res.json({
      status: "success",
      message: "Token verified successfully",
      verified: true
    });
  } catch (err) {
    console.error("Verify token error:", err);
    res.status(500).json({ status: "error", message: "Server error: " + err.message });
  }
});

// =========================
// CHANGE PASSWORD (WITH CURRENT PASSWORD)
// =========================
router.post("/change-password", async (req, res) => {
  try {
    const { phone, currentPassword, newPassword } = req.body;

    if (!phone || !currentPassword || !newPassword) {
      return res.json({ status: "error", message: "All fields are required" });
    }

    if (newPassword.length < 4) {
      return res.json({ status: "error", message: "New password must be at least 4 characters" });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.json({ status: "error", message: "User not found" });
    }

    // Verify current password
    if (user.password !== currentPassword) {
      return res.json({ status: "error", message: "Current password is incorrect" });
    }

    // Check if new password is same as current
    if (currentPassword === newPassword) {
      return res.json({ status: "error", message: "New password must be different from current password" });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      status: "success",
      message: "Password changed successfully"
    });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ status: "error", message: "Server error: " + err.message });
  }
});

// =========================
// RESET PASSWORD
// =========================
router.post("/reset-password", async (req, res) => {
  try {
    const { phone, token, newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
      return res.json({ status: "error", message: "Password must be at least 4 characters" });
    }

    // Check in-memory store first
    if (resetTokenStore[phone]) {
      const stored = resetTokenStore[phone];
      if (stored.token === token && new Date() < stored.expiry) {
        // Token is valid, allow password reset
        // In production with DB, update the user password here
        delete resetTokenStore[phone];
        
        // Try to update in database if available
        try {
          const user = await User.findOne({ phone });
          if (user) {
            user.password = newPassword;
            user.resetToken = null;
            user.resetTokenExpiry = null;
            await user.save();
          }
        } catch (dbErr) {
          console.log("Database not available, password reset allowed for testing");
        }

        return res.json({
          status: "success",
          message: "Password reset successfully. Please login with your new password"
        });
      }
    }

    // Try database
    let user = null;
    try {
      user = await User.findOne({ phone });
    } catch (dbErr) {
      console.log("Database not available");
    }

    if (!user) {
      return res.json({ status: "error", message: "User not found" });
    }

    // Verify token
    if (!user.resetToken || user.resetToken !== token) {
      return res.json({ status: "error", message: "Invalid reset token" });
    }

    if (new Date() > user.resetTokenExpiry) {
      return res.json({ status: "error", message: "Reset token has expired" });
    }

    // Update password
    user.password = newPassword;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    res.json({
      status: "success",
      message: "Password reset successfully. Please login with your new password"
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ status: "error", message: "Server error: " + err.message });
  }
});

module.exports = router;
