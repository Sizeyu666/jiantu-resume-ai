// utils/ai-limit.js AI 调用次数与功能权限 V2
// MVP：本地缓存计数；后续迁移云数据库计数 / 接入虚拟支付：只改本文件，业务代码不动
//
// 权限规则（config.AI_ACTION_PERMISSION）：
//   polish / summary → 免费用户每天 15 次（共用），会员不限
//   jdMatch          → 免费用户累计体验 1 次，之后要会员
//   check            → 免费用户累计体验 1 次，之后要会员
//   证件照 idPhoto   → 免费用户每天 3 次（独立计数）
const config = require('./config');

const KEY_PREFIX = 'ai_polish_used_'; // 每日润色
const JD_KEY = 'ai_jd_match_used'; // JD 匹配累计体验次数
const CHECK_KEY = 'ai_resume_check_used'; // 简历体检累计体验次数
const ID_PHOTO_PREFIX = 'id_photo_used_'; // 证件照每日次数

function dateStr(date) {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// TODO: 接入微信虚拟支付后，改为读取 globalData.isVip / 云数据库会员状态
function isMember() {
  return !!getApp().globalData.isVip;
}

// ---------- 润色 / 自我评价（每日） ----------
function getRemainingCount(date) {
  if (isMember()) return config.MEMBER_AI_COUNT;
  const used = wx.getStorageSync(KEY_PREFIX + dateStr(date)) || 0;
  return Math.max(0, config.AI_POLISH_DAILY_FREE - used);
}

function deductCount(date) {
  if (isMember()) return config.MEMBER_AI_COUNT;
  const key = KEY_PREFIX + dateStr(date);
  const used = (wx.getStorageSync(key) || 0) + 1;
  wx.setStorageSync(key, used);
  return Math.max(0, config.AI_POLISH_DAILY_FREE - used);
}

// ---------- JD 匹配 / 简历体检（累计体验次数） ----------
function getTrialUsed(action) {
  return wx.getStorageSync(action === 'jdMatch' ? JD_KEY : CHECK_KEY) || 0;
}
function getTrialRemaining(action) {
  if (isMember()) return config.MEMBER_AI_COUNT;
  const total = action === 'jdMatch' ? config.JD_MATCH_FREE_COUNT : config.RESUME_CHECK_FREE_COUNT;
  return Math.max(0, total - getTrialUsed(action));
}
function markTrialUsed(action) {
  if (isMember()) return;
  const key = action === 'jdMatch' ? JD_KEY : CHECK_KEY;
  wx.setStorageSync(key, getTrialUsed(action) + 1);
}

// ---------- AI 证件照（每日 3 次） ----------
function getIdPhotoRemaining() {
  if (isMember()) return config.MEMBER_AI_COUNT;
  const used = wx.getStorageSync(ID_PHOTO_PREFIX + dateStr()) || 0;
  return Math.max(0, config.ID_PHOTO_DAILY_FREE - used);
}
function markIdPhotoUsed() {
  if (isMember()) return config.MEMBER_AI_COUNT;
  const key = ID_PHOTO_PREFIX + dateStr();
  const used = (wx.getStorageSync(key) || 0) + 1;
  wx.setStorageSync(key, used);
  return Math.max(0, config.ID_PHOTO_DAILY_FREE - used);
}

// ---------- 统一入口 ----------
// 返回 { allowed, reason, remaining }
//   reason = 'member_only' 免费体验次数已用完，引导开通会员
//   reason = 'no_quota'    今日免费次数已用完
//   reason = ''            可用
function checkAction(action) {
  const perm = (config.AI_ACTION_PERMISSION || {})[action] || 'shared';
  if (perm === 'trial') {
    if (isMember()) return { allowed: true, reason: '', remaining: config.MEMBER_AI_COUNT };
    const remaining = getTrialRemaining(action);
    if (remaining <= 0) return { allowed: false, reason: 'member_only', remaining: 0 };
    return { allowed: true, reason: '', remaining };
  }
  if (getRemainingCount() <= 0) {
    return { allowed: false, reason: 'no_quota', remaining: 0 };
  }
  return { allowed: true, reason: '', remaining: getRemainingCount() };
}

// 调用成功后扣次
function markActionUsed(action) {
  const perm = (config.AI_ACTION_PERMISSION || {})[action] || 'shared';
  if (perm === 'trial') return markTrialUsed(action);
  return deductCount();
}

module.exports = {
  getRemainingCount,
  deductCount,
  isMember,
  checkAction,
  markActionUsed,
  getTrialRemaining,
  getIdPhotoRemaining,
  markIdPhotoUsed
};
