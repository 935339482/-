// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: {
        type: String,
        required: true,
        unique: true,
        // 邮箱格式校验：必须包含 @，且 @ 后面的域名中要包含一个 .
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
    },
    password: { type: String, required: true },
}, { timestamps: true }); // timestamps会自动添加createdAt和updatedAt字段

module.exports = mongoose.model('User', UserSchema);
