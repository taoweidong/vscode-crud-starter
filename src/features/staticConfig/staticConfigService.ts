import * as vscode from 'vscode';

/** 静态配置的一个分组（对应配置文件的一个顶层键）。 */
export interface StaticConfigSection {
  title: string;
  entries: StaticConfigEntry[];
}

export interface StaticConfigEntry {
  key: string;
  value: string;
}

/** 默认静态配置模板（环境初始化时生成到工作区）。 */
export const DEFAULT_STATIC_CONFIG: Record<string, unknown> = {
  project: {
    name: 'CRUD Starter 示例项目',
    version: '0.4.0',
    author: 'your-name',
  },
  build: {
    outputDir: 'dist',
    target: 'es2022',
    minify: true,
  },
  runtime: {
    node: '>=18',
    python: '>=3.8',
  },
};

/**
 * 静态配置服务：读取工作区内的 .vscode/crud-starter.config.json（只读展示）。
 * - 环境初始化负责生成默认模板；
 * - 文件被手工修改后由 FileSystemWatcher 触发重新加载（extension.ts 接线）；
 * - flatten 把嵌套 JSON 拍平为「分组 → 条目」结构，供树视图渲染。
 */
export class StaticConfigService implements vscode.Disposable {
  private sections: StaticConfigSection[] = [];
  private readonly _onDidChangeItems = new vscode.EventEmitter<void>();
  readonly onDidChangeItems = this._onDidChangeItems.event;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly getRoot: () => vscode.Uri | undefined
  ) {}

  get fileUri(): vscode.Uri | undefined {
    const root = this.getRoot();
    return root ? vscode.Uri.joinPath(root, '.vscode/crud-starter.config.json') : undefined;
  }

  getSections(): StaticConfigSection[] {
    return this.sections;
  }

  /** 配置文件不存在时生成默认模板；返回是否创建。 */
  async ensureDefault(): Promise<'created' | 'exists' | 'no-workspace'> {
    const uri = this.fileUri;
    if (!uri) {
      return 'no-workspace';
    }
    try {
      await vscode.workspace.fs.stat(uri);
      return 'exists';
    } catch {
      // 文件不存在 → 继续生成
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(JSON.stringify(DEFAULT_STATIC_CONFIG, null, 2), 'utf8')
    );
    this.output.appendLine(`[静态配置] 已生成默认配置：${uri.fsPath}`);
    return 'created';
  }

  /** 读取并拍平配置文件；缺失或解析失败时展示为空（不抛错）。 */
  async load(): Promise<void> {
    const uri = this.fileUri;
    if (!uri) {
      this.sections = [];
      this._onDidChangeItems.fire();
      return;
    }
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const data: unknown = JSON.parse(Buffer.from(raw).toString('utf8'));
      this.sections = StaticConfigService.flatten(
        data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
      );
    } catch (err) {
      if (!(err instanceof vscode.FileSystemError && err.code === 'FileNotFound')) {
        this.output.appendLine(
          `[静态配置] 解析失败：${err instanceof Error ? err.message : String(err)}`
        );
      }
      this.sections = [];
    }
    this._onDidChangeItems.fire();
  }

  /** 嵌套 JSON → 「分组 → 条目」：顶层对象键成为分组，其原始值/子键成为条目。 */
  static flatten(data: Record<string, unknown>): StaticConfigSection[] {
    const sections: StaticConfigSection[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const entries = Object.entries(value as Record<string, unknown>).map(
          ([entryKey, entryValue]): StaticConfigEntry => ({
            key: entryKey,
            value: stringify(entryValue),
          })
        );
        sections.push({ title: key, entries });
      } else {
        sections.push({ title: key, entries: [{ key, value: stringify(value) }] });
      }
    }
    return sections;
  }

  dispose(): void {
    this._onDidChangeItems.dispose();
  }
}

function stringify(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
