import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', 'docs', 'model-catalog.json');
const target = join(here, '..', 'static', 'model-catalog.json');

copyFileSync(source, target);
console.log('sync-model-catalog: copied model catalog to static assets');
