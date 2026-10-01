import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

/** VSCode 集成测试入口：收集 out/test 下所有 *.test.js 并交给 Mocha 执行。 */
export async function run(): Promise<void> {
  // VSCode 官方测试脚手架使用 TDD 接口（suite/test/setup）
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10000 });
  const testsRoot = path.resolve(__dirname, '.');

  const files = fs
    .readdirSync(testsRoot, { recursive: true })
    .filter((file): file is string => typeof file === 'string' && file.endsWith('.test.js'));
  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} 个测试失败`));
      } else {
        resolve();
      }
    });
  });
}
