import { describe, expect, it } from 'vitest';
import { checkMessage } from './check-commit-msg.ts';

const SIGN = 'Signed-off-by: Dev <dev@example.com>';

describe('checkMessage', () => {
  it('accepts a conventional, signed-off message', () => {
    expect(checkMessage(`feat(core): add clock\n\nBody text.\n\n${SIGN}\n`)).toEqual([]);
  });

  it('accepts breaking-change markers and no scope', () => {
    expect(checkMessage(`fix!: change envelope\n\n${SIGN}`)).toEqual([]);
  });

  it('rejects an unknown type', () => {
    expect(checkMessage(`update stuff\n\n${SIGN}`)[0]).toMatch(/type\(scope\): summary/);
  });

  it('rejects a missing sign-off', () => {
    expect(checkMessage('docs: tweak readme')).toEqual(['missing "Signed-off-by:" line (use git commit -s)']);
  });

  it('rejects a header with no blank line after it', () => {
    expect(checkMessage(`chore: x\nbody\n${SIGN}`)).toContain('leave a blank line after the header');
  });

  it('ignores git comment lines and merge commits', () => {
    expect(checkMessage(`# comment\nci: run tests\n\n${SIGN}`)).toEqual([]);
    expect(checkMessage('Merge branch main')).toEqual([]);
  });
});
