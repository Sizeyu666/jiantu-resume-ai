// pages/mine/mine.js 我的：会员 / 工具箱 / 最近编辑 / 隐私与数据
const app = getApp();
const aiLimit = require('../../utils/ai-limit');
const { formatRelative } = require('../../utils/util');
const { DEBUG_NO_CLOUD } = require('../../utils/debug');

Page({
  data: {
    isVip: false,
    resumeCount: 0,
    aiRemaining: 0,
    recent: []
  },

  onShow() {
    this.setData({
      isVip: !!app.globalData.isVip,
      aiRemaining: aiLimit.getRemainingCount()
    });
    this.loadRecent();
  },

  async loadRecent() {
    if (DEBUG_NO_CLOUD) {
      const list = app.globalData.localResumes || [];
      const recent = list.slice(0, 3).map((r) => ({
        _id: r._id,
        title: r.title || '未命名简历',
        updatedText: formatRelative(r.updatedAt || Date.now())
      }));
      this.setData({ resumeCount: list.length, recent });
      return;
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'resumeCRUD', data: { action: 'list' } });
      const list = res.result && res.result.data ? res.result.data : [];
      const recent = list.slice(0, 3).map((r) => ({
        _id: r._id,
        title: r.title || '未命名简历',
        updatedText: formatRelative(r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now())
      }));
      this.setData({ resumeCount: list.length, recent });
    } catch (e) {
      console.error('[mine] 加载数据失败', e);
    }
  },

  goVip() {
    wx.navigateTo({ url: '/pages/vip/vip' });
  },
  goJdMatch() {
    wx.navigateTo({ url: '/pages/jd-match/jd-match' });
  },
  goIdPhoto() {
    wx.navigateTo({ url: '/pages/id-photo/id-photo' });
  },
  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },
  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },
  goEdit(e) {
    wx.navigateTo({ url: `/pages/resume-edit/resume-edit?id=${e.currentTarget.dataset.id}` });
  },
  goResumeList() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // ---------- 一键删除我的全部数据 ----------
  onDeleteAll() {
    wx.showModal({
      title: '删除全部数据',
      content: '将永久删除你云端的全部简历（含所有板块内容），且不可恢复，确定继续吗？',
      confirmText: '全部删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '删除后无法找回，请确认已备份需要的内容',
          confirmText: '确认删除',
          confirmColor: '#ef4444',
          success: async (r2) => {
            if (!r2.confirm) return;
            if (DEBUG_NO_CLOUD) {
              app.globalData.localResumes = [];
              app.saveLocalResumes();
              app.globalData.currentResume = null;
              wx.showToast({ title: '已全部删除', icon: 'success' });
              this.loadRecent();
              return;
            }
            wx.showLoading({ title: '删除中...', mask: true });
            try {
              const res2 = await wx.cloud.callFunction({ name: 'resumeCRUD', data: { action: 'deleteAll' } });
              if (res2.result && res2.result.code !== 0) throw new Error(res2.result.message || '删除失败');
              wx.clearStorageSync(); // 清掉本地 AI 计数等缓存
              app.globalData.currentResume = null;
              wx.hideLoading();
              wx.showToast({ title: '已全部删除', icon: 'success' });
              this.loadRecent();
            } catch (e) {
              wx.hideLoading();
              wx.showToast({ title: e.message || '删除失败，请重试', icon: 'none' });
            }
          }
        });
      }
    });
  }
});
