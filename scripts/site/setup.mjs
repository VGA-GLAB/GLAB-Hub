/** @implements SPEC-GLAB-BOOTSTRAP */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { prepareCorpus } from './corpus.mjs';
import { runNpm } from './npm.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
await prepareCorpus(root);
const install = ['ci', '--include=dev', '--no-audit', '--no-fund'];
// Corpus は Vestigium を file: で参照する。dist は git 管理外で、file: 依存の install では
// build されないため、先に Vestigium 自身を install して prepare (tsc) で dist を作る。
await runNpm(join(root, 'corpus', 'lib', 'vestigium'), install);
await runNpm(join(root, 'corpus'), install);
await runNpm(root, install);
await runNpm(root, ['run', 'build']);
