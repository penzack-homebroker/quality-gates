// Valida triage-result.json contra triage-result.schema.json (subconjunto: type, enum, required,
// maxLength, additionalProperties, items). Sem dependências para rodar em qualquer runner.
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, 'triage-result.schema.json'), 'utf8'));
const file = process.argv[2] ?? 'triage-result.json';

const typeOf = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  return typeof value;
};

const matchesType = (value, type) => {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
};

const validate = (value, node, path, errors) => {
  if (node.enum && !node.enum.includes(value)) {
    errors.push(`${path}: esperado um de ${node.enum.join('|')}, veio ${JSON.stringify(value)}`);
    return;
  }
  if (node.type && !matchesType(value, node.type)) {
    errors.push(`${path}: esperado ${node.type}, veio ${typeOf(value)}`);
    return;
  }
  if (node.type === 'string' && node.maxLength !== undefined && value.length > node.maxLength) {
    errors.push(`${path}: ${value.length} chars (máx. ${node.maxLength})`);
  }
  if (node.type === 'array' && node.items) {
    value.forEach((item, index) => validate(item, node.items, `${path}[${index}]`, errors));
  }
  if (node.type === 'object') validateObject(value, node, path, errors);
};

const validateObject = (value, node, path, errors) => {
  for (const key of node.required ?? []) {
    if (!(key in value)) errors.push(`${path}.${key}: obrigatório`);
  }
  for (const [key, child] of Object.entries(value)) {
    const childNode = node.properties?.[key];
    if (!childNode) {
      if (node.additionalProperties === false) errors.push(`${path}.${key}: chave não prevista`);
      continue;
    }
    validate(child, childNode, `${path}.${key}`, errors);
  }
};

let result;
try {
  result = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`::error::${file} ausente ou inválido: ${error.message}`);
  process.exit(1);
}

const errors = [];
validate(result, schema, '$', errors);

if (errors.length > 0) {
  for (const message of errors) console.error(`::error::${message}`);
  process.exit(1);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `confidence=${result.confidence}\npr_created=${result.pr.created}\npr_url=${result.pr.url ?? ''}\n`
  );
}
console.log(`triage-result.json ok · confidence=${result.confidence} · pr=${result.pr.created ? result.pr.url : 'no'}`);
