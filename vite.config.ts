import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * After a build, writes the list of built files into sw.js so the service
 * worker can cache the whole app for offline use. The list changes with every
 * build, which is also how an installed copy notices that an update exists.
 */
function precache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'petal-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) walk(path);
          else if (name !== 'sw.js') files.push(relative(outDir, path).split('\\').join('/'));
        }
      };
      walk(outDir);
      files.sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const sw = join(outDir, 'sw.js');
      writeFileSync(
        sw,
        readFileSync(sw, 'utf8')
          .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
          .replace("['__PRECACHE__']", JSON.stringify(files)),
      );
    },
  };
}

// base './' lets the built app be hosted at any path.
export default defineConfig({
  base: './',
  plugins: [react(), precache()],
});
