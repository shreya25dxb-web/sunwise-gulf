import assert from 'node:assert/strict';
import { test } from 'node:test';
import analyze, {config as analyzeConfig} from '../netlify/functions/analyse-food-photo.mjs';
import status from '../netlify/functions/ai-status.mjs';
function request(method='POST',payload={},origin='https://sample.netlify.app'){
  return new Request('https://sample.netlify.app/api/analyse-food-photo',{
    method,headers:{'Content-Type':'application/json','Origin':origin},
    ...(method==='POST'?{body:JSON.stringify(payload)}:{})
  });
}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(200)]).toString('base64');
test('status disabled without key',async()=>{
  delete process.env.GEMINI_API_KEY;
  const r=await status(new Request('https://sample.netlify.app/api/ai-status'));
  assert.equal((await r.json()).enabled,false);
});
test('requires private AI key',async()=>{
  delete process.env.GEMINI_API_KEY;
  const r=await analyze(request('POST',{mimeType:'image/png',imageBase64:png}));
  assert.equal(r.status,503);
});
test('validates images, rejects other origins and obeys 3 per-minute limit config',async()=>{
  process.env.GEMINI_API_KEY='placeholder-for-unit-test';
  assert.equal(analyzeConfig.rateLimit.windowLimit,3);
  let r=await analyze(request('POST',{mimeType:'image/png',imageBase64:'not-base64!'}));
  assert.equal(r.status,400);
  r=await analyze(request('POST',{mimeType:'image/png',imageBase64:png},'https://evil.example'));
  assert.equal(r.status,403);
});
test('maps provider food suggestions without adding any vitamin D amounts',async()=>{
  process.env.GEMINI_API_KEY='placeholder-for-unit-test';
  const old=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({foods:[{label:'scrambled egg',foodId:'egg',confidence:'medium'}, {label:'unknown dessert',foodId:'imagined',confidence:'high'}]})}]}}]}),{status:200});
  try{
    const r=await analyze(request('POST',{mimeType:'image/png',imageBase64:png}));
    const obj=await r.json();
    assert.equal(r.status,200);
    assert.equal(obj.foods[0].foodId,'egg');
    assert.equal(obj.foods[1].foodId,'unknown');
    assert.equal(obj.foods[0].iu,undefined);
  }finally{globalThis.fetch=old;}
});
