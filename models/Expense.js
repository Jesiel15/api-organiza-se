const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  icon: { type: String, default: "pi pi-chart-bar" },
  color: { type: String, default: "#FFFFFF" },
  nameExpense: { type: String, required: true },
  valueExpense: { type: Number, required: true },
  dateExpense: { type: Date, required: true },
  anotation: { type: String },
});

module.exports = mongoose.model("Expense", expenseSchema);
