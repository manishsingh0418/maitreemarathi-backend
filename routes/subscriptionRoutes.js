const express = require("express");
const User = require("../models/User");

const router = express.Router();

// =========================
// ACTIVATE SUBSCRIPTION
// =========================
router.post("/activate", async (req, res) => {
  try {
    const { phone, subscriptionType, paymentId } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return res.json({ status: "error", message: "User not found" });

    const now = new Date();
    let endDate = null;

    if (subscriptionType === "monthly") {
      endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    } else if (subscriptionType === "lifetime") {
      endDate = new Date("2099-12-31"); // Far future date
    }

    user.subscriptionType = subscriptionType;
    user.subscriptionStartDate = now;
    user.subscriptionEndDate = endDate;
    user.subscriptionStatus = "active";

    await user.save();

    // --------------------------
    //  REFERRAL BONUS LOGIC (Only on subscription purchase)
    // --------------------------
    if (user.referredBy && !user.referralBonusAwarded) {
      const referrer = await User.findOne({ referralCode: user.referredBy });

      if (referrer) {
        let bonusAmount = 0;
        
        // Monthly subscription: ₹51 bonus
        if (subscriptionType === "monthly") {
          bonusAmount = 51;
        }
        // Lifetime subscription: ₹101 bonus
        else if (subscriptionType === "lifetime") {
          bonusAmount = 101;
        }

        if (bonusAmount > 0) {
          referrer.wallet += bonusAmount;
          referrer.referralCount += 1;
          await referrer.save();

          // Mark bonus as awarded to prevent duplicate rewards
          user.referralBonusAwarded = true;
          await user.save();

          console.log(`Referral bonus: ₹${bonusAmount} added to ${referrer.phone} for ${user.phone}'s ${subscriptionType} subscription`);
        }
      }
    }

    res.json({
      status: "success",
      message: "Subscription activated successfully",
      subscription: {
        type: user.subscriptionType,
        startDate: user.subscriptionStartDate,
        endDate: user.subscriptionEndDate,
        status: user.subscriptionStatus
      }
    });
  } catch (err) {
    console.error("Activate subscription error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// CHECK SUBSCRIPTION STATUS
// =========================
router.get("/status/:phone", async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.params.phone });
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

    // Calculate days remaining
    let daysRemaining = null;
    if (user.subscriptionType === "monthly" && user.subscriptionEndDate) {
      const now = new Date();
      const diff = user.subscriptionEndDate - now;
      daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    res.json({
      status: "success",
      subscription: {
        type: user.subscriptionType,
        startDate: user.subscriptionStartDate,
        endDate: user.subscriptionEndDate,
        subscriptionStatus: user.subscriptionStatus,
        daysRemaining: daysRemaining
      }
    });
  } catch (err) {
    console.error("Check subscription error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// =========================
// CHECK LESSON ACCESS
// =========================
router.post("/check-access", async (req, res) => {
  try {
    const { phone, lessonNumber, level } = req.body;

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

    let hasAccess = false;

    // Free users: only first 3 beginner lessons
    if (user.subscriptionType === "free") {
      hasAccess = level === "beginner" && lessonNumber <= 3;
    }
    // Monthly and Lifetime: full access
    else if (user.subscriptionType === "monthly" || user.subscriptionType === "lifetime") {
      hasAccess = true;
    }

    res.json({
      status: "success",
      hasAccess,
      subscriptionType: user.subscriptionType,
      message: hasAccess ? "Access granted" : "Subscription required"
    });
  } catch (err) {
    console.error("Check access error:", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

module.exports = router;
