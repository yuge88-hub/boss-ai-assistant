# BOSS直聘自动化技术参考

---

## 一、搜索职位并批量打招呼（search-greet）

### 命令
```bash
OPENCLI_BROWSER_COMMAND_TIMEOUT=300 opencli boss search-greet "营养师" --city 北京 --limit 15 --verbose
OPENCLI_BROWSER_COMMAND_TIMEOUT=300 opencli boss search-greet "健康管理师" --city 北京 --limit 15 --verbose
```

### 流程说明
1. 导航到搜索页 `https://www.zhipin.com/web/geek/jobs?query=XXX&city=101010100`
2. 从 `.rec-job-list > li` 读取职位卡片（通过 `a[href*="job_detail"]` 找到职位链接）
3. 逐个点击职位卡片（按职位名称匹配）
4. 在右侧详情页找到"立即沟通"按钮并点击
5. **验证成功**：等待1.5秒后检查按钮是否变为"继续沟通"或消失 → `changed-to-continue` / `btn-gone`
6. 如按钮还在（`btn-still-there`），标记为 `unverified`
7. 如已显示"继续沟通"（`already-greeted`），跳过

### 验证标准
| 状态 | 含义 |
|------|------|
| `changed-to-continue` | 按钮变为"继续沟通"，确认发送成功 |
| `already-greeted` | 之前已打过招呼，跳过 |
| `unverified` | 点击了但按钮没变化 — 可能没发出去 |
| `skipped` | 没有"立即沟通"按钮 |

### 环境变量
- `OPENCLI_BROWSER_COMMAND_TIMEOUT=300` — 必须设置，默认60s不够15个职位

### 页面结构
- 职位列表：`.rec-job-list` (UL)
- 职位名：`[class*="job-name"]`
- 薪资：`[class*="red"]`
- 公司名：`[class*="company-name"]`
- 搜索URL（注意是 `jobs` 复数）：`https://www.zhipin.com/web/geek/jobs?query=XXX&city=101010100`

---

## 二、发简历 / 换微信 / 换电话（send --exchange）

### 命令
```bash
# 发简历
opencli boss send "<人名>" --exchange resume --side geek --verbose

# 换微信
opencli boss send "<人名>" --exchange wechat --side geek --verbose

# 换电话
opencli boss send "<人名>" --exchange phone --side geek --verbose

# 普通发消息
opencli boss send "<人名>" "消息内容" --side geek --verbose
```

### 重要规则
1. **用人名匹配，不用公司名**：公司名在列表中会被截断（如"温州市鹿城区张翠..."），用人名最可靠
2. **不要用 --keep-tab true**：会导致页面过期（stale page identity）
3. **三个按钮位置**：发简历、换微信、换电话在聊天界面底部输入区附近，同一行。点击任何一个时，旁边必须能看到另外两个——否则点错了
4. **先看聊天记录再操作**：如果某个操作已做过（按钮变灰 `unable`），不要再做

### 验证标准
看 debug 输出（需加 `--verbose`）：
```
sureFound: true       ← 弹窗确认按钮被找到
sureCls: btn-v2 btn-sure-v2  ← 确认按钮的CSS class
sureTxt: "确定"        ← 确认按钮的文字
clickCls: btn-weixin toolbar-btn tooltip tooltip-top  ← 被点击的按钮（必须含 toolbar-btn，不能是 toolbar-btn-content）
```

### 换微信特殊情况
如对方已主动发起交换邀请，弹窗无确认按钮（`sureFound: false` 但实际已完成），对话中会显示微信号。

### 按钮CSS class对照
| 按钮 | 正确class（要点的） | 错误class（会跳过的） |
|------|---------------------|----------------------|
| 发简历 | `toolbar-btn tooltip tooltip-top` | `toolbar-btn-content` |
| 换微信 | `btn-weixin toolbar-btn tooltip tooltip-top` | `toolbar-btn-content` |
| 换电话 | `toolbar-btn-content btn-contact toolbar-btn tooltip tooltip-top` | — |
| 确认弹窗 | `.btn-sure-v2`（文字"确定"） | — |

---

## 三、给客户回复消息（send）

### 命令
```bash
opencli boss send "<人名>" "消息内容" --side geek --verbose
```

### 示例
```bash
# 简单回复
opencli boss send "郭女士" "您好，看到您的招聘信息，我对这个岗位很感兴趣，方便详细聊聊吗？" --side geek --verbose

# 带换行的长消息
opencli boss send "王先生" "感谢您的回复！我明天上午十点有空，到时候见。" --side geek --verbose
```

### 流程说明
1. 导航到聊天页 `https://www.zhipin.com/web/geek/chat`
2. 按人名搜索聊天列表中的 `<li>` 元素
3. 点击头像 `<img>` 触发 Vue 加载对话面板
4. 等待 `[contenteditable="true"]` 输入框出现
5. 用 `document.execCommand('insertText', false, msg)` 输入文字
6. 500ms 后点击 `.btn-send`（检查不含 `.disabled`）或按 Enter 发送

### 验证标准
- 返回 `status: sent`
- detail 包含 `Geek: sent to <人名>: <消息内容>`

### 关键实现细节
- 输入框是 `div.chat-input[contenteditable=true]`，不是 textarea
- **必须用 `execCommand('insertText')`**，不能直接设置 textContent
- 发送按钮 `.btn-send`，发送前检查不含 `.disabled` 类
- 发送后触发 `input` 和 `change` 事件让 Vue 响应

---

## 四、页面管理（最关键！）（最关键！）

### 问题
- `opencli boss chatlist` 和 `opencli boss send` 和 `opencli boss search-greet` 使用不同页面池
- 每次命令执行后页面可能被释放，下次调用分配到过期页面
- 错误信息：`Page not found: XXX — stale page identity`

### 解决方案
**每个命令可能需要执行2次**：
1. 第一次：可能报 `stale page identity`（页面过期）
2. 第二次：页面活了，正常执行
3. 如果第二次还是 stale，杀守护进程重来

### 杀守护进程
```bash
powershell -Command "Get-Process node | Where-Object { \$_.CommandLine -like '*daemon*' } | ForEach-Object { Stop-Process -Id \$_.Id -Force }"
sleep 5  # 等守护进程自动重启
```

### 预热页面池
```bash
opencli boss chatlist --limit 2 -f json  # 预热chatlist/send页面
# 或直接运行目标命令（第一次可能失败，第二次成功）
```

---

## 四、代码修复记录（send.js）

### 修复1：跳过文字容器（2026-05-27）
**问题**：`toolbar-btn-content` 只是文字容器，Vue 事件绑定在兄弟元素 `toolbar-btn` 上。代码原点击第一个匹配元素，总是点到 `toolbar-btn-content`，操作无效。

**修复**：跳过仅有 `toolbar-btn-content` 不含 `toolbar-btn` 的元素：
```javascript
if (btn.classList.contains('toolbar-btn-content') && !btn.classList.contains('toolbar-btn')) {
  continue;
}
```

### 修复2：延长弹窗等待（2026-05-27）
**问题**：`setTimeout 800ms` 不够，弹窗还没渲染，`.btn-sure-v2` 找不到。

**修复**：改为 `setTimeout 1500ms`

### 修复3：扩展确认按钮搜索（2026-05-27）
**问题**：原先只搜 `.btn-sure-v2`，换UI后或换微信弹窗结构不同时找不到。

**修复**：多级搜索：
1. CSS选择器：`.btn-sure-v2`, `.btn-sure`, `.btn-confirm`, `[class*="sure"]`, `[class*="confirm"]`, `.van-dialog__confirm`, `.btn-primary`, `.btn-ok`
2. 真正按钮元素（`button, [role="button"], a.btn, span[class*="btn"]`）文字匹配"确定/确认/发送"
3. 兜底：span/div 自身文本匹配"确定/确认"

---

## 五、搜索命令

```bash
opencli boss search "营养师" --city 北京 --limit 15 -f json
opencli boss search "健康管理师" --city 北京 --limit 15 -f json
```

---

## 六、聊天列表

```bash
opencli boss chatlist --limit 50 -f json
```

---

## 七、文件路径与同步

### 源文件
- `clis/boss/send.js` — 发消息/发简历/换微信/换电话
- `clis/boss/search-greet.js` — 搜索并批量打招呼
- `cli-manifest.json` — 命令注册清单

### 全局同步
将项目目录下的文件同步到 opencli 的全局安装目录（路径根据实际安装位置调整）：
```bash
# 示例：将本地修改同步到全局 node_modules
cp clis/boss/send.js "$(npm root -g)/@jackwener/opencli/clis/boss/send.js"
cp clis/boss/search-greet.js "$(npm root -g)/@jackwener/opencli/clis/boss/search-greet.js"
cp cli-manifest.json "$(npm root -g)/@jackwener/opencli/cli-manifest.json"
```

---

## 八、调试

- `--verbose`：查看 debug 输出（按钮搜索、确认按钮状态、验证结果）
- `--trace on`：保存完整 trace 到 `~/.opencli/profiles/default/traces/`
- 守护进程由 opencli 自动管理，杀进程后会自动重启

### send --exchange debug 字段
| 字段 | 含义 |
|------|------|
| `clicked` | 工具栏按钮是否找到并点击 |
| `clickCls` | 被点击按钮的 class |
| `sureFound` | 弹窗确认按钮是否找到 |
| `sureCls` | 确认按钮的 class |
| `sureTxt` | 确认按钮的文字 |
| `debug` | 所有可见工具栏元素列表 |

### search-greet 验证字段
| 字段 | 含义 |
|------|------|
| `changed-to-continue` | 按钮变了，确认成功 |
| `already-greeted` | 之前已打过招呼 |
| `btn-gone` | 按钮消失了 |
| `btn-still-there` | 按钮还在，可能没成功 |
| `no-greet-btn` | 根本没找到"立即沟通" |

---

## 九、Cookie过期处理

当所有命令都报错时，需在Chrome手动登录 zhipin.com 刷新Cookie。
