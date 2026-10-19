// utils/config.js 免费 / 会员额度 · 集中配置（改额度只动这一个文件）V3
module.exports = {
  // ---------- 简历数量 ----------
  MAX_RESUMES_FREE: 5, // 免费最多 5 份简历

  // ---------- 模板 ----------
  FREE_TEMPLATES: 'ALL', // V3：10 套模板全部免费，会员不再锁模板

  // ---------- AI 次数 ----------
  AI_POLISH_DAILY_FREE: 15, // 每天免费 AI 润色次数（polish 与 summary 共用）
  MEMBER_AI_COUNT: 999, // 会员不限次

  // ---------- 会员专属功能的免费体验次数 ----------
  JD_MATCH_FREE_COUNT: 1, // JD 匹配免费体验 1 次（累计，不按天）
  RESUME_CHECK_FREE_COUNT: 1, // 简历体检免费体验 1 次（累计，不按天）

  // ---------- AI 证件照 ----------
  ID_PHOTO_DAILY_FREE: 3, // 免费用户每天 3 次（带水印）

  // ---------- AI 功能权限矩阵 ----------
  // shared：免费用户可用，与 polish 共用每日免费额度
  // trial：免费用户可体验固定次数（JD_MATCH_FREE_COUNT / RESUME_CHECK_FREE_COUNT），之后要会员
  AI_ACTION_PERMISSION: {
    polish: 'shared',
    summary: 'shared',
    jdMatch: 'trial',
    check: 'trial'
  },

  // ---------- 会员套餐（微信虚拟支付，单位：元） ----------
  PRICING: {
    trial: { price: 1, days: 1, label: '新用户体验' },
    threeDay: { price: 3.9, days: 3, label: '3天会员' },
    monthly: { price: 9.9, days: 30, label: '月会员' },
    lifetime: { price: 19.9, days: 99999, label: '永久会员' }
  },

  // ---------- 会员权益（V3：不含模板，模板已全部免费） ----------
  VIP_BENEFITS: [
    { icon: '✨', title: 'AI 润色不限次', desc: '经历改写 / 自我评价随心用' },
    { icon: '🎯', title: 'JD 匹配不限次', desc: '岗位匹配分析随时测' },
    { icon: '🩺', title: '简历体检不限次', desc: '逐条问题诊断与建议' },
    { icon: '📷', title: '证件照高清无水印', desc: '不限次制作 + 高清导出' },
    { icon: '📄', title: '导出无水印', desc: '图片 / PDF 导出干净清爽' },
    { icon: '🚫', title: '全程去除广告', desc: '安静专注的编辑体验' },
    { icon: '📚', title: '简历份数不限', desc: '不同方向多版本随便建' }
  ],

  // ---------- 导出 ----------
  WATERMARK: '由简途简历生成' // 免费用户导出水印
};
