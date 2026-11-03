const headers = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff'
};
export default async function handler(request) {
  if (request.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), {status:405,headers});
  return new Response(JSON.stringify({ enabled: Boolean(process.env.GEMINI_API_KEY), provider: 'Google Gemini' }), {status:200,headers});
}
export const config={path:'/api/ai-status'};
