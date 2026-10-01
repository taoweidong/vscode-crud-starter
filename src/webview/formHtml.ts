import { randomBytes } from 'crypto';
import type { FormField } from './formSchema';

export interface FormRenderPayload {
  title: string;
  /** 标题下的说明文字 */
  subtitle?: string;
  schema: FormField[];
}

/** 生成 CSP nonce。 */
function getNonce(): string {
  return randomBytes(16).toString('hex');
}

/** HTML 转义，防止用户输入破坏页面结构。 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 由单个字段定义渲染出表单控件。 */
function renderField(field: FormField): string {
  const hint = field.hint ? `<div class="hint">${esc(field.hint)}</div>` : '';

  if (field.type === 'boolean') {
    return (
      `<div class="field field-check">` +
      `<label class="check"><input type="checkbox" id="field-${field.key}" name="${field.key}"> ${esc(field.label)}</label>` +
      `${hint}</div>`
    );
  }

  const requiredMark = field.required ? ' <span class="required">*</span>' : '';
  const label = `<label for="field-${field.key}">${esc(field.label)}${requiredMark}</label>`;
  const attrs =
    ` id="field-${field.key}" name="${field.key}"` +
    ` placeholder="${esc(field.placeholder ?? '')}"`;

  let control: string;
  switch (field.type) {
    case 'textarea':
      control = `<textarea${attrs} rows="4"></textarea>`;
      break;
    case 'select': {
      const options = (field.options ?? [])
        .map((option) => `<option value="${esc(option.value)}">${esc(option.label)}</option>`)
        .join('');
      control = `<select${attrs} data-default="${esc(field.defaultValue ?? '')}">${options}</select>`;
      break;
    }
    default:
      control =
        `<input${attrs} type="text" autocomplete="off"${field.required ? ' required' : ''}` +
        `${field.datalist ? ` list="${esc(field.datalist)}"` : ''}>`;
  }

  return `<div class="field">${label}${control}${hint}</div>`;
}

/**
 * 渲染表单页面。UI 风格约定（与 VSCode 原生保持一致）：
 * - 所有颜色取自 --vscode-* 主题令牌，自动适配深浅色与高对比度主题，无任何硬编码颜色；
 * - 单一字体（--vscode-font-family）、单一字阶；主按钮在右侧，与 VSCode 模态对话框一致；
 * - CSP 通过 nonce 校验，无任何外部资源；页面数据经 postMessage 传递，不做 HTML 注入。
 *
 * 取值 / 回填 / 必填校验全部由 init 消息携带的 schema 驱动——条目表单与特性配置页共用本渲染器。
 */
export function renderFormHtml(payload: FormRenderPayload): string {
  const nonce = getNonce();
  const fields = payload.schema.map(renderField).join('\n      ');

  return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${esc(payload.title)}</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: transparent;
      margin: 0;
      padding: 20px 16px 28px;
    }
    .wrap { max-width: 560px; margin: 0 auto; }
    header {
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border, transparent);
    }
    h2 { margin: 0 0 4px; font-size: 1.3em; font-weight: 600; }
    .sub { color: var(--vscode-descriptionForeground); line-height: 1.5; }
    .field { margin-top: 16px; }
    label { display: block; margin-bottom: 6px; font-weight: 600; }
    .required { color: var(--vscode-errorForeground); margin-left: 2px; }
    input, select, textarea {
      width: 100%;
      min-height: 26px;
      padding: 4px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      transition: border-color .1s ease, outline-color .1s ease;
    }
    input[type="checkbox"] {
      width: 15px;
      height: 15px;
      min-height: 0;
      padding: 0;
      margin: 0;
      accent-color: var(--vscode-checkbox-select-background, var(--vscode-focusBorder));
    }
    .field-check label.check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      margin-bottom: 0;
      cursor: pointer;
    }
    input::placeholder, textarea::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }
    input:focus, select:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    textarea { resize: vertical; min-height: 76px; line-height: 1.5; }
    .hint { margin-top: 5px; color: var(--vscode-descriptionForeground); }
    .invalid {
      border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
    }
    .invalid:focus {
      outline-color: var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
    }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
    button {
      min-width: 72px;
      padding: 4px 14px;
      border: 1px solid transparent;
      border-radius: 2px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      transition: background-color .1s ease;
    }
    button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    button:disabled { opacity: .6; cursor: default; }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-secondaryBackground));
    }
    .error {
      display: flex;
      align-items: center;
      margin-top: 14px;
      padding: 6px 10px;
      border: 1px solid var(--vscode-inputValidation-errorBorder, transparent);
      border-radius: 2px;
      background: var(--vscode-inputValidation-errorBackground, transparent);
      color: var(--vscode-errorForeground);
    }
    .error[hidden] { display: none; }
    .kbd-hint { margin-top: 18px; color: var(--vscode-descriptionForeground); }
    .kbd {
      display: inline-block;
      padding: 1px 5px;
      border: 1px solid var(--vscode-keybindingLabel-border, rgba(128,128,128,.35));
      border-bottom-width: 2px;
      border-radius: 3px;
      background: var(--vscode-keybindingLabel-background, rgba(128,128,128,.17));
      color: var(--vscode-keybindingLabel-foreground, inherit);
      font-size: .9em;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <header>
      <h2>${esc(payload.title)}</h2>
      <div class="sub">${esc(payload.subtitle ?? '')}</div>
    </header>
    <form id="crud-form" novalidate>
      ${fields}
      <datalist id="category-list"></datalist>
      <div class="actions">
        <button type="button" class="secondary" id="cancel-btn">取消</button>
        <button type="submit" class="primary" id="save-btn">保存</button>
      </div>
      <div id="form-error" class="error" hidden role="alert"></div>
      <div class="kbd-hint"><span class="kbd">Esc</span> 取消 &nbsp;·&nbsp; <span class="kbd">Ctrl+Enter</span> 保存</div>
    </form>
  </main>
  <script nonce="${nonce}">
    (function () {
      var vscode = acquireVsCodeApi();
      var categories = [];
      var schema = [];
      var saveBtn = document.getElementById('save-btn');

      function escAttr(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;');
      }

      function fieldEl(key) {
        return document.getElementById('field-' + key);
      }

      function showError(message, target) {
        var box = document.getElementById('form-error');
        box.textContent = message;
        box.hidden = false;
        if (target) {
          target.classList.add('invalid');
        }
      }

      function clearError() {
        var box = document.getElementById('form-error');
        box.hidden = true;
        box.textContent = '';
        var invalid = document.querySelectorAll('.invalid');
        for (var i = 0; i < invalid.length; i++) {
          invalid[i].classList.remove('invalid');
        }
      }

      function parseTags(raw) {
        return String(raw || '')
          .split(/[,，;；、]/)
          .map(function (tag) { return tag.trim(); })
          .filter(function (tag) { return tag.length > 0; });
      }

      function fillForm(item) {
        schema.forEach(function (field) {
          var el = fieldEl(field.key);
          if (!el) { return; }
          var value = item ? item[field.key] : undefined;
          if (field.type === 'boolean') {
            el.checked = value == null ? field.defaultValue === 'true' : Boolean(value);
            return;
          }
          if (!item) {
            if (el.tagName === 'SELECT') {
              el.value = field.defaultValue || (el.options[0] ? el.options[0].value : '');
            } else {
              el.value = '';
            }
            return;
          }
          if (el.tagName === 'SELECT') {
            el.value = value || field.defaultValue || (el.options[0] ? el.options[0].value : '');
          } else if (Array.isArray(value)) {
            el.value = value.join(', ');
          } else {
            el.value = value == null ? '' : String(value);
          }
        });
        clearError();
      }

      function collectDraft() {
        var draft = {};
        schema.forEach(function (field) {
          var el = fieldEl(field.key);
          if (!el) { return; }
          if (field.type === 'boolean') {
            draft[field.key] = el.checked;
          } else if (field.type === 'tags') {
            draft[field.key] = parseTags(el.value);
          } else {
            draft[field.key] = el.value;
          }
        });
        return draft;
      }

      function validateRequired(draft) {
        for (var i = 0; i < schema.length; i++) {
          var field = schema[i];
          if (!field.required) { continue; }
          var value = draft[field.key];
          if (value == null || value === '') {
            return field;
          }
        }
        return null;
      }

      function fillCategories() {
        var datalist = document.getElementById('category-list');
        datalist.innerHTML = categories.map(function (category) {
          return '<option value="' + escAttr(category) + '"></option>';
        }).join('');
      }

      window.addEventListener('message', function (event) {
        var msg = event.data;
        if (msg.type === 'init') {
          schema = msg.schema || [];
          categories = msg.categories || [];
          fillCategories();
          fillForm(msg.item);
          saveBtn.disabled = false;
          var firstField = schema.length ? fieldEl(schema[0].key) : null;
          if (firstField) {
            firstField.focus();
          }
        } else if (msg.type === 'error') {
          saveBtn.disabled = false;
          showError(msg.message);
        }
      });

      document.getElementById('crud-form').addEventListener('submit', function (event) {
        event.preventDefault();
        clearError();
        var draft = collectDraft();
        var missing = validateRequired(draft);
        if (missing) {
          var el = fieldEl(missing.key);
          showError('「' + missing.label + '」不能为空。', el);
          if (el) {
            el.focus();
          }
          return;
        }
        saveBtn.disabled = true;
        vscode.postMessage({ type: 'submit', draft: draft });
      });

      document.getElementById('cancel-btn').addEventListener('click', function () {
        vscode.postMessage({ type: 'cancel' });
      });

      document.getElementById('crud-form').addEventListener('input', function (event) {
        if (event.target && event.target.classList && event.target.classList.contains('invalid')) {
          clearError();
        }
      });

      window.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          vscode.postMessage({ type: 'cancel' });
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          document.getElementById('crud-form').requestSubmit();
        }
      });

      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
}
