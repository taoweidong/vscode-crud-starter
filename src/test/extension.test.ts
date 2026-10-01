import * as assert from 'assert';
import { type Item, type ItemDraft } from '../models/item';
import { ItemService, ItemValidationError } from '../services/itemService';
import type { IItemStore } from '../services/stores/itemStore';

/** 测试用内存数据源：验证服务层逻辑，不依赖文件系统。 */
class MemoryStore implements IItemStore {
  data: Item[] = [];

  async load(): Promise<Item[]> {
    return this.data.map((item) => ({ ...item }));
  }

  async save(items: Item[]): Promise<void> {
    this.data = items.map((item) => ({ ...item }));
  }
}

function draft(name: string, extra: Partial<ItemDraft> = {}): ItemDraft {
  return { name, category: '', description: '', priority: 'medium', tags: [], ...extra };
}

suite('ItemService 增删改查', () => {
  let service: ItemService;

  setup(() => {
    service = new ItemService(new MemoryStore());
  });

  test('新增后可查询到条目，字段被清洗（标签去重去空白）', async () => {
    const item = await service.create(
      draft('任务A', { category: '工作', priority: 'high', tags: [' x ', 'y', 'x'] })
    );
    const all = await service.list();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, item.id);
    assert.deepStrictEqual(item.tags, ['x', 'y']);
  });

  test('名称为空时创建失败（ItemValidationError）', async () => {
    await assert.rejects(() => service.create(draft('   ')), ItemValidationError);
  });

  test('更新条目：updatedAt 变化而 createdAt 不变', async () => {
    const created = await service.create(draft('旧名'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const updated = await service.update(created.id, draft('新名', { description: 'd' }));
    assert.strictEqual(updated.name, '新名');
    assert.strictEqual(updated.createdAt, created.createdAt);
    assert.notStrictEqual(updated.updatedAt, created.updatedAt);
  });

  test('删除条目；重复删除返回 undefined', async () => {
    const created = await service.create(draft('待删'));
    const removed = await service.remove(created.id);
    assert.ok(removed);
    const again = await service.remove(created.id);
    assert.strictEqual(again, undefined);
    assert.strictEqual((await service.list()).length, 0);
  });

  test('更新条目可修改优先级', async () => {
    const created = await service.create(draft('P'));
    const updated = await service.update(created.id, draft('P', { priority: 'high' }));
    assert.strictEqual(updated.priority, 'high');
  });

  test('克隆条目名称带（副本）后缀', async () => {
    const created = await service.create(draft('原始', { category: '工作' }));
    const copy = await service.duplicate(created.id);
    assert.strictEqual(copy.name, '原始（副本）');
    assert.strictEqual(copy.category, '工作');
    assert.notStrictEqual(copy.id, created.id);
  });

  test('过滤：按关键字匹配，清空后恢复全量', async () => {
    await service.create(draft('前端重构', { tags: ['web'] }));
    await service.create(draft('后端接口', { tags: ['api'] }));
    service.setFilter('api');
    const filtered = await service.list();
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].name, '后端接口');
    service.setFilter('');
    assert.strictEqual((await service.list()).length, 2);
  });

  test('getCategories 返回去重后的分类', async () => {
    await service.create(draft('A', { category: '工作' }));
    await service.create(draft('B', { category: '工作' }));
    await service.create(draft('C', { category: '生活' }));
    assert.deepStrictEqual(await service.getCategories(), ['工作', '生活']);
  });
});
