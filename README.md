# CRUD Starter

一个 **VSCode 插件初始化项目（模板）**：提供界面化的增删改查（CRUD）操作，架构分层清晰、数据源可替换，适合作为「管理某类数据」的插件起点（例如任务清单、接口集合、代码片段库、链接收藏等），克隆后改一改数据模型就能变成你自己的插件。

> 📚 **详细操作指导**（环境准备 / 克隆代码 / 调试步骤 / 二次开发，含 8 张示意图）：
> 见 [`docs/操作指导/`](docs/操作指导/README.md)；AI 编码代理请先读 [`agent.md`](agent.md)。

## 功能一览

| 操作 | 入口 |
| --- | --- |
| 查（列表） | 侧边栏树视图：按分类分组、优先级图标、悬停详情；标题栏 🔍 支持关键字过滤（名称/分类/描述/标签） |
| 增 | 视图标题栏 ＋ 按钮，或命令面板 `CRUD Starter: 新增条目`，弹出 Webview 表单 |
| 改 | 单击树条目 / 右键「编辑条目」，弹出表单并自动回填 |
| 删 | 右键「删除条目」，带模态二次确认 |
| 克隆 | 右键「克隆条目」，一键复制 |
| 其他 | 刷新列表、打开数据文件；数据文件被手工修改后自动刷新 |
| 环境信息 | 激活时自动执行环境检测脚本（Python/Node/npm/Git/系统/VSCode），结果在侧边栏「环境信息」视图与输出通道展示，标题栏 ↻ 可重新执行 |
| 环境初始化 | 步骤清单式页面：检查工作区 / 初始化数据文件 / 生成静态配置 / 创建产物目录 / 写入环境快照；单击执行单步，或标题栏「全部初始化」 |
| 特性配置 | 开关列表单击即切换（删除确认 / 成功通知 / 优先级图标 / 视图徽标 / 自动刷新），全部真实影响插件行为；标题栏可打开 Schema 表单批量编辑 |
| 静态配置 | 只读展示工作区 `.vscode/crud-starter.config.json`（环境初始化生成默认模板），文件修改后自动刷新 |
| 分支编译 | 展示当前分支与分支清单，单击分支执行 `npm run package` 编译出包（切换分支前检查工作区干净），检测到 vsce 时输出 `.vsix` |

表单面板特点：**由字段 Schema 驱动**（见 `src/webview/formSchema.ts`）、使用 VSCode 主题变量自动适配深浅色、符合 CSP 安全规范、必填校验、`Esc` 取消 / `Ctrl+Enter` 保存。

## 菜单与右键菜单示例（典型场景）

项目演示了 VSCode 全部常用菜单位置，每个入口对应一个典型业务场景：

| 菜单位置 | 入口 / 触发方式 | 典型场景 | 对应命令 |
| --- | --- | --- | --- |
| 视图标题栏 | 侧边栏面板右上角 ＋ / 🔍 / 刷新 | 日常新增、关键字过滤、手动刷新 | `newItem` `filterItems` `refresh` |
| 树条目右键菜单 | 右键任意条目（或 Ctrl/Shift 多选后右键） | 编辑 / 克隆 / 删除，**多选后批量删除** | `editItem` `duplicateItem` `deleteItem` |
| 子菜单「设置优先级」 | 树条目右键 → 设置优先级 → 高/中/低 | 多选条目后一键统一优先级 | `setPriorityHigh/Medium/Low` |
| 子菜单「复制…」 | 树条目右键 → 复制… | 把条目复制成 名称 / Markdown / JSON，粘贴进周报或 issue | `copyName` `copyMarkdown` `copyJson` |
| 动态菜单「更多操作…」 | 树条目右键 → 更多操作… | 用 QuickPick 实现的**可编程菜单**：菜单项可随数据动态增减，操作后菜单保持打开，`Esc` 退出 | `moreActions` |
| 编辑器右键菜单 | 选中一段文本 → 右键（多条目：新增条目 / 快速新增 / 追加到条目）；无选区时右键显示「登记当前文件」 | 选中 TODO 一键变条目；连续登记多条跳过表单；给已有条目补充线索；登记当前文件 | `newItemFromSelection` `quickAddFromSelection` `appendSelectionToItem` `addCurrentFileToItems` |
| 资源管理器右键菜单 | 右键文件：添加为条目 / 登记并摘录内容（前 20 行进描述）；右键文件夹：内容批量登记（上限 50 个） | 待重构文件登记、配置文件连内容一起留档、整个目录批量导入 | `newItemFromFile` `newItemFromFilePreview` `newItemsFromFolder` |
| 编辑器标题栏 | 打开的文件页签右上角图标按钮 | 对当前打开的文件做同样的登记 | `newItemFromFile` |
| 命令面板 | `Ctrl+Shift+P` 输入 "CRUD Starter" | 无鼠标操作路径；未传参的命令会用 QuickPick 让你先选条目 | 全部命令 |
| 快捷键 | `Alt+N` 新增；选中文本后 `Alt+S` 快速入条目 | 键盘党快速入口（可在键盘快捷方式中修改/移除） | `newItem` `newItemFromSelection` |

### 菜单开发要点（示例中的关键模式）

1. **右键菜单传参约定**：`view/item/context` 菜单的命令会收到两个参数——被右键的**树节点元素**和**当前多选集合**：

   ```ts
   register(COMMAND.deleteItem, async (arg?: unknown, selected?: unknown[]) => {
     const targets = collectTargets(arg, selected); // 归一化 + 去重 → 批量目标
     ...
   });
   ```

   注意树条目的 `TreeItem.command`（单击触发）传的是原始 `Item`，而右键菜单传的是树节点（`ItemNode`），两者用 `toItem()` 归一化，这是树视图命令最常见的坑。

2. **子菜单**：在 `package.json` 的 `contributes.submenus` 声明，再把它挂进 `contributes.menus["view/item/context"]`（`"submenu": "crudStarter.priorityMenu"`），子菜单自己的菜单项在 `menus["crudStarter.priorityMenu"]` 里声明。

3. **按上下文显示**：`when` 子句控制菜单出现时机——树条目菜单用 `viewItem == crudItem`（对应 `TreeItem.contextValue`），编辑器选区菜单用 `editorTextFocus && editorHasSelection`。

4. **动态菜单**：静态菜单满足不了时（菜单项要显示当前值、要随状态增减），用 `showQuickPick` 自己画菜单，见 `moreActions` 命令——这是插件开发中「模拟菜单」的标准做法。

5. **批量操作**：树视图需 `createTreeView(id, { canSelectMany: true })`，命令的第二个参数才是多选集合。

## UI 风格约定

扩展的 UI 目标是「像 VSCode 团队自己出品的一样」，后续增改界面时请遵守以下约定：

| 约定 | 做法 |
| --- | --- |
| 颜色零硬编码 | 只使用 `--vscode-*` 主题令牌（输入框、按钮、错误、焦点色等），自动适配深浅色与高对比度主题 |
| 单一字体与字阶 | 只用 `--vscode-font-family`；标题 1.3em/600，正文 13px，提示 0.9em |
| 图标语言统一 | codicon 全局唯一映射（见 `src/ui/icons.ts`）：同一优先级在树视图、QuickPick、tooltip 中是同一个图标；新增图标先加进映射表 |
| 布局刻度 | 间距只用 4/8/12/16/24；表单单栏 560px 居中；控件高度 26px、圆角 2px |
| 主按钮在右 | 确认键（保存/删除）在右侧、次要在左侧，与 VSCode 模态对话框一致 |
| 动效克制 | 仅 0.1s 的 hover/focus 过渡，无阴影、无渐变、无入场动画 |
| 反馈闭环 | 成功用「已…」toast（已新增/已更新/已删除/已复制），失败给可修正的行内提示；确认弹窗按钮动词与操作同名 |
| 键盘可达 | 表单 `Esc` 取消、`Ctrl+Enter` 保存、打开即聚焦首字段；QuickPick/输入框均有 `Esc` 退出约定 |

## 快速开始

环境要求：Node.js ≥ 18、VSCode ≥ 1.85。

```bash
npm install
npm run gate      # 一键式质量门禁：类型检查→生产构建→静态一致性→全量测试（推荐先跑）
```

然后**用 VSCode 打开本项目文件夹，按 `F5`** 即可启动调试窗口：

> AI 编码代理请先阅读根目录的 `agent.md`——其中包含每次对话结束前必须执行质量门禁的强制协议。

调试窗口中的体验路径：

1. 活动栏出现「CRUD Starter」图标，点击进入侧边栏（共 6 个视图）；
2. 点击标题栏 ＋ 新增条目，体验表单界面；
3. 数据默认保存在工作区的 `.vscode/crud-starter-items.json`（路径可用设置 `crudStarter.storagePath` 修改）。

其他常用脚本：

```bash
npm run compile   # 类型检查 + esbuild 打包到 dist/
npm run watch     # 监听模式（调试时配合使用）
npm run package   # 生产构建（供打包发布用）
npm test          # 仅运行集成测试（首次会自动下载测试用 VSCode，耗时较长）
```

## 目录结构与架构

```
vscode-starter-template/
├── package.json                  # 插件清单：命令、视图、菜单、配置（与 src/constants.ts 对应）
├── esbuild.js                    # 构建脚本（bundle → dist/extension.js）
├── media/icon.svg                # 活动栏图标
└── src/
    ├── extension.ts              # 入口：组装数据源 → 服务 → 视图 → 命令
    ├── constants.ts              # 命令/视图/配置 ID 的单一来源
    ├── models/
    │   └── item.ts               # 数据模型 Item / ItemDraft（改字段从这开始）
    ├── services/
    │   ├── itemService.ts        # 业务层：校验、清洗、时间戳、过滤、变更事件
    │   └── stores/
    │       ├── itemStore.ts      # ★ IItemStore 数据源接口（可替换点）
    │       ├── jsonFileStore.ts  #   默认实现：工作区 JSON 文件
    │       └── mementoStore.ts   #   兜底实现：未打开工作区时用全局存储
    ├── providers/
    │   ├── itemsTreeDataProvider.ts  # 侧边栏树视图（查）
    │   ├── itemFormPanel.ts          # Webview 表单面板（增/改，单例）
    │   └── environmentTreeProvider.ts # 「环境信息」视图（启动任务结果展示）
    ├── features/                     # 功能页面（每个目录 = 一种 UI 模式示例）
    │   ├── init/                     #   环境初始化：清单 + 单步动作
    │   ├── featureConfig/            #   特性配置：设置读写 + 树开关 + Schema 表单页
    │   ├── staticConfig/             #   静态配置：只读展示 + 文件联动
    │   └── build/                    #   分支编译出包：任务自动化 + 进度
    ├── webview/
    │   ├── formSchema.ts             # ★ 表单字段 Schema（加字段只改这里）
    │   └── formHtml.ts               #   由 Schema 渲染 CSP 合规的表单页面
    ├── tasks/
    │   ├── types.ts                  # StartupTask / TaskResult 接口（扩展点）
    │   ├── taskRegistry.ts           # ★ 启动任务注册表（新增任务只改这里）
    │   ├── taskRunner.ts             # 调度器：顺序执行、异常降级、事件通知
    │   └── environmentTask.ts        # 内置任务：环境检测（Python/Node/npm/Git…）
    ├── ui/
    │   └── icons.ts                  # codicon 全局映射（图标语言统一）
    └── test/                         # 集成测试（mocha + @vscode/test-electron）
```

数据流（单向）：

```
树视图 / 表单 / 命令
        │  调用
        ▼
   ItemService（校验 + 业务规则，发 onDidChangeItems 事件）
        │  读写
        ▼
   IItemStore（可替换的数据源）
        ▲
        └── FileSystemWatcher：文件被外部修改 → service.reload() → 视图自动刷新
```

## 如何扩展

### 1. 给数据模型和表单加字段

以加一个「负责人 owner」文本字段为例，共三步：

1. `src/models/item.ts`：在 `Item` 与 `ItemDraft` 中加 `owner: string;`；
2. `src/webview/formSchema.ts`：在 `FORM_SCHEMA` 中加一行
   `{ key: 'owner', label: '负责人', type: 'text', placeholder: '选填' }`；
3. 完成。表单渲染、取值、回填全部自动生效；若需要迁移旧数据，在 `JsonFileStore.load()` 返回前补默认值即可。

字段类型支持 `text` / `textarea` / `select` / `tags`；要加新控件类型，在 `formHtml.ts` 的 `renderField()` 里加一个 case 即可。

### 2. 新增一个命令

1. `src/constants.ts` 的 `COMMAND` 中加 ID；
2. `package.json` 的 `contributes.commands`（需要按钮就同时配 `menus`）加声明；
3. `src/commands/index.ts` 中 `register(COMMAND.xxx, async () => { ... })` 写实现。

### 3. 更换数据源（接 API / 数据库）

实现 `IItemStore` 的 `load()` / `save()` 两个方法即可，例如接 REST API：

```ts
export class ApiStore implements IItemStore {
  constructor(private readonly baseUrl: string) {}
  async load(): Promise<Item[]> {
    const res = await fetch(`${this.baseUrl}/items`);
    return res.json() as Promise<Item[]>;
  }
  async save(items: Item[]): Promise<void> {
    await fetch(`${this.baseUrl}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
  }
}
```

然后在 `src/extension.ts` 的 `createStore()` 中返回 `new ApiStore(...)`。业务层、树视图、表单完全不用改。
> 提示：若数据量大，建议同时把 `ItemService` 的「读-改-全量写」改为按 ID 增删改。

### 4. 新增启动任务（环境检测 / 动作类脚本）

启动任务在插件激活时由 `TaskRunner` 自动调度，结果自动出现在「环境信息」视图：

1. 在 `src/tasks/` 下新建任务文件，实现 `StartupTask` 接口（`id` / `title` / `run(): Promise<TaskResult>`）；
2. 在 `src/tasks/taskRegistry.ts` 的 `TASKS` 数组中加一项。

内置的 `environmentTask`（环境检测）是完整示例：用 `execCapture()` 探测命令版本，逐项产出
`TaskItem`（label/description/status）。后续「动作类」任务（如同步数据、初始化配置、执行构建）只需
在 `run()` 里执行相应动作并返回结果摘要——调度、异常降级、输出通道、树视图展示全部自动生效。
若不想在启动时自动执行，把结果写入 `package.json` 的 `crudStarter.runStartupTasks` 配置判断即可
（框架已内置该开关）。

### 5. 打包发布

```bash
npm i -g @vscode/vsce
vsce package        # 生成 .vsix
```

发布前记得：修改 `package.json` 的 `publisher` 与 `repository`，补一个 128×128 的 PNG 图标（`icon` 字段）。

## 说明与已知限制

- 「读-改-全量写」的存储模型适合个人规模数据（数百条以内）；数据量大或多人协作时请实现自己的 `IItemStore`。
- 未打开任何工作区时，数据退回 VSCode 全局存储（`MementoStore`），「打开数据文件」命令会给出提示。
- `npm test` 首次运行会下载独立的测试版 VSCode（约 150MB）；只需类型检查时用 `npm run check-types` 即可。
- 表单没有引入任何 webview UI 框架（如 toolkit），保持零依赖、升级无忧；需要更复杂的交互时再自行引入。
