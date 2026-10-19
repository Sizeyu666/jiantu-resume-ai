// utils/util.js 通用工具 V2
const { DEFAULT_SECTION_ORDER } = require('./constants');

// ---------- 防抖（编辑器输入 → 预览/存库 用 300ms） ----------
function debounce(fn, wait = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatDate(date = new Date(), fmt = 'YYYY-MM-DD') {
  const d = date instanceof Date ? date : new Date(date);
  return fmt
    .replace('YYYY', d.getFullYear())
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()));
}

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - Number(ts);
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return '刚刚';
  if (diff < hour) return Math.floor(diff / min) + ' 分钟前';
  if (diff < day) return Math.floor(diff / hour) + ' 小时前';
  if (diff < 2 * day) return '昨天';
  return formatDate(new Date(Number(ts)), 'YYYY-MM-DD');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- 空简历工厂 ----------
function createEmptyResume(title = '未命名简历') {
  return {
    title,
    templateId: 'a1',
    themeColor: '#555555',
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    sectionTitles: {}, // 板块重命名覆盖（key → 自定义标题）
    fontSize: 'medium', // small | medium | large（预览页可调）
    spacing: 'normal', // compact | normal | loose
    basics: { name: '', phone: '', email: '', city: '', jobIntent: '', github: '', blog: '', wechat: '', avatarFileID: '' },
    education: [],
    experience: [],
    projects: [],
    campus: [],
    skills: [],
    certificates: [],
    // V2 新增可选板块（默认空，用户添加后出现）
    work: [],
    awards: [],
    languages: [],
    customSections: [],
    summary: ''
  };
}

// ---------- 各板块空条目工厂 ----------
function createEducation() {
  return { id: uid(), school: '', degree: '本科', major: '', start: '', end: '', gpa: '', courses: '', highlights: [] };
}
function createExperience() {
  return { id: uid(), company: '', role: '', city: '', start: '', end: '', bullets: [''] };
}
function createProject() {
  return { id: uid(), name: '', role: '', start: '', end: '', techStack: [], bullets: [''] };
}
function createCampus() {
  return { id: uid(), org: '', role: '', start: '', end: '', bullets: [''] };
}
function createSkillGroup() {
  return { id: uid(), category: '', items: [] };
}
function createCertificate() {
  return { id: uid(), name: '', issuer: '', date: '' };
}
// V2 新增
function createWork() {
  return { id: uid(), company: '', role: '', city: '', start: '', end: '', bullets: [''] };
}
function createAward() {
  return { id: uid(), name: '', issuer: '', date: '' };
}
function createLanguage() {
  return { id: uid(), name: '', level: '' };
}
// 自定义板块：kind = bullets | text | skills | certs
function createCustomSection(title, kind) {
  const sec = { id: 'custom_' + uid(), title: title || '自定义板块', kind };
  if (kind === 'bullets') sec.bullets = [''];
  else if (kind === 'text') sec.text = '';
  else if (kind === 'skills') sec.groups = [{ id: uid(), category: '', items: [] }];
  else sec.rows = [{ id: uid(), name: '', detail: '' }];
  return sec;
}

// ---------- AI 解析简历（parseResume）结果归一化：补齐字段 + 数组条目加 id ----------
// 兼容两种 AI 输出：
//   V5 旧结构：{basics:{name...}, experience:[{bullets:[]}], projects:[{bullets:[]}], summary}
//   V6 扁平结构：{name, phone, jobIntention, work:[{position,description}], project:[...], skills:[], certificates:[], selfEvaluation}
function splitDescription(desc) {
  if (Array.isArray(desc)) return desc.map((s) => String(s || '').trim()).filter(Boolean);
  const text = String(desc || '').trim();
  if (!text) return [];
  // 按换行拆；无换行时按中文分号拆。
  // 不剥行首数字——"3个月内销量提升30%"这类句子不能误当序号，只在确认是"数字+、/./）"列表符时才去掉
  let parts = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  parts = parts.map((s) => s.replace(/^[\u2022\u00b7\u25aa\u25cf\-*]\s*/, '').trim());
  if (parts.length <= 1) {
    parts = text.split(/[；;]\s*/).map((s) => s.trim()).filter(Boolean);
  }
  return parts;
}

// AI/云函数有时会把简历对象多包一层（{data:{result:{...}}}、{resume:{...}}、{result:{...}}）
// 逐层下钻找到真正含简历字段的对象
function isResumeLike(o) {
  return !!o && typeof o === 'object' && !Array.isArray(o) && (
    !!o.basics ||
    typeof o.name === 'string' ||
    Array.isArray(o.work) || Array.isArray(o.project) ||
    Array.isArray(o.education) || Array.isArray(o.experience) || Array.isArray(o.projects)
  );
}
function unwrapResumeObject(input) {
  if (!input || typeof input !== 'object') return {};
  if (isResumeLike(input)) return input;
  // 广度优先沿常见容器键下钻
  const queue = [input];
  const seen = new Set();
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    for (const key of ['data', 'result', 'resume']) {
      const child = cur[key];
      if (isResumeLike(child)) return child;
      if (child && typeof child === 'object') queue.push(child);
    }
  }
  return input;
}

function adaptV6Shape(obj) {
  obj = unwrapResumeObject(obj);
  if (!obj || typeof obj !== 'object') return {};
  // 已是旧嵌套结构：直接透传
  if (obj.basics || Array.isArray(obj.experience) || Array.isArray(obj.projects)) return obj;
  const out = {};
  out.basics = {
    name: obj.name || '',
    phone: obj.phone || '',
    email: obj.email || '',
    city: obj.city || '',
    jobIntent: obj.jobIntention || obj.jobIntent || '',
    github: obj.github || '',
    blog: obj.blog || '',
    wechat: obj.wechat || ''
  };
  out.education = (Array.isArray(obj.education) ? obj.education : []).map((e) => ({
    school: e.school || '',
    degree: e.degree || '',
    major: e.major || '',
    start: e.start || '',
    end: e.end || '',
    gpa: e.gpa || '',
    courses: e.courses || '',
    highlights: []
  }));
  out.experience = (Array.isArray(obj.work) ? obj.work : []).map((w) => ({
    company: w.company || '',
    role: w.position || w.role || '',
    city: w.city || '',
    start: w.start || '',
    end: w.end || '',
    bullets: splitDescription(w.description || w.bullets)
  }));
  out.projects = (Array.isArray(obj.project) ? obj.project : []).map((p) => ({
    name: p.name || '',
    role: p.role || '',
    start: p.start || '',
    end: p.end || '',
    techStack: [],
    bullets: splitDescription(p.description || p.bullets)
  }));
  const skillArr = Array.isArray(obj.skills) ? obj.skills : [];
  out.skills = skillArr.length ? [{ category: '', items: skillArr.map((s) => (typeof s === 'string' ? s : (s && s.name) || '')).filter(Boolean) }] : [];
  out.certificates = (Array.isArray(obj.certificates) ? obj.certificates : [])
    .map((c) => (typeof c === 'string' ? { name: c } : c))
    .filter((c) => c && c.name);
  out.summary = obj.selfEvaluation || obj.summary || '';
  return out;
}

function normalizeParsedResume(rawObj) {
  const base = createEmptyResume();
  const obj = adaptV6Shape(rawObj);
  if (!obj || typeof obj !== 'object') return base;
  const out = { ...base, ...obj };
  out.basics = { ...base.basics, ...(obj.basics || {}) };
  ['education', 'experience', 'projects', 'campus', 'skills', 'certificates', 'work', 'awards', 'languages'].forEach((k) => {
    out[k] = Array.isArray(obj[k]) ? obj[k].map((it) => ({ id: uid(), ...it })) : [];
  });
  // bullets / techStack / items / highlights 保证是数组
  const bulletLists = ['experience', 'projects', 'campus', 'work'];
  bulletLists.forEach((k) => out[k].forEach((it) => { it.bullets = Array.isArray(it.bullets) ? it.bullets : []; }));
  out.projects.forEach((it) => { it.techStack = Array.isArray(it.techStack) ? it.techStack : []; });
  out.education.forEach((it) => { it.highlights = Array.isArray(it.highlights) ? it.highlights : []; });
  out.skills.forEach((it) => {
    it.items = Array.isArray(it.items) ? it.items : [];
    it.id = it.id || uid();
  });
  out.customSections = [];
  out.sectionTitles = {};
  out.summary = typeof obj.summary === 'string' ? obj.summary : '';
  out.title = 'AI 解析的简历';
  // 只保留实际有数据的标准板块到 sectionOrder
  const has = {
    education: out.education.length,
    experience: out.experience.length,
    projects: out.projects.length,
    campus: out.campus.length,
    skills: out.skills.some((s) => (s.items || []).length),
    certificates: out.certificates.length,
    work: out.work.length,
    awards: out.awards.length,
    languages: out.languages.length
  };
  out.sectionOrder = DEFAULT_SECTION_ORDER.filter((k) => has[k]).concat(
    ['work', 'awards', 'languages'].filter((k) => has[k] && DEFAULT_SECTION_ORDER.indexOf(k) < 0)
  );
  if (out.summary) out.sectionOrder.push('summary');
  return out;
}

module.exports = {
  debounce,
  pad,
  formatDate,
  formatRelative,
  uid,
  createEmptyResume,
  createEducation,
  createExperience,
  createProject,
  createCampus,
  createSkillGroup,
  createCertificate,
  createWork,
  createAward,
  createLanguage,
  createCustomSection,
  normalizeParsedResume
};
