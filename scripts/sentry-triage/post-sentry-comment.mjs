// Publica o diagnóstico como nota no issue (GroupNotesEndpoint). O marcador [sentry-triage] é o que
// already-triaged.mjs procura para não repetir a triagem.
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'triage-result.json';
const result = JSON.parse(readFileSync(file, 'utf8'));
const org = process.env.SENTRY_ORG ?? 'penzack';
const token = process.env.SENTRY_ACCESS_TOKEN ?? '';
const runUrl = process.env.RUN_URL ?? '';

const DIFF_LIMIT = 8000;
const diff = result.proposed_diff ? `\n\n**Patch proposto**\n\n\`\`\`diff\n${String(result.proposed_diff).slice(0, DIFF_LIMIT)}\n\`\`\`` : '';
const pr = result.pr?.created
  ? `\n\n**PR ${result.pr.state === 'ready' ? 'pronto para revisão' : 'rascunho'}:** ${result.pr.url}`
  : `\n\n**Sem PR:** ${result.pr?.no_pr_reason ?? 'critérios não atendidos'}`;

const text = `[sentry-triage] ${result.severity} · confiança ${result.confidence}\n\n${result.diagnosis_md}${diff}${pr}\n\n_Run: ${runUrl}_`;

const response = await fetch(`https://sentry.io/api/0/organizations/${org}/issues/${result.issue_id}/comments/`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text }),
});

if (!response.ok) {
  console.error(`::warning::comentário no Sentry falhou (${response.status}): ${await response.text()}`);
  process.exit(0);
}
console.log(`comentário publicado no issue ${result.issue_id}`);
