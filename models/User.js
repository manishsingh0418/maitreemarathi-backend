// const mongoose = require("mongoose");
// const UserSchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   phone: { type: String, required: true, unique: true }, // 👈 ensures no duplicate emails
//   password: { type: String, required: true },
// });

// const User = mongoose.model("User", UserSchema);
// module.exports = User;

const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, default: null },
  password: { type: String, required: true },

  // Referral System Fields
  referralCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  wallet: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },

  // Lesson Progress Tracking
  completedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lesson" }],
  currentLevel: { type: String, default: "beginner" },
  quizzesPassed: [{ type: Number }],

  // Subscription System
  subscriptionType: { 
    type: String, 
    enum: ["free", "monthly", "lifetime"], 
    default: "free" 
  },
  subscriptionStartDate: { type: Date, default: null },
  subscriptionEndDate: { type: Date, default: null },
  subscriptionStatus: { 
    type: String, 
    enum: ["active", "expired", "none"], 
    default: "none" 
  },
  
  // Referral Bonus Tracking
  referralBonusAwarded: { type: Boolean, default: false }, // Prevents duplicate bonus

  // Password Reset Fields
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
