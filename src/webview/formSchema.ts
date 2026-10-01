import { PRIORITIES, PRIORITY_LABELS } from '../models/item';

/**
 * 表单字段 Schema：界面由它驱动。
 *
 * 想给表单加/改字段：只需修改 FORM_SCHEMA（配合 Item / ItemDraft 模型），
 * 表单 HTML、取值、回填都会自动跟随，无需改 webview 代码（详见 README「如何扩展」）。
 */
export type FormFieldType = 'text' | 'textarea' | 'select' | 'tags' | 'boolean';

export interface FormField {
  /** 对应 ItemDraft 的字段名 */
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  /** 字段下方的说明文字 */
  hint?: string;
  /** select 类型的默认值 */
  defaultValue?: string;
  /** select 类型的选项 */
  options?: { value: string; label: string }[];
  /** 输入建议列表的 datalist 元素 id（text 输入的自动补全提示） */
  datalist?: string;
}

/**
 * 条目表单 Schema：界面由它驱动。
 *
 * 想给表单加/改字段：只需修改 FORM_SCHEMA（配合 Item / ItemDraft 模型），
 * 表单 HTML、取值、回填都会自动跟随，无需改 webview 代码（详见 README「如何扩展」）。
 * 同一套框架也被「特性配置」页面复用（boolean 开关字段，见 src/features/featureConfig）。
 */
export const FORM_SCHEMA: FormField[] = [
  {
    key: 'name',
    label: '名称',
    type: 'text',
    required: true,
    placeholder: '请输入条目名称',
  },
  {
    key: 'category',
    label: '分类',
    type: 'text',
    placeholder: '例如：需求 / 任务 / 笔记（留空归入“未分类”）',
    hint: '输入时会自动提示已有分类',
    datalist: 'category-list',
  },
  {
    key: 'priority',
    label: '优先级',
    type: 'select',
    defaultValue: 'medium',
    options: PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] })),
  },
  {
    key: 'tags',
    label: '标签',
    type: 'tags',
    placeholder: '前端, 待办',
    hint: '多个标签用逗号分隔',
  },
  {
    key: 'description',
    label: '描述',
    type: 'textarea',
    placeholder: '补充说明（可选）',
  },
];
