// Embed de resultado (ou de duplicado/falha) no canal #sentry-ai-triage (dry run: canal de teste).
import { existsSync, readFileSync } from 'node:fs';

const webhook = process.env.DISCORD_WEBHOOK_URL ?? '';
const app = process.env.TRIAGE_APP ?? '';
const severity = process.env.TRIAGE_SEVERITY ?? 'P1';
const webUrl = process.env.TRIAGE_WEB_URL ?? '';
const runUrl = process.env.RUN_URL ?? '';
const skipReason = process.env.SKIP_REASON ?? '';
const failed = process.env.TRIAGE_FAILED === 'true';
const file = process.argv[2] ?? 'triage-result.json';

const COLORS = { P0: 0xe53935, P1: 0xfb8c00, P2: 0x1e88e5, grey: 0x9e9e9e };
const clip = (value, limit) => (String(value ?? '').length > limit ? `${String(value).slice(0, limit - 1)}…` : String(value ?? ''));

const field = (name, value, inline = true) => (value ? [{ name, value: clip(value, 1024), inline }] : []);

const build = () => {
  if (skipReason) {
    return { title: `[${severity}] ${app} · triagem ignorada`, color: COLORS.grey, description: skipReason, fields: [...field('Sentry', webUrl, false), ...field('Run', runUrl, false)] };
  }
  if (failed || !existsSync(file)) {
    return { title: `[${severity}] ${app} · triagem falhou`, color: COLORS[severity] ?? COLORS.grey, description: 'O agente não produziu um triage-result.json válido. Veja o run.', fields: [...field('Sentry', webUrl, false), ...field('Run', runUrl, false)] };
  }
  const result = JSON.parse(readFileSync(file, 'utf8'));
  const prValue = result.pr?.created ? result.pr.url : `sem PR: ${result.pr?.no_pr_reason ?? 'critérios não atendidos'}`;
  const impact = [
    result.impact?.platforms?.length ? `plataformas: ${result.impact.platforms.join(', ')}` : '',
    result.impact?.account_types?.length ? `contas: ${result.impact.account_types.join(', ')}` : '',
    result.impact?.flows?.length ? `fluxos: ${result.impact.flows.join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  return {
    title: clip(`[${result.severity}] ${result.summary}`, 256),
    url: webUrl || undefined,
    color: COLORS[result.severity] ?? COLORS.grey,
    description: clip(result.root_cause, 4000),
    fields: [
      ...field('App / plataforma', `${result.app} / ${result.platform}`),
      ...field('Confiança', `${result.confidence}${result.frames_mapped === false ? ' (frames não mapeados)' : ''}`),
      ...field('Checks', result.checks ? Object.entries(result.checks).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''),
      ...field('Impacto', impact, false),
      ...field('Arquivos', (result.affected_files ?? []).map((f) => `${f.path}${f.lines ? `:${f.lines}` : ''}`).join('\n'), false),
      ...field('PR', prValue, false),
      ...field('Run', runUrl, false),
    ],
  };
};

if (!webhook) {
  console.log('DISCORD_WEBHOOK_URL ausente; nada a postar');
  process.exit(0);
}

const response = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ embeds: [build()], allowed_mentions: { parse: [] } }),
});

if (!response.ok) {
  console.error(`::warning::Discord falhou (${response.status}): ${await response.text()}`);
  process.exit(0);
}
console.log('embed publicado no Discord');
