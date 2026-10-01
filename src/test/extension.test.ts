import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { type Item, type ItemDraft } from '../models/item';
import { ItemService, ItemValidationError } from '../services/itemService';
import { JsonFileStore } from '../services/stores/jsonFileStore';
import { MementoStore } from '../services/stores/mementoStore';
import type { IItemStore } from '../services/stores/itemStore';
import { ItemsTreeDataProvider } from '../providers/itemsTreeDataProvider';
import { renderFormHtml } from '../webview/formHtml';
import { FORM_SCHEMA } from '../webview/formSchema';
import { environmentTask } from '../tasks/environmentTask';
import { TaskRunner } from '../tasks/taskRunner';
import type { StartupTask } from '../tasks/types';
import { BuildService } from '../features/build/buildService';
import {
  FEATURE_FLAGS,
  getFeatureValue,
  setFeatureValue,
  toFormFields,
} from '../features/featureConfig/featureFlags';
import { InitService } from '../features/init/initService';
import type { InitStep } from '../features/init/initSteps';
import { StaticConfigService } from '../features/staticConfig/staticConfigService';

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

suite('启动任务框架', () => {
  function fakeTask(id: string, title: string, behavior: () => Promise<void>): StartupTask {
    return {
      id,
      title,
      async run() {
        await behavior();
        return {
          taskId: id,
          taskTitle: title,
          status: 'ok',
          durationMs: 1,
          finishedAt: new Date().toISOString(),
          items: [{ label: '示例', description: '1.0.0', status: 'ok' }],
        };
      },
    };
  }

  test('TaskRunner 依次执行任务并发出变更事件', async () => {
    let runs = 0;
    const task = fakeTask('demo', '演示任务', async () => {
      runs++;
    });
    const runner = new TaskRunner([task], vscode.window.createOutputChannel('CRUD Starter Test'));
    let events = 0;
    runner.onDidChangeItems(() => events++);
    await runner.runAll();
    assert.strictEqual(runs, 1);
    assert.strictEqual(events, 2); // 开始一次 + 结束一次
    assert.strictEqual(runner.lastResults.length, 1);
    assert.strictEqual(runner.lastResults[0].items[0].label, '示例');
  });

  test('任务抛错时降级为 error 结果且不影响后续任务', async () => {
    const boom = fakeTask('boom', '爆炸任务', async () => {
      throw new Error('boom');
    });
    const okTask = fakeTask('ok', '正常任务', async () => undefined);
    const runner = new TaskRunner(
      [boom, okTask],
      vscode.window.createOutputChannel('CRUD Starter Test')
    );
    await runner.runAll();
    assert.strictEqual(runner.lastResults.length, 2);
    assert.strictEqual(runner.lastResults[0].status, 'error');
    assert.strictEqual(runner.lastResults[1].status, 'ok');
  });

  test('环境检测任务能探测到 Node.js（npm test 运行前提）', async () => {
    const runner = new TaskRunner(
      [environmentTask],
      vscode.window.createOutputChannel('CRUD Starter Test')
    );
    await runner.runAll();
    const env = runner.lastResults[0];
    const node = env.items.find((item) => item.label === 'Node.js');
    assert.ok(node, '应包含 Node.js 条目');
    assert.strictEqual(node.status, 'ok');
    assert.match(node.description ?? '', /^v/);
    assert.ok(env.items.some((item) => item.label === 'Python'));
    assert.ok(env.items.some((item) => item.label === 'Git'));
  });
});

suite('特性配置', () => {
  test('开关读写走全局设置并可还原', async () => {
    const original = getFeatureValue('confirmDelete');
    await setFeatureValue('confirmDelete', !original);
    assert.strictEqual(getFeatureValue('confirmDelete'), !original);
    await setFeatureValue('confirmDelete', original);
    assert.strictEqual(getFeatureValue('confirmDelete'), original);
  });

  test('toFormFields 生成 boolean 表单字段（供配置页面复用表单框架）', () => {
    const fields = toFormFields();
    assert.strictEqual(fields.length, FEATURE_FLAGS.length);
    for (const field of fields) {
      assert.strictEqual(field.type, 'boolean');
      assert.ok(['true', 'false'].includes(field.defaultValue ?? ''));
    }
  });
});

suite('环境初始化', () => {
  test('步骤顺序执行：失败不阻断后续步骤', async () => {
    const steps: InitStep[] = [
      { id: 'a', title: 'A', description: '', run: async () => 'ok-a' },
      {
        id: 'b',
        title: 'B',
        description: '',
        run: async () => {
          throw new Error('bad');
        },
      },
      { id: 'c', title: 'C', description: '', run: async () => 'ok-c' },
    ];
    const output = vscode.window.createOutputChannel('CRUD Starter Test');
    const svc = new InitService(steps, output, new StaticConfigService(output, () => undefined));
    await svc.runAll();
    const states = svc.getStates();
    assert.strictEqual(states[0].status, 'done');
    assert.strictEqual(states[0].message, 'ok-a');
    assert.strictEqual(states[1].status, 'failed');
    assert.strictEqual(states[1].message, 'bad');
    assert.strictEqual(states[2].status, 'done');
  });
});

suite('静态配置', () => {
  test('ensureDefault 生成默认配置并可加载为分组条目', async () => {
    const dir = path.join(os.tmpdir(), `crud-static-test-${Date.now()}`);
    const root = vscode.Uri.file(dir);
    const output = vscode.window.createOutputChannel('CRUD Starter Test');
    const svc = new StaticConfigService(output, () => root);
    try {
      assert.strictEqual(await svc.ensureDefault(), 'created');
      assert.strictEqual(await svc.ensureDefault(), 'exists');
      await svc.load();
      const sections = svc.getSections();
      assert.ok(sections.length >= 3, '应至少包含 project/build/runtime 三个分组');
      const build = sections.find((section) => section.title === 'build');
      assert.ok(build, '应包含 build 分组');
      const outputDir = build.entries.find((entry) => entry.key === 'outputDir');
      assert.strictEqual(outputDir?.value, 'dist');
    } finally {
      // 清理临时目录，避免多次运行测试后残留
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('flatten 拍平嵌套 JSON 为分组条目', () => {
    const sections = StaticConfigService.flatten({ name: 'demo', nested: { a: 1, b: true } });
    assert.strictEqual(sections[0].entries[0].value, 'demo');
    const nested = sections.find((section) => section.title === 'nested');
    assert.deepStrictEqual(
      nested?.entries.map((entry) => entry.key),
      ['a', 'b']
    );
  });
});

suite('分支编译', () => {
  test('getGitInfo 识别当前仓库与 main 分支', async () => {
    const output = vscode.window.createOutputChannel('CRUD Starter Test');
    const svc = new BuildService(output, () => path.resolve(__dirname, '..', '..'));
    const info = await svc.getGitInfo();
    assert.strictEqual(info.available, true);
    assert.ok(info.branches.includes('main'));
    assert.strictEqual(info.current, 'main');
  });

  test('非 Git 目录返回 available=false 而不抛错', async () => {
    const output = vscode.window.createOutputChannel('CRUD Starter Test');
    const svc = new BuildService(output, () => os.tmpdir());
    const info = await svc.getGitInfo();
    assert.strictEqual(info.available, false);
  });
});

suite('JsonFileStore', () => {
  function sampleItem(id: string, name: string): Item {
    return {
      id,
      name,
      category: '测试',
      description: '',
      priority: 'medium',
      tags: ['t'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  test('文件不存在返回空数组；save→load 往返一致', async () => {
    const dir = path.join(os.tmpdir(), `crud-store-test-${Date.now()}`);
    const store = new JsonFileStore(vscode.Uri.file(path.join(dir, 'data', 'items.json')));
    try {
      assert.deepStrictEqual(await store.load(), []);
      const items = [sampleItem('1', '甲'), sampleItem('2', '乙')];
      await store.save(items);
      assert.deepStrictEqual(await store.load(), items);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('文件损坏时备份原文件并从空数据开始', async () => {
    const dir = path.join(os.tmpdir(), `crud-store-corrupt-${Date.now()}`);
    const fileUri = vscode.Uri.file(path.join(dir, 'items.json'));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(fileUri, '..'));
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from('{corrupt', 'utf8'));
    try {
      const store = new JsonFileStore(fileUri);
      assert.deepStrictEqual(await store.load(), []);
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(fileUri, '..'));
      assert.ok(entries.some(([name]) => name.endsWith('.bak')), '应生成损坏备份文件');
      assert.ok(!entries.some(([name]) => name === 'items.json'), '原损坏文件应已移走');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

suite('MementoStore', () => {
  test('读写往返（模拟 Memento）', async () => {
    const backing = new Map<string, unknown>();
    const memento = {
      get: (key: string, defaultValue?: unknown) =>
        backing.has(key) ? backing.get(key) : defaultValue,
      update: async (key: string, value: unknown) => {
        backing.set(key, value);
      },
    } as unknown as vscode.Memento;
    const store = new MementoStore(memento, 'test.key');
    assert.deepStrictEqual(await store.load(), []);
    await store.save([
      {
        id: '1',
        name: '甲',
        category: '',
        description: '',
        priority: 'low',
        tags: [],
        createdAt: '',
        updatedAt: '',
      },
    ]);
    assert.strictEqual((await store.load()).length, 1);
  });
});

suite('条目树视图', () => {
  test('按分类分组，子节点归属正确', async () => {
    const service = new ItemService(new MemoryStore());
    await service.create(draft('甲', { category: '工作' }));
    await service.create(draft('乙', { category: '工作' }));
    await service.create(draft('丙', { category: '生活' }));
    const provider = new ItemsTreeDataProvider(service);

    const roots = await provider.getChildren();
    const work = roots.find((node) => node.kind === 'category' && node.label === '工作');
    assert.ok(work && work.kind === 'category' && work.count === 2, '「工作」分组应有 2 项');
    const life = roots.find((node) => node.kind === 'category' && node.label === '生活');
    assert.ok(life && life.kind === 'category' && life.count === 1);

    const children = await provider.getChildren({ kind: 'category', label: '工作', count: 2 });
    assert.strictEqual(children.length, 2);
    assert.ok(children.every((node) => node.kind === 'item'));
    assert.deepStrictEqual(
      children.map((node) => (node.kind === 'item' ? node.item.name : '')),
      ['甲', '乙']
    );
  });

  test('过滤生效时平铺展示匹配项', async () => {
    const service = new ItemService(new MemoryStore());
    await service.create(draft('前端重构', { tags: ['web'] }));
    await service.create(draft('后端接口', { tags: ['api'] }));
    service.setFilter('api');
    const provider = new ItemsTreeDataProvider(service);
    const roots = await provider.getChildren();
    assert.strictEqual(roots.length, 1);
    assert.ok(roots[0].kind === 'item' && roots[0].item.name === '后端接口');
    assert.ok(service.filtered);
  });
});

suite('表单渲染器', () => {
  test('条目 Schema：CSP nonce / 必填标记 / datalist 声明化渲染', () => {
    const html = renderFormHtml({ title: '新增条目', schema: FORM_SCHEMA });
    assert.ok(html.includes("script-src 'nonce-"), 'script nonce 缺失');
    assert.ok(html.includes("style-src 'nonce-"), 'style nonce 缺失');
    assert.ok(html.includes('list="category-list"'), 'datalist 应由 Schema 的 datalist 属性渲染');
    assert.ok(html.includes('class="required"'), '必填标记缺失');
    assert.ok(!html.includes('${'), '存在未解析插值');
    assert.ok(html.includes('<form id="crud-form" novalidate>'), '缺少 novalidate');
  });

  test('boolean 开关字段渲染（特性配置页复用）', () => {
    const fields = toFormFields();
    const html = renderFormHtml({ title: '特性配置', schema: fields });
    for (const field of fields) {
      assert.ok(html.includes(`type="checkbox" id="field-${field.key}"`), `开关缺失: ${field.key}`);
    }
    assert.ok(html.includes('schema = msg.schema || []'), 'schema 应由 init 消息驱动');
  });
});

suite('分支编译（补充）', () => {
  test('未打开工作区时返回 error 结果而不抛错', async () => {
    const output = vscode.window.createOutputChannel('CRUD Starter Test');
    const svc = new BuildService(output, () => undefined);
    const result = await svc.build();
    assert.strictEqual(result.status, 'error');
    assert.match(result.message, /未打开工作区/);
  });
});
