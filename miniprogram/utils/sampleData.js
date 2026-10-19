// utils/sampleData.js 示例简历（蓝本 1.6：虚构张三，2段实习、2个项目）
// 首次进入空状态时一键填充，让用户先体验再改成自己的
const { DEFAULT_SECTION_ORDER } = require('./constants');
const { uid } = require('./util');

function buildSampleResume() {
  return {
    title: '示例简历 · 张三',
    templateId: 'a1',
    themeColor: '#555555',
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    basics: {
      name: '张三',
      phone: '138-0000-0000',
      email: 'zhangsan@example.com',
      city: '上海',
      jobIntent: '后端开发（实习）',
      github: 'github.com/zhangsan-demo',
      blog: '',
      wechat: ''
    },
    education: [
      {
        id: uid(),
        school: '某某大学',
        degree: '本科',
        major: '计算机科学与技术',
        start: '2021.09',
        end: '2025.06',
        gpa: '3.6/4.0（专业前 15%）',
        courses: '数据结构、操作系统、计算机网络、数据库原理',
        highlights: ['获校级一等奖学金（2022、2023 连续两年）']
      }
    ],
    experience: [
      {
        id: uid(),
        company: '某互联网公司',
        role: '后端开发实习生',
        city: '上海',
        start: '2024.06',
        end: '2024.09',
        bullets: [
          '主导订单查询接口性能优化，通过引入 Redis 缓存与慢查询治理，将接口平均耗时从 850ms 降至 120ms，日均稳定支撑 200 万次调用',
          '设计并落地运营活动配置后台，支持 5 类活动模板的可视化配置，将活动上线周期由 3 天缩短至 4 小时'
        ]
      },
      {
        id: uid(),
        company: '某科技公司',
        role: '数据分析实习生',
        city: '远程',
        start: '2023.07',
        end: '2023.09',
        bullets: [
          '搭建用户行为日报自动化脚本（Python + SQL），替代人工取数流程，每周为运营团队节省约 6 小时',
          '分析 12 万条注册转化数据，定位 2 个关键流失环节，推动落地页改版后注册转化率提升 18%'
        ]
      }
    ],
    projects: [
      {
        id: uid(),
        name: '校园二手交易平台',
        role: '独立开发者',
        start: '2024.03',
        end: '2024.06',
        techStack: ['微信小程序', '云开发', 'Node.js'],
        bullets: [
          '独立完成从产品设计到上线的全流程，覆盖商品发布、搜索、即时沟通等 12 个核心页面',
          '上线 3 个月累计注册用户 2400+，月成交额突破 1.2 万元'
        ]
      },
      {
        id: uid(),
        name: '分布式短链接服务',
        role: '核心开发',
        start: '2023.10',
        end: '2023.12',
        techStack: ['Go', 'Redis', 'MySQL'],
        bullets: [
          '基于发号器与布隆过滤器设计短链生成方案，通过 QPS 3000 压力测试，冲突率低于 0.001%',
          '实现访问统计与过期清理策略，并输出 3000 字技术复盘文档'
        ]
      }
    ],
    campus: [
      {
        id: uid(),
        org: '校学生会技术部',
        role: '部长',
        start: '2022.09',
        end: '2023.06',
        bullets: ['统筹 8 人团队完成迎新系统等 3 个校园项目交付，累计服务新生 4000 余人']
      }
    ],
    skills: [
      { id: uid(), category: '编程语言', items: ['Java', 'Python', 'Go', 'SQL'] },
      { id: uid(), category: '框架与工具', items: ['Spring Boot', 'Redis', 'MySQL', 'Git', 'Docker'] },
      { id: uid(), category: '英语', items: ['CET-6 560'] }
    ],
    certificates: [
      { id: uid(), name: '大学生程序设计竞赛 省级二等奖', issuer: '主办单位：省计算机学会', date: '2023.05' },
      { id: uid(), name: '校级一等奖学金', issuer: '某某大学', date: '2023.10' }
    ],
    summary:
      '计算机专业应届本科生，具备后端开发与数据分析两段实习经历，熟悉高并发接口优化与数据驱动决策。独立主导过 3 个完整项目从 0 到 1 落地，习惯用量化结果验证工作价值，希望在后端开发方向持续深耕。'
  };
}

module.exports = { buildSampleResume };
