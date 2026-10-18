// Where the event log is persisted. The engine keeps the live log in memory and
// writes every new event here; on start-up it replays `load()`.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { AnyEvent } from './types.ts';

export interface EventStore {
  /** Events persisted by an earlier run, oldest first. */
  load(): AnyEvent[];
  append(event: AnyEvent): void;
  clear(): void;
}

export function createMemoryEventStore(): EventStore {
  let events: AnyEvent[] = [];
  return {
    load: () => [...events],
    append: (event) => {
      events.push(event);
    },
    clear: () => {
      events = [];
    },
  };
}

/** Appends one JSON object per line. Survives crashes up to the last complete line. */
export function createFileEventStore(path: string): EventStore {
  return {
    load() {
      if (!existsSync(path)) return [];
      const content = readFileSync(path, 'utf8');
      const lines = content.split('\n');
      const events: AnyEvent[] = [];
      lines.forEach((line, index) => {
        if (!line.trim()) return;
        try {
          events.push(JSON.parse(line) as AnyEvent);
        } catch {
          // Every append ends with "\n", so only an unterminated last line can be a torn write.
          const tornTail = index === lines.length - 1 && !content.endsWith('\n');
          if (!tornTail) throw new Error(`${path}:${index + 1}: corrupt event log line`);
        }
      });
      return events;
    },
    append(event) {
      appendFileSync(path, `${JSON.stringify(event)}\n`);
    },
    clear() {
      writeFileSync(path, '');
    },
  };
}
