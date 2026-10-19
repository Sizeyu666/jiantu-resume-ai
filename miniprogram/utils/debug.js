// utils/debug.js 本地调试开关
// true：完全脱离云开发运行（不写云库、不调云函数），数据只存 globalData + 本地缓存
// 配好云开发环境后改为 false 即可恢复正常链路
module.exports = {
  DEBUG_NO_CLOUD: false
};
