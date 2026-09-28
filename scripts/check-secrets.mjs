// Fails when a Stripe API key or webhook signing secret appears in a tracked file.
// Committed keys are the leading cause of Stripe key takeovers; keys belong in AWS Secrets Manager.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  { name: 'Stripe live key', re: /\b[sr]k_live_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe test key', re: /\b[sr]k_test_[A-Za-z0-9]{16,}/ },
  { name: 'Stripe webhook secret', re: /\bwhsec_[A-Za-z0-9]{16,}/ },
];

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  if (text.includes('\0')) continue; // binary
  text.split('\n').forEach((line, i) => {
    for (const p of PATTERNS) if (p.re.test(line)) findings.push(`${file}:${i + 1}: ${p.name}`);
  });
}

if (findings.length) {
  console.error('Secrets found in the repository. Remove them, roll the keys in the Stripe Dashboard, and use Secrets Manager:\n  ' + findings.join('\n  '));
  process.exit(1);
}
console.log('No secrets found');
