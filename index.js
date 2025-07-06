const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Simulando um banco de dados em memória
const users = [];

// Blacklist global
const blacklist = new Set();

// Middlewares
app.use(
  cors({
    origin: [
      "http://localhost:4200",
      "http://localhost:8100",
      "capacitor://localhost",
    ],
    credentials: true,
  })
);
app.use(express.json());

// Middleware para autenticação de token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]?.trim();

  console.log("🔐 Token recebido na rota protegida:", token);
  console.log("🛑 Blacklist atual:", [...blacklist]);
  console.log("❓ Token está na blacklist?", blacklist.has(token));

  if (!token) return res.status(401).json({ message: "Token não fornecido" });

  if (blacklist.has(token)) {
    return res
      .status(403)
      .json({ message: "Token expirado ou inválido (logout)" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Token inválido" });
    req.user = user;
    next();
  });
}

// Rota de registro
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  const userExists = users.find((u) => u.email === email);

  if (userExists) {
    return res.status(400).json({ message: "Usuário já existe" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ name, email, password: hashedPassword });

  res.status(201).json({ message: "Usuário registrado com sucesso" });
});

// Rota de login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email === email);

  if (!user) {
    return res.status(400).json({ message: "Credenciais inválidas" });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(400).json({ message: "Credenciais inválidas" });
  }

  const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  res.json({
    token,
    user: {
      email: user.email,
      name: user.name 
    },
  });
});

// Rota protegida
app.get("/api/protected", authenticateToken, (req, res) => {
  res.json({
    message: `Bem-vindo ${req.user.email}, esta é uma rota protegida.`,
  });
});

// Rota de logout
app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]?.trim();

  if (!token) {
    return res.status(400).json({ message: "Token não fornecido" });
  }

  console.log("🚪 Token adicionado à blacklist:", token);
  blacklist.add(token);

  res.json({ message: "Logout realizado com sucesso" });
});

// Inicializa o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
