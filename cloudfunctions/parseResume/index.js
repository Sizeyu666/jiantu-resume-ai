// cloudfunctions/parseResume/index.js V6（基于真实日志重写，替换 Hello World 空壳）
// 三种输入：
//   1) 文件 PDF：downloadFile → pdf-parse/lib/pdf-parse.js 提取全文
//   2) 文件图片：downloadFile → 腾讯云 OCR GeneralBasicOCR（ocr.v20181119）提取全文
//   3) 纯文本：event.text 直接解析
// 提取文本统一交给 DeepSeek 输出结构化 JSON
//
// 事件（扁平结构，兼容旧版 data 包裹）：
//   { action:'parseFile', fileID, type:'pdf'|'image' } 或 { text }
// 返回：{ success:true, data:{...结构化简历} } / { success:false, error }
//
// 环境变量：DEEPSEEK_API_KEY（必填）；图片识别另需 TENCENT_SECRET_ID / TENCENT_SECRET_KEY
// 部署：超时 60s；依赖 axios / pdf-parse@1.1.1 / tencentcloud-sdk-nodejs（云端安装）
const cloud = require('wx-server-sdk');
const axios = require('axios');
const tencentcloud = require('tencentcloud-sdk-nodejs');
// 关键：必须引 lib 下的入口，直接 require('pdf-parse') 在线上会去读包内测试 PDF 而报错
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function log(...args) {
  console.log('[parseResume]', ...args);
}

const SYSTEM_PROMPT = `你是简历解析助手。把用户给的简历文本解析成结构化JSON，只输出JSON，不要解释，不要markdown代码块，字段如下：
{
  "name":"", "phone":"", "email":"", "jobIntention":"",
  "education":[{"school":"","major":"","degree":"","start":"","end":""}],
  "work":[{"company":"","position":"","start":"","end":"","description":""}],
  "project":[{"name":"","role":"","start":"","end":"","description":""}],
  "skills":[], "certificates":[], "selfEvaluation":""
}
规则：
1. 文本里没有的内容留空字符串或空数组，禁止编造
2. 日期统一转成 YYYY.MM（如 2023.06）
3. 实习/正式工作都放 work；description 保留原文语义，多条职责用换行分隔
4. skills 放技能名称字符串数组；certificates 放证书/奖项名称字符串数组
5. OCR 文本可能有错字，结合上下文合理修正，拿不准保留原文
6. 明确的自我评价段落放 selfEvaluation，没有就留空字符串`;

async function callDeepSeek(text) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('云函数未配置 DEEPSEEK_API_KEY 环境变量');
  }
  const resp = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
    {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.slice(0, 12000) } // 控制 token 成本
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    },
    {
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      timeout: 40000
    }
  );
  let content = resp.data.choices[0].message.content || '';
  content = content.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(content);
  } catch (e) {
    log('DeepSeek 返回非合法 JSON，原文前 300 字：', content.slice(0, 300));
    throw new Error('AI 解析格式异常，请重试或改用粘贴文本');
  }
}

// 图片走腾讯云 OCR（文字识别 ocr，不是人体分析 bda）
async function ocrImage(base64) {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new Error('云函数未配置腾讯云密钥（TENCENT_SECRET_ID / TENCENT_SECRET_KEY），图片识别暂不可用');
  }
  const OcrClient = tencentcloud.ocr.v20181119.Client;
  const ocr = new OcrClient({
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: {
      httpProfile: { endpoint: 'ocr.tencentcloudapi.com', reqTimeout: 30 }
    }
  });
  const res = await ocr.GeneralBasicOCR({ ImageBase64: base64 });
  return (res.TextDetections || []).map((d) => d.DetectedText).filter(Boolean).join('\n');
}

exports.main = async (event = {}) => {
  const t0 = Date.now();
  // 扁平入参优先，兼容旧版 {data:{...}} 包裹
  const fileID = event.fileID || (event.data && event.data.fileID);
  const type = event.type || (event.data && event.data.type) || '';
  const directText = event.text || (event.data && event.data.text) || '';
  try {
    log('收到请求', { hasFileID: !!fileID, type, textLen: directText.length });
    let text = '';

    if ((event.action === 'parseFile' || fileID) && fileID) {
      if (type !== 'pdf' && type !== 'image') {
        return { success: false, error: '不支持的文件类型：' + type, code: 400, message: '不支持的文件类型' };
      }
      log('1/3 下载文件', type);
      const fileRes = await cloud.downloadFile({ fileID });
      if (!fileRes.fileContent || !fileRes.fileContent.length) {
        return { success: false, error: '文件内容为空，请重新上传', code: 400, message: '文件内容为空' };
      }

      log('2/3 提取文本，文件字节数', fileRes.fileContent.length);
      if (type === 'pdf') {
        const data = await pdfParse(fileRes.fileContent);
        text = (data.text || '').trim();
      } else {
        if (fileRes.fileContent.length > 7 * 1024 * 1024) {
          return { success: false, error: '图片过大（超过 7MB），请换一张更清晰且体积更小的简历截图', code: 400, message: '图片过大' };
        }
        text = await ocrImage(fileRes.fileContent.toString('base64'));
      }
    } else if (directText) {
      text = String(directText).trim();
    } else {
      return { success: false, error: '没有可解析的内容', code: 400, message: '没有可解析的内容' };
    }

    log('提取文本长度', text.length);
    if (text.length < 20) {
      const msg = type === 'pdf'
        ? 'PDF 中没有提取到文字（可能是扫描件），请改用图片识别或粘贴文本'
        : (type === 'image' ? '图片中没有识别到足够文字，请上传更清晰的简历截图' : '文本内容太少，请粘贴更完整的简历');
      return { success: false, error: msg, code: 400, message: msg };
    }

    log('3/3 DeepSeek 结构化解析');
    const parsed = await callDeepSeek(text);
    log('完成，耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    // V6 扁平返回 + 旧版 code/data.result 契约双兼容
    return { success: true, data: parsed, code: 0, result: parsed };
  } catch (e) {
    console.error('[parseResume] 失败，耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's', e);
    const msg = e.code ? `${e.code}: ${e.message}` : (e.message || '解析失败');
    return { success: false, error: msg, code: 500, message: msg };
  }
};
