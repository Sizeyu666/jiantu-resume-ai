// cloudfunctions/exportPdf/index.js 简历导出 PDF
// 流程：简历 JSON → A4 内联样式 HTML → puppeteer 打印 PDF → 上传云存储 → 返回 fileID
//
// 重要部署说明：
// 1) CloudBase 默认运行环境不含 Chromium，需在云控制台为该函数绑定含 Chromium 的层，
//    并在层内提供 puppeteer 或 puppeteer-core（本函数 package.json 默认不安装，
//    以免 --remote-npm-install 拉取 Chromium 导致部署失败）。
// 2) 未配置层 / require 失败 / 启动失败时，统一返回
//    { code: 500, message: 'PDF_GENERATE_UNAVAILABLE' }，前端收到后自动降级导出长图。
// 3) 函数超时建议在云控制台设置为 60s，内存 512MB 以上。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

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
const SECTION_EN = {
  education: 'EDUCATION',
  experience: 'INTERNSHIP',
  work: 'WORK EXPERIENCE',
  projects: 'PROJECTS',
  campus: 'CAMPUS ACTIVITIES',
  skills: 'SKILLS',
  certificates: 'CERTIFICATES',
  awards: 'HONORS & AWARDS',
  languages: 'LANGUAGES',
  summary: 'PROFILE'
};
const TEMPLATE_META = {
  // A 商务
  a1: { variant: 'gray-block', color: '#555555', photo: 'none', sidebar: false },
  a2: { variant: 'left-ul', color: '#1e3a5f', photo: 'right', sidebar: false },
  a3: { variant: 'bw-en', color: '#111111', photo: 'right', sidebar: false },
  a4: { variant: 'left-bar', color: '#2c5282', photo: 'right', sidebar: false },
  a5: { variant: 'info-table', color: '#333333', photo: 'none', sidebar: false },
  a7: { variant: 'dual-title', color: '#33415c', photo: 'right', sidebar: false },
  a8: { variant: 'wide-margin', color: '#1e3a5f', photo: 'right', sidebar: false },
  a9: { variant: 'thin-line', color: '#4a5568', photo: 'right', sidebar: false },
  a10: { variant: 'left-ul', color: '#2f5233', photo: 'right', sidebar: false },
  a11: { variant: 'left-ul', color: '#111111', photo: 'right', sidebar: false },
  // B 侧边栏
  b1: { variant: 'side-dark', color: '#1e3a5f', photo: 'side', sidebar: true },
  b2: { variant: 'side-dark', color: '#2d3748', photo: 'side', sidebar: true },
  b3: { variant: 'side-light', color: '#2d3748', photo: 'side', sidebar: true },
  b4: { variant: 'side-dark', color: '#2f5233', photo: 'side', sidebar: true },
  b5: { variant: 'side-dark', color: '#742a2a', photo: 'side', sidebar: true },
  b8: { variant: 'side-right', color: '#1e3a5f', photo: 'side', sidebar: true },
  b9: { variant: 'side-gradient', color: '#1e3a5f', photo: 'side', sidebar: true },
  b10: { variant: 'side-dark', color: '#2d3748', photo: 'none', sidebar: true },
  b11: { variant: 'side-dark', color: '#94680a', photo: 'side', sidebar: true },
  b12: { variant: 'side-dark', color: '#111111', photo: 'side', sidebar: true },
  // C 技术风
  c1: { variant: 'tech-bars', color: '#2563eb', photo: 'right', sidebar: false },
  c2: { variant: 'tech-tags', color: '#0e7490', photo: 'right', sidebar: false },
  c3: { variant: 'code-title', color: '#2ea043', photo: 'right', sidebar: false },
  c4: { variant: 'tech-card', color: '#1d4ed8', photo: 'right', sidebar: false },
  c5: { variant: 'tech-timeline', color: '#7c3aed', photo: 'right', sidebar: false },
  c6: { variant: 'tech-double', color: '#334155', photo: 'right', sidebar: false },
  // D 创意风
  d1: { variant: 'cre-flourish', color: '#9d4edd', photo: 'right', sidebar: false },
  d2: { variant: 'ava-circle', color: '#db2777', photo: 'right', sidebar: false },
  d3: { variant: 'cre-wave', color: '#0891b2', photo: 'right', sidebar: false },
  d4: { variant: 'cre-hand', color: '#9a3412', photo: 'right', sidebar: false }
};

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function has(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function arr(v) {
  return Array.isArray(v) ? v : [];
}
function period(it) {
  const s = ((it && it.start) || '').trim();
  const e = ((it && it.end) || '').trim();
  if (s && e) return s + ' - ' + e;
  return s || e || '';
}

function bullets(list) {
  const items = arr(list).filter(has);
  if (!items.length) return '';
  return '<ul class="bullets">' + items.map((t) => `<li>${esc(t.trim())}</li>`).join('') + '</ul>';
}

function titleOf(key, r) {
  if (key.indexOf('custom:') === 0) {
    const id = key.slice(7);
    const sec = arr(r.customSections).find((s) => s.id === id);
    return sec ? sec.title : '自定义板块';
  }
  return (r.sectionTitles && r.sectionTitles[key]) || SECTION_TITLES[key] || key;
}

function sectionTitleHtml(key, r, meta) {
  const title = esc(titleOf(key, r));
  if (meta.variant === 'bwen' || meta.variant === 'dual-title') {
    return `<div class="sec-title st-bwen"><span class="en">${esc(SECTION_EN[key] || 'CUSTOM')}</span><span class="cn">${title}</span></div>`;
  }
  if (meta.variant === 'gray-block') return `<div class="sec-title st-block">${title}</div>`;
  if (meta.variant === 'left-bar') return `<div class="sec-title st-bar">${title}</div>`;
  if (meta.variant === 'info-table' || meta.variant === 'thin-line') return `<div class="sec-title st-thin">${title}</div>`;
  if (meta.variant === 'code-title') return `<div class="sec-title st-code">${title}</div>`;
  return `<div class="sec-title st-ul">${title}</div>`;
}

// 单条经历（教育 / 实习 / 工作 / 项目 / 校园）
function itemHtml(head, right, sub, bulletList) {
  return `<div class="item">
    <div class="item-head"><span class="item-name">${esc(head || '')}</span><span class="item-right">${esc(right || '')}</span></div>
    ${sub ? `<div class="item-sub">${esc(sub)}</div>` : ''}
    ${bullets(bulletList)}
  </div>`;
}

function rowsHtml(list) {
  return arr(list).filter((c) => c && has(c.name)).map((c) =>
    itemHtml(c.name, c.date || c.level || '', [c.issuer, c.detail].filter(has).join(' · '), [])
  ).join('');
}

// 技能板块：进度条 / 标签云 / 默认文本行（由模板变体决定）
function skillsHtml(skills, meta) {
  const groups = skills.filter((s) => arr(s.items).some(has));
  if (!groups.length) return '';
  if (meta.variant === 'tech-bars') {
    const levels = [90, 82, 95, 76, 88, 72];
    let body = '';
    groups.forEach((s, gi) => {
      if (has(s.category)) body += `<div class="skill-bar-cat">${esc(s.category)}</div>`;
      arr(s.items).filter(has).forEach((t, i) => {
        const lv = (typeof t === 'object' && t.level) ? t.level : levels[(gi * 3 + i) % levels.length];
        const name = typeof t === 'object' ? t.name : t;
        body += `<div class="skill-bar-row"><span class="skill-bar-name">${esc(name)}</span><span class="skill-bar-track"><span class="skill-bar-fill" style="width:${lv}%"></span></span></div>`;
      });
    });
    return '<div class="skill-bars">' + body + '</div>';
  }
  if (meta.variant === 'tech-tags') {
    let body = '';
    groups.forEach((s) => {
      if (has(s.category)) body += `<div class="skill-tag-cat">${esc(s.category)}</div>`;
      body += '<div class="skill-tag-wrap">' + arr(s.items).filter(has).map((t) =>
        `<span class="skill-tag">${esc(typeof t === 'object' ? t.name : t)}</span>`).join('') + '</div>';
    });
    return '<div class="skill-tags">' + body + '</div>';
  }
  return '<div class="text-block">' + groups.map((s) => {
    const text = (has(s.category) ? s.category + '：' : '') + arr(s.items).filter(has).map((t) => typeof t === 'object' ? t.name : t).join(' / ');
    return text ? `<div class="skill-line">${esc(text)}</div>` : '';
  }).join('') + '</div>';
}

// 主栏板块（非侧栏）
function buildSectionsHtml(r, meta, inSidebar) {
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
  const order = arr(r.sectionOrder && r.sectionOrder.length ? r.sectionOrder : ['education', 'experience', 'projects', 'campus', 'skills', 'certificates', 'summary']);
  const customMap = {};
  arr(r.customSections).forEach((s) => { customMap['custom:' + s.id] = s; });

  // 侧栏中：联系方式 / 技能放侧栏，主栏不重复输出
  let html = '';
  for (const key of order) {
    if (inSidebar && key === 'skills') continue;
    const isCustom = key.indexOf('custom:') === 0;
    const cs = isCustom ? customMap[key] : null;
    if (isCustom && !cs) continue;

    if (!isCustom) {
      if (key === 'education' && dataMap.education.length) {
        html += sectionTitleHtml(key, r, meta);
        dataMap.education.forEach((it) => {
          html += itemHtml(it.school, period(it), [it.degree, it.major, it.gpa].filter(has).join(' · '), it.highlights);
          if (has(it.courses)) html += `<div class="item-sub">相关课程：${esc(it.courses)}</div>`;
        });
      } else if ((key === 'experience' || key === 'work') && dataMap[key].length) {
        html += sectionTitleHtml(key, r, meta);
        dataMap[key].forEach((it) => {
          html += itemHtml(it.company, period(it), [it.role, it.city].filter(has).join(' · '), it.bullets);
        });
      } else if (key === 'projects' && dataMap.projects.length) {
        html += sectionTitleHtml(key, r, meta);
        dataMap.projects.forEach((it) => {
          const tech = arr(it.techStack).filter(has).join(' / ');
          html += itemHtml(it.name, period(it), tech ? [it.role, tech].filter(has).join(' · ') : it.role, it.bullets);
        });
      } else if (key === 'campus' && dataMap.campus.length) {
        html += sectionTitleHtml(key, r, meta);
        dataMap.campus.forEach((it) => {
          html += itemHtml(it.org, period(it), it.role, it.bullets);
        });
      } else if (key === 'skills' && dataMap.skills.some((s) => arr(s.items).some(has))) {
        html += sectionTitleHtml(key, r, meta) + skillsHtml(dataMap.skills, meta);
      } else if ((key === 'certificates' || key === 'awards') && dataMap[key].length) {
        html += sectionTitleHtml(key, r, meta) + rowsHtml(dataMap[key]);
      } else if (key === 'languages' && dataMap.languages.length) {
        html += sectionTitleHtml(key, r, meta) + rowsHtml(dataMap.languages);
      } else if (key === 'summary' && has(r.summary)) {
        html += sectionTitleHtml(key, r, meta) + `<div class="text-block summary">${esc(r.summary.trim())}</div>`;
      }
    } else {
      const nonEmpty = (cs.kind === 'text' && has(cs.text))
        || (cs.kind === 'bullets' && arr(cs.bullets).some(has))
        || (cs.kind === 'skills' && arr(cs.groups).some((g) => arr(g.items).some(has)))
        || (cs.kind === 'certs' && arr(cs.rows).some((x) => has(x.name)));
      if (!nonEmpty) continue;
      html += sectionTitleHtml(key, r, meta);
      if (cs.kind === 'bullets') html += bullets(cs.bullets);
      else if (cs.kind === 'text') html += `<div class="text-block summary">${esc(cs.text.trim())}</div>`;
      else if (cs.kind === 'certs') html += rowsHtml(cs.rows);
      else if (cs.kind === 'skills') {
        html += '<div class="text-block">' + arr(cs.groups).map((g) => {
          const text = (has(g.category) ? g.category + '：' : '') + arr(g.items).filter(has).join(' / ');
          return text ? `<div class="skill-line">${esc(text)}</div>` : '';
        }).join('') + '</div>';
      }
    }
  }
  return html;
}

// 侧栏内容：照片 + 联系方式 + 技能
function buildSidebarHtml(r, meta, avatarUrl) {
  const b = r.basics || {};
  let html = '';
  if (avatarUrl) html += `<div class="side-ava"><img src="${esc(avatarUrl)}" alt=""/></div>`;
  else if (meta.photo !== 'none') html += '<div class="side-ava side-ava-ph">照片</div>';
  const contacts = [];
  if (has(b.phone)) contacts.push(['电话', b.phone.trim()]);
  if (has(b.email)) contacts.push(['邮箱', b.email.trim()]);
  if (has(b.city)) contacts.push(['城市', b.city.trim()]);
  if (has(b.wechat)) contacts.push(['微信', b.wechat.trim()]);
  if (has(b.github)) contacts.push(['GitHub', b.github.trim()]);
  if (has(b.blog)) contacts.push(['主页', b.blog.trim()]);
  if (contacts.length) {
    html += '<div class="side-title">联系方式</div>';
    html += '<div class="side-contact">' + contacts.map(([lab, val]) =>
      `<div class="side-contact-row"><span class="side-lab">${esc(lab)}</span><span class="side-val">${esc(val)}</span></div>`
    ).join('') + '</div>';
  }
  const skills = arr(r.skills).filter((s) => arr(s.items).some(has));
  if (skills.length) {
    html += '<div class="side-title">专业技能</div>';
    html += '<div class="side-skills">' + skills.map((s) => {
      const text = (has(s.category) ? s.category + '：' : '') + arr(s.items).filter(has).join(' / ');
      return text ? `<div class="side-skill-line">${esc(text)}</div>` : '';
    }).join('') + '</div>';
  }
  return html;
}

function buildHeaderHtml(r, meta, avatarUrl) {
  const b = r.basics || {};
  const name = has(b.name) ? b.name.trim() : '姓名';
  const contact = [b.phone, b.email, b.city].filter(has).map((s) => esc(s.trim())).join('　|　');
  const links = [b.github, b.blog, has(b.wechat) ? '微信：' + b.wechat.trim() : ''].filter(has).map(esc).join('　|　');

  if (meta.variant === 'info-table') {
    const fields = [];
    if (has(b.jobIntent)) fields.push(['意向岗位', b.jobIntent.trim()]);
    if (has(b.phone)) fields.push(['手机', b.phone.trim()]);
    if (has(b.email)) fields.push(['邮箱', b.email.trim()]);
    if (has(b.city)) fields.push(['城市', b.city.trim()]);
    if (has(b.wechat)) fields.push(['微信', b.wechat.trim()]);
    if (has(b.github)) fields.push(['GitHub', b.github.trim()]);
    if (has(b.blog)) fields.push(['个人主页', b.blog.trim()]);
    const cell = (c) => `<td class="lab">${esc(c[0])}</td><td class="val">${esc(c[1])}</td>`;
    const rows = [];
    for (let i = 0; i < fields.length; i += 2) {
      const c1 = fields[i];
      const c2 = fields[i + 1];
      rows.push(`<tr>${cell(c1)}${c2 ? cell(c2) : '<td class="lab"></td><td></td>'}</tr>`);
    }
    return `<div class="hd-table">
      <div class="tbl-name-row"><span class="tbl-name">${esc(name)}</span><span class="tbl-intent"></span></div>
      <table class="info-tbl"><tbody>${rows.join('')}</tbody></table>
    </div>`;
  }

  const photoHtml = avatarUrl
    ? `<img class="hd-ava" src="${esc(avatarUrl)}" alt=""/>`
    : (meta.photo !== 'none' ? '<div class="hd-ava hd-ava-ph">照片</div>' : '');
  const intentHtml = has(b.jobIntent) ? `<div class="hd-intent">意向岗位：${esc(b.jobIntent.trim())}</div>` : '';
  const contactHtml = contact ? `<div class="hd-contact">${contact}</div>` : '';
  const linksHtml = links ? `<div class="hd-links">${links}</div>` : '';

  if (meta.photo === 'right') {
    return `<div class="hd-left">
      <div class="hd-left-text">
        <div class="hd-name">${esc(name)}</div>
        ${intentHtml}${contactHtml}${linksHtml}
      </div>
      ${photoHtml}
    </div>`;
  }
  // 居中（A1 / A3）
  return `<div class="hd-center ${meta.variant === 'bw-en' ? 'hd-bwen' : ''}">
    <div class="hd-name">${esc(name)}</div>
    ${intentHtml}${contactHtml}${linksHtml}
  </div>`;
}

// eslint-disable-next-line max-lines-per-function
function buildHtml(r, meta, isVip, avatarUrl) {
  const fontLevel = r.fontSize === 'small' ? 'fs-small' : (r.fontSize === 'large' ? 'fs-large' : 'fs-medium');
  const spacing = r.spacing === 'compact' ? 'sp-compact' : (r.spacing === 'loose' ? 'sp-loose' : 'sp-normal');
  const rootClass = `rv-${meta.variant} ${fontLevel} ${spacing}${meta.sidebar ? ' rv-sidebar' : ''}${meta.variant === 'side-light' ? ' rv-side-light' : ''}`;
  const themeColor = r.themeColor || meta.color;

  let body;
  if (meta.sidebar) {
    const layoutExtra = meta.variant === 'side-right' ? ' layout-right' : '';
    const sideExtra = meta.variant === 'side-gradient' ? ' sidebar-gradient' : '';
    body = `<div class="resume ${rootClass}" style="--c:${esc(themeColor)}">
      <div class="layout${layoutExtra}">
        <aside class="sidebar${sideExtra}">${buildSidebarHtml(r, meta, avatarUrl)}</aside>
        <main class="main">
          ${buildHeaderHtml(r, { ...meta, photo: 'none' }, '')}
          ${buildSectionsHtml(r, meta, true)}
        </main>
      </div>
    </div>`;
  } else {
    body = `<div class="resume ${rootClass}" style="--c:${esc(themeColor)}">
      ${buildHeaderHtml(r, meta, avatarUrl)}
      ${buildSectionsHtml(r, meta, false)}
    </div>`;
  }

  const watermark = isVip ? '' : '<div class="pdf-watermark">由简途简历生成</div>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${esc(r.title || '我的简历')}</title>
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; font-family: "Microsoft YaHei","PingFang SC",sans-serif; color: #222; }
  .resume { width: 210mm; min-height: 297mm; padding: 14mm 11mm; font-size: 10.5pt; line-height: 1.6; }
  .fs-small { font-size: 9.6pt; }
  .fs-large { font-size: 11.4pt; }
  .sp-compact .item, .sp-compact .text-block, .sp-compact .bullets, .sp-compact .sec-title { margin-bottom: 2.2mm; }
  .sp-loose .item, .sp-loose .text-block, .sp-loose .bullets, .sp-loose .sec-title { margin-bottom: 5.2mm; }

  /* 头部 */
  .hd-name { font-size: 17pt; font-weight: 700; color: var(--c); }
  .hd-intent { font-size: 10.5pt; color: #333; margin-top: 2mm; }
  .hd-contact, .hd-links { font-size: 9.5pt; color: #777; margin-top: 1mm; }
  .hd-center { text-align: center; padding-bottom: 5mm; }
  .hd-bwen { border-bottom: 2px solid #111; }
  .hd-left { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 5mm; }
  .hd-left-text { flex: 1; padding-right: 6mm; }
  .hd-ava { width: 21mm; height: 26.5mm; object-fit: cover; border-radius: 1mm; border: 1px solid #ddd; flex-shrink: 0; }

  /* A5 信息表格 */
  .hd-table { padding-bottom: 4mm; }
  .tbl-name-row { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 2mm; border-bottom: 1.5px solid #333; margin-bottom: 0; }
  .tbl-name { font-size: 16pt; font-weight: 700; color: #1a1a1a; }
  .info-tbl { width: 100%; border-collapse: collapse; }
  .info-tbl td { border: 1px solid #c9cdd4; padding: 1.6mm 2.4mm; font-size: 9.5pt; }
  .info-tbl td.lab { width: 15mm; background: #f5f6f8; color: #666; text-align: center; }
  .info-tbl td.val { color: #333; width: 35%; }

  /* 板块标题 */
  .sec-title { font-size: 12.5pt; font-weight: 700; margin: 4.5mm 0 2.5mm; }
  .st-block { background: var(--c); color: #fff; padding: 1.6mm 3mm; letter-spacing: 2px; }
  .st-ul { color: var(--c); border-bottom: 1.2px solid var(--c); padding-bottom: 1mm; }
  .st-bar { position: relative; padding-left: 4mm; color: #1a1a1a; }
  .st-bar::before { content: ''; position: absolute; left: 0; top: 1mm; bottom: 1mm; width: 1.3mm; background: var(--c); }
  .st-bwen .en { font-size: 12pt; color: #111; font-family: Arial, sans-serif; letter-spacing: 1px; }
  .st-bwen .cn { font-size: 9pt; color: #999; margin-left: 3mm; font-weight: 400; }
  .st-thin { color: #1a1a1a; border-bottom: 1px solid #d8d8d8; padding-bottom: 1mm; }

  /* 条目 */
  .item { margin-bottom: 3.4mm; }
  .item-head { display: flex; justify-content: space-between; align-items: baseline; }
  .item-name { font-weight: 700; font-size: 10.5pt; color: #1a1a1a; }
  .item-right { font-size: 9.5pt; color: #999; white-space: nowrap; margin-left: 6mm; }
  .item-sub { font-size: 10pt; color: #444; margin: 0.6mm 0; }
  .bullets { padding-left: 5mm; }
  .bullets li { font-size: 10.5pt; color: #333; margin-bottom: 0.8mm; }
  .text-block .skill-line { margin-bottom: 1mm; }
  .summary { color: #1a1a1a; text-align: justify; }

  /* 侧栏布局 */
  .layout { display: flex; min-height: 269mm; }
  .sidebar { width: 62mm; background: var(--c); color: #fff; padding: 10mm 7mm; margin: -14mm 0 -14mm -11mm; }
  .rv-side-light .sidebar { background: #f7fafc; color: #2d3748; border-right: 1px solid #e2e8f0; }
  .main { flex: 1; padding-left: 8mm; }
  .side-ava { text-align: center; margin-bottom: 8mm; }
  .side-ava img { width: 26mm; height: 33mm; object-fit: cover; border-radius: 1mm; border: 2px solid rgba(255,255,255,0.7); }
  .rv-side-light .side-ava img { border-color: #cbd5e0; }
  .side-title { font-size: 12pt; font-weight: 700; margin: 6mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1px solid rgba(255,255,255,0.35); }
  .rv-side-light .side-title { border-bottom-color: #cbd5e0; }
  .side-contact-row { font-size: 9.5pt; margin-bottom: 2mm; line-height: 1.4; }
  .side-lab { display: block; font-size: 8.5pt; opacity: 0.75; }
  .side-val { word-break: break-all; }
  .side-skill-line { font-size: 9.5pt; margin-bottom: 2mm; line-height: 1.5; }

  /* 免费水印（每页固定） */
  .pdf-watermark { position: fixed; bottom: 6mm; left: 0; right: 0; text-align: center; font-size: 9pt; color: #b6b9bf; }

  /* ===== V4 模板变体 ===== */
  .st-code { color: #6a9955; font-family: Consolas, Menlo, monospace; border-bottom: none; }
  .st-code::before { content: '// '; }
  .rv-wide-margin { padding: 18mm 18mm 14mm; }
  .rv-dual-title .st-bwen .cn { color: #999; }

  /* 无照片占位框 */
  .hd-ava-ph { width: 21mm; height: 26.5mm; border: 0.3mm dashed #c8ccd4; background: #f5f6f8; border-radius: 1mm; display: flex; align-items: center; justify-content: center; color: #aab0b8; font-size: 9pt; flex-shrink: 0; }
  .side-ava-ph { width: 26mm; height: 33mm; margin: 0 auto 8mm; border: 0.3mm dashed rgba(255,255,255,0.6); border-radius: 1mm; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.8); font-size: 9pt; }

  /* B8 右侧栏 / B9 渐变侧栏 */
  .layout-right { flex-direction: row-reverse; }
  .layout-right .main { padding-left: 0; padding-right: 8mm; }
  .sidebar-gradient { background: linear-gradient(165deg, #1e3a5f 0%, #5b82c4 100%); }

  /* C1 技能进度条 */
  .skill-bar-cat { font-weight: 700; font-size: 10pt; margin: 2mm 0 1mm; }
  .skill-bar-row { display: flex; align-items: center; margin-bottom: 1.2mm; }
  .skill-bar-name { width: 32mm; flex-shrink: 0; font-size: 9.5pt; color: #333; }
  .skill-bar-track { flex: 1; height: 1.6mm; background: #eef1f6; border-radius: 1mm; overflow: hidden; }
  .skill-bar-fill { display: block; height: 100%; background: var(--c); }
  /* C2 标签云 */
  .skill-tag-cat { font-weight: 700; font-size: 10pt; margin: 2mm 0 1mm; }
  .skill-tag-wrap span.skill-tag { display: inline-block; font-size: 9.5pt; color: var(--c); border: 0.3mm solid rgba(30,58,95,0.2); background: rgba(30,58,95,0.06); border-radius: 4mm; padding: 0.6mm 3mm; margin: 0 2mm 2mm 0; }

  /* C4 卡片经历 / C5 时间轴 / C6 双列 */
  .rv-tech-card .item { background: #f8fafc; border: 0.3mm solid #e5e9f0; border-radius: 3mm; padding: 3mm; margin-bottom: 3mm; }
  .rv-tech-timeline .item { position: relative; margin-left: 2mm; padding-left: 5mm; border-left: 0.8mm solid var(--c); }
  .rv-tech-timeline .item::before { content: ''; position: absolute; left: -1.6mm; top: 1.6mm; width: 2.2mm; height: 2.2mm; border-radius: 50%; background: #fff; border: 0.7mm solid var(--c); }
  .rv-tech-double .main, .rv-tech-double:not(.rv-sidebar) { column-count: 2; column-gap: 7mm; }
  .rv-tech-double .hd, .rv-tech-double .sec-title { column-span: all; }
  .rv-tech-double .sec { break-inside: avoid; }

  /* D 创意风 */
  .rv-cre-flourish .st-ul::before, .rv-cre-flourish .st-bar::before { content: '❀ '; }
  .rv-ava-circle .hd-ava, .rv-ava-circle .hd-ava-ph { width: 24mm; height: 24mm; border-radius: 50%; }
  .rv-cre-wave { position: relative; }
  .rv-cre-wave::after { content: ''; position: fixed; left: -30mm; right: -30mm; bottom: -34mm; height: 60mm; border-radius: 50% 50% 0 0; background: var(--c); opacity: 0.09; }
  .rv-cre-hand .hd-name, .rv-cre-hand .sec-title { font-family: "KaiTi","STKaiti","SimSun",cursive; }
  .rv-cre-hand .sec-title { font-size: 15pt; }
</style>
</head>
<body>
${body}
${watermark}
</body>
</html>`;
}

// 动态加载 puppeteer（由层提供；未配置时返回 null）
function loadPuppeteer() {
  const candidates = ['puppeteer', 'puppeteer-core', 'chrome-aws-lambda'];
  for (const name of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(name);
      if (mod && (mod.launch || (mod.executablePath && mod.puppeteer))) return { name, mod };
    } catch (e) {
      console.warn('[exportPdf] 未找到依赖：', name, e.code || e.message);
    }
  }
  return null;
}

async function htmlToPdfBuffer(html) {
  const engine = loadPuppeteer();
  if (!engine) {
    const err = new Error('PDF_GENERATE_UNAVAILABLE');
    err.code = 'PDF_GENERATE_UNAVAILABLE';
    throw err;
  }
  let browser;
  try {
    // 允许通过环境变量显式指定自部署的 chromium 路径（puppeteer-core 场景）
    const chromiumPath = process.env.CHROMIUM_PATH || '';
    const launchOpts = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      ...(chromiumPath ? { executablePath: chromiumPath } : {})
    };
    if (engine.name === 'chrome-aws-lambda') {
      launchOpts.executablePath = engine.mod.executablePath;
      // chrome-aws-lambda 自带 puppeteer 导出
      const puppeteer = engine.mod.puppeteer || require('puppeteer-core');
      browser = await puppeteer.launch(launchOpts);
    } else {
      browser = await engine.mod.launch(launchOpts);
    }
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return pdf;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
  }
}

const mainHandler = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const r = event.resume || {};
  const isVip = !!event.isVip;
  console.log('[exportPdf] 收到请求', { templateId: r.templateId, fileName: event.fileName, isVip });
  try {
    const meta = TEMPLATE_META[r.templateId] || TEMPLATE_META.a1;

    // 头像：云文件 ID → 临时 URL（失败则无头像，不阻塞）
    let avatarUrl = '';
    const fileID = r.basics && r.basics.avatarFileID;
    if (fileID && /^cloud:\/\//.test(fileID)) {
      try {
        const res = await cloud.getTempFileURL({ fileList: [fileID] });
        avatarUrl = (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || '';
      } catch (e) {
        console.warn('[exportPdf] 头像临时链接获取失败', e);
      }
    } else if (fileID) {
      avatarUrl = fileID;
    }

    const html = buildHtml(r, meta, isVip, avatarUrl);
    let pdfBuffer;
    try {
      pdfBuffer = await htmlToPdfBuffer(html);
    } catch (e) {
      if (e.code === 'PDF_GENERATE_UNAVAILABLE') {
        return { code: 500, message: 'PDF_GENERATE_UNAVAILABLE' };
      }
      throw e;
    }

    const safeName = String(event.fileName || '我的简历').replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 30) || '我的简历';
    const cloudPath = `pdf/${OPENID || 'anon'}_${Date.now()}_${safeName}.pdf`;
    const up = await cloud.uploadFile({ cloudPath, fileContent: pdfBuffer });
    return { code: 0, data: { fileID: up.fileID } };
  } catch (e) {
    console.error('[exportPdf] 生成失败', e);
    return { code: 500, message: 'PDF 生成失败，请稍后重试' };
  }
};

// ---------- 统一出口：兼容旧 code 契约 + 新 success/error 结构，兜底所有未捕获异常 ----------
exports.main = async (event = {}) => {
  let result;
  try {
    result = await mainHandler(event);
  } catch (e) {
    console.error('[exportPdf] 未捕获异常', e);
    result = { code: 500, message: 'PDF_GENERATE_UNAVAILABLE' };
  }
  result.success = result.code === 0;
  if (!result.success) result.error = result.error || result.message || 'PDF_GENERATE_UNAVAILABLE';
  console.log('[exportPdf] 返回', { success: result.success, code: result.code });
  return result;
};
