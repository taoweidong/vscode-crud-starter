import * as vscode from 'vscode';
import { CONFIG, STORAGE } from '../../constants';
import { environmentTask } from '../../tasks/environmentTask';
import { StaticConfigService } from '../staticConfig/staticConfigService';

/** 数据文件相对路径：跟随 crudStarter.storagePath 配置，与 JsonFileStore 保持一致。 */
function getDataFileRelativePath(): string {
  return vscode.workspace
    .getConfiguration(CONFIG.section)
    .get<string>(CONFIG.storagePath, STORAGE.defaultFileName);
}

/** 初始化步骤的执行上下文。 */
export interface InitContext {
  /** 当前工作区根目录（未打开工作区时为 undefined） */
  workspaceRoot?: vscode.Uri;
  output: vscode.OutputChannel;
  staticConfig: StaticConfigService;
}

/**
 * 初始化步骤定义：返回成功信息；失败直接抛错（由 InitService 记录为 failed）。
 * 新增步骤在本数组加一项即可（注册表模式）。
 */
export interface InitStep {
  id: string;
  title: string;
  description: string;
  run(ctx: InitContext): Promise<string>;
}

async function pathExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export function createInitSteps(): InitStep[] {
  return [
    {
      id: 'workspace',
      title: '检查工作区',
      description: '确认已打开工作区文件夹，后续初始化动作都落在工作区内',
      async run(ctx) {
        if (!ctx.workspaceRoot) {
          throw new Error('未打开工作区，无法初始化。请先打开一个文件夹。');
        }
        return `工作区就绪：${ctx.workspaceRoot.fsPath}`;
      },
    },
    {
      id: 'dataFile',
      title: '初始化数据文件',
      description: '确保数据文件存在（路径跟随 crudStarter.storagePath 配置，不存在则创建空数据）',
      async run(ctx) {
        if (!ctx.workspaceRoot) {
          throw new Error('未打开工作区。');
        }
        const relative = getDataFileRelativePath();
        const fileUri = vscode.Uri.joinPath(ctx.workspaceRoot, relative);
        if (await pathExists(fileUri)) {
          return '数据文件已存在，跳过创建。';
        }
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(fileUri, '..'));
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from('[]', 'utf8'));
        return `已创建：${relative}`;
      },
    },
    {
      id: 'staticConfig',
      title: '生成静态配置',
      description: '生成 .vscode/crud-starter.config.json 默认静态配置（已存在则跳过）',
      async run(ctx) {
        const result = await ctx.staticConfig.ensureDefault();
        if (result === 'created') {
          await ctx.staticConfig.load();
          return '已生成默认静态配置（可在「静态配置」视图查看）。';
        }
        if (result === 'exists') {
          return '静态配置已存在，跳过生成。';
        }
        throw new Error('未打开工作区。');
      },
    },
    {
      id: 'artifactDir',
      title: '创建构建产物目录',
      description: '创建 .crud-starter/ 目录，用于存放环境快照等本地产物',
      async run(ctx) {
        if (!ctx.workspaceRoot) {
          throw new Error('未打开工作区。');
        }
        const dirUri = vscode.Uri.joinPath(ctx.workspaceRoot, '.crud-starter');
        await vscode.workspace.fs.createDirectory(dirUri);
        return `目录就绪：${dirUri.fsPath}`;
      },
    },
    {
      id: 'envSnapshot',
      title: '写入环境快照',
      description: '运行环境检测并保存到 .crud-starter/environment.json，便于核对环境一致性',
      async run(ctx) {
        if (!ctx.workspaceRoot) {
          throw new Error('未打开工作区。');
        }
        const result = await environmentTask.run();
        const snapshot = {
          finishedAt: result.finishedAt,
          status: result.status,
          items: result.items.map((item) => ({
            name: item.label,
            version: item.description,
            status: item.status,
          })),
        };
        const fileUri = vscode.Uri.joinPath(
          ctx.workspaceRoot,
          '.crud-starter/environment.json'
        );
        await vscode.workspace.fs.writeFile(
          fileUri,
          Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8')
        );
        const okCount = result.items.filter((item) => item.status === 'ok').length;
        return `快照已写入（${okCount}/${result.items.length} 项就绪）。`;
      },
    },
  ];
}
