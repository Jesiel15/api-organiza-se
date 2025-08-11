// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const User = require("./models/User");

const app = express();
app.use(cors());
app.use(express.json());

/* ----------------- Conexão MongoDB ----------------- */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado ao MongoDB Atlas"))
  .catch((err) => console.error("❌ Erro ao conectar MongoDB:", err));

/* ----------------- Helpers ----------------- */
function getMonthYearKey(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`; // ex: 082025
}

function ensureMonthExistsOnUser(user, monthKey) {
  if (!user.expensesRevenues.has(monthKey)) {
    user.expensesRevenues.set(monthKey, { expenses: [], revenues: [] });
  }
}

/* ----------------- Autenticação JWT ----------------- */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "Token não encontrado" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ msg: "Token inválido" });
    req.user = user;
    next();
  });
}

/* ----------------- Rotas Usuário ----------------- */

// Registro
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ msg: "name, email e password são obrigatórios" });

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ msg: "Email já registrado" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      expensesRevenues: {}, // começa vazio
    });
    await newUser.save();

    res
      .status(201)
      .json({ msg: "Usuário criado com sucesso", userId: newUser._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password)
      return res.status(400).json({ msg: "email e password são obrigatórios" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "Usuário não encontrado" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Senha incorreta" });

    const token = jwt.sign(
      {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ----------------- DESPESAS (expenses) ----------------- */

/**
 * GET /expenses
 * - retorna todas as despesas (todos meses) ordenadas por data (desc)
 */
app.get("/expenses", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });

    const all = [];
    user.expensesRevenues.forEach((monthData) => {
      if (monthData && monthData.expenses && monthData.expenses.length) {
        monthData.expenses.forEach((e) => all.push(e));
      }
    });

    all.sort((a, b) => new Date(b.dateExpense) - new Date(a.dateExpense));
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /expenses/:monthYear
 * - retorna despesas do mês (MMYYYY)
 * Ex: GET /expenses/082025
 */
app.get("/expenses/:monthYear", authenticateToken, async (req, res) => {
  try {
    const { monthYear } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });

    const monthData = user.expensesRevenues.get(monthYear);
    if (!monthData) return res.json([]);

    const sorted = monthData.expenses.sort(
      (a, b) => new Date(b.dateExpense) - new Date(a.dateExpense)
    );
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /expenses/:monthYear/:expenseId
 * - retorna uma despesa específica dentro de um mês
 */
app.get(
  "/expenses/:monthYear/:expenseId",
  authenticateToken,
  async (req, res) => {
    try {
      const { monthYear, expenseId } = req.params;
      const user = await User.findById(req.user.id);
      if (!user)
        return res.status(404).json({ msg: "Usuário não encontrado." });

      const monthData = user.expensesRevenues.get(monthYear);
      if (!monthData)
        return res.status(404).json({ msg: "Mês/ano não encontrado." });

      const expense =
        monthData.expenses.id(expenseId) ||
        monthData.expenses.find((e) => e._id?.toString() === expenseId);
      if (!expense)
        return res.status(404).json({ msg: "Despesa não encontrada." });

      res.json(expense);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /expenses
 * - body: { icon, color, nameExpense, valueExpense, dateExpense, anotation }
 * - salva na chave MMYYYY derivada de dateExpense
 */
app.post("/expenses", authenticateToken, async (req, res) => {
  try {
    const { icon, color, nameExpense, valueExpense, dateExpense, anotation } =
      req.body;

    if (!nameExpense || valueExpense == null || !dateExpense) {
      return res.status(400).json({
        msg: "nameExpense, valueExpense e dateExpense são obrigatórios",
      });
    }
    const dateObj = new Date(dateExpense);
    if (isNaN(dateObj.getTime()))
      return res.status(400).json({ msg: "dateExpense inválida" });

    const monthKey = getMonthYearKey(dateObj);
    if (!monthKey)
      return res.status(400).json({ msg: "Formato de data inválido" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });

    ensureMonthExistsOnUser(user, monthKey);

    const newExpense = {
      icon,
      color,
      nameExpense,
      valueExpense,
      dateExpense: dateObj,
      anotation,
    };

    // push e salva
    user.expensesRevenues.get(monthKey).expenses.push(newExpense);
    await user.save();

    const added = user.expensesRevenues.get(monthKey).expenses.at(-1);
    res.status(201).json({ msg: "Despesa criada com sucesso", expense: added });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /expenses/:monthYear/:expenseId
 * - atualiza a despesa. Se a data for alterada para outro mês, move o item para o mês correto.
 */
app.put(
  "/expenses/:monthYear/:expenseId",
  authenticateToken,
  async (req, res) => {
    try {
      const { monthYear, expenseId } = req.params;
      const updates = req.body;

      const user = await User.findById(req.user.id);
      if (!user)
        return res.status(404).json({ msg: "Usuário não encontrado." });

      const monthData = user.expensesRevenues.get(monthYear);
      if (!monthData)
        return res.status(404).json({ msg: "Mês/ano não encontrado." });

      // localizar despesa
      let expense =
        monthData.expenses.id(expenseId) ||
        monthData.expenses.find((e) => e._id?.toString() === expenseId);
      if (!expense)
        return res.status(404).json({ msg: "Despesa não encontrada." });

      // caso a data mude de mês, mover para outro mêsKey
      if (updates.dateExpense) {
        const newDate = new Date(updates.dateExpense);
        if (isNaN(newDate.getTime()))
          return res.status(400).json({ msg: "dateExpense inválida" });

        const newMonthKey = getMonthYearKey(newDate);
        if (!newMonthKey)
          return res.status(400).json({ msg: "Formato de mês inválido" });

        // se mês mudou, remove do mês atual e adiciona no mês novo
        if (newMonthKey !== monthYear) {
          // remove do atual
          const idx = monthData.expenses.findIndex(
            (e) => e._id?.toString() === expenseId
          );
          if (idx !== -1) monthData.expenses.splice(idx, 1);

          // garante o mês novo e adiciona com a nova data
          ensureMonthExistsOnUser(user, newMonthKey);
          const movedExpense = {
            icon: updates.icon ?? expense.icon,
            color: updates.color ?? expense.color,
            nameExpense: updates.nameExpense ?? expense.nameExpense,
            valueExpense: updates.valueExpense ?? expense.valueExpense,
            dateExpense: newDate,
            anotation: updates.anotation ?? expense.anotation,
          };

          user.expensesRevenues.get(newMonthKey).expenses.push(movedExpense);
          await user.save();

          const added = user.expensesRevenues.get(newMonthKey).expenses.at(-1);
          return res.json({
            msg: "Despesa movida e atualizada com sucesso",
            expense: added,
            monthYear: newMonthKey,
          });
        }
        // se não mudou de mês, continua e atualiza normalmente abaixo
      }

      // atualiza campos (sem mudar mês)
      expense.set(updates);
      await user.save();

      // recuperar updated (procura novamente para garantir o objeto atualizado)
      const updatedExpense =
        user.expensesRevenues.get(monthYear).expenses.id(expenseId) ||
        user.expensesRevenues
          .get(monthYear)
          .expenses.find((e) => e._id?.toString() === expenseId);

      res.json({
        msg: "Despesa atualizada com sucesso",
        expense: updatedExpense,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * DELETE /expenses/:monthYear/:expenseId
 */
app.delete(
  "/expenses/:monthYear/:expenseId",
  authenticateToken,
  async (req, res) => {
    try {
      const { monthYear, expenseId } = req.params;
      const user = await User.findById(req.user.id);
      if (!user)
        return res.status(404).json({ msg: "Usuário não encontrado." });

      const monthData = user.expensesRevenues.get(monthYear);
      if (!monthData)
        return res.status(404).json({ msg: "Mês/ano não encontrado." });

      const idx = monthData.expenses.findIndex(
        (e) => e._id?.toString() === expenseId
      );
      if (idx === -1)
        return res.status(404).json({ msg: "Despesa não encontrada." });

      monthData.expenses.splice(idx, 1);
      await user.save();

      res.json({ msg: "Despesa excluída com sucesso." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/* ----------------- RECEITAS (revenues) ----------------- */

/**
 * GET /revenues
 * - retorna todas as receitas (todos meses) ordenadas por data (desc)
 */
app.get("/revenues", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });

    const all = [];
    user.expensesRevenues.forEach((monthData) => {
      if (monthData && monthData.revenues && monthData.revenues.length) {
        monthData.revenues.forEach((r) => all.push(r));
      }
    });

    all.sort((a, b) => new Date(b.dateRevenue) - new Date(a.dateRevenue));
    res.json(all);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /revenues/:monthYear
 */
app.get("/revenues/:monthYear", authenticateToken, async (req, res) => {
  try {
    const { monthYear } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });

    const monthData = user.expensesRevenues.get(monthYear);
    if (!monthData) return res.json([]);

    const sorted = monthData.revenues.sort(
      (a, b) => new Date(b.dateRevenue) - new Date(a.dateRevenue)
    );
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /revenues/:monthYear/:revenueId
 */
app.get(
  "/revenues/:monthYear/:revenueId",
  authenticateToken,
  async (req, res) => {
    try {
      const { monthYear, revenueId } = req.params;
      const user = await User.findById(req.user.id);
      if (!user)
        return res.status(404).json({ msg: "Usuário não encontrado." });

      const monthData = user.expensesRevenues.get(monthYear);
      if (!monthData)
        return res.status(404).json({ msg: "Mês/ano não encontrado." });

      const revenue =
        monthData.revenues.id(revenueId) ||
        monthData.revenues.find((r) => r._id?.toString() === revenueId);
      if (!revenue)
        return res.status(404).json({ msg: "Receita não encontrada." });

      res.json(revenue);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /revenues
 * - body: { icon, color, nameRevenue, valueRevenue, dateRevenue, anotation }
 * - salva na chave MMYYYY derivada de dateRevenue
 */
app.post("/revenues", authenticateToken, async (req, res) => {
  try {
    const { icon, color, nameRevenue, valueRevenue, dateRevenue, anotation } =
      req.body;

    if (!nameRevenue || valueRevenue == null || !dateRevenue) {
      return res.status(400).json({
        msg: "nameRevenue, valueRevenue e dateRevenue são obrigatórios",
      });
    }
    const dateObj = new Date(dateRevenue);
    if (isNaN(dateObj.getTime()))
      return res.status(400).json({ msg: "dateRevenue inválida" });

    const monthKey = getMonthYearKey(dateObj);
    if (!monthKey)
      return res.status(400).json({ msg: "Formato de data inválido" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado." });

    ensureMonthExistsOnUser(user, monthKey);

    const newRevenue = {
      icon,
      color,
      nameRevenue,
      valueRevenue,
      dateRevenue: dateObj,
      anotation,
    };

    user.expensesRevenues.get(monthKey).revenues.push(newRevenue);
    await user.save();

    const added = user.expensesRevenues.get(monthKey).revenues.at(-1);
    res.status(201).json({ msg: "Receita criada com sucesso", revenue: added });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /revenues/:monthYear/:revenueId
 * - atualiza a receita. Se a data for alterada para outro mês, move o item para o mês correto.
 */
app.put(
  "/revenues/:monthYear/:revenueId",
  authenticateToken,
  async (req, res) => {
    try {
      const { monthYear, revenueId } = req.params;
      const updates = req.body;

      const user = await User.findById(req.user.id);
      if (!user)
        return res.status(404).json({ msg: "Usuário não encontrado." });

      const monthData = user.expensesRevenues.get(monthYear);
      if (!monthData)
        return res.status(404).json({ msg: "Mês/ano não encontrado." });

      let revenue =
        monthData.revenues.id(revenueId) ||
        monthData.revenues.find((r) => r._id?.toString() === revenueId);
      if (!revenue)
        return res.status(404).json({ msg: "Receita não encontrada." });

      if (updates.dateRevenue) {
        const newDate = new Date(updates.dateRevenue);
        if (isNaN(newDate.getTime()))
          return res.status(400).json({ msg: "dateRevenue inválida" });

        const newMonthKey = getMonthYearKey(newDate);
        if (!newMonthKey)
          return res.status(400).json({ msg: "Formato de mês inválido" });

        if (newMonthKey !== monthYear) {
          const idx = monthData.revenues.findIndex(
            (r) => r._id?.toString() === revenueId
          );
          if (idx !== -1) monthData.revenues.splice(idx, 1);

          ensureMonthExistsOnUser(user, newMonthKey);

          const movedRevenue = {
            icon: updates.icon ?? revenue.icon,
            color: updates.color ?? revenue.color,
            nameRevenue: updates.nameRevenue ?? revenue.nameRevenue,
            valueRevenue: updates.valueRevenue ?? revenue.valueRevenue,
            dateRevenue: newDate,
            anotation: updates.anotation ?? revenue.anotation,
          };

          user.expensesRevenues.get(newMonthKey).revenues.push(movedRevenue);
          await user.save();

          const added = user.expensesRevenues.get(newMonthKey).revenues.at(-1);
          return res.json({
            msg: "Receita movida e atualizada com sucesso",
            revenue: added,
            monthYear: newMonthKey,
          });
        }
      }

      revenue.set(updates);
      await user.save();

      const updatedRevenue =
        user.expensesRevenues.get(monthYear).revenues.id(revenueId) ||
        user.expensesRevenues
          .get(monthYear)
          .revenues.find((r) => r._id?.toString() === revenueId);

      res.json({
        msg: "Receita atualizada com sucesso",
        revenue: updatedRevenue,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * DELETE /revenues/:monthYear/:revenueId
 */
app.delete(
  "/revenues/:monthYear/:revenueId",
  authenticateToken,
  async (req, res) => {
    try {
      const { monthYear, revenueId } = req.params;
      const user = await User.findById(req.user.id);
      if (!user)
        return res.status(404).json({ msg: "Usuário não encontrado." });

      const monthData = user.expensesRevenues.get(monthYear);
      if (!monthData)
        return res.status(404).json({ msg: "Mês/ano não encontrado." });

      const idx = monthData.revenues.findIndex(
        (r) => r._id?.toString() === revenueId
      );
      if (idx === -1)
        return res.status(404).json({ msg: "Receita não encontrada." });

      monthData.revenues.splice(idx, 1);
      await user.save();

      res.json({ msg: "Receita excluída com sucesso." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

/* ----------------- Servidor ----------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
