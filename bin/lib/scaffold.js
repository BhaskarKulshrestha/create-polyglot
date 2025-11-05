import prompts from 'prompts';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import url from 'url';
import { execa } from 'execa';
import { renderServicesTable, printBoxMessage } from './ui.js';
import { initializeServiceLogs } from './logs.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Extracted core scaffold logic so future subcommands (e.g. add service, plugins) can reuse pieces.
export async function scaffoldMonorepo(projectNameArg, options) {
  try {
    // Collect interactive data if arguments / flags not provided
    let projectName = projectNameArg;
    const interactiveQuestions = [];

    if (!projectName) {
      interactiveQuestions.push({
        type: 'text',
        name: 'projectName',
        message: 'Project name:',
        validate: v => v && /^[a-zA-Z0-9._-]+$/.test(v) ? true : 'Use alphanumerics, dash, underscore, dot'
      });
    }

    if (!options.preset) {
      interactiveQuestions.push({
        type: 'select',
        name: 'preset',
        message: 'Preset (optional):',
        choices: [
          { title: 'None', value: '' },
          { title: 'Turborepo', value: 'turborepo' },
          { title: 'Nx', value: 'nx' }
        ],
        initial: 0
      });
    }
    if (!options.packageManager) {
      interactiveQuestions.push({
        type: 'select',
        name: 'packageManager',
        message: 'Package manager:',
        choices: [
          { title: 'npm', value: 'npm' },
          { title: 'pnpm', value: 'pnpm' },
          { title: 'yarn', value: 'yarn' },
          { title: 'bun', value: 'bun' }
        ],
        initial: 0
      });
    }
    if (options.git === undefined) {
      interactiveQuestions.push({
        type: 'toggle',
        name: 'git',
        message: 'Initialize git repository?',
        active: 'yes',
        inactive: 'no',
        initial: true
      });
    }
    if (options.withActions === undefined) {
      interactiveQuestions.push({
        type: 'toggle',
        name: 'withActions',
        message: 'Generate GitHub Actions CI workflow?',
        active: 'yes',
        inactive: 'no',
        initial: false
      });
    }

    let answers = {};
    const nonInteractive = !!options.yes || process.env.CI === 'true';
    if (interactiveQuestions.length) {
      if (nonInteractive) {
        // Fill defaults for each missing prompt deterministically.
        for (const q of interactiveQuestions) {
          switch (q.name) {
            case 'projectName':
              answers.projectName = projectNameArg || 'app';
              break;
            case 'preset':
              answers.preset = '';
              break;
            case 'packageManager':
              answers.packageManager = 'npm';
              break;
            case 'git':
              answers.git = false;
              break;
            case 'withActions':
              answers.withActions = false; // default disabled in non-interactive mode
              break;
            default:
              break;
          }
        }
      } else {
        answers = await prompts(interactiveQuestions, {
          onCancel: () => {
            console.log(chalk.red('\n✖ Cancelled.'));
            process.exit(1);
          }
        });
      }
    }

    projectName = projectName || answers.projectName;
    if (!projectName) {
      console.error(chalk.red('Project name is required.'));
      process.exit(1);
    }
    // Note: options.services will be handled in the dynamic flow below if not provided via CLI
    options.preset = options.preset || answers.preset || '';
    options.packageManager = options.packageManager || answers.packageManager || 'npm';
    if (options.git === undefined) options.git = answers.git;
  if (options.withActions === undefined) options.withActions = answers.withActions;
    // Commander defines '--no-install' as option 'install' defaulting to true, false when flag passed.
    if (Object.prototype.hasOwnProperty.call(options, 'install')) {
      // Normalize to legacy noInstall boolean used below.
      options.noInstall = options.install === false;
    }

    console.log(chalk.cyanBright(`\n🚀 Creating ${projectName} monorepo...\n`));

    const allServiceChoices = [
      { title: 'Node.js (Express)', value: 'node' },
      { title: 'Python (FastAPI)', value: 'python' },
      { title: 'Go (Fiber-like)', value: 'go' },
      { title: 'Java (Spring Boot)', value: 'java' },
      { title: 'Frontend (Next.js)', value: 'frontend' }
    ];
    const templateMap = { java: 'spring-boot' };
    let services = [];
    const reservedNames = new Set(['scripts','packages','apps','node_modules','docker','compose','compose.yaml']);
    const defaultPorts = { frontend: 3000, node: 3001, go: 3002, java: 3003, python: 3004 };

    if (options.services) {
      const validValues = allServiceChoices.map(c => c.value);
      const rawEntries = options.services.split(',').map(s => s.trim()).filter(Boolean);
      for (const entry of rawEntries) {
        const parts = entry.split(':').map(p => p.trim()).filter(Boolean);
        const type = parts[0];
        if (!validValues.includes(type)) {
          console.error(chalk.red(`Invalid service type: ${type}`));
          process.exit(1);
        }
        const name = parts[1] || type;
        const portStr = parts[2];
        if (reservedNames.has(name)) {
          console.error(chalk.red(`Service name '${name}' is reserved.`));
          process.exit(1);
        }
        if (services.find(s => s.name === name)) {
          console.error(chalk.red(`Duplicate service name detected: ${name}`));
          process.exit(1);
        }
        let port = defaultPorts[type];
        if (portStr) {
          const parsed = Number(portStr);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
            console.error(chalk.red(`Invalid port '${portStr}' for service '${name}'.`));
            process.exit(1);
          }
          port = parsed;
        }
        services.push({ type, name, port });
      }
    } else {
      // Dynamic interactive flow: ask how many services, then collect each.
      // In non-interactive mode, default to a single node service
      if (nonInteractive) {
        services.push({ type: 'node', name: 'node', port: defaultPorts.node });
      } else {
        const countAns = await prompts({
          type: 'number',
          name: 'svcCount',
          message: 'How many services do you want to create?',
          initial: 1,
          min: 1,
          validate: v => Number.isInteger(v) && v > 0 && v <= 50 ? true : 'Enter a positive integer (max 50)'
        });
        const svcCount = countAns.svcCount || 1;
        for (let i = 0; i < svcCount; i++) {
        const typeAns = await prompts({
          type: 'select',
          name: 'svcType',
          message: `Service #${i+1} type:`,
          choices: allServiceChoices.map(c => ({ title: c.title, value: c.value })),
          initial: 0
        });
        const svcType = typeAns.svcType;
        if (!svcType) {
          console.log(chalk.red('No type selected; aborting.'));
          process.exit(1);
        }
        const nameAns = await prompts({
          type: 'text',
          name: 'svcName',
          message: `Name for ${svcType} service (leave blank for default '${svcType}'):`,
          validate: v => !v || (/^[a-zA-Z0-9._-]+$/.test(v) ? true : 'Use alphanumerics, dash, underscore, dot')
        });
        let svcName = nameAns.svcName && nameAns.svcName.trim() ? nameAns.svcName.trim() : svcType;
        if (reservedNames.has(svcName) || services.find(s => s.name === svcName)) {
          console.log(chalk.red(`Name '${svcName}' is reserved or already used. Using '${svcType}'.`));
          svcName = svcType;
        }
        const portDefault = defaultPorts[svcType];
        const portAns = await prompts({
          type: 'text',
          name: 'svcPort',
          message: `Port for ${svcName} (${svcType}) (default ${portDefault}):`,
          validate: v => !v || (/^\d+$/.test(v) && +v > 0 && +v <= 65535) ? true : 'Enter a valid port 1-65535'
        });
        let svcPort = portDefault;
        if (portAns.svcPort) {
          const parsed = Number(portAns.svcPort);
          if (services.find(s => s.port === parsed)) {
            console.log(chalk.red(`Port ${parsed} already used; keeping ${portDefault}.`));
          } else if (parsed >=1 && parsed <= 65535) {
            svcPort = parsed;
          }
        }
        services.push({ type: svcType, name: svcName, port: svcPort });
        }
      }
    }

    if (services.length === 0) {
      console.log(chalk.yellow('No services selected. Exiting.'));
      process.exit(0);
    }

    const portMap = new Map();
    for (const s of services) {
      if (portMap.has(s.port)) {
        console.error(chalk.red(`Port conflict: ${s.name} and ${portMap.get(s.port)} both use ${s.port}`));
        process.exit(1);
      }
      portMap.set(s.port, s.name);
    }

    printBoxMessage([
      `Project: ${projectName}`,
      `Preset: ${options.preset || 'none'}  |  Package Manager: ${options.packageManager}`,
      'Selected Services:'
    ], { color: chalk.magenta });
    renderServicesTable(services.map(s => ({ ...s, path: `services/${s.name}` })), { title: 'Service Summary' });
    let proceed = true;
    if (!nonInteractive) {
      const answer = await prompts({
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed with scaffold?',
        initial: true
      });
      proceed = answer.proceed;
    }
    if (!proceed) {
      console.log(chalk.red('✖ Aborted by user.'));
      process.exit(1);
    }

    const projectDir = path.join(process.cwd(), projectName);
    if (await fs.pathExists(projectDir)) {
      const contents = await fs.readdir(projectDir);
      if (contents.length > 0 && !options.force) {
        console.error(chalk.red(`❌ Directory '${projectName}' already exists and is not empty. Use --force to continue.`));
        process.exit(1);
      }
    }
    fs.mkdirSync(projectDir, { recursive: true });

  console.log(chalk.yellow('\n📁 Setting up monorepo structure...'));
  // New structure: services/, gateway/, infra/
  const servicesDir = path.join(projectDir, 'services');
  const gatewayDir = path.join(projectDir, 'gateway');
  const infraDir = path.join(projectDir, 'infra');
  fs.mkdirSync(servicesDir, { recursive: true });
  fs.mkdirSync(gatewayDir, { recursive: true });
  fs.mkdirSync(infraDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'packages'), { recursive: true });

    for (const svcObj of services) {
      const { type: svcType, name: svcName, port: svcPort } = svcObj;
      const templateFolder = templateMap[svcType] || svcType;
  const src = path.join(__dirname, `../../templates/${templateFolder}`);
  const dest = path.join(servicesDir, svcName);
      fs.mkdirSync(dest, { recursive: true });
      let usedGenerator = false;
      if (svcType === 'frontend' && options.frontendGenerator) {
        try {
          console.log(chalk.cyan('⚙️  Running create-next-app for frontend...'));
          const existing = await fs.readdir(dest);
          for (const f of existing) await fs.remove(path.join(dest, f));
          await execa('npx', [
            '--yes',
            'create-next-app@latest',
            '.',
            '--eslint',
            '--app',
            '--src-dir',
            '--no-tailwind',
            '--use-npm',
            '--no-ts'
          ], { cwd: dest, stdio: 'inherit' });
          usedGenerator = true;
        } catch (e) {
          console.log(chalk.yellow('⚠️  create-next-app failed, falling back to internal template. Error:'), e.shortMessage || e.message);
        }
      }
      if (!usedGenerator) {
        if (await fs.pathExists(src) && (await fs.readdir(src)).length > 0) {
          await fs.copy(src, dest, { overwrite: true });
          if (templateFolder === 'spring-boot') {
            const propTxt = path.join(dest, 'src/main/resources/application.properties.txt');
            const prop = path.join(dest, 'src/main/resources/application.properties');
            if (await fs.pathExists(propTxt) && !(await fs.pathExists(prop))) {
              await fs.move(propTxt, prop);
            }
          }
        } else {
          await fs.writeFile(path.join(dest, 'README.md'), `# ${svcName} service\n\nScaffolded by create-polyglot.`);
        }
      }
      
      // Initialize logging for the service
      initializeServiceLogs(dest);
      
      console.log(chalk.green(`✅ Created ${svcName} (${svcType}) service on port ${svcPort}`));
    }

    const rootPkgPath = path.join(projectDir, 'package.json');
    const rootPkg = {
      name: projectName,
      private: true,
      version: '0.1.0',
      workspaces: ['services/*', 'packages/*'],
      scripts: {
        dev: 'node scripts/dev-basic.cjs',
        'list:services': 'node scripts/list-services.mjs',
        format: 'prettier --write .',
        lint: 'eslint "services/**/*.{js,jsx,ts,tsx}" --max-warnings 0 || true'
      },
      devDependencies: {
        prettier: '^3.3.3',
        eslint: '^9.11.1',
        'eslint-config-prettier': '^9.1.0',
        'eslint-plugin-import': '^2.29.1',
        chalk: '^5.6.2'
      }
    };
    if (options.preset === 'turborepo') {
      rootPkg.scripts.dev = 'turbo run dev --parallel';
      rootPkg.devDependencies.turbo = '^2.0.0';
    } else if (options.preset === 'nx') {
      rootPkg.scripts.dev = 'nx run-many -t dev --all';
      rootPkg.devDependencies.nx = '^19.8.0';
    }
    await fs.writeJSON(rootPkgPath, rootPkg, { spaces: 2 });

    // Always ensure scripts dir exists (needed for list-services script)
    const scriptsDir = path.join(projectDir, 'scripts');
    await fs.mkdirp(scriptsDir);
    if (!options.preset) {
      const runnerSrc = path.join(__dirname, '../../scripts/dev-basic.cjs');
      try {
        if (await fs.pathExists(runnerSrc)) {
          await fs.copy(runnerSrc, path.join(scriptsDir, 'dev-basic.cjs'));
        }
      } catch (e) {
        console.log(chalk.yellow('⚠️  Failed to copy dev-basic runner:', e.message));
      }
    }
    // Create list-services script with runtime status detection
    const listScriptPath = path.join(scriptsDir, 'list-services.mjs');
    await fs.writeFile(listScriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nimport path from 'path';\nimport net from 'net';\nimport chalk from 'chalk';\nconst cwd = process.cwd();\nconst cfgPath = path.join(cwd, 'polyglot.json');\nif(!fs.existsSync(cfgPath)){ console.error(chalk.red('polyglot.json not found.')); process.exit(1);}\nconst cfg = JSON.parse(fs.readFileSync(cfgPath,'utf-8'));\n\nfunction strip(str){return str.replace(/\\x1B\\[[0-9;]*m/g,'');}\nfunction pad(str,w){const raw=strip(str);return str+' '.repeat(Math.max(0,w-raw.length));}\nfunction table(items){ if(!items.length){console.log(chalk.yellow('No services.'));return;} const cols=[{k:'name',h:'Name'},{k:'type',h:'Type'},{k:'port',h:'Port'},{k:'status',h:'Status'},{k:'path',h:'Path'}]; const widths=cols.map(c=>Math.max(c.h.length,...items.map(i=>strip(i[c.k]).length))+2); const top='┌'+widths.map(w=>'─'.repeat(w)).join('┬')+'┐'; const sep='├'+widths.map(w=>'─'.repeat(w)).join('┼')+'┤'; const bot='└'+widths.map(w=>'─'.repeat(w)).join('┴')+'┘'; console.log(top); console.log('│'+cols.map((c,i)=>pad(chalk.bold.white(c.h),widths[i])).join('│')+'│'); console.log(sep); for(const it of items){ console.log('│'+cols.map((c,i)=>pad(it[c.k],widths[i])).join('│')+'│'); } console.log(bot); console.log(chalk.gray('Total: '+items.length)); }\n\nasync function check(port){ return new Promise(res=>{ const sock=net.createConnection({port,host:'127.0.0.1'},()=>{sock.destroy();res(true);}); sock.setTimeout(350,()=>{sock.destroy();res(false);}); sock.on('error',()=>{res(false);});}); }\nconst promises = cfg.services.map(async s=>{ const up = await check(s.port); return { ...s, _up: up }; });\nconst results = await Promise.all(promises);\nconst rows = results.map(s=>({ name: chalk.cyan(s.name), type: colorType(s.type)(s.type), port: chalk.green(String(s.port)), status: s._up ? chalk.bgGreen.black(' UP ') : chalk.bgRed.white(' DOWN '), path: chalk.dim(s.path) }));\nfunction colorType(t){ switch(t){case 'node': return chalk.green; case 'python': return chalk.yellow; case 'go': return chalk.cyan; case 'java': return chalk.red; case 'frontend': return chalk.blue; default: return chalk.white;} }\nif(process.argv.includes('--json')) { console.log(JSON.stringify(results.map(r=>({name:r.name,type:r.type,port:r.port,up:r._up,path:r.path})),null,2)); } else { console.log(chalk.magentaBright('\nWorkspace Services (runtime status)')); table(rows); }\n`);

    const readmePath = path.join(projectDir, 'README.md');
  const svcList = services.map(s => `- ${s.name} (${s.type}) port:${s.port}`).join('\n');
    await fs.writeFile(readmePath, `# ${projectName}\n\nGenerated with create-polyglot.\n\n## Services\n${svcList}\n\n## Preset\n${options.preset || 'none'}\n\n## Commands\n- list services: \`npm run list:services\`\n- dev: \`npm run dev\`\n- lint: \`npm run lint\`\n- format: \`npm run format\`\n\n## Docker Compose\nSee compose.yaml (generated).\n`);

    const sharedDir = path.join(projectDir, 'packages/shared');
    if (!(await fs.pathExists(sharedDir))) {
      await fs.mkdirp(path.join(sharedDir, 'src'));
      await fs.writeJSON(path.join(sharedDir, 'package.json'), {
        name: '@shared/utils', version: '0.0.1', type: 'module', main: 'src/index.js'
      }, { spaces: 2 });
      await fs.writeFile(path.join(sharedDir, 'src/index.js'), 'export function greet(name){return `Hello, ${name}`;}');
    }

    await fs.writeFile(path.join(projectDir, '.eslintrc.cjs'), 'module.exports={root:true,env:{node:true,es2022:true},extends:[\'eslint:recommended\',\'plugin:import/recommended\',\'prettier\'],parserOptions:{ecmaVersion:\'latest\',sourceType:\'module\'},rules:{}};\n');
    await fs.writeJSON(path.join(projectDir, '.prettierrc'), { singleQuote: true, semi: true, trailingComma: 'es5' }, { spaces: 2 });

    if (options.preset === 'turborepo') {
      await fs.writeJSON(path.join(projectDir, 'turbo.json'), {
        $schema: 'https://turbo.build/schema.json',
        pipeline: { dev: { cache: false, persistent: true }, build: { dependsOn: ['^build'], outputs: ['dist/**','build/**'] }, lint:{}, format:{ cache:false } }
      }, { spaces: 2 });
    } else if (options.preset === 'nx') {
      await fs.writeJSON(path.join(projectDir, 'nx.json'), {
        $schema: 'https://json.schemastore.org/nx.json',
        npmScope: projectName.replace(/[^a-zA-Z0-9_-]/g,'').toLowerCase(),
        tasksRunnerOptions: { default: { runner: 'nx/tasks-runners/default', options: {} } },
        targetDefaults: { build: { cache: true }, dev: { cache: false } }
      }, { spaces: 2 });
    }

    // Docker / compose generation
    const composeServices = {};
    for (const svcObj of services) {
      const svcDir = path.join(servicesDir, svcObj.name);
      const port = svcObj.port || 0;
      const dockerfile = path.join(svcDir, 'Dockerfile');
      if (!(await fs.pathExists(dockerfile))) {
        let dockerContent = '';
        if (svcObj.type === 'node' || svcObj.type === 'frontend') {
          dockerContent = `# ${svcObj.name} (${svcObj.type}) service\nFROM node:20-alpine AS deps\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install --omit=dev || true\nCOPY . .\nEXPOSE ${port}\nCMD [\"npm\", \"run\", \"dev\"]\n`;
        } else if (svcObj.type === 'python') {
          dockerContent = `FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE ${port}\nCMD [\"uvicorn\", \"app.main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"${port}\"]\n`;
        } else if (svcObj.type === 'go') {
          dockerContent = `FROM golang:1.22-alpine AS builder\nWORKDIR /src\nCOPY . .\nRUN go build -o app main.go\nFROM alpine:3.20\nWORKDIR /app\nCOPY --from=builder /src/app ./app\nEXPOSE ${port}\nCMD [\"./app\"]\n`;
        } else if (svcObj.type === 'java') {
          dockerContent = `FROM maven:3-eclipse-temurin-21 AS build\nWORKDIR /workspace\nCOPY pom.xml .\nRUN mvn -q -DskipTests dependency:go-offline\nCOPY . .\nRUN mvn -q -DskipTests package\nFROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY --from=build /workspace/target/*.jar app.jar\nEXPOSE ${port}\nENTRYPOINT [\"java\", \"-jar\", \"/app/app.jar\"]\n`;
        }
        if (dockerContent) await fs.writeFile(dockerfile, dockerContent);
      }
      if (port) {
        composeServices[svcObj.name] = {
          build: { context: `./services/${svcObj.name}` },
          container_name: `${projectName}-${svcObj.name}`,
          ports: [`${port}:${port}`],
          environment: { PORT: port },
          networks: ['app-net']
        };
      }
    }
    if (Object.keys(composeServices).length) {
      const composePath = path.join(projectDir, 'compose.yaml');
      if (!(await fs.pathExists(composePath))) {
        const yaml = (obj, indent=0) => Object.entries(obj).map(([k,v])=>{ const pad=' '.repeat(indent); if (Array.isArray(v)) return `${pad}${k}:\n${v.map(i=>`${' '.repeat(indent+2)}- ${typeof i==='object'? JSON.stringify(i): i}`).join('\n')}`; if (v && typeof v==='object') return `${pad}${k}:\n${yaml(v, indent+2)}`; return `${pad}${k}: ${v}`; }).join('\n');
        const composeObj = { version: '3.9', services: composeServices, networks: { 'app-net': { driver: 'bridge' } } };
        await fs.writeFile(composePath, `# Generated by create-polyglot\n${yaml(composeObj)}\n`);
      }
    }

    if (options.git) {
      await fs.writeFile(path.join(projectDir, '.gitignore'), 'node_modules\n.DS_Store\n.env*\n/dist\n.next\n');
      try {
        await execa('git', ['init'], { cwd: projectDir });
        await execa('git', ['add', '.'], { cwd: projectDir });
        await execa('git', ['commit', '-m', 'chore: initial scaffold'], { cwd: projectDir });
        console.log(chalk.green('✅ Initialized git repository'));
      } catch (e) {
        console.log(chalk.yellow('⚠️  Git initialization failed (continuing).'));
      }
    }

    const pm = options.packageManager || 'npm';
    // Commander maps --no-install to options.install = false
    if (options.install !== false) {
      console.log(chalk.cyan(`\n📦 Installing root dependencies using ${pm}...`));
      const installCmd = pm === 'yarn' ? ['install'] : pm === 'pnpm' ? ['install'] : pm === 'bun' ? ['install'] : ['install'];
      try {
        await execa(pm, installCmd, { cwd: projectDir, stdio: 'inherit' });
      } catch (e) {
        console.log(chalk.yellow('⚠️  Installing dependencies failed, you can try manually.'));
      }
    }

    // Optionally generate GitHub Actions workflow
    if (options.withActions) {
      try {
        const wfDir = path.join(projectDir, '.github', 'workflows');
        await fs.mkdirp(wfDir);
        const wfPath = path.join(wfDir, 'ci.yml');
        if (!(await fs.pathExists(wfPath))) {
          const nodeVersion = '20.x';
          const installStep = pm === 'yarn' ? 'yarn install --frozen-lockfile || yarn install' : pm === 'pnpm' ? 'pnpm install' : pm === 'bun' ? 'bun install' : 'npm ci || npm install';
          const testCmd = pm === 'yarn' ? 'yarn test' : pm === 'pnpm' ? 'pnpm test' : pm === 'bun' ? 'bun test' : 'npm test';
          const wf = `# Generated by create-polyglot CI scaffold\nname: CI\n\non:\n  push:\n    branches: [ main, master ]\n  pull_request:\n    branches: [ main, master ]\n\njobs:\n  build-test:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v4\n      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: ${nodeVersion}\n          cache: '${pm === 'npm' ? 'npm' : pm}'\n      - name: Install dependencies\n        run: ${installStep}\n      - name: Run tests\n        run: ${testCmd}\n`;
          await fs.writeFile(wfPath, wf);
          console.log(chalk.green('✅ Added GitHub Actions workflow (.github/workflows/ci.yml)'));
        }
      } catch (e) {
        console.log(chalk.yellow('⚠️  Failed to create GitHub Actions workflow:'), e.message);
      }
    }

    // Write polyglot config
    const polyglotConfig = {
      name: projectName,
      preset: options.preset || 'none',
      packageManager: options.packageManager,
      services: services.map(s => ({ name: s.name, type: s.type, port: s.port, path: `services/${s.name}` }))
    };
    await fs.writeJSON(path.join(projectDir, 'polyglot.json'), polyglotConfig, { spaces: 2 });

    printBoxMessage([
      '🎉 Monorepo setup complete!',
      `cd ${projectName}`,
      options.install === false ? `${pm} install` : '',
      `${pm} run list:services   # quick list (fancy table)`,
      `${pm} run dev             # run local node/frontend services`,
      'docker compose up --build# run all via docker',
      options.withActions ? 'GitHub Actions CI ready (see .github/workflows/ci.yml)' : '',
      '',
      'Happy hacking!'
    ].filter(Boolean));
  } catch (err) {
    console.error(chalk.red('Failed to scaffold project:'), err);
    process.exit(1);
  }
}

// Utility to add a service post-initialization
export async function addService(projectDir, { type, name, port }, options = {}) {
  const configPath = path.join(projectDir, 'polyglot.json');
  if (!(await fs.pathExists(configPath))) {
    throw new Error('polyglot.json not found. Are you in a create-polyglot project?');
  }
  const cfg = await fs.readJSON(configPath);
  if (cfg.services.find(s => s.name === name)) {
    throw new Error(`Service '${name}' already exists.`);
  }
  if (cfg.services.find(s => s.port === port)) {
    throw new Error(`Port ${port} already in use by another service.`);
  }
  const templateMap = { java: 'spring-boot' };
  const templateFolder = templateMap[type] || type;
  const servicesDir = path.join(projectDir, 'services');
  const dest = path.join(servicesDir, name);
  await fs.mkdirp(dest);
  const src = path.join(__dirname, `../../templates/${templateFolder}`);
  if (await fs.pathExists(src)) {
    await fs.copy(src, dest, { overwrite: true });
    if (templateFolder === 'spring-boot') {
      const propTxt = path.join(dest, 'src/main/resources/application.properties.txt');
      const prop = path.join(dest, 'src/main/resources/application.properties');
      if (await fs.pathExists(propTxt) && !(await fs.pathExists(prop))) await fs.move(propTxt, prop);
    }
  } else {
    await fs.writeFile(path.join(dest, 'README.md'), `# ${name} (${type}) service\n`);
  }
  
  // Initialize logging for the service
  initializeServiceLogs(dest);
  
  console.log(chalk.green(`✅ Added service '${name}' (${type}) on port ${port}`));
  cfg.services.push({ name, type, port, path: `services/${name}` });
  await fs.writeJSON(configPath, cfg, { spaces: 2 });

  // Update compose.yaml (append or create)
  const composePath = path.join(projectDir, 'compose.yaml');
  let composeObj;
  if (await fs.pathExists(composePath)) {
    const raw = await fs.readFile(composePath, 'utf-8');
    // naive parse: look for services: if cannot parse, regenerate
    try {
      // Not using YAML parser to avoid new dependency; simple regex fallback
      // If complexity grows, integrate js-yaml later.
      composeObj = { version: '3.9', services: {}, networks: { 'app-net': { driver: 'bridge' } } };
      // regenerate fully from cfg
    } catch {
      composeObj = null;
    }
  }
  if (!composeObj) composeObj = { version: '3.9', services: {}, networks: { 'app-net': { driver: 'bridge' } } };
  for (const s of cfg.services) {
    composeObj.services[s.name] = {
      build: { context: `./${s.path}` },
      container_name: `${cfg.name}-${s.name}`,
      ports: [`${s.port}:${s.port}`],
      environment: { PORT: s.port },
      networks: ['app-net']
    };
  }
  const yaml = (obj, indent = 0) => Object.entries(obj).map(([k, v]) => {
    const pad = ' '.repeat(indent);
    if (Array.isArray(v)) return `${pad}${k}:\n${v.map(i => `${' '.repeat(indent + 2)}- ${typeof i === 'object' ? JSON.stringify(i) : i}`).join('\n')}`;
    if (v && typeof v === 'object') return `${pad}${k}:\n${yaml(v, indent + 2)}`;
    return `${pad}${k}: ${v}`;
  }).join('\n');
  await fs.writeFile(composePath, `# Generated by create-polyglot\n${yaml(composeObj)}\n`);
}

export async function scaffoldPlugin(projectDir, pluginName) {
  const pluginsDir = path.join(projectDir, 'plugins');
  await fs.mkdirp(pluginsDir);
  const pluginDir = path.join(pluginsDir, pluginName);
  if (await fs.pathExists(pluginDir)) throw new Error(`Plugin '${pluginName}' already exists.`);
  await fs.mkdirp(pluginDir);
  await fs.writeFile(path.join(pluginDir, 'index.js'), `// Example plugin '${pluginName}'\nexport default {\n  name: '${pluginName}',\n  hooks: {\n    afterInit(ctx){\n      // ctx: { projectDir, config }\n      console.log('[plugin:${pluginName}] afterInit hook');\n    }\n  }\n};\n`);
  await fs.writeFile(path.join(pluginDir, 'README.md'), `# Plugin ${pluginName}\n\nScaffolded plugin. Implement hooks in index.js.\n`);
  console.log(chalk.green(`✅ Created plugin scaffold '${pluginName}'`));
}
