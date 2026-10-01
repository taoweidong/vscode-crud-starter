import type { Item } from '../../models/item';

/**
 * 数据源抽象：所有 CRUD 的最终读写都经由该接口。
 *
 * 默认实现是 JsonFileStore（工作区 JSON 文件）与 MementoStore（VSCode 全局存储）。
 * 想接 REST API、SQLite、远程数据库等，只需新建一个实现本接口的类，
 * 并在 src/extension.ts 的 createStore() 中替换返回值即可，业务层与界面层零改动。
 */
export interface IItemStore {
  /** 读取全部条目。文件不存在 / 首次使用时应返回空数组而不是抛错。 */
  load(): Promise<Item[]>;
  /** 全量写回条目（启动模板采用「读-改-全量写」的简单模型，够用且易实现）。 */
  save(items: Item[]): Promise<void>;
}
