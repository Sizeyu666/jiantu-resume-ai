// pages/feedback/feedback.js 问题反馈
const { DEBUG_NO_CLOUD } = require('../../utils/debug');

Page({
  data: {
    content: '',
    contact: '',
    submitting: false,
    leftLen: 1000
  },

  onContentInput(e) {
    const value = e.detail.value || '';
    this.setData({ content: value, leftLen: Math.max(0, 1000 - value.length) });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value || '' });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const content = (this.data.content || '').trim();
    if (content.length < 5) {
      wx.showToast({ title: '请至少填写 5 个字的反馈内容', icon: 'none' });
      return;
    }
    if (DEBUG_NO_CLOUD) {
      wx.showToast({ title: '反馈功能需配置云开发后使用', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: '正在提交...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'feedback',
        data: {
          action: 'submit',
          data: { content, contact: (this.data.contact || '').trim() }
        }
      });
      wx.hideLoading();
      const r = res.result || {};
      if (r.code !== 0) throw new Error(r.message || '提交失败，请稍后重试');
      wx.showToast({ title: '感谢反馈，我们会尽快处理', icon: 'none' });
      this.setData({ submitting: false, content: '', contact: '', leftLen: 1000 });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || '提交失败，请稍后重试', icon: 'none' });
    }
  }
});
