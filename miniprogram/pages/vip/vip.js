// pages/vip/vip.js 会员中心（权益展示 + 4 档套餐；虚拟支付接入前提供演示开关）V3
const app = getApp();
const { PRICING, VIP_BENEFITS } = require('../../utils/config');

// 套餐顺序与展示文案
const PLAN_META = [
  { key: 'trial', name: '体验会员', desc: '1 天，新用户专享', tag: '1 元体验' },
  { key: 'threeDay', name: '3 天会员', desc: '短期冲刺使用' },
  { key: 'monthly', name: '月度会员', desc: '30 天，灵活开通' },
  { key: 'lifetime', name: '永久会员', desc: '一次开通，永久使用', recommend: true }
];

// V3：10 套模板已全部免费，会员权益集中维护在 utils/config.js
const BENEFITS = VIP_BENEFITS;

function buildPlans() {
  return PLAN_META.map((p) => {
    const priceInfo = PRICING[p.key] || {};
    return {
      key: p.key,
      name: p.name,
      desc: p.desc,
      tag: p.tag || '',
      recommend: !!p.recommend,
      price: priceInfo.price,
      days: priceInfo.days
    };
  });
}

Page({
  data: {
    isVip: false,
    plans: buildPlans(),
    benefits: BENEFITS,
    selectedPlan: 'threeDay'
  },

  onLoad(options) {
    // 支持从拦截弹窗带 plan 参数定位套餐，如 vip?plan=trial
    if (options && options.plan && PRICING[options.plan]) {
      this.setData({ selectedPlan: options.plan });
    }
  },

  onShow() {
    this.setData({ isVip: !!app.globalData.isVip });
  },

  onSelectPlan(e) {
    this.setData({ selectedPlan: e.currentTarget.dataset.key });
  },

  // 虚拟支付接入点：后续替换为 wx.requestVirtualPayment / 微信支付下单云函数
  onSubscribe() {
    if (this.data.isVip) return;
    const plan = this.data.plans.find((p) => p.key === this.data.selectedPlan);
    // TODO 接入支付：调用支付云函数下单 → wx.requestVirtualPayment → 支付成功后写入 users.isVip / 会员到期时间
    wx.showModal({
      title: '支付功能即将上线',
      content: `你选择的是「${plan.name}」¥${plan.price}。会员体系正在接入微信支付，上线后可在此开通。开发期间可使用页面底部的“演示开通”体验全部会员功能`,
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  // 仅用于支付接入前的功能演示与验收，上线前移除
  onMockActivate() {
    if (this.data.isVip) {
      wx.showModal({
        title: '关闭演示会员？',
        content: '关闭后将恢复免费版状态（仅演示环境用）',
        success: (res) => {
          if (res.confirm) {
            wx.removeStorageSync('mock_vip');
            app.globalData.isVip = false;
            this.setData({ isVip: false });
          }
        }
      });
      return;
    }
    wx.setStorageSync('mock_vip', true);
    app.globalData.isVip = true;
    this.setData({ isVip: true });
    wx.showToast({ title: '演示会员已开通', icon: 'success' });
  }
});
