// pages/resume-preview/resume-preview.js V2
// 全屏预览：模板 / 主题色 / 字号 / 间距 / 文件命名 / 导出图片 / 导出长图（PDF 占位）
const app = getApp();
const { TEMPLATES, THEME_COLORS, TEMPLATE_CATEGORIES } = require('../../utils/constants');
const {
  renderResumeImage,
  renderResumeLongImage,
  saveImageToPhotosAlbum,
  saveImageOrPreview,
  withTimeout
} = require('../../utils/canvas-export');
const { DEBUG_NO_CLOUD } = require('../../utils/debug');

const FONT_OPTIONS = [
  { key: 'small', name: '小', desc: '内容多时更省空间' },
  { key: 'medium', name: '中', desc: '推荐，均衡易读' },
  { key: 'large', name: '大', desc: '疏朗醒目' }
];
const SPACING_OPTIONS = [
  { key: 'compact', name: '紧凑', desc: '尽量压进一页' },
  { key: 'normal', name: '标准', desc: '推荐排版' },
  { key: 'loose', name: '宽松', desc: '留白舒适' }
];

Page({
  data: {
    resume: null,
    templateGroups: [],
    templateCount: TEMPLATES.length,
    colors: THEME_COLORS,
    fontOptions: FONT_OPTIONS,
    spacingOptions: SPACING_OPTIONS,
    currentTplName: '',
    tplPanelOpen: false,
    sheet: '', // '' | color | font | spacing
    fileName: '我的简历',
    exporting: false,
    // 自适应纸张
    paperHeight: 0,
    totalPages: 0,
    curPage: 1
  },

  onLoad(options) {
    this.resumeId = options && options.id;
    const draft = app.globalData.currentResume;
    if (draft && draft._id === this.resumeId) {
      this.applyResume(draft);
    } else {
      this.loadResume();
    }
  },

  async loadResume() {
    if (!this.resumeId) return;
    if (DEBUG_NO_CLOUD) {
      const resume = (app.globalData.localResumes || []).find((r) => r._id === this.resumeId);
      if (resume) {
        this.applyResume(resume);
      } else {
        wx.showToast({ title: '简历不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      }
      return;
    }
    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'resumeCRUD',
        data: { action: 'get', data: { id: this.resumeId } }
      });
      wx.hideLoading();
      if (!res.result || res.result.code !== 0) throw new Error((res.result && res.result.message) || '加载失败');
      this.applyResume(res.result.data);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  applyResume(resume) {
    const tpl = TEMPLATES.find((t) => t.id === resume.templateId) || TEMPLATES[0];
    const groups = TEMPLATE_CATEGORIES.map((c) => ({
      key: c.key,
      name: c.name,
      list: TEMPLATES.filter((t) => t.category === c.key)
    }));
    this.setData({
      resume,
      currentTplName: tpl.name,
      templateGroups: groups,
      fileName: (resume.title && resume.title !== '未命名简历' ? resume.title : '我的简历'),
      paperHeight: 0,
      totalPages: 0,
      curPage: 1
    });
    app.globalData.currentResume = resume;
  },

  // ---------- 自适应纸张：内容高度 / 分页指示 ----------
  onLayout(e) {
    const { heightPx, pages } = e.detail || {};
    if (!heightPx) return;
    const h = Math.ceil(heightPx);
    this._pageUnit = pages > 0 ? h / pages : 0;
    this.setData({ paperHeight: h, totalPages: pages });
  },

  onPaperScroll(e) {
    if (!this._pageUnit || !this.data.totalPages) return;
    const page = Math.min(this.data.totalPages, Math.floor(e.detail.scrollTop / this._pageUnit) + 1);
    if (page !== this.data.curPage) this.setData({ curPage: page });
  },

  // ---------- 底部面板 ----------
  toggleTplPanel() {
    this.setData({ tplPanelOpen: !this.data.tplPanelOpen, sheet: '' });
  },
  openSheet(e) {
    this.setData({ sheet: e.currentTarget.dataset.sheet, tplPanelOpen: false });
  },
  closeSheet() {
    this.setData({ sheet: '' });
  },
  closePanel() {
    this.setData({ tplPanelOpen: false, sheet: '' });
  },
  noop() {},

  // ---------- 模板（V3：10 套全部免费，直接切换） ----------
  onSelectTemplate(e) {
    const tplId = e.currentTarget.dataset.id;
    const tpl = TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    const resume = { ...this.data.resume, templateId: tplId };
    this.setData({ resume, currentTplName: tpl.name, tplPanelOpen: false });
    this.persist(resume);
  },

  // ---------- 主题色 ----------
  onSelectColor(e) {
    const value = e.currentTarget.dataset.value;
    if (this.data.resume.themeColor === value) return;
    const resume = { ...this.data.resume, themeColor: value };
    this.setData({ resume, sheet: '' });
    this.persist(resume);
  },

  // ---------- 字号 / 间距 ----------
  onSelectFont(e) {
    const key = e.currentTarget.dataset.key;
    if (this.data.resume.fontSize === key) return;
    const resume = { ...this.data.resume, fontSize: key };
    this.setData({ resume, sheet: '' });
    this.persist(resume);
  },
  onSelectSpacing(e) {
    const key = e.currentTarget.dataset.key;
    if (this.data.resume.spacing === key) return;
    const resume = { ...this.data.resume, spacing: key };
    this.setData({ resume, sheet: '' });
    this.persist(resume);
  },

  // ---------- 文件命名（保存相册由系统命名，此处用于保存提示与简历标题） ----------
  onRenameFile() {
    wx.showModal({
      title: '文件命名',
      editable: true,
      content: this.data.fileName,
      placeholderText: '输入导出文件名称',
      success: (res) => {
        if (!res.confirm) return;
        const name = (res.content || '').trim().slice(0, 20) || '我的简历';
        this.setData({ fileName: name });
        wx.showToast({ title: '已命名为「' + name + '」', icon: 'none' });
      }
    });
  },

  // ---------- 设置落库 ----------
  persist(resume) {
    app.globalData.currentResume = resume;
    if (DEBUG_NO_CLOUD) {
      const list = (app.globalData.localResumes || []).map((r) => (r._id === resume._id ? resume : r));
      app.globalData.localResumes = list;
      app.saveLocalResumes && app.saveLocalResumes();
      return;
    }
    wx.cloud
      .callFunction({
        name: 'resumeCRUD',
        data: { action: 'update', data: { id: resume._id, resume } }
      })
      .catch((e) => console.error('[resume-preview] 保存设置失败', e));
  },

  // ---------- 导出公共：取画布 + 解析头像临时链接 ----------
  getCanvas() {
    return new Promise((resolve) => {
      this.createSelectorQuery()
        .select('#exportCanvas')
        .fields({ node: true })
        .exec((res) => resolve(res && res[0] ? res[0].node : null));
    });
  },

  // cloud:// 文件先下载到本地临时路径（比 https 临时链接在 canvas drawImage 里更稳定），失败不阻塞导出
  resolveAvatarPath(resume) {
    const fileID = resume.basics && resume.basics.avatarFileID;
    if (!fileID) return Promise.resolve('');
    if (!/^cloud:\/\//.test(fileID)) return Promise.resolve(fileID);
    if (DEBUG_NO_CLOUD) return Promise.resolve('');
    return wx.cloud
      .downloadFile({ fileID })
      .then((res) => {
        console.log('[export] 头像下载完成', res.tempFilePath);
        return res.tempFilePath || '';
      })
      .catch((e) => {
        console.warn('[export] 头像下载失败，将无头像导出', e);
        return '';
      });
  },

  buildExportOpts(avatarPath) {
    const r = this.data.resume;
    return {
      isVip: !!app.globalData.isVip,
      avatarPath,
      fontLevel: r.fontSize || 'medium',
      spacing: r.spacing || 'normal'
    };
  },

  // ---------- 导出 A4 图片 ----------
  async onExport() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    wx.showLoading({ title: '正在生成图片...', mask: true });
    try {
      const [canvas, avatarPath] = await Promise.all([this.getCanvas(), this.resolveAvatarPath(this.data.resume)]);
      if (!canvas) throw new Error('导出组件初始化失败');
      const tempPath = await withTimeout(
        renderResumeImage(canvas, this.data.resume, this.buildExportOpts(avatarPath)),
        30000,
        '导出超时，请重试'
      );
      const mode = await withTimeout(saveImageOrPreview(tempPath), 30000, '保存超时，请重试');
      wx.hideLoading();
      wx.showToast({
        title: mode === 'preview' ? '已生成，长按图片可保存' : `「${this.data.fileName}」已保存`,
        icon: 'none'
      });
    } catch (e) {
      wx.hideLoading();
      console.error('[resume-preview] 导出失败', e);
      wx.showToast({ title: e.message || '导出失败，请重试', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  // ---------- 导出长图（MVP 阶段的"PDF"：完整内容一张长图） ----------
  async onExportLong() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    wx.showLoading({ title: '正在生成长图...', mask: true });
    try {
      const [canvas, avatarPath] = await Promise.all([this.getCanvas(), this.resolveAvatarPath(this.data.resume)]);
      if (!canvas) throw new Error('导出组件初始化失败');
      const tempPath = await withTimeout(
        renderResumeLongImage(canvas, this.data.resume, this.buildExportOpts(avatarPath)),
        30000,
        '导出超时，请重试'
      );
      const mode = await withTimeout(saveImageOrPreview(tempPath), 30000, '保存超时，请重试');
      wx.hideLoading();
      if (mode === 'preview') {
        wx.showToast({ title: '已生成长图，长按图片可保存', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '长图已保存',
        content: `「${this.data.fileName}」完整长图已保存到相册，可直接发送或打印为 PDF`,
        showCancel: false,
        confirmText: '知道了'
      });
    } catch (e) {
      wx.hideLoading();
      console.error('[resume-preview] 导出长图失败', e);
      wx.showToast({ title: e.message || '导出失败，请重试', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  // ---------- 导出 PDF（云函数 HTML→PDF；失败自动降级长图） ----------
  async onExportPdf() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });
    wx.showLoading({ title: '正在生成PDF...', mask: true });
    try {
      const res = await withTimeout(
        wx.cloud.callFunction({
          name: 'exportPdf',
          data: {
            resume: this.data.resume,
            fileName: this.data.fileName,
            isVip: !!app.globalData.isVip
          }
        }),
        45000,
        'PDF 生成超时'
      );
      const result = res.result || {};
      if (result.code !== 0 || !(result.data && result.data.fileID)) {
        throw new Error(result.message || 'PDF_GENERATE_UNAVAILABLE');
      }
      const fileID = result.data.fileID;
      const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
      if (!tempUrl) throw new Error('PDF 链接获取失败');

      const dlRes = await wx.downloadFile({ url: tempUrl });
      if (dlRes.statusCode !== 200 || !dlRes.tempFilePath) throw new Error('PDF 下载失败');

      wx.hideLoading();
      wx.openDocument({
        filePath: dlRes.tempFilePath,
        fileType: 'pdf',
        showMenu: true, // 允许用户转发 / 保存到手机
        fail: () => wx.showToast({ title: 'PDF 已生成，打开失败请重试', icon: 'none' })
      });
    } catch (e) {
      console.warn('[resume-preview] PDF 导出失败，降级长图', e);
      this.setData({ exporting: false });
      wx.hideLoading();
      wx.showModal({
        title: '已为你导出长图',
        content: 'PDF 生成繁忙，先为你导出完整长图保存到相册，可直接发送或在聊天中转为 PDF',
        confirmText: '导成长图',
        cancelText: '取消',
        confirmColor: '#1e3a5f',
        success: (m) => {
          if (m.confirm) this.onExportLong();
        }
      });
      return;
    }
    this.setData({ exporting: false });
  }
});

