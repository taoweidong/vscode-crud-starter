# agent.md — AI 编码代理工作约定

> 本文件是 AI 编码代理在本仓库（vscode-starter-template）工作时的**强制约定**。
> 任何会话中修改代码 / 配置 / 文档之前，先读完本文件再动手。

## 项目概述

- **是什么**：VSCode 插件初始化项目（模板）。示例插件提供界面化增删改查（侧边栏树视图 +
  Webview Schema 表单 + 全套菜单/右键菜单示例），外加四个功能页面（环境初始化 / 特性配置 /
  静态配置 / 分支编译出包）与启动任务框架（环境检测）。
- **技术栈**：TypeScript（strict）+ esbuild 打包 + mocha/@vscode/test-electron 集成测试。
- **仓库**：https://github.com/taoweidong/vscode-starter-template
- **扩展内品牌**：CRUD Starter（视图名 / 命令分类 / 输出通道），与项目名是两层概念，勿混改。

## 一键式质量门禁（强制）

```bash
npm run gate
```

- **协议：每次对话结束前必须执行。** 只要本轮改过代码 / 配置 / 文档，收尾前先跑门禁；
  全部步骤通过后才允许向用户报告「完成」或执行 `git commit` / `git push`。
- 门禁内容：① 类型检查（tsc strict）→ ② 生产构建（esbuild --production）→ ③ 测试编译 →
  ④ 静态一致性检查（package.json 清单 ↔ src/constants.ts ↔ 视图 when 条件 ↔ 表单渲染运行时验证，
  内嵌于 `scripts/gate.js`）→ ⑤ 全量单元测试（@vscode/test-electron）。
- **首次运行会自动下载测试用 VS Code**（约 1GB，缓存在 `.vscode-test/`，已被 gitignore），
  之后复用缓存，属正常现象。
- 任一步骤失败：修复后重跑；确实无法修复时，必须在交付说明中如实披露失败步骤与原因，
  禁止静默跳过或伪造通过。
- 提交规约：Conventional Commits（feat / fix / chore / test / docs / refactor），
  提交前 `git status` 确认无意外文件；推送直接 `git push origin main`（凭据走 GCM，
  不要把 token 写进任何命令或文件）。

## 架构分层（改代码前对照）

```
models（数据模型）→ services（业务/校验/事件）→ stores（IItemStore 可替换数据源）
    ↑                                        ↓
providers（树视图 / Webview 面板） ← commands（命令注册，deps 对象注入） ← extension.ts（组装）
tasks/（启动任务框架：StartupTask 注册表 + TaskRunner 调度）
features/（功能页面：init / featureConfig / staticConfig / build，每目录一种 UI 模式示例）
```

### 硬性规约

1. **单一来源**：命令 ID / 视图 ID / 配置键只在 `src/constants.ts` 定义，
   `package.json` 的 contributes 必须与之同步（门禁第 4 步会校验，新增命令三处缺一不可：
   constants → package.json → commands/index.ts）。
2. **Schema 驱动**：表单渲染器（`src/webview/formHtml.ts`）不允许出现业务字段特例；
   加字段改 `formSchema.ts`（条目）或 `featureFlags.ts`（特性配置），渲染自动跟随。
3. **图标语言**：codicon 一律走 `src/ui/icons.ts` 映射表，同一概念全插件同图标。
4. **UI 规约**：颜色只用 `--vscode-*` 主题令牌；主按钮在右；动效仅 0.1s hover/focus；
   成功反馈以「已…」开头并受 `successNotifications` 开关约束（详见 README「UI 风格约定」）。
5. **右键菜单传参**：`view/item/context` 命令第一个参数是树节点元素（需 `toItem()` 归一化），
   第二个参数是多选集合；`TreeItem.command` 传的才是原始对象。
6. **shell 拼接外部输入前必须白名单校验**（先例：分支名 `BRANCH_NAME_PATTERN`）。
7. **测试卫生**：测试创建的临时目录必须在 `finally` 中 `fs.rmSync` 清理。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run gate` | 一键式质量门禁（对话收尾必跑） |
| `npm run compile` | 类型检查 + esbuild 开发构建 |
| `npm run watch` | 监听构建（调试时用） |
| `npm run package` | 类型检查 + 生产构建 |
| `npm test` | 仅跑集成测试（需 .vscode-test 缓存） |
| `F5`（VSCode） | 启动扩展开发宿主调试 |

## 已知事项

- 集成测试依赖 `.vscode-test/` 缓存；删除后首次门禁/测试会重新下载 VS Code。
- 数据文件与静态配置被外部修改时由 FileSystemWatcher 自动刷新
  （受特性开关 `autoRefreshOnExternalChange` 控制）。
- 发布到市场前：改 `publisher`、补 128×128 PNG 图标（见 README「打包发布」）。
- 未打开工作区时数据退回全局存储（MementoStore），属预期行为。
