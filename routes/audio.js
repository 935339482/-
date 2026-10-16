// routes/audio.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const { transcribeAudio } = require('../controllers/baiduAiController');

// 配置multer：使用内存存储，音频只是临时中转给百度AI，不落盘
// 限制10MB（百度短语音识别上限：时长60秒、文件10MB）
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

// @route   POST /api/audio/transcribe
// @desc    上传音频并进行语音识别
// @access  Private
router.post(
    '/transcribe',
    auth,
    upload.single('audio'), // 'audio' 必须和前端 FormData.append 的字段名一致
    transcribeAudio
);

// multer 错误处理：字段名不对、文件超过10MB等 → 返回400而不是500
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ msg: `音频上传失败: ${err.message}` });
    }
    next(err);
});

module.exports = router;
