// Preenche PROMPT.md com as variáveis TRIAGE_* e expõe o texto como output `prompt` do step.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, 'PROMPT.md'), 'utf8');

const values = {
  app: process.env.TRIAGE_APP ?? '',
  repo: process.env.TRIAGE_REPO ?? '',
  default_branch: process.env.TRIAGE_DEFAULT_BRANCH ?? 'main',
  issue_id: process.env.TRIAGE_ISSUE_ID ?? '',
  severity: process.env.TRIAGE_SEVERITY ?? 'P1',
  platform: process.env.TRIAGE_PLATFORM || 'unknown',
  environment: process.env.TRIAGE_ENVIRONMENT || 'production',
  release: process.env.TRIAGE_RELEASE || 'unknown',
  web_url: process.env.TRIAGE_WEB_URL || `https://${process.env.TRIAGE_SENTRY_ORG ?? 'penzack'}.sentry.io/issues/${process.env.TRIAGE_ISSUE_ID ?? ''}/`,
  title: process.env.TRIAGE_TITLE || '(sem título)',
  dry_run: process.env.TRIAGE_DRY_RUN === 'true' ? 'true' : 'false',
  sentry_org: process.env.TRIAGE_SENTRY_ORG ?? 'penzack',
  sentry_project: process.env.TRIAGE_SENTRY_PROJECT ?? '',
};

const prompt = template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? '');

writeFileSync('/tmp/prompt.md', prompt);

if (process.env.GITHUB_OUTPUT) {
  const delimiter = `PROMPT_${Date.now()}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `prompt<<${delimiter}\n${prompt}\n${delimiter}\n`);
}

console.log(`prompt built (${prompt.length} chars) for issue ${values.issue_id}`);
