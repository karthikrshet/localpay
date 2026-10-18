// Copies docs/compat.md into the site so the compatibility matrix has one source.
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../../compat.md', import.meta.url), 'utf8').replace(/^# .*\n+/, '');
const page = `---\ntitle: Compatibility matrix\ndescription: Which endpoints, fields and events LocalPay supports.\n---\n\n<!-- Generated from docs/compat.md by scripts/sync.mjs. Edit that file instead. -->\n\n${source}`;
writeFileSync(new URL('../src/content/docs/reference/compatibility.md', import.meta.url), page);
