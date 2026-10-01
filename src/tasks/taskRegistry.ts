import { environmentTask } from './environmentTask';
import type { StartupTask } from './types';

/**
 * 启动任务注册表：插件激活时由 TaskRunner 依次执行。
 *
 * 新增启动脚本（包括后续「动作类」任务，如初始化、同步、构建等）只需：
 * 1. 实现 StartupTask 接口（src/tasks/types.ts）；
 * 2. 在本数组中加一项。界面（环境信息视图）与调度（TaskRunner）零改动。
 */
export const TASKS: StartupTask[] = [environmentTask];
