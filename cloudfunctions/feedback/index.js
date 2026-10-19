// cloudfunctions/feedback/index.js 问题反馈
// 集合 feedbacks：{ _openid, content, contact, createdAt }
// 管理员在云开发控制台 → 数据库 → feedbacks 查看
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action, data = {} } = event;
  try {
    if (action !== 'submit') return { code: 400, message: '未知 action: ' + action };
    const content = String(data.content || '').trim();
    if (content.length < 5) return { code: 400, message: '请至少填写 5 个字的反馈内容' };
    if (content.length > 1000) return { code: 400, message: '反馈内容请控制在 1000 字以内' };
    await db.collection('feedbacks').add({
      data: {
        content,
        contact: String(data.contact || '').slice(0, 100),
        _openid: OPENID,
        createdAt: db.serverDate()
      }
    });
    return { code: 0 };
  } catch (e) {
    console.error('[feedback]', e);
    return { code: 500, message: /collection/i.test(e.message || '') ? '反馈系统未初始化，请联系管理员' : '提交失败，请稍后重试' };
  }
};
