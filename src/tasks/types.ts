/** 启动任务的状态。 */
export type TaskStatus = 'ok' | 'warn' | 'error';

/** 任务产出的单条信息（树视图的一行）。 */
export interface TaskItem {
  label: string;
  /** 主值，如版本号 */
  description?: string;
  /** 悬停详情，如原始命令输出 */
  tooltip?: string;
  status?: TaskStatus | 'missing';
}

/** 一个启动任务的执行结果。 */
export interface TaskResult {
  taskId: string;
  taskTitle: string;
  status: TaskStatus;
  durationMs: number;
  finishedAt: string;
  items: TaskItem[];
  /** 异常时的补充说明 */
  summary?: string;
}

/**
 * 启动任务定义：插件激活时可自动执行的「脚本」。
 *
 * 当前内置任务做环境信息探测（Python/Node 版本等）；
 * 后续的「动作类」任务（如初始化、同步、构建等）同样实现本接口，
 * 在 src/tasks/taskRegistry.ts 的 TASKS 数组中注册即可被框架调度。
 */
export interface StartupTask {
  id: string;
  title: string;
  run(): Promise<TaskResult>;
}
