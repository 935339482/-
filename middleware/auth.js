// middleware/auth.js
const jwt = require('jsonwebtoken');

// 认证中间件：验证请求中携带的 JWT，保护需要登录才能访问的路由
module.exports = function (req, res, next) {
    // 1. 从请求头中获取 token
    // 同时支持两种常见方式：
    //  - Postman 的 "Bearer Token"（Authorization: Bearer <token>）
    //  - 课件中的自定义请求头 x-auth-token
    const authHeader = req.header('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;
    const token = bearerToken || req.header('x-auth-token');

    // 2. 检查 token 是否存在
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' }); // 401: 未授权
    }

    // 3. 验证 token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 将解码后的用户信息（特别是 user.id）附加到请求对象上
        req.user = decoded.user;

        // 调用 next()，将控制权交给下一个中间件或路由处理器
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
