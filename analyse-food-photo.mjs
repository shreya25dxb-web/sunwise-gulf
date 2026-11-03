/** SunWise photo identification: server-side only, no photo persistence.
 *  Put GEMINI_API_KEY in Netlify environment variables (Functions scope), not public files.
 *  Netlify's code-based per-IP rate limiting is a basic safeguard, not a global budget cap.
 */
const SUPPORTED_FOODS = {
  salmon: 'cooked sockeye salmon (species impossible to guarantee visually)',
  trout: 'cooked rainbow trout (species impossible to guarantee visually)',
  uvmushroom: 'UV-treated mushrooms (requires package evidence)',
  plantmilk: 'vitamin-D-fortified plant milk (requires visible label)',
  milk: 'vitamin-D-fortified dairy milk (requires visible label)',
  cereal: 'vitamin-D-fortified cereal (requires visible label)',
  sardines: 'sardines', egg: 'egg', tuna: 'canned light tuna',
  cheddar: 'cheddar cheese', mushroom: 'portabella mushrooms'
};
const permitted = new Set(Object.keys(SUPPORTED_FOODS));
const safeHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff'
};
function respond(status, payload) { return new Response(JSON.stringify(payload),{status,headers:safeHeaders}); }
function validImage(bytes, type) {
  if(type==='image/jpeg') return bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
  if(type==='image/png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='image/webp') return bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
  return false;
}
export default async function handler(request) {
  if (request.method!=='POST') return respond(405,{error:'Method not allowed.'});
  const configuredKey=process.env.GEMINI_API_KEY;
  if(!configuredKey) return respond(503,{error:'The site owner has not configured GEMINI_API_KEY.'});
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin) return respond(403,{error:'Same-origin photo submissions only.'});
  const header=request.headers.get('content-type')||'';
  if(!header.toLowerCase().startsWith('application/json')) return respond(415,{error:'Expected JSON body.'});
  const declared=Number(request.headers.get('content-length')||0);
  if(declared>3_900_000) return respond(413,{error:'Photo request exceeds the size limit.'});
  let body;
  try{
    const raw=await request.text();
    if(raw.length>3_900_000) return respond(413,{error:'Photo request exceeds the size limit.'});
    body=JSON.parse(raw);
  }catch{return respond(400,{error:'Invalid photo request.'});}
  const {mimeType,imageBase64}=body||{};
  if(!['image/jpeg','image/png','image/webp'].includes(mimeType)||typeof imageBase64!=='string'||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)||imageBase64.length>3_600_000){
    return respond(400,{error:'Send one JPEG, PNG or WEBP photo smaller than approximately 2.6 MB.'});
  }
  const bytes=Buffer.from(imageBase64,'base64');
  if(bytes.length<100||bytes.length>2_700_000||!validImage(bytes,mimeType)){
    return respond(400,{error:'The file is not a supported image or is too large.'});
  }
  const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
  if(!/^gemini-[a-z0-9.\-]+$/.test(model))return respond(500,{error:'Invalid server-side Gemini model configuration.'});
  const prompt=`You are an assistant to a cautious vitamin D food diary. This is a photo of a meal. Identify at most eight visually identifiable food items. Output only JSON of the exact shape {"foods":[{"label":"...","foodId":"unknown","confidence":"low"}]}. Allowed foodIds: ${JSON.stringify(SUPPORTED_FOODS)}; otherwise "unknown". Food labels are suggestions, not nutritional measurements. Do NOT infer species of fish, fortified status, vitamin D treatment of mushrooms, brand, supplement dose, exact serving sizes, weights, calories or vitamin D IU from appearance. For fortification-only foodIds choose "unknown" unless package label with vitamin D is legible in image. When visually uncertain, say confidence low. No safety or medical claims.`;
  const payload={contents:[{role:'user',parts:[
      {text:prompt},
      {inline_data:{mime_type:mimeType,data:imageBase64}}
    ]}],generationConfig:{responseMimeType:'application/json',temperature:0.1}};
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),25000);
  let upstream;
  try{
    upstream=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':configuredKey},
      body:JSON.stringify(payload),signal:controller.signal
    });
  }catch{return respond(502,{error:'AI service timed out or is unreachable. Please try again later.'});}
  finally{clearTimeout(timeout);}
  if(!upstream.ok){
    // Do not return provider response text; it may expose internals. No photo or API key is logged.
    return respond(upstream.status===429?429:502,{error:upstream.status===429?'AI usage limit reached; please try later.':'AI provider request failed. The site owner should check the key, model, and quota.'});
  }
  try{
    const result=await upstream.json();
    const raw=(result.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').replace(/^\s*```json\s*|\s*```\s*$/g,'').trim();
    const parsed=JSON.parse(raw),items=Array.isArray(parsed.foods)?parsed.foods:[];
    const foods=items.slice(0,8).filter(x=>x&&typeof x==='object').map(x=>({
      label:String(x.label||'Unidentified food').slice(0,90),
      foodId:permitted.has(x.foodId)?x.foodId:'unknown',
      confidence:['low','medium','high'].includes(x.confidence)?x.confidence:'low'
    }));
    return respond(200,{foods,note:'AI food recognition is fallible. Verify each food and portion; only your confirmation saves an estimate.'});
  }catch{return respond(502,{error:'AI output was invalid. Please try another photo.'});}
}
export const config={
  path:'/api/analyse-food-photo',
  rateLimit:{windowLimit:3,windowSize:60,aggregateBy:'ip',action:'rate_limit'}
};
