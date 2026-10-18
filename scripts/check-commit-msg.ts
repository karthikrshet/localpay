// Validates commit messages: Conventional Commits header + DCO sign-off.
// Usage:
//   node --experimental-strip-types scripts/check-commit-msg.ts <file>        (commit-msg hook)
//   node --experimental-strip-types scripts/check-commit-msg.ts --range A..B  (CI)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TYPES = ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test'];
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9-]+\\))?!?: \\S.{0,98}$`);

export function checkMessage(message: string): string[] {
  const lines = message.split('\n').filter((l) => !l.startsWith('#'));
  const header = lines[0] ?? '';
  const problems: string[] = [];
  if (/^(Merge|Revert) /.test(header)) return problems;
  if (!HEADER.test(header)) {
    problems.push(`header "${header}" must look like "type(scope): summary" (types: ${TYPES.join(', ')}; max 100 chars)`);
  }
  if (lines.length > 1 && (lines[1] ?? '') !== '') problems.push('leave a blank line after the header');
  if (!lines.some((l) => /^Signed-off-by: .+ <.+@.+>$/.test(l))) problems.push('missing "Signed-off-by:" line (use git commit -s)');
  return problems;
}

function main(argv: string[]): number {
  const messages: { ref: string; text: string }[] = [];
  if (argv[0] === '--range' && argv[1]) {
    const shas = execFileSync('git', ['rev-list', '--no-merges', argv[1]], { encoding: 'utf8' }).split('\n').filter(Boolean);
    for (const sha of shas) messages.push({ ref: sha.slice(0, 7), text: execFileSync('git', ['log', '-1', '--format=%B', sha], { encoding: 'utf8' }) });
  } else if (argv[0]) {
    messages.push({ ref: argv[0], text: readFileSync(argv[0], 'utf8') });
  } else {
    console.error('usage: check-commit-msg.ts <file> | --range A..B');
    return 2;
  }
  let failed = 0;
  for (const { ref, text } of messages) {
    const problems = checkMessage(text);
    if (problems.length) {
      failed++;
      console.error(`${ref}:\n  - ${problems.join('\n  - ')}`);
    }
  }
  if (failed) console.error(`${failed} commit message(s) invalid`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
