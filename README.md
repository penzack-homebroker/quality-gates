# @penzack/quality-gates

Validações de qualidade de código compartilhadas entre os projetos frontend da Penzack. Um único repositório concentra três coisas:

1. **Config ESLint compartilhada** (`eslint/index.mjs`) — complexidade cognitiva, proibição de `any`, convenção de nomes de tipos. Instalada nos projetos como dependência git (sem registry npm).
2. **Configs base de jscpd e knip** (`configs/`) — ponto de partida padronizado para duplicação e código morto.
3. **Workflow reutilizável de CI** (`.github/workflows/quality-gate.yml`) — o pipeline typecheck → lint → dup → knip → test que os projetos chamam com 5 linhas.

Referência de implantação completa: HomeBroker FrontEnd (primeiro projeto a adotar — veja a seção *Quality Gates* do README de lá).

## Triagem de erros do Sentry por IA (`sentry-triage.yml`)

Workflow reutilizável disparado pelo relay [`sentry-ops`](https://github.com/penzack-homebroker/sentry-ops)
(`repository_dispatch: sentry-triage`) ou à mão. Roda o
[`claude-code-action`](https://github.com/anthropics/claude-code-action) com o Sentry MCP no
repositório do app: lê o issue, analisa o código, grava `triage-result.json` (schema em
`scripts/sentry-triage/triage-result.schema.json`) e passos determinísticos publicam o diagnóstico
como comentário no issue e em `#sentry-ai-triage`. PR rascunho `fix/sentry-<id>-<slug>` só quando a
correção é pequena e a confiança é alta.

```yaml
# .github/workflows/sentry-triage.yml no app
on:
  repository_dispatch: { types: [sentry-triage] }
  workflow_dispatch: { inputs: { issue_id: { required: true, type: string }, dry_run: { type: boolean, default: true } } }
concurrency: { group: sentry-triage-${{ github.event.client_payload.issue_id || inputs.issue_id }}, cancel-in-progress: false }
permissions: { contents: write, pull-requests: write, issues: write, id-token: write }
jobs:
  triage:
    uses: penzack-homebroker/quality-gates/.github/workflows/sentry-triage.yml@v0.5.0
    with: { app: trader, default_branch: develop, sentry_project: homebroker-frontend, issue_id: ${{ github.event.client_payload.issue_id || inputs.issue_id }}, dry_run: ${{ inputs.dry_run || false }} }
    secrets: { ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}, SENTRY_ACCESS_TOKEN: ${{ secrets.SENTRY_ACCESS_TOKEN }}, DISCORD_WEBHOOK_AI: ${{ secrets.DISCORD_WEBHOOK_AI }}, DISCORD_WEBHOOK_TEST: ${{ secrets.DISCORD_WEBHOOK_TEST }}, NPM_TOKEN: ${{ secrets.NPM_TOKEN }} }
```

Guardas: `concurrency` por issue, `already-triaged.mjs` (branch ou comentário `[sentry-triage]`
existentes), `--max-turns`, `timeout-minutes: 25`, lista fechada de ferramentas (sem `gh pr create`
em dry run). Segredos do Discord e do Sentry só aparecem nos passos determinísticos; o agente só vê
o token do Sentry dentro do processo do MCP.

## Os gates

| Gate | Ferramenta | Regra |
| --- | --- | --- |
| Type check | `tsc --noEmit` | Zero erros de tipo, incluindo specs |
| Complexidade cognitiva | `eslint-plugin-sonarjs` | Máx. **10** por função |
| `any` explícito | `@typescript-eslint/no-explicit-any` | Erro (legado vai para o baseline) |
| Duplicação | `jscpd` | Threshold por projeto (ratchet — só desce; alvo 3%) |
| Código morto | `knip` | Dependência nova sem uso falha; arquivos órfãos em report não-bloqueante |
| Testes | Vitest | Suíte completa verde |
| Título de PR | CI | Prefixo `test\|fix\|feat\|chore\|refactor\|sync\|deploy\|hotfix` (case-insensitive) |

**Filosofia baseline + ratchet:** ao adotar, as violações existentes são congeladas (`eslint-suppressions.json`, `ignoreDependencies` do knip, threshold do jscpd calibrado logo acima do nível atual). Código novo é julgado pela régua cheia; a dívida só pode diminuir. **Nunca adicione supressões manualmente.**

## Adoção em um projeto

### 1. Instalar (dependência git, sem registry)

```bash
yarn add -D "@penzack/quality-gates@git+https://github.com/penzack-homebroker/quality-gates.git#v0.4.0" eslint-plugin-sonarjs jscpd knip
```

> Fixe sempre numa tag (`#v0.4.0`) — atualizar a régua da org = bump da tag no projeto.

> **Por que HTTPS e não SSH:** este repositório é público — não há nada sigiloso nele (regras de lint e YAML de CI) — então o clone via HTTPS funciona sem credencial em qualquer runner: GitHub Actions, Vercel, Netlify, máquina de dev. Com URL SSH ou repositório privado, cada plataforma de build passaria a exigir credencial própria (a Vercel, por exemplo, não lê secrets do GitHub Actions).

### 2. ESLint (flat config, ESLint ≥ 9.24)

```js
// eslint.config.mjs
import penzackQuality from '@penzack/quality-gates';

export default defineConfig([
  // ...preset do framework (eslint-config-next etc.) e configs do projeto...
  ...penzackQuality,
]);
```

O pacote exporta dois blocos: `base` (plugin sonarjs + complexidade — seguro em qualquer projeto) e `typescriptRules` (regras `@typescript-eslint/*` escopadas a `ts/tsx` — **exige** que o preset do framework já registre o plugin `@typescript-eslint`; registrar duas instâncias é `ConfigError` no ESLint 9). O default export aplica os dois.

Gere o baseline das violações existentes e commite:

```bash
yarn eslint . --suppress-all
```

### 3. jscpd

Copie `configs/jscpd.base.json` para `.jscpd.json` na raiz do projeto. Meça o nível atual (`yarn dup`) e calibre o `threshold` logo **acima** dele — esse é o teto do ratchet; aperte conforme a dívida cair.

### 4. knip

Copie `configs/knip.base.jsonc` para `knip.jsonc` e ajuste os entry points. Rode `npx knip`, triage o resultado e congele as deps sem uso em `ignoreDependencies` (com comentário explicando cada uma).

### 5. Scripts no `package.json`

```json
"lint": "eslint .",
"lint:prune-baseline": "eslint . --prune-suppressions",
"typecheck": "tsc --noEmit",
"dup": "jscpd",
"knip": "knip --include dependencies",
"knip:full": "knip"
```

### 6. CI (workflow reutilizável)

```yaml
# .github/workflows/quality.yml
name: 🚀 Quality Gate

on:
  pull_request:
    types: [opened, synchronize, reopened, edited]
    branches: [develop, main]

jobs:
  quality:
    uses: penzack-homebroker/quality-gates/.github/workflows/quality-gate.yml@v0.4.0
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Inputs opcionais: `node-version-file` (padrão `.nvmrc`), `pr-title-pattern`, `timezone`, e flags `run-pr-title` (desligue quando o projeto tem validador de título próprio) / `run-typecheck` / `run-dup` / `run-knip` / `run-tests` para desligar gates que o projeto ainda não adotou.

**Pacote privado `@penzack-homebroker/platform-kit` (GitHub Packages):** o projeto versiona um `.npmrc` com `@penzack-homebroker:registry=https://npm.pkg.github.com` e `//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`. O job exporta `NPM_TOKEN` para todos os passos (o Yarn 1 interpola o `.npmrc` em qualquer comando) usando, nesta ordem: o secret `NPM_TOKEN` do repositório, se existir, ou o `GITHUB_TOKEN` do próprio workflow. Para o `GITHUB_TOKEN` bastar, conceda acesso de leitura ao repositório em *Packages → platform-kit → Package settings → Manage Actions access*; caso contrário cadastre o secret `NPM_TOKEN` com um PAT clássico `read:packages` + `repo`. Projetos sem o pacote não precisam de nada.

### 7. Required status checks (rulesets)

O workflow reutilizável publica **dois** checks. Se o repositório exige status checks (Settings → Rules → Rulesets), registre exatamente estes contextos, pelo app *GitHub Actions*:

```
quality / 🏷️ PR Title
quality / ✅ Typecheck, Lint, Duplication, Dead Code & Tests
```

O prefixo `quality` é o **id do job no workflow do projeto** (`jobs.quality`), e o restante é o `name:` de cada job aqui. Ao adotar, remova das regras o check do workflow antigo que foi substituído — um contexto exigido que ninguém mais reporta deixa todo PR travado em *"Expected — Waiting for status to be reported"*.

> **Cuidado ao renomear:** mudar o `name:` dos jobs deste repositório altera esses contextos e quebra em silêncio o ruleset de cada projeto que os exige. Trate-os como contrato público — renomear exige avisar os adotantes e atualizar as regras junto.

## Governança

- **Mudar a régua da org** (threshold de complexidade, regras novas): PR aqui + release de tag nova. Projetos adotam no seu ritmo, via bump da tag.
- **Versionamento:** tags semânticas (`v0.4.0`). Regra nova ou threshold mais apertado = minor; correção = patch.
- **Baselines são por projeto** e vivem em cada repo — este repositório define a régua, não a dívida de cada um.
