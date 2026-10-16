// controllers/baiduAiController.js
// 调用百度智能云短语音识别 REST API（不用老 SDK，直接 axios 两步调用：
// 1. 用 API_KEY/SECRET_KEY 换 access_token（OAuth 2.0）
// 2. 把音频 base64 编码后 POST 到识别接口）
const axios = require('axios');

const API_KEY = process.env.BAIDU_API_KEY;
const SECRET_KEY = process.env.BAIDU_SECRET_KEY;

// 缓存 access_token，避免每次请求都去换 token（有效期约30天）
let cachedToken = null;

async function getAccessToken() {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.token;
    }
    const resp = await axios.post('https://aip.baidubce.com/oauth/2.0/token', null, {
        params: {
            grant_type: 'client_credentials',
            client_id: API_KEY,
            client_secret: SECRET_KEY,
        },
        timeout: 10000,
    });
    cachedToken = {
        token: resp.data.access_token,
        expiresAt: Date.now() + (resp.data.expires_in - 600) * 1000,
    };
    return cachedToken.token;
}

exports.transcribeAudio = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ msg: 'No audio file uploaded.' });
    }

    if (!API_KEY || !SECRET_KEY) {
        return res.status(500).json({
            msg: '百度AI凭证未配置：请在后端 .env 中填写 BAIDU_API_KEY 和 BAIDU_SECRET_KEY，然后重启服务器',
        });
    }

    const audioBuffer = req.file.buffer;

    try {
        const token = await getAccessToken();

        // 百度REST API要求：JSON体，含 base64 音频、格式、采样率、长度
        const payload = {
            format: 'wav',      // 前端 useRecorder 产出标准 16kHz wav
            rate: 16000,        // 采样率，必须与录音一致
            channel: 1,         // 单声道
            dev_pid: 1537,      // 普通话模型（支持简单英文）
            cuid: 'feynman-platform',
            token: token,
            len: audioBuffer.length,
            speech: audioBuffer.toString('base64'),
        };

        const { data } = await axios.post('https://vop.baidu.com/server_api', payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 20000,
        });

        console.log('Baidu ASR Result:', data.err_no, data.err_msg || '');

        if (data.err_no === 0) {
            // 成功：result 是句子数组，拼成一段文字
            return res.json({ result: data.result.join('') });
        }
        // 百度返回的业务错误（如凭证无效、音频格式不对）
        return res.status(500).json({ msg: `百度语音识别错误 (err_no=${data.err_no}): ${data.err_msg}` });
    } catch (error) {
        console.error('Error calling Baidu ASR API:', error.message);
        res.status(500).json({ msg: 'Server error during transcription.' });
    }
};
