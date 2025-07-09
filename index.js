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

// Conexão com MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado ao MongoDB Atlas"))
  .catch((err) => console.error("❌ Erro ao conectar MongoDB:", err));

// Middleware para autenticar token JWT
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

// Rota de registro
app.post("/register", async (req, res) => {
  const { name, email, password, expenses, revenues } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ msg: "Email já registrado" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      expenses,
      revenues,
    });
    await newUser.save();

    res.status(201).json({ msg: "Usuário criado com sucesso", newUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rota de login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
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

// Rota de logout (stateless JWT)
app.post("/logout", (req, res) => {
  res.json({ msg: "Logout realizado. Remova o token do cliente." });
});

// Nova rota protegida para listar despesas do usuário
app.get("/expenses", authenticateToken, async (req, res) => {
  try {
    // Encontra o usuário pelo ID do token
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: "Usuário não encontrado." });
    }
    // Retorna o array de despesas do usuário, ordenado pela data
    const sortedExpenses = user.expenses.sort(
      (a, b) => b.dateExpense.getTime() - a.dateExpense.getTime()
    );
    res.json(sortedExpenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rota para adicionar uma nova despesa (agora aninhada no usuário)
app.post("/expenses", authenticateToken, async (req, res) => {
  try {
    const { icon, color, nameExpense, valueExpense, dateExpense, anotation } =
      req.body;

    // Encontra o usuário pelo ID do token
    const user = await User.findById(req.user.id);
    console.log("Usuário encontrado na rota /expenses:", user);

    if (!user) {
      return res.status(404).json({ msg: "Usuário não encontrado." });
    }

    const newExpenseData = {
      icon,
      color,
      nameExpense,
      valueExpense,
      dateExpense: new Date(dateExpense),
      anotation,
    };

    user.expenses.push(newExpenseData); // Adiciona a nova despesa ao array 'expenses' do usuário
    await user.save(); // Salva o documento do usuário atualizado

    // Retorna a despesa recém-adicionada (com o _id gerado pelo Mongoose para o subdocumento)
    const addedExpense = user.expenses[user.expenses.length - 1];
    res
      .status(201)
      .json({ msg: "Despesa criada com sucesso", expense: addedExpense });
  } catch (error) {
    console.error("Erro ao adicionar despesa:", error);
    res.status(500).json({ error: error.message });
  }
});

// Nova rota protegida para listar receitas do usuário
app.get("/revenues", authenticateToken, async (req, res) => {
  try {
    // Encontra o usuário pelo ID do token
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: "Usuário não encontrado." });
    }
    // Retorna o array de receitas do usuário, ordenado pela data
    const sortedRevenues = user.revenues.sort(
      (a, b) => b.dateRevenue.getTime() - a.dateRevenue.getTime()
    );
    res.json(sortedRevenues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/revenues", authenticateToken, async (req, res) => {
  try {
    const { icon, color, nameRevenue, valueRevenue, dateRevenue, anotation } =
      req.body;

    const newRevenueData = {
      icon,
      color,
      nameRevenue,
      valueRevenue,
      dateRevenue: new Date(dateRevenue), // converte string para Date
      anotation,
    };
    // Encontra o usuário pelo ID do token
    const user = await User.findById(req.user.id);
    console.log("Usuário encontrado na rota /revenues:", user);

    if (!user) {
      return res.status(404).json({ msg: "Usuário não encontrado." });
    }

    user.revenues.push(newRevenueData); // Adiciona a nova receita ao array 'revenues' do usuário
    await user.save(); // Salva o documento do usuário atualizado

    // Retorna a receita recém-adicionada (com o _id gerado pelo Mongoose para o subdocumento)
    const addedRevenue = user.revenues[user.revenues.length - 1];
    res
      .status(201)
      .json({ msg: "Receita criada com sucesso", revenues: addedRevenue });
  } catch (error) {
    console.error("Erro ao adicionar receita:", error);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
