import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileEventStore, createMemoryEventStore } from './store.ts';
import type { AnyEvent } from './types.ts';

const event = (seq: number): AnyEvent => ({ seq, id: `evt_${String(seq).padStart(14, '0')}`, type: 'clock.advanced', at: seq * 1000, data: { from: 0, to: seq } });

describe('memory event store', () => {
  it('keeps appended events until cleared', () => {
    const store = createMemoryEventStore();
    store.append(event(1));
    store.append(event(2));
    expect(store.load().map((e) => e.seq)).toEqual([1, 2]);
    store.clear();
    expect(store.load()).toEqual([]);
  });
});

describe('file event store', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'localpay-events-'));
    file = join(dir, 'events.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns nothing for a missing file', () => {
    expect(createFileEventStore(file).load()).toEqual([]);
  });

  it('writes one JSON line per event and reads them back in order', () => {
    const store = createFileEventStore(file);
    store.append(event(1));
    store.append(event(2));
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
    expect(createFileEventStore(file).load()).toEqual([event(1), event(2)]);
  });

  it('ignores a torn final line from a crash', () => {
    writeFileSync(file, `${JSON.stringify(event(1))}\n{"seq":2,"id":`);
    expect(createFileEventStore(file).load()).toEqual([event(1)]);
  });

  it('fails loudly on corruption before the end', () => {
    writeFileSync(file, `not json\n${JSON.stringify(event(2))}\n`);
    expect(() => createFileEventStore(file).load()).toThrow(/:1: corrupt event log line/);
  });

  it('clear() empties the file', () => {
    const store = createFileEventStore(file);
    store.append(event(1));
    store.clear();
    expect(store.load()).toEqual([]);
  });
});
