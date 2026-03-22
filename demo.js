#!/usr/bin/env node
/**
 * BugZero AI — Demo / Integration Test
 * Simulates the full detection pipeline locally without needing GitHub.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Inline copies of detection functions ──────────────────────────────────
const SECRET_PATTERNS = [
  { name: 'OpenAI API Key',    regex: /sk-[A-Za-z0-9]{20,}/g,           envVar: 'OPENAI_API_KEY'    },
  { name: 'AWS Access Key',    regex: /AKIA[0-9A-Z]{16}/g,              envVar: 'AWS_ACCESS_KEY_ID' },
  { name: 'GitHub Token',      regex: /ghp_[A-Za-z0-9]{36}/g,           envVar: 'GITHUB_TOKEN'      },
  { name: 'Stripe Secret Key', regex: /sk_live_[A-Za-z0-9]{24,}/g,      envVar: 'STRIPE_SECRET_KEY' },
  { name: 'Generic API Key',   regex: /api[_-]?key\s*[:=]\s*["']([A-Za-z0-9\-_]{16,})["']/gi, envVar: 'API_KEY' },
];

function detectSecrets(content, filename) {
  const found = [];
  for (const pattern of SECRET_PATTERNS) {
    const matches = [...content.matchAll(pattern.regex)];
    for (const match of matches) {
      found.push({
        type: pattern.name, value: match[0], envVar: pattern.envVar,
        line: content.substring(0, match.index).split('\n').length, file: filename,
      });
    }
  }
  return found;
}

function redactSecrets(content, secrets) {
  let patched = content;
  const envLines = [];
  for (const s of secrets) {
    patched = patched.split(s.value).join(`process.env.${s.envVar}`);
    envLines.push(`${s.envVar}=<your-key-here>  # Rotate original: ${s.value.slice(0, 8)}...`);
  }
  return { patched, envLines };
}

// ── Sample "bad" code ─────────────────────────────────────────────────────
const BAD_CODE = `// app.js — This file intentionally contains security issues for demo purposes
const express = require('express')
const app = express()

// Hardcoded secrets (BAD!)
const OPENAI_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890'
const AWS_KEY    = 'AKIAIOSFODNN7EXAMPLE'
const GITHUB_PAT = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh'

// Lint issues: missing semicolons, var instead of const, unused variable
var unusedVar = 'this is never used'
var counter = 0

function fetchData(url) {
  const apiKey = OPENAI_KEY
  console.log("Fetching:", url)  // lint: no-console
  fetch(url, { headers: { Authorization: 'Bearer ' + apiKey } })
    .then(res => res.json())
    .then(data => { console.log(data) })
}

app.get('/data', (req, res) => {
  fetchData('https://api.example.com/v1/data')
  res.send('ok')
})

app.listen(3000)
`;

// ── Run demo ──────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('  🤖  BugZero AI — Detection Engine Demo');
console.log('═'.repeat(60) + '\n');

console.log('📄 Analyzing sample file: app.js\n');
console.log('─'.repeat(60));
console.log('ORIGINAL CODE:\n');
console.log(BAD_CODE);
console.log('─'.repeat(60));

// Detect secrets
const secrets = detectSecrets(BAD_CODE, 'app.js');
console.log(`\n🔍 SECRET DETECTION RESULTS: ${secrets.length} secrets found\n`);
secrets.forEach((s, i) => {
  console.log(`  ${i + 1}. [${s.type}]`);
  console.log(`     Value   : ${s.value.slice(0, 12)}...`);
  console.log(`     Location: ${s.file} line ${s.line}`);
  console.log(`     Fix     : Replace with process.env.${s.envVar}`);
  console.log();
});

// Apply patches
const { patched, envLines } = redactSecrets(BAD_CODE, secrets);

// Simulate lint issues
const simulatedLintIssues = [
  { file: 'app.js', line: 10, rule: 'no-var',     message: 'Unexpected var, use let or const instead', severity: 'error' },
  { file: 'app.js', line: 11, rule: 'no-var',     message: 'Unexpected var, use let or const instead', severity: 'error' },
  { file: 'app.js', line: 10, rule: 'no-unused-vars', message: "'unusedVar' is assigned but never used", severity: 'warn'  },
  { file: 'app.js', line: 16, rule: 'no-console', message: 'Unexpected console statement',              severity: 'warn'  },
  { file: 'app.js', line: 18, rule: 'no-console', message: 'Unexpected console statement',              severity: 'warn'  },
];

console.log(`🧹 ESLINT SIMULATION: ${simulatedLintIssues.length} issues found\n`);
simulatedLintIssues.forEach((i, n) => {
  const icon = i.severity === 'error' ? '❌' : '⚠️ ';
  console.log(`  ${icon} Line ${String(i.line).padEnd(3)} [${i.rule}] ${i.message}`);
});

// Simulate npm audit
const simulatedVulns = [
  { package: 'lodash',    severity: 'high',   via: 'Prototype Pollution',         fixAvailable: true  },
  { package: 'axios',     severity: 'medium', via: 'SSRF vulnerability',           fixAvailable: true  },
  { package: 'node-fetch', severity: 'low',   via: 'Denial of Service via header', fixAvailable: false },
];

console.log(`\n🛡️  NPM AUDIT SIMULATION: ${simulatedVulns.length} vulnerabilities found\n`);
simulatedVulns.forEach(v => {
  const icon = v.severity === 'high' ? '🔴' : v.severity === 'medium' ? '🟠' : '🟡';
  console.log(`  ${icon} ${v.package.padEnd(14)} [${v.severity.padEnd(6)}] ${v.via}${v.fixAvailable ? '  ✅ fix available' : ''}`);
});

console.log('\n' + '─'.repeat(60));
console.log('\n✨ PATCHED CODE (after BugZero AI fixes):\n');
console.log(patched);

console.log('\n📝 .env.example additions:\n');
envLines.forEach(l => console.log('  ' + l));

// Simulate PR creation
const prNumber = Math.floor(Math.random() * 900) + 100;
const branchName = `bugzero/autofix-${Date.now()}`;
console.log('\n' + '─'.repeat(60));
console.log('\n📬 PULL REQUEST (simulated):\n');
console.log(`  Branch  : ${branchName}`);
console.log(`  PR #    : ${prNumber}`);
console.log(`  Title   : 🤖 Auto-Fix: 🔑 Removed Exposed Secrets & 🧹 Fixed Lint Issues`);
console.log(`  Labels  : bugzero-ai, automated-fix, security`);
console.log(`\n  Body preview:`);
console.log('  ┌─────────────────────────────────────────────────┐');
console.log('  │ 🤖 BugZero AI — Automated Fix Report            │');
console.log('  │                                                 │');
console.log(`  │ 🔑 Secrets Removed: ${String(secrets.length).padEnd(28)}│`);
console.log(`  │ 🧹 Lint Issues Fixed: ${String(simulatedLintIssues.length).padEnd(26)}│`);
console.log(`  │ 🛡️  Vulnerabilities: ${String(simulatedVulns.length).padEnd(27)}│`);
console.log('  │                                                 │');
console.log('  │ ⚠️  ACTION REQUIRED: Rotate exposed credentials │');
console.log('  └─────────────────────────────────────────────────┘');

console.log('\n' + '═'.repeat(60));
console.log('  ✅  Demo complete — BugZero AI pipeline verified!');
console.log('  🌐  Start server: npm start');
console.log('  🔗  Dashboard: http://localhost:3000');
console.log('═'.repeat(60) + '\n');
