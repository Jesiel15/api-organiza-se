const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Simulando um banco de dados em memória
const users = [];

// Middlewares
app.use(cors({
  origin: ['http://localhost:4200', 'http://localhost:8100', 'capacitor://localhost'], // ajuste para seu app
  credentials: true
}));
app.use(express.json());

// Função middleware para proteger rotas
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Rota de registro
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  const userExists = users.find(u => u.email === email);

  if (userExists) {
    return res.status(400).json({ message: 'Usuário já existe' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ email, password: hashedPassword });

  res.status(201).json({ message: 'Usuário registrado com sucesso' });
});

// Rota de login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(400).json({ message: 'Credenciais inválidas' });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(400).json({ message: 'Credenciais inválidas' });
  }

  const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });

  res.json({
    token,
    user: {
      email: user.email
    }
  });
});

// Rota protegida
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: `Bem-vindo ${req.user.email}, esta é uma rota protegida.` });
});

// Inicializa o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
