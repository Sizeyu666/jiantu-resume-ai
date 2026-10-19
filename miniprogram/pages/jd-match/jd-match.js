// pages/jd-match/jd-match.js
// JD 匹配分析 + 简历体检：免费用户各可体验 1 次，之后引导开通会员（新用户 1 元体验）
// 结果只来自 aiCall 云函数，前端不做任何本地推断/重算
const app = getApp();
const { AI_DISCLAIMER } = require('../../utils/constants');
const aiLimit = require('../../utils/ai-limit');
const { DEBUG_NO_CLOUD } = require('../../utils/debug');

const LEVEL_TEXT = { red: '必须修改', yellow: '建议优化', green: '已达标' };

Page({
  data: {
    isVip: false,
    jdRemain: 0, // JD 匹配免费剩余次数
    checkRemain: 0, // 简历体检免费剩余次数
    tab: 'jd', // jd | check
    resumeList: [],
    selectedId: '',
    selectedTitle: '',
    jdText: '',
    loading: false,
    // JD 匹配结果
    match: null,
    scoreColor: '',
    // 体检结果
    checkItems: [],
    disclaimer: AI_DISCLAIMER
  },

  onLoad() {
    this.setData({ isVip: !!app.globalData.isVip });
    this.refreshTrial();
    // 免费用户也要能体验 1 次，简历列表对所有人加载
    this.loadResumes();
  },

  onShow() {
    const vip = !!app.globalData.isVip;
    if (vip !== this.data.isVip) this.setData({ isVip: vip });
    this.refreshTrial();
  },

  // 刷新免费体验剩余次数
  refreshTrial() {
    this.setData({
      jdRemain: aiLimit.getTrialRemaining('jdMatch'),
      checkRemain: aiLimit.getTrialRemaining('check')
    });
  },

  // 调用前权限校验：免费体验次数用完时弹出开通引导
  // 返回 true 表示可以继续调用
  guardTrial(action) {
    const check = aiLimit.checkAction(action);
    if (check.allowed) return true;
    if (check.reason === 'member_only') {
      const name = action === 'jdMatch' ? 'JD 匹配' : '简历体检';
      wx.showModal({
        title: '免费体验已用完',
        content: `${name}免费可体验 1 次。开通会员即可不限次使用，新用户 1 元即可体验 1 天`,
        confirmText: '1 元开通',
        confirmColor: '#1e3a5f',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/vip/vip?plan=trial' });
        }
      });
    }
    return false;
  },

  // ---------- 简历选择（唯一数据来源：resumeCRUD list） ----------
  async loadResumes() {
    if (DEBUG_NO_CLOUD) {
      const list = app.globalData.localResumes || [];
      if (!list.length) {
        this.setData({ resumeList: [], selectedId: '', selectedTitle: '' });
        return;
      }
      this.setData({
        resumeList: list,
        selectedId: this.data.selectedId || list[0]._id,
        selectedTitle: this.data.selectedTitle || list[0].title
      });
      return;
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'resumeCRUD', data: { action: 'list' } });
      const list = (res.result && res.result.data) || [];
      if (!list.length) {
        this.setData({ resumeList: [], selectedId: '', selectedTitle: '' });
        return;
      }
      this.setData({
        resumeList: list,
        selectedId: this.data.selectedId || list[0]._id,
        selectedTitle: this.data.selectedTitle || list[0].title
      });
    } catch (e) {
      console.error('[jd-match] 简历列表加载失败', e);
    }
  },

  onPickResume() {
    if (!this.data.resumeList.length) {
      wx.showToast({ title: '请先创建一份简历', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: this.data.resumeList.map((r) => r.title || '未命名简历'),
      success: (res) => {
        const r = this.data.resumeList[res.tapIndex];
        this.setData({ selectedId: r._id, selectedTitle: r.title });
      }
    });
  },

  onSwitchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  onJdInput(e) {
    this.setData({ jdText: e.detail.value });
  },

  getSelectedResume() {
    return this.data.resumeList.find((r) => r._id === this.data.selectedId) || null;
  },

  // ---------- JD 匹配 ----------
  async onRunMatch() {
    if (DEBUG_NO_CLOUD) {
      wx.showToast({ title: 'JD 匹配需配置云开发后使用', icon: 'none' });
      return;
    }
    const jdText = (this.data.jdText || '').trim();
    const resume = this.getSelectedResume();
    if (!resume) return wx.showToast({ title: '请先选择一份简历', icon: 'none' });
    if (jdText.length < 20) return wx.showToast({ title: '请粘贴完整的 JD 内容（至少 20 字）', icon: 'none' });
    if (!this.guardTrial('jdMatch')) return;

    this.setData({ loading: true, match: null });
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiCall',
        data: { action: 'jdMatch', data: { resume, jdText } }
      });
      const r = res.result || {};
      if (r.code !== 0) throw new Error(r.message || '分析失败，请重试');

      // 仅做视图字段派生（色值/圆点），业务数据完全采用云函数返回
      const result = r.data.result || {};
      const score = Number(result.matchScore) || 0;
      result.requiredSkills = (result.requiredSkills || []).map((s) => ({
        ...s,
        confidence: Number(s.confidence) || 0,
        dots: [1, 2, 3, 4, 5].map((n) => n <= (Number(s.confidence) || 0))
      }));
      result.bonusSkills = result.bonusSkills || [];
      result.missingKeywords = result.missingKeywords || [];
      result.atsWarnings = result.atsWarnings || [];

      this.setData({
        loading: false,
        match: result,
        scoreColor: score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
      });
      // 分析成功后扣减免费体验次数
      aiLimit.markActionUsed('jdMatch');
      this.refreshTrial();
      setTimeout(() => this.drawRing(score), 60);
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '分析失败，请重试', icon: 'none' });
    }
  },

  // canvas 2d 绘制分数圆环
  drawRing(score) {
    const query = this.createSelectorQuery();
    query.select('#scoreRing').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
      const w = res[0].width;
      const h = res[0].height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) / 2 - 8;
      const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

      // 底环
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 10;
      ctx.stroke();

      // 分数环（从正上方起顺时针）
      ctx.beginPath();
      ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (score / 100));
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  },

  // ---------- 简历体检 ----------
  async onRunCheck() {
    if (DEBUG_NO_CLOUD) {
      wx.showToast({ title: '简历体检需配置云开发后使用', icon: 'none' });
      return;
    }
    const resume = this.getSelectedResume();
    if (!resume) return wx.showToast({ title: '请先选择一份简历', icon: 'none' });
    if (!this.guardTrial('check')) return;

    this.setData({ loading: true, checkItems: [] });
    try {
      const res = await wx.cloud.callFunction({
        name: 'aiCall',
        data: { action: 'check', data: { resume } }
      });
      const r = res.result || {};
      if (r.code !== 0) throw new Error(r.message || '体检失败，请重试');

      // 结果完全采用云函数返回，仅补展示文案；云函数已按 red → green 排序
      const items = ((r.data.result && r.data.result.items) || []).map((it) => ({
        ...it,
        levelText: LEVEL_TEXT[it.level] || '建议优化',
        suggestions: it.suggestions || []
      }));
      this.setData({ loading: false, checkItems: items });
      // 体检成功后扣减免费体验次数
      aiLimit.markActionUsed('check');
      this.refreshTrial();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '体检失败，请重试', icon: 'none' });
    }
  },

  goVip() {
    wx.navigateTo({ url: '/pages/vip/vip?plan=trial' });
  },

  goCreate() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
