// components/ai-polish-modal/ai-polish-modal.js
// AI 润色弹窗：polish（单段润色）/ summary（自我评价生成）
// 布局：上灰底"原文"（只读）→ 下白底"AI改写后"（可编辑）；底部【重新生成】【复制】【采纳】
// 事件：adopt{text} 采纳并关闭 / close 关闭
const aiLimit = require('../../utils/ai-limit');
const { AI_DISCLAIMER } = require('../../utils/constants');

Component({
  properties: {
    show: { type: Boolean, value: false },
    originalText: { type: String, value: '' },
    actionType: { type: String, value: 'polish' }, // polish | summary
    resume: { type: Object, value: null }
  },

  data: {
    visible: false,
    loading: false,
    errorMsg: '',
    resultText: '',
    remaining: 0,
    disclaimer: AI_DISCLAIMER
  },

  observers: {
    show(show) {
      if (show) {
        this.setData({
          visible: true,
          resultText: '',
          errorMsg: '',
          remaining: aiLimit.getRemainingCount()
        });
        this.startGenerate();
      } else {
        this.setData({ visible: false });
      }
    }
  },

  methods: {
    // 发起一次 AI 生成（含额度 / 权限校验）
    startGenerate() {
      const action = this.data.actionType;

      // 权限校验：polish / summary 共用每日免费额度，会员不限次
      const check = aiLimit.checkAction(action);
      if (!check.allowed) {
        this.setData({
          loading: false,
          errorMsg:
            check.reason === 'member_only'
              ? '该功能为会员专属，开通会员后使用'
              : '今日免费 AI 次数已用完，开通会员不限次数'
        });
        return;
      }

      this.setData({ loading: true, errorMsg: '' });

      const payload = action === 'summary' ? { resume: this.data.resume } : { text: this.data.originalText };
      wx.cloud.callFunction({
        name: 'aiCall',
        data: { action, data: payload },
        success: (res) => {
          const r = res.result || {};
          if (r.code === 0 && r.data && typeof r.data.result === 'string') {
            // 生成成功后才扣减免费次数
            aiLimit.markActionUsed(action);
            this.setData({
              loading: false,
              resultText: r.data.result,
              remaining: aiLimit.getRemainingCount()
            });
          } else {
            this.setData({ loading: false, errorMsg: r.message || '生成失败，请重试' });
          }
        },
        fail: (e) => {
          console.error('[ai-polish-modal] aiCall 调用失败', e);
          this.setData({ loading: false, errorMsg: '生成失败，请重试' });
        }
      });
    },

    onRegenerate() {
      if (this.data.loading) return;
      this.startGenerate();
    },

    onResultInput(e) {
      this.setData({ resultText: e.detail.value });
    },

    onCopy() {
      if (!this.data.resultText) return;
      wx.setClipboardData({
        data: this.data.resultText,
        success: () => wx.showToast({ title: '已复制', icon: 'success' })
      });
    },

    onAdopt() {
      if (this.data.loading || !this.data.resultText) return;
      this.triggerEvent('adopt', { text: this.data.resultText });
      this.onClose();
    },

    onClose() {
      this.triggerEvent('close');
    },

    // 无额度时引导开通会员（新用户 1 元体验）
    onVipHint() {
      wx.showModal({
        title: '开通会员',
        content: '开通会员 AI 润色不限次数，新用户 1 元即可体验 1 天',
        confirmText: '1 元开通',
        confirmColor: '#1e3a5f',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/vip/vip?plan=trial' });
        }
      });
    },

    noop() {}
  }
});
