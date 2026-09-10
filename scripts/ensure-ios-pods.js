#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.env.SKIP_POD_INSTALL === '1') {
  process.exit(0);
}
if (process.platform !== 'darwin') {
  process.exit(0);
}

const script = path.resolve(__dirname, '..', 'ios', 'ensure-pods.sh');
if (!fs.existsSync(script)) {
  process.exit(0);
}

const result = spawnSync('bash', [script], {
  stdio: 'inherit',
  env: {
    ...process.env,
    LANG: process.env.LANG || 'en_US.UTF-8',
    LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
  },
});

if (result.error && result.error.code === 'ENOENT') {
  console.warn('[ensure-pods] bash not found, skip CocoaPods install');
  process.exit(0);
}

const status = result.status;
if (status === 0) {
  process.exit(0);
}

if (!commandExists('pod')) {
  console.warn('[ensure-pods] CocoaPods missing; iOS archive needs: brew install cocoapods && npm run pods');
  process.exit(0);
}

process.exit(status == null ? 1 : status);

function commandExists(name) {
  const check = spawnSync('command', ['-v', name], { encoding: 'utf8' });
  return check.status === 0;
}
