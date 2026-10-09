import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = process.env.BANNER_BASE_URL || 'http://localhost:8795';
const persistTo = process.env.BANNER_PERSIST_TO || '.wrangler/banner-state';
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1)]; }));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const cookieValue = response => response.headers.get('set-cookie')?.match(/session=([^;]+)/)?.[1] || '';
const csrfValue = html => html.match(/name="csrf" value="([^"]+)"/)?.[1] || '';
const sql = command => { const raw=execFileSync('./node_modules/.bin/wrangler',['d1','execute','ichrysostom','--local','--persist-to',persistTo,'--json','--command',command],{encoding:'utf8'}); const start=raw.indexOf('['); return JSON.parse(raw.slice(start)); };

const login = await fetch(`${base}/login`, { method:'POST', body:new URLSearchParams({username:vars.ADMIN_USERNAME,password:vars.ADMIN_PASSWORD}), redirect:'manual' });
assert(login.status===303, `login falhou: ${login.status}`); const cookie=cookieValue(login); assert(cookie,'cookie de sessão ausente');
const configuration=await fetch(`${base}/admin/configuracao`,{headers:{Cookie:`session=${cookie}`}}); const configHtml=await configuration.text(); const csrf=csrfValue(configHtml); assert(configuration.status===200&&csrf,'formulário/CSRF ausente');
const upload=async () => { const form=new FormData(); form.set('csrf',csrf); form.set('library_name','Biblioteca da Igreja'); form.set('site_title','Acervo'); form.set('primary_color','#315c48'); form.set('banner',new Blob([png],{type:'image/png'}),'banner.png'); return fetch(`${base}/admin/configuracao`,{method:'POST',headers:{Cookie:`session=${cookie}`},body:form,redirect:'manual'}); };
const firstUpload=await upload(); assert(firstUpload.status===303,`primeiro upload falhou: ${firstUpload.status}`);
const d1=sql('SELECT banner_image_id,mime_type,size,length(content) bytes FROM settings JOIN images ON images.id=settings.banner_image_id WHERE settings.id=1'); const firstRow=d1[0]?.results?.[0]; assert(firstRow?.banner_image_id&&firstRow.mime_type==='image/png'&&firstRow.size===png.length&&firstRow.bytes===png.length,'D1 não preservou o BLOB ou a associação');
const firstHome=await (await fetch(`${base}/`)).text(); const firstId=firstHome.match(/hero-banner-image" src="\/imagens\/(\d+)"/)?.[1]; assert(firstId===String(firstRow.banner_image_id),'home não referencia o banner associado');
const firstImage=await fetch(`${base}/imagens/${firstId}`); const firstBytes=new Uint8Array(await firstImage.arrayBuffer()); assert(firstImage.status===200&&firstImage.headers.get('content-type')==='image/png'&&firstBytes[0]===137&&firstBytes[1]===80&&firstBytes[2]===78&&firstBytes.length===png.length,'endpoint não entregou os bytes PNG');
const secondUpload=await upload(); assert(secondUpload.status===303,'substituição falhou'); const secondHome=await (await fetch(`${base}/`)).text(); const secondId=secondHome.match(/hero-banner-image" src="\/imagens\/(\d+)"/)?.[1]; assert(secondId&&secondId!==firstId,'substituição não gerou nova referência');
const oldImage=sql(`SELECT count(*) count FROM images WHERE id=${Number(firstId)}`); assert(oldImage[0]?.results?.[0]?.count===0,'imagem anterior permaneceu após a substituição');
const removeForm=new FormData(); removeForm.set('csrf',csrf); removeForm.set('library_name','Biblioteca da Igreja'); removeForm.set('site_title','Acervo'); removeForm.set('primary_color','#315c48'); removeForm.set('remove_banner','on'); const removed=await fetch(`${base}/admin/configuracao`,{method:'POST',headers:{Cookie:`session=${cookie}`},body:removeForm,redirect:'manual'}); assert(removed.status===303,'remoção falhou'); const emptyHome=await (await fetch(`${base}/`)).text(); assert(!emptyHome.includes('hero-banner-image')&&emptyHome.includes('hero-pattern'),'placeholder não foi restaurado');
const removedImage=sql(`SELECT count(*) count FROM images WHERE id=${Number(secondId)}`); assert(removedImage[0]?.results?.[0]?.count===0,'imagem removida permaneceu no D1');
console.log('banner-smoke: upload, D1, recuperação, bytes, substituição e remoção passaram');
