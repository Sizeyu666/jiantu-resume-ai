// utils/canvas-export.js V3
// A4 简历导出：canvas 2d 排版重绘 → 临时图片 → 保存相册
// 支持：10 套模板变体、头像、字号/间距三档、免费水印、单页图 / 完整长图
// 小程序 canvas 单边硬上限 4096px，长图按内容高度自动降低导出倍率；全流程分步日志
const config = require('./config');
const { DEFAULT_SECTION_ORDER, TEMPLATES, SECTION_EN } = require('./constants');

const LOGIC_W = 750;
const LOGIC_H = 1059;
const PAGE_SCALE = 2; // 单页导出像素倍率（750×2=1500，远低于 4096 限制）
const MARGIN = 40; // 与渲染器规范一致：左右边距 40rpx
const TOP_MARGIN = 50;
const CONTENT_W = LOGIC_W - MARGIN * 2;
const MAX_CANVAS_PX = 4000; // 预留安全余量（官方限制 4096）
const EXPORT_TIMEOUT = 30000; // 30s 超时提示

function log(step, detail) {
  if (detail !== undefined) console.log('[export]', step, detail);
  else console.log('[export]', step);
}

function hasText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}
function period(it) {
  const s = ((it && it.start) || '').trim();
  const e = ((it && it.end) || '').trim();
  if (s && e) return s + ' - ' + e;
  return s || e;
}

const SECTION_TITLES = {
  education: '教育经历',
  experience: '实习经历',
  projects: '项目经历',
  campus: '校园经历',
  skills: '专业技能',
  certificates: '证书奖项',
  work: '工作经历',
  awards: '获奖荣誉',
  languages: '语言能力',
  summary: '自我评价'
};

// 字号 / 间距档位
const FONT_MUL = { small: 0.92, medium: 1, large: 1.08 };
const GAP_MUL = { compact: 0.78, normal: 1, loose: 1.32 };

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

// 统一取板块标题（支持重命名 / 自定义板块）
function titleOf(key, r) {
  if (key.indexOf('custom:') === 0) {
    const id = key.slice(7);
    const sec = arr(r.customSections).find((s) => s.id === id);
    return sec ? sec.title : '自定义板块';
  }
  return (r.sectionTitles && r.sectionTitles[key]) || SECTION_TITLES[key] || key;
}

// 绘制器工厂（dry=true 时只排不算，用于长图测量内容高度）
function createPainter(ctx, r, opts) {
  const b = r.basics || {};
  const tpl = TEMPLATES.find((t) => t.id === r.templateId) || TEMPLATES[0];
  const themeColor = r.themeColor || tpl.defaultColor || '#333333';
  const fm = FONT_MUL[opts.fontLevel] || 1;
  const gm = GAP_MUL[opts.spacing] || 1;
  const avatar = opts.avatarImage || null;
  const AVATAR_W = 80; // 规范：80×100rpx 一寸照比例
  const AVATAR_H = 100;
  const variant = tpl.variant || 'left-ul';
  const headerMode = variant === 'info-table' ? 'table'
    : (variant === 'left-ul' || variant === 'left-bar' ? 'left' : 'center');
  // V4：模板需要照片位但用户未上传头像时，绘制灰色占位框（photo:'none' 的模板不留位）
  const needPhoto = tpl.photo !== 'none';
  const showAvatar = !!avatar && needPhoto;
  const avatarSide = tpl.photo === 'side';
  const avatarRound = variant === 'ava-circle'; // D2 圆形头像模板
  const titleMode = variant === 'gray-block' ? 'grayblock'
    : variant === 'bw-en' || variant === 'dual-title' ? 'bwen'
    : variant === 'left-bar' ? 'bar'
    : variant === 'info-table' || variant === 'thin-line' ? 'thin'
    : variant === 'code-title' ? 'code'
    : 'ul';
  let titleNo = 0;
  let y = TOP_MARGIN;

  function ensure(need, state) {
    if (state.long) return true; // 长图不截断
    if (y + need > state.bottomLimit) {
      state.truncated = true;
      return false;
    }
    return true;
  }

  function drawAvatar(state, ax, ay, aw, ah, withBorder) {
    if (!state.dry) {
      ctx.save();
      const rr = avatarRound ? aw / 2 : 4; // 规范：直角小圆角 4rpx；D2 圆形头像
      ctx.beginPath();
      ctx.moveTo(ax + rr, ay);
      ctx.arcTo(ax + aw, ay, ax + aw, ay + ah, rr);
      ctx.arcTo(ax + aw, ay + ah, ax, ay + ah, rr);
      ctx.arcTo(ax, ay + ah, ax, ay, rr);
      ctx.arcTo(ax, ay, ax + aw, ay, rr);
      ctx.closePath();
      ctx.clip();
      const scale = Math.max(aw / avatar.width, ah / avatar.height);
      const dw = avatar.width * scale;
      const dh = avatar.height * scale;
      ctx.drawImage(avatar, ax + (aw - dw) / 2, ay + (ah - dh) / 2, dw, dh);
      ctx.restore();
      if (withBorder) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(ax + 1, ay + 1, aw - 2, ah - 2);
      }
    }
  }

  // 有头像画头像；模板需要照片位但没传头像时画灰色占位框
  function drawPhoto(state, ax, ay) {
    if (showAvatar) {
      drawAvatar(state, ax, ay, AVATAR_W, AVATAR_H, false);
      return;
    }
    if (needPhoto && !state.dry) {
      ctx.fillStyle = '#f2f2f2';
      const rr = avatarRound ? AVATAR_W / 2 : 4;
      ctx.beginPath();
      ctx.moveTo(ax + rr, ay);
      ctx.arcTo(ax + AVATAR_W, ay, ax + AVATAR_W, ay + AVATAR_H, rr);
      ctx.arcTo(ax + AVATAR_W, ay + AVATAR_H, ax, ay + AVATAR_H, rr);
      ctx.arcTo(ax, ay + AVATAR_H, ax, ay, rr);
      ctx.arcTo(ax, ay, ax + AVATAR_W, ay, rr);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b6b9bf';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('照片', ax + AVATAR_W / 2, ay + AVATAR_H / 2 + 3);
      ctx.textAlign = 'left';
    }
  }

  function paint(state) {
    const contact = [b.phone, b.email, b.city].filter(hasText).join('  |  ');
    const links = [b.github, b.blog, hasText(b.wechat) ? '微信：' + b.wechat.trim() : ''].filter(hasText).join('  |  ');
    const nameText = hasText(b.name) ? b.name.trim() : '姓名';

    // ---------- 头部：A5 信息表格 ----------
    if (headerMode === 'table') {
      ctx.textAlign = 'left';
      if (!state.dry) {
        ctx.fillStyle = '#1a1a1a';
        ctx.font = `bold ${Math.round(16 * fm)}px sans-serif`;
        ctx.fillText(nameText, MARGIN, y + 14 * fm);
        if (hasText(b.jobIntent)) {
          ctx.fillStyle = '#666666';
          ctx.font = `${Math.round(10 * fm)}px sans-serif`;
          ctx.textAlign = 'right';
          ctx.fillText('意向岗位：' + b.jobIntent.trim(), MARGIN + CONTENT_W, y + 14 * fm);
          ctx.textAlign = 'left';
        }
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(MARGIN, y + 24 * fm);
        ctx.lineTo(MARGIN + CONTENT_W, y + 24 * fm);
        ctx.stroke();
      }
      y += Math.round(34 * fm);

      const fields = [];
      if (hasText(b.phone)) fields.push(['手机', b.phone.trim()]);
      if (hasText(b.email)) fields.push(['邮箱', b.email.trim()]);
      if (hasText(b.city)) fields.push(['城市', b.city.trim()]);
      if (hasText(b.wechat)) fields.push(['微信', b.wechat.trim()]);
      if (hasText(b.github)) fields.push(['GitHub', b.github.trim()]);
      if (hasText(b.blog)) fields.push(['个人主页', b.blog.trim()]);
      const rowH = Math.round(26 * fm);
      const colW = CONTENT_W / 2;
      const labW = 52;
      const tableTop = y;
      const rowsN = Math.ceil(fields.length / 2);
      fields.forEach((cell, idx) => {
        const ci = idx % 2;
        const ri = Math.floor(idx / 2);
        const ry = tableTop + ri * rowH;
        const x0 = MARGIN + ci * colW;
        if (!state.dry) {
          ctx.fillStyle = '#f5f6f8';
          ctx.fillRect(x0 + 1, ry + 1, labW, rowH - 2);
          ctx.fillStyle = '#666666';
          ctx.font = `${Math.round(10 * fm)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(cell[0], x0 + labW / 2, ry + 17 * fm);
          ctx.textAlign = 'left';
          ctx.fillStyle = '#333333';
          const lines = wrapText(ctx, cell[1], colW - labW - 14);
          if (lines[0]) ctx.fillText(lines[0], x0 + labW + 7, ry + 17 * fm);
        }
      });
      if (!state.dry) {
        // 网格线
        ctx.strokeStyle = '#c9cdd4';
        ctx.lineWidth = 1;
        for (let ri = 0; ri <= rowsN; ri += 1) {
          const ly0 = tableTop + ri * rowH + 0.5;
          ctx.beginPath();
          ctx.moveTo(MARGIN, ly0);
          ctx.lineTo(MARGIN + CONTENT_W, ly0);
          ctx.stroke();
        }
        [0, labW, colW, colW + labW, CONTENT_W].forEach((off) => {
          ctx.beginPath();
          ctx.moveTo(MARGIN + off + 0.5, tableTop);
          ctx.lineTo(MARGIN + off + 0.5, tableTop + rowsN * rowH);
          ctx.stroke();
        });
      }
      y = tableTop + rowsN * rowH + Math.round(14 * gm);
    } else if (headerMode === 'left') {
      // ---------- 头部：左对齐（信息左 + 照片右） ----------
      ctx.textAlign = 'left';
      let tx = MARGIN;
      let textW = CONTENT_W;
      if (needPhoto && !avatarSide) {
        drawPhoto(state, LOGIC_W - MARGIN - AVATAR_W, y - 2);
        textW = CONTENT_W - AVATAR_W - 20;
      }
      if (needPhoto && avatarSide) {
        drawPhoto(state, MARGIN, y - 2);
        tx = MARGIN + AVATAR_W + 20;
        textW = LOGIC_W - MARGIN - tx;
      }
      ctx.fillStyle = themeColor;
      ctx.font = `bold ${Math.round(16 * fm)}px sans-serif`;
      if (!state.dry) ctx.fillText(nameText, tx, y + 14 * fm);
      let ly = y + Math.round(36 * fm);
      ctx.fillStyle = '#333333';
      ctx.font = `${Math.round(11 * fm)}px sans-serif`;
      if (hasText(b.jobIntent)) { if (!state.dry) ctx.fillText('意向岗位：' + b.jobIntent.trim(), tx, ly); ly += Math.round(20 * fm); }
      ctx.fillStyle = '#999999';
      ctx.font = `${Math.round(10 * fm)}px sans-serif`;
      if (contact) { if (!state.dry) ctx.fillText(contact, tx, ly); ly += Math.round(18 * fm); }
      if (links) { if (!state.dry) ctx.fillText(links, tx, ly); ly += Math.round(18 * fm); }
      y = Math.max(ly + Math.round(6 * gm), needPhoto ? y - 2 + AVATAR_H + 12 : ly);
    } else {
      // ---------- 头部：居中 ----------
      const hasRightAva = needPhoto && !avatarSide;
      const centerX = hasRightAva ? (LOGIC_W - AVATAR_W) / 2 : LOGIC_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = themeColor;
      ctx.font = `bold ${Math.round(16 * fm)}px sans-serif`;
      if (!state.dry) ctx.fillText(nameText, centerX, y + 10 * fm);
      y += Math.round(28 * fm);

      ctx.fillStyle = '#333333';
      ctx.font = `${Math.round(11 * fm)}px sans-serif`;
      if (hasText(b.jobIntent)) {
        if (!state.dry) ctx.fillText('意向岗位：' + b.jobIntent.trim(), centerX, y);
        y += Math.round(22 * fm);
      }
      ctx.fillStyle = '#999999';
      ctx.font = `${Math.round(10 * fm)}px sans-serif`;
      if (contact) { if (!state.dry) ctx.fillText(contact, centerX, y); y += Math.round(19 * fm); }
      if (links) { if (!state.dry) ctx.fillText(links, centerX, y); y += Math.round(19 * fm); }
      y += Math.round(10 * gm);

      // A3 极简黑白：头部下黑色横线
      if (variant === 'bw-en') {
        if (!state.dry) {
          ctx.strokeStyle = '#111111';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(MARGIN, y);
          ctx.lineTo(MARGIN + CONTENT_W, y);
          ctx.stroke();
        }
        y += Math.round(18 * gm);
      }

      if (hasRightAva) {
        drawPhoto(state, LOGIC_W - MARGIN - AVATAR_W, TOP_MARGIN - 2);
        if (y < TOP_MARGIN - 2 + AVATAR_H + 8) y = TOP_MARGIN - 2 + AVATAR_H + 8;
      }
    }
    ctx.textAlign = 'left';

    // ---------- 绘制基元 ----------
    function sectionTitle(title, enTitle) {
      if (!ensure(Math.round(40 * gm), state)) return false;
      y += Math.round(8 * gm);
      ctx.font = `bold ${Math.round(13 * fm)}px sans-serif`;
      if (titleMode === 'grayblock') {
        // A1：灰色色块 + 白字
        const bh = Math.round(30 * fm);
        if (!state.dry) {
          ctx.fillStyle = themeColor;
          ctx.fillRect(MARGIN, y, CONTENT_W, bh);
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(12.5 * fm)}px sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillText(title, MARGIN + 12, y + bh / 2);
          ctx.textBaseline = 'alphabetic';
        }
        y += bh + Math.round(8 * gm);
      } else if (titleMode === 'bwen') {
        // A3：大写英文 + 中文小字
        if (!state.dry) {
          ctx.fillStyle = '#111111';
          ctx.font = `bold ${Math.round(12.5 * fm)}px Arial, sans-serif`;
          ctx.fillText(enTitle || 'CUSTOM', MARGIN, y + 12 * fm);
          const w = ctx.measureText(enTitle || 'CUSTOM').width;
          ctx.fillStyle = '#999999';
          ctx.font = `${Math.round(9 * fm)}px sans-serif`;
          ctx.fillText(title, MARGIN + w + 12, y + 12 * fm);
        }
        y += Math.round(22 * gm);
      } else if (titleMode === 'bar') {
        // A4：左侧竖线标题
        if (!state.dry) {
          ctx.fillStyle = themeColor;
          ctx.fillRect(MARGIN, y - 11 * fm, 5, 18 * fm);
          ctx.fillStyle = '#1a1a1a';
          ctx.fillText(title, MARGIN + 14, y);
        }
        y += Math.round(16 * gm);
      } else if (titleMode === 'thin') {
        if (!state.dry) {
          ctx.fillStyle = '#1a1a1a';
          ctx.fillText(title, MARGIN, y);
          ctx.fillStyle = '#d8d8d8';
          ctx.fillRect(MARGIN, y + 6, CONTENT_W, 1);
        }
        y += Math.round(20 * gm);
      } else if (titleMode === 'code') {
        // C3 代码风：// 注释标题
        if (!state.dry) {
          ctx.fillStyle = '#6a9955';
          ctx.fillText('// ' + title, MARGIN, y);
        }
        y += Math.round(20 * gm);
      } else {
        // ul：主题色文字 + 下划线
        if (!state.dry) {
          ctx.fillStyle = themeColor;
          ctx.fillText(title, MARGIN, y);
          ctx.fillRect(MARGIN, y + 6, CONTENT_W, 1.5);
        }
        y += Math.round(20 * gm);
      }
      return true;
    }

    function headLine(left, right) {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `bold ${Math.round(11 * fm)}px sans-serif`;
      if (!state.dry) ctx.fillText(left || '', MARGIN, y);
      if (right) {
        ctx.fillStyle = '#999999';
        ctx.font = `${Math.round(10 * fm)}px sans-serif`;
        ctx.textAlign = 'right';
        if (!state.dry) ctx.fillText(right, LOGIC_W - MARGIN, y);
        ctx.textAlign = 'left';
      }
      y += Math.round(18 * fm);
    }

    function subLine(text) {
      if (!text) return;
      if (!ensure(Math.round(17 * fm), state)) return;
      ctx.fillStyle = '#444444';
      ctx.font = `${Math.round(11 * fm)}px sans-serif`;
      wrapText(ctx, text, CONTENT_W).forEach((ln) => {
        if (!ensure(Math.round(17 * fm), state)) return;
        if (!state.dry) ctx.fillText(ln, MARGIN, y);
        y += Math.round(17 * fm);
      });
    }

    function bullets(list) {
      arr(list).filter(hasText).forEach((t) => {
        ctx.fillStyle = '#333333';
        ctx.font = `${Math.round(11 * fm)}px sans-serif`;
        const all = wrapText(ctx, t, CONTENT_W - 18);
        all.forEach((ln, li) => {
          if (!ensure(Math.round(17 * fm), state)) return;
          if (!state.dry) {
            if (li === 0) {
              ctx.fillStyle = '#555555';
              ctx.beginPath();
              ctx.arc(MARGIN + 3, y - 4, 2.6, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#333333';
            }
            ctx.fillText(ln, MARGIN + 14, y);
          }
          y += Math.round(17 * fm);
        });
      });
    }

    function rows(list) {
      // 证书 / 获奖 / 语言：名称 + 右侧时间/等级
      arr(list).forEach((c) => {
        if (!ensure(Math.round(22 * fm), state)) return;
        headLine(c.name, c.date || c.level || '');
        if (hasText(c.issuer) || hasText(c.detail)) subLine(c.issuer || c.detail);
      });
    }

    // ---------- 板块数据 ----------
    const dataMap = {
      education: arr(r.education),
      experience: arr(r.experience),
      projects: arr(r.projects),
      campus: arr(r.campus),
      skills: arr(r.skills),
      certificates: arr(r.certificates),
      work: arr(r.work),
      awards: arr(r.awards),
      languages: arr(r.languages)
    };
    const order = arr(r.sectionOrder && r.sectionOrder.length ? r.sectionOrder : DEFAULT_SECTION_ORDER);
    const customMap = {};
    arr(r.customSections).forEach((s) => { customMap['custom:' + s.id] = s; });

    for (const key of order) {
      if (state.truncated) break;
      const isCustom = key.indexOf('custom:') === 0;
      const cs = isCustom ? customMap[key] : null;
      if (isCustom && !cs) continue;

      if (!isCustom) {
        if (key === 'education' && dataMap.education.length) {
          if (!sectionTitle(titleOf(key, r), SECTION_EN[key] || 'CUSTOM')) break;
          dataMap.education.forEach((it) => {
            if (state.truncated) return;
            headLine(it.school, period(it));
            subLine([it.degree, it.major, it.gpa].filter(hasText).join(' · '));
            if (hasText(it.courses)) subLine('相关课程：' + it.courses);
            bullets(it.highlights);
            y += Math.round(6 * gm);
          });
        } else if ((key === 'experience' || key === 'work') && dataMap[key].length) {
          if (!sectionTitle(titleOf(key, r), SECTION_EN[key] || 'CUSTOM')) break;
          dataMap[key].forEach((it) => {
            if (state.truncated) return;
            headLine(it.company, period(it));
            subLine([it.role, it.city].filter(hasText).join(' · '));
            bullets(it.bullets);
            y += Math.round(6 * gm);
          });
        } else if (key === 'projects' && dataMap.projects.length) {
          if (!sectionTitle(titleOf(key, r), SECTION_EN[key] || 'CUSTOM')) break;
          dataMap.projects.forEach((it) => {
            if (state.truncated) return;
            headLine(it.name, period(it));
            const tech = arr(it.techStack).filter(hasText).join(' / ');
            subLine(tech ? [it.role, tech].filter(hasText).join(' · ') : it.role);
            bullets(it.bullets);
            y += Math.round(6 * gm);
          });
        } else if (key === 'campus' && dataMap.campus.length) {
          if (!sectionTitle(titleOf(key, r), SECTION_EN[key] || 'CUSTOM')) break;
          dataMap.campus.forEach((it) => {
            if (state.truncated) return;
            headLine(it.org, period(it));
            subLine(it.role);
            bullets(it.bullets);
            y += Math.round(6 * gm);
          });
        } else if (key === 'skills' && dataMap.skills.some((s) => arr(s.items).some(hasText))) {
          if (!sectionTitle(titleOf(key, r), SECTION_EN[key] || 'CUSTOM')) break;
          dataMap.skills.forEach((s) => {
            if (state.truncated) return;
            const text = (hasText(s.category) ? s.category + '：' : '') + arr(s.items).filter(hasText).join(' / ');
            if (!text) return;
            ctx.fillStyle = '#1a1a1a';
            ctx.font = `${Math.round(11 * fm)}px sans-serif`;
            wrapText(ctx, text, CONTENT_W).forEach((ln) => {
              if (!ensure(Math.round(17 * fm), state)) return;
              if (!state.dry) ctx.fillText(ln, MARGIN, y);
              y += Math.round(17 * fm);
            });
          });
          y += Math.round(6 * gm);
        } else if ((key === 'certificates' || key === 'awards') && dataMap[key].length) {
          if (!sectionTitle(titleOf(key, r), SECTION_EN[key] || 'CUSTOM')) break;
          rows(dataMap[key]);
          y += Math.round(6 * gm);
        } else if (key === 'languages' && dataMap.languages.length) {
          if (!sectionTitle(titleOf(key, r), SECTION_EN[key] || 'CUSTOM')) break;
          rows(dataMap.languages);
          y += Math.round(6 * gm);
        } else if (key === 'summary' && hasText(r.summary)) {
          if (!sectionTitle(titleOf(key, r), SECTION_EN[key] || 'CUSTOM')) break;
          ctx.fillStyle = '#1a1a1a';
          ctx.font = `${Math.round(11 * fm)}px sans-serif`;
          wrapText(ctx, r.summary.trim(), CONTENT_W).forEach((ln) => {
            if (!ensure(Math.round(17 * fm), state)) return;
            if (!state.dry) ctx.fillText(ln, MARGIN, y);
            y += Math.round(17 * fm);
          });
        }
      } else {
        // ---------- 自定义板块 ----------
        const nonEmpty = (cs.kind === 'text' && hasText(cs.text))
          || (cs.kind === 'bullets' && arr(cs.bullets).some(hasText))
          || (cs.kind === 'skills' && arr(cs.groups).some((g) => arr(g.items).some(hasText)))
          || (cs.kind === 'certs' && arr(cs.rows).some((x) => hasText(x.name)));
        if (!nonEmpty) continue;
        if (!sectionTitle(cs.title, 'CUSTOM')) break;
        if (cs.kind === 'bullets') bullets(cs.bullets);
        else if (cs.kind === 'text') subLine(cs.text);
        else if (cs.kind === 'certs') rows(cs.rows);
        else if (cs.kind === 'skills') {
          arr(cs.groups).forEach((g) => {
            const text = (hasText(g.category) ? g.category + '：' : '') + arr(g.items).filter(hasText).join(' / ');
            if (!text) return;
            ctx.fillStyle = '#1a1a1a';
            ctx.font = `${Math.round(11 * fm)}px sans-serif`;
            wrapText(ctx, text, CONTENT_W).forEach((ln) => {
              if (!ensure(Math.round(17 * fm), state)) return;
              if (!state.dry) ctx.fillText(ln, MARGIN, y);
              y += Math.round(17 * fm);
            });
          });
        }
        y += Math.round(6 * gm);
      }
    }
    return y;
  }

  return { paint };
}

// 加载头像为 canvas Image（失败不阻塞导出）
function loadAvatarImage(canvas, avatarPath) {
  if (!avatarPath) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn('[canvas-export] 头像加载失败，跳过头像导出');
      resolve(null);
    };
    img.src = avatarPath;
  });
}

function toTempFile(canvas) {
  return new Promise((resolve, reject) => {
    // canvas 2d：x/y/width/height 区域以画布位图像素（canvas.width/height）为单位，
    // 传逻辑尺寸会只截取左上角区域；dest 直接取原生尺寸，1:1 输出最清晰
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      success: (res) => resolve(res.tempFilePath),
      fail: (e) => reject(new Error((e && e.errMsg) || '图片生成失败'))
    });
  });
}

// ---------- 单页 A4 导出（超出截断 + 提示 + 水印） ----------
async function renderResumeImage(canvas, resume, opts = {}) {
  return withTimeout(
    (async () => {
      const r = resume || {};
      const watermark = opts.isVip ? '' : config.WATERMARK;
      log('单页导出开始', { templateId: r.templateId, canvas: LOGIC_W * PAGE_SCALE + 'x' + LOGIC_H * PAGE_SCALE });
      canvas.width = LOGIC_W * PAGE_SCALE;
      canvas.height = LOGIC_H * PAGE_SCALE;
      const ctx = canvas.getContext('2d');
      ctx.scale(PAGE_SCALE, PAGE_SCALE);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGIC_W, LOGIC_H);

      log('加载头像', opts.avatarPath ? '有头像路径' : '无头像');
      const avatarImage = await loadAvatarImage(canvas, opts.avatarPath);
      log('正式绘制', avatarImage ? '头像就绪' : '无头像绘制');
      const painter = createPainter(ctx, r, { ...opts, avatarImage });
      const state = {
        dry: false,
        long: false,
        truncated: false,
        bottomLimit: watermark ? LOGIC_H - 46 : LOGIC_H - 24
      };
      painter.paint(state);
      log('绘制完成', state.truncated ? '内容超出已截断' : '完整绘制');

      if (state.truncated) {
        ctx.fillStyle = '#d93025';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('内容超出一页，已截断，建议精简后导出', LOGIC_W / 2, watermark ? LOGIC_H - 52 : LOGIC_H - 30);
        ctx.textAlign = 'left';
      }
      if (watermark) {
        ctx.fillStyle = '#b6b9bf';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(watermark, LOGIC_W / 2, LOGIC_H - 26);
        ctx.textAlign = 'left';
      }
      log('导出临时图片', 'canvas=' + canvas.width + 'x' + canvas.height);
      const tempPath = await toTempFile(canvas);
      log('单页导出完成', tempPath);
      return tempPath;
    })(),
    EXPORT_TIMEOUT,
    '导出超时，请重试'
  );
}

// ---------- 完整长图导出（MVP 阶段的"导出 PDF"：不截断，自动降倍率保证 ≤4096px） ----------
async function renderResumeLongImage(canvas, resume, opts = {}) {
  return withTimeout(
    (async () => {
      const r = resume || {};
      const watermark = opts.isVip ? '' : config.WATERMARK;

      log('长图导出开始', { templateId: r.templateId });
      // 第一遍：测量内容总高（1059 起步）
      canvas.width = LOGIC_W;
      canvas.height = LOGIC_H;
      const mctx = canvas.getContext('2d');
      log('加载头像(dry)', opts.avatarPath ? '有头像路径' : '无头像');
      const avatarImage = await loadAvatarImage(canvas, opts.avatarPath);
      log('dry 测量内容高度');
      const mp = createPainter(mctx, r, { ...opts, avatarImage });
      const endY = mp.paint({ dry: true, long: true, truncated: false, bottomLimit: Infinity });
      const logicH = Math.max(LOGIC_H, Math.ceil(endY + 40 + (watermark ? 30 : 0)));

      // 自动选倍率：宽 750 逻辑像素 2 倍=1500px；长图高度上限 2000px（导出规范），超出自动降倍率
      const LONG_MAX_H = 2000;
      const scale = Math.min(
        PAGE_SCALE,
        Math.floor((LONG_MAX_H / logicH) * 10) / 10,
        1.6
      );

      // 第二遍：正式绘制（尺寸守卫：宽 ≤1500px，高 ≤2000px）
      canvas.width = Math.round(LOGIC_W * scale);
      canvas.height = Math.round(logicH * scale);
      log('正式绘制', 'canvas=' + canvas.width + 'x' + canvas.height + ' scale=' + scale + ' logicH=' + logicH);
      if (canvas.height > LONG_MAX_H + 2 || canvas.width > LOGIC_W * PAGE_SCALE + 2) {
        throw new Error('简历内容过长，导出尺寸超限，请精简内容后重试');
      }
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGIC_W, logicH);

      const painter = createPainter(ctx, r, { ...opts, avatarImage });
      painter.paint({ dry: false, long: true, truncated: false, bottomLimit: logicH });
      log('绘制完成，导出临时图片');

      if (watermark) {
        ctx.fillStyle = '#b6b9bf';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(watermark, LOGIC_W / 2, logicH - 20);
        ctx.textAlign = 'left';
      }
      log('导出临时图片', 'canvas=' + canvas.width + 'x' + canvas.height);
      const tempPath = await toTempFile(canvas);
      log('长图导出完成', tempPath);
      return tempPath;
    })(),
    EXPORT_TIMEOUT,
    '导出超时，请重试'
  );
}

// 保存到相册（含授权引导）
function saveImageToPhotosAlbum(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: (err) => {
        if (/auth|authorize|deny/i.test(err.errMsg || '')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            success: (m) => {
              if (!m.confirm) return reject(new Error('未授权相册权限'));
              wx.openSetting({
                success: (s) => {
                  if (s.authSetting['scope.writePhotosAlbum']) {
                    wx.saveImageToPhotosAlbum({
                      filePath,
                      success: () => resolve(),
                      fail: () => reject(new Error('保存失败'))
                    });
                  } else {
                    reject(new Error('未授权相册权限'));
                  }
                },
                fail: () => reject(new Error('未授权相册权限'))
              });
            }
          });
        } else {
          reject(err);
        }
      }
    });
  });
}

// 判断运行环境是否为开发者工具（工具内保存相册常卡死/超时，真机正常）
function isDevtools() {
  try {
    if (wx.getDeviceInfo) return wx.getDeviceInfo().platform === 'devtools';
    return (wx.getSystemInfoSync().platform || '') === 'devtools';
  } catch (e) {
    return false;
  }
}

// 真机：先查/申请相册权限再保存；开发者工具：saveImageToPhotosAlbum 经常永久 pending，
// 直接改为预览图片，用户长按即可保存，避免 30s 超时假失败
function saveImageOrPreview(filePath) {
  if (isDevtools()) {
    return new Promise((resolve, reject) => {
      wx.previewImage({
        urls: [filePath],
        current: filePath,
        success: () => resolve('preview'),
        fail: () => reject(new Error('图片预览失败'))
      });
    });
  }
  return ensureAlbumAuth().then(() => saveImageToPhotosAlbum(filePath)).then(() => 'album');
}

// 保存前主动查询相册授权（未决定时先 authorize），避免首次保存卡在系统授权时序上
function ensureAlbumAuth() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success: (res) => {
        const granted = res.authSetting['scope.writePhotosAlbum'];
        if (granted === true) return resolve();
        if (granted === false) {
          // 已拒绝：引导去设置页开启
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            success: (m) => {
              if (!m.confirm) return reject(new Error('未授权相册权限'));
              wx.openSetting({
                success: (s) => (s.authSetting['scope.writePhotosAlbum'] ? resolve() : reject(new Error('未授权相册权限'))),
                fail: () => reject(new Error('未授权相册权限'))
              });
            }
          });
          return;
        }
        // 从未询问过：先主动授权
        wx.authorize({
          scope: 'scope.writePhotosAlbum',
          success: () => resolve(),
          fail: () => reject(new Error('未授权相册权限'))
        });
      },
      fail: () => resolve() // 查不到设置就直接尝试保存，由保存接口兜底
    });
  });
}

module.exports = {
  renderResumeImage,
  renderResumeLongImage,
  saveImageToPhotosAlbum,
  saveImageOrPreview,
  isDevtools,
  withTimeout,
  LOGIC_W,
  LOGIC_H
};
