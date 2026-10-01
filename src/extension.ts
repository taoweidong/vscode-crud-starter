import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { CONFIG, STORAGE, VIEW } from './constants';
import type { TreeNode } from './providers/itemsTreeDataProvider';
import { ItemsTreeDataProvider } from './providers/itemsTreeDataProvider';
import { EnvironmentTreeProvider } from './providers/environmentTreeProvider';
import { ItemService } from './services/itemService';
import { JsonFileStore } from './services/stores/jsonFileStore';
import { MementoStore } from './services/stores/mementoStore';
import type { IItemStore } from './services/stores/itemStore';
import { TaskRunner } from './tasks/taskRunner';
import { TASKS } from './tasks/taskRegistry';

/**
 * 插件入口：只做「组装」——选择数据源、创建服务与视图、注册命令、调度启动任务。
 * 各层职责见 README 的架构说明；想更换数据源改 createStore() 即可。
 */
export function activate(context: vscode.ExtensionContext): void {
  const store = createStore(context);
  const service = new ItemService(store);
  const treeProvider = new ItemsTreeDataProvider(service);

  const treeView = vscode.window.createTreeView(VIEW.itemsViewId, {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
    // 允许 Ctrl/Shift 多选条目——右键批量命令（批量删除/批量设优先级）依赖它
    canSelectMany: true,
  });
  context.subscriptions.push(treeView);

  // 空状态提示 / 过滤徽标
  context.subscriptions.push(
    service.onDidChangeItems(() => {
      void updateViewStatus(treeView, service);
    })
  );
  void updateViewStatus(treeView, service);

  // 启动任务框架：激活时默认执行环境检测脚本（可用 crudStarter.runStartupTasks 关闭）
  // runAll 不 await——探测走子进程，不能阻塞激活流程
  const outputChannel = vscode.window.createOutputChannel('CRUD Starter');
  context.subscriptions.push(outputChannel);
  const taskRunner = new TaskRunner(TASKS, outputChannel);
  context.subscriptions.push(taskRunner);
  const envProvider = new EnvironmentTreeProvider(taskRunner);
  const envView = vscode.window.createTreeView(VIEW.envViewId, {
    treeDataProvider: envProvider,
  });
  context.subscriptions.push(envView);
  if (vscode.workspace.getConfiguration(CONFIG.section).get<boolean>(CONFIG.runStartupTasks, true)) {
    void taskRunner.runAll();
  }

  // 数据文件被外部修改（手工编辑 / 同步盘）时自动刷新
  const watcher = createStorageWatcher(context, store, service);
  if (watcher) {
    context.subscriptions.push(watcher);
  }

  registerCommands(context, service, store, taskRunner, outputChannel);
}

export function deactivate(): void {
  // 所有资源已通过 context.subscriptions 统一释放
}

/** 数据源选择：有工作区用 JSON 文件，否则退回全局存储。 */
function createStore(context: vscode.ExtensionContext): IItemStore {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    return new MementoStore(context.globalState, STORAGE.mementoKey);
  }
  return new JsonFileStore(vscode.Uri.joinPath(root, getStoragePath()));
}

function createStorageWatcher(
  context: vscode.ExtensionContext,
  store: IItemStore,
  service: ItemService
): vscode.FileSystemWatcher | undefined {
  if (!(store instanceof JsonFileStore)) {
    return undefined;
  }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    return undefined;
  }
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, getStoragePath())
  );
  watcher.onDidChange(() => service.reload(), null, context.subscriptions);
  watcher.onDidCreate(() => service.reload(), null, context.subscriptions);
  watcher.onDidDelete(() => service.reload(), null, context.subscriptions);
  return watcher;
}

function getStoragePath(): string {
  return vscode.workspace
    .getConfiguration(CONFIG.section)
    .get<string>(CONFIG.storagePath, STORAGE.defaultFileName);
}

/** 根据当前数据更新视图的空状态提示与过滤徽标。 */
async function updateViewStatus(
  treeView: vscode.TreeView<TreeNode>,
  service: ItemService
): Promise<void> {
  const items = await service.list();
  treeView.message = items.length
    ? undefined
    : '暂无条目：点击右上角 ＋ 新增，或从命令面板运行「CRUD Starter: 新增条目」。';
  treeView.badge = service.filtered
    ? { value: items.length, tooltip: `过滤「${service.getFilter().trim()}」：匹配 ${items.length} 条` }
    : undefined;
}
