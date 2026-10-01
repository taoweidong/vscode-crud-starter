import * as vscode from 'vscode';
import type { Item } from '../../models/item';
import type { IItemStore } from './itemStore';

/**
 * 备用数据源：VSCode 全局存储（globalState）。
 * 当用户没有打开任何工作区时没有文件可写，改用 Memento 持久化，保证插件在空窗口也能用。
 */
export class MementoStore implements IItemStore {
  constructor(
    private readonly memento: vscode.Memento,
    private readonly key: string
  ) {}

  async load(): Promise<Item[]> {
    return this.memento.get<Item[]>(this.key, []);
  }

  async save(items: Item[]): Promise<void> {
    await this.memento.update(this.key, items);
  }
}
