import sonarjs from 'eslint-plugin-sonarjs';

/**
 * Threshold único da org para complexidade cognitiva.
 * Mudou aqui → mudou em todos os projetos no próximo bump da dependência.
 */
export const COGNITIVE_COMPLEXITY_MAX = 10;

/**
 * Bloco seguro para qualquer projeto (JS ou TS, qualquer framework):
 * registra apenas o plugin sonarjs, que este pacote traz como dependência.
 */
export const base = {
  name: '@penzack/quality-gates/base',
  plugins: { sonarjs },
  rules: {
    'sonarjs/cognitive-complexity': ['error', COGNITIVE_COMPLEXITY_MAX],
  },
};

/**
 * Regras @typescript-eslint escopadas a ts/tsx.
 *
 * IMPORTANTE: este bloco NÃO registra o plugin @typescript-eslint — o preset
 * do framework do projeto consumidor (eslint-config-next, etc.) deve registrá-lo.
 * Registrar uma segunda instância do mesmo plugin é ConfigError no ESLint 9.
 * Projetos sem preset devem registrar `typescript-eslint` por conta própria
 * antes de aplicar este bloco.
 */
export const typescriptRules = {
  name: '@penzack/quality-gates/typescript-rules',
  files: ['**/*.ts', '**/*.tsx'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: ['typeAlias'],
        format: ['StrictPascalCase'],
        suffix: ['Type', 'Props'],
      },
    ],
  },
};

export default [base, typescriptRules];
