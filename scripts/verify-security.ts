import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

loadEnvConfig(process.cwd());

const base = process.env.TEST_APP_URL || "http://localhost:3001";
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error("验收脚本只允许访问本机测试服务");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(supabaseUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{autoRefreshToken:false,persistSession:false}});
const createdUsers: string[] = [];
const createdPapers: string[] = [];
const createdPaths: string[] = [];

async function createAccount(label: string) {
  const email = "paper-assistant-qa-"+label+"-"+randomUUID()+"@example.com";
  const password = randomUUID()+"Aa9!";
  const {data,error} = await admin.auth.admin.createUser({email,password,email_confirm:true});
  if (error || !data.user) throw new Error("创建临时测试账号失败: "+error?.message);
  createdUsers.push(data.user.id);
  const jar = new Map<string,string>();
  const client = createServerClient(supabaseUrl,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:(values:{name:string;value:string;options:CookieOptions}[])=>{
      values.forEach(({name,value})=>jar.set(name,value));
    }},
  });
  const login = await client.auth.signInWithPassword({email,password});
  if (login.error) throw new Error("临时测试账号登录失败: "+login.error.message);
  return {id:data.user.id,client,cookie:()=>Array.from(jar,([name,value])=>name+"="+value).join("; ")};
}

type Account = Awaited<ReturnType<typeof createAccount>>;
async function request(url:string, account?:Account, options:RequestInit = {}) {
  return fetch(base+url,{...options,headers:{...options.headers,...(account?{cookie:account.cookie()}:{})},signal:AbortSignal.timeout(90_000)});
}
async function waitForReady(id:string, account:Account) {
  for (let attempt=0;attempt<40;attempt++) {
    const response=await request('/api/papers/'+id,account);
    assert.equal(response.status,200);
    const details=await response.json();
    if(details.paper.status==='ready') return details;
    if(details.paper.status==='error') throw new Error('测试索引失败: '+details.paper.error_message);
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  throw new Error('等待测试索引完成超时');
}

async function main() {
  const a=await createAccount('a'), b=await createAccount('b');
  assert.equal((await request('/api/papers')).status,401);
  const bytes=await readFile('tests/fixtures/paper-smoke.pdf');
  const form=new FormData();
  form.set('file',new File([new Uint8Array(bytes)],'qa-smoke.pdf',{type:'application/pdf'}));
  const upload=await request('/api/upload',a,{method:'POST',body:form});
  const body=await upload.json();
  assert.equal(upload.status,201,JSON.stringify(body));
  const id=body.paperId;
  createdPapers.push(id);
  const ready=await waitForReady(id,a);
  createdPaths.push(ready.paper.storage_path);
  assert.equal(ready.paper.user_id,a.id);
  assert.equal((await request('/api/papers/'+id,b)).status,404);
  assert.equal((await request('/api/papers/'+id,b,{method:'DELETE'})).status,404);
  assert.equal((await request('/api/papers/'+id+'/retry',b,{method:'POST'})).status,404);
  const outsiderChat=await request('/api/chat',b,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paperId:id,question:'private?'})});
  assert.equal(outsiderChat.status,404);
  const outsiderChunks=await b.client.from('document_chunks').select('id').eq('document_id',id);
  assert.equal(outsiderChunks.error,null);
  assert.equal(outsiderChunks.data?.length,0);
  const outsiderFile=await b.client.storage.from('papers').download(ready.paper.storage_path);
  assert.ok(outsiderFile.error);
  const ownerChunks=await a.client.from('document_chunks').select('id').eq('document_id',id);
  assert.equal(ownerChunks.error,null);
  assert.ok(ownerChunks.data?.length);
  const chat=await request('/api/chat',a,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paperId:id,question:'Paper Assistant smoke test: vector retrieval and cited question answering?'})});
  assert.equal(chat.status,200);
  const events=await chat.text();
  assert.match(events,/"type":"sources"/);
  assert.match(events,/"type":"chunk"/);
  assert.match(events,/"type":"done"/);
  assert.doesNotMatch(events,/"type":"error"/);
  console.log('PASS: 真实双账号的上传、归属隔离、RLS、私有文件和引用问答');

  // Simulate a crashed lease on this test-only document, never on real user data.
  const oldLease=randomUUID();
  const jobUpdate=await admin.from('document_index_jobs').update({status:'processing',attempts:1,lease_token:oldLease,lease_expires_at:new Date(Date.now()-1000).toISOString(),step:'embedding'}).eq('document_id',id);
  assert.equal(jobUpdate.error,null);
  const paperUpdate=await admin.from('documents').update({status:'processing'}).eq('id',id).eq('user_id',a.id);
  assert.equal(paperUpdate.error,null);
  const {runNextIndexJob}=await import('../src/lib/indexing/jobs');
  assert.equal(await runNextIndexJob(id),true);
  await waitForReady(id,a);
  const count=await admin.from('document_chunks').select('id',{count:'exact',head:true}).eq('document_id',id);
  assert.equal(count.count,ownerChunks.data?.length);
  const stale=await admin.rpc('finish_document_index_job',{p_document_id:id,p_lease_token:oldLease,p_chunks:[],p_title:'stale',p_page_count:1});
  assert.equal(stale.error,null);
  assert.equal(stale.data,false);
  console.log('PASS: 中断任务接手、无重复文本块、旧任务无法回写');

  await admin.from('document_index_jobs').update({status:'error',step:'failed',lease_token:null,lease_expires_at:null}).eq('document_id',id);
  await admin.from('documents').update({status:'error',error_message:'QA-only simulated failure'}).eq('id',id).eq('user_id',a.id);
  assert.equal((await request('/api/papers/'+id+'/retry',a,{method:'POST'})).status,202);
  await waitForReady(id,a);
  console.log('PASS: 所有者手动重试恢复 ready');
}

main().catch(error=>{console.error(error instanceof Error?error.message:'验收失败');process.exitCode=1;}).finally(async()=>{
  // Discover test paths even if a request failed before waitForReady completed.
  for(const userId of createdUsers){
    const {data}=await admin.from('documents').select('storage_path').eq('user_id',userId);
    for(const paper of data??[]) if(paper.storage_path.startsWith(userId+'/'))createdPaths.push(paper.storage_path);
  }
  if(createdPaths.length){const {error}=await admin.storage.from('papers').remove([...new Set(createdPaths)]);if(error){console.error('测试文件清理失败');process.exitCode=1;}}
  for(const id of createdPapers){const {error}=await admin.from('documents').delete().eq('id',id).in('user_id',createdUsers);if(error){console.error('测试论文清理失败');process.exitCode=1;}}
  for(const id of createdUsers){const {error}=await admin.auth.admin.deleteUser(id);if(error){console.error('测试账号清理失败');process.exitCode=1;}}
  console.log('已清理本次临时账号、论文和文件');
});
