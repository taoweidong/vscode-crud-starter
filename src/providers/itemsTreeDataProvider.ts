import * as vscode from 'vscode';
import { COMMAND, VIEW } from '../constants';
import { getFeatureValue } from '../features/featureConfig/featureFlags';
import { Item, PRIORITY_LABELS } from '../models/item';
import { ItemService } from '../services/itemService';
import { PRIORITY_ICONS } from '../ui/icons';

/** 树节点：分类分组节点或条目叶子节点。 */
export type TreeNode = CategoryNode | ItemNode;

export interface CategoryNode {
  kind: 'category';
  label: string;
  count: number;
}

export interface ItemNode {
  kind: 'item';
  item: Item;
}

const UNCATEGORIZED = '未分类';

/**
 * 侧边栏树视图（「查」）：
 * - 默认按分类分组展示，点击条目直接打开编辑表单；
 * - 过滤关键字生效时改为平铺匹配结果；
 * - 订阅 ItemService 的变更事件自动刷新，无需手工刷新。
 */
export class ItemsTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly service: ItemService) {
    service.onDidChangeItems(() => this._onDidChangeTreeData.fire());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'category') {
      const treeItem = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      treeItem.description = `${node.count} 项`;
      treeItem.iconPath = new vscode.ThemeIcon('folder');
      treeItem.contextValue = 'crudCategory';
      return treeItem;
    }

    const { item } = node;
    const treeItem = new vscode.TreeItem(item.name, vscode.TreeItemCollapsibleState.None);
    // 描述：优先展示标签，其次展示描述首行（多行文本在树中会显得杂乱）
    treeItem.description = item.tags.length
      ? item.tags.join(' · ')
      : firstLine(item.description);
    treeItem.tooltip = buildTooltip(item);
    // 「显示优先级图标」开关关闭时不渲染图标
    treeItem.iconPath = getFeatureValue('showPriorityIcons')
      ? new vscode.ThemeIcon(PRIORITY_ICONS[item.priority])
      : undefined;
    treeItem.contextValue = VIEW.itemContextValue;
    // 单击条目 → 打开编辑表单（界面化操作的核心入口之一）
    treeItem.command = { command: COMMAND.editItem, title: '编辑条目', arguments: [item] };
    return treeItem;
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    const items = await this.service.list();

    if (!node) {
      // 过滤中：平铺展示匹配项
      if (this.service.filtered) {
        return items.map((item): TreeNode => ({ kind: 'item', item }));
      }
      // 常规：按分类分组
      const groups = new Map<string, Item[]>();
      for (const item of items) {
        const key = item.category || UNCATEGORIZED;
        const bucket = groups.get(key);
        if (bucket) {
          bucket.push(item);
        } else {
          groups.set(key, [item]);
        }
      }
      return [...groups.entries()].map(
        ([label, groupItems]): TreeNode => ({ kind: 'category', label, count: groupItems.length })
      );
    }

    if (node.kind === 'category') {
      return items
        .filter((item) => (item.category || UNCATEGORIZED) === node.label)
        .map((item): TreeNode => ({ kind: 'item', item }));
    }
    return [];
  }
}

function buildTooltip(item: Item): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  // codicon 与树视图保持同一图标语言
  md.appendMarkdown(
    `**${item.name}** &nbsp;$(${PRIORITY_ICONS[item.priority]}) ${PRIORITY_LABELS[item.priority]}优先级\n\n`
  );
  md.appendMarkdown(`- 分类：${item.category || UNCATEGORIZED}\n`);
  if (item.tags.length) {
    md.appendMarkdown(`- 标签：${item.tags.join('、')}\n`);
  }
  if (item.description) {
    md.appendMarkdown(`\n${item.description}\n`);
  }
  md.appendMarkdown(`\n---\n\n_更新于 ${new Date(item.updatedAt).toLocaleString()}_`);
  return md;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/)[0];
}
