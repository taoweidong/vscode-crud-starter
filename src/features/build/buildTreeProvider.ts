import * as vscode from 'vscode';
import { COMMAND } from '../../constants';
import type { BuildResult, BuildService, GitInfo } from './buildService';

export type BuildNode =
  | { kind: 'current'; info: GitInfo }
  | { kind: 'result'; result: BuildResult }
  | { kind: 'branch'; name: string; current: boolean }
  | { kind: 'empty'; text: string; icon: string };

/**
 * 「分支编译」树视图：当前分支 + 最近一次编译结果 + 分支清单。
 * 单击分支（或右侧 ▶ 按钮）即对该分支执行「编译出包」——演示「任务自动化入口」模式。
 */
export class BuildTreeProvider implements vscode.TreeDataProvider<BuildNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BuildNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly buildService: BuildService,
    private readonly getGitInfo: () => Promise<GitInfo>
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: BuildNode): vscode.TreeItem {
    switch (node.kind) {
      case 'current': {
        const treeItem = new vscode.TreeItem(
          node.info.current ?? '未知分支',
          vscode.TreeItemCollapsibleState.None
        );
        treeItem.description = '当前分支';
        treeItem.iconPath = new vscode.ThemeIcon('git-branch');
        treeItem.contextValue = 'buildCurrent';
        return treeItem;
      }
      case 'result': {
        const treeItem = new vscode.TreeItem('最近一次编译', vscode.TreeItemCollapsibleState.None);
        treeItem.description = node.result.message;
        treeItem.iconPath = new vscode.ThemeIcon(
          node.result.status === 'ok' ? 'check' : node.result.status === 'warn' ? 'warning' : 'error'
        );
        treeItem.tooltip = new vscode.MarkdownString(
          `**编译结果**\n\n- 分支：${node.result.branch ?? '-'}\n- 状态：${node.result.status}\n- 耗时：${node.result.durationMs}ms\n- 完成于：${new Date(node.result.finishedAt).toLocaleString()}\n\n${node.result.message}`
        );
        treeItem.contextValue = 'buildResult';
        return treeItem;
      }
      case 'branch': {
        const treeItem = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
        treeItem.description = node.current ? '当前分支 · 单击重新编译' : '单击编译出包';
        treeItem.iconPath = new vscode.ThemeIcon('git-branch');
        treeItem.contextValue = 'buildBranch';
        treeItem.command = {
          command: COMMAND.buildBranch,
          title: '编译出包',
          arguments: [node.name],
        };
        return treeItem;
      }
      default: {
        const treeItem = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
        treeItem.iconPath = new vscode.ThemeIcon(node.icon);
        return treeItem;
      }
    }
  }

  async getChildren(): Promise<BuildNode[]> {
    const info = await this.getGitInfo();
    if (!info.available) {
      return [{ kind: 'empty', text: '未检测到 Git 仓库：打开一个 Git 工作区后可用', icon: 'info' }];
    }
    const nodes: BuildNode[] = [{ kind: 'current', info }];
    const lastBuild = this.buildService.getLastBuild();
    if (lastBuild) {
      nodes.push({ kind: 'result', result: lastBuild });
    }
    nodes.push(
      ...info.branches.map(
        (name): BuildNode => ({ kind: 'branch', name, current: name === info.current })
      )
    );
    return nodes;
  }
}
