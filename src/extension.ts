import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { CONFIG, STORAGE, VIEW } from './constants';
import { BuildService } from './features/build/buildService';
import { BuildTreeProvider } from './features/build/buildTreeProvider';
import { FeatureConfigTreeProvider } from './features/featureConfig/featureConfigTreeProvider';
import { getFeatureValue } from './features/featureConfig/featureFlags';
import { InitService } from './features/init/initService';
import { InitTreeProvider } from './features/init/initTreeProvider';
import { createInitSteps } from './features/init/initSteps';
import { StaticConfigService } from './features/staticConfig/staticConfigService';
import { StaticConfigTreeProvider } from './features/staticConfig/staticConfigTreeProvider';
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
 * 插件入口：只做「组装」——数据源、服务、各功能视图、命令、启动任务。
 * 各层职责见 README 的架构说明；想更换数据源改 createStore() 即可。
 */
export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('CRUD Starter');
  context.subscriptions.push(outputChannel);

  // ---------- 条目 CRUD ----------
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
  context.subscriptions.push(
    service.onDidChangeItems(() => {
      void updateViewStatus(treeView, service);
    })
  );
  void updateViewStatus(treeView, service);

  // ---------- 启动任务（环境信息） ----------
  const taskRunner = new TaskRunner(TASKS, outputChannel);
  context.subscriptions.push(taskRunner);
  const envProvider = new EnvironmentTreeProvider(taskRunner);
  context.subscriptions.push(
    vscode.window.createTreeView(VIEW.envViewId, { treeDataProvider: envProvider })
  );
  if (vscode.workspace.getConfiguration(CONFIG.section).get<boolean>(CONFIG.runStartupTasks, true)) {
    // runAll 不 await——探测走子进程，不能阻塞激活流程
    void taskRunner.runAll();
  }

  // ---------- 功能页面：环境初始化 / 特性配置 / 静态配置 / 分支编译 ----------
  const staticConfig = new StaticConfigService(
    outputChannel,
    () => vscode.workspace.workspaceFolders?.[0]?.uri
  );
  context.subscriptions.push(staticConfig);
  void staticConfig.load();

  const initService = new InitService(createInitSteps(), outputChannel, staticConfig);
  context.subscriptions.push(initService);
  const initProvider = new InitTreeProvider(() => initService.getStates());
  context.subscriptions.push(
    initService.onDidChangeItems(() => initProvider.refresh()),
    vscode.window.createTreeView(VIEW.initViewId, { treeDataProvider: initProvider })
  );

  const featureProvider = new FeatureConfigTreeProvider();  context.subscriptions.push(
    vscode.window.createTreeView(VIEW.featureConfigViewId, { treeDataProvider: featureProvider }),
    // 开关写在全局设置里，设置变化时刷新树视图的开关状态
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${CONFIG.section}.${CONFIG.featuresSection}`)) {
        featureProvider.refresh();
      }
    })
  );

  const staticProvider = new StaticConfigTreeProvider(() => staticConfig.getSections());
  context.subscriptions.push(
    staticConfig.onDidChangeItems(() => staticProvider.refresh()),
    vscode.window.createTreeView(VIEW.staticConfigViewId, { treeDataProvider: staticProvider })
  );

  const buildService = new BuildService(
    outputChannel,
    () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  );
  context.subscriptions.push(buildService);
  const buildProvider = new BuildTreeProvider(buildService, () => buildService.getGitInfo());
  context.subscriptions.push(
    buildService.onDidChangeItems(() => buildProvider.refresh()),
    vscode.window.createTreeView(VIEW.buildViewId, { treeDataProvider: buildProvider })
  );

  // ---------- 数据文件 / 静态配置的外部修改监听 ----------
  const watcher = createStorageWatcher(context, store, service);
  if (watcher) {
    context.subscriptions.push(watcher);
  }
  const staticWatcher = createStaticConfigWatcher(context, staticConfig);
  if (staticWatcher) {
    context.subscriptions.push(staticWatcher);
  }

  registerCommands(context, {
    service,
    store,
    taskRunner,
    outputChannel,
    initService,
    staticConfig,
    buildService,
  });
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
  const onChange = (): void => {
    if (getFeatureValue('autoRefreshOnExternalChange')) {
      service.reload();
    }
  };
  watcher.onDidChange(onChange, null, context.subscriptions);
  watcher.onDidCreate(onChange, null, context.subscriptions);
  watcher.onDidDelete(onChange, null, context.subscriptions);
  return watcher;
}

function createStaticConfigWatcher(
  context: vscode.ExtensionContext,
  staticConfig: StaticConfigService
): vscode.FileSystemWatcher | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    return undefined;
  }
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, '.vscode/crud-starter.config.json')
  );
  const reload = (): void => {
    if (getFeatureValue('autoRefreshOnExternalChange')) {
      void staticConfig.load();
    }
  };
  watcher.onDidChange(reload, null, context.subscriptions);
  watcher.onDidCreate(reload, null, context.subscriptions);
  watcher.onDidDelete(reload, null, context.subscriptions);
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
  treeView.badge =
    service.filtered && getFeatureValue('showViewBadges')
      ? { value: items.length, tooltip: `过滤「${service.getFilter().trim()}」：匹配 ${items.length} 条` }
      : undefined;
}
