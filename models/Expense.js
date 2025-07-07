const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  icon: { type: String, default: "pi pi-receipt" },
  color: { type: String, default: "#2881e4" },
  nameExpense: { type: String, required: true },
  valueExpense: { type: Number, required: true },
  dateExpense: { type: Date, required: true },
  anotation: { type: String },
});

module.exports = mongoose.model("Expense", expenseSchema);
