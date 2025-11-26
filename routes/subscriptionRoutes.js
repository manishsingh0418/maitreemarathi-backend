const express = require("express");
const axios = require("axios");
const User = require("../models/User");

const router = express.Router();

// =========================
// ACTIVATE SUBSCRIPTION
// =========================
router.post("/activate", async (req, res) => {
  try {
    const { phone, email, identifier, subscriptionType, paymentId, paymentRequestId } = req.body;

    // ✅ Validate user identifier (phone or email)
    const userIdentifier = identifier || phone || email;
    if (!userIdentifier) {
      return res.json({ 
        status: "error", 
        message: "User identifier (phone or email) is required" 
      });
    }

    // ✅ CRITICAL: Verify payment with Instamojo before activation
    if (!paymentId && !paymentRequestId) {
      return res.json({ 
        status: "error", 
        message: "Payment verification failed: No payment ID provided" 
      });
    }

    // Verify payment status with Instamojo
    try {
      // Use payment_id for verification (not payment_request_id)
      const verificationId = paymentId || paymentRequestId;
      const verificationUrl = `https://www.instamojo.com/api/1.1/payments/${verificationId}/`;
      const headers = {
        "X-Api-Key": process.env.INSTAMOJO_API_KEY,
        "X-Auth-Token": process.env.INSTAMOJO_AUTH_TOKEN,
      };

      console.log("🔍 Verifying payment:", verificationId);
      const paymentResponse = await axios.get(verificationUrl, { headers });
      
      // Check if payment was successful
      const paymentStatus = paymentResponse.data?.payment?.status;
      if (paymentStatus !== "Credit") {
        console.log("❌ Payment status:", paymentStatus);
        return res.json({ 
          status: "error", 
          message: `Payment not completed. Status: ${paymentStatus || "Unknown"}` 
        });
      }

      console.log("✅ Payment verified successfully:", verificationId);
    } catch (verifyError) {
      console.error("❌ Payment verification failed:", verifyError.response?.data || verifyError.message);
      return res.json({ 
        status: "error", 
        message: "Payment verification failed. Please contact support." 
      });
    }

    // ✅ Find user by phone OR email (flexible identifier)
    const user = await User.findOne({
      $or: [
        { phone: userIdentifier },
        { email: userIdentifier }
      ]
    });
    
    if (!user) {
      console.log("❌ User not found with identifier:", userIdentifier);
      return res.json({ status: "error", message: "User not found" });
    }

    console.log("✅ User found:", user.phone || user.email);

    // Check if this payment was already used
    if (user.lastPaymentId === paymentId || user.lastPaymentId === paymentRequestId) {
      return res.json({ 
        status: "error", 
        message: "This payment has already been processed" 
      });
    }

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
    user.lastPaymentId = paymentId || paymentRequestId; // Store to prevent reuse

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
router.get("/status/:identifier", async (req, res) => {
  try {
    const identifier = req.params.identifier;
    
    // ✅ Find user by phone OR email
    const user = await User.findOne({
      $or: [
        { phone: identifier },
        { email: identifier }
      ]
    });
    
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
      daysRemaining = Math.floor(diff / (1000 * 60 * 60 * 24));
      
      // If there's any time left on the last day, count it as 1 day
      if (daysRemaining < 0) {
        daysRemaining = 0;
      }
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
    const { phone, email, identifier, lessonNumber, level } = req.body;

    // ✅ Get user identifier (phone or email)
    const userIdentifier = identifier || phone || email;
    if (!userIdentifier) {
      return res.json({ status: "error", message: "User identifier required" });
    }

    // ✅ Find user by phone OR email
    const user = await User.findOne({
      $or: [
        { phone: userIdentifier },
        { email: userIdentifier }
      ]
    });
    
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
