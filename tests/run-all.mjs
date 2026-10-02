/**
 * 测试聚合入口：依次运行所有测试文件，任一失败则整体以非零码退出。
 * 用法：node tests/run-all.mjs   （或 npm test）
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  'engine.test.mjs',
  'ai.test.mjs',
  'search.test.mjs',
  'limits.test.mjs',
  'persona.test.mjs',
  'notation.test.mjs',
];

let failed = 0;
for (const suite of SUITES) {
  const file = join(here, suite);
  console.log(`\n${'='.repeat(48)}\n▶ ${suite}\n${'='.repeat(48)}`);
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (r.status !== 0) {
    failed += 1;
    console.error(`\n✗ ${suite} 执行失败（退出码 ${r.status}）`);
  }
}

if (failed > 0) {
  console.error(`\n共 ${failed} 个测试文件失败。`);
  process.exit(1);
}
console.log(`\n✓ 全部 ${SUITES.length} 个测试文件通过。`);
