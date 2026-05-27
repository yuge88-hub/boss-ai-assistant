#!/bin/bash
# BOSS求职助手 - 一键安装脚本
# 将 search-greet 和修复版 send 安装到 opencli 全局目录

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 找到 opencli 全局安装目录
OPENCLI_DIR=$(node -e "try{console.log(require.resolve('@jackwener/opencli/package.json'))}catch(e){console.log('')}" 2>/dev/null)
if [ -z "$OPENCLI_DIR" ]; then
    OPENCLI_DIR=$(npm root -g 2>/dev/null)/@jackwener/opencli/package.json
fi

if [ ! -f "$OPENCLI_DIR" ]; then
    echo "❌ 找不到 opencli，请先安装：npm i -g @jackwener/opencli"
    exit 1
fi

OPENCLI_ROOT=$(dirname "$OPENCLI_DIR")
BOSS_DIR="$OPENCLI_ROOT/clis/boss"
MANIFEST="$OPENCLI_ROOT/cli-manifest.json"

echo "📂 opencli 目录: $OPENCLI_ROOT"

# 1. 复制命令文件
cp "$SCRIPT_DIR/search-greet.js" "$BOSS_DIR/search-greet.js"
cp "$SCRIPT_DIR/send.js" "$BOSS_DIR/send.js"
echo "✅ 命令文件已复制"

# 2. 注册 search-greet 到 manifest（如果还没注册）
if grep -q '"search-greet"' "$MANIFEST" 2>/dev/null; then
    echo "⏭️  search-greet 已注册，跳过"
else
    # 在 search.js 条目后插入 search-greet 条目
    node -e "
const fs = require('fs');
let m = JSON.parse(fs.readFileSync('$MANIFEST','utf8'));
// Check if already exists
if (m.find(x => x.name === 'search-greet')) {
    console.log('Already registered');
    process.exit(0);
}
// Find search.js entry position
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
console.log('Registered search-greet');
"
    echo "✅ search-greet 已注册"
fi

echo ""
echo "🎉 安装完成！现在可以使用 opencli boss search-greet 了"
echo "   opencli boss search-greet \"关键词\" --city 北京 --limit 15"
