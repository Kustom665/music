#!/usr/bin/env node
/* Bundles index.html + engine.js into one self-contained file (foresight/dist/foresight.html),
 * written as a bare fragment so it can be published as a single-page artifact. */
'use strict';
const fs = require('fs'), path = require('path');
const dir = __dirname, read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const html = read('index.html'), engine = read('engine.js');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*/g, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace('<script src="engine.js"></script>', () => '<script>\n' + engine + '\n</script>');
const out = head.trim() + '\n<meta name="claude:viewport-fit-sides" content="cover">\n' + body.trim() + '\n';
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'foresight.html'), out);
console.log('dist/foresight.html', (out.length / 1024).toFixed(1) + ' KB');
