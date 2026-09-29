// routes/knowledgePoints.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth'); // 引入认证中间件
const KnowledgePoint = require('../models/KnowledgePoint');

// 校验 id 是否为合法的 MongoDB ObjectId（24位十六进制）
function isValidObjectId(id) {
    return mongoose.isValidObjectId(id);
}

// @route   POST /api/knowledge-points
// @desc    创建一个新的知识点
// @access  Private (需要登录)
router.post('/', auth, async (req, res) => {
    try {
        const { title, content } = req.body;
        const newKp = new KnowledgePoint({
            title,
            content,
            user: req.user.id // 从 auth 中间件附加的 req.user 中获取用户 ID
        });
        const kp = await newKp.save();
        res.status(201).json(kp);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ msg: messages.join(', ') });
        }
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/knowledge-points
// @desc    获取当前用户的所有知识点（按创建时间倒序）
// @access  Private
router.get('/', auth, async (req, res) => {
    try {
        const kps = await KnowledgePoint.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json(kps);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/knowledge-points/:id
// @desc    获取单个知识点详情
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid knowledge point id' });
        }
        const kp = await KnowledgePoint.findById(req.params.id);
        if (!kp) {
            return res.status(404).json({ msg: 'Knowledge point not found' });
        }
        // 确保是该用户自己的知识点
        if (kp.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }
        res.json(kp);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/knowledge-points/:id
// @desc    更新一个知识点
// @access  Private
router.put('/:id', auth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid knowledge point id' });
        }
        let kp = await KnowledgePoint.findById(req.params.id);
        if (!kp) {
            return res.status(404).json({ msg: 'Knowledge point not found' });
        }
        // 确保是该用户自己的知识点
        if (kp.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        // 只更新请求中实际提供的字段，避免把未传字段覆盖成 undefined
        const { title, content, status, reviewList } = req.body;
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (status !== undefined) updates.status = status;
        if (reviewList !== undefined) updates.reviewList = reviewList;

        kp = await KnowledgePoint.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { returnDocument: 'after', runValidators: true } // 返回更新后的文档，并执行字段校验
        );
        res.json(kp);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ msg: messages.join(', ') });
        }
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/knowledge-points/:id
// @desc    删除一个知识点
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ msg: 'Invalid knowledge point id' });
        }
        const kp = await KnowledgePoint.findById(req.params.id);
        if (!kp) {
            return res.status(404).json({ msg: 'Knowledge point not found' });
        }
        if (kp.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }
        await KnowledgePoint.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Knowledge point removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
