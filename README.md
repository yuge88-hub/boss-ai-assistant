# BOSS AI Assistant

> BOSS直聘全流程 AI 求职助手 — Claude Code Skill

六阶段全自动：搜索打招呼 → 筛选对话 → 智能诊断 → 执行操作 → 循环监控 → 分类报告。

## 快速开始

```bash
# 1. 安装 opencli
npm i -g @jackwener/opencli

# 2. 克隆本仓库到 Claude Code skills 目录
git clone https://github.com/xxx/boss-ai-assistant.git ~/.claude/skills/boss-ai-assistant

# 3. 一键安装
cd ~/.claude/skills/boss-ai-assistant
bash scripts/install.sh

# 4. 在 Chrome 登录 zhipin.com，然后在 Claude Code 中说：
#   "帮我搜营养师岗位并打招呼"
```

## 能做什么

| 功能 | 说明 |
|------|------|
| 搜索打招呼 | 按关键词搜职位，逐个点击"立即沟通" |
| 智能回复 | 看消息内容判断意图，自动生成回复 |
| 发简历 | 检测按钮状态，没发过的自动发 |
| 换微信/电话 | 对方要联系方式时自动交换 |
| 循环监控 | 操作完等5~10分钟，回头检查新回复 |
| 分类报告 | A/B/C 分类 + 联系方式汇总 + 下一步建议 |

## 项目结构

```
├── SKILL.md               AI 工作流指令
├── scripts/
│   ├── install.sh         一键安装脚本
│   ├── search-greet.js    搜索+打招呼命令
│   └── send.js            发消息/简历/微信/电话命令
├── references/
│   └── technical-guide.md 技术参考
└── examples/
    └── 实战复盘.md        实际使用案例
```

## 依赖

- [opencli](https://www.npmjs.com/package/@jackwener/opencli) — BOSS直聘 CLI
- Claude Code 或支持 Skill 的 Claude 客户端
- Chrome 浏览器（已登录 BOSS直聘）

## License

MIT
