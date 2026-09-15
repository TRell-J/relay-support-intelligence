#!/usr/bin/env node
/**
 * Branding and integrity gate.
 *
 * Fails the build if the repository contains a reference to a real employer, a
 * claim of a live third-party integration, or an obvious secret. See CLAUDE.md
 * rules 1 and 3 and ADR D-014.
 *
 * Usage: node scripts/check-branding.mjs [--verbose]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const VERBOSE = process.argv.includes('--verbose');

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  'coverage',
  'playwright-report',
  'test-results',
  'public',
]);

const SCAN_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.md',
  '.json',
  '.css',
  '.html',
  '.txt',
  '.yml',
  '.yaml',
]);

/** This file necessarily contains the forbidden terms it searches for. */
const SELF = join('scripts', 'check-branding.mjs');

/**
 * Real-employer references. The repository must be portable to any application
 * without edits, so no employer name may appear anywhere inside it.
 */
const EMPLOYER_TERMS = [
  'netflix',
  'nflx',
  'n-tech',
  'ntech',
];

/**
 * Phrases that would assert a live third-party connection this prototype does
 * not have. The product may say "Slack-style"; it may never say "connected to
 * Slack". Checked case-insensitively.
 *
 * Deliberately does not try to understand negation. A denial ("not connected to
 * Slack") trips this too, and the fix is to reword the denial — a
 * negation-aware pattern would eventually let a real claim through, which is
 * the failure that actually matters.
 */
const FALSE_INTEGRATION_PATTERNS = [
  /connected to (slack|zendesk|jira)/i,
  /(slack|zendesk|jira) integration is (live|active|enabled|connected)/i,
  /synced (with|to) (slack|zendesk|jira)/i,
  /live (slack|zendesk|jira) (data|feed|sync)/i,
  /fetch(ing|ed)? from (slack|zendesk|jira)/i,
];

/** Obvious credential shapes. Not a substitute for real secret scanning. */
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{16,}/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
  /ANTHROPIC_API_KEY\s*=\s*['"][^'"\s]+['"]/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    const dot = entry.lastIndexOf('.');
    if (dot !== -1 && SCAN_EXT.has(entry.slice(dot))) out.push(full);
  }
  return out;
}

const violations = [];
const files = walk(ROOT);

for (const file of files) {
  const rel = relative(ROOT, file);
  if (rel === SELF || rel.split(sep).join('/') === 'scripts/check-branding.mjs') continue;
  if (rel === 'package-lock.json') continue;

  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, i) => {
    const lower = line.toLowerCase();

    for (const term of EMPLOYER_TERMS) {
      if (lower.includes(term)) {
        violations.push({ rel, line: i + 1, kind: 'employer reference', detail: term, text: line.trim() });
      }
    }
    for (const re of FALSE_INTEGRATION_PATTERNS) {
      if (re.test(line)) {
        violations.push({ rel, line: i + 1, kind: 'false integration claim', detail: String(re), text: line.trim() });
      }
    }
    for (const re of SECRET_PATTERNS) {
      if (re.test(line)) {
        violations.push({ rel, line: i + 1, kind: 'possible secret', detail: String(re), text: '[redacted]' });
      }
    }
  });
}

if (VERBOSE) console.log(`Scanned ${files.length} files.`);

if (violations.length > 0) {
  console.error(`\n  Branding gate FAILED - ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}  [${v.kind}: ${v.detail}]`);
    console.error(`    ${v.text.slice(0, 140)}`);
  }
  console.error('\nSee CLAUDE.md rules 1 and 3.\n');
  process.exit(1);
}

console.log(`Branding gate passed (${files.length} files scanned).`);
