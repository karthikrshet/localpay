// Compares two JSON values by structure: same keys, same JSON types. Values may differ
// (ids, timestamps), and null on either side matches any type (nullable fields).

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const kind = (value: unknown): string => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

export function compareShapes(expected: unknown, actual: unknown, path = '$'): string[] {
  const [e, a] = [kind(expected), kind(actual)];
  if (e === 'null' || a === 'null') return [];
  if (e !== a) {
    // An empty array and an object are both how the gateway renders notes.
    const emptyNotes = (x: unknown) => Array.isArray(x) && x.length === 0;
    if ((e === 'object' && emptyNotes(actual)) || (a === 'object' && emptyNotes(expected))) return [];
    return [`${path}: expected ${e}, got ${a}`];
  }
  if (e === 'array') {
    const [first, other] = [(expected as Json[])[0], (actual as Json[])[0]];
    return first === undefined || other === undefined ? [] : compareShapes(first, other, `${path}[0]`);
  }
  if (e === 'object') {
    const exp = expected as Record<string, Json>;
    const act = actual as Record<string, Json>;
    const problems: string[] = [];
    for (const key of Object.keys(exp)) {
      if (!(key in act)) problems.push(`${path}.${key}: missing in LocalPay`);
      else problems.push(...compareShapes(exp[key], act[key], `${path}.${key}`));
    }
    for (const key of Object.keys(act)) if (!(key in exp)) problems.push(`${path}.${key}: not in the recorded response`);
    return problems;
  }
  return [];
}
