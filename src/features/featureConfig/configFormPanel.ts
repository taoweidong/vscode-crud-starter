import * as vscode from 'vscode';
import {
  FEATURE_FLAGS,
  getFeatureValues,
  setFeatureValue,
  toFormFields,
} from './featureFlags';
import { renderFormHtml } from '../../webview/formHtml';
import type { FormField } from '../../webview/formSchema';

type IncomingMessage =
  | { type: 'ready' }
  | { type: 'cancel' }
  | { type: 'submit'; draft: Record<string, unknown> };

type OutgoingMessage =
  | { type: 'init'; item: Record<string, boolean>; categories: string[]; schema: FormField[] }
  | { type: 'error'; message: string };

/**
 * 特性配置页面（单例 Webview）：演示「设置读写 + Schema 表单」模式。
 * 复用条目表单的渲染器（boolean 开关控件），保存即写入 VSCode 全局设置，立即生效。
 */
export class ConfigFormPanel {
  static currentPanel: ConfigFormPanel | undefined;

  private disposables: vscode.Disposable[] = [];

  private constructor(private readonly panel: vscode.WebviewPanel) {
    this.panel.webview.html = renderFormHtml(this.panel.webview, {
      title: '特性配置',
      subtitle: '开关保存后立即写入 VSCode 设置（crudStarter.features.*），并实时影响插件行为。',
      schema: toFormFields(),
    });
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => void this.onMessage(message as IncomingMessage),
      null,
      this.disposables
    );
  }

  static createOrShow(): void {
    const existing = ConfigFormPanel.currentPanel;
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      void existing.postInit();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'crudStarter.configForm',
      '特性配置',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ConfigFormPanel.currentPanel = new ConfigFormPanel(panel);
  }

  dispose(): void {
    ConfigFormPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private async postInit(): Promise<void> {
    await this.panel.webview.postMessage({
      type: 'init',
      item: getFeatureValues(),
      categories: [],
      schema: toFormFields(),
    } satisfies OutgoingMessage);
  }

  private async onMessage(message: IncomingMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.postInit();
        return;
      case 'cancel':
        this.panel.dispose();
        return;
      case 'submit': {
        try {
          let changed = 0;
          for (const [key, value] of Object.entries(message.draft)) {
            if (!FEATURE_FLAGS.some((flag) => flag.key === key)) {
              continue; // 只接受注册过的开关，忽略页面上的未知字段
            }
            await setFeatureValue(key, Boolean(value));
            changed++;
          }
          this.panel.dispose();
          void vscode.window.showInformationMessage(`已保存 ${changed} 项特性配置。`);
        } catch (err) {
          const text = `保存失败：${err instanceof Error ? err.message : String(err)}`;
          void vscode.window.showErrorMessage(text);
          await this.panel.webview.postMessage({
            type: 'error',
            message: text,
          } satisfies OutgoingMessage);
        }
        return;
      }
    }
  }
}
