import * as vscode from 'vscode';
import { formatTaskResult } from './environmentTask';
import type { StartupTask, TaskResult } from './types';

/**
 * 启动任务调度器：依次执行注册表中的任务，汇总结果并写入输出通道。
 * - 结果经 onDidChangeItems 事件通知界面（环境信息树视图）刷新；
 * - 单任务异常被捕获为 error 结果，不影响后续任务；
 * - runAll 重入保护：上一次未结束前忽略新的触发。
 */
export class TaskRunner implements vscode.Disposable {
  private results: TaskResult[] = [];
  private running = false;

  private readonly _onDidChangeItems = new vscode.EventEmitter<void>();
  /** 任务执行前/后触发（视图据此显示「检测中」或最新结果）。 */
  readonly onDidChangeItems = this._onDidChangeItems.event;

  constructor(
    private readonly tasks: StartupTask[],
    private readonly output: vscode.OutputChannel
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  get lastResults(): TaskResult[] {
    return [...this.results];
  }

  /** 执行全部注册任务。启动时由 extension.ts 调用（不 await，避免阻塞激活）。 */
  async runAll(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.results = [];
    this._onDidChangeItems.fire();

    this.output.appendLine(`[启动任务] 开始执行 ${this.tasks.length} 个任务…`);
    for (const task of this.tasks) {
      const startedAt = Date.now();
      try {
        const result = await task.run();
        this.writeResult(result);
        this.results.push(result);
      } catch (err) {
        // 任务内部异常统一降级为 error 结果，保证后续任务继续执行
        const failed: TaskResult = {
          taskId: task.id,
          taskTitle: task.title,
          status: 'error',
          durationMs: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
          items: [],
          summary: err instanceof Error ? err.message : String(err),
        };
        this.writeResult(failed);
        this.results.push(failed);
      }
    }
    this.running = false;
    this._onDidChangeItems.fire();
  }

  private writeResult(result: TaskResult): void {
    for (const line of formatTaskResult(result)) {
      this.output.appendLine(line);
    }
  }

  dispose(): void {
    this._onDidChangeItems.dispose();
  }
}
