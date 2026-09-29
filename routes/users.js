// routes/users.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); // 引入加密库
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth'); // 认证中间件

// 生成 JWT 的辅助函数
function generateToken(userId) {
    const payload = {
        user: {
            id: userId
        }
    };
    // 有效期 5 小时
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' });
}

// --- 用户注册 API (已集成密码加密) ---
// @route   POST /api/users/register
// @desc    注册一个新用户，成功后返回 JWT（注册即登录）
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // 1. 检查邮箱是否已注册（仅邮箱要求唯一）
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'Email already exists' });
        }

        // 2. 创建新用户实例
        user = new User({ username, email, password });

        // 3. 【安全核心】对密码进行哈希加密
        // genSalt 生成随机"盐"，保证即使两个用户密码相同，数据库中的哈希值也不同
        const salt = await bcrypt.genSalt(10); // 10 是安全强度，数值越大越安全但越耗时
        user.password = await bcrypt.hash(password, salt);

        // 4. 保存用户到数据库
        await user.save();

        // 5. 注册成功，生成 JWT 并返回，实现注册后自动登录
        const token = generateToken(user.id);
        res.status(201).json({ token, msg: 'User registered successfully' });
    } catch (err) {
        // Mongoose 校验错误（如邮箱格式不正确、缺少必填字段）返回 400
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ msg: messages.join(', ') });
        }
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// --- 用户登录 API ---
// @route   POST /api/users/login
// @desc    用户登录并获取 token
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. 根据邮箱检查用户是否存在
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // 2. 【安全核心】比较密码
        // bcrypt.compare 会自动处理盐值，匹配返回 true，否则 false
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        // 3. 登录成功，生成并返回 JWT
        const token = generateToken(user.id);
        res.json({ token });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// --- 修改密码 API ---
// @route   PUT /api/users/change-password
// @desc    修改当前登录用户的密码（需先验证旧密码）
// @access  Private
router.put('/change-password', auth, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        // 1. 参数校验：新密码不能为空，且至少 6 位
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ msg: 'New password must be at least 6 characters long' });
        }
        // 新旧密码不能相同
        if (oldPassword === newPassword) {
            return res.status(400).json({ msg: 'New password cannot be the same as the old one' });
        }

        // 2. 从数据库查出当前用户（含密码哈希）
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // 3. 验证旧密码是否正确
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Old password is incorrect' });
        }

        // 4. 用与注册相同的算法和强度哈希新密码，然后保存
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ msg: 'Password changed successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
