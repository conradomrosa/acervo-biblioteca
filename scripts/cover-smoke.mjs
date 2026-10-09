import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.env.COVER_BASE_URL || 'http://localhost:8799';
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const suffix = Date.now().toString();
const title = `Capa por URL ${suffix}`;
const author = `Autor URL ${suffix}`;
const category = `Capas URL ${suffix}`;
const firstUrl = 'https://www.gstatic.com/webp/gallery/1.sm.webp';
const secondUrl = 'https://www.gstatic.com/webp/gallery/2.sm.webp';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = command => JSON.parse(execFileSync('./node_modules/.bin/wrangler', ['d1', 'execute', 'ichrysostom', '--local', '--command', command, '--json'], { encoding: 'utf8' }))[0]?.results || [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const csrfOf = html => html.match(/name="csrf" value="([^"]+)"/)?.[1];
const cookieOf = response => response.headers.get('set-cookie')?.split(';', 1)[0];

sql(`INSERT INTO categories(name) VALUES(${quote(category)})`);
const categoryId = sql(`SELECT id FROM categories WHERE name=${quote(category)}`)[0]?.id;
let response = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ username: vars.ADMIN_USERNAME, password: vars.ADMIN_PASSWORD }), redirect: 'manual' });
assert(response.status === 303, 'login inválido');
const cookie = cookieOf(response);
assert(cookie, 'sessão ausente');

let html = await (await fetch(`${base}/admin/livros/novo`, { headers: { Cookie: cookie } })).text();
const csrf = csrfOf(html);
assert(csrf && categoryId, 'formulário de livro não possui CSRF ou categoria');
assert(!html.includes('type="file"') && html.includes('name="cover_url"'), 'upload antigo ainda aparece no formulário');

response = await fetch(`${base}/admin/livros`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ csrf, title, author, category_id: categoryId, cover_url: firstUrl }), redirect: 'manual' });
assert(response.status === 303, 'cadastro por URL falhou');
const book = sql(`SELECT id,title,author,cover_url,cover_image_id FROM books WHERE title=${quote(title)}`)[0];
assert(book?.cover_url === firstUrl && book.cover_image_id === null, 'URL não foi persistida exclusivamente em cover_url');

html = await (await fetch(`${base}/`)).text();
assert(html.includes(`src="${firstUrl}"`) && html.includes('referrerpolicy="no-referrer"'), 'capa não apareceu no catálogo');
const detail = await (await fetch(`${base}/livros/${book.id}`)).text();
assert(detail.includes(`src="${firstUrl}"`), 'capa não apareceu nos detalhes');

html = await (await fetch(`${base}/admin/livros/${book.id}/editar`, { headers: { Cookie: cookie } })).text();
const editCsrf = csrfOf(html);
response = await fetch(`${base}/admin/livros`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ csrf: editCsrf, id: String(book.id), title, author, category_id: categoryId, cover_url: secondUrl }), redirect: 'manual' });
assert(response.status === 303, 'edição da URL falhou');
assert(sql(`SELECT cover_url FROM books WHERE id=${book.id}`)[0]?.cover_url === secondUrl, 'URL substituta não foi persistida');

html = await (await fetch(`${base}/admin/livros/${book.id}/editar`, { headers: { Cookie: cookie } })).text();
const removeCsrf = csrfOf(html);
response = await fetch(`${base}/admin/livros`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ csrf: removeCsrf, id: String(book.id), title, author, category_id: categoryId, cover_url: '' }), redirect: 'manual' });
assert(response.status === 303 && sql(`SELECT cover_url FROM books WHERE id=${book.id}`)[0]?.cover_url === null, 'remoção da URL falhou');

const imagesBefore = sql('SELECT count(*) count FROM images')[0]?.count;
const legacy = new FormData();
legacy.set('csrf', removeCsrf); legacy.set('title', `Upload bloqueado ${suffix}`); legacy.set('author', 'Autor'); legacy.set('category_id', categoryId); legacy.set('cover', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'capa.png');
response = await fetch(`${base}/admin/livros`, { method: 'POST', headers: { Cookie: cookie }, body: legacy });
assert(response.status === 400, 'upload antigo não foi bloqueado');
assert(sql('SELECT count(*) count FROM images')[0]?.count === imagesBefore, 'upload antigo criou BLOB');
console.log('cover-smoke: URL HTTPS, D1, catálogo, detalhes, edição, remoção e bloqueio de upload passaram');
