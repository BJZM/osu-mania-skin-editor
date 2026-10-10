import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = [
  'exec',
  '--yes',
  '--package=wrangler@4.149.0',
  '--',
  'wrangler',
  'pages',
  'deploy',
  'site',
  '--project-name',
  'osu-mania-skin-editor',
  '--branch',
  'main',
  '--commit-dirty=true'
];

const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : npmCommand;
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', [npmCommand, ...args].join(' ')]
  : args;

const child = spawn(command, commandArgs, {
  cwd: root,
  windowsHide: true,
  stdio: ['inherit', 'pipe', 'pipe']
});

let output = '';

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output += chunk.toString();
    process.stdout.write(chunk);
  });
}

child.once('error', (error) => {
  console.error(`Unable to start Wrangler: ${error.message}`);
  process.exit(1);
});

child.once('close', (code) => {
  const deployed = /Deployment complete! Take a peek over at https:\/\/\S+/.test(output);
  if (deployed) {
    if (code !== 0) {
      console.log('Cloudflare Pages confirmed the deployment; Wrangler returned a known Windows exit-code quirk.');
    }
    process.exit(0);
  }

  console.error(`Cloudflare Pages deployment failed with exit code ${code ?? 'unknown'}.`);
  process.exit(code ?? 1);
});
