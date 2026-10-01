import * as vscode from 'vscode';
import {
  createId,
  isPriority,
  type Item,
  type ItemDraft,
  type Priority,
} from '../models/item';
import type { IItemStore } from './stores/itemStore';

/** 业务校验失败（区别于 IO 异常，界面会按「可修正错误」提示）。 */
export class ItemValidationError extends Error {}

/**
 * 业务服务层：所有 CRUD 操作的入口。
 * 职责：输入校验、字段清洗、时间戳与 ID 生成、过滤、变更事件通知。
 * 持久化委托给 IItemStore，本层不关心数据存在哪里。
 */
export class ItemService {
  private cache: Item[] | undefined;
  private filter = '';

  private readonly _onDidChangeItems = new vscode.EventEmitter<void>();
  /** 数据发生变化（或过滤条件变化）后触发，树视图订阅它实现自动刷新。 */
  readonly onDidChangeItems = this._onDidChangeItems.event;

  constructor(private readonly store: IItemStore) {}

  // ---------------- 查（R） ----------------

  /** 列出条目（自动应用当前过滤关键字）。 */
  async list(): Promise<Item[]> {
    const items = await this.ensureLoaded();
    const keyword = this.filter.trim().toLowerCase();
    if (!keyword) {
      return [...items];
    }
    return items.filter((item) =>
      [item.name, item.category, item.description, item.tags.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    );
  }

  async get(id: string): Promise<Item | undefined> {
    return (await this.ensureLoaded()).find((item) => item.id === id);
  }

  /** 已有的分类列表（供表单 datalist 提示）。 */
  async getCategories(): Promise<string[]> {
    const categories = new Set(
      (await this.ensureLoaded()).map((item) => item.category).filter(Boolean)
    );
    return [...categories].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }

  getFilter(): string {
    return this.filter;
  }

  get filtered(): boolean {
    return this.filter.trim().length > 0;
  }

  setFilter(keyword: string): void {
    this.filter = keyword ?? '';
    this._onDidChangeItems.fire();
  }

  // ---------------- 增（C）改（U）删（D） ----------------

  async create(draft: ItemDraft): Promise<Item> {
    const input = this.validate(draft);
    const now = new Date().toISOString();
    const item: Item = { id: createId(), ...input, createdAt: now, updatedAt: now };
    const items = await this.ensureLoaded();
    items.push(item);
    await this.persist(items);
    return item;
  }

  async update(id: string, draft: ItemDraft): Promise<Item> {
    const input = this.validate(draft);
    const items = await this.ensureLoaded();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new ItemValidationError('条目不存在，可能已被删除。');
    }
    const updated: Item = { ...items[index], ...input, updatedAt: new Date().toISOString() };
    items[index] = updated;
    await this.persist(items);
    return updated;
  }

  async remove(id: string): Promise<Item | undefined> {
    const items = await this.ensureLoaded();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) {
      return undefined;
    }
    const [removed] = items.splice(index, 1);
    await this.persist(items);
    return removed;
  }

  async duplicate(id: string): Promise<Item> {
    const source = await this.get(id);
    if (!source) {
      throw new ItemValidationError('条目不存在，可能已被删除。');
    }
    return this.create({
      name: `${source.name}（副本）`,
      category: source.category,
      description: source.description,
      priority: source.priority,
      tags: source.tags,
    });
  }

  /** 存储被外部修改（如手工编辑 JSON 文件）后调用：丢弃缓存并刷新视图。 */
  reload(): void {
    this.cache = undefined;
    this._onDidChangeItems.fire();
  }

  // ---------------- 内部 ----------------

  private validate(draft: ItemDraft): ItemDraft {
    const name = (draft?.name ?? '').trim();
    if (!name) {
      throw new ItemValidationError('名称不能为空。');
    }
    const priority: Priority = isPriority(draft?.priority) ? draft.priority : 'medium';
    return {
      name,
      category: (draft?.category ?? '').trim(),
      description: (draft?.description ?? '').trim(),
      priority,
      tags: [...new Set((draft?.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean))],
    };
  }

  private async ensureLoaded(): Promise<Item[]> {
    if (!this.cache) {
      this.cache = await this.store.load();
    }
    return this.cache;
  }

  private async persist(items: Item[]): Promise<void> {
    this.cache = items;
    await this.store.save(items);
    this._onDidChangeItems.fire();
  }
}
