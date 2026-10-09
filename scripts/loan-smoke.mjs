import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.env.LOAN_BASE_URL || 'http://localhost:8798';
const persistTo = process.env.LOAN_PERSIST_TO;
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const suffix = Date.now().toString();
const title = `Livro fluxo ${suffix}`;
const author = `Autor fluxo ${suffix}`;
const code = `EX-${suffix}`;
const noCopyTitle = `Livro sem exemplar ${suffix}`;
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = command => JSON.parse(execFileSync('./node_modules/.bin/wrangler', ['d1', 'execute', 'ichrysostom', '--local', ...(persistTo ? ['--persist-to', persistTo] : []), '--command', command, '--json'], { encoding: 'utf8' }))[0]?.results || [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const csrfOf = html => html.match(/name="csrf" value="([^"]+)"/)?.[1];
const cookieOf = response => response.headers.get('set-cookie')?.split(';', 1)[0];

sql(`INSERT INTO categories(name) VALUES(${quote(`Fluxo ${suffix}`)}); INSERT INTO books(title,author,category_id) VALUES(${quote(title)},${quote(author)},(SELECT id FROM categories WHERE name=${quote(`Fluxo ${suffix}`)})),(${quote(noCopyTitle)},'Autor sem exemplar',(SELECT id FROM categories WHERE name=${quote(`Fluxo ${suffix}`)})); INSERT INTO copies(book_id,code) VALUES((SELECT id FROM books WHERE title=${quote(title)}),${quote(code)})`);

let response = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ username: vars.ADMIN_USERNAME, password: vars.ADMIN_PASSWORD }), redirect: 'manual' });
assert(response.status === 303, 'login não aceitou as credenciais locais');
const cookie = cookieOf(response);
assert(cookie, 'sessão não foi criada');

response = await fetch(`${base}/admin/emprestimos/novo`, { headers: { Cookie: cookie } });
let html = await response.text();
const csrf = csrfOf(html);
assert(response.status === 200 && csrf, 'formulário de empréstimo não abriu');
assert(html.includes(`${title} — ${author} — ${code}`), 'o exemplar não foi renderizado com livro, autor e código');
assert(html.includes(noCopyTitle) === false, 'livro sem exemplar apareceu como opção de empréstimo');
const copyId = html.match(new RegExp(`<option value="(\\d+)">${title.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')} —`))?.[1];
assert(copyId, 'ID do exemplar não foi encontrado no formulário');

const longDueDate = '2026-12-01';
response = await fetch(`${base}/admin/emprestimos`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ csrf, copy_id: copyId, borrower_name: `Pessoa ${suffix}`, loan_date: '2026-10-01', due_date: longDueDate }), redirect: 'manual' });
assert(response.status === 303, 'empréstimo não foi registrado');
assert(sql(`SELECT due_date FROM loans WHERE copy_id=${copyId} AND returned_at IS NULL`)[0]?.due_date === longDueDate, 'prazo superior a 14 dias não foi persistido');

response = await fetch(`${base}/admin/emprestimos/novo`, { headers: { Cookie: cookie } });
html = await response.text();
assert(!html.includes(`${title} — ${author} — ${code}`), 'exemplar emprestado continuou disponível');
assert(html.includes('Não há exemplares disponíveis') || html.includes('Selecione um livro e exemplar'), 'formulário não explicou a ausência de exemplares');
response = await fetch(`${base}/admin/emprestimos`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ csrf, copy_id: copyId, borrower_name: `Duplicado ${suffix}`, loan_date: '2026-10-01', due_date: longDueDate }), redirect: 'manual' });
assert(response.status === 400 && (await response.text()).includes('não está disponível'), 'empréstimo duplicado não retornou mensagem específica');

const loanId = sql(`SELECT id FROM loans WHERE copy_id=${copyId} AND returned_at IS NULL`)[0]?.id;
assert(loanId, 'empréstimo não foi persistido no D1');
const returnPage = await (await fetch(`${base}/admin/emprestimos`, { headers: { Cookie: cookie } })).text();
const returnCsrf = csrfOf(returnPage);
response = await fetch(`${base}/admin/emprestimos/${loanId}/devolver`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ csrf: returnCsrf }), redirect: 'manual' });
assert(response.status === 303, 'devolução não foi registrada');

response = await fetch(`${base}/admin/emprestimos/novo`, { headers: { Cookie: cookie } });
html = await response.text();
assert(html.includes(`${title} — ${author} — ${code}`), 'exemplar não voltou a aparecer após a devolução');
const invalidCsrf = csrfOf(html);
response = await fetch(`${base}/admin/emprestimos`, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams({ csrf: invalidCsrf, copy_id: copyId, borrower_name: `Data inválida ${suffix}`, loan_date: '2026-10-10', due_date: '2026-10-01' }), redirect: 'manual' });
assert(response.status === 400 && (await response.text()).includes('não pode ser anterior'), 'data anterior à retirada foi aceita ou recebeu mensagem incorreta');
console.log('loan-smoke: livro, exemplar, renderização, empréstimo de 60 dias, indisponibilidade e devolução passaram');
