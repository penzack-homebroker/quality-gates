// Evita runs duplicados: branch fix/sentry-<id>-* já publicada ou comentário [sentry-triage] no issue.
// Falhas de rede não bloqueiam (skip=false): preferimos um run a mais a um erro silencioso.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const issueId = process.env.ISSUE_ID ?? '';
const org = process.env.SENTRY_ORG ?? 'penzack';
const token = process.env.SENTRY_ACCESS_TOKEN ?? '';

const output = (skip, reason) => {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `skip=${skip}\nreason=${reason}\n`);
  }
  console.log(`skip=${skip}${reason ? ` (${reason})` : ''}`);
};

const hasBranch = () => {
  try {
    const refs = execFileSync('git', ['ls-remote', '--heads', 'origin', `fix/sentry-${issueId}-*`], {
      encoding: 'utf8',
    });
    return refs.trim().length > 0;
  } catch {
    return false;
  }
};

const hasComment = async () => {
  if (!token) return false;
  try {
    const response = await fetch(
      `https://sentry.io/api/0/organizations/${org}/issues/${issueId}/comments/`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) return false;
    const notes = await response.json();
    return Array.isArray(notes) && notes.some((note) => String(note?.data?.text ?? '').includes('[sentry-triage]'));
  } catch {
    return false;
  }
};

if (!issueId) {
  output(true, 'issue_id ausente');
} else if (hasBranch()) {
  output(true, `branch fix/sentry-${issueId}-* já existe`);
} else if (await hasComment()) {
  output(true, 'issue já tem comentário [sentry-triage]');
} else {
  output(false, '');
}
