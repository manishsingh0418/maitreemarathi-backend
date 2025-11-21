// const express = require("express");
// const mongoose = require("mongoose");
// const cors = require("cors");
// const User = require("./models/User");
// const axios = require("axios");
// const bodyParser = require("body-parser");

// const app = express();
// const PORT = process.env.PORT || 5000;

// // MIDDLEWARE
// app.use(cors({ origin: "http://localhost:5173" }));
// app.use(express.json());
// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

// // =======================
// //  CONNECT MONGODB
// // =======================
// mongoose
//   .connect("mongodb://localhost:27017/maitreemarathi")
//   .then(() => console.log("✅ MongoDB connected"))
//   .catch((err) => console.error("❌ MongoDB connection error:", err));

// // =======================
// //  TEST ROUTE
// // =======================
// app.get("/", (req, res) => {
//   res.send("Backend is running ✅");
// });

// // =======================
// //  REGISTER USER
// // =======================
// app.post("/register", async (req, res) => {
//   try {
//     const { name, phone, password } = req.body;

//     const existingUser = await User.findOne({ phone });
//     if (existingUser) {
//       return res.status(400).json({
//         status: "error",
//         message: "User already exists. Please login.",
//       });
//     }

//     const newUser = await User.create({ name, phone, password });

//     res.status(201).json({
//       status: "success",
//       message: "User registered successfully!",
//       user: { name: newUser.name, phone: newUser.phone },
//     });
//   } catch (error) {
//     console.error("Error in /register:", error);
//     res
//       .status(500)
//       .json({ status: "error", message: "Internal server error." });
//   }
// });

// // =======================
// //  LOGIN USER
// // =======================
// app.post("/login", async (req, res) => {
//   try {
//     const { phone, password } = req.body;

//     const user = await User.findOne({ phone });
//     if (!user) {
//       return res.json({ status: "error", message: "User not found." });
//     }

//     if (user.password !== password) {
//       return res.json({ status: "error", message: "Invalid credentials." });
//     }

//     res.json({
//       status: "success",
//       message: "Login successful.",
//       user: { name: user.name, phone: user.phone },
//     });
//   } catch (error) {
//     console.error("Error in /login:", error);
//     res
//       .status(500)
//       .json({ status: "error", message: "Internal server error." });
//   }
// });

// // =======================
// //  INSTAMOJO PAYMENT
// // =======================
// app.post("/payment", async (req, res) => {
//   try {
//     const buyer = req.body;
//     console.log("📩 Payment Request Received:", buyer);

//     const instaServer = "https://www.instamojo.com/api/1.1/payment-requests/";

//     const payload = {
//       amount: buyer.amount,
//       purpose: buyer.purpose,
//       buyer_name: buyer.buyer_name,
//       email: buyer.email,
//       phone: buyer.phone,
//       redirect_url: "http://localhost:5173/payment-success",
//     };

//     const headers = {
//       "X-Api-Key": "b6520084968e6d4efcdba40f813b4699",
//       "X-Auth-Token": "fc235b0f39a0f80d752147d62997ab08",
//       "Content-Type": "application/json",
//     };

//     const response = await axios.post(instaServer, payload, { headers });

//     res.status(200).json({
//       status: "success",
//       data: response.data,
//     });
//   } catch (error) {
//     console.error("❌ Instamojo Error:", error.response?.data || error.message);

//     res.status(500).json({
//       status: "error",
//       message: "Payment request failed.",
//       error: error.response?.data,
//     });
//   }
// });

// // =======================
// //  START SERVER
// // =======================
// app.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const User = require("./models/User");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 5000;
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");

// =======================
//  MIDDLEWARE
// =======================
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/subscription", subscriptionRoutes);
// =======================
//  CONNECT MONGODB
// =======================
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/maitreemarathi")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// =======================
//  HELPER – Generate Referral Code
// =======================
// function generateReferralCode(phone) {
//   return "MM" + phone.slice(-4) + Math.floor(1000 + Math.random() * 9000);
// }

function generateReferralCode(identifier) {
  const clean = String(identifier).replace(/[^a-zA-Z0-9]/g, "");
  const last4 = clean.slice(-4).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return "MM" + last4 + random;
}
// =======================
//  TEST ROUTE
// =======================
app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

// =======================
//  REGISTER USER (With Referral Logic)
// =======================
app.post("/register", async (req, res) => {
  try {
    const { name, phone, password, referralCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        status: "error",
        message: "User already exists. Please login.",
      });
    }

    // Generate user's own referral code
    const myReferralCode = generateReferralCode(phone);

    // Create user
    const newUser = await User.create({
      name,
      phone,
      password,
      referralCode: myReferralCode,
      referredBy: referralCode || null,
    });

    // --------------------------
    //  REFERRAL BONUS LOGIC
    //  Note: Bonus is now awarded only when referred user purchases subscription
    //  Monthly: ₹51, Lifetime: ₹101
    // --------------------------

    res.status(201).json({
      status: "success",
      message: "User registered successfully!",
      user: {
        name: newUser.name,
        phone: newUser.phone,
        referralCode: newUser.referralCode,
      },
    });
  } catch (error) {
    console.error("Error in /register:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error.",
    });
  }
});

// =======================
//  LOGIN USER OR ADMIN
// =======================
app.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    // First check if it's an admin login (username instead of phone)
    const Admin = require("./models/Admin");
    const admin = await Admin.findOne({ username: phone });
    
    if (admin) {
      if (admin.password !== password) {
        return res.json({ status: "error", message: "Invalid credentials." });
      }
      
      return res.json({
        status: "success",
        message: "Admin login successful.",
        userType: "admin",
        user: {
          username: admin.username,
          isAdmin: true,
        },
      });
    }

    // If not admin, check regular user
    const user = await User.findOne({ phone });
    if (!user) {
      return res.json({ status: "error", message: "User not found." });
    }

    if (user.password !== password) {
      return res.json({ status: "error", message: "Invalid credentials." });
    }

    res.json({
      status: "success",
      message: "Login successful.",
      userType: "user",
      user: {
        name: user.name,
        phone: user.phone,
        wallet: user.wallet,
        referralCode: user.referralCode,
        referralCount: user.referralCount,
      },
    });
  } catch (error) {
    console.error("Error in /login:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error.",
    });
  }
});

// =======================
//  INSTAMOJO PAYMENT
// =======================
app.post("/payment", async (req, res) => {
  try {
    const buyer = req.body;
    console.log("📩 Payment Request Received:", buyer);

    const instaServer = "https://www.instamojo.com/api/1.1/payment-requests/";

    const payload = {
      amount: buyer.amount,
      purpose: buyer.purpose,
      buyer_name: buyer.buyer_name,
      email: buyer.email,
      phone: buyer.phone,
      redirect_url: process.env.INSTAMOJO_REDIRECT_URL || "http://localhost:5173/payment-success",
    };

    const headers = {
      "X-Api-Key": process.env.INSTAMOJO_API_KEY,
      "X-Auth-Token": process.env.INSTAMOJO_AUTH_TOKEN,
      "Content-Type": "application/json",
    };

    const response = await axios.post(instaServer, payload, { headers });

    res.status(200).json({
      status: "success",
      data: response.data,
    });
  } catch (error) {
    console.error("❌ Instamojo Error:", error.response?.data || error.message);

    res.status(500).json({
      status: "error",
      message: "Payment request failed.",
      error: error.response?.data,
    });
  }
});

// =======================
//  START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
