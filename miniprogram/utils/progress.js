// utils/progress.js 简历完成度（蓝本 1.3）
// 基本20 + 教育15 + 实习25 + 项目25 + 技能10 + 自评5
function hasText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function calcProgress(resume) {
  if (!resume) return 0;
  let score = 0;

  // 基本信息 20%：name/phone/email 填几项按比例
  const b = resume.basics || {};
  const filled = [b.name, b.phone, b.email].filter(hasText).length;
  score += Math.round((filled / 3) * 20);

  // 教育 15%：至少 1 条
  if ((resume.education || []).length >= 1) score += 15;
  // 实习 25%：至少 1 段
  if ((resume.experience || []).length >= 1) score += 25;
  // 项目 25%：至少 1 个
  if ((resume.projects || []).length >= 1) score += 25;
  // 技能 10%：至少 1 个分类且有内容
  if ((resume.skills || []).some((s) => Array.isArray(s.items) && s.items.some(hasText))) score += 10;
  // 自我评价 5%：非空
  if (hasText(resume.summary)) score += 5;

  return Math.min(100, score);
}

// 进度条颜色：<40% 红 / 40%-70% 黄 / >70% 绿
function progressColor(percent) {
  if (percent < 40) return '#ef4444';
  if (percent <= 70) return '#f59e0b';
  return '#10b981';
}

module.exports = { calcProgress, progressColor };
