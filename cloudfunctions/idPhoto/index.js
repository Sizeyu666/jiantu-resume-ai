// cloudfunctions/idPhoto/index.js V6（基于真实日志精准修复）
// 职责单一化：云存储原图 → 腾讯云「人体分析 bda」SegmentPortraitPic → 上传透明前景 PNG → 返回 fileID
// 注意：
//   1) SDK 必须是 tencentcloud.bda.v20200324（不是 portrait.v20201204，也不是 iai），
//      否则报 InvalidAction ... service='portrait' version='2020-12-04'
//   2) endpoint 必须是 bda.tencentcloudapi.com
//   3) 入参只传 Image(base64)，不传 Scene / Url
//   4) 换底色、尺寸裁剪全部移到前端 canvas 完成（云函数返回的是透明背景人像 PNG）
// 环境变量：TENCENT_SECRET_ID / TENCENT_SECRET_KEY；超时 60s；依赖 tencentcloud-sdk-nodejs
const cloud = require('wx-server-sdk');
const tencentcloud = require('tencentcloud-sdk-nodejs');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const BdaClient = tencentcloud.bda.v20200324.Client;
const client = new BdaClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY
  },
  region: 'ap-guangzhou',
  profile: {
    httpProfile: {
      endpoint: 'bda.tencentcloudapi.com',
      reqTimeout: 50
    }
  }
});

exports.main = async (event = {}) => {
  const t0 = Date.now();
  // 兼容扁平入参与旧版 {action, data:{fileID}} 包裹
  const fileID = event.fileID || (event.data && event.data.fileID);
  try {
    console.log('[idPhoto] 收到', { hasFileID: !!fileID });
    if (!fileID) return { success: false, error: '缺少照片 fileID', code: 400, message: '缺少照片 fileID' };
    if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
      return { success: false, error: '云函数未配置腾讯云密钥（TENCENT_SECRET_ID / TENCENT_SECRET_KEY）', code: 500, message: '云函数未配置腾讯云密钥' };
    }

    // 1. 下载云存储里的照片 → base64
    console.log('[idPhoto] 1/3 下载原图', fileID);
    const fileRes = await cloud.downloadFile({ fileID });
    const base64 = fileRes.fileContent.toString('base64');
    console.log('[idPhoto] 原图字节数', fileRes.fileContent.length);

    // 2. 调人体分析-人像分割（只传 Image；ResultImage=透明前景 PNG base64，ResultMask=掩码）
    console.log('[idPhoto] 2/3 调 bda SegmentPortraitPic');
    const segRes = await client.SegmentPortraitPic({ Image: base64 });
    if (!segRes || !segRes.ResultImage) {
      console.error('[idPhoto] 未返回 ResultImage，返回字段：', segRes && Object.keys(segRes));
      return { success: false, error: '人像分割未返回结果，请重试', code: 500, message: '人像分割未返回结果' };
    }
    console.log('[idPhoto] 抠图成功');

    // 3. 透明前景图上传回云存储（PNG 保留 alpha 通道）
    console.log('[idPhoto] 3/3 上传透明前景 PNG');
    const resultBuffer = Buffer.from(segRes.ResultImage, 'base64');
    const uploadRes = await cloud.uploadFile({
      cloudPath: `idphoto-result/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
      fileContent: resultBuffer
    });
    console.log('[idPhoto] 完成，耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's', uploadRes.fileID);
    // 扁平结构（V6 约定）+ 旧版 code 契约（兼容未更新的调用方）
    return { success: true, fileID: uploadRes.fileID, code: 0, data: { fileID: uploadRes.fileID } };
  } catch (e) {
    console.error('[idPhoto] 失败，耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's', e);
    // SDK 错误形如 FailedOperation.ServiceNotOpened: xxx，完整透传给前端做分类提示
    const msg = e.code ? `${e.code}: ${e.message}` : (e.message || '抠图失败');
    return { success: false, error: msg, code: 500, message: msg };
  }
};
