import * as vscode from 'vscode';
import { CONFIG } from '../../constants';
import type { FormField } from '../../webview/formSchema';

/**
 * 特性开关定义：单一来源。
 * - 树视图（特性配置）与 Webview 配置页面都从这里读取；
 * - 插件各处通过 getFeatureValue() 读取并真实影响行为（确认弹窗、通知、图标等）；
 * - package.json 的 crudStarter.features.* 与此保持一致（用于设置界面与默认值声明）。
 */
export interface FeatureFlag {
  key: string;
  label: string;
  description?: string;
  defaultValue: boolean;
}

export const FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: 'confirmDelete',
    label: '删除前确认',
    description: '删除条目时弹出模态确认框，防止误删',
    defaultValue: true,
  },
  {
    key: 'successNotifications',
    label: '操作成功通知',
    description: '新增 / 更新 / 删除 / 克隆成功后弹出提示',
    defaultValue: true,
  },
  {
    key: 'showPriorityIcons',
    label: '显示优先级图标',
    description: '条目列表中按优先级显示 ↑ / — / ↓ 图标',
    defaultValue: true,
  },
  {
    key: 'showViewBadges',
    label: '显示视图徽标',
    description: '过滤时在视图标题栏显示匹配数量徽标',
    defaultValue: true,
  },
  {
    key: 'autoRefreshOnExternalChange',
    label: '外部修改自动刷新',
    description: '数据文件 / 静态配置被外部修改时自动重新加载',
    defaultValue: true,
  },
];

function flagFullKey(key: string): string {
  return `${CONFIG.featuresSection}.${key}`;
}

/** 读取开关当前值（设置里未配置时用默认值）。 */
export function getFeatureValue(key: string): boolean {
  const flag = FEATURE_FLAGS.find((item) => item.key === key);
  return vscode.workspace
    .getConfiguration(CONFIG.section)
    .get<boolean>(flagFullKey(key), flag?.defaultValue ?? false);
}

/** 写入开关（全局用户设置）。 */
export async function setFeatureValue(key: string, value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration(CONFIG.section)
    .update(flagFullKey(key), value, vscode.ConfigurationTarget.Global);
}

/** 全部开关当前值（供 Webview 配置页回填）。 */
export function getFeatureValues(): Record<string, boolean> {
  const values: Record<string, boolean> = {};
  for (const flag of FEATURE_FLAGS) {
    values[flag.key] = getFeatureValue(flag.key);
  }
  return values;
}

/** 特性开关 → boolean 表单字段，复用 Schema 表单框架渲染配置页面。 */
export function toFormFields(): FormField[] {
  return FEATURE_FLAGS.map((flag) => ({
    key: flag.key,
    label: flag.label,
    type: 'boolean',
    defaultValue: String(flag.defaultValue),
    hint: flag.description,
  }));
}
