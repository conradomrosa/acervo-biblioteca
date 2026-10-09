import { execFileSync } from 'node:child_process';

const persistTo = process.env.TEST_D1_PERSIST_TO || '.wrangler/test-state';
execFileSync('./node_modules/.bin/wrangler', ['d1', 'migrations', 'apply', 'ichrysostom', '--local', '--persist-to', persistTo], { stdio: 'inherit' });
