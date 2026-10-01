import * as path from 'path';
import * as vscode from 'vscode';
import { COMMAND } from '../constants';
import { type Item, PRIORITY_LABELS, type Priority } from '../models/item';
import { ItemFormPanel } from '../providers/itemFormPanel';
import { ItemService, ItemValidationError } from '../services/itemService';
import { JsonFileStore } from '../services/stores/jsonFileStore';
import type { IItemStore } from '../services/stores/itemStore';
import { PRIORITY_ICONS } from '../ui/icons';
import type { TaskRunner } from '../tasks/taskRunner';

// VSCode 命令参数类型在注册期未知（与官方 API 签名一致使用 any[]）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = any[];

/**
 * 命令注册中心：所有命令集中在此注册，每个命令对应一种「菜单入口 + 典型场景」。
 * 场景与菜单位置的完整对照表见 README「菜单与右键菜单示例」。
 *
 * view/item/context 传参约定：第一个参数是被右键的树节点元素，
 * 第二个参数是当前多选集合（Ctrl/Shift+点击时非空）——批量命令依赖第二个参数。
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  service: ItemService,
  store: IItemStore,
  taskRunner: TaskRunner,
  outputChannel: vscode.OutputChannel
): void {
  const register = (commandId: string, callback: (...args: AnyArgs) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, callback));
  };

  /* ---------- 场景：常规新增 / 编辑（视图标题栏 ＋、树单击、树右键、Alt+N） ---------- */
  register(COMMAND.newItem, () => {
    ItemFormPanel.createOrShow(service);
  });

  register(COMMAND.editItem, async (arg?: unknown) => {
    const target = toItem(arg) ?? (await pickItem(service, '选择要编辑的条目'));
    if (target) {
      ItemFormPanel.createOrShow(service, target);
    }
  });

  /* ---------- 场景：从选中文本新增（编辑器右键菜单 / Alt+S） ----------
     典型场景：选中一段 TODO、报错信息或需求描述 → 右键 → 一键变条目，表单自动预填 */
  register(COMMAND.newItemFromSelection, () => {
    const editor = vscode.window.activeTextEditor;
    const text = editor ? editor.document.getText(editor.selection).trim() : '';
    if (!text) {
      void vscode.window.showInformationMessage('请先在编辑器中选中一段文本，再运行本命令。');
      return;
    }
    ItemFormPanel.createOrShow(service, undefined, {
      name: text.split(/\r?\n/)[0].slice(0, 50),
      description: text,
      category: '来自编辑器',
      tags: ['选区'],
    });
  });

  /* ---------- 场景：从文件新增（资源管理器右键 / 编辑器标题栏图标） ----------
     典型场景：把待重构的文件登记成条目，描述里记录完整路径 */
  register(COMMAND.newItemFromFile, async (uri?: vscode.Uri) => {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target) {
      void vscode.window.showInformationMessage('未找到可用的文件：请在资源管理器中右键文件，或先打开一个文件。');
      return;
    }
    ItemFormPanel.createOrShow(service, undefined, {
      name: path.basename(target.fsPath),
      category: '文件',
      description: target.fsPath,
      tags: ['文件'],
    });
  });

  /* ---------- 场景：删除（树右键，支持 Ctrl/Shift 多选批量删除） ---------- */
  register(COMMAND.deleteItem, async (arg?: unknown, selected?: unknown[]) => {
    const targets = collectTargets(arg, selected);
    if (!targets.length) {
      const picked = await pickItem(service, '选择要删除的条目');
      if (picked) {
        targets.push(picked);
      }
    }
    if (!targets.length) {
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      targets.length > 1 ? `确定删除选中的 ${targets.length} 个条目？` : `确定删除「${targets[0].name}」？`,
      { modal: true, detail: summarize(targets) },
      '删除'
    );
    if (confirmed !== '删除') {
      return;
    }
    try {
      for (const target of targets) {
        await service.remove(target.id);
      }
      void vscode.window.showInformationMessage(
        targets.length > 1 ? `已删除 ${targets.length} 个条目。` : `已删除「${targets[0].name}」。`
      );
    } catch (err) {
      showError(err);
    }
  });

  /* ---------- 场景：设置优先级（树右键「设置优先级」子菜单，支持批量） ---------- */
  const changePriority = (priority: Priority) => async (arg?: unknown, selected?: unknown[]): Promise<void> => {
    const targets = collectTargets(arg, selected);
    if (!targets.length) {
      const picked = await pickItem(service, '选择要调整优先级的条目');
      if (picked) {
        targets.push(picked);
      }
    }
    if (!targets.length) {
      return;
    }
    try {
      for (const target of targets) {
        await service.update(target.id, {
          name: target.name,
          category: target.category,
          description: target.description,
          priority,
          tags: target.tags,
        });
      }
      void vscode.window.showInformationMessage(
        `已将 ${names(targets)} 的优先级设为「${PRIORITY_LABELS[priority]}」。`
      );
    } catch (err) {
      showError(err);
    }
  };
  register(COMMAND.setPriorityHigh, changePriority('high'));
  register(COMMAND.setPriorityMedium, changePriority('medium'));
  register(COMMAND.setPriorityLow, changePriority('low'));

  /* ---------- 场景：复制分享（树右键「复制…」子菜单） ----------
     典型场景：把条目复制成名称 / Markdown 清单 / JSON，粘贴到周报或 issue 里 */
  register(COMMAND.copyName, async (arg?: unknown) => {
    const target = toItem(arg) ?? (await pickItem(service, '选择要复制的条目'));
    if (!target) {
      return;
    }
    await vscode.env.clipboard.writeText(target.name);
    void vscode.window.showInformationMessage(`已复制名称「${target.name}」。`);
  });

  register(COMMAND.copyMarkdown, async (arg?: unknown) => {
    const target = toItem(arg) ?? (await pickItem(service, '选择要复制的条目'));
    if (!target) {
      return;
    }
    await vscode.env.clipboard.writeText(toMarkdown(target));
    void vscode.window.showInformationMessage('已复制为 Markdown。');
  });

  register(COMMAND.copyJson, async (arg?: unknown) => {
    const target = toItem(arg) ?? (await pickItem(service, '选择要复制的条目'));
    if (!target) {
      return;
    }
    await vscode.env.clipboard.writeText(JSON.stringify(target, null, 2));
    void vscode.window.showInformationMessage('已复制 JSON。');
  });

  /* ---------- 场景：克隆 ---------- */
  register(COMMAND.duplicateItem, async (arg?: unknown) => {
    const target = toItem(arg) ?? (await pickItem(service, '选择要克隆的条目'));
    if (!target) {
      return;
    }
    try {
      const copy = await service.duplicate(target.id);
      void vscode.window.showInformationMessage(`已克隆为「${copy.name}」。`);
    } catch (err) {
      showError(err);
    }
  });

  /* ---------- 场景：动态菜单（QuickPick 模拟） ----------
     package.json 只能声明静态菜单；菜单项需要随数据动态变化（如显示当前值）时，
     用 QuickPick 实现「可编程菜单」——本例操作后菜单保持打开，按 Esc 退出。 */
  register(COMMAND.moreActions, async (arg?: unknown) => {
    let current = toItem(arg) ?? (await pickItem(service, '选择要操作的条目'));
    while (current) {
      const picked = await vscode.window.showQuickPick(buildMoreActions(), {
        title: `「${current.name}」— 更多操作（按 Esc 关闭菜单）`,
      });
      if (!picked || !picked.action) {
        return;
      }
      let stayInMenu = true;
      try {
        switch (picked.action) {
          case 'edit':
            ItemFormPanel.createOrShow(service, current);
            stayInMenu = false;
            break;
          case 'duplicate': {
            const copy = await service.duplicate(current.id);
            void vscode.window.showInformationMessage(`已克隆为「${copy.name}」。`);
            stayInMenu = false;
            break;
          }
          case 'high':
          case 'medium':
          case 'low': {
            const priority = picked.action as Priority;
            await service.update(current.id, {
              name: current.name,
              category: current.category,
              description: current.description,
              priority,
              tags: current.tags,
            });
            void vscode.window.showInformationMessage(`优先级已设为「${PRIORITY_LABELS[priority]}」。`);
            break;
          }
          case 'copyName':
            await vscode.env.clipboard.writeText(current.name);
            void vscode.window.showInformationMessage(`已复制名称「${current.name}」。`);
            break;
          case 'copyMarkdown':
            await vscode.env.clipboard.writeText(toMarkdown(current));
            void vscode.window.showInformationMessage('已复制为 Markdown。');
            break;
          case 'copyJson':
            await vscode.env.clipboard.writeText(JSON.stringify(current, null, 2));
            void vscode.window.showInformationMessage('已复制 JSON。');
            break;
          case 'delete': {
            const confirmed = await vscode.window.showWarningMessage(
              `确定删除「${current.name}」？`,
              { modal: true },
              '删除'
            );
            if (confirmed === '删除') {
              await service.remove(current.id);
            }
            stayInMenu = false;
            break;
          }
        }
      } catch (err) {
        showError(err);
      }
      // 操作后重新读取条目（优先级等已变化），菜单继续停留在同一目标上
      current = stayInMenu ? await service.get(current.id) : undefined;
    }
  });

  /* ---------- 场景：过滤 / 刷新 / 打开数据文件（视图标题栏与命令面板） ---------- */
  register(COMMAND.filterItems, async () => {
    const keyword = await vscode.window.showInputBox({
      title: '过滤条目',
      prompt: '输入关键字（名称/分类/描述/标签）；留空并回车即可清除过滤。',
      value: service.getFilter(),
    });
    if (keyword === undefined) {
      return; // 用户按了 Esc
    }
    service.setFilter(keyword);
  });

  register(COMMAND.refresh, () => {
    service.reload();
  });

  /* ---------- 启动任务 / 环境信息（环境信息视图标题栏与命令面板） ---------- */
  register(COMMAND.refreshEnvironment, () => {
    void taskRunner.runAll();
  });

  register(COMMAND.showEnvironmentOutput, () => {
    outputChannel.show(true);
  });

  register(COMMAND.openDataFile, async () => {
    if (store instanceof JsonFileStore) {
      try {
        await vscode.workspace.fs.stat(store.fileUri);
        await vscode.window.showTextDocument(store.fileUri);
      } catch {
        const choice = await vscode.window.showInformationMessage(
          '数据文件尚未创建（新增第一条数据后自动生成）。',
          '去新增条目'
        );
        if (choice) {
          await vscode.commands.executeCommand(COMMAND.newItem);
        }
      }
    } else {
      void vscode.window.showInformationMessage(
        '当前未打开工作区，数据保存在 VSCode 全局存储中，没有对应文件。'
      );
    }
  });
}

/* ================= 工具函数 ================= */

interface MoreActionPick extends vscode.QuickPickItem {
  action: string;
}

/** 「更多操作」动态菜单的菜单项（可在运行时按条目状态增减）。 */
function buildMoreActions(): MoreActionPick[] {
  // 分组分隔符与树右键菜单的分组（1_crud/2_crud/3_crud）保持同构
  const separator = (label: string): MoreActionPick => ({
    label,
    kind: vscode.QuickPickItemKind.Separator,
    action: '',
  });
  return [
    separator('条目操作'),
    { label: '$(edit) 编辑条目', detail: '打开表单，修改全部字段', action: 'edit' },
    { label: '$(copy) 克隆条目', detail: '创建一条「（副本）」', action: 'duplicate' },
    separator('优先级'),
    { label: '$(arrow-up) 设为：高', action: 'high' },
    { label: '$(dash) 设为：中', action: 'medium' },
    { label: '$(arrow-down) 设为：低', action: 'low' },
    separator('复制'),
    { label: '$(copy) 复制名称', action: 'copyName' },
    { label: '$(markdown) 复制为 Markdown', action: 'copyMarkdown' },
    { label: '$(bracket) 复制为 JSON', action: 'copyJson' },
    separator('危险操作'),
    { label: '$(trash) 删除条目', action: 'delete' },
  ];
}

function toMarkdown(item: Item): string {
  return [
    `- **${item.name}**（${PRIORITY_LABELS[item.priority]}优先级）`,
    item.category ? `  - 分类：${item.category}` : '',
    item.tags.length ? `  - 标签：${item.tags.join('、')}` : '',
    item.description ? `  - ${item.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 入参归一化：树「右键菜单」传入的是树节点元素（ItemNode/CategoryNode），
 * 「树条目单击命令」传入的是原始 Item。两种来源统一转换为 Item。
 */
function toItem(arg: unknown): Item | undefined {
  if (!arg || typeof arg !== 'object') {
    return undefined;
  }
  const node = arg as { kind?: unknown; item?: Item };
  if (node.kind === 'item' && node.item) {
    return node.item;
  }
  if (node.kind === 'category') {
    return undefined;
  }
  const maybeItem = arg as Item;
  if (typeof maybeItem.id === 'string' && typeof maybeItem.name === 'string') {
    return maybeItem;
  }
  return undefined;
}

/** 汇总「被右键的条目 + 当前多选集合」，按 id 去重——批量命令的目标集合。 */
function collectTargets(primary: unknown, selected?: unknown[]): Item[] {
  const targets: Item[] = [];
  const seen = new Set<string>();
  for (const candidate of [primary, ...(selected ?? [])]) {
    const item = toItem(candidate);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      targets.push(item);
    }
  }
  return targets;
}

function summarize(items: Item[]): string | undefined {
  if (items.length <= 1) {
    return items[0]?.description || undefined;
  }
  return `即将删除：${names(items)}`;
}

function names(items: Item[]): string {
  const labels = items.slice(0, 3).map((item) => `「${item.name}」`);
  return items.length <= 3 ? labels.join('、') : `${labels.join('、')} 等 ${items.length} 个`;
}

/** 未带参数调用时（如从命令面板触发），用 QuickPick 让用户选择一个条目。 */
async function pickItem(service: ItemService, title: string): Promise<Item | undefined> {
  const items = await service.list();
  if (!items.length) {
    void vscode.window.showInformationMessage('当前没有条目，请先新增。');
    return undefined;
  }
  // 图标与树视图一致：同一优先级在全插件使用同一个 codicon
  const picked = await vscode.window.showQuickPick(
    items.map((item) => ({
      label: item.name,
      description: item.category || '未分类',
      detail: item.description ? item.description.split(/\r?\n/)[0] : undefined,
      iconPath: new vscode.ThemeIcon(PRIORITY_ICONS[item.priority]),
      item,
    })),
    { title, matchOnDescription: true, matchOnDetail: true }
  );
  return picked?.item;
}

function showError(err: unknown): void {
  const message = err instanceof ItemValidationError ? err.message : `操作失败：${String(err)}`;
  void vscode.window.showErrorMessage(message);
}
