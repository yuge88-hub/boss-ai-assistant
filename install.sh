#!/bin/bash
# BOSS求职助手 - 一键安装脚本
# 1. 安装 Claude Code skills（boss-ai-assistant + interview-prep）
# 2. 安装 opencli 命令扩展（search-greet + 修复版 send）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="${HOME}/.claude/skills"

echo "=============================="
echo "  BOSS 求职工具集 安装"
echo "=============================="
echo ""

# ============================================
# Part 1: 安装 Claude Code Skills
# ============================================
echo "📦 安装 Claude Code Skills..."

# boss-ai-assistant
if [ -d "$SCRIPT_DIR/skills/boss-ai-assistant" ]; then
    cp -r "$SCRIPT_DIR/skills/boss-ai-assistant" "$SKILLS_DIR/boss-ai-assistant"
    echo "  ✅ boss-ai-assistant"
else
    echo "  ⚠️  boss-ai-assistant 未找到"
fi

# interview-prep
if [ -f "$SCRIPT_DIR/skills/interview-prep/SKILL.md" ]; then
    mkdir -p "$SKILLS_DIR/interview-prep"
    cp "$SCRIPT_DIR/skills/interview-prep/SKILL.md" "$SKILLS_DIR/interview-prep/SKILL.md"
    echo "  ✅ interview-prep"
else
    echo "  ⚠️  interview-prep 未找到"
fi

echo ""

# ============================================
# Part 2: 安装 opencli 命令扩展
# ============================================
echo "🔧 安装 opencli 命令扩展..."

# 找到 opencli 全局安装目录
OPENCLI_DIR=$(node -e "try{console.log(require.resolve('@jackwener/opencli/package.json'))}catch(e){console.log('')}" 2>/dev/null)
if [ -z "$OPENCLI_DIR" ]; then
    OPENCLI_DIR=$(npm root -g 2>/dev/null)/@jackwener/opencli/package.json
fi

if [ ! -f "$OPENCLI_DIR" ]; then
    echo "  ❌ 找不到 opencli，请先安装：npm i -g @jackwener/opencli"
    exit 1
fi

OPENCLI_ROOT=$(dirname "$OPENCLI_DIR")
BOSS_DIR="$OPENCLI_ROOT/clis/boss"
MANIFEST="$OPENCLI_ROOT/cli-manifest.json"

echo "  opencli 目录: $OPENCLI_ROOT"

# 复制命令文件
BOSS_SKILL_DIR="$SCRIPT_DIR/skills/boss-ai-assistant"
if [ -f "$BOSS_SKILL_DIR/scripts/search-greet.js" ]; then
    cp "$BOSS_SKILL_DIR/scripts/search-greet.js" "$BOSS_DIR/search-greet.js"
    echo "  ✅ search-greet.js"
fi

if [ -f "$BOSS_SKILL_DIR/scripts/send.js" ]; then
    cp "$BOSS_SKILL_DIR/scripts/send.js" "$BOSS_DIR/send.js"
    echo "  ✅ send.js"
fi

# 注册 search-greet 到 manifest
if grep -q '"search-greet"' "$MANIFEST" 2>/dev/null; then
    echo "  ⏭️  search-greet 已注册"
else
    node -e "
const fs = require('fs');
let m = JSON.parse(fs.readFileSync('$MANIFEST','utf8'));
if (m.find(x => x.name === 'search-greet')) { process.exit(0); }
const idx = m.findIndex(x => x.name === 'search' && x.site === 'boss');
const entry = {
    site: 'boss', name: 'search-greet',
    description: 'BOSS直聘搜索职位并逐个点击立即沟通',
    access: 'write', domain: 'www.zhipin.com',
    strategy: 'cookie', browser: true,
    args: [
        { name: 'query', type: 'str', required: true, positional: true, help: 'Search keyword' },
        { name: 'city', type: 'str', default: '北京', required: false, help: 'City name' },
        { name: 'limit', type: 'int', default: 10, required: false, help: 'Max results to greet' }
    ],
    columns: ['name', 'company', 'status', 'detail'],
    type: 'js', modulePath: 'boss/search-greet.js', sourceFile: 'boss/search-greet.js',
    navigateBefore: true
};
m.splice(idx + 1, 0, entry);
fs.writeFileSync('$MANIFEST', JSON.stringify(m, null, 2));
"
    echo "  ✅ search-greet 已注册"
fi

echo ""
echo "=============================="
echo "  🎉 全部安装完成！"
echo "=============================="
echo ""
echo "使用方法 — 在 Claude Code 中说："
echo "  '帮我搜营养师岗位并打招呼'"
echo "  '帮我准备XX公司的面试'"
echo "  '看看有没有新消息要回复'"
echo "  '给我出一份今天的求职报告'"
