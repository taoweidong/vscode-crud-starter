/** 视图相关标识（与 package.json 的 contributes 保持一致，单一来源）。 */
export const VIEW = {
  /** ActivityBar 视图容器 ID */
  containerId: 'crudStarter',
  /** 条目树视图 ID */
  itemsViewId: 'crudStarter.itemsView',
  /** 环境信息树视图 ID */
  envViewId: 'crudStarter.envView',
  /** 树条目的 contextValue（用于菜单 when 条件） */
  itemContextValue: 'crudItem',
} as const;

/** 命令 ID（与 package.json 的 contributes 保持一致）。 */
export const COMMAND = {
  // 基础增删改查
  newItem: 'crudStarter.newItem',
  editItem: 'crudStarter.editItem',
  duplicateItem: 'crudStarter.duplicateItem',
  deleteItem: 'crudStarter.deleteItem',
  filterItems: 'crudStarter.filterItems',
  refresh: 'crudStarter.refresh',
  openDataFile: 'crudStarter.openDataFile',

  // 菜单/右键菜单示例命令
  /** 编辑器右键：从选中文本新增 */
  newItemFromSelection: 'crudStarter.newItemFromSelection',
  /** 资源管理器右键 / 编辑器标题栏：从文件新增 */
  newItemFromFile: 'crudStarter.newItemFromFile',
  /** 树条目右键 → 设置优先级（子菜单） */
  setPriorityHigh: 'crudStarter.setPriorityHigh',
  setPriorityMedium: 'crudStarter.setPriorityMedium',
  setPriorityLow: 'crudStarter.setPriorityLow',
  /** 树条目右键 → 复制…（子菜单） */
  copyName: 'crudStarter.copyName',
  copyMarkdown: 'crudStarter.copyMarkdown',
  copyJson: 'crudStarter.copyJson',
  /** 树条目右键 → 更多操作（QuickPick 动态菜单） */
  moreActions: 'crudStarter.moreActions',

  // 启动任务 / 环境信息
  /** 环境信息视图标题栏：重新执行启动任务 */
  refreshEnvironment: 'crudStarter.refreshEnvironment',
  /** 打开启动任务的输出通道 */
  showEnvironmentOutput: 'crudStarter.showEnvironmentOutput',
} as const;

/** 配置项键名（对应设置里的 crudStarter.*）。 */
export const CONFIG = {
  section: 'crudStarter',
  storagePath: 'storagePath',
  /** 激活时是否自动执行启动任务 */
  runStartupTasks: 'runStartupTasks',
} as const;

/** 存储相关常量。 */
export const STORAGE = {
  /** 默认 JSON 数据文件（相对工作区根目录） */
  defaultFileName: '.vscode/crud-starter-items.json',
  /** 未打开工作区时，globalState 的存储键 */
  mementoKey: 'crudStarter.items',
} as const;
