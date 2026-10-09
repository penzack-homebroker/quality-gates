// PR `fix/sentry-<id>-*` mergeado → issue resolvido no Sentry (na próxima release) + nota com o link do PR.
const headRef = process.env.HEAD_REF ?? '';
const prUrl = process.env.PR_URL ?? '';
const org = process.env.SENTRY_ORG ?? 'penzack';
const token = process.env.SENTRY_ACCESS_TOKEN ?? '';

const issueId = /^fix\/sentry-(\d+)-/.exec(headRef)?.[1];
if (!issueId) {
  console.log(`branch ${headRef} não é fix/sentry-<id>-*; nada a fazer`);
  process.exit(0);
}

const base = `https://sentry.io/api/0/organizations/${org}/issues/${issueId}/`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const update = (body) => fetch(base, { method: 'PUT', headers, body: JSON.stringify(body) });

let response = await update({ status: 'resolved', statusDetails: { inNextRelease: true } });
if (!response.ok) response = await update({ status: 'resolved' });
if (!response.ok) {
  console.error(`::warning::não foi possível resolver o issue ${issueId} (${response.status}): ${await response.text()}`);
  process.exit(0);
}

const note = await fetch(`${base}comments/`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ text: `[sentry-triage] Corrigido pelo PR ${prUrl} (merge em ${process.env.BASE_REF ?? 'develop'}). Resolvido na próxima release.` }),
});
if (!note.ok) console.error(`::warning::nota no issue ${issueId} falhou (${note.status})`);
console.log(`issue ${issueId} resolvido (PR ${prUrl})`);
