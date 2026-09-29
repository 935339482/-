// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// 2. 创建一个 express 应用实例
const app = express();
const port = process.env.PORT || 3000;

// --- 核心中间件 ---
// 使用 cors 中间件 - 解决跨域问题
app.use(cors());

// 使用 express.json() 中间件 - 解析 JSON 格式的请求体
app.use(express.json());

// --- 数据库连接 ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- API 路由 ---
// 基础测试路由
app.get('/', (req, res) => {
  res.send('Hello, Feynman Learner!');
});

// 用户相关路由（注册、登录）：完整路径为 /api/users/register、/api/users/login
app.use('/api/users', require('./routes/users'));

// 知识点相关路由（CRUD，均需认证）：完整路径前缀为 /api/knowledge-points
app.use('/api/knowledge-points', require('./routes/knowledgePoints'));

// --- 启动服务器 ---
app.listen(port, () => {
  console.log(`Feynman Platform backend is running at http://localhost:${port}`);
});
