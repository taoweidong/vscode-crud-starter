import * as vscode from 'vscode';
import type { StaticConfigService } from '../staticConfig/staticConfigService';
import type { InitContext, InitStep } from './initSteps';

export type StepStatus = 'idle' | 'running' | 'done' | 'failed';

export interface StepState {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  /** 执行结果信息（成功信息或失败原因） */
  message?: string;
  durationMs?: number;
}

/**
 * 环境初始化状态机：管理每个步骤的执行状态。
 * - 单步失败不中断后续步骤（与 TaskRunner 同构的容错策略）；
 * - 状态经事件通知树视图刷新；
 * - 步骤可单独重跑，也可全部执行。
 */
export class InitService implements vscode.Disposable {
  private states: StepState[];
  private running = false;

  private readonly _onDidChangeItems = new vscode.EventEmitter<void>();
  readonly onDidChangeItems = this._onDidChangeItems.event;

  constructor(
    private readonly steps: InitStep[],
    private readonly output: vscode.OutputChannel,
    private readonly staticConfig: StaticConfigService
  ) {
    this.states = steps.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
      status: 'idle',
    }));
  }

  get isRunning(): boolean {
    return this.running;
  }

  getStates(): StepState[] {
    return [...this.states];
  }

  /** 执行单个步骤（按 id）。 */
  async runStep(stepId: string): Promise<void> {
    const step = this.steps.find((item) => item.id === stepId);
    const state = this.states.find((item) => item.id === stepId);
    if (!step || !state) {
      return;
    }
    await this.execute(step, state);
  }

  /** 依次执行全部步骤。 */
  async runAll(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this._onDidChangeItems.fire();
    for (const step of this.steps) {
      const state = this.states.find((item) => item.id === step.id);
      if (!state) {
        continue;
      }
      await this.execute(step, state);
    }
    this.running = false;
    this._onDidChangeItems.fire();
  }

  private async execute(step: InitStep, state: StepState): Promise<void> {
    const startedAt = Date.now();
    state.status = 'running';
    state.message = undefined;
    this._onDidChangeItems.fire();

    const ctx: InitContext = {
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri,
      output: this.output,
      staticConfig: this.staticConfig,
    };
    try {
      const message = await step.run(ctx);
      state.status = 'done';
      state.message = message;
      state.durationMs = Date.now() - startedAt;
      this.output.appendLine(`[初始化] ✓ ${step.title}：${message}（${state.durationMs}ms）`);
    } catch (err) {
      state.status = 'failed';
      state.message = err instanceof Error ? err.message : String(err);
      state.durationMs = Date.now() - startedAt;
      this.output.appendLine(`[初始化] ✗ ${step.title}：${state.message}`);
    }
    this._onDidChangeItems.fire();
  }

  dispose(): void {
    this._onDidChangeItems.dispose();
  }
}
