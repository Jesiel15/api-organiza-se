const mongoose = require("mongoose");

const expenseItemSchema = new mongoose.Schema({
  icon: { type: String, default: "pi pi-receipt" },
  color: { type: String, default: "#2881e4" },
  nameExpense: { type: String, required: true },
  valueExpense: { type: Number, required: true },
  dateExpense: { type: Date, required: true },
  anotation: { type: String },
});

const revenueItemSchema = new mongoose.Schema({
  icon: { type: String, default: "pi pi-money-bill" },
  color: { type: String, default: "#2881e4" },
  nameRevenue: { type: String, required: true },
  valueRevenue: { type: Number, required: true },
  dateRevenue: { type: Date, required: true },
  anotation: { type: String },
});

const monthDataSchema = new mongoose.Schema({
  expenses: { type: [expenseItemSchema], default: [] },
  revenues: { type: [revenueItemSchema], default: [] },
});

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  expensesRevenues: {
    type: Map,
    of: monthDataSchema,
    default: {},
  },
});

module.exports = mongoose.model("User", UserSchema);
