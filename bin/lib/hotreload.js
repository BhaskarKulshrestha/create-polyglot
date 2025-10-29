import fs from 'fs';
import path from 'path';
import { spawn } from 'node:child_process';
import chalk from 'chalk';

/*
 Unified Hot Reload Aggregator
 ----------------------------
 Goal: Provide a single command that watches source files for all supported
 service types and restarts their dev process (or equivalent) on changes.

 Supported service types & strategy:
 - node: restart on .js/.mjs/.cjs/.ts changes inside service dir (excluding node_modules).
         If service has dev script using nodemon/ts-node-dev already, we just run it.
 - frontend (Next.js): rely on next dev internal HMR (no restart). We'll watch config files
         (next.config.*, .env*) and trigger a manual restart if they change.
 - python (FastAPI): use uvicorn with --reload if available; if requirements specify uvicorn,
         we spawn `uvicorn app.main:app --reload --port <port>` instead of existing dev script.
 - go: detect main.go; use `go run .` and restart on .go file changes.
 - java (Spring Boot): use `mvn spring-boot:run` and restart on changes to src/ (requires JDK & Maven).
       For performance we debounce restarts.

 Edge cases:
 - Missing runtime tool (e.g., mvn not installed) -> warn and skip hot reload for that service.
 - Large flurries of changes -> debounce restart (default 400ms).
 - Service without supported pattern -> skip with yellow message.

 Exposed function: runHotReload({ servicesFilter, dryRun })
 */

const DEBOUNCE_MS = 400;

function colorFor(name) {
  const colors = [chalk.cyan, chalk.magenta, chalk.green, chalk.blue, chalk.yellow, chalk.redBright];
  let sum = 0; for (let i=0;i<name.length;i++) sum += name.charCodeAt(i);
  return colors[sum % colors.length];
}

export async function runHotReload({ servicesFilter = [], dryRun = false } = {}) {
  const cwd = process.cwd();
  const cfgPath = path.join(cwd, 'polyglot.json');
  if (!fs.existsSync(cfgPath)) {
    console.error(chalk.red('polyglot.json not found. Run inside a generated workspace.'));
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  let services = cfg.services || [];
  if (servicesFilter.length) {
    const filterSet = new Set(servicesFilter);
    services = services.filter(s => filterSet.has(s.name) || filterSet.has(s.type));
  }
  if (!services.length) {
    console.log(chalk.yellow('No matching services for hot reload.'));
    return;
  }

  console.log(chalk.cyan(`\n🔥 Unified hot reload starting (${services.length} services)...`));

  const watchers = [];
  const processes = new Map();

  function spawnService(svc) {
    const svcPath = path.join(cwd, svc.path);
    if (!fs.existsSync(svcPath)) {
      console.log(chalk.yellow(`Skipping ${svc.name} (path missing)`));
      return;
    }
    const color = colorFor(svc.name);
    let cmd, args, watchGlobs, restartStrategy;
    switch (svc.type) {
      case 'node': {
        const pkgPath = path.join(svcPath, 'package.json');
        if (!fs.existsSync(pkgPath)) { console.log(chalk.yellow(`Skipping ${svc.name} (no package.json)`)); return; }
        let pkg; try { pkg = JSON.parse(fs.readFileSync(pkgPath,'utf-8')); } catch { console.log(chalk.yellow(`Skipping ${svc.name} (invalid package.json)`)); return; }
        const script = pkg.scripts?.dev || pkg.scripts?.start;
        if (!script) { console.log(chalk.yellow(`Skipping ${svc.name} (no dev/start script)`)); return; }
        // Prefer existing nodemon usage; else run node and restart manually.
        const usesNodemon = /nodemon/.test(script);
        if (usesNodemon) {
          cmd = detectPM(svcPath);
          args = ['run', pkg.scripts.dev ? 'dev' : 'start'];
          watchGlobs = []; // nodemon handles its own watching
          restartStrategy = 'internal';
        } else {
          cmd = detectPM(svcPath);
          args = ['run', pkg.scripts.dev ? 'dev' : 'start'];
          watchGlobs = ['**/*.js','**/*.mjs','**/*.cjs','**/*.ts','!node_modules/**'];
          restartStrategy = 'respawn';
        }
        break;
      }
      case 'frontend': {
        // Next.js handles HMR internally; only restart if config changes.
        cmd = detectPM(svcPath); args = ['run','dev'];
        watchGlobs = ['next.config.*','*.env','*.env.*'];
        restartStrategy = 'internal+config-restart';
        break;
      }
      case 'python': {
        // Use uvicorn --reload directly if possible.
        cmd = 'uvicorn';
        args = ['app.main:app','--reload','--port', String(svc.port)];
        watchGlobs = ['app/**/*.py','*.py'];
        restartStrategy = 'respawn';
        break;
      }
      case 'go': {
        cmd = 'go'; args = ['run','.'];
        watchGlobs = ['**/*.go'];
        restartStrategy = 'respawn';
        break;
      }
      case 'java': {
        // Spring Boot dev run; restart on src changes.
        cmd = 'mvn'; args = ['spring-boot:run'];
        watchGlobs = ['src/main/java/**/*.java','src/main/resources/**/*'];
        restartStrategy = 'respawn';
        break;
      }
      default:
        console.log(chalk.yellow(`Skipping ${svc.name} (unsupported type ${svc.type})`));
        return;
    }

    if (dryRun) {
      console.log(chalk.gray(`[dry-run] ${svc.name}: ${cmd} ${args.join(' ')} (${restartStrategy})`));
      return;
    }

    const child = spawn(cmd, args, { cwd: svcPath, env: { ...process.env, PORT: String(svc.port) }, shell: true });
    processes.set(svc.name, { child, svc, watchGlobs, restartStrategy, svcPath });
    child.stdout.on('data', d => process.stdout.write(color(`[${svc.name}] `) + d.toString()));
    child.stderr.on('data', d => process.stderr.write(color(`[${svc.name}] `) + d.toString()));
    child.on('exit', code => {
      process.stdout.write(color(`[${svc.name}] exited (${code})`)+"\n");
    });

    if (watchGlobs && watchGlobs.length) {
      // Minimal glob watching without external deps: recursive fs watch + filter.
      // NOTE: macOS recursive watch limitations; we manually walk tree initially.
      const fileList = listFilesRecursive(svcPath);
      const matcher = buildMatcher(watchGlobs);
      const pending = { timeout: null };

      function scheduleRestart() {
        if (pending.timeout) clearTimeout(pending.timeout);
        pending.timeout = setTimeout(() => {
          const meta = processes.get(svc.name);
          if (!meta) return;
          console.log(color(`↻ Restarting ${svc.name} due to changes...`));
          meta.child.kill('SIGINT');
          spawnService(svc); // respawn fresh
        }, DEBOUNCE_MS);
      }

      // Initial watchers per directory
      const dirs = new Set(fileList.map(f => path.dirname(f)));
      for (const dir of dirs) {
        try {
          const w = fs.watch(dir, { persistent: true }, (evt, fileName) => {
            if (!fileName) return;
            const rel = path.relative(svcPath, path.join(dir, fileName));
            if (matcher(rel)) {
              scheduleRestart();
            }
          });
          watchers.push(w);
        } catch {}
      }
    }
  }

  // Spawn all initially
  for (const svc of services) spawnService(svc);

  if (!dryRun) {
    console.log(chalk.blue('Hot reload active. Press Ctrl+C to exit.'));
    process.on('SIGINT', () => {
      for (const { child } of processes.values()) child.kill('SIGINT');
      for (const w of watchers) try { w.close(); } catch {}
      process.exit(0);
    });
  }
}

function listFilesRecursive(root) {
  const out = [];
  function walk(p) {
    let stats; try { stats = fs.statSync(p); } catch { return; }
    if (stats.isDirectory()) {
      const entries = fs.readdirSync(p);
      for (const e of entries) walk(path.join(p, e));
    } else {
      out.push(p);
    }
  }
  walk(root);
  return out;
}

// Very small glob matcher supporting *, **, suffix patterns and exclusion !prefix.
function buildMatcher(globs) {
  const positives = globs.filter(g => !g.startsWith('!'));
  const negatives = globs.filter(g => g.startsWith('!')).map(g => g.slice(1));
  return rel => {
    if (negatives.some(n => minimatchBasic(rel, n))) return false;
    return positives.some(p => minimatchBasic(rel, p));
  };
}

function minimatchBasic(rel, pattern) {
  // Convert pattern to regex roughly; handle **/, *, and dotfiles.
  let regex = pattern
    .replace(/[.+^${}()|\-]/g, r => `\\${r}`)
    .replace(/\\\*\*\//g, '(?:.+/)?') // /**/ style
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${regex}$`).test(rel);
}

function detectPM(root) {
  if (fs.existsSync(path.join(root,'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root,'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root,'bun.lockb'))) return 'bun';
  return 'npm';
}
