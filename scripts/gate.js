/**
 * 一键式质量门禁：任何代码/配置/文档改动后，收尾前必须整体执行并通过。
 *
 *   npm run gate
 *
 * 步骤：类型检查 → 生产构建 → 测试编译 → 静态一致性检查 → 全量单元测试。
 * 任一步骤失败立即终止并以非零码退出；静态检查与表单渲染验证内嵌于本脚本。
 * 首次运行会自动下载测试用 VS Code（缓存在 .vscode-test/，已被 gitignore）。
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
process.chdir(root);

const results = [];
let failed = false;

function runStep(name, fn, { timeout } = {}) {
  const startedAt = Date.now();
  process.stdout.write(`\n▶ ${name}\n`);
  try {
    const output = fn({ timeout });
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (typeof output === 'string' && output.trim()) {
      process.stdout.write(output.trim().split(/\r?\n/).slice(-3).join('\n') + '\n');
    }
    results.push({ name, ok: true, seconds });
  } catch (err) {
    failed = true;
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    results.push({ name, ok: false, seconds });
    const text = String(err.stdout || '') + String(err.stderr || '') + String(err.message || '');
    process.stdout.write(
      '  ✗ 失败（' + seconds + 's），输出末尾：\n' +
        '  ' + text.trim().split(/\r?\n/).slice(-12).join('\n  ') + '\n'
    );
  }
}

function exec(command, timeout) {
  return execSync(command, {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: timeout || 300000,
    env: { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' },
  });
}

/** 静态一致性检查：清单 ↔ 常量 ↔ 视图 when ↔ 表单渲染（无需 VS Code 宿主）。 */
function staticChecks() {
  const assert = require('assert');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  // 项目元数据
  assert.strictEqual(pkg.name, 'vscode-starter-template', 'package.json name 应为 vscode-starter-template');
  assert(pkg.repository && pkg.repository.url.includes('vscode-starter-template'), 'repository 应指向新仓库');

  // 命令 / 子菜单 / 视图 声明闭合
  const cmds = new Set(pkg.contributes.commands.map((c) => c.command));
  const subs = new Set((pkg.contributes.submenus || []).map((s) => s.id));
  const menus = pkg.contributes.menus;
  const checkEntry = (entry, where) => {
    const label = entry.command || entry.submenu;
    assert(entry.when && entry.when.includes('view =='), `${where} 缺 when: ${label}`);
    if (entry.command) assert(cmds.has(entry.command), `${where} 引用未声明命令: ${entry.command}`);
    if (entry.submenu) assert(subs.has(entry.submenu), `${where} 引用未声明子菜单: ${entry.submenu}`);
  };
  for (const entry of menus['view/title']) checkEntry(entry, 'view/title');
  for (const entry of menus['view/item/context']) checkEntry(entry, 'view/item/context');
  for (const subId of subs) {
    assert(Array.isArray(menus[subId]), `子菜单缺少菜单节: ${subId}`);
    for (const entry of menus[subId]) {
      assert(cmds.has(entry.command), `子菜单引用未声明命令: ${entry.command}`);
    }
  }
  for (const key of ['editor/context', 'explorer/context', 'editor/title']) {
    for (const entry of menus[key] || []) {
      if (entry.command) {
        assert(cmds.has(entry.command), `${key} 引用未声明命令: ${entry.command}`);
      }
      // editor/context 与 editor/title 的可见性依赖编辑器状态（选区/是否打开），必须声明 when；
      // explorer/context 天然适用于所有资源，when 可选
      if (key !== 'explorer/context') {
        assert(entry.when, `${key} 缺 when: ${entry.command}`);
      }
    }
  }
  for (const kb of pkg.contributes.keybindings) {
    assert(cmds.has(kb.command), `快捷键引用未声明命令: ${kb.command}`);
  }

  // 视图 ↔ 容器
  const viewIds = new Set();
  for (const [containerId, views] of Object.entries(pkg.contributes.views)) {
    assert(
      pkg.contributes.viewsContainers.activitybar.some((v) => v.id === containerId),
      `视图容器未声明: ${containerId}`
    );
    for (const view of views) viewIds.add(view.id);
  }
  assert(viewIds.size >= 6, `视图数量异常: ${viewIds.size}`);

  // constants.ts ↔ manifest 双向一致
  const src = fs.readFileSync(path.join(root, 'src/constants.ts'), 'utf8');
  const block = src.slice(
    src.indexOf('export const COMMAND'),
    src.indexOf('} as const;', src.indexOf('export const COMMAND'))
  );
  const constIds = [...block.matchAll(/'(crudStarter\.[a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.strictEqual(
    constIds.length,
    cmds.size,
    `constants 命令数(${constIds.length}) != 清单命令数(${cmds.size})`
  );
  for (const id of constIds) {
    assert(cmds.has(id), `constants 中的命令未在清单声明: ${id}`);
  }

  // 表单渲染器运行时验证（stub 掉 vscode 模块）
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return {};
    return origLoad.call(this, request, parent, isMain);
  };
  try {
    const out = path.join(root, 'out');
    const { renderFormHtml } = require(path.join(out, 'webview/formHtml.js'));
    const { FORM_SCHEMA } = require(path.join(out, 'webview/formSchema.js'));
    const { toFormFields } = require(path.join(out, 'features/featureConfig/featureFlags.js'));

    const itemHtml = renderFormHtml({ title: 'gate', schema: FORM_SCHEMA });
    assert(!itemHtml.includes('${'), '条目表单存在未解析插值');
    assert(itemHtml.includes("script-src 'nonce-"), '条目表单 script nonce 缺失');
    assert(itemHtml.includes("style-src 'nonce-"), '条目表单 style nonce 缺失');
    assert(itemHtml.includes('list="category-list"'), 'datalist 应由 Schema 渲染');
    assert(itemHtml.includes('<form id="crud-form" novalidate>'), '缺少 novalidate');

    const fields = toFormFields();
    assert(fields.length >= 5, `特性开关数量异常: ${fields.length}`);
    const configHtml = renderFormHtml({ title: 'gate-config', schema: fields });
    for (const field of fields) {
      assert(
        configHtml.includes(`type="checkbox" id="field-${field.key}"`),
        `开关控件缺失: ${field.key}`
      );
    }
    assert(configHtml.includes("schema = msg.schema || []"), 'schema 应由 init 消息驱动');
  } finally {
    Module._load = origLoad;
  }
}

// ---- 步骤编排 ----
runStep('1/5 类型检查（tsc --noEmit，strict）', () => exec('npx tsc --noEmit'));

runStep('2/5 生产构建（esbuild --production）', () => exec('node esbuild.js --production'));

runStep('3/5 测试编译（tsc → out/）', () => exec('npx tsc -p . --outDir out'));

runStep('4/5 静态一致性检查（清单/常量/视图/表单渲染）', () => {
  staticChecks();
  return '清单、常量、视图 when、表单渲染全部闭合';
});

runStep(
  '5/5 全量单元测试（@vscode/test-electron）',
  ({ timeout }) => {
    const output = exec('node out/test/runTest.js', timeout);
    const summary = output.split(/\r?\n/).filter((line) => /passing|failing|pending/.test(line));
    return summary.join('\n');
  },
  { timeout: 600000 }
);

// ---- 汇总 ----
const width = 46;
process.stdout.write('\n┌' + '─'.repeat(width) + '┐\n');
for (const result of results) {
  const mark = result.ok ? '✓' : '✗';
  const label = `${mark} ${result.name}`.slice(0, width - 9);
  process.stdout.write(
    '│ ' + label.padEnd(width - 9, ' ') + ` ${result.ok ? '通过' : '失败'} ${result.seconds}s │\n`
  );
}
process.stdout.write('└' + '─'.repeat(width) + '┘\n');

if (failed) {
  process.stdout.write('\n✗ 门禁未通过：请修复失败步骤后重跑 npm run gate\n');
  process.exit(1);
}
process.stdout.write('\n✓ 门禁全部通过，可以提交/推送\n');
