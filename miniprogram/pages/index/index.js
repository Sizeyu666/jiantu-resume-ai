// pages/index/index.js 首页 V3：我的简历 + 10 套免费模板 + 导入简历 + AI 证件照入口
const app = getApp();
const { calcProgress, progressColor } = require('../../utils/progress');
const { buildSampleResume } = require('../../utils/sampleData');
const { createEmptyResume, formatRelative, uid, normalizeParsedResume } = require('../../utils/util');
const { TEMPLATES } = require('../../utils/constants');
const config = require('../../utils/config');
const { DEBUG_NO_CLOUD } = require('../../utils/debug');

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    resumes: [],
    // 30 套模板全部免费，首页精选前 9 套（完整列表去「模板」tab）
    templates: TEMPLATES.slice(0, 9),
    // 重命名弹窗
    renameVisible: false,
    renameId: '',
    renameValue: '',
    // 导入简历弹窗
    importVisible: false,
    importText: '',
    importing: false
  },

  onLoad() {
    const sys = app.globalData.sysInfo || {};
    this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
  },

  // 用 onShow：从编辑页返回时刷新列表
  onShow() {
    this.loadResumes();
  },

  async loadResumes() {
    this.setData({ loading: true });
    // DEBUG_NO_CLOUD：直接读本地列表
    if (DEBUG_NO_CLOUD) {
      const list = (app.globalData.localResumes || []).map((item) => {
        const percent = calcProgress(item);
        return {
          ...item,
          percent,
          barColor: progressColor(percent),
          updatedText: formatRelative(item.updatedAt || Date.now())
        };
      });
      this.setData({ resumes: list, loading: false });
      return;
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'resumeCRUD',
        data: { action: 'list' }
      });
      const list = ((res.result && res.result.data) || []).map((item) => {
        const percent = calcProgress(item);
        return {
          ...item,
          percent,
          barColor: progressColor(percent),
          updatedText: formatRelative(item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now())
        };
      });
      this.setData({ resumes: list, loading: false });
    } catch (e) {
      console.error('[index] 加载简历列表失败', e);
      this.setData({ resumes: [], loading: false });
    }
  },

  // ---------- 新建（免费上限校验） ----------
  onCreate() {
    if (this.hitFreeLimit()) return;
    this.createAndEdit(createEmptyResume());
  },

  // ---------- 示例数据 ----------
  onFillSample() {
    if (this.hitFreeLimit()) return;
    wx.showLoading({ title: '正在生成示例...', mask: true });
    this.createAndEdit(buildSampleResume());
  },

  // ---------- 选模板新建（V3：全部免费，点击直接使用） ----------
  onSelectTemplate(e) {
    const tplId = e.currentTarget.dataset.id;
    const tpl = TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    if (this.hitFreeLimit()) return;
    const resume = createEmptyResume();
    resume.templateId = tpl.id;
    resume.themeColor = tpl.defaultColor;
    this.createAndEdit(resume);
  },

  hitFreeLimit() {
    if (!app.globalData.isVip && this.data.resumes.length >= config.MAX_RESUMES_FREE) {
      wx.showModal({
        title: '份数已达上限',
        content: `免费版最多${config.MAX_RESUMES_FREE}份简历，开通会员解锁无限份，新用户低至 1 元体验`,
        confirmText: '去开通',
        confirmColor: '#1e3a5f',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/vip/vip?plan=trial' });
        }
      });
      return true;
    }
    return false;
  },

  async createAndEdit(resume) {
    // DEBUG_NO_CLOUD：本地生成 id，只写 globalData + 本地缓存，直接跳编辑页
    if (DEBUG_NO_CLOUD) {
      const id = 'local_' + uid();
      const doc = { ...resume, _id: id, updatedAt: Date.now() };
      app.globalData.localResumes = [doc, ...(app.globalData.localResumes || [])];
      app.saveLocalResumes();
      app.globalData.currentResume = doc;
      wx.hideLoading();
      wx.navigateTo({ url: `/pages/resume-edit/resume-edit?id=${id}` });
      return;
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'resumeCRUD',
        data: { action: 'create', data: { resume } }
      });
      wx.hideLoading();
      if (!res.result || res.result.code !== 0) {
        throw new Error((res.result && res.result.message) || '创建失败');
      }
      wx.navigateTo({ url: `/pages/resume-edit/resume-edit?id=${res.result.data.id}` });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '创建失败，请重试', icon: 'none' });
    }
  },

  // ---------- 导入简历（粘贴旧简历文本，AI 自动解析） ----------
  openImport() {
    if (this.hitFreeLimit()) return;
    this.setData({ importVisible: true, importText: '' });
  },
  closeImport() {
    if (this.data.importing) return;
    this.setData({ importVisible: false });
  },
  onImportInput(e) {
    this.setData({ importText: e.detail.value });
  },

  // PDF / 图片导入：选文件 → 上传云存储 → parseResume 云函数提取文本并 AI 结构化
  onImportPdf() {
    if (this.data.importing) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0];
        if (f) this.uploadAndParseFile('pdf', f.path, f.name);
      }
    });
  },

  onImportOcr() {
    if (this.data.importing) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['original'], // OCR 需要清晰度，不压缩
      success: (res) => {
        const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (path) this.uploadAndParseFile('image', path);
      }
    });
  },

  async uploadAndParseFile(type, filePath, fileName) {
    if (DEBUG_NO_CLOUD) {
      wx.showToast({ title: '文件导入需配置云开发后使用', icon: 'none' });
      return;
    }
    if (this.hitFreeLimit()) return;
    this.setData({ importing: true, importVisible: true });
    wx.showLoading({ title: 'AI 解析中...', mask: true });
    try {
      const ext = type === 'pdf' ? 'pdf' : 'jpg';
      const up = await wx.cloud.uploadFile({
        cloudPath: `resume-import/${type}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
        filePath
      });
      console.log('[index] 导入文件上传成功', up.fileID);
      const res = await wx.cloud.callFunction({
        name: 'parseResume',
        // 同时带扁平参数与 data 包裹：V6 云函数读扁平，旧版读 data，部署前后都能用
        data: { action: 'parseFile', fileID: up.fileID, type, data: { fileID: up.fileID, type } }
      });
      const r = res.result || {};
      // 函数未部署 / 仍是默认 Hello World 空壳：没有任何业务字段
      if (r.success === undefined && r.code === undefined && r.data === undefined && r.result === undefined) {
        throw new Error('parseResume 云函数未部署或为默认空壳，请右键该云函数「上传并部署：云端安装依赖」后重试');
      }
      if (r.success === false || (r.code !== undefined && r.code !== 0)) {
        throw new Error(r.error || r.message || '解析失败，请重试');
      }
      // normalizeParsedResume 内部会自动解包 data/result/resume 等多层容器，直接传整个返回体
      const resume = normalizeParsedResume(r);
      // 校验是否真的解析出内容（姓名/任一板块），避免跳进空白编辑器
      const hasContent = !!(
        (resume.basics && (resume.basics.name || resume.basics.phone || resume.basics.jobIntent)) ||
        (resume.education || []).length || (resume.experience || []).length ||
        (resume.projects || []).length || (resume.skills || []).some((s) => (s.items || []).length) ||
        resume.summary
      );
      if (!hasContent) {
        console.error('[index] 解析结果为空，云函数返回：', JSON.stringify(r).slice(0, 500));
        throw new Error('没有从文件中识别出简历内容，请换更清晰的文件，或改用粘贴文本方式');
      }
      resume.title = fileName ? (String(fileName).replace(/\.pdf$/i, '').slice(0, 20) || '导入的简历') : '导入的简历';
      this.setData({ importing: false, importVisible: false, importText: '' });
      wx.hideLoading();
      wx.showToast({ title: '识别成功，已为你整理', icon: 'success' });
      this.createAndEdit(resume);
    } catch (e) {
      this.setData({ importing: false });
      wx.hideLoading();
      console.error('[index] 文件导入失败', e);
      wx.showModal({
        title: type === 'pdf' ? 'PDF 解析失败' : '图片识别失败',
        content: e.message || '请重试，或改用粘贴文本方式导入',
        showCancel: false
      });
    }
  },

  async onImportConfirm() {
    if (this.data.importing) return;
    const text = (this.data.importText || '').trim();
    if (text.length < 50) {
      wx.showToast({ title: '请粘贴更完整的简历内容（至少 50 字）', icon: 'none' });
      return;
    }
    if (DEBUG_NO_CLOUD) {
      wx.showToast({ title: '导入简历需配置云开发后使用', icon: 'none' });
      return;
    }
    this.setData({ importing: true });
    wx.showLoading({ title: 'AI解析中，请稍候...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiCall',
        data: { action: 'parseResume', data: { text } }
      });
      const r = res.result || {};
      if (r.code !== 0) throw new Error(r.message || '识别失败，请重试');
      const resume = normalizeParsedResume(r);
      const hasContent = !!(
        (resume.basics && (resume.basics.name || resume.basics.phone)) ||
        (resume.education || []).length || (resume.experience || []).length ||
        (resume.projects || []).length || (resume.skills || []).some((s) => (s.items || []).length) ||
        resume.summary
      );
      if (!hasContent) throw new Error('没有识别出简历内容，请粘贴更完整的文本');
      resume.title = '导入的简历';
      this.setData({ importing: false, importVisible: false });
      wx.hideLoading();
      wx.showToast({ title: '识别成功，已为你整理', icon: 'success' });
      this.createAndEdit(resume);
    } catch (e) {
      this.setData({ importing: false });
      wx.hideLoading();
      console.error('[index] 导入简历失败', e);
      wx.showToast({ title: e.message || '识别失败，请重试', icon: 'none' });
    }
  },

  // ---------- 卡片操作 ----------
  onTapCard(e) {
    wx.navigateTo({ url: `/pages/resume-edit/resume-edit?id=${e.currentTarget.dataset.id}` });
  },

  onMore(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['重命名', '复制一份', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) this.setData({ renameVisible: true, renameId: id, renameValue: title });
        else if (res.tapIndex === 1) this.copyResume(id);
        else if (res.tapIndex === 2) this.deleteResume(id);
      }
    });
  },

  // ---------- 重命名 ----------
  onRenameInput(e) {
    this.setData({ renameValue: e.detail.value });
  },
  onRenameCancel() {
    this.setData({ renameVisible: false });
  },
  async onRenameConfirm() {
    const { renameId, renameValue, resumes } = this.data;
    const title = (renameValue || '').trim();
    if (!title) {
      wx.showToast({ title: '标题不能为空', icon: 'none' });
      return;
    }
    const target = resumes.find((r) => r._id === renameId);
    if (!target) return;
    if (DEBUG_NO_CLOUD) {
      const list = (app.globalData.localResumes || []).map((r) =>
        r._id === renameId ? { ...r, title, updatedAt: Date.now() } : r
      );
      app.globalData.localResumes = list;
      app.saveLocalResumes();
      this.setData({ renameVisible: false });
      this.loadResumes();
      return;
    }
    try {
      await wx.cloud.callFunction({
        name: 'resumeCRUD',
        data: { action: 'update', data: { id: renameId, resume: { ...target, title } } }
      });
      this.setData({ renameVisible: false });
      this.loadResumes();
    } catch (e) {
      wx.showToast({ title: '重命名失败', icon: 'none' });
    }
  },

  // ---------- 复制 / 删除 ----------
  async copyResume(id) {
    if (DEBUG_NO_CLOUD) {
      const list = app.globalData.localResumes || [];
      const source = list.find((r) => r._id === id);
      if (!source) return;
      if (!app.globalData.isVip && list.length >= config.MAX_RESUMES_FREE) {
        wx.showToast({ title: `免费版最多${config.MAX_RESUMES_FREE}份简历，开通会员解锁无限份`, icon: 'none' });
        return;
      }
      const copy = { ...source, _id: 'local_' + uid(), title: ((source.title || '') + ' 副本').slice(0, 30), updatedAt: Date.now() };
      app.globalData.localResumes = [copy, ...list];
      app.saveLocalResumes();
      this.loadResumes();
      return;
    }
    wx.showLoading({ title: '复制中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'resumeCRUD',
        data: { action: 'copy', data: { id } }
      });
      wx.hideLoading();
      if (!res.result || res.result.code !== 0) {
        throw new Error((res.result && res.result.message) || '复制失败');
      }
      this.loadResumes();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '复制失败，请重试', icon: 'none' });
    }
  },

  deleteResume(id) {
    wx.showModal({
      title: '删除简历',
      content: '删除后不可恢复，确定删除这份简历吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        if (DEBUG_NO_CLOUD) {
          app.globalData.localResumes = (app.globalData.localResumes || []).filter((r) => r._id !== id);
          app.saveLocalResumes();
          this.loadResumes();
          return;
        }
        try {
          await wx.cloud.callFunction({
            name: 'resumeCRUD',
            data: { action: 'remove', data: { id } }
          });
          this.loadResumes();
        } catch (e) {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  // ---------- 底部入口 ----------
  goIdPhoto() {
    wx.navigateTo({ url: '/pages/id-photo/id-photo' });
  },
  goTemplate() {
    wx.switchTab({ url: '/pages/template/template' });
  },
  noop() {}
});
