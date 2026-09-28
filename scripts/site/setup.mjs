/** @implements SPEC-GLAB-BOOTSTRAP */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { prepareCorpus } from './corpus.mjs';
import { runNpm } from './npm.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
await prepareCorpus(root);
const install = ['ci', '--include=dev', '--no-audit', '--no-fund'];
await runNpm(join(root, 'corpus'), install);
await runNpm(root, install);
await runNpm(root, ['run', 'build']);
