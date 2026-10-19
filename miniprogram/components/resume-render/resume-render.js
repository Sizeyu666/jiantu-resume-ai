// components/resume-render/resume-render.js V2
// A4 简历渲染器：10 套模板（layout: single/sidebar + variant 样式变体）
// 支持：头像、自定义板块、板块重命名、字号/间距三档、超页检测、自适应高度
const { SECTIONS, DEFAULT_SECTION_ORDER, TEMPLATES, SECTION_EN } = require('../../utils/constants');
const { DEBUG_NO_CLOUD } = require('../../utils/debug');

const TITLE_MAP = {};
SECTIONS.forEach((s) => { TITLE_MAP[s.key] = s.title; });

function hasText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}
function period(it) {
  const s = ((it && it.start) || '').trim();
  const e = ((it && it.end) || '').trim();
  if (s && e) return s + ' - ' + e;
  return s || e;
}

function countLines(vm) {
  let lines = 1 + (vm.jobIntent ? 1 : 0) + (vm.headerContact ? 1 : 0) + (vm.headerLinks ? 1 : 0);
  vm.sections.forEach((s) => {
    lines += 1;
    if (s.kind === 'text' || s.kind === 'custom-text') {
      lines += Math.max(1, Math.ceil(((s.text || '') + (s.items && s.items[0] ? '' : '')).length / 45));
      if (s.kind === 'custom-text') lines = lines - 1 + Math.max(1, Math.ceil((s.text || '').length / 45));
      return;
    }
    s.items.forEach((it) => {
      lines += 1;
      if (s.kind === 'edu') lines += (it.subLine ? 1 : 0) + it.highlights.length;
      else if (s.kind === 'project') lines += (it.techText ? 1 : 0) + it.bullets.length;
      else if (s.kind === 'skill') lines += it.items.length;
      else if (s.kind === 'custom-bullets') lines += it.bullets.length - 1;
      else if (s.kind === 'custom-skills') lines += it.itemsText ? 1 : 0;
      else if (s.kind === 'custom-certs' || s.kind === 'cert' || s.kind === 'language') lines += 0;
      else lines += it.bullets.length;
    });
  });
  return lines;
}

Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    resume: { type: Object, value: null },
    density: { type: String, value: 'normal' },
    autoHeight: { type: Boolean, value: false },
    fontLevel: { type: String, value: 'medium' }, // small | medium | large
    spacingLevel: { type: String, value: 'normal' } // compact | normal | loose
  },
  data: { vm: null },

  observers: {
    resume(resume) {
      this.buildView(resume);
    }
  },

  lifetimes: {
    ready() {
      this.measure();
    },
    detached() {
      this._avatarCache = null;
    }
  },

  methods: {
    // fileID(cloud://) → 临时可访问 URL；本地路径直接用（调试模式/证件照回传）
    resolveAvatar(fileID) {
      if (!fileID) return Promise.resolve('');
      if (!/^cloud:\/\//.test(fileID)) return Promise.resolve(fileID);
      this._avatarCache = this._avatarCache || {};
      if (this._avatarCache[fileID]) return Promise.resolve(this._avatarCache[fileID]);
      if (DEBUG_NO_CLOUD) return Promise.resolve('');
      return wx.cloud
        .getTempFileURL({ fileList: [fileID] })
        .then((res) => {
          const url = (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || '';
          this._avatarCache[fileID] = url;
          return url;
        })
        .catch(() => '');
    },

    buildView(resume) {
      const r = resume || {};
      const b = r.basics || {};
      const tpl = TEMPLATES.find((t) => t.id === r.templateId) || TEMPLATES[0];
      const variant = tpl.variant || 'left-ul';
      const layoutSidebar = tpl.layout === 'sidebar';
      const sideOnRight = variant === 'side-right';
      const useTags = false; // V3 模板不再使用标签云变体，保留字段兼容 secBody
      // 头部形态：左对齐（信息左+照片右）/ 居中 / 信息表格
      const LEFT_HEADER_VARIANTS = ['left-ul', 'left-bar', 'wide-margin'];
      const headerLeft = LEFT_HEADER_VARIANTS.indexOf(variant) >= 0;
      const infoTable = variant === 'info-table';
      const headerBand = false;
      // 中英双语标题（A3 / A7）
      const bilingualTitle = variant === 'bw-en' || variant === 'dual-title';
      // 技能板块呈现形态：进度条 / 标签云 / 普通文本行
      const skillStyle = variant === 'tech-bars' ? 'bars' : (variant === 'tech-tags' ? 'tags' : 'line');
      const themeColor = r.themeColor || tpl.defaultColor || '#333333';
      const titleOverride = r.sectionTitles || {};

      const wechat = hasText(b.wechat) ? '微信：' + b.wechat.trim() : '';
      const headerContact = [b.phone, b.email, b.city].filter(hasText).join(' | ');
      const headerLinks = [b.github, b.blog, wechat].filter(hasText).join(' | ');
      const sideContact = [b.phone, b.email, b.city, b.github, b.blog, wechat].filter(hasText);

      // ---------- 标准板块 view-model ----------
      const normExp = (it) => ({
        ...it, period: period(it),
        roleLine: [it.role, it.city].filter(hasText).join(' · '),
        bullets: arr(it.bullets).filter(hasText)
      });
      const education = arr(r.education).map((it) => ({
        ...it,
        period: period(it),
        subLine: [it.degree, it.major, it.gpa].filter(hasText).join(' · '),
        highlights: arr(it.highlights).filter(hasText)
      }));
      const experience = arr(r.experience).map(normExp);
      const work = arr(r.work).map(normExp);
      const projects = arr(r.projects).map((it) => ({
        ...it,
        period: period(it),
        techStack: arr(it.techStack).filter(hasText),
        techText: arr(it.techStack).filter(hasText).join(' / '),
        bullets: arr(it.bullets).filter(hasText)
      }));
      const campus = arr(r.campus).map((it) => ({
        ...it, period: period(it), bullets: arr(it.bullets).filter(hasText)
      }));
      const BAR_LEVELS = [90, 82, 95, 76, 88, 72];
      const skills = arr(r.skills).map((it, gi) => ({
        ...it,
        items: arr(it.items).filter(hasText),
        itemsText: arr(it.items).filter(hasText).join(' · '),
        // C1 进度条模板：数据模型暂无熟练度字段，按条目序号给确定性视觉占位值
        itemLevels: arr(it.items).filter(hasText).map((t, i) => {
          if (t && typeof t === 'object' && t.level) return t.level;
          return BAR_LEVELS[(gi * 3 + i) % BAR_LEVELS.length];
        })
      }));
      const certRow = (it) => ({ ...it });
      const certificates = arr(r.certificates).map(certRow);
      const awards = arr(r.awards).map(certRow);
      const languages = arr(r.languages).map(certRow);
      const customs = arr(r.customSections);

      const titleOf = (key) => titleOverride[key] || TITLE_MAP[key] || key;

      const byKey = {
        education: { key: 'education', kind: 'edu', title: titleOf('education'), show: education.length > 0, items: education },
        experience: { key: 'experience', kind: 'exp', title: titleOf('experience'), show: experience.length > 0, items: experience },
        projects: { key: 'projects', kind: 'project', title: titleOf('projects'), show: projects.length > 0, items: projects },
        campus: { key: 'campus', kind: 'campus', title: titleOf('campus'), show: campus.length > 0, items: campus },
        skills: { key: 'skills', kind: 'skill', title: titleOf('skills'), show: skills.some((s) => s.items.length > 0), items: skills },
        certificates: { key: 'certificates', kind: 'cert', title: titleOf('certificates'), show: certificates.length > 0, items: certificates },
        work: { key: 'work', kind: 'exp', title: titleOf('work'), show: work.length > 0, items: work },
        awards: { key: 'awards', kind: 'cert', title: titleOf('awards'), show: awards.length > 0, items: awards },
        languages: { key: 'languages', kind: 'language', title: titleOf('languages'), show: languages.length > 0, items: languages },
        summary: { key: 'summary', kind: 'text', title: titleOf('summary'), show: hasText(r.summary), text: (r.summary || '').trim() }
      };
      customs.forEach((sec) => {
        const id = 'custom:' + sec.id;
        let show = false;
        let items = [];
        let kind = 'custom-text';
        let text = '';
        if (sec.kind === 'bullets') {
          kind = 'custom-bullets';
          const bullets = arr(sec.bullets).filter(hasText);
          show = bullets.length > 0;
          items = [{ bullets }];
        } else if (sec.kind === 'text') {
          kind = 'custom-text';
          text = (sec.text || '').trim();
          show = hasText(sec.text);
        } else if (sec.kind === 'skills') {
          kind = 'custom-skills';
          items = arr(sec.groups).map((g) => ({
            category: g.category || '',
            items: arr(g.items).filter(hasText),
            itemsText: arr(g.items).filter(hasText).join(' · ')
          }));
          show = items.some((g) => g.itemsText);
        } else {
          kind = 'custom-certs';
          items = arr(sec.rows).filter((x) => hasText(x.name)).map((x) => ({ name: x.name, date: x.detail || '' }));
          show = items.length > 0;
        }
        byKey[id] = { key: id, kind, title: sec.title || '自定义板块', show, items, text };
      });

      const order = arr(r.sectionOrder && r.sectionOrder.length ? r.sectionOrder : DEFAULT_SECTION_ORDER).filter((k) => byKey[k]);
      Object.keys(byKey).forEach((k) => { if (order.indexOf(k) < 0) order.push(k); });
      const visible = order.map((k) => byKey[k]).filter((s) => s.show).map((s, i) => ({
        ...s,
        no: String(i + 1).padStart(2, '0'),
        en: SECTION_EN[s.key] || 'CUSTOM',
        skillStyle
      }));

      // ---------- A5 表格信息：联系信息两两成组，渲染为 2 列表格 ----------
      const infoFields = [];
      if (hasText(b.jobIntent)) infoFields.push({ label: '意向岗位', value: b.jobIntent.trim() });
      if (hasText(b.phone)) infoFields.push({ label: '手机', value: b.phone.trim() });
      if (hasText(b.email)) infoFields.push({ label: '邮箱', value: b.email.trim() });
      if (hasText(b.city)) infoFields.push({ label: '城市', value: b.city.trim() });
      if (hasText(b.wechat)) infoFields.push({ label: '微信', value: b.wechat.trim() });
      if (hasText(b.github)) infoFields.push({ label: 'GitHub', value: b.github.trim() });
      if (hasText(b.blog)) infoFields.push({ label: '个人主页', value: b.blog.trim() });
      const infoRows = [];
      for (let i = 0; i < infoFields.length; i += 2) {
        infoRows.push({ c1: infoFields[i], c2: infoFields[i + 1] || null });
      }

      const vm = {
        templateId: r.templateId || 'a1',
        variant,
        layoutSidebar,
        sideOnRight,
        useTags,
        bilingualTitle,
        skillStyle,
        headerLeft,
        headerBand,
        infoTable,
        infoRows,
        themeColor,
        avatarPos: tpl.photo || 'right',
        photoSlot: tpl.photo !== 'none', // V4：每套模板都有照片位（b10 除外）
        avatarUrl: '',
        name: hasText(b.name) ? b.name.trim() : '姓名',
        jobIntent: (b.jobIntent || '').trim(),
        headerContact,
        headerLinks,
        sideContact,
        sections: visible,
        sideSections: visible.filter((s) => s.key === 'skills' || s.key === 'certificates' || s.key === 'awards' || s.key === 'languages'),
        mainSections: visible.filter((s) => ['skills', 'certificates', 'awards', 'languages'].indexOf(s.key) < 0)
      };

      this.setData({ vm }, () => this.measure());

      // 头像异步解析
      const avatarFileID = b.avatarFileID || '';
      if (avatarFileID) {
        this.resolveAvatar(avatarFileID).then((url) => {
          if (url && this.data.vm) this.setData({ 'vm.avatarUrl': url });
        });
      }
    },

    measure() {
      if (!this.data.vm) return;
      this.createSelectorQuery()
        .select('.rr-page')
        .boundingClientRect()
        .select('.rr-flow')
        .boundingClientRect()
        .exec((rects) => {
          if (!rects || !rects[0] || !rects[1]) return;
          if (this.data.autoHeight) {
            this.triggerEvent('layoutchange', {
              heightPx: rects[0].height,
              pages: Math.max(1, Math.ceil(countLines(this.data.vm) / 40))
            });
            return;
          }
          const overflow = rects[1].height > rects[0].height - 8;
          if (overflow !== this._overflow) {
            this._overflow = overflow;
            this.triggerEvent('overflowchange', { overflow });
          }
        });
    }
  }
});
