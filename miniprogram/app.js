// app.js 简途简历AI版
// 全局状态：openid / 会员状态 / 当前编辑简历 / 环境配置
const { DEBUG_NO_CLOUD } = require('./utils/debug');

// 合并新拆分 API 的系统信息（getSystemInfoSync 已废弃），旧基础库自动回退
// 页面当前只用到 statusBarHeight，这里仍合并 device/appBase 保持字段完整
function getSysInfoSafe() {
  try {
    if (wx.getWindowInfo) {
      const win = wx.getWindowInfo() || {};
      const dev = wx.getDeviceInfo ? wx.getDeviceInfo() : {};
      const appBase = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {};
      return { ...win, ...dev, ...appBase };
    }
    return wx.getSystemInfoSync();
  } catch (e) {
    console.error('[app] 获取系统信息失败', e);
    return { statusBarHeight: 20, pixelRatio: 2 };
  }
}

App({
  globalData: {
    envId: 'your-cloud-env-id', // TODO: 部署时替换为你自己的微信云开发环境 ID（云开发控制台获取）
    openid: '',
    isVip: false,
    currentResume: null, // 当前编辑中的简历对象（编辑器实时读写）
    localResumes: [], // DEBUG_NO_CLOUD 模式下的本地简历列表
    sysInfo: null
  },

  onLaunch() {
    // 支付接入前的演示会员状态（vip 页演示开关写入，正式上线移除该逻辑）
    if (wx.getStorageSync('mock_vip')) {
      this.globalData.isVip = true;
    }

    if (DEBUG_NO_CLOUD) {
      console.warn('[debug] DEBUG_NO_CLOUD=true，已跳过云初始化，所有数据仅存本地');
      this.globalData.sysInfo = getSysInfoSafe();
      this.globalData.openid = 'debug-openid';
      try {
        this.globalData.localResumes = wx.getStorageSync('debug_resumes') || [];
      } catch (e) {
        this.globalData.localResumes = [];
      }
      return;
    }

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    // 任何一步初始化失败都不能阻断小程序启动（否则整包白屏）
    try {
      wx.cloud.init({
        env: this.globalData.envId,
        traceUser: true
      });
      console.log('[app] cloud.init 成功', this.globalData.envId);
    } catch (e) {
      console.error('[app] cloud.init 失败（不阻断启动，页面将走空数据兜底）', e);
    }
    try {
      this.globalData.sysInfo = getSysInfoSafe();
    } catch (e) {
      console.error('[app] 系统信息获取失败', e);
      this.globalData.sysInfo = {};
    }
    this.login();
  },

  // DEBUG_NO_CLOUD：本地简历列表持久化到缓存
  saveLocalResumes() {
    if (!DEBUG_NO_CLOUD) return;
    try {
      wx.setStorageSync('debug_resumes', this.globalData.localResumes);
    } catch (e) {
      console.error('[debug] 本地简历列表保存失败', e);
    }
  },

  // 获取 openid 并拉取会员状态
  login() {
    wx.cloud.callFunction({
      name: 'login',
      success: (res) => {
        const { openid, isVip } = res.result || {};
        this.globalData.openid = openid || '';
        // 本地演示会员优先；正式环境以云端 isVip 为准（上线时移除 mock_vip 逻辑）
        if (!wx.getStorageSync('mock_vip')) {
          this.globalData.isVip = !!isVip;
        }
        if (this.loginReadyCallback) {
          this.loginReadyCallback(this.globalData.openid);
        }
      },
      fail: (err) => {
        console.error('[login] 调用失败', err);
      }
    });
  }
});
