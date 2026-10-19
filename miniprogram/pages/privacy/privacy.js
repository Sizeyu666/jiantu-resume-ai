// pages/privacy/privacy.js 隐私协议：数据仅存微信云开发 / AI 处理说明 / 一键删除
const app = getApp();

Page({
  data: {
    updatedAt: '2026-09-25'
  },

  // 一键删除（与"我的"页同一云函数 deleteAll，二次强确认）
  onDeleteAll() {
    wx.showModal({
      title: '删除全部数据',
      content: '将永久删除你云端的全部简历（含所有板块内容），且不可恢复，确定继续吗？',
      confirmText: '全部删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...', mask: true });
        wx.cloud
          .callFunction({ name: 'resumeCRUD', data: { action: 'deleteAll' } })
          .then((res2) => {
            if (res2.result && res2.result.code !== 0) throw new Error(res2.result.message || '删除失败');
            wx.clearStorageSync();
            app.globalData.currentResume = null;
            wx.hideLoading();
            wx.showToast({ title: '已全部删除', icon: 'success' });
          })
          .catch((e) => {
            wx.hideLoading();
            wx.showToast({ title: e.message || '删除失败，请重试', icon: 'none' });
          });
      }
    });
  }
});
