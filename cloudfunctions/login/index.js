// cloudfunctions/login/index.js
// 获取 openid + 会员状态；首次登录在 users 集合建档
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  let isVip = false;
  try {
    const res = await db.collection('users').where({ _openid: OPENID }).limit(1).get();
    if (res.data.length > 0) {
      isVip = !!res.data[0].isVip;
    } else {
      await db.collection('users').add({
        data: { _openid: OPENID, isVip: false, createdAt: db.serverDate() }
      });
    }
  } catch (e) {
    console.error('[login] users 集合读写失败', e);
  }
  return { openid: OPENID, isVip };
};
