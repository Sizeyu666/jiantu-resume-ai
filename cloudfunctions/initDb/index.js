// cloudfunctions/initDb/index.js
// 数据库一次性初始化脚本：在云控制台"云函数 → initDb → 云端测试"手动运行一次即可
//
// ================= 集合 schema 说明（蓝本第五节，勿自行加业务字段） =================
//
// 集合 resumes（权限建议：仅创建者可读写）
// {
//   _openid: string          微信 openid（add 时自动写入）
//   title: string            简历标题，如"投实习简历"
//   createdAt / updatedAt: Date
//   templateId: string       generic | business | tech | minimal
//   themeColor: string       主题色 hex，如 #1e3a5f
//   sectionOrder: string[]   板块排序（basics 固定最前，不入数组）
//   basics: { name, phone, email, city, jobIntent, github, blog, wechat }
//   education: [{ school, degree, major, start, end, gpa, courses, highlights[] }]
//   experience: [{ company, role, city, start, end, bullets[] }]
//   projects: [{ name, role, start, end, techStack[], bullets[] }]
//   campus: [{ org, role, start, end, bullets[] }]
//   skills: [{ category, items[] }]
//   certificates: [{ name, issuer, date }]
//   summary: string          自我评价
// }
//
// 集合 users（权限建议：仅创建者可读写）
// {
//   _openid: string
//   isVip: boolean           会员状态（接入微信虚拟支付后由支付回调更新）
//   createdAt: Date
// }
//
// ============================================================================
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const results = {};
  for (const name of ['resumes', 'users', 'feedbacks']) {
    try {
      await db.createCollection(name);
      results[name] = 'created';
    } catch (e) {
      results[name] = /exist/i.test(e.message || '') ? 'already exists' : 'error: ' + e.message;
    }
  }
  return { code: 0, data: results };
};
