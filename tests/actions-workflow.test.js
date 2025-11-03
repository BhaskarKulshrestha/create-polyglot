import { execa } from 'execa';
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Test that --with-actions generates a GitHub Actions workflow file.

describe('GitHub Actions workflow generation', () => {
  const tmpParent = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-actions-'));
  let tmpDir = path.join(tmpParent, 'workspace');
  fs.mkdirSync(tmpDir);
  const projName = 'ci-proj';

  afterAll(() => {
    try { fs.rmSync(tmpParent, { recursive: true, force: true }); } catch {}
  });

  it('creates a ci.yml when --with-actions passed', async () => {
    const repoRoot = process.cwd();
    const cliPath = path.join(repoRoot, 'bin/index.js');
  await execa('node', [cliPath, 'init', projName, '--services', 'node', '--no-install', '--with-actions', '--yes'], { cwd: tmpDir });
    const wfPath = path.join(tmpDir, projName, '.github', 'workflows', 'ci.yml');
    expect(fs.existsSync(wfPath)).toBe(true);
    const content = fs.readFileSync(wfPath, 'utf-8');
    expect(content).toMatch(/name: CI/);
    expect(content).toMatch(/Run tests/);
  }, 30000);
});
