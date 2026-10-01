import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Item } from '../../models/item';
import type { IItemStore } from './itemStore';

/**
 * 默认数据源：工作区内的 JSON 文件（路径由 crudStarter.storagePath 配置）。
 * 数据文件可直接提交到 git，也可被手工编辑——修改后插件会通过 FileSystemWatcher 自动刷新。
 */
export class JsonFileStore implements IItemStore {
  constructor(public readonly fileUri: vscode.Uri) {}

  async load(): Promise<Item[]> {
    try {
      const raw = await vscode.workspace.fs.readFile(this.fileUri);
      const data: unknown = JSON.parse(Buffer.from(raw).toString('utf8'));
      if (!Array.isArray(data)) {
        throw new Error('数据文件根节点不是数组');
      }
      return data as Item[];
    } catch (err) {
      // 首次使用：文件尚不存在，视为空数据
      if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
        return [];
      }
      // 文件损坏：备份原文件后从空数据开始，避免下次保存把原内容覆盖丢失
      await this.backupCorruptedFile(err);
      return [];
    }
  }

  async save(items: Item[]): Promise<void> {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.fileUri, '..'));
    const content = Buffer.from(JSON.stringify(items, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(this.fileUri, content);
  }

  private async backupCorruptedFile(err: unknown): Promise<void> {
    try {
      const backupPath = `${this.fileUri.fsPath}.corrupt-${Date.now()}.bak`;
      await fs.promises.rename(this.fileUri.fsPath, backupPath);
      const reason = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(
        `CRUD Starter：数据文件解析失败（${reason}）。` +
          `已备份为 ${path.basename(backupPath)}，修复后将备份内容恢复到原文件即可。`
      );
    } catch {
      // 备份失败时静默：后续保存会覆盖，至少不影响插件继续工作
    }
  }
}
