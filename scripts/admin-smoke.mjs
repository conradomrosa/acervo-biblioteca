import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.env.ADMIN_BASE_URL || 'http://localhost:8801';
const persistTo = process.env.ADMIN_PERSIST_TO;
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const suffix = Date.now().toString();
const title = `Pesquisa administrativa ${suffix}`;
const author = `Autor administrativo ${suffix}`;
const isbn = `ISBN-${suffix}`;
const category = `Admin ${suffix}`;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = command => JSON.parse(execFileSync('./node_modules/.bin/wrangler', ['d1', 'execute', 'ichrysostom', '--local', ...(persistTo ? ['--persist-to', persistTo] : []), '--command', command, '--json'], { encoding: 'utf8' }))[0]?.results || [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const csrfOf = html => html.match(/name="csrf" value="([^"]+)"/)?.[1];
const cookieOf = response => response.headers.get('set-cookie')?.split(';', 1)[0];
const login = async (username, password) => { const response = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ username, password }), redirect: 'manual' }); return { response, cookie: cookieOf(response) }; };
const postForm = async (url, cookie, values) => fetch(`${base}${url}`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams(values), redirect: 'manual' });

sql(`INSERT INTO categories(name) VALUES(${quote(category)}); INSERT INTO books(title,author,isbn,category_id) VALUES(${quote(title)},${quote(author)},${quote(isbn)},(SELECT id FROM categories WHERE name=${quote(category)})),(${quote(`Arquivado ${suffix}`)},'Autor arquivado','ISBN-ARQ-${suffix}',(SELECT id FROM categories WHERE name=${quote(category)})); UPDATE books SET archived=1 WHERE title=${quote(`Arquivado ${suffix}`)}`);

let auth = await login(vars.ADMIN_USERNAME, vars.ADMIN_PASSWORD);
assert(auth.response.status === 303 && auth.cookie, 'login administrativo falhou');
let response = await fetch(`${base}/admin`, { headers: { Cookie: auth.cookie } });
let html = await response.text();
assert(response.status === 200 && html.includes('Painel administrativo') && html.includes('Exportar catálogo'), 'painel não carregou os indicadores e atalhos');

for (const query of [title, author, isbn, `Arquivado ${suffix}`]) {
  response = await fetch(`${base}/admin/livros?q=${encodeURIComponent(query)}`, { headers: { Cookie: auth.cookie } });
  html = await response.text();
  assert(response.status === 200 && html.includes(query), `pesquisa não encontrou ${query}`);
}

response = await fetch(`${base}/admin/livros.csv`, { headers: { Cookie: auth.cookie } });
const csv = await response.text();
assert(response.status === 200 && response.headers.get('content-type')?.includes('text/csv'), 'CSV não foi exportado');
assert(csv.includes('Título') && csv.includes(title) && csv.includes(author) && csv.includes('Exemplares disponíveis'), 'CSV não contém os campos esperados');
response = await fetch(`${base}/admin/livros.csv`, { redirect: 'manual' });
assert(response.status === 303, 'CSV ficou acessível sem autenticação');

response = await fetch(`${base}/admin/acessos`, { headers: { Cookie: auth.cookie } });
html = await response.text();
assert(response.status === 200 && html.includes('Histórico de acessos') && html.includes(vars.ADMIN_USERNAME) && html.includes('Sucesso'), 'histórico de acessos não foi registrado ou exibido');

response = await fetch(`${base}/admin/seguranca/senha`, { headers: { Cookie: auth.cookie } });
html = await response.text();
const csrf = csrfOf(html);
assert(response.status === 200 && csrf, 'formulário de senha não carregou');
response = await postForm('/admin/seguranca/senha', auth.cookie, { csrf, current_password: 'senha-incorreta', new_password: 'Senha temporaria 2026!', confirm_password: 'Senha temporaria 2026!' });
assert(response.status === 400, 'senha atual incorreta foi aceita');
response = await postForm('/admin/seguranca/senha', auth.cookie, { csrf, current_password: vars.ADMIN_PASSWORD, new_password: 'Senha temporaria 2026!', confirm_password: 'Outra senha 2026!' });
assert(response.status === 400, 'confirmação divergente foi aceita');
response = await postForm('/admin/seguranca/senha', auth.cookie, { csrf, current_password: vars.ADMIN_PASSWORD, new_password: 'Senha temporaria 2026!', confirm_password: 'Senha temporaria 2026!' });
assert(response.status === 303, 'alteração de senha falhou');
auth = await login(vars.ADMIN_USERNAME, 'Senha temporaria 2026!');
assert(auth.response.status === 303 && auth.cookie, 'nova senha não autenticou');
response = await fetch(`${base}/admin`, { headers: { Cookie: auth.cookie } });
assert(response.status === 200, 'sessão após troca de senha não funciona');
html = await (await fetch(`${base}/admin/seguranca/senha`, { headers: { Cookie: auth.cookie } })).text();
await postForm('/admin/seguranca/senha', auth.cookie, { csrf: csrfOf(html), current_password: 'Senha temporaria 2026!', new_password: vars.ADMIN_PASSWORD, confirm_password: vars.ADMIN_PASSWORD });
console.log('admin-smoke: painel, pesquisa, CSV, histórico de acessos e alteração de senha passaram');
