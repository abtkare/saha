/**
 * تمرير /api/* إلى خادم NestJS داخل شبكة Docker، فيبقى منفذ واحد مكشوف للموقع والـ API.
 * (يُستبدل بالـ proxy الأمامي عند النشر النهائي مع HTTPS.)
 */
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${API}/api/${path.map(encodeURIComponent).join('/')}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete('host');
  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = req.body;
    init.duplex = 'half';
  }
  try {
    const res = await fetch(target, init);
    const out = new Headers(res.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    return Response.json({ statusCode: 502, code: 'API_UNAVAILABLE', message: 'الخادم غير متاح الآن. حاول بعد قليل.' }, { status: 502 });
  }
}

export const dynamic = 'force-dynamic';
export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
