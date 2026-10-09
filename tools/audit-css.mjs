import { readFileSync } from 'node:fs';

const file = 'src/css/style.css';
const lines = readFileSync(file, 'utf8').split(/\r?\n/);
if (process.argv[2]) {
  const start = Math.max(0, Number(process.argv[2]) - 1);
  const count = Number(process.argv[3]) || 40;
  for (let index = start; index < Math.min(lines.length, start + count); index++) {
    console.log(`${index + 1}: ${lines[index]}`);
  }
  process.exit(0);
}

let depth = 0;
let inComment = false;
const errors = [];

for (let index = 0; index < lines.length; index++) {
  const line = lines[index];
  let cleaned = '';
  let inString = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inComment) {
      const commentEnd = line.indexOf('*/', i);
      if (commentEnd === -1) {
        i = line.length;
        break;
      }
      inComment = false;
      i = commentEnd + 1;
      continue;
    }

    if (inString) {
      cleaned += char;
      if (char === '\\') i++;
      else if (char === inString) inString = null;
      continue;
    }

    if (char === '/' && line[i + 1] === '*') {
      const commentEnd = line.indexOf('*/', i + 2);
      if (commentEnd === -1) {
        inComment = true;
        i = line.length;
        break;
      }
      i = commentEnd + 1;
      continue;
    }

    if (char === '"' || char === "'") inString = char;
    cleaned += char;
  }

  const trimmed = cleaned.trim();

  if (depth === 0 && trimmed) {
    const declarationLike = /^(?:--[\w-]+|[a-zA-Z-]+)\s*:/.test(trimmed);
    const selectorLike = /^[.#:[\]*&a-zA-Z]/.test(trimmed);
    const validTopLevel =
      trimmed.startsWith('@') ||
      trimmed.endsWith('{') ||
      trimmed.endsWith(',') ||
      trimmed === '}' ||
      selectorLike;

    if (declarationLike && !trimmed.endsWith('{') && !trimmed.endsWith(',')) {
      errors.push(`${index + 1}: orphan declaration: ${trimmed}`);
    } else if (!validTopLevel) {
      errors.push(`${index + 1}: unexpected top-level text: ${trimmed}`);
    }
  }

  for (const char of cleaned) {
    if (char === '{') depth++;
    else if (char === '}') {
      if (depth === 0) errors.push(`${index + 1}: unmatched closing brace`);
      depth = Math.max(0, depth - 1);
    }
  }
}

if (depth !== 0) errors.push(`unclosed block at end of file (depth=${depth})`);
if (inComment) errors.push('unclosed comment at end of file');

if (errors.length > 0) {
  console.error(`CSS syntax audit failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('CSS syntax audit passed.');
