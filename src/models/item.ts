import { randomUUID } from 'crypto';

/** 优先级。 */
export type Priority = 'low' | 'medium' | 'high';

/**
 * 核心数据模型：条目。
 * 需要扩展字段时，在 Item 与 ItemDraft 中同步增加，并在 src/webview/formSchema.ts 的
 * FORM_SCHEMA 里加一行字段定义，表单界面会自动渲染（详见 README「如何扩展」）。
 */
export interface Item {
  id: string;
  name: string;
  /** 分类（留空归入「未分类」） */
  category: string;
  description: string;
  priority: Priority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** 新增 / 编辑时的可写字段（不含 id 与时间戳，由服务层统一生成）。 */
export interface ItemDraft {
  name: string;
  category: string;
  description: string;
  priority: Priority;
  tags: string[];
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 供表单下拉框使用的优先级顺序（从低到高）。 */
export const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

export function isPriority(value: unknown): value is Priority {
  return value === 'low' || value === 'medium' || value === 'high';
}

/** 生成条目 ID。 */
export function createId(): string {
  return randomUUID();
}
