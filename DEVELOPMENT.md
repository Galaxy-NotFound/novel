# 小说架构本 · 开发文档

> 给接手修改的人 / AI 看。改代码前请先读完本文件，改完后同步更新本文件。

## 1. 项目概述

- **用途**：离线的长篇小说结构整理工具（设定、架构、角色、章节蓝图、伏笔、正文），参考开源项目 Pagekin 的「梳理」部分，**不调用任何 AI**。
- **形态**：PWA（可安装的网页应用），主要在安卓手机 / 平板的 Chrome 上「添加到主屏幕」使用，电脑浏览器也可用。
- **线上地址**：https://galaxy-notfound.github.io/novel/
- **仓库**：https://github.com/Galaxy-NotFound/novel （`main` 分支根目录由 GitHub Pages 直接发布）
- **本地路径**：`D:\antigravity\storage\NovelOutliner`

## 2. 技术约束（重要，请遵守）

| 约束 | 原因 |
|---|---|
| 纯原生 HTML / CSS / JS，**无框架、无构建步骤、无 npm 依赖** | 改完刷新即生效，直接推送即部署，任何 AI 都能读懂 |
| 不引入 CDN 外链资源 | 必须完全离线可用 |
| 所有数据只存在设备本地（IndexedDB） | 隐私；无服务器 |
| 界面文字为简体中文 | 用户需求 |
| 同时适配手机（<760px）和平板/电脑（≥761px） | 用户两种设备都用 |

## 3. 文件结构

```
index.html     入口，只有 <div id="app"> 和脚本引用
style.css      全部样式；@media (max-width:760px) 内是手机布局
app.js         全部逻辑（单文件，按区块组织，见第 5 节）
sw.js          Service Worker 离线缓存；含 CACHE 版本号
manifest.json  PWA 安装信息（名称、图标、主题色）
icon.svg       图标
README.md      面向使用者的简介
DEVELOPMENT.md 本文件
```

## 4. 数据模型

所有作品作为一个数组存在 IndexedDB：库名 `novel-outliner`，对象仓库 `kv`，键 `books`。修改后 300ms 防抖自动保存（`save()`）。

```js
Book {
  id, title, genre, audience,
  totalChapters: number, wordsPerChapter: number,
  premise, world, outline,          // 架构三节文本（角色名单取自 characters）
  characters: Character[],
  chapters:   Chapter[],            // 数组顺序即章节顺序，no 由 renumber() 维护
  threads:    Thread[],
  updated: timestamp
}
Character {
  id, name, role, profile, status,
  alive: boolean, deathChapter: number|'',
  relations: [{ targetId, desc }],  // targetId 指向同书其他角色 id
  timeline:  [{ chapter, note }],   // 按章的状态/关系变化
  images:    [{ src, caption }]     // src 为压缩后的 JPEG dataURL（长边≤1600px）
}
Chapter {
  id, no, title, goal, conflict, hook,
  cast: characterId[],              // 出场人物
  text,                             // 正文
  status: 'plan' | 'draft' | 'final',
  note
}
Thread {
  id, title, type: '主线'|'支线'|'伏笔',
  plant, due, resolvedAt: number|'',   // 埋设章 / 到期章 / 回收章
  resolved: boolean, note
}
```

**加字段的兼容规则**：旧数据里没有新字段，读取时必须容错（如 `c.images || []`、`?.`）。不要写迁移脚本覆盖用户数据，除非确有必要且先导出备份。

## 5. app.js 结构

按顺序分为以下区块（文件中以 `// ============ 名称 ============` 分隔）：

1. **数据层**：`DB.open/get/set`、`books` 全局数组、`save()`、工具函数 `uid / esc / words`、工厂函数 `newBook / newChar / newChapter / newThread`、常量 `STATUS / THREAD_TYPES`。
2. **路由**：基于 hash。`#/` 书房；`#/b/<书ID>/<页签>/<选中项ID>`。`route()` 解析，`go(hash)` 跳转，`hashchange` 触发 `render()`。安卓返回键天然可用。
3. **视图函数**：每个页面一个函数，返回 HTML 字符串，`render()` 整体替换 `#app.innerHTML`。
   - `viewLibrary` 书房
   - `viewBook` 作品页框架（顶栏 + 导航 + 内容），页签表 `TABS`
   - `viewOverview` 概览+设定 / `viewArch` 架构 / `viewChars` 角色 / `viewPlan` 蓝图 / `viewThreads` 伏笔 / `viewWrite` 正文 / `viewCheck` 规则检查
4. **事件处理**（全部用事件委托挂在 `#app` 上）：
   - `click`：读取 `data-act`，在 `switch` 中处理（新增、删除、移动、导出、上传图片等）。默认分支末尾统一 `touch(b); render();`。
   - `change`：复选框、下拉框 → `applyField` 后重渲染；出场人物复选框单独处理（`data-act="cast"`）。
   - `input`：文本框实时写回数据，**不重渲染**（保持光标位置），正文页顺带更新字数。
   - `keydown`：正文中 Tab 插入两个全角空格。
5. **启动**：打开数据库 → 读取 → 申请持久化存储 → 渲染 → 注册 Service Worker（file:// 下跳过）。

### 表单绑定约定（最常用）

输入控件用 `data-o`（对象）+ `data-f`（字段）声明绑定，由 `applyField()` 统一写回：

| data-o | 指向对象 |
|---|---|
| `book` | 当前作品 |
| `char` | 当前选中角色（路由 sel） |
| `ch` | 当前选中章节（路由 sel） |
| `rel:i` / `tl:i` / `img:i` | 当前角色的第 i 条关系 / 时间线 / 设定图 |
| `th:i` | 当前作品第 i 条线索 |

辅助函数：`inp(o, f, value, placeholder, type)` 生成 input；`txt(o, f, value, placeholder, cls)` 生成 textarea。`type="number"` 会自动转数字，空值存 `''`。

**新增一个对象类型的绑定**：在 `applyField` 里的映射表加一项即可。

### 列表 + 详情布局

角色 / 蓝图 / 正文页使用 `.split` 布局：外层加 `has-detail` 类表示已选中项。手机上只显示列表或详情之一，详情顶部的 `.back-m` 按钮（`data-act="unsel"`）返回列表；平板/电脑上左右并排且隐藏该按钮。

## 6. 常见修改方法

- **给某对象加字段**：① 工厂函数加默认值 ② 视图里加 `inp/txt` ③ 如需导出，在 `bookToTxt` 中加一行 ④ 旧数据容错。
- **加一个新页签**：① `TABS` 中加 `['key','名称']` ② 写 `viewXxx(b, r)` ③ 在 `viewBook` 的 `views` 映射中注册。手机底部导航可横向滚动，但页签过多会拥挤。
- **加按钮动作**：HTML 上写 `data-act="xxx"`，在 click 的 `switch` 中加 `case 'xxx'`。需要重渲染就 `break`，否则 `return`。
- **加检查规则**：在 `viewCheck` 中 `issues.push(['warn'|'', '描述'])`，`warn` 显示为「矛盾」，空串为「提醒」。
- **改导出格式**：`bookToTxt(b)`。导出文件带 BOM、CRLF，便于 Windows 记事本打开。
- **改样式/配色**：`style.css` 顶部 `:root` 变量。

### 安全注意
所有用户输入插入 HTML 前必须经过 `esc()`，否则会有 XSS / 页面错乱。图片 `src` 只来自本地压缩生成的 dataURL。

## 7. 发布流程（每次修改后必做）

1. **把 `sw.js` 里的 `CACHE` 版本号 +1**（如 `outliner-v2` → `outliner-v3`）。不改的话已安装的设备一直用旧缓存。
2. 如果新增了文件，加入 `sw.js` 的 `FILES` 数组。
3. 语法检查：`node --check app.js`
4. 提交推送：
   ```powershell
   cd D:\antigravity\storage\NovelOutliner
   git add -A
   git commit -m "说明改了什么"
   git push
   ```
   本仓库已配置 `http.proxy=http://127.0.0.1:7897`（本机代理）；推送凭据为 GitHub Fine-grained token（仅 novel 仓库 Contents 读写，90 天过期，过期需重新生成）。
5. 1～2 分钟后 GitHub Pages 自动更新。设备上联网打开应用，必要时关闭重开一次即得新版。

## 8. 本地调试

- 最简单：双击 `index.html`（file:// 下不注册 Service Worker，其余功能正常）。
- 测试离线/PWA：在目录下 `python -m http.server 8000`，浏览器开 `http://localhost:8000`。
- 测手机布局：浏览器开发者工具切换设备模式，或窗口宽度调到 760px 以下。
- 注意：file:// 与 localhost 与线上网址的 IndexedDB **互相独立**，数据不共通。

## 9. 已知限制 / 待办想法

- 数据不跨设备同步，靠「全部备份 / 导入备份」(JSON) 迁移；导入时同 id 作品会被覆盖。
- 图片以 dataURL 存在数据库中，图多时备份 JSON 会变大。
- 每次点击操作都整页重渲染，数据量很大时可能变慢（目前规模无问题）。
- 章节排序只有上移/下移，没有拖拽。
- 无撤销功能；删除作品/章节/角色不可恢复（有确认框）。
- 可考虑的迭代：深色主题、全书搜索、关系图可视化、章节拖拽排序、WebDAV 同步、导出 Markdown。

## 10. 修改记录

| 版本(CACHE) | 内容 |
|---|---|
| v1 | 初版：书房、设定、架构、角色(关系/时间线)、蓝图、伏笔、正文、规则检查、TXT 导出、JSON 备份 |
| v2 | 角色设定图：本地上传多张、压缩、说明、全屏查看、删除 |
