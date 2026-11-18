import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = resolve(root, 'desktop-stage');
if (!stage.startsWith(root + sep) || stage !== join(root, 'desktop-stage')) {
  throw new Error('Invalid desktop staging path.');
}
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await rm(stage, { recursive: true, force: true });
await mkdir(stage);
await cp(join(root, 'dist'), join(stage, 'dist'), { recursive: true });
await cp(join(root, 'electron'), join(stage, 'electron'), { recursive: true });
await writeFile(
  join(stage, 'package.json'),
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      private: true,
      main: manifest.main,
    },
    null,
    2,
  ) + '\n',
);
console.log('Desktop staging contains the bundled app and Electron bridge.');
