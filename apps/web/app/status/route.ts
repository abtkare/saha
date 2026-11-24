/** Expo Go يسأل خادم «التطوير» عن حالته بهذا المسار — نجيب كما يجيب خادم Expo */
export const dynamic = 'force-dynamic';
export function GET() {
  return new Response('packager-status:running', { headers: { 'content-type': 'text/plain' } });
}
