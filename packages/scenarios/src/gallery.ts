// The scenario gallery: ready-made YAML files, loaded from a directory so the published
// package can ship them as plain files.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScenario, type Scenario } from './schema.ts';

export interface GalleryEntry {
  /** File name without extension, e.g. 01-happy-path. */
  id: string;
  name: string;
  description: string;
  yaml: string;
  scenario: Scenario;
}

export const DEFAULT_GALLERY_DIR = fileURLToPath(new URL('../gallery/', import.meta.url));

export function loadGallery(dir: string = DEFAULT_GALLERY_DIR): GalleryEntry[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort();
  } catch {
    return [];
  }
  return files.map((file) => {
    const yaml = readFileSync(join(dir, file), 'utf8');
    const scenario = parseScenario(yaml);
    return { id: file.replace(/\.yaml$/, ''), name: scenario.name, description: scenario.description ?? '', yaml, scenario };
  });
}
