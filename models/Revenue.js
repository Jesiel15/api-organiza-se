const mongoose = require("mongoose");

const revenueSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  icon: { type: String, default: "pi pi-money-bill" },
  color: { type: String, default: "#2881e4" },
  nameRevenue: { type: String, required: true },
  valueRevenue: { type: Number, required: true },
  dateRevenue: { type: Date, required: true },
  anotation: { type: String },
});

module.exports = mongoose.model("Revenue", revenueSchema);
