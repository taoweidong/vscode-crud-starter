import * as vscode from 'vscode';
import { COMMAND } from '../../constants';
import { FEATURE_FLAGS, getFeatureValue } from './featureFlags';

/**
 * 「特性配置」树视图：列出全部开关及当前状态。
 * 单击条目即切换开关（TreeItem.command），也可打开 Webview 配置页面批量编辑——
 * 演示「树视图即快捷开关 + 表单页做批量编辑」的组合模式。
 */
export class FeatureConfigTreeProvider implements vscode.TreeDataProvider<FeatureFlagNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FeatureFlagNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** 开关保存在全局设置里，设置变化时由 extension.ts 触发刷新。 */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: FeatureFlagNode): vscode.TreeItem {
    const flag = node.flag;
    const enabled = getFeatureValue(flag.key);
    const treeItem = new vscode.TreeItem(flag.label, vscode.TreeItemCollapsibleState.None);
    treeItem.description = enabled ? '开' : '关';
    treeItem.iconPath = new vscode.ThemeIcon(enabled ? 'check' : 'circle-slash');
    treeItem.contextValue = 'featureFlag';
    treeItem.tooltip = new vscode.MarkdownString(
      `**${flag.label}**（${flag.key}）\n\n${flag.description ?? ''}\n\n- 当前状态：${enabled ? '开' : '关'}\n- 单击切换开关`
    );
    treeItem.command = {
      command: COMMAND.toggleFeature,
      title: '切换特性开关',
      arguments: [flag.key],
    };
    return treeItem;
  }

  getChildren(): FeatureFlagNode[] {
    return FEATURE_FLAGS.map((flag) => ({ flag }));
  }
}

export interface FeatureFlagNode {
  flag: (typeof FEATURE_FLAGS)[number];
}
