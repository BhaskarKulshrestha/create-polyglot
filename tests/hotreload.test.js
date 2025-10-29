import { execa } from 'execa';
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Tests for unified hot reload command

describe('hot reload command', () => {
  const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-hot-'));
  const tmpDir = path.join(tmpParent, 'workspace');
  fs.mkdirSync(tmpDir);
  const projName = 'hot-proj';

  afterAll(() => { try { fs.rmSync(tmpParent, { recursive: true, force: true }); } catch {} });

  it('dry-run lists spawn strategies for node service', async () => {
    const repoRoot = process.cwd();
    const cliPath = path.join(repoRoot, 'bin/index.js');
  // Use fewer services to speed up scaffold
  await execa('node', [cliPath, 'init', projName, '--services', 'node', '--no-install', '--yes'], { cwd: tmpDir, env: { ...process.env, CI: 'true' } });
    const projectPath = path.join(tmpDir, projName);

    // Ensure dev scripts exist where needed for node/frontend
    const nodePkgPath = path.join(projectPath, 'services/node/package.json');
    const nodePkg = JSON.parse(fs.readFileSync(nodePkgPath,'utf-8'));
    nodePkg.scripts = nodePkg.scripts || {}; nodePkg.scripts.dev = 'node src/index.js';
    fs.writeFileSync(nodePkgPath, JSON.stringify(nodePkg, null, 2));

    const proc = await execa('node', [cliPath, 'hot', '--dry-run'], { cwd: projectPath, env: { ...process.env, CI: 'true' } });
    expect(proc.stdout).toMatch(/\[dry-run\] node:/);
  }, 30000);

  it('filters node service via --services option', async () => {
    const repoRoot = process.cwd();
    const cliPath = path.join(repoRoot, 'bin/index.js');
  await execa('node', [cliPath, 'init', projName+'2', '--services', 'node', '--no-install', '--yes'], { cwd: tmpDir, env: { ...process.env, CI: 'true' } });
    const projectPath = path.join(tmpDir, projName+'2');

    const proc = await execa('node', [cliPath, 'hot', '--dry-run', '--services', 'node'], { cwd: projectPath, env: { ...process.env, CI: 'true' } });
    expect(proc.stdout).toMatch(/\[dry-run\] node:/);
  }, 30000);
});
