const express = require("express");
const Admin = require("../models/Admin");
const Lesson = require("../models/Lesson");
const User = require("../models/User");
const Quiz = require("../models/Quiz");
const Redemption = require("../models/Redemption");

const router = express.Router();

// =========================
// ADMIN SIGNUP
// =========================
router.post("/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    const existing = await Admin.findOne({ username });
    if (existing) return res.json({ status: "error", message: "Admin already exists" });

    const admin = await Admin.create({ username, password });

    res.json({ status: "success", message: "Admin created successfully", admin });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// ADMIN LOGIN
// =========================
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) return res.json({ status: "error", message: "Admin not found" });

    if (admin.password !== password)
      return res.json({ status: "error", message: "Invalid credentials" });

    res.json({ status: "success", message: "Admin login successful", admin });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// ADD LESSON
// =========================
router.post("/add-lesson", async (req, res) => {
  try {
    const { level, lessonNumber, title, content } = req.body;
    
    console.log("Adding lesson:", { level, lessonNumber, title });

    const lesson = await Lesson.create({
      level,
      lessonNumber,
      title,
      content
    });

    console.log("Lesson created:", lesson._id);
    res.json({ status: "success", message: "Lesson added", lesson });
  } catch (err) {
    console.error("Add lesson error:", err);
    res.status(500).json({ status: "error", message: "Server error", error: err.message });
  }
});

// =========================
// GET ALL LESSONS (must come before /lessons/:level)
// =========================
router.get("/lessons/all", async (req, res) => {
  try {
    const lessons = await Lesson.find().sort({ level: 1, lessonNumber: 1 });
    res.json({ status: "success", lessons });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// GET SINGLE LESSON
// =========================
router.get("/lesson/:id", async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);

    res.json({ status: "success", lesson });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// GET LESSONS BY LEVEL
// =========================
router.get("/lessons/:level", async (req, res) => {
  try {
    const lessons = await Lesson.find({ level: req.params.level })
      .sort({ lessonNumber: 1 });

    res.json({ status: "success", lessons });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

router.get("/test", (req, res) => {
  res.send("Admin routes working!");
});

// Test route to verify signup endpoint exists
router.get("/signup", (req, res) => {
  res.send("Admin signup endpoint exists. Use POST method with username and password in JSON body.");
});

// =========================
// GET ALL USERS
// =========================
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ _id: -1 });
    
    // Check and update expired subscriptions
    const now = new Date();
    for (let user of users) {
      if (user.subscriptionType === "monthly" && user.subscriptionEndDate && now > user.subscriptionEndDate) {
        user.subscriptionStatus = "expired";
        user.subscriptionType = "free";
        await user.save();
      }
    }
    
    res.json({ status: "success", users });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// GET USER BY ID
// =========================
router.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.json({ status: "error", message: "User not found" });
    res.json({ status: "success", user });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// UPDATE USER PASSWORD
// =========================
router.put("/users/:id/password", async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { password },
      { new: true }
    ).select("-password");
    
    if (!user) return res.json({ status: "error", message: "User not found" });
    res.json({ status: "success", message: "Password updated", user });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// DELETE USER
// =========================
router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.json({ status: "error", message: "User not found" });
    res.json({ status: "success", message: "User deleted" });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// UPDATE LESSON
// =========================
router.put("/lessons/:id", async (req, res) => {
  try {
    const { level, lessonNumber, title, content } = req.body;
    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      { level, lessonNumber, title, content },
      { new: true }
    );
    
    if (!lesson) return res.json({ status: "error", message: "Lesson not found" });
    res.json({ status: "success", message: "Lesson updated", lesson });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// DELETE LESSON
// =========================
router.delete("/lessons/:id", async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndDelete(req.params.id);
    if (!lesson) return res.json({ status: "error", message: "Lesson not found" });
    res.json({ status: "success", message: "Lesson deleted" });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// GET DASHBOARD STATS
// =========================
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalLessons = await Lesson.countDocuments();
    const users = await User.find();
    const totalWallet = users.reduce((sum, user) => sum + (user.wallet || 0), 0);
    
    res.json({
      status: "success",
      stats: {
        totalUsers,
        totalLessons,
        totalWallet
      }
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// ADD QUIZ
// =========================
router.post("/add-quiz", async (req, res) => {
  try {
    const { level, quizNumber, afterLesson, questions } = req.body;
    const quiz = await Quiz.create({ level, quizNumber, afterLesson, questions });
    res.json({ status: "success", message: "Quiz added", quiz });
  } catch (err) {
    console.error("Add quiz error:", err);
    res.status(500).json({ status: "error", message: "Server error", error: err.message });
  }
});

// =========================
// GET ALL QUIZZES
// =========================
router.get("/quizzes", async (req, res) => {
  try {
    const quizzes = await Quiz.find().sort({ level: 1, quizNumber: 1 });
    res.json({ status: "success", quizzes });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// UPDATE QUIZ
// =========================
router.put("/quizzes/:id", async (req, res) => {
  try {
    const { level, quizNumber, afterLesson, questions } = req.body;
    const quiz = await Quiz.findByIdAndUpdate(
      req.params.id,
      { level, quizNumber, afterLesson, questions },
      { new: true }
    );
    if (!quiz) return res.json({ status: "error", message: "Quiz not found" });
    res.json({ status: "success", message: "Quiz updated", quiz });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// DELETE QUIZ
// =========================
router.delete("/quizzes/:id", async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndDelete(req.params.id);
    if (!quiz) return res.json({ status: "error", message: "Quiz not found" });
    res.json({ status: "success", message: "Quiz deleted" });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// WALLET REDEMPTION ENDPOINTS
// =========================

// GET ALL REDEMPTION REQUESTS
router.get("/redemptions", async (req, res) => {
  try {
    const redemptions = await Redemption.find()
      .sort({ requestedAt: -1 });
    res.json({ status: "success", redemptions });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// GET REDEMPTION BY STATUS
router.get("/redemptions/status/:status", async (req, res) => {
  try {
    const redemptions = await Redemption.find({ status: req.params.status })
      .sort({ requestedAt: -1 });
    res.json({ status: "success", redemptions });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// UPDATE REDEMPTION STATUS
router.put("/redemptions/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const redemption = await Redemption.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        processedAt: status === "processed" ? new Date() : null
      },
      { new: true }
    );

    if (!redemption) {
      return res.json({ status: "error", message: "Redemption not found" });
    }

    // If processed, deduct from user's wallet
    if (status === "processed") {
      const user = await User.findById(redemption.userId);
      if (user) {
        user.wallet -= redemption.amount;
        await user.save();
      }
    }

    res.json({ status: "success", message: "Redemption status updated", redemption });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// UPDATE USER WALLET BALANCE (Admin can edit directly)
router.put("/users/:id/wallet", async (req, res) => {
  try {
    const { wallet } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { wallet },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.json({ status: "error", message: "User not found" });
    }

    res.json({ status: "success", message: "Wallet updated", user });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

module.exports = router;
