import { execFileSync } from 'node:child_process';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm-cleanup');
const idsArg = process.argv.find(argument => argument.startsWith('--ids='))?.slice('--ids='.length) || '';
const ids = idsArg ? idsArg.split(',').map(Number) : [];
if (ids.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('IDs inválidos. Use --ids=1,2,3.');
if (apply && (!confirmed || ids.length === 0)) throw new Error('A limpeza exige --apply --confirm-cleanup --ids=1,2,3.');

const runAll = sql => JSON.parse(execFileSync('./node_modules/.bin/wrangler', ['d1', 'execute', 'ichrysostom', '--local', '--command', sql, '--json'], { encoding: 'utf8' }));
const run = sql => runAll(sql)[0]?.results || [];
const summary = runAll(`SELECT count(*) total, coalesce(sum(size),0) bytes FROM images; SELECT count(*) count, coalesce(sum(i.size),0) bytes FROM images i JOIN settings s ON s.banner_image_id=i.id; SELECT count(*) count, coalesce(sum(i.size),0) bytes FROM images i JOIN books b ON b.cover_image_id=i.id; SELECT count(*) count, coalesce(sum(i.size),0) bytes FROM images i WHERE NOT EXISTS(SELECT 1 FROM settings s WHERE s.banner_image_id=i.id) AND NOT EXISTS(SELECT 1 FROM books b WHERE b.cover_image_id=i.id);`);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', summary }, null, 2));

if (!apply) {
  console.log('Nenhuma imagem foi removida. Revise os registros sem referência ativa antes de executar uma limpeza explícita.');
  process.exit(0);
}

const selected = run(`SELECT id FROM images WHERE id IN (${ids.join(',')}) AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.banner_image_id=images.id) AND NOT EXISTS(SELECT 1 FROM books b WHERE b.cover_image_id=images.id)`);
if (selected.length !== ids.length) throw new Error('A limpeza foi bloqueada: algum ID não existe ou ainda possui referência ativa.');
const result = run(`DELETE FROM images WHERE id IN (${ids.join(',')})`);
console.log(JSON.stringify({ deleted: ids, result }, null, 2));
