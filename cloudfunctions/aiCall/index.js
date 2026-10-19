// cloudfunctions/aiCall/index.js
// AI 统一中转：action = polish | summary | jdMatch | check
// DeepSeek API Key 放在云函数环境变量 DEEPSEEK_API_KEY，绝不出现在前端代码
// 部署注意：请在云控制台把本函数超时时间改为 60s（AI 响应较慢）
const https = require('https');

// ================= Prompt 模板（蓝本第二章，写死，勿改方向） =================

// 2.1 单段 bullet 润色
const POLISH_PROMPT = `你是一名有5年经验的互联网大厂HR和职业教练，专门辅导中国应届生写简历。用户会给你一段实习或项目经历的原始描述。请按以下规则改写：
1. 动词开头：主导、搭建、优化、推动、设计、实现、负责、提升、分析
2. 必须量化成果：用具体数字、百分比、用户数、效率提升
3. 长度控制在60-120个中文字符
4. 禁止编造用户原文里没有的公司名、项目名、奖项、数据；如果原文没有数据，用【请填具体数字】占位让用户自己补
5. 不要写空话套话，比如"具有良好的沟通能力""团队合作精神"
6. 不要用"参与了""协助了"这种弱动词，改成主动语态
7. 直接输出改写后的文本，不要解释，不要前后缀`;

// 2.2 自我评价一键生成
const SUMMARY_PROMPT = `根据用户的教育背景、实习经历、项目经历和技能，生成一段100-150字的应届生自我评价。要求：突出求职意向相关的匹配度、不吹嘘、不空话、分2-3句、不要"本人性格开朗"这种废话。直接输出自我评价正文。`;

// 2.3 JD 匹配打分（权重写死：硬技能50 / 经历20 / 教育15 / 地点年限15）
const JD_MATCH_PROMPT = `你是一名资深简历匹配分析师。用户会给你一份简历内容和一段 JD（职位描述）。
请按以下权重计算匹配分：硬技能匹配 50%、经历相关度 20%、教育背景 15%、地点/年限 15%。

只输出如下结构的合法 JSON，不要输出任何其他文字、解释或 markdown 代码块：
{
  "matchScore": 0到100的整数,
  "summary": "一句话总评，30字以内",
  "requiredSkills": [
    {"skill": "技能名", "inResume": true或false, "confidence": 1到5的整数, "suggestion": "缺失时给补充建议，已覆盖则为空字符串"}
  ],
  "bonusSkills": [
    {"skill": "加分技能名", "inResume": true或false, "confidence": 1到5的整数, "suggestion": "建议"}
  ],
  "missingKeywords": ["关键词1", "关键词2"],
  "atsFriendly": true或false,
  "atsWarnings": ["ATS 友好性警告，无警告则为空数组"]
}

规则：
1. requiredSkills 从 JD 明确要求的硬技能中提取，不超过 8 个
2. bonusSkills 为 JD 中"优先/加分"的技能，不超过 5 个
3. missingKeywords 为 JD 高频出现但简历未覆盖的关键词，不超过 6 个
4. 检查简历板块命名是否标准（教育经历/实习经历/项目经历/专业技能/证书奖项/自我评价），不标准写进 atsWarnings
5. 禁止编造简历里不存在的内容`;

// 2.4 简历体检（5 项检查，红/黄/绿分级）
const CHECK_PROMPT = `你是一名严格的简历审核专家。用户会给你一份简历内容。请完成以下 5 项检查：
1. 每条经历 bullet 是否有量化数字？列出没量化的条目
2. 简历内容量是否可能超过 1 页 A4（应届生应控制 1 页）？
3. 有没有错别字、时态不一致、人称不一致？
4. 有没有"负责、参与、协助"这类弱动词？给出替换建议
5. 技能栏是否堆了与意向方向无关的技术？

只输出如下结构的合法 JSON，不要输出任何其他文字或 markdown 代码块：
{
  "items": [
    {
      "id": 1到5的整数,
      "name": "检查项名称",
      "level": "red或yellow或green",
      "pass": true或false,
      "detail": "具体问题描述；通过时写简短达标说明",
      "suggestions": ["具体修改建议"]
    }
  ]
}
规则：level 中 red=必须改，yellow=建议改，green=已达标；items 按严重程度排序输出（red 在前，green 在后）`;

// ================= DeepSeek 调用（核心库 https，无需额外依赖） =================
function callDeepSeek(messages, options = {}) {
  const { temperature = 0.7, jsonMode = false } = options;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('云函数未配置 DEEPSEEK_API_KEY 环境变量'));
  }
  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages,
    temperature,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
  });
  const reqOptions = {
    hostname: 'api.deepseek.com',
    path: '/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(body)
    },
    timeout: 50000
  };
  return new Promise((resolve, reject) => {
    const req = https.request(reqOptions, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.error) {
            return reject(new Error(data.error.message || 'DeepSeek API 错误'));
          }
          resolve(data.choices[0].message.content || '');
        } catch (e) {
          reject(new Error('AI 响应解析失败'));
        }
      });
    });
    req.on('error', () => reject(new Error('AI 服务网络异常')));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('AI 请求超时，请重试'));
    });
    req.write(body);
    req.end();
  });
}

// 解析 AI 返回的 JSON（容错：去掉可能包裹的 markdown 代码块）
function safeParseJson(content) {
  if (!content) return null;
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('[aiCall] JSON 解析失败，原文：', content.slice(0, 300));
    return null;
  }
}

// 简历对象 → 纯文本（summary / jdMatch / check 的 prompt 素材）
function resumeToText(r = {}) {
  const b = r.basics || {};
  const lines = [];
  if (b.name) lines.push(`姓名：${b.name}`);
  if (b.jobIntent) lines.push(`意向：${b.jobIntent}`);
  if (b.city) lines.push(`城市：${b.city}`);
  (r.education || []).forEach((e) => {
    lines.push(`【教育经历】${e.school || ''} ${e.degree || ''} ${e.major || ''} ${e.start || ''}-${e.end || ''}${e.gpa ? ' GPA:' + e.gpa : ''}`);
    if (e.courses) lines.push(`  课程：${e.courses}`);
  });
  (r.experience || []).forEach((e) => {
    lines.push(`【实习经历】${e.company || ''} ${e.role || ''} ${e.start || ''}-${e.end || ''}`);
    (e.bullets || []).filter(Boolean).forEach((t) => lines.push(`  · ${t}`));
  });
  (r.projects || []).forEach((p) => {
    lines.push(`【项目经历】${p.name || ''} ${p.role || ''} ${p.start || ''}-${p.end || ''} 技术栈:${(p.techStack || []).join('/')}`);
    (p.bullets || []).filter(Boolean).forEach((t) => lines.push(`  · ${t}`));
  });
  (r.campus || []).forEach((c) => {
    lines.push(`【校园经历】${c.org || ''} ${c.role || ''} ${c.start || ''}-${c.end || ''}`);
    (c.bullets || []).filter(Boolean).forEach((t) => lines.push(`  · ${t}`));
  });
  (r.skills || []).forEach((s) => lines.push(`【专业技能】${s.category || ''}：${(s.items || []).join('、')}`));
  (r.certificates || []).forEach((c) => lines.push(`【证书奖项】${c.name || ''} ${c.issuer || ''} ${c.date || ''}`));
  if (r.summary) lines.push(`【自我评价】${r.summary}`);
  return lines.join('\n');
}

// 2.5 粘贴文本 → 结构化简历（导入简历功能）
const PARSE_RESUME_PROMPT = `你是简历解析助手。用户会粘贴一段格式自由的简历纯文本，请解析成结构化 JSON。

只输出如下结构的合法 JSON，不要输出任何其他文字、解释或 markdown 代码块：
{
  "basics": {"name":"","phone":"","email":"","city":"","jobIntent":"","github":"","blog":"","wechat":""},
  "education":[{"school":"","degree":"","major":"","start":"","end":"","gpa":"","courses":"","highlights":[""]}],
  "experience":[{"company":"","role":"","city":"","start":"","end":"","bullets":[""]}],
  "projects":[{"name":"","role":"","start":"","end":"","techStack":[""],"bullets":[""]}],
  "campus":[{"org":"","role":"","start":"","end":"","bullets":[""]}],
  "skills":[{"category":"","items":[""]}],
  "certificates":[{"name":"","issuer":"","date":""}],
  "summary":""
}

规则：
1. 识别不出来的字段留空字符串，数组没有内容就给空数组，禁止编造
2. 日期统一转成 YYYY.MM 格式（如 2023.06）
3. 工作/实习都放 experience；bullet 保留原文语义，可轻微合并断句但不要改写内容
4. 技能按相关性归入分类（编程语言/框架工具/语言/其他）
5. 文本里明确的自我评价段落放 summary，没有就留空`;

// ================= 入口 =================
const mainHandler = async (event) => {
  const { action, data = {} } = event;
  console.log('[aiCall] 收到 action =', action);
  try {
    switch (action) {
      case 'polish': {
        const text = String(data.text || '').trim();
        if (!text) return { code: 400, message: '原文不能为空' };
        const content = await callDeepSeek([
          { role: 'system', content: POLISH_PROMPT },
          { role: 'user', content: text }
        ]);
        return { code: 0, data: { result: content.trim() } };
      }

      case 'summary': {
        const resumeText = resumeToText(data.resume);
        if (!resumeText) return { code: 400, message: '简历内容为空，请先填写经历' };
        const content = await callDeepSeek([
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: resumeText }
        ]);
        return { code: 0, data: { result: content.trim() } };
      }

      case 'jdMatch': {
        const resumeText = resumeToText(data.resume);
        const jdText = String(data.jdText || '').trim();
        if (!resumeText || !jdText) return { code: 400, message: '简历内容或 JD 为空' };
        const content = await callDeepSeek(
          [
            { role: 'system', content: JD_MATCH_PROMPT },
            { role: 'user', content: `【简历内容】\n${resumeText}\n\n【JD】\n${jdText}` }
          ],
          { jsonMode: true, temperature: 0.3 }
        );
        const result = safeParseJson(content);
        if (!result) return { code: 500, message: 'AI 返回格式异常，请重试' };
        return { code: 0, data: { result } };
      }

      case 'check': {
        const resumeText = resumeToText(data.resume);
        if (!resumeText) return { code: 400, message: '简历内容为空' };
        const content = await callDeepSeek(
          [
            { role: 'system', content: CHECK_PROMPT },
            { role: 'user', content: resumeText }
          ],
          { jsonMode: true, temperature: 0.3 }
        );
        const result = safeParseJson(content);
        if (!result) return { code: 500, message: 'AI 返回格式异常，请重试' };
        return { code: 0, data: { result } };
      }

      case 'parseResume': {
        const rawText = String(data.text || '').trim();
        if (rawText.length < 30) return { code: 400, message: '简历文本内容太少（至少 30 字），请粘贴完整内容' };
        const content = await callDeepSeek(
          [
            { role: 'system', content: PARSE_RESUME_PROMPT },
            { role: 'user', content: rawText }
          ],
          { jsonMode: true, temperature: 0.1 }
        );
        const result = safeParseJson(content);
        if (!result) return { code: 500, message: 'AI 解析格式异常，请重试或手动填写' };
        return { code: 0, data: { result } };
      }

      default:
        return { code: 400, message: '未知 action: ' + action };
    }
  } catch (e) {
    console.error('[aiCall] 调用失败', action, e);
    return { code: 500, message: e.message || 'AI 服务异常，请稍后重试' };
  }
};

// ---------- 统一出口：兼容旧 code 契约 + 新 success/error 结构，兜底所有未捕获异常 ----------
exports.main = async (event = {}) => {
  console.log('[aiCall] 收到参数', { action: event.action });
  let result;
  try {
    result = await mainHandler(event);
  } catch (e) {
    console.error('[aiCall] 未捕获异常', e);
    result = { code: 500, message: e.message || 'AI 服务异常，请稍后重试' };
  }
  result.success = result.code === 0;
  if (!result.success) result.error = result.error || result.message || 'AI 服务异常';
  console.log('[aiCall] 返回', { action: event.action, success: result.success, code: result.code });
  return result;
};
