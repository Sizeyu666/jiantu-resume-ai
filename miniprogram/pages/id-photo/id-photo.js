// pages/id-photo/id-photo.js AI 证件照 V6.1
// 兼容两种云端版本（你部署 V6 前后都能用）：
//   后端 v6：idPhoto 只抠图返回透明 PNG，换底色/尺寸/水印全部本地 canvas（切底色尺寸不调云）
//   后端 legacy：云函数返回已换底裁剪的成品图（线上旧版，未重新部署 V6 时走这条）
const app = getApp();
const { saveImageOrPreview } = require('../../utils/canvas-export');
const { DEBUG_NO_CLOUD } = require('../../utils/debug');
const aiLimit = require('../../utils/ai-limit');

const BG_COLORS = [
  { key: 'blue', name: '蓝底', value: '#438edb' },
  { key: 'white', name: '白底', value: '#ffffff' },
  { key: 'red', name: '红底', value: '#d43030' }
];
const SIZES = [
  { key: '1inch', name: '一寸', w: 295, h: 413 },
  { key: '2inch', name: '二寸', w: 413, h: 579 },
  { key: 'resume', name: '简历用小图', w: 350, h: 490 }
];
const PREVIEW_RATIO = 2;
const SAVE_RATIO = 3;

Page({
  data: {
    colors: BG_COLORS,
    sizes: SIZES,
    bgKey: 'blue',
    sizeKey: '1inch',
    srcPath: '',
    resultUrl: '',
    processing: false,
    compositing: false,
    saving: false,
    remainText: '',
    fromEdit: false
  },

  onLoad(options) {
    this.fromEdit = !!(options && options.from === 'edit');
    this._srcFileID = null;
    this._portraitFileID = null; // v6：透明前景
    this._portraitPath = '';
    this._legacyFileID = null; // legacy：云端成品图
    this._backend = ''; // 'v6' | 'legacy'
    this._chargedForSrc = false;
    this.refreshRemain();
  },

  refreshRemain() {
    if (app.globalData.isVip) {
      this.setData({ remainText: '会员不限次', fromEdit: this.fromEdit });
      return;
    }
    const remaining = aiLimit.getIdPhotoRemaining();
    this.setData({ remainText: `今日免费剩余 ${remaining} 次`, fromEdit: this.fromEdit });
  },

  showMemberGuide() {
    wx.showModal({
      title: '今日免费次数已用完',
      content: '免费用户每日可生成 3 张证件照，开通会员不限次使用，新用户低至 1 元体验',
      confirmText: '去看看',
      cancelText: '取消',
      success: (r) => {
        if (r.confirm) wx.navigateTo({ url: '/pages/vip/vip?plan=trial' });
      }
    });
  },

  onChooseImage() {
    if (DEBUG_NO_CLOUD) {
      wx.showToast({ title: '证件照功能需配置云开发后使用', icon: 'none' });
      return;
    }
    if (!app.globalData.isVip && aiLimit.getIdPhotoRemaining() <= 0) {
      this.showMemberGuide();
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (path) {
          this._srcFileID = null;
          this._portraitFileID = null;
          this._portraitPath = '';
          this._legacyFileID = null;
          this._backend = '';
          this._chargedForSrc = false;
          this.setData({ srcPath: path, resultUrl: '' }, () => this.segment());
        }
      }
    });
  },

  onPickBg(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.bgKey) return;
    this.setData({ bgKey: key }, () => this.applyCurrentStyle());
  },
  onPickSize(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.sizeKey) return;
    this.setData({ sizeKey: key }, () => this.applyCurrentStyle());
  },

  // v6：本地即时合成；legacy：重新调云函数换底/尺寸
  applyCurrentStyle() {
    if (this._backend === 'v6') return this.compositePreview();
    if (this._backend === 'legacy') return this.callLegacyProcess();
  },

  getFileSize(filePath) {
    return new Promise((resolve) => {
      // 用 FileSystemManager.getFileInfo（wx.getFileInfo 已废弃）
      wx.getFileSystemManager().getFileInfo({
        filePath,
        success: (info) => resolve(info.size),
        fail: () => resolve(0)
      });
    });
  },

  compressUnder(srcPath, maxBytes) {
    return new Promise((resolve) => {
      if (!wx.compressImage) {
        console.warn('[id-photo] 基础库不支持 compressImage，使用原图上传');
        resolve(srcPath);
        return;
      }
      const qualities = [80, 60, 45];
      let attempt = 0;
      const tryQuality = (q) => {
        wx.compressImage({
          src: srcPath,
          quality: q,
          compressedWidth: 1280,
          success: (res) => {
            wx.getFileSystemManager().getFileInfo({
              filePath: res.tempFilePath,
              success: (info) => {
                console.log('[id-photo] 压缩尝试 quality=' + q + ' 大小=' + info.size + 'B');
                if (info.size <= maxBytes || attempt >= qualities.length - 1) resolve(res.tempFilePath);
                else { attempt += 1; tryQuality(qualities[attempt]); }
              },
              fail: () => resolve(res.tempFilePath)
            });
          },
          fail: () => {
            console.warn('[id-photo] compressImage 失败，使用原图兜底');
            resolve(srcPath);
          }
        });
      };
      this.getFileSize(srcPath).then((size) => {
        console.log('[id-photo] 原图大小', size + 'B');
        if (size > 0 && size <= maxBytes) resolve(srcPath);
        else tryQuality(qualities[0]);
      });
    });
  },

  // ---------- 新图：压缩 → 上传 → 调云函数（同时兼容 v6/legacy 入参） ----------
  async segment() {
    const { srcPath } = this.data;
    if (!srcPath || this.data.processing) return;
    this.setData({ processing: true, resultUrl: '' });
    wx.showLoading({ title: 'AI 抠图处理中...', mask: true });
    try {
      if (!this._srcFileID) {
        console.log('[id-photo] 1/4 本地压缩图片');
        const uploadPath = await this.compressUnder(srcPath, 500 * 1024);
        console.log('[id-photo] 2/4 上传云存储');
        const up = await wx.cloud.uploadFile({
          cloudPath: `idphoto-src/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
          filePath: uploadPath
        });
        this._srcFileID = up.fileID;
      }

      console.log('[id-photo] 3/4 调 idPhoto 云函数抠图');
      const { backend, fileID } = await this.callSegmentCloud();
      this._backend = backend;
      console.log('[id-photo] 云端版本 =', backend);

      wx.hideLoading();
      if (!this._chargedForSrc && !app.globalData.isVip) {
        aiLimit.markIdPhotoUsed();
        this._chargedForSrc = true;
        this.refreshRemain();
      }
      // v6 需本地合成预览；legacy 已在 callSegmentCloud 里取到成品图链接
      if (backend === 'v6') await this.compositePreview();
    } catch (e) {
      wx.hideLoading();
      console.error('[id-photo] 抠图失败', e);
      this.handleProcessError(e);
    } finally {
      this.setData({ processing: false });
    }
  },

  // 同一套参数兼容两版后端，依据返回结构判断版本
  async callSegmentCloud() {
    const { bgKey, sizeKey } = this.data;
    const res = await wx.cloud.callFunction({
      name: 'idPhoto',
      data: {
        // v6 读扁平 fileID；legacy 读 action + data
        action: 'process',
        fileID: this._srcFileID,
        data: { fileID: this._srcFileID, bgColor: bgKey, size: sizeKey }
      }
    });
    const r = res.result || {};
    // legacy：data 里带 size/bgColor，是已换底裁剪的成品 JPG
    if (r.code === 0 && r.data && r.data.fileID && r.data.size) {
      this._legacyFileID = r.data.fileID;
      const urlRes = await wx.cloud.getTempFileURL({ fileList: [r.data.fileID] });
      const url = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
      if (url) this.setData({ resultUrl: url });
      return { backend: 'legacy', fileID: r.data.fileID };
    }
    // v6：扁平 fileID（透明 PNG）
    const v6FileID = r.fileID || (r.data && r.data.fileID);
    if ((r.success === true || r.code === 0) && v6FileID) {
      this._portraitFileID = v6FileID;
      // 下载透明前景到本地
      console.log('[id-photo] 4/4 下载透明前景图');
      const dl = await wx.cloud.downloadFile({ fileID: v6FileID });
      if (dl.statusCode !== 200 || !dl.tempFilePath) throw new Error('结果图下载失败，请重试');
      this._portraitPath = dl.tempFilePath;
      return { backend: 'v6', fileID: v6FileID };
    }
    throw new Error(r.error || r.message || '云函数处理失败，请重新部署 idPhoto 后重试');
  },

  // legacy：每次换底/尺寸重调云函数并取临时链接展示
  async callLegacyProcess() {
    if (!this._srcFileID || this.data.compositing) return;
    this.setData({ compositing: true });
    wx.showLoading({ title: '生成中...', mask: true });
    try {
      const { fileID } = await this.callSegmentCloud();
      const urlRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const url = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
      if (!url) throw new Error('结果图片链接获取失败');
      this.setData({ resultUrl: url });
      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      console.error('[id-photo] legacy 换底失败', e);
      this.handleProcessError(e);
    } finally {
      this.setData({ compositing: false });
    }
  },

  // ---------- v6 本地 canvas 合成 ----------
  compositeToFile(bgKey, sizeKey, pixelRatio, withWatermark, sourcePath) {
    const bg = BG_COLORS.find((c) => c.key === bgKey) || BG_COLORS[0];
    const size = SIZES.find((s) => s.key === sizeKey) || SIZES[0];
    const w = size.w * pixelRatio;
    const h = size.h * pixelRatio;
    return new Promise((resolve, reject) => {
      this.createSelectorQuery()
        .select('#photoCanvas')
        .fields({ node: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            reject(new Error('画布初始化失败'));
            return;
          }
          const canvas = res[0].node;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          const img = canvas.createImage();
          img.onload = () => {
            try {
              ctx.fillStyle = bg.value;
              ctx.fillRect(0, 0, w, h);
              if (bgKey === 'white') {
                ctx.strokeStyle = '#e3e6ea';
                ctx.lineWidth = Math.max(2, Math.round(w * 0.004));
                ctx.strokeRect(1, 1, w - 2, h - 2);
              }
              const scale = Math.max(w / img.width, h / img.height);
              const dw = img.width * scale;
              const dh = img.height * scale;
              ctx.drawImage(img, (w - dw) / 2, (h - dh) * 0.25, dw, dh);
              if (withWatermark) {
                const barH = Math.round(h * 0.07);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
                ctx.fillRect(0, h - barH, w, barH);
                ctx.fillStyle = '#ffffff';
                ctx.font = `${Math.round(barH * 0.52)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('由简途简历生成', w / 2, h - barH / 2);
              }
              wx.canvasToTempFilePath({
                canvas,
                fileType: 'jpg',
                quality: 1,
                success: (r2) => resolve(r2.tempFilePath),
                fail: () => reject(new Error('图片合成失败'))
              });
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = () => reject(new Error('人像图加载失败'));
          img.src = sourcePath;
        });
    });
  },

  async compositePreview() {
    if (this._backend !== 'v6' || !this._portraitPath) return;
    this.setData({ compositing: true });
    try {
      const tempPath = await this.compositeToFile(this.data.bgKey, this.data.sizeKey, PREVIEW_RATIO, false, this._portraitPath);
      this.setData({ resultUrl: tempPath });
    } catch (e) {
      console.error('[id-photo] 本地合成失败', e);
      wx.showToast({ title: e.message || '合成失败，请重试', icon: 'none' });
    } finally {
      this.setData({ compositing: false });
    }
  },

  handleProcessError(e) {
    const raw = (e && e.message) || '';
    const notOpened = /未开通|未授权|UnauthorizedOperation|ServiceNotOpened|not.?activated|not.?opened|InvalidAction/i.test(raw);
    if (notOpened) {
      wx.showModal({
        title: '人像分割服务异常',
        content: /InvalidAction/i.test(raw)
          ? '云端 idPhoto 仍是旧版本，请右键云函数「上传并部署：云端安装依赖」更新到最新版后重试。'
          : '该功能需要腾讯云「人体分析 bda - SegmentPortraitPic」服务，请管理员在腾讯云控制台开通后重试。',
        confirmText: '我知道了',
        showCancel: false
      });
      return;
    }
    let msg = raw;
    if (msg && msg.indexOf('密钥') < 0 && msg.length > 26) msg = msg.slice(0, 26) + '…';
    if (!msg) msg = '抠图失败，请重试';
    wx.showToast({ title: msg, icon: 'none', duration: 3000 });
  },

  // ---------- 设为简历头像 ----------
  async onSetAvatar() {
    if (!this.data.resultUrl) {
      wx.showToast({ title: '请先生成证件照', icon: 'none' });
      return;
    }
    const cur = app.globalData.currentResume;
    if (!cur || !cur._id) {
      wx.showToast({ title: '请先在简历编辑页打开一份简历', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '设置中...', mask: true });
    try {
      let tempPath;
      if (this._backend === 'v6') {
        tempPath = await this.compositeToFile(this.data.bgKey, 'resume', SAVE_RATIO, false, this._portraitPath);
      } else {
        const dl = await wx.cloud.downloadFile({ fileID: this._legacyFileID });
        tempPath = dl.tempFilePath;
      }
      const up = await wx.cloud.uploadFile({
        cloudPath: `avatar/${cur._id}-${Date.now()}.jpg`,
        filePath: tempPath
      });
      app.globalData.pendingAvatar = { fileID: up.fileID, tempUrl: this.data.resultUrl, resumeId: cur._id };
      wx.hideLoading();
      wx.showToast({ title: '已设为简历头像', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      wx.hideLoading();
      console.error('[id-photo] 设置头像失败', e);
      wx.showToast({ title: e.message || '设置失败，请重试', icon: 'none' });
    }
  },

  // ---------- 保存到相册 ----------
  async onSave() {
    if (!this.data.resultUrl) {
      wx.showToast({ title: '请先上传照片', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...', mask: true });
    try {
      let finalPath;
      if (this._backend === 'v6') {
        // 本地高清合成，免费用户带水印
        finalPath = await this.compositeToFile(
          this.data.bgKey, this.data.sizeKey, SAVE_RATIO, !app.globalData.isVip, this._portraitPath
        );
      } else {
        const dl = await wx.downloadFile({ url: this.data.resultUrl });
        if (dl.statusCode !== 200) throw new Error('图片下载失败');
        finalPath = dl.tempFilePath;
        if (!app.globalData.isVip) {
          // legacy 云端成品无水印，免费用户本地补
          finalPath = await this.stampLegacyWatermark(finalPath);
        }
      }
      const mode = await saveImageOrPreview(finalPath);
      wx.hideLoading();
      wx.showToast({ title: mode === 'preview' ? '已生成，长按图片可保存' : '已保存到相册', icon: mode === 'preview' ? 'none' : 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('[id-photo] 保存失败', e);
      wx.showToast({ title: e.message || '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // legacy 成品图补水印（沿用当前选择尺寸画布）
  stampLegacyWatermark(path) {
    return this.compositeToFile(this.data.bgKey, this.data.sizeKey, SAVE_RATIO, true, path);
  },

  onUnload() {
    this._srcFileID = null;
    this._portraitFileID = null;
    this._legacyFileID = null;
    this._portraitPath = '';
  }
});
