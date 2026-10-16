// controllers/baiduAiController.js
// 调用百度智能云短语音识别 REST API（不用老 SDK，直接 axios 两步调用：
// 1. 用 API_KEY/SECRET_KEY 换 access_token（OAuth 2.0）
// 2. 把音频 base64 编码后 POST 到识别接口）
const axios = require('axios');

const API_KEY = process.env.BAIDU_API_KEY;
const SECRET_KEY = process.env.BAIDU_SECRET_KEY;

// 千帆大模型凭证：未单独配置时，复用语音识别的应用凭证（同一百度账号下通用）
const QIANFAN_API_KEY = process.env.QIANFAN_API_KEY || API_KEY;
const QIANFAN_SECRET_KEY = process.env.QIANFAN_SECRET_KEY || SECRET_KEY;
// 可用模型列表：优先用环境变量指定的，否则依次尝试免费的 Speed/Lite/Tiny 模型
const QIANFAN_MODELS = (process.env.QIANFAN_MODEL
    ? process.env.QIANFAN_MODEL.split(',').map((m) => m.trim())
    : ['ernie-speed-128k', 'ernie-speed-8k', 'ernie-lite-8k', 'ernie-tiny-8k']
);

// 通用 token 获取：用指定的 API_KEY/SECRET_KEY 换百度 OAuth access_token
async function getBaiduToken(apiKey, secretKey, cacheSlot) {
    if (cacheSlot.token && Date.now() < cacheSlot.expiresAt) {
        return cacheSlot.token;
    }
    const resp = await axios.post('https://aip.baidubce.com/oauth/2.0/token', null, {
        params: {
            grant_type: 'client_credentials',
            client_id: apiKey,
            client_secret: secretKey,
        },
        timeout: 10000,
    });
    cacheSlot.token = resp.data.access_token;
    cacheSlot.expiresAt = Date.now() + (resp.data.expires_in - 600) * 1000;
    return cacheSlot.token;
}

// 语音识别 token 缓存
const asrTokenCache = { token: null, expiresAt: 0 };
// 千帆大模型 token 缓存
const qianfanTokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
    return getBaiduToken(API_KEY, SECRET_KEY, asrTokenCache);
}

async function getQianfanAccessToken() {
    return getBaiduToken(QIANFAN_API_KEY, QIANFAN_SECRET_KEY, qianfanTokenCache);
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

// --- 大模型（文心/千帆）相关 ---

// 从大模型返回中提取 JSON：模型有时会用 ```json ... ``` 包裹或带解释文字
function extractJson(text) {
    if (!text) return null;
    // 优先处理代码块包裹
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenceMatch ? fenceMatch[1] : text;
    // 再兜底：截取第一个 { 到最后一个 }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(candidate.slice(start, end + 1));
    }
    return JSON.parse(candidate);
}

// @doc POST /api/audio/evaluate
// 入参: { originalContent, transcribedText }
// 出参: { polishedText, evaluation, strengths[], weaknesses[], score }
exports.evaluateFeynmanAttempt = async (req, res) => {
    const { originalContent, transcribedText } = req.body;

    if (!originalContent || !transcribedText) {
        return res
            .status(400)
            .json({ msg: 'Original content and transcribed text are required.' });
    }

    if (!QIANFAN_API_KEY || !QIANFAN_SECRET_KEY) {
        return res.status(500).json({
            msg: '千帆大模型凭证未配置：请在 .env 中填写 QIANFAN_API_KEY 和 QIANFAN_SECRET_KEY（或 BAIDU_API_KEY）',
        });
    }

    // 提示词工程：角色扮演 + 明确任务 + 上下文 + JSON输出约束
    const prompt = `
你是一个严格而友善的计算机科学学习教练。你的任务是评估学生对一个知识点的复述，并给出反馈。

【原始知识点】:
\`\`\`
${originalContent}
\`\`\`

【学生的口头复述文本】:
\`\`\`
${transcribedText}
\`\`\`

请你完成以下三项任务:
1. 文本润色: 将学生的复述文本润色成一段通顺、专业、书面化的中文文字。修正明显的语法错误、重复和口语化表达（如"嗯""啊""那个"），但保持其核心观点不变。
2. 综合评价: 基于原始知识点，对学生的复述进行评价，指出优点和可以改进的地方。
3. 评分: 综合考虑准确性、完整性、逻辑性和流畅性，给出一个0到100的整数分数。

请严格按照以下JSON格式返回你的结果，不要包含任何额外的解释或文字：
{
  "polishedText": "润色后的书面语文本",
  "evaluation": "综合评价",
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["可以改进的地方1", "可以改进的地方2"],
  "score": 85
}`;

    try {
        const accessToken = await getQianfanAccessToken();
        const url = `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions?access_token=${accessToken}`;

        // 依次尝试配置中的模型（不同账号开通的免费模型可能不同）
        let lastError = null;
        for (const model of QIANFAN_MODELS) {
            try {
                const { data } = await axios.post(
                    url,
                    {
                        model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3, // 低温度：评价更稳定
                    },
                    { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
                );

                if (!data.result) {
                    lastError = new Error(`模型 ${model} 返回为空: ${JSON.stringify(data).slice(0, 200)}`);
                    continue;
                }

                const feedback = extractJson(data.result);
                // 规范化字段：缺字段时给默认值，score 强制为 0-100 整数
                const score = Math.max(0, Math.min(100, parseInt(feedback.score, 10) || 0));
                console.log(`Qianfan LLM OK (model=${model}), score=${score}`);
                return res.json({
                    polishedText: feedback.polishedText || '',
                    evaluation: feedback.evaluation || '',
                    strengths: Array.isArray(feedback.strengths) ? feedback.strengths : [],
                    weaknesses: Array.isArray(feedback.weaknesses) ? feedback.weaknesses : [],
                    score,
                    model,
                });
            } catch (err) {
                const errCode = err.response?.data?.error_code;
                const errMsg = err.response?.data?.error_msg || err.message;
                console.warn(`模型 ${model} 调用失败: ${errCode} ${errMsg}`);
                lastError = err;
                // 非模型可用性类错误（如 token 失效）直接中断尝试
                if (errCode === 110 || errCode === 111) break;
            }
        }

        const detail =
            lastError?.response?.data?.error_msg ||
            lastError?.response?.data?.error ||
            lastError?.message ||
            '未知错误';
        console.error('所有千帆模型均调用失败:', detail);
        return res.status(500).json({
            msg: `AI评价服务暂不可用：${detail}。请到千帆控制台确认已开通相关模型（如 ERNIE Speed）。`,
        });
    } catch (error) {
        console.error('Error calling Qianfan LLM API:', error.response?.data || error.message);
        res.status(500).json({ msg: 'Server error during AI evaluation.' });
    }
};
