import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.env.SECURITY_BASE_URL || 'http://localhost:8808';
const persistTo = process.env.SECURITY_PERSIST_TO || '.wrangler/security-state';
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').filter((line) => line && !line.startsWith('#')).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const username = vars.ADMIN_USERNAME;
const password = vars.ADMIN_PASSWORD;
if (!username || !password) throw new Error('ADMIN_USERNAME e ADMIN_PASSWORD são necessários no .dev.vars local.');

const sql = (command) => execFileSync('./node_modules/.bin/wrangler', ['d1', 'execute', 'ichrysostom', '--local', '--persist-to', persistTo, '--command', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sqlJson = (command) => {
  const raw = execFileSync('./node_modules/.bin/wrangler', ['d1', 'execute', 'ichrysostom', '--local', '--persist-to', persistTo, '--command', command, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(raw.slice(raw.indexOf('[')));
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const responseCookie = (response) => response.headers.get('set-cookie')?.split(';', 1)[0] || '';

async function request(path, init = {}) {
  return fetch(`${base}${path}`, { redirect: 'manual', ...init });
}

async function login(user, pass) {
  const form = new URLSearchParams({ username: user, password: pass });
  return request('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
}

const home = await request('/');
assert(home.status === 200, 'A home pública não respondeu 200.');
assert(home.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), 'CSP ausente ou incompleta.');
assert(home.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options ausente.');
assert((await request('/admin')).status === 303, 'Rota administrativa sem sessão não foi protegida.');

sql('DELETE FROM login_rate_limits');
await Promise.all(Array.from({ length: 10 }, () => login(username, 'senha-concorrente-incorreta')));
const concurrentRow = sqlJson(`SELECT failures,blocked_until FROM login_rate_limits WHERE scope='account:${username.toLocaleLowerCase()}'`)[0]?.results?.[0];
assert(concurrentRow?.failures >= 5 && concurrentRow.blocked_until > Date.now(), 'Incrementos concorrentes não ativaram o bloqueio individual.');
const legitimateOtherAccount = await login(`${username}-second`, password);
assert(legitimateOtherAccount.status === 303 && legitimateOtherAccount.headers.get('location') === '/admin', 'Uma conta legítima foi bloqueada por falhas de outra conta.');
sql('DELETE FROM login_rate_limits');
for (let attempt = 0; attempt < 5; attempt += 1) {
  const failed = await login(username, 'senha-incorreta-de-teste');
  assert(failed.status === 303, `Falha de login não retornou redirecionamento na tentativa ${attempt + 1}.`);
}
const blocked = await login(username, password);
assert(blocked.status === 303 && blocked.headers.get('location')?.includes('error=1'), 'A limitação de tentativas não bloqueou a conta.');
sql("UPDATE login_rate_limits SET blocked_until=0, failures=0 WHERE scope LIKE 'account:%'");
const authenticated = await login(username, password);
assert(authenticated.status === 303 && authenticated.headers.get('location') === '/admin', 'A recuperação após expiração não permitiu o login correto.');
const sessionCookie = responseCookie(authenticated);
assert(sessionCookie.startsWith('session='), 'Cookie de sessão não foi criado.');

const admin = await request('/admin/configuracao', { headers: { Cookie: sessionCookie } });
const csrf = (await admin.text()).match(/name="csrf" value="([^"]+)"/)?.[1];
assert(csrf, 'Token CSRF não foi renderizado.');
const booksPage = await request('/admin/livros', { headers: { Cookie: sessionCookie } });
const booksHtml = await booksPage.text();
assert(!booksHtml.includes('onsubmit='), 'Confirmação inline incompatível com a CSP foi encontrada.');
if (booksHtml.includes('Excluir definitivamente')) assert(booksHtml.includes('data-confirm='), 'Confirmação administrativa não foi migrada para JavaScript externo.');
const missingCsrf = await request('/admin/configuracao', { method: 'POST', headers: { Cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' }, body: 'library_name=Teste' });
assert(missingCsrf.status === 400, 'POST administrativo sem CSRF foi aceito.');

const csrfBookTitle = `CSRF smoke ${Date.now()}`;
sql(`INSERT INTO books(title,author,category_id) VALUES('${csrfBookTitle.replaceAll("'", "''")}','Teste CSRF',1); INSERT INTO copies(book_id,code) SELECT id,'CSRF-SMOKE' FROM books WHERE title='${csrfBookTitle.replaceAll("'", "''")}';`);
const csrfBookPage = await request(`/admin/livros?q=${encodeURIComponent(csrfBookTitle)}`, { headers: { Cookie: sessionCookie } });
const csrfBookHtml = await csrfBookPage.text();
const csrfBookId = csrfBookHtml.match(/action="\/admin\/livros\/(\d+)\/excluir"/)?.[1];
assert(csrfBookId, 'Livro de teste CSRF não foi encontrado na administração.');
const freshSecondLogin = await login(`${username}-second`, password);
const secondSessionCookie = responseCookie(freshSecondLogin);
const secondAdmin = await request('/admin/configuracao', { headers: { Cookie: secondSessionCookie } });
const secondCsrf = (await secondAdmin.text()).match(/name="csrf" value="([^"]+)"/)?.[1];
assert(secondCsrf && secondCsrf !== csrf, 'A sessão secundária não recebeu um token CSRF independente.');
const absentDeleteToken = await request(`/admin/livros/${csrfBookId}/excluir`, { method: 'POST', headers: { Cookie: sessionCookie }, body: new URLSearchParams(), });
assert(absentDeleteToken.status === 400, 'Exclusão sem CSRF foi aceita.');
const wrongDeleteToken = await request(`/admin/livros/${csrfBookId}/excluir`, { method: 'POST', headers: { Cookie: sessionCookie }, body: new URLSearchParams({ csrf: 'token-incorreto' }), });
assert(wrongDeleteToken.status === 400, 'Exclusão com CSRF incorreto foi aceita.');
const foreignDeleteToken = await request(`/admin/livros/${csrfBookId}/excluir`, { method: 'POST', headers: { Cookie: sessionCookie }, body: new URLSearchParams({ csrf: secondCsrf }), });
assert(foreignDeleteToken.status === 400, 'Exclusão com token de outra sessão foi aceita.');
const loopbackDelete = await request(`/admin/livros/${csrfBookId}/excluir`, { method: 'POST', headers: { Cookie: sessionCookie, Origin: new URL(base).protocol + '//127.0.0.1:' + new URL(base).port }, body: new URLSearchParams({ csrf }), });
assert(loopbackDelete.status === 303, 'Exclusão legítima com alias de loopback falhou.');
assert(sqlJson(`SELECT id FROM books WHERE id=${csrfBookId}`).every((entry) => entry.results.length === 0), 'Livro de teste CSRF não foi removido.');

const invalidUpload = new FormData();
invalidUpload.set('csrf', csrf);
invalidUpload.set('library_name', 'Biblioteca');
invalidUpload.set('site_title', 'Acervo');
invalidUpload.set('primary_color', '#315c48');
invalidUpload.set('banner', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'banner.png');
const upload = await request('/admin/configuracao', { method: 'POST', headers: { Cookie: sessionCookie }, body: invalidUpload });
assert(upload.status === 400, 'Upload com bytes que não correspondem ao MIME foi aceito.');

const xss = await request('/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
const xssBody = await xss.text();
assert(!xssBody.includes('<script>alert(1)</script>'), 'Entrada de pesquisa foi refletida como HTML executável.');
const privateFile = await request('/.dev.vars');
assert(privateFile.status !== 200, 'Arquivo privado ficou acessível publicamente.');
const declaredLarge = await request('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(17 * 1024) }, body: 'x'.repeat(17 * 1024) });
assert(declaredLarge.status === 413, 'Corpo acima do limite declarado não foi rejeitado.');
const streamedLarge = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9 * 1024)); controller.enqueue(new Uint8Array(9 * 1024)); controller.close(); } });
const streamResponse = await request('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: streamedLarge, duplex: 'half' });
assert(streamResponse.status === 413, 'Corpo fragmentado sem Content-Length não foi interrompido.');
const malformed = await request('/login', { method: 'POST', headers: { 'content-type': 'multipart/form-data' }, body: 'corpo inválido' });
assert(malformed.status === 400, 'Corpo malformado não retornou erro de entrada.');

const logoutForm = new URLSearchParams({ csrf });
const logout = await request('/logout', { method: 'POST', headers: { Cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' }, body: logoutForm });
assert(logout.status === 303, 'Logout válido falhou.');
assert((await request('/admin', { headers: { Cookie: sessionCookie } })).status === 303, 'Sessão continuou válida após logout.');

console.log('Security smoke: autenticação, rate limit, CSRF, upload, headers, XSS e logout OK.');
