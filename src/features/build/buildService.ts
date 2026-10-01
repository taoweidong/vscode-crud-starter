import { exec } from 'child_process';
import * as vscode from 'vscode';

export interface GitInfo {
  /** 当前目录是否为 Git 仓库 */
  available: boolean;
  current?: string;
  branches: string[];
}

export interface BuildResult {
  branch?: string;
  status: 'ok' | 'warn' | 'error';
  durationMs: number;
  finishedAt: string;
  message: string;
  /** 生成的 .vsix 路径（出包成功时） */
  artifact?: string;
}

const EXEC_TIMEOUT_MS = 300000;
/** GitInfo 缓存有效期：树视图刷新频繁，避免每次 spawn 两个 git 进程 */
const GIT_CACHE_TTL_MS = 5000;
/** 分支名合法性：防注入（分支名最终会进入 shell 命令） */
const BRANCH_NAME_PATTERN = /^[\w.\-/]+$/;

/** 执行 shell 命令：成功返回 stdout，失败抛出含 stderr 摘要的错误。 */
function run(command: string, cwd: string, timeoutMs = EXEC_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || stdout || err.message).trim().split(/\r?\n/).slice(-3).join('\n');
          reject(new Error(`命令失败：${command}\n${detail}`));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

/**
 * 分支编译出包服务：演示「任务自动化 + 进度反馈 + 终端输出」模式。
 * 流程：选择分支 →（必要时切换，切换前强制检查工作区干净）→ npm run package →
 * 检测到 vsce 时追加 .vsix 打包 → 结果记录到视图与输出通道。
 */
export class BuildService implements vscode.Disposable {
  private lastBuild: BuildResult | undefined;
  private gitCache: { info: GitInfo; at: number } | undefined;

  private readonly _onDidChangeItems = new vscode.EventEmitter<void>();
  readonly onDidChangeItems = this._onDidChangeItems.event;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly getCwd: () => string | undefined
  ) {}

  getLastBuild(): BuildResult | undefined {
    return this.lastBuild;
  }

  /** 读取当前分支与分支列表（非 Git 仓库时 available=false，不抛错）。
   * 结果带 5 秒 TTL 缓存，避免树视图频繁刷新时反复 spawn git 进程；build 等需要最新状态时传 force。 */
  async getGitInfo(force = false): Promise<GitInfo> {
    const now = Date.now();
    if (!force && this.gitCache && now - this.gitCache.at < GIT_CACHE_TTL_MS) {
      return this.gitCache.info;
    }
    const cwd = this.getCwd();
    let info: GitInfo;
    if (!cwd) {
      info = { available: false, branches: [] };
    } else {
      try {
        const current = (await run('git rev-parse --abbrev-ref HEAD', cwd, 10000)).trim();
        const branches = (await run('git branch --format=%(refname:short)', cwd, 10000))
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        info = { available: true, current, branches };
      } catch {
        info = { available: false, branches: [] };
      }
    }
    this.gitCache = { info, at: now };
    return info;
  }

  /** 编译出包。传入 branch 且与当前分支不同时，会先校验工作区干净再切换。 */
  async build(branch?: string): Promise<BuildResult> {
    const startedAt = Date.now();
    const cwd = this.getCwd();

    const fail = (status: 'warn' | 'error', message: string): BuildResult => {
      const result: BuildResult = {
        branch,
        status,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        message,
      };
      this.lastBuild = result;
      this._onDidChangeItems.fire();
      return result;
    };

    if (!cwd) {
      return fail('error', '未打开工作区，无法编译。');
    }
    this.output.appendLine(`[编译] 开始（分支：${branch ?? '当前'}）…`);

    // ---- Git 检查与分支切换 ----
    const git = await this.getGitInfo(true);
    if (!git.available) {
      return fail('error', '当前工作区不是 Git 仓库，无法获取分支信息。');
    }
    const target = branch || git.current;
    if (branch && branch !== git.current) {
      if (!BRANCH_NAME_PATTERN.test(branch)) {
        return fail('error', `分支名不合法（仅允许字母/数字/._-/）：${branch}`);
      }
      const dirty = (await run('git status --porcelain', cwd, 10000)).trim();
      if (dirty) {
        return fail(
          'error',
          '存在未提交的修改，切换分支前请先提交或 stash（git status 非空）。'
        );
      }
      try {
        await run(`git checkout "${branch}"`, cwd, 60000);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.output.appendLine(`[编译] 切换分支失败：${message}`);
        return fail('error', `切换分支到「${branch}」失败，详见输出通道。`);
      }
      this.gitCache = undefined; // 分支已变化，失效缓存
      this.output.appendLine(`[编译] 已切换分支：${git.current} → ${branch}`);
    }

    // ---- 编译（npm run package：类型检查 + 生产构建）----
    try {
      const buildOutput = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `CRUD Starter：编译中（${target}）`,
          cancellable: false,
        },
        () => run('npm run package', cwd)
      );
      this.output.appendLine(buildOutput.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[编译] 失败：${message}`);
      return fail('error', '编译失败：类型检查或构建未通过，详见输出通道。');
    }

    // ---- 出包（检测到 vsce 才执行，可选步骤）----
    let artifact: string | undefined;
    let status: BuildResult['status'] = 'ok';
    let extra = '';
    try {
      await run('npx --no-install vsce --version', cwd, 30000);
      const vsixOutput = await run('npx --no-install vsce package --no-dependencies', cwd);
      const match = vsixOutput.match(/(\S+\.vsix)/);
      artifact = match ? match[1] : undefined;
      this.output.appendLine(vsixOutput.trim());
    } catch {
      status = 'warn';
      extra = '；未检测到 vsce，跳过 .vsix 打包（可执行 npm i -g @vscode/vsce）';
    }

    const result: BuildResult = {
      branch: target,
      status,
      durationMs: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
      message: `编译成功（${target}）${artifact ? `，产物：${artifact}` : extra}`,
      artifact,
    };
    this.lastBuild = result;
    this.output.appendLine(
      `[编译] ✓ ${result.message}（${result.durationMs}ms）`
    );
    this._onDidChangeItems.fire();
    return result;
  }

  dispose(): void {
    this._onDidChangeItems.dispose();
  }
}
