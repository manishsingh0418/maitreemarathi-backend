const mongoose = require("mongoose");

const RedemptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ["pending", "processing", "processed"], 
    default: "pending" 
  },
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: null },
  notes: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Redemption", RedemptionSchema);
