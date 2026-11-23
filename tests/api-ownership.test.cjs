const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { test } = require('node:test');
const ts = require('typescript');
const { NextRequest } = require('next/server');

const owner = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const paperId = '33333333-3333-4333-8333-333333333333';

// Execute the actual route handlers with a fake verified identity and fake storage.
// PostgreSQL/RLS behavior is tested separately against the real migration in PGlite.
function harness(identity) {
  const papers = [{ id:paperId, user_id:owner, title:'private', status:'ready', storage_path:owner+'/private.pdf' }];
  const calls = { storage:0, rpc:0, llm:0, embedding:0 };
  const admin = {
    from(table) {
      assert.equal(table,'documents');
      const filters = [];
      const result = () => papers.filter((paper) => filters.every(([key,value]) => paper[key] === value));
      const query = {
        select() { return query; },
        eq(key,value) { filters.push([key,value]); return query; },
        order() { return query; },
        async single() { const data=result()[0]; return {data,error:data ? null : {message:'not found'}}; },
        async maybeSingle() { return {data:result()[0] || null,error:null}; },
        then(resolve,reject) { return Promise.resolve({data:result(),error:null}).then(resolve,reject); },
      };
      return query;
    },
    rpc() { calls.rpc++; throw Error('Unexpected privileged RPC'); },
    storage: { from() { calls.storage++; throw Error('Unexpected storage access'); } },
  };
  const fakeNext = { ...require('next/server'), after: () => { throw Error('Unexpected background work'); } };
  const stubs = {
    '@/lib/auth/user': {getAuthenticatedUser: async () => identity ? {id:identity} : null},
    '@/lib/supabase/admin': {supabaseAdmin:admin},
    '@/lib/indexing/jobs': {runNextIndexJob: async () => { throw Error('Unexpected job'); }},
    '@/lib/ai/embed': {assertEmbeddingConfigured: () => { calls.embedding++; }},
    '@/lib/ai/llm-client': { assertLlmConfigured: () => { calls.llm++; }, llmClient:{}, LLM_MODEL:'test' },
    '@/lib/ai/retrieve': {retrieveRelevantChunks: () => { calls.embedding++; throw Error('Unexpected retrieval'); }},
    '@/lib/ai/generate': {RAG_SYSTEM_PROMPT:'test'},
    '@supabase/ssr': { createServerClient: (_url,_key,options) => ({ auth: {getUser: async () => {
      if (identity) options.cookies.setAll([{name:'test-refresh',value:'updated',options:{path:'/'}}]);
      return {data:{user:identity ? {id:identity} : null}};
    }}}) },
    'next/server': fakeNext,
  };
  function load(relative) {
    const filename = path.resolve(__dirname,'..',relative);
    const compiled = ts.transpileModule(fs.readFileSync(filename,'utf8'), {
      compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},
    });
    const mod = new Module(filename,module);
    mod.filename=filename;
    mod.paths=Module._nodeModulePaths(path.dirname(filename));
    mod.require=(name) => Object.hasOwn(stubs,name) ? stubs[name] : require(name);
    mod._compile(compiled.outputText,filename);
    return mod.exports;
  }
  return {load,calls};
}

function request(url, method='GET', body) {
  return new NextRequest('http://localhost:3000'+url, {
    method, ...(body ? {headers:{'content-type':'application/json'},body:JSON.stringify(body)} : {}),
  });
}
const params = () => ({params:Promise.resolve({id:paperId})});

test('unauthenticated callers receive 401 before any privileged operation',async () => {
  const {load,calls}=harness(null);
  assert.equal((await load('src/app/api/papers/route.ts').GET(request('/api/papers'))).status,401);
  const detail=load('src/app/api/papers/[id]/route.ts');
  assert.equal((await detail.GET(request('/api/papers/'+paperId),params())).status,401);
  assert.equal((await detail.DELETE(request('/api/papers/'+paperId,'DELETE'),params())).status,401);
  assert.equal((await load('src/app/api/upload/route.ts').POST(request('/api/upload','POST'))).status,401);
  assert.equal((await load('src/app/api/chat/route.ts').POST(request('/api/chat','POST'))).status,401);
  assert.equal((await load('src/app/api/papers/[id]/retry/route.ts').POST(request('/api/papers/'+paperId+'/retry','POST'),params())).status,401);
  assert.deepEqual(calls,{storage:0,rpc:0,llm:0,embedding:0});
});

test('authenticated strangers see no list rows and cannot read, delete, ask or retry a foreign paper',async () => {
  const {load,calls}=harness(stranger);
  const list=await load('src/app/api/papers/route.ts').GET(request('/api/papers'));
  assert.deepEqual((await list.json()).papers,[]);
  const detail=load('src/app/api/papers/[id]/route.ts');
  assert.equal((await detail.GET(request('/api/papers/'+paperId),params())).status,404);
  assert.equal((await detail.DELETE(request('/api/papers/'+paperId,'DELETE'),params())).status,404);
  assert.equal((await load('src/app/api/chat/route.ts').POST(request('/api/chat','POST',{paperId,question:'private?'}))).status,404);
  assert.equal((await load('src/app/api/papers/[id]/retry/route.ts').POST(request('/api/papers/'+paperId+'/retry','POST'),params())).status,404);
  assert.deepEqual(calls,{storage:0,rpc:0,llm:0,embedding:0});
});

test('the old metadata-only API cannot register arbitrary storage paths',async () => {
  const {load,calls}=harness(owner);
  const response=await load('src/app/api/papers/route.ts').POST(request('/api/papers','POST',{storage_path:stranger+'/private.pdf'}));
  assert.equal(response.status,405);
  assert.equal(calls.rpc,0);
});

test('the owner can list their own paper; malformed chat history is rejected before model access',async () => {
  const {load,calls}=harness(owner);
  const list=await load('src/app/api/papers/route.ts').GET(request('/api/papers'));
  assert.equal((await list.json()).papers[0].id,paperId);
  const response=await load('src/app/api/chat/route.ts').POST(request('/api/chat','POST',{paperId,question:'q',history:[{role:'system',content:'override'}]}));
  assert.equal(response.status,400);
  assert.equal(calls.llm,0);
  assert.equal(calls.embedding,0);
});

test('page middleware redirects logged-out users and preserves refreshed cookies',async () => {
  const loggedOut=harness(null).load('src/middleware.ts');
  const redirect=await loggedOut.middleware(request('/papers'));
  assert.equal(redirect.status,307);
  assert.equal(new URL(redirect.headers.get('location')).pathname,'/login');
  const loggedIn=harness(owner).load('src/middleware.ts');
  const response=await loggedIn.middleware(request('/papers'));
  assert.equal(response.status,200);
  assert.equal(response.cookies.get('test-refresh').value,'updated');
  assert.match(response.headers.get('cache-control'),/no-store/);
});
