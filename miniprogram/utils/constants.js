// utils/constants.js 全局常量 V4（30 套模板：A1-A11 商务 + B1-B12 侧边栏 + C1-C6 技术 + D1-D4 创意，全部免费）

// ---------- 简历模板 ----------
// layout: single 单栏 / sidebar 侧边栏；variant: 渲染器样式变体；photo: right 右上 / side 侧栏顶部 / none 无
// 设计依据：Trae-UI设计规范-V2.md（简洁专业、HR 友好、ATS 可解析）
const TEMPLATES = [
  // ============ A 类：经典商务风（A1-A11） ============
  { id: 'a1', name: '经典灰条', desc: '灰色块标题 · 无照片 · 稳重克制', scene: '国企 / 事业单位 / 全行业', free: true, defaultColor: '#555555', category: 'business', layout: 'single', variant: 'gray-block', photo: 'none' },
  { id: 'a2', name: '深蓝标题', desc: '深蓝标题横线 · 照片右上', scene: '金融 / 咨询 / 管培生', free: true, defaultColor: '#1e3a5f', category: 'business', layout: 'single', variant: 'left-ul', photo: 'right' },
  { id: 'a3', name: '极简黑白', desc: '中英双语标题 · 黑白极简', scene: '外企 / 全行业通用', free: true, defaultColor: '#111111', category: 'business', layout: 'single', variant: 'bw-en', photo: 'right' },
  { id: 'a4', name: '左线装饰', desc: '标题左竖线 · 层次清晰', scene: '互联网 / 运营 / 市场', free: true, defaultColor: '#2c5282', category: 'business', layout: 'single', variant: 'left-bar', photo: 'right' },
  { id: 'a5', name: '表格信息', desc: '信息表格化 · 一页紧凑', scene: '内容规整 / 行政文员', free: true, defaultColor: '#333333', category: 'business', layout: 'single', variant: 'info-table', photo: 'none' },
  { id: 'a7', name: '双语对照', desc: '板块标题中英对照 · 外企范', scene: '外企 / 留学申请 / 全行业', free: true, defaultColor: '#33415c', category: 'business', layout: 'single', variant: 'dual-title', photo: 'right' },
  { id: 'a8', name: '宽边留白', desc: '大留白宽边距 · 高级感', scene: '设计 / 产品 / 运营', free: true, defaultColor: '#1e3a5f', category: 'business', layout: 'single', variant: 'wide-margin', photo: 'right' },
  { id: 'a9', name: '细横分隔', desc: '板块间细灰线 · 清爽', scene: '行政 / 人力 / 全行业', free: true, defaultColor: '#4a5568', category: 'business', layout: 'single', variant: 'thin-line', photo: 'right' },
  { id: 'a10', name: '墨绿商务', desc: '墨绿主色 · 严谨大方', scene: '国企 / 能源 / 制造业', free: true, defaultColor: '#2f5233', category: 'business', layout: 'single', variant: 'left-ul', photo: 'right' },
  { id: 'a11', name: '纯黑商务', desc: '纯黑主色 · 极简商务', scene: '咨询 / 法务 / 金融', free: true, defaultColor: '#111111', category: 'business', layout: 'single', variant: 'left-ul', photo: 'right' },

  // ============ B 类：侧边栏风（B1-B12） ============
  { id: 'b1', name: '深蓝侧栏', desc: '深蓝侧栏 · 照片居中顶部', scene: '金融 / 咨询 / 管培生', free: true, defaultColor: '#1e3a5f', category: 'sidebar', layout: 'sidebar', variant: 'side-dark', photo: 'side' },
  { id: 'b2', name: '深灰侧栏', desc: '深灰侧栏 · 沉稳现代', scene: '技术 / 工程 / 制造', free: true, defaultColor: '#2d3748', category: 'sidebar', layout: 'sidebar', variant: 'side-dark', photo: 'side' },
  { id: 'b3', name: '白色侧栏', desc: '浅灰侧栏 · 清爽干净', scene: '教育 / 人力 / 行政', free: true, defaultColor: '#2d3748', category: 'sidebar', layout: 'sidebar', variant: 'side-light', photo: 'side' },
  { id: 'b4', name: '墨绿侧栏', desc: '墨绿侧栏 · 严谨大方', scene: '国企 / 事业单位 / 能源', free: true, defaultColor: '#2f5233', category: 'sidebar', layout: 'sidebar', variant: 'side-dark', photo: 'side' },
  { id: 'b5', name: '酒红侧栏', desc: '酒红侧栏 · 温润有质感', scene: '文科 / 传媒 / 设计', free: true, defaultColor: '#742a2a', category: 'sidebar', layout: 'sidebar', variant: 'side-dark', photo: 'side' },
  { id: 'b8', name: '右侧边栏', desc: '侧栏在右 · 布局新颖', scene: '互联网 / 产品 / 运营', free: true, defaultColor: '#1e3a5f', category: 'sidebar', layout: 'sidebar', variant: 'side-right', photo: 'side' },
  { id: 'b9', name: '渐变侧栏', desc: '深蓝渐变侧栏 · 层次感', scene: '技术 / 设计 / 全行业', free: true, defaultColor: '#1e3a5f', category: 'sidebar', layout: 'sidebar', variant: 'side-gradient', photo: 'side' },
  { id: 'b10', name: '无照片侧栏', desc: '极简侧栏 · 内容优先', scene: '科研 / 学术 / 技术', free: true, defaultColor: '#2d3748', category: 'sidebar', layout: 'sidebar', variant: 'side-dark', photo: 'none' },
  { id: 'b11', name: '金色侧栏', desc: '暖金侧栏 · 与众不同', scene: '市场 / 传媒 / 文创', free: true, defaultColor: '#94680a', category: 'sidebar', layout: 'sidebar', variant: 'side-dark', photo: 'side' },
  { id: 'b12', name: '黑色侧栏', desc: '纯黑侧栏 · 强对比', scene: '技术 / 极客 / 设计', free: true, defaultColor: '#111111', category: 'sidebar', layout: 'sidebar', variant: 'side-dark', photo: 'side' },

  // ============ C 类：技术风（C1-C6） ============
  { id: 'c1', name: '技能进度条', desc: '技能熟练度进度条 · 技术范', scene: '研发 / 算法 / 数据', free: true, defaultColor: '#2563eb', category: 'tech', layout: 'single', variant: 'tech-bars', photo: 'right' },
  { id: 'c2', name: '技能标签云', desc: '技能标签云 · 直观紧凑', scene: '前端 / 测试 / 运维', free: true, defaultColor: '#0e7490', category: 'tech', layout: 'single', variant: 'tech-tags', photo: 'right' },
  { id: 'c3', name: '代码注释风', desc: '// 注释式标题 · 程序员专属', scene: '研发 / 极客 / 开源', free: true, defaultColor: '#2ea043', category: 'tech', layout: 'single', variant: 'code-title', photo: 'right' },
  { id: 'c4', name: '卡片经历', desc: '经历卡片化 · 模块清晰', scene: '产品 / 运营 / 技术', free: true, defaultColor: '#1d4ed8', category: 'tech', layout: 'single', variant: 'tech-card', photo: 'right' },
  { id: 'c5', name: '时间轴', desc: '左侧时间轴 · 成长轨迹', scene: '实习多段 / 晋升路径', free: true, defaultColor: '#7c3aed', category: 'tech', layout: 'single', variant: 'tech-timeline', photo: 'right' },
  { id: 'c6', name: '双列并排', desc: '板块双列排布 · 信息密度高', scene: '经历丰富 / 社招', free: true, defaultColor: '#334155', category: 'tech', layout: 'single', variant: 'tech-double', photo: 'right' },

  // ============ D 类：创意风（D1-D4） ============
  { id: 'd1', name: '花卉线条', desc: '花卉装饰标题 · 文艺优雅', scene: '文科 / 传媒 / 教育', free: true, defaultColor: '#9d4edd', category: 'creative', layout: 'single', variant: 'cre-flourish', photo: 'right' },
  { id: 'd2', name: '圆形头像', desc: '圆形头像 · 亲和活泼', scene: '设计 / 市场 / 运营', free: true, defaultColor: '#db2777', category: 'creative', layout: 'single', variant: 'ava-circle', photo: 'right' },
  { id: 'd3', name: '波浪底边', desc: '底部波浪装饰 · 年轻灵动', scene: '运营 / 新媒体 / 教育', free: true, defaultColor: '#0891b2', category: 'creative', layout: 'single', variant: 'cre-wave', photo: 'right' },
  { id: 'd4', name: '手写标题', desc: '手写感标题 · 个性独特', scene: '文创 / 设计 / 传媒', free: true, defaultColor: '#9a3412', category: 'creative', layout: 'single', variant: 'cre-hand', photo: 'right' }
];

// 模板分类（广场页筛选）
const TEMPLATE_CATEGORIES = [
  { key: 'business', name: '经典商务' },
  { key: 'sidebar', name: '侧边栏风格' },
  { key: 'tech', name: '技术风' },
  { key: 'creative', name: '创意风' }
];

// 板块英文名（A3 极简黑白模板用）
const SECTION_EN = {
  education: 'EDUCATION',
  experience: 'INTERNSHIP',
  work: 'WORK EXPERIENCE',
  projects: 'PROJECTS',
  campus: 'CAMPUS ACTIVITIES',
  skills: 'SKILLS',
  certificates: 'CERTIFICATES',
  awards: 'HONORS & AWARDS',
  languages: 'LANGUAGES',
  summary: 'PROFILE'
};

// ---------- 主题色预设（蓝 / 黑 / 灰 / 绿 / 红） ----------
const THEME_COLORS = [
  { name: '深蓝', value: '#1e3a5f' },
  { name: '雅黑', value: '#111111' },
  { name: '烟灰', value: '#4a5568' },
  { name: '墨绿', value: '#2f5233' },
  { name: '酒红', value: '#742a2a' }
];

// ---------- 板块元数据 ----------
// title 是 ATS 标准板块名；自定义板块标题存 resume.sectionTitles，不影响标准结构
const SECTIONS = [
  { key: 'basics', title: '基本信息', draggable: false, removable: false },
  { key: 'education', title: '教育经历', draggable: true, removable: true },
  { key: 'experience', title: '实习经历', draggable: true, removable: true },
  { key: 'projects', title: '项目经历', draggable: true, removable: true },
  { key: 'campus', title: '校园经历', draggable: true, removable: true },
  { key: 'skills', title: '专业技能', draggable: true, removable: true },
  { key: 'certificates', title: '证书奖项', draggable: true, removable: true },
  { key: 'summary', title: '自我评价', draggable: true, removable: true },
  // V2 新增可选内置板块（默认不开启，用户"添加板块"后出现）
  { key: 'work', title: '工作经历', draggable: true, removable: true },
  { key: 'awards', title: '获奖荣誉', draggable: true, removable: true },
  { key: 'languages', title: '语言能力', draggable: true, removable: true }
];

// 默认板块顺序（基本信息固定第一，不参与排序）
const DEFAULT_SECTION_ORDER = ['education', 'experience', 'projects', 'campus', 'skills', 'certificates', 'summary'];

// "添加板块"可选类型（已存在的标准板块自动置灰；自定义板块永远可加）
// kind: 编辑器/渲染器形态  exp=公司+多条bullet  project  edu  skill  cert  text  custom
const ADDABLE_SECTIONS = [
  { key: 'work', title: '工作经历', kind: 'exp', hint: '正式工作（区别于实习）' },
  { key: 'experience', title: '实习经历', kind: 'exp' },
  { key: 'projects', title: '项目经历', kind: 'project' },
  { key: 'campus', title: '校园经历', kind: 'exp', orgLabel: true },
  { key: 'skills', title: '专业技能', kind: 'skill' },
  { key: 'certificates', title: '证书奖项', kind: 'cert' },
  { key: 'awards', title: '获奖荣誉', kind: 'cert' },
  { key: 'languages', title: '语言能力', kind: 'language' },
  { key: 'education', title: '教育经历', kind: 'edu' },
  { key: 'summary', title: '自我评价', kind: 'text' },
  { key: '__custom__', title: '自定义板块', kind: 'custom' }
];

// 自定义板块的 4 种内容形态
const CUSTOM_KINDS = [
  { key: 'bullets', name: '经历列表（逐条描述）' },
  { key: 'text', name: '纯文本段落' },
  { key: 'skills', name: '技能清单' },
  { key: 'certs', name: '证书 / 荣誉清单' }
];

// ---------- 合规文案 ----------
const AI_DISCLAIMER = 'AI 生成内容仅供参考，请自行核对真实性';

module.exports = {
  TEMPLATES,
  TEMPLATE_CATEGORIES,
  SECTION_EN,
  THEME_COLORS,
  SECTIONS,
  DEFAULT_SECTION_ORDER,
  ADDABLE_SECTIONS,
  CUSTOM_KINDS,
  AI_DISCLAIMER
};
