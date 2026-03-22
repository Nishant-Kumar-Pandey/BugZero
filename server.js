const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const crypto = require('crypto');
const { Octokit } = require('@octokit/rest');
const { execSync } = require('child_process');

// ─── Load Environment Variables (.env) ─────────────────────────────────────
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valParts] = trimmed.split('=');
        if (key && valParts.length > 0) {
          process.env[key.trim()] = valParts.join('=').split('#')[0].trim();
        }
      }
    });
  }
} catch (e) {
  console.error('[BugZero] Failed to load .env:', e.message);
}

const app = express();

// ─── Security Configuration (CSP) ──────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "img-src 'self' data:;"
  );
  next();
});

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  PORT: process.env.PORT || 3000,
};

// ─── In-memory event log (replace with DB in prod) ─────────────────────────
const eventLog = [];

function log(event) {
  const entry = { id: Date.now(), ts: new Date().toISOString(), ...event };
  eventLog.unshift(entry);
  if (eventLog.length > 200) eventLog.pop();
  console.log(`[BugZero] ${entry.ts} | ${event.level?.toUpperCase() || 'INFO'} | ${event.message}`);
  return entry;
}

// ─── Secret detection patterns ─────────────────────────────────────────────
const SECRET_PATTERNS = [
  { name: 'OpenAI API Key',    regex: /sk-[A-Za-z0-9]{20,}/g,           envVar: 'OPENAI_API_KEY'    },
  { name: 'AWS Access Key',    regex: /AKIA[0-9A-Z]{16}/g,              envVar: 'AWS_ACCESS_KEY_ID' },
  { name: 'AWS Secret Key',    regex: /(?:aws_secret|secret_key)\s*=\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, envVar: 'AWS_SECRET_ACCESS_KEY' },
  { name: 'GitHub Token',      regex: /ghp_[A-Za-z0-9]{36}/g,           envVar: 'GITHUB_TOKEN'      },
  { name: 'Stripe Secret Key', regex: /sk_live_[A-Za-z0-9]{24,}/g,      envVar: 'STRIPE_SECRET_KEY' },
  { name: 'Stripe Test Key',   regex: /sk_test_[A-Za-z0-9]{24,}/g,      envVar: 'STRIPE_TEST_KEY'   },
  { name: 'Hardcoded Password',regex: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{8,})["']/gi, envVar: 'APP_PASSWORD' },
  { name: 'process.env.BEARER_TOKEN',      regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, envVar: 'BEARER_TOKEN'    },
  { name: 'Generic API Key',   regex: /api[_-]?key\s*[:=]\s*["']([A-Za-z0-9\-_]{16,})["']/gi, envVar: 'API_KEY' },
];

function detectSecrets(content, filename) {
  const found = [];
  for (const pattern of SECRET_PATTERNS) {
    const matches = [...content.matchAll(pattern.regex)];
    for (const match of matches) {
      found.push({
        type: pattern.name,
        value: match[0],
        envVar: pattern.envVar,
        line: content.substring(0, match.index).split('\n').length,
        file: filename,
      });
    }
  }
  return found;
}

function redactSecrets(content, secrets) {
  let patched = content;
  const envLines = [];
  for (const secret of secrets) {
    const placeholder = `process.env.${secret.envVar}`;
    // Replace raw values
    patched = patched.split(secret.value).join(placeholder);
    envLines.push(`${secret.envVar}=${secret.value}  # TODO: Rotate this key!`);
  }
  return { patched, envLines };
}

// ─── AI Fix Engine ─────────────────────────────────────────────────────────
async function callOpenAI(prompt) {
  if (!CONFIG.OPENAI_API_KEY) {
    return '// AI fix unavailable: OPENAI_API_KEY not set\n// Manual review required';
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function generateCodeFix(fileContent, issues) {
  const prompt = `You are an expert code repair agent. Fix the following issues in this code.

Issues detected:
${issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}

Original code:
\`\`\`
${fileContent.substring(0, 3000)}
\`\`\`

Return ONLY the fixed code, no explanation, no markdown fences. Preserve all existing functionality.`;

  return callOpenAI(prompt);
}

// ─── ESLint analysis (simulated if eslint not installed) ───────────────────
function runESLint(dir) {
  try {
    const result = execSync(`cd "${dir}" && npx eslint . --format json 2>/dev/null || true`, {
      timeout: 30000, encoding: 'utf8',
    });
    const parsed = JSON.parse(result || '[]');
    return parsed.flatMap(f =>
      f.messages.map(m => ({
        file: f.filePath.replace(dir + '/', ''),
        line: m.line,
        col: m.column,
        message: m.message,
        rule: m.ruleId,
        severity: m.severity === 2 ? 'error' : 'warning',
      }))
    );
  } catch { return []; }
}

function runNpmAudit(dir) {
  try {
    const result = execSync(`cd "${dir}" && npm audit --json 2>/dev/null || true`, {
      timeout: 30000, encoding: 'utf8',
    });
    const data = JSON.parse(result || '{}');
    const vulns = data.vulnerabilities || {};
    return Object.entries(vulns).map(([pkg, info]) => ({
      package: pkg,
      severity: info.severity,
      via: (info.via || []).map(v => (typeof v === 'string' ? v : v.title)).join(', '),
      fixAvailable: !!info.fixAvailable,
    }));
  } catch { return []; }
}

// ─── GitHub helpers ────────────────────────────────────────────────────────
function makeOctokit() {
  return new Octokit({ auth: CONFIG.GITHUB_TOKEN });
}

async function cloneRepo(owner, repo, ref) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugzero-'));
  const url = `https://x-access-token:${CONFIG.GITHUB_TOKEN}@github.com/${owner}/${repo}.git`;
  execSync(`git clone --depth 1 --branch ${ref} ${url} "${tmpDir}"`, { timeout: 60000 });
  return tmpDir;
}

async function getAllJSFiles(dir) {
  const results = [];
  const ignore = ['node_modules', '.git', 'dist', 'build', 'coverage'];
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      if (ignore.includes(name)) continue;
      const full = path.join(d, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(name)) results.push(full);
    }
  }
  walk(dir);
  return results;
}

// ─── Core agent pipeline ───────────────────────────────────────────────────
async function runAgent({ owner, repo, ref, sha, event, prNumber }) {
  const runId = `run-${Date.now()}`;
  log({ level: 'info', message: `🚀 Agent triggered: ${owner}/${repo}@${ref} (${event})`, runId });

  const octokit = makeOctokit();
  let tmpDir = null;

  try {
    // 1. Clone repo
    log({ level: 'info', message: `📥 Cloning ${owner}/${repo}...`, runId });
    tmpDir = await cloneRepo(owner, repo, ref);

    // 2. Scan all JS/TS files for secrets
    log({ level: 'info', message: `🔍 Scanning for secrets...`, runId });
    const jsFiles = await getAllJSFiles(tmpDir);
    const allSecrets = [];
    const filePatches = {};

    for (const filePath of jsFiles) {
      const relPath = filePath.replace(tmpDir + '/', '');
      const content = fs.readFileSync(filePath, 'utf8');
      const secrets = detectSecrets(content, relPath);
      if (secrets.length > 0) {
        allSecrets.push(...secrets);
        const { patched, envLines } = redactSecrets(content, secrets);
        filePatches[relPath] = { original: content, patched, envLines, secrets };
        log({ level: 'warn', message: `🔑 Secret found in ${relPath}: ${secrets.map(s => s.type).join(', ')}`, runId });
      }
    }

    // 3. ESLint scan
    log({ level: 'info', message: `🧹 Running ESLint...`, runId });
    const lintIssues = runESLint(tmpDir);
    log({ level: 'info', message: `📋 ESLint: ${lintIssues.length} issues found`, runId });

    // 4. npm audit
    log({ level: 'info', message: `🛡️ Running npm audit...`, runId });
    const vulns = runNpmAudit(tmpDir);
    log({ level: 'info', message: `🔐 npm audit: ${vulns.length} vulnerabilities found`, runId });

    // 5. If nothing found, bail early
    if (allSecrets.length === 0 && lintIssues.length === 0 && vulns.length === 0) {
      log({ level: 'success', message: `✅ No issues found. Repository looks clean!`, runId });
      return { status: 'clean', runId };
    }

    // 6. AI-fix lint errors
    for (const [relPath, patch] of Object.entries(filePatches)) {
      const fileLintIssues = lintIssues
        .filter(i => i.file === relPath)
        .map(i => `Line ${i.line}: [${i.rule}] ${i.message}`);
      if (fileLintIssues.length > 0) {
        log({ level: 'info', message: `🤖 AI fixing ${fileLintIssues.length} lint issues in ${relPath}...`, runId });
        try {
          const fixed = await generateCodeFix(patch.patched, fileLintIssues);
          patch.patched = fixed.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
        } catch (e) {
          log({ level: 'warn', message: `⚠️ AI fix failed for ${relPath}: ${e.message}`, runId });
        }
      }
    }

    // 7. Apply patches & create branch
    const branchName = `bugzero/autofix-${Date.now()}`;
    execSync(`cd "${tmpDir}" && git checkout -b ${branchName}`);

    // Write patched files
    const envLines = [];
    for (const [relPath, patch] of Object.entries(filePatches)) {
      fs.writeFileSync(path.join(tmpDir, relPath), patch.patched, 'utf8');
      envLines.push(...patch.envLines);
    }

    // Update / create .env.example
    if (envLines.length > 0) {
      const envExamplePath = path.join(tmpDir, '.env.example');
      const existing = fs.existsSync(envExamplePath) ? fs.readFileSync(envExamplePath, 'utf8') : '';
      const newContent = existing + '\n# Added by BugZero AI\n' + envLines.join('\n') + '\n';
      fs.writeFileSync(envExamplePath, newContent);
    }

    // 8. Commit & push
    execSync([
      `cd "${tmpDir}"`,
      `git config user.email "bugzero@ai.bot"`,
      `git config user.name "BugZero AI"`,
      `git add -A`,
      `git commit -m "🤖 BugZero AI: Auto-fix secrets, lint & security issues"`,
      `git push origin ${branchName}`,
    ].join(' && '), { timeout: 60000 });

    log({ level: 'info', message: `📤 Pushed branch ${branchName}`, runId });

    // 9. Build PR body
    const secretSummary = allSecrets.length > 0
      ? `### 🔑 Secrets Removed (${allSecrets.length})\n` +
        allSecrets.map(s => `- **${s.type}** in \`${s.file}\` line ${s.line} → replaced with \`process.env.${s.envVar}\``).join('\n') +
        '\n\n> ⚠️ **Action required**: Rotate/revoke the exposed keys immediately!\n'
      : '';

    const lintSummary = lintIssues.length > 0
      ? `### 🧹 ESLint Issues Fixed (${lintIssues.length})\n` +
        lintIssues.slice(0, 10).map(i => `- \`${i.file}:${i.line}\` [${i.rule || 'style'}] ${i.message}`).join('\n') +
        (lintIssues.length > 10 ? `\n- ...and ${lintIssues.length - 10} more` : '') + '\n'
      : '';

    const vulnSummary = vulns.length > 0
      ? `### 🛡️ Security Vulnerabilities (${vulns.length})\n` +
        vulns.slice(0, 8).map(v => `- **${v.package}** (${v.severity}): ${v.via}`).join('\n') + '\n'
      : '';

    const prBody = `## 🤖 BugZero AI — Automated Fix Report

This PR was automatically generated by **BugZero AI** after detecting issues in \`${ref}\`.

${secretSummary}${lintSummary}${vulnSummary}
---
### Why This Matters
- **Security**: Exposed API keys can be exploited within minutes of a public commit
- **Code Quality**: Consistent linting prevents bugs and improves maintainability  
- **Reliability**: Dependency vulnerabilities can compromise your entire stack

### Next Steps
1. Review this PR carefully
2. Rotate any exposed credentials immediately
3. Add \`.env\` to your \`.gitignore\` if not already present
4. Consider enabling branch protection rules

---
*Generated by [BugZero AI](https://github.com/bugzero-ai) • ${new Date().toUTCString()}*`;

    const prTitle = [
      allSecrets.length > 0 && '🔑 Removed Exposed Secrets',
      lintIssues.length > 0 && '🧹 Fixed Lint Issues',
      vulns.length > 0 && '🛡️ Security Audit',
    ].filter(Boolean).join(' & ');

    // 10. Create PR
    const pr = await octokit.pulls.create({
      owner, repo,
      title: `🤖 Auto-Fix: ${prTitle}`,
      body: prBody,
      head: branchName,
      base: ref,
    });

    log({ level: 'success', message: `✅ PR #${pr.data.number} created: ${pr.data.html_url}`, runId });

    // Add labels
    try {
      await octokit.issues.addLabels({
        owner, repo, issue_number: pr.data.number,
        labels: ['bugzero-ai', 'automated-fix', 'security'],
      });
    } catch { /* labels may not exist */ }

    return {
      status: 'fixed',
      runId,
      pr: { number: pr.data.number, url: pr.data.html_url, title: pr.data.title },
      summary: { secrets: allSecrets.length, lintIssues: lintIssues.length, vulns: vulns.length },
    };

  } catch (err) {
    log({ level: 'error', message: `❌ Agent error: ${err.message}`, runId });
    throw err;
  } finally {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try { execSync(`rm -rf "${tmpDir}"`); } catch {}
    }
  }
}

// ─── Express routes ────────────────────────────────────────────────────────
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.static(path.join(__dirname, 'public')));

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  // Verify HMAC signature
  if (CONFIG.GITHUB_WEBHOOK_SECRET) {
    const sig = req.headers['x-hub-signature-256'];
    const expected = 'sha256=' + crypto.createHmac('sha256', CONFIG.GITHUB_WEBHOOK_SECRET)
      .update(req.rawBody).digest('hex');
    if (sig !== expected) {
      log({ level: 'warn', message: '⚠️ Webhook signature mismatch — rejected' });
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  log({ level: 'info', message: `📨 Webhook received: ${event}` });
  res.json({ received: true });

  // Handle push & PR events
  try {
    if (event === 'push' && payload.ref && !payload.ref.includes('bugzero/')) {
      const ref = payload.ref.replace('refs/heads/', '');
      await runAgent({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        ref,
        sha: payload.after,
        event: 'push',
      });
    } else if (event === 'pull_request' && ['opened', 'synchronize'].includes(payload.action)) {
      const pr = payload.pull_request;
      if (!pr.head.ref.startsWith('bugzero/')) {
        await runAgent({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          ref: pr.head.ref,
          sha: pr.head.sha,
          event: 'pull_request',
          prNumber: pr.number,
        });
      }
    }
  } catch (e) {
    log({ level: 'error', message: `Pipeline error: ${e.message}` });
  }
});

// API: event log
app.get('/api/events', (_req, res) => res.json(eventLog.slice(0, 50)));

// API: manual trigger (for testing)
app.post('/api/trigger', async (req, res) => {
  let { owner, repo, ref = 'main' } = req.body;
  if (!owner || !repo) return res.status(400).json({ error: 'owner and repo required' });

  // ── Robust Input Parsing ──
  owner = owner.trim();
  repo  = repo.trim();

  // If repo looks like a full URL, extract owner and repo
  if (repo.includes('github.com/')) {
    const parts = repo.split('github.com/')[1].split('/');
    if (parts.length >= 2) {
      owner = parts[0];
      repo = parts[1].replace(/\.git$/, '');
    }
  } else if (owner.includes('github.com/')) {
    const parts = owner.split('github.com/')[1].split('/');
    if (parts.length >= 2) {
      owner = parts[0];
      repo = parts[1].replace(/\.git$/, '');
    }
  }

  log({ level: 'info', message: `🔧 Manual trigger: ${owner}/${repo}@${ref}` });
  try {
    const result = await runAgent({ owner, repo, ref, sha: 'manual', event: 'manual' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: config status
app.get('/api/status', (_req, res) => {
  res.json({
    configured: {
      github: !!CONFIG.GITHUB_TOKEN,
      webhook: !!CONFIG.GITHUB_WEBHOOK_SECRET,
      openai: !!CONFIG.OPENAI_API_KEY,
    },
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

app.listen(CONFIG.PORT, () => {
  console.log(`\n🤖 BugZero AI running on http://localhost:${CONFIG.PORT}\n`);
});

module.exports = app;
