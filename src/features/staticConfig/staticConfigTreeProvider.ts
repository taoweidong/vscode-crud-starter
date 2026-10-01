import * as vscode from 'vscode';
import type { StaticConfigSection } from './staticConfigService';

export type StaticConfigNode =
  | { kind: 'section'; section: StaticConfigSection }
  | { kind: 'entry'; section: StaticConfigSection; entry: StaticConfigSection['entries'][number] }
  | { kind: 'empty'; text: string };

/**
 * 「静态配置」树视图：只读展示工作区静态配置文件内容。
 * 演示「只读数据展示 + 文件联动（打开/自动刷新）」模式。
 */
export class StaticConfigTreeProvider implements vscode.TreeDataProvider<StaticConfigNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<StaticConfigNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly getSections: () => StaticConfigSection[]) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: StaticConfigNode): vscode.TreeItem {
    switch (node.kind) {
      case 'section': {
        const treeItem = new vscode.TreeItem(
          node.section.title,
          vscode.TreeItemCollapsibleState.Expanded
        );
        treeItem.description = `${node.section.entries.length} 项`;
        treeItem.iconPath = new vscode.ThemeIcon('json');
        treeItem.contextValue = 'staticSection';
        treeItem.tooltip = new vscode.MarkdownString(
          `配置分组：**${node.section.title}**\n\n只读展示，修改请编辑 .vscode/crud-starter.config.json`
        );
        return treeItem;
      }
      case 'entry': {
        const treeItem = new vscode.TreeItem(node.entry.key, vscode.TreeItemCollapsibleState.None);
        treeItem.description = node.entry.value;
        treeItem.iconPath = new vscode.ThemeIcon('symbol-property');
        treeItem.tooltip = `${node.section.title}.${node.entry.key} = ${node.entry.value}`;
        return treeItem;
      }
      default: {
        const treeItem = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
        treeItem.iconPath = new vscode.ThemeIcon('info');
        return treeItem;
      }
    }
  }

  async getChildren(node?: StaticConfigNode): Promise<StaticConfigNode[]> {
    if (!node) {
      const sections = this.getSections();
      if (!sections.length) {
        return [
          {
            kind: 'empty',
            text: '暂无静态配置：运行「环境初始化」生成，或点击右上角打开配置文件',
          },
        ];
      }
      return sections.map((section): StaticConfigNode => ({ kind: 'section', section }));
    }
    if (node.kind === 'section') {
      return node.section.entries.map(
        (entry): StaticConfigNode => ({ kind: 'entry', section: node.section, entry })
      );
    }
    return [];
  }
}
