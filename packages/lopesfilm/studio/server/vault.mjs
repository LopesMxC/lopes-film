// @ts-check
/**
 * Chaves de API cifradas em disco (AES-256-GCM). A chave-mestra fica em ~/.lopesfilm/.vault-key (0600), criada na
 * primeira vez; o providers.json guarda `enc1:<iv>.<tag>.<texto>` em base64 no lugar da chave em claro. Uma chave em
 * claro (de um arquivo antigo) continua lida como está e é cifrada na próxima gravação.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { studioHome } from './projects.mjs';

const PREFIX = 'enc1:';

/** @param {string} [file] */
function masterKey(file = join(studioHome(), '.vault-key')) {
  if (existsSync(file)) { const b = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64'); if (b.length === 32) return b; }
  const key = randomBytes(32);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${key.toString('base64')}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* o sistema não tem modos */ }
  return key;
}

/** @param {string} text @param {Buffer} [key] */
export function seal(text, key = masterKey()) {
  if (!text || text.startsWith(PREFIX)) return text;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return `${PREFIX}${[iv, c.getAuthTag(), body].map((b) => b.toString('base64')).join('.')}`;
}

/** A cifra aberta; o que não é cifra (ou não abre) volta como está. @param {string} text @param {Buffer} [key] */
export function open(text, key) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return text;
  try {
    const [iv, tag, body] = text.slice(PREFIX.length).split('.').map((p) => Buffer.from(p, 'base64'));
    const d = createDecipheriv('aes-256-gcm', key ?? masterKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString('utf8');
  } catch { return ''; }
}
