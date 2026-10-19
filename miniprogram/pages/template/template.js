// pages/template/template.js 模板广场 V3：10 套全部免费 · 分类筛选 · 3 列真实缩略图
const app = getApp();
const { TEMPLATES, TEMPLATE_CATEGORIES } = require('../../utils/constants');
const { buildSampleResume } = require('../../utils/sampleData');
const { createEmptyResume, uid } = require('../../utils/util');
const config = require('../../utils/config');
const { DEBUG_NO_CLOUD } = require('../../utils/debug');

Page({
  data: {
    cats: [{ key: 'all', name: '全部' }].concat(TEMPLATE_CATEGORIES),
    activeCat: 'all',
    list: [],
    totalCount: TEMPLATES.length
  },

  onLoad() {
    // 卡片缩略图统一用示例数据渲染，用户直观对比 10 套模板差异
    const sample = buildSampleResume();
    const all = TEMPLATES.map((t) => ({
      ...t,
      demoResume: { ...sample, templateId: t.id, themeColor: t.defaultColor }
    }));
    this._all = all;
    this.setData({ list: all });
  },

  // ---------- 顶部分类筛选 ----------
  onFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeCat) return;
    const list = key === 'all' ? this._all : this._all.filter((t) => t.category === key);
    this.setData({ activeCat: key, list });
  },

  onTapCard(e) {
    const id = e.currentTarget.dataset.id;
    const tpl = this.data.list.find((t) => t.id === id);
    if (!tpl) return;

    // V3：模板全部免费，确认后直接用此模板新建
    wx.showModal({
      title: `使用「${tpl.name}」`,
      content: '将用此模板新建一份空白简历，也可以在已有简历的预览页切换模板',
      confirmText: '新建简历',
      confirmColor: '#1e3a5f',
      success: (res) => {
        if (res.confirm) this.createWithTemplate(tpl);
      }
    });
  },

  async createWithTemplate(tpl) {
    // 免费份数校验
    let count = 0;
    if (DEBUG_NO_CLOUD) {
      count = (app.globalData.localResumes || []).length;
    } else {
      try {
        const res = await wx.cloud.callFunction({ name: 'resumeCRUD', data: { action: 'list' } });
        count = ((res.result && res.result.data) || []).length;
      } catch (e) {
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
        return;
      }
    }
    if (!app.globalData.isVip && count >= config.MAX_RESUMES_FREE) {
      wx.showModal({
        title: '份数已达上限',
        content: `免费版最多${config.MAX_RESUMES_FREE}份简历，开通会员解锁无限份，新用户低至 1 元体验`,
        confirmText: '去开通',
        confirmColor: '#1e3a5f',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/vip/vip?plan=trial' });
        }
      });
      return;
    }

    const resume = createEmptyResume();
    resume.templateId = tpl.id;
    resume.themeColor = tpl.defaultColor;

    if (DEBUG_NO_CLOUD) {
      const id = 'local_' + uid();
      const doc = { ...resume, _id: id, updatedAt: Date.now() };
      app.globalData.localResumes = [doc, ...(app.globalData.localResumes || [])];
      app.saveLocalResumes();
      app.globalData.currentResume = doc;
      wx.navigateTo({ url: `/pages/resume-edit/resume-edit?id=${id}` });
      return;
    }
    wx.showLoading({ title: '正在创建...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'resumeCRUD',
        data: { action: 'create', data: { resume } }
      });
      wx.hideLoading();
      if (!res.result || res.result.code !== 0) throw new Error((res.result && res.result.message) || '创建失败');
      wx.navigateTo({ url: `/pages/resume-edit/resume-edit?id=${res.result.data.id}` });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '创建失败，请重试', icon: 'none' });
    }
  }
});
