// cloudfunctions/resumeCRUD/index.js
// 简历增删改查：list | get | create | update | remove | copy | deleteAll
// 安全：云函数以管理员权限运行，所有操作强制校验 _openid 归属
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTION = 'resumes';
const MAX_RESUMES_FREE = 5; // 与前端 utils/config.js 保持一致 V2
const DEFAULT_SECTION_ORDER = ['education', 'experience', 'projects', 'campus', 'skills', 'certificates', 'summary'];

// 字段白名单，防止前端传入多余字段
function sanitizeResume(r = {}) {
  return {
    title: String(r.title || '未命名简历').slice(0, 30),
    templateId: String(r.templateId || 'generic'),
    themeColor: String(r.themeColor || '#333333'),
    sectionOrder: Array.isArray(r.sectionOrder) ? r.sectionOrder : [...DEFAULT_SECTION_ORDER],
    sectionTitles: r.sectionTitles && typeof r.sectionTitles === 'object' ? r.sectionTitles : {},
    fontSize: ['small', 'medium', 'large'].indexOf(r.fontSize) >= 0 ? r.fontSize : 'medium',
    spacing: ['compact', 'normal', 'loose'].indexOf(r.spacing) >= 0 ? r.spacing : 'normal',
    basics: r.basics && typeof r.basics === 'object' ? r.basics : {},
    education: Array.isArray(r.education) ? r.education : [],
    experience: Array.isArray(r.experience) ? r.experience : [],
    projects: Array.isArray(r.projects) ? r.projects : [],
    campus: Array.isArray(r.campus) ? r.campus : [],
    skills: Array.isArray(r.skills) ? r.skills : [],
    certificates: Array.isArray(r.certificates) ? r.certificates : [],
    // V2 新增板块
    work: Array.isArray(r.work) ? r.work : [],
    awards: Array.isArray(r.awards) ? r.awards : [],
    languages: Array.isArray(r.languages) ? r.languages : [],
    customSections: Array.isArray(r.customSections) ? r.customSections : [],
    summary: String(r.summary || '')
  };
}

async function getIsVip(openid) {
  try {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
    return res.data.length > 0 && !!res.data[0].isVip;
  } catch (e) {
    return false;
  }
}

async function assertOwner(openid, id) {
  const res = await db.collection(COLLECTION).doc(id).get().catch(() => ({ data: null }));
  if (!res.data || res.data._openid !== openid) {
    const err = new Error('无权操作该简历');
    err.code = 403;
    throw err;
  }
  return res.data;
}

// 免费用户简历数量上限校验
async function assertCanCreate(openid) {
  const isVip = await getIsVip(openid);
  if (isVip) return;
  const countRes = await db.collection(COLLECTION).where({ _openid: openid }).count();
  if (countRes.total >= MAX_RESUMES_FREE) {
    const err = new Error(`免费用户最多创建 ${MAX_RESUMES_FREE} 份简历，开通会员不限数量`);
    err.code = 'FREE_LIMIT';
    throw err;
  }
}

const mainHandler = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { action, data = {} } = event;
  console.log('[resumeCRUD] 收到 action =', action);
  try {
    switch (action) {
      case 'list': {
        const res = await db.collection(COLLECTION)
          .where({ _openid: OPENID })
          .orderBy('updatedAt', 'desc')
          .limit(50)
          .get();
        return { code: 0, data: res.data };
      }

      case 'get': {
        const doc = await assertOwner(OPENID, data.id);
        return { code: 0, data: doc };
      }

      case 'create': {
        await assertCanCreate(OPENID);
        const resume = sanitizeResume(data.resume);
        const res = await db.collection(COLLECTION).add({
          data: {
            ...resume,
            _openid: OPENID,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
        return { code: 0, data: { id: res._id } };
      }

      case 'update': {
        await assertOwner(OPENID, data.id);
        const resume = sanitizeResume(data.resume);
        await db.collection(COLLECTION).doc(data.id).update({
          data: { ...resume, updatedAt: db.serverDate() }
        });
        return { code: 0 };
      }

      case 'remove': {
        await assertOwner(OPENID, data.id);
        await db.collection(COLLECTION).doc(data.id).remove();
        return { code: 0 };
      }

      case 'copy': {
        const source = await assertOwner(OPENID, data.id);
        await assertCanCreate(OPENID);
        const resume = sanitizeResume(source);
        resume.title = (resume.title + ' 副本').slice(0, 30);
        const res = await db.collection(COLLECTION).add({
          data: {
            ...resume,
            _openid: OPENID,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });
        return { code: 0, data: { id: res._id } };
      }

      case 'deleteAll': {
        // 一键删除我的所有简历数据（隐私合规入口，蓝本 1.1）
        const list = await db.collection(COLLECTION).where({ _openid: OPENID }).limit(100).get();
        await Promise.all(list.data.map((item) => db.collection(COLLECTION).doc(item._id).remove()));
        return { code: 0, data: { deleted: list.data.length } };
      }

      default:
        return { code: 400, message: '未知 action: ' + action };
    }
  } catch (e) {
    console.error('[resumeCRUD]', action, e);
    return { code: e.code === 403 || e.code === 'FREE_LIMIT' ? 403 : 500, reason: e.code || '', message: e.message || '服务异常' };
  }
};

// ---------- 统一出口：兼容旧 code 契约 + 新 success/error 结构，兜底所有未捕获异常 ----------
exports.main = async (event = {}) => {
  let result;
  try {
    result = await mainHandler(event);
  } catch (e) {
    console.error('[resumeCRUD] 未捕获异常', e);
    result = { code: 500, message: e.message || '服务异常' };
  }
  result.success = result.code === 0;
  if (!result.success) result.error = result.error || result.message || '服务异常';
  return result;
};
