// pages/resume-edit/resume-edit.js 简历编辑器 V2
// 顶部 A4 实时预览条 + 分板块表单；输入 300ms 防抖同步预览与云库
// V2：头像上传、工作/获奖/语言板块、自定义板块、板块管理（上移/下移/重命名/删除/添加）
const app = getApp();
const {
  debounce, uid, createEmptyResume,
  createEducation, createExperience, createProject, createCampus, createSkillGroup, createCertificate,
  createWork, createAward, createLanguage, createCustomSection
} = require('../../utils/util');
const { SECTIONS, DEFAULT_SECTION_ORDER, ADDABLE_SECTIONS, CUSTOM_KINDS } = require('../../utils/constants');
const { DEBUG_NO_CLOUD } = require('../../utils/debug');

const SECTION_TITLE = {};
SECTIONS.forEach((s) => { SECTION_TITLE[s.key] = s.title; });

// 各标准板块"添加一条"的工厂与文案
const SECTION_META = {
  education: { factory: createEducation, addText: '添加教育经历' },
  experience: { factory: createExperience, addText: '添加实习经历' },
  projects: { factory: createProject, addText: '添加项目经历' },
  campus: { factory: createCampus, addText: '添加校园经历' },
  skills: { factory: createSkillGroup, addText: '添加技能分类' },
  certificates: { factory: createCertificate, addText: '添加证书奖项' },
  work: { factory: createWork, addText: '添加工作经历' },
  awards: { factory: createAward, addText: '添加获奖记录' },
  languages: { factory: createLanguage, addText: '添加语言能力' }
};

// "experience.0.bullets.2" → "experience[0].bullets[2]"（setData 路径）
function toSetDataPath(path) {
  return path.replace(/\.(\d+)(?=\.|$)/g, '[$1]');
}
function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// 老简历数据兜底：补齐 V2 新字段，避免渲染/编辑读到 undefined
function ensureDefaults(resume) {
  const base = createEmptyResume();
  const out = Object.assign({}, base, resume);
  out.basics = Object.assign({}, base.basics, resume.basics || {});
  ['education', 'experience', 'projects', 'campus', 'skills', 'certificates', 'work', 'awards', 'languages'].forEach((k) => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  if (!Array.isArray(out.customSections)) out.customSections = [];
  if (!out.sectionTitles || typeof out.sectionTitles !== 'object') out.sectionTitles = {};
  if (!Array.isArray(out.sectionOrder) || !out.sectionOrder.length) out.sectionOrder = [...DEFAULT_SECTION_ORDER];
  if (['small', 'medium', 'large'].indexOf(out.fontSize) < 0) out.fontSize = 'medium';
  if (['compact', 'normal', 'loose'].indexOf(out.spacing) < 0) out.spacing = 'normal';
  return out;
}

Page({
  data: {
    resume: null,
    previewResume: null,
    sectionList: [], // [{key, title, addText, ci?}] 按 sectionOrder 排序（basics 不在内）
    collapsed: {},
    skillTexts: [], // 技能 items 的原始输入文本（与 skills 数组平行）
    techTexts: [], // 项目 techStack 的原始输入文本（与 projects 数组平行）
    density: 'normal', // normal | compact（智能压缩，仅本次会话）
    overflow: false,
    avatarUrl: '', // 基本信息卡里的头像预览（cloud fileID 已在 resume.basics.avatarFileID）
    avatarUploading: false,
    // AI 润色弹窗
    polishShow: false,
    polishOriginal: '',
    polishType: 'polish',
    applyPath: '',
    // 板块排序
    sortMode: false,
    sortList: [],
    dragIndex: -1,
    dragOffset: 0,
    // 添加板块面板
    addPanelShow: false,
    addableList: [] // [{key,title,hint,added,disabled}]
  },

  onLoad(options) {
    this.resumeId = options && options.id;
    this.pendingSync = false;
    this._unloaded = false;
    this.scheduleSync = debounce(() => this.syncNow(), 300);
    if (!this.resumeId) {
      wx.showToast({ title: '缺少简历 ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadResume();
  },

  onShow() {
    // 从 AI 证件照页"设为简历头像"回来
    const pending = app.globalData && app.globalData.pendingAvatar;
    if (pending && pending.fileID && this.data.resume && this.data.resume._id === (pending.resumeId || this.data.resume._id)) {
      this.applyAvatar(pending.fileID, pending.tempUrl || '');
      app.globalData.pendingAvatar = null;
    }
  },

  onUnload() {
    this._unloaded = true;
    if (this.pendingSync) this.syncNow();
  },

  async loadResume() {
    let resume = null;
    if (DEBUG_NO_CLOUD) {
      resume = app.globalData.currentResume;
      if (!resume || resume._id !== this.resumeId) {
        resume = (app.globalData.localResumes || []).find((r) => r._id === this.resumeId);
      }
      if (!resume) {
        wx.showToast({ title: '简历不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
    } else {
      wx.showLoading({ title: '加载中...', mask: true });
      try {
        const res = await wx.cloud.callFunction({
          name: 'resumeCRUD',
          data: { action: 'get', data: { id: this.resumeId } }
        });
        wx.hideLoading();
        if (!res.result || res.result.code !== 0) {
          throw new Error((res.result && res.result.message) || '加载失败');
        }
        resume = res.result.data;
      } catch (e) {
        wx.hideLoading();
        console.error('[resume-edit] 加载失败', e);
        wx.showToast({ title: e.message || '加载失败', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1000);
        return;
      }
    }

    resume = ensureDefaults(resume);
    wx.setNavigationBarTitle({ title: resume.title || '编辑简历' });
    this.setData({
      resume,
      previewResume: { ...resume },
      sectionList: this.buildSectionList(resume),
      skillTexts: (resume.skills || []).map((s) => (s.items || []).join('、')),
      techTexts: (resume.projects || []).map((p) => (p.techStack || []).join('、'))
    });
    app.globalData.currentResume = resume;
    if (resume.basics.avatarFileID) this.refreshAvatarThumb(resume.basics.avatarFileID);
  },

  // 板块列表（含自定义板块、重命名标题）
  buildSectionList(resumeOrOrder) {
    const resume = resumeOrOrder.sectionOrder ? resumeOrOrder : this.data.resume;
    const order = resumeOrOrder.sectionOrder ? resumeOrOrder.sectionOrder : resumeOrOrder;
    const customs = resume.customSections || [];
    return order.map((key) => {
      if (key.indexOf('custom:') === 0) {
        const id = key.slice(7);
        const ci = customs.findIndex((s) => s.id === id);
        if (ci < 0) return null;
        const sec = customs[ci];
        return { key, title: sec.title, ci, custom: true, kind: sec.kind };
      }
      const meta = SECTION_META[key];
      return { key, title: (resume.sectionTitles || {})[key] || SECTION_TITLE[key], addText: meta ? meta.addText : '' };
    }).filter(Boolean);
  },

  // ==================== 同步（预览 + 云库） ====================
  markChanged() {
    this.pendingSync = true;
    this.scheduleSync();
  },

  syncNow() {
    if (this._unloaded || !this.data.resume) return;
    this.pendingSync = false;
    const resume = { ...this.data.resume, updatedAt: Date.now() };
    this.setData({ previewResume: { ...resume } });
    app.globalData.currentResume = resume;

    if (DEBUG_NO_CLOUD) {
      const list = (app.globalData.localResumes || []).map((r) => (r._id === resume._id ? resume : r));
      if (!list.some((r) => r._id === resume._id)) list.unshift(resume);
      app.globalData.localResumes = list;
      app.saveLocalResumes && app.saveLocalResumes();
      return;
    }

    wx.cloud
      .callFunction({
        name: 'resumeCRUD',
        data: { action: 'update', data: { id: resume._id, resume } }
      })
      .catch((e) => console.error('[resume-edit] 保存失败', e));
  },

  // ==================== 通用输入（data-path） ====================
  onFieldInput(e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    this.setData({ [`resume.${toSetDataPath(path)}`]: e.detail.value });
    this.markChanged();
  },

  // 技能 items：文本 → 数组（顿号/逗号/分号/换行分隔），原文保留在 skillTexts
  onSkillTextInput(e) {
    const index = e.currentTarget.dataset.index;
    const text = e.detail.value;
    const items = text.split(/[、,，;；\n]/).map((t) => t.trim()).filter(Boolean);
    this.setData({
      [`skillTexts[${index}]`]: text,
      [`resume.skills[${index}].items`]: items
    });
    this.markChanged();
  },

  // 项目 techStack：同上
  onTechTextInput(e) {
    const index = e.currentTarget.dataset.index;
    const text = e.detail.value;
    const items = text.split(/[、,，;；\n]/).map((t) => t.trim()).filter(Boolean);
    this.setData({
      [`techTexts[${index}]`]: text,
      [`resume.projects[${index}].techStack`]: items
    });
    this.markChanged();
  },

  // 自定义板块内技能组 items：文本 → 数组
  onCustomSkillItemsInput(e) {
    const path = e.currentTarget.dataset.path; // customSections.ci.groups.gi.items
    const items = e.detail.value.split(/[、,，;；\n]/).map((t) => t.trim()).filter(Boolean);
    this.setData({ [`resume.${toSetDataPath(path)}`]: items });
    this.markChanged();
  },

  // ==================== 板块折叠 ====================
  onToggleSection(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`collapsed.${key}`]: !this.data.collapsed[key] });
  },

  // ==================== 条目增删 ====================
  onAddItem(e) {
    const section = e.currentTarget.dataset.section;
    const meta = SECTION_META[section];
    if (!meta) return;
    const list = (this.data.resume[section] || []).concat(meta.factory());
    const patch = { [`resume.${section}`]: list };
    if (section === 'skills') {
      const texts = this.data.skillTexts.slice();
      texts[list.length - 1] = '';
      patch.skillTexts = texts;
    }
    if (section === 'projects') {
      const texts = this.data.techTexts.slice();
      texts[list.length - 1] = '';
      patch.techTexts = texts;
    }
    this.setData(patch);
    this.markChanged();
  },

  onRemoveItem(e) {
    const { section, index } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除该条内容',
      content: '删除后不可恢复，确定删除吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        const list = (this.data.resume[section] || []).slice();
        list.splice(index, 1);
        const patch = { [`resume.${section}`]: list };
        if (section === 'skills') {
          const texts = this.data.skillTexts.slice();
          texts.splice(index, 1);
          patch.skillTexts = texts;
        }
        if (section === 'projects') {
          const texts = this.data.techTexts.slice();
          texts.splice(index, 1);
          patch.techTexts = texts;
        }
        this.setData(patch);
        this.markChanged();
      }
    });
  },

  // ==================== bullet / highlight 行增删 ====================
  onAddLine(e) {
    const path = e.currentTarget.dataset.path;
    const list = getByPath(this.data.resume, path) || [];
    this.setData({ [`resume.${toSetDataPath(path)}`]: list.concat('') });
    this.markChanged();
  },

  onRemoveLine(e) {
    const { path, index } = e.currentTarget.dataset;
    const list = (getByPath(this.data.resume, path) || []).slice();
    list.splice(index, 1);
    this.setData({ [`resume.${toSetDataPath(path)}`]: list });
    this.markChanged();
  },

  // ==================== 自定义板块：条目增删 ====================
  onAddCustomItem(e) {
    const { ci, kind } = e.currentTarget.dataset;
    const sec = this.data.resume.customSections[ci];
    if (!sec) return;
    if (kind === 'bullets') {
      this.setData({ [`resume.customSections[${ci}].bullets`]: (sec.bullets || []).concat('') });
    } else if (kind === 'skills') {
      const groups = (sec.groups || []).concat({ id: uid(), category: '', items: [] });
      this.setData({ [`resume.customSections[${ci}].groups`]: groups });
    } else if (kind === 'certs') {
      const rows = (sec.rows || []).concat({ id: uid(), name: '', detail: '' });
      this.setData({ [`resume.customSections[${ci}].rows`]: rows });
    }
    this.markChanged();
  },

  onRemoveCustomItem(e) {
    const { ci, kind, index } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除该条内容',
      content: '确定删除吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        const field = kind === 'skills' ? 'groups' : 'rows';
        const list = (this.data.resume.customSections[ci][field] || []).slice();
        list.splice(index, 1);
        this.setData({ [`resume.customSections[${ci}].${field}`]: list });
        this.markChanged();
      }
    });
  },

  // ==================== M2 头像 ====================
  refreshAvatarThumb(fileID) {
    if (!fileID) return;
    if (!/^cloud:\/\//.test(fileID)) {
      this.setData({ avatarUrl: fileID });
      return;
    }
    if (DEBUG_NO_CLOUD) return;
    wx.cloud.getTempFileURL({ fileList: [fileID] })
      .then((r) => {
        const url = (r.fileList && r.fileList[0] && r.fileList[0].tempFileURL) || '';
        if (url) this.setData({ avatarUrl: url });
      })
      .catch(() => {});
  },

  onChooseAvatar() {
    if (this.data.avatarUploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!tempFilePath) return;
        this.setData({ avatarUrl: tempFilePath, avatarUploading: true });
        wx.showLoading({ title: '上传中...', mask: true });
        const openid = (app.globalData && app.globalData.openid) || 'anon';
        const cloudPath = `avatars/${openid}-${Date.now()}.jpg`;
        const doUpload = DEBUG_NO_CLOUD
          ? Promise.resolve({ fileID: tempFilePath })
          : wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
        doUpload
          .then((up) => {
            wx.hideLoading();
            this.setData({ avatarUploading: false });
            this.applyAvatar(up.fileID, tempFilePath);
          })
          .catch((err) => {
            wx.hideLoading();
            this.setData({ avatarUploading: false });
            console.error('[resume-edit] 头像上传失败', err);
            wx.showToast({ title: '上传失败，请重试', icon: 'none' });
          });
      }
    });
  },

  applyAvatar(fileID, tempUrl) {
    this.setData({ 'resume.basics.avatarFileID': fileID, avatarUrl: tempUrl || '' });
    if (!tempUrl) this.refreshAvatarThumb(fileID);
    this.markChanged();
    wx.showToast({ title: '头像已设置', icon: 'success' });
  },

  onRemoveAvatar() {
    wx.showModal({
      title: '移除头像',
      content: '确定移除简历头像吗？（不会删除云相册中的照片）',
      confirmText: '移除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ 'resume.basics.avatarFileID': '', avatarUrl: '' });
        this.markChanged();
      }
    });
  },

  goIdPhoto() {
    wx.navigateTo({ url: '/pages/id-photo/id-photo?from=edit' });
  },

  // ==================== 顶部预览 ====================
  onOverflowChange(e) {
    this.setData({ overflow: e.detail.overflow });
  },

  onSmartCompress() {
    if (this.data.density === 'compact') {
      wx.showToast({ title: '已是最紧凑排版，建议适当删减内容', icon: 'none' });
      return;
    }
    this.setData({ density: 'compact' });
    wx.showToast({ title: '已切换紧凑排版', icon: 'success' });
  },

  goPreview() {
    if (this.pendingSync) this.syncNow();
    wx.navigateTo({ url: `/pages/resume-preview/resume-preview?id=${this.resumeId}` });
  },

  // ==================== AI 润色 ====================
  onOpenPolish(e) {
    if (DEBUG_NO_CLOUD) {
      wx.showToast({ title: 'AI 功能需配置云开发后使用', icon: 'none' });
      return;
    }
    const { path, type } = e.currentTarget.dataset;
    const actionType = type || 'polish';
    let original = '';
    if (actionType === 'polish') {
      original = (getByPath(this.data.resume, path) || '').trim();
      if (!original) {
        wx.showToast({ title: '请先填写内容再润色', icon: 'none' });
        return;
      }
    }
    this.setData({
      polishShow: true,
      polishOriginal: original,
      polishType: actionType,
      applyPath: path || ''
    });
  },

  onPolishAdopt(e) {
    const text = e.detail.text;
    if (this.data.polishType === 'summary') {
      this.setData({ 'resume.summary': text });
    } else if (this.data.applyPath) {
      this.setData({ [`resume.${toSetDataPath(this.data.applyPath)}`]: text });
    }
    this.markChanged();
  },

  onPolishClose() {
    this.setData({ polishShow: false });
  },

  // ==================== 板块排序 ====================
  enterSortMode() {
    const order = (this.data.resume.sectionOrder && this.data.resume.sectionOrder.length
      ? this.data.resume.sectionOrder
      : DEFAULT_SECTION_ORDER
    ).filter((k) => k === 'summary' || SECTION_TITLE[k] || k.indexOf('custom:') === 0);
    this.rowHeight = 0;
    this.setData(
      {
        sortMode: true,
        sortList: this.buildSectionList(order),
        dragIndex: -1,
        dragOffset: 0
      },
      () => {
        this.createSelectorQuery()
          .select('.sort-row')
          .boundingClientRect((rect) => {
            if (rect) this.rowHeight = rect.height;
          })
          .exec();
      }
    );
  },

  onSortTouchStart(e) {
    this.sortCurrent = e.currentTarget.dataset.index;
    this.sortLastY = e.touches[0].clientY;
    this.setData({ dragIndex: this.sortCurrent, dragOffset: 0 });
  },

  onSortTouchMove(e) {
    if (this.sortCurrent == null || this.sortCurrent < 0) return;
    const y = e.touches[0].clientY;
    const rowH = this.rowHeight || 56;
    let offset = this.data.dragOffset + (y - this.sortLastY);
    this.sortLastY = y;
    const list = this.data.sortList.slice();
    while (offset > rowH / 2 && this.sortCurrent < list.length - 1) {
      const i = this.sortCurrent;
      [list[i], list[i + 1]] = [list[i + 1], list[i]];
      this.sortCurrent = i + 1;
      offset -= rowH;
    }
    while (offset < -rowH / 2 && this.sortCurrent > 0) {
      const i = this.sortCurrent;
      [list[i], list[i - 1]] = [list[i - 1], list[i]];
      this.sortCurrent = i - 1;
      offset += rowH;
    }
    this.setData({ sortList: list, dragIndex: this.sortCurrent, dragOffset: offset });
  },

  onSortTouchEnd() {
    this.sortCurrent = -1;
    this.setData({ dragIndex: -1, dragOffset: 0 });
  },

  onSortDone() {
    const order = this.data.sortList.map((i) => i.key);
    this.setData({
      sortMode: false,
      'resume.sectionOrder': order,
      sectionList: this.buildSectionList(order)
    });
    this.markChanged();
  },

  // ==================== M3 板块管理（上移/下移/重命名/删除） ====================
  onSectionManage(e) {
    const key = e.currentTarget.dataset.key;
    const order = this.data.resume.sectionOrder;
    const idx = order.indexOf(key);
    const item = this.data.sectionList.find((s) => s.key === key);
    const isCustom = !!(item && item.custom);
    const actions = [];
    if (idx > 0) actions.push({ key: 'up', label: '上移板块' });
    if (idx >= 0 && idx < order.length - 1) actions.push({ key: 'down', label: '下移板块' });
    actions.push({ key: 'rename', label: '重命名板块' });
    actions.push({ key: 'delete', label: isCustom ? '删除自定义板块' : '移除板块' });
    wx.showActionSheet({
      itemList: actions.map((a) => a.label),
      success: (res) => {
        const act = actions[res.tapIndex];
        if (!act) return;
        if (act.key === 'up') this.moveSection(idx, idx - 1);
        else if (act.key === 'down') this.moveSection(idx, idx + 1);
        else if (act.key === 'rename') this.renameSection(key, isCustom);
        else if (act.key === 'delete') this.deleteSection(key, isCustom);
      }
    });
  },

  moveSection(from, to) {
    const order = this.data.resume.sectionOrder.slice();
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    this.setData({ 'resume.sectionOrder': order, sectionList: this.buildSectionList(order) });
    this.markChanged();
  },

  renameSection(key, isCustom) {
    const item = this.data.sectionList.find((s) => s.key === key);
    wx.showModal({
      title: '重命名板块',
      editable: true,
      placeholderText: '输入新的板块名称（8 字以内）',
      content: item ? item.title : '',
      success: (res) => {
        if (!res.confirm) return;
        const name = (res.content || '').trim().slice(0, 8);
        if (!name) return;
        if (isCustom) {
          const ci = item.ci;
          this.setData({ [`resume.customSections[${ci}].title`]: name });
        } else {
          this.setData({ [`resume.sectionTitles.${key}`]: name });
        }
        this.refreshSectionList();
        this.markChanged();
      }
    });
  },

  deleteSection(key, isCustom) {
    const item = this.data.sectionList.find((s) => s.key === key);
    wx.showModal({
      title: isCustom ? '删除自定义板块' : '移除板块',
      content: isCustom ? '该板块及其内容将被删除，且不可恢复，确定吗？' : '板块将从简历中移除，已填写内容会一并清空，确定吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        const patch = { 'resume.sectionOrder': this.data.resume.sectionOrder.filter((k) => k !== key) };
        if (isCustom) {
          const list = this.data.resume.customSections.slice();
          list.splice(item.ci, 1);
          patch['resume.customSections'] = list;
        } else if (key === 'summary') {
          patch['resume.summary'] = '';
        } else if (SECTION_META[key]) {
          patch[`resume.${key}`] = [];
        }
        this.setData(patch);
        this.refreshSectionList();
        if (key === 'skills') patch.skillTexts = [];
        if (key === 'projects') patch.techTexts = [];
        if (patch.skillTexts || patch.techTexts) this.setData({ skillTexts: patch.skillTexts || this.data.skillTexts, techTexts: patch.techTexts || this.data.techTexts });
        this.markChanged();
      }
    });
  },

  // ==================== M3 添加板块 ====================
  openAddPanel() {
    const order = this.data.resume.sectionOrder;
    const addableList = ADDABLE_SECTIONS.map((a) => ({
      key: a.key,
      title: a.title,
      hint: a.hint || '',
      added: a.key !== '__custom__' && order.indexOf(a.key) >= 0
    }));
    this.setData({ addPanelShow: true, addableList });
  },

  closeAddPanel() {
    this.setData({ addPanelShow: false });
  },

  onTapAddable(e) {
    const key = e.currentTarget.dataset.key;
    const added = e.currentTarget.dataset.added;
    if (added) {
      wx.showToast({ title: '该板块已在简历中', icon: 'none' });
      return;
    }
    if (key === '__custom__') {
      this.createCustomSection();
      return;
    }
    this.addStandardSection(key);
  },

  addStandardSection(key) {
    const resume = this.data.resume;
    const order = resume.sectionOrder.slice();
    // summary 始终放最后；其余板块插在 summary 前
    const summaryIdx = order.indexOf('summary');
    const insertAt = summaryIdx >= 0 ? summaryIdx : order.length;
    order.splice(insertAt, 0, key);
    const patch = { 'resume.sectionOrder': order };
    // 首次添加数组板块时自动给一条空内容，方便直接填写
    if (SECTION_META[key] && (!resume[key] || !resume[key].length)) {
      patch[`resume.${key}`] = [SECTION_META[key].factory()];
      if (key === 'skills') patch.skillTexts = [''];
    }
    if (key === 'summary') patch['resume.summary'] = resume.summary || '';
    this.setData(patch);
    this.setData({ addPanelShow: false, [`collapsed.${key}`]: false, sectionList: this.buildSectionList(order) });
    this.markChanged();
  },

  createCustomSection() {
    wx.showModal({
      title: '自定义板块名称',
      editable: true,
      placeholderText: '如：作品集 / 志愿服务 / 兴趣爱好',
      success: (r1) => {
        if (!r1.confirm) return;
        const title = (r1.content || '').trim().slice(0, 8) || '自定义板块';
        wx.showActionSheet({
          itemList: CUSTOM_KINDS.map((k) => k.name),
          success: (r2) => {
            const kind = CUSTOM_KINDS[r2.tapIndex].key;
            const sec = createCustomSection(title, kind);
            const customs = (this.data.resume.customSections || []).concat(sec);
            const order = this.data.resume.sectionOrder.slice();
            const summaryIdx = order.indexOf('summary');
            order.splice(summaryIdx >= 0 ? summaryIdx : order.length, 0, 'custom:' + sec.id);
            this.setData({
              addPanelShow: false,
              'resume.customSections': customs,
              'resume.sectionOrder': order,
              sectionList: this.buildSectionList(order),
              [`collapsed.custom:${sec.id}`]: false
            });
            this.markChanged();
          }
        });
      }
    });
  },

  refreshSectionList() {
    const order = this.data.resume.sectionOrder;
    this.setData({ sectionList: this.buildSectionList(order) });
  },

  noop() {}
});
