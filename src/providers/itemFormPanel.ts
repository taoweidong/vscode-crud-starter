import * as vscode from 'vscode';
import { isPriority, type Item, type ItemDraft, type Priority } from '../models/item';
import { getFeatureValue } from '../features/featureConfig/featureFlags';
import { ItemService, ItemValidationError } from '../services/itemService';
import { renderFormHtml } from '../webview/formHtml';
import { FORM_SCHEMA, type FormField } from '../webview/formSchema';

/** Webview → 扩展 的消息（draft 为 Schema 驱动的通用字段集）。 */
type IncomingMessage =
  | { type: 'ready' }
  | { type: 'cancel' }
  | { type: 'submit'; draft: Record<string, unknown> };

/** 扩展 → Webview 的消息。 */
type OutgoingMessage =
  | { type: 'init'; item: Item | Partial<ItemDraft> | null; categories: string[]; schema: FormField[] }
  | { type: 'error'; message: string };

/**
 * 表单面板（单例）：新增与编辑共用同一套界面。
 * - 新增：createOrShow(service) 打开空白表单；
 * - 预填新增：createOrShow(service, undefined, initialDraft) 打开并填入初始值（如选中文本、文件路径）；
 * - 编辑：createOrShow(service, item) 打开并回填；
 * - 已打开时复用面板，直接切换为当前目标。
 */
export class ItemFormPanel {
  static currentPanel: ItemFormPanel | undefined;

  private disposables: vscode.Disposable[] = [];
  private item: Item | undefined;
  private initial: Partial<ItemDraft> | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly service: ItemService,
    item?: Item,
    initial?: Partial<ItemDraft>
  ) {
    this.item = item;
    this.initial = initial;
    this.render();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => void this.onMessage(message as IncomingMessage),
      null,
      this.disposables
    );
  }

  static createOrShow(service: ItemService, item?: Item, initial?: Partial<ItemDraft>): void {
    const existing = ItemFormPanel.currentPanel;
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      existing.init(item, initial);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'crudStarter.itemForm',
      item ? '编辑条目' : '新增条目',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    ItemFormPanel.currentPanel = new ItemFormPanel(panel, service, item, initial);
  }

  /** 标题 / 副标题 / 页面随模式（新增、预填新增、编辑）保持一致。 */
  private render(): void {
    this.panel.title = this.item ? '编辑条目' : '新增条目';
    this.panel.webview.html = renderFormHtml({
      title: this.panel.title,
      subtitle: this.item
        ? '修改字段后点击「保存」即可更新该条目。'
        : '填写后点击「保存」，数据将写入当前工作区的存储。',
      schema: FORM_SCHEMA,
    });
  }

  dispose(): void {
    ItemFormPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private init(item?: Item, initial?: Partial<ItemDraft>): void {
    this.item = item;
    this.initial = initial;
    this.render();
    void this.postInit();
  }

  /** 面板就绪或切换目标后，把初始数据推送给页面。 */
  private async postInit(): Promise<void> {
    const categories = await this.service.getCategories();
    await this.panel.webview.postMessage({
      type: 'init',
      item: this.item ?? this.initial ?? null,
      categories,
      schema: FORM_SCHEMA,
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
          const draft = toItemDraft(message.draft);
          if (this.item) {
            const updated = await this.service.update(this.item.id, draft);
            this.panel.dispose();
            this.notify(`已更新「${updated.name}」。`);
          } else {
            const created = await this.service.create(draft);
            this.panel.dispose();
            this.notify(`已新增「${created.name}」。`);
          }
        } catch (err) {
          // 校验错误面板保持打开，把错误回显到表单上
          const text =
            err instanceof ItemValidationError ? err.message : `保存失败：${String(err)}`;
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

  /** 操作成功通知遵循「操作成功通知」特性开关。 */
  private notify(message: string): void {
    if (getFeatureValue('successNotifications')) {
      void vscode.window.showInformationMessage(message);
    }
  }
}

/** 泛型表单字段集 → ItemDraft（校验交给服务层）。 */
function toItemDraft(draft: Record<string, unknown>): ItemDraft {
  return {
    name: String(draft.name ?? ''),
    category: String(draft.category ?? ''),
    description: String(draft.description ?? ''),
    priority: (isPriority(draft.priority) ? draft.priority : 'medium') as Priority,
    tags: Array.isArray(draft.tags) ? draft.tags.map(String) : [],
  };
}
