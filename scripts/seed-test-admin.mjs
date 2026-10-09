import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const persistTo = process.env.SECURITY_PERSIST_TO || '.wrangler/security-state';
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').filter((line) => line && !line.startsWith('#')).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
if (!vars.ADMIN_USERNAME || !vars.ADMIN_PASSWORD) throw new Error('Credenciais administrativas locais ausentes.');
const salt = randomBytes(16);
const hash = pbkdf2Sync(vars.ADMIN_PASSWORD, salt, 150000, 32, 'sha256');
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const stored = `pbkdf2$150000$${salt.toString('base64url')}$${hash.toString('base64url')}`;
const first = `INSERT INTO librarians(name,username,password_hash) VALUES(${quote(vars.ADMIN_NAME || 'Bibliotecário')},${quote(vars.ADMIN_USERNAME)},${quote(stored)}) ON CONFLICT(username) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,active=1;`;
const second = `INSERT INTO librarians(name,username,password_hash) VALUES('Conta isolada de teste',${quote(`${vars.ADMIN_USERNAME}-second`)},${quote(stored)}) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,active=1;`;
const sql = first + second;
execFileSync('./node_modules/.bin/wrangler', ['d1', 'execute', 'ichrysostom', '--local', '--persist-to', persistTo, '--command', sql], { stdio: ['ignore', 'ignore', 'ignore'] });
