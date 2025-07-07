require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const User = require("./models/User");
const Expense = require("./models/Expense"); // importe o model Expense que você criará

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
  const { name, email, password } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ msg: "Email já registrado" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ msg: "Usuário criado com sucesso" });
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
    const expenses = await Expense.find({ userId: req.user.id }).sort({
      dateExpense: -1,
    });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/expenses", authenticateToken, async (req, res) => {
  try {
    const { icon, color, nameExpense, valueExpense, dateExpense, anotation } =
      req.body;

    const newExpense = new Expense({
      userId: req.user.id, // vem do token decodificado
      icon,
      color,
      nameExpense,
      valueExpense,
      dateExpense: new Date(dateExpense), // converte string para Date
      anotation,
    });

    await newExpense.save();
    res
      .status(201)
      .json({ msg: "Despesa criada com sucesso", expense: newExpense });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
