export const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export const securityHeaders = (init: HeadersInit = {}) => {
  const headers = new Headers(init);
  headers.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return headers;
};

export async function limitRequestBody(request: Request, maxBytes: number): Promise<Request | null> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('request body too large');
        return null;
      }
      chunks.push(part.value.slice().buffer as ArrayBuffer);
    }
    return new Request(request, { body: new Blob(chunks) });
  } catch {
    await reader.cancel('malformed request body').catch(() => undefined);
    return null;
  }
}

export const redirect = (path: string, init: HeadersInit = {}) => {
  const headers = securityHeaders(init);
  headers.set('Location', path);
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status: 303, headers });
};

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const isColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export async function isImage(file: File, max: number) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > max) return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= pngSignature.length && pngSignature.every((value, index) => bytes[index] === value);
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return jpeg || png || webp;
}

export const httpsUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && !url.username && !url.password && trimmed.length <= 2048 ? url.toString() : null;
  } catch { return null; }
};

export const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export function layout(title: string, body: string, settings: { site_title: string; library_name: string; primary_color: string }, user = false) {
  const publicHeader = `<header class="site-header"><a class="site-brand" href="/"><span class="brand-mark">▱</span><span><strong>${esc(settings.library_name)}</strong><small>iChrysostom</small></span></a><nav class="site-nav"><a href="/">Catálogo</a><a class="admin-link" href="/login">Área administrativa <span aria-hidden="true">↗</span></a></nav></header>`;
  const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${esc(settings.primary_color)}"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${esc(title)} · ${esc(settings.site_title)}</title><link rel="stylesheet" href="/style.css"><style>:root{--primary:${esc(settings.primary_color)}}</style></head><body class="${user ? 'admin-page' : ''}">${user ? '' : publicHeader}<main class="${user ? 'admin-container' : 'site-main'}">${body}</main>${user ? '' : '<footer class="site-footer"><span>© 2026 iChrysostom - Sistema de gestão de bibliotecas.</span><span>Desenvolvido por Conrado Rosa.</span></footer>'}<script src="/cover-images.js" defer></script></body></html>`;
}
