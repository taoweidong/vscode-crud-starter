import { exec } from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import type { StartupTask, TaskItem, TaskResult, TaskStatus } from './types';

const PROBE_TIMEOUT_MS = 8000;

/** 执行一条 shell 命令并返回其输出的首行；失败或无输出返回空串（不抛错）。 */
function execCapture(command: string): Promise<string> {
  return new Promise((resolve) => {
    exec(
      command,
      { timeout: PROBE_TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => {
        const firstLine = (value: string): string =>
          value.trim().split(/\r?\n/)[0]?.trim() ?? '';
        const out = firstLine(stdout || '');
        if (out) {
          resolve(out);
          return;
        }
        // 仅当退出码为 0 时才接受 stderr：兼容旧版 Python 把 --version 输出到 stderr 的行为；
        // 命令本身失败（如 cmd 的“不是内部或外部命令”）一律视为未检测到，不能把报错当版本号
        if (!err && stderr) {
          resolve(firstLine(stderr));
          return;
        }
        resolve('');
      }
    );
  });
}

/** 依序尝试一组候选命令（fallback 链），返回首个有输出版本号的结果。 */
async function probeVersion(commands: string[]): Promise<{ version: string; command?: string }> {
  for (const command of commands) {
    const output = await execCapture(command);
    if (output) {
      return { version: output, command };
    }
  }
  return { version: '' };
}

/**
 * 内置启动任务：环境检测。
 * 探测 Python / Node / npm / Git 版本与系统、VSCode 信息；
 * Python 按 py -3 → python → python3 的顺序回退（覆盖 Windows 常见安装形态）。
 */
export const environmentTask: StartupTask = {
  id: 'environment',
  title: '环境检测',

  async run(): Promise<TaskResult> {
    const startedAt = Date.now();
    const items: TaskItem[] = [];

    // ---- Python（带 fallback 链）----
    const pyCandidates = ['py -3 --version', 'python --version', 'python3 --version'];
    const py = await probeVersion(pyCandidates);
    items.push(
      py.version
        ? {
            label: 'Python',
            description: py.version.replace(/^Python\s*/i, ''),
            tooltip: `检测命令：${py.command ?? ''}`,
            status: 'ok',
          }
        : {
            label: 'Python',
            description: '未检测到',
            tooltip: `已尝试：${pyCandidates.join('、')}`,
            status: 'missing',
          }
    );

    // ---- Node.js / npm ----
    const node = await probeVersion(['node --version']);
    items.push(
      node.version
        ? { label: 'Node.js', description: node.version, status: 'ok' }
        : { label: 'Node.js', description: '未检测到', status: 'missing' }
    );

    const npm = await probeVersion(['npm --version']);
    items.push(
      npm.version
        ? { label: 'npm', description: npm.version, status: 'ok' }
        : { label: 'npm', description: '未检测到', status: 'missing' }
    );

    // ---- Git ----
    const git = await probeVersion(['git --version']);
    items.push(
      git.version
        ? { label: 'Git', description: git.version.replace(/^git\s*/i, ''), status: 'ok' }
        : { label: 'Git', description: '未检测到', status: 'missing' }
    );

    // ---- 操作系统 ----
    items.push({
      label: '操作系统',
      description: `${os.type()} ${os.release()}（${process.arch}）`,
      status: 'ok',
    });

    // ---- VSCode 宿主 ----
    items.push({
      label: 'VSCode',
      description: `${vscode.env.appName} ${vscode.version}`,
      status: 'ok',
    });

    // ---- 汇总状态：全部就绪 → ok；有缺失 → warn ----
    const missing = items.filter((item) => item.status !== 'ok').length;
    const status: TaskStatus = missing === 0 ? 'ok' : 'warn';

    return {
      taskId: environmentTask.id,
      taskTitle: environmentTask.title,
      status,
      durationMs: Date.now() - startedAt,
      finishedAt: new Date().toISOString(),
      items,
    };
  },
};

/** 供输出通道使用的格式化报告。 */
export function formatTaskResult(result: TaskResult): string[] {
  const time = new Date(result.finishedAt).toLocaleTimeString();
  const lines: string[] = [
    `[${time}] ${result.taskTitle} 完成，耗时 ${result.durationMs}ms`,
  ];
  for (const item of result.items) {
    const mark = item.status === 'ok' ? '✓' : '✗';
    const pad = item.label.padEnd(12, ' ');
    lines.push(`  ${mark} ${pad}${item.description ?? ''}`);
  }
  if (result.summary) {
    lines.push(`  ! ${result.summary}`);
  }
  return lines;
}
