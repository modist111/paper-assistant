const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { vector } = require('@electric-sql/pglite-pgvector');

const owner = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const otherDocumentId = '44444444-4444-4444-8444-444444444444';
const vector1024 = Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0);

test('PostgreSQL migrations: ownership, task leases and atomic publication', async (t) => {
  const db = new PGlite({ extensions: { vector } });
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA storage;
    CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
    CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean NOT NULL DEFAULT false);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,auth,storage,extensions TO anon,authenticated,service_role;
    GRANT SELECT ON storage.objects TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    SET search_path = public,extensions;
  `);
  for (const name of ['001_init.sql', '002_auth_and_index_jobs.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', name), 'utf8'));
  }
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [owner,stranger]);

  async function reset() {
    await db.exec('RESET ROLE; RESET request.jwt.claim.sub; TRUNCATE public.documents CASCADE;');
    await db.query(`INSERT INTO documents(id,user_id,title,filename,storage_path,status)
      VALUES ($1,$2::uuid,'Test','test.pdf',$2::text || '/test.pdf','processing')`, [documentId,owner]);
    await db.query('INSERT INTO document_index_jobs(document_id,user_id) VALUES ($1,$2)', [documentId,owner]);
  }
  async function claim() {
    const { rows } = await db.query('SELECT * FROM claim_document_index_job($1)', [documentId]);
    return rows[0];
  }
  function rows(content = 'new complete index', dims = vector1024) {
    return JSON.stringify([{ chunk_index:0, content, content_hash:'test-hash', embedding:dims, metadata:{embedding_model:'BAAI/bge-m3'} }]);
  }
  async function finish(token, content, dims) {
    return (await db.query('SELECT finish_document_index_job($1,$2,$3::jsonb,$4,1) AS ok', [documentId,token,rows(content,dims),'Test'])).rows[0].ok;
  }

  await t.test('anonymous and other users cannot read papers/chunks or mutate jobs', async () => {
    await reset();
    await db.query(`INSERT INTO document_chunks(document_id,chunk_index,content,content_hash,embedding)
      VALUES ($1,0,'private text','h',$2::vector)`, [documentId,JSON.stringify(vector1024)]);
    await db.query('SELECT set_config($1,$2,false)', ['request.jwt.claim.sub',stranger]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM documents')).rows.length,0);
    assert.equal((await db.query('SELECT * FROM document_chunks')).rows.length,0);
    assert.equal((await db.query('SELECT * FROM document_index_jobs')).rows.length,0);
    await assert.rejects(db.query('SELECT * FROM claim_document_index_job($1)',[documentId]),/permission denied/);
    await assert.rejects(db.query('UPDATE documents SET user_id=$1 WHERE id=$2',[stranger,documentId]),/permission denied/);
    await assert.rejects(db.exec("UPDATE document_index_jobs SET status='ready'"),/permission denied/);
    await db.exec('RESET ROLE');
    await db.query('SELECT set_config($1,$2,false)', ['request.jwt.claim.sub',owner]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM documents')).rows.length,1);
    assert.equal((await db.query('SELECT * FROM document_chunks')).rows.length,1);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.exec('SELECT * FROM documents'),/permission denied/);
    await db.exec('RESET ROLE');
  });

  await t.test('search RPC enforces RLS, even when a caller knows a foreign document ID', async () => {
    await reset();
    await db.query(`INSERT INTO document_chunks(document_id,chunk_index,content,content_hash,embedding)
      VALUES ($1,0,'private text','h',$2::vector)`, [documentId,JSON.stringify(vector1024)]);
    await db.query('SELECT set_config($1,$2,false)', ['request.jwt.claim.sub',stranger]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM search_document_chunks($1::vector,$2,5,0)',[JSON.stringify(vector1024),documentId])).rows.length,0);
    await db.exec('RESET ROLE');
    await db.query('SELECT set_config($1,$2,false)', ['request.jwt.claim.sub',owner]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('SELECT * FROM search_document_chunks($1::vector,$2,5,0)',[JSON.stringify(vector1024),documentId])).rows.length,1);
    await db.exec('RESET ROLE');
  });

  await t.test('only one lease can be claimed; expired leases get a new fencing token', async () => {
    await reset();
    const first = await claim();
    assert.equal(first.attempts,1);
    assert.equal(await claim(),undefined);
    await db.query("UPDATE document_index_jobs SET lease_expires_at=now()-interval '1 second' WHERE document_id=$1",[documentId]);
    const replacement = await claim();
    assert.notEqual(first.lease_token,replacement.lease_token);
    assert.equal(replacement.attempts,2);
    assert.equal(await finish(first.lease_token),false);
    assert.equal(await finish(replacement.lease_token),true);
    assert.equal(await finish(replacement.lease_token),false);
    assert.equal((await db.query('SELECT * FROM document_chunks')).rows.length,1);
  });

  await t.test('wrong vector dimension rolls back both replacement chunks and ready state', async () => {
    await reset();
    await db.query(`INSERT INTO document_chunks(document_id,chunk_index,content,content_hash,embedding)
      VALUES ($1,0,'old index','old',$2::vector)`,[documentId,JSON.stringify(vector1024)]);
    const job = await claim();
    await assert.rejects(finish(job.lease_token,'wrong',Array(1536).fill(1)),/1024.*1536|dimensions/i);
    assert.equal((await db.query('SELECT content FROM document_chunks')).rows[0].content,'old index');
    assert.equal((await db.query('SELECT status FROM documents')).rows[0].status,'processing');
    assert.equal(await finish(job.lease_token),true);
    assert.equal((await db.query('SELECT status FROM documents')).rows[0].status,'ready');
  });

  await t.test('temporary failures back off; permanent failures require owner-authorized retry', async () => {
    await reset();
    let job = await claim();
    await db.query('SELECT fail_document_index_job($1,$2,$3,true)',[documentId,job.lease_token,'503 temporary']);
    assert.equal((await db.query('SELECT status FROM document_index_jobs')).rows[0].status,'queued');
    assert.equal(await claim(),undefined);
    await db.query("UPDATE document_index_jobs SET next_attempt_at=now()-interval '1 second' WHERE document_id=$1",[documentId]);
    job = await claim();
    await db.query('SELECT fail_document_index_job($1,$2,$3,false)',[documentId,job.lease_token,'401 invalid key']);
    assert.equal((await db.query('SELECT status FROM documents')).rows[0].status,'error');
    assert.equal((await db.query('SELECT retry_document_index_job($1,$2) AS ok',[documentId,stranger])).rows[0].ok,false);
    assert.equal((await db.query('SELECT retry_document_index_job($1,$2) AS ok',[documentId,owner])).rows[0].ok,true);
    assert.equal((await claim()).attempts,1);
  });

  await t.test('a crashed final attempt becomes error and legacy papers stay untouched', async () => {
    await reset();
    await db.query(`INSERT INTO documents(id,title,filename,storage_path,status,user_id)
      VALUES ($1,'legacy','old.pdf','demo/old.pdf','ready',NULL)`,[otherDocumentId]);
    await db.exec("UPDATE document_index_jobs SET status='processing',attempts=3,lease_token=gen_random_uuid(),lease_expires_at=now()-interval '1 second'");
    assert.equal(await claim(),undefined);
    assert.equal((await db.query('SELECT status FROM documents WHERE id=$1',[documentId])).rows[0].status,'error');
    assert.equal((await db.query('SELECT user_id FROM documents WHERE id=$1',[otherDocumentId])).rows[0].user_id,null);
  });

  await t.test('document creation and its queued job commit together', async () => {
    await reset();
    await assert.rejects(db.query('SELECT * FROM create_document_with_index_job($1,$2,$3,$4,123)',
      [owner,'Test','test.pdf',stranger+'/foreign.pdf']),/Invalid storage ownership/);
    assert.equal((await db.query('SELECT * FROM documents')).rows.length,1);
    const created = (await db.query('SELECT * FROM create_document_with_index_job($1,$2,$3,$4,123)',
      [owner,'New','new.pdf',owner+'/new.pdf'])).rows[0];
    assert.equal((await db.query('SELECT status FROM document_index_jobs WHERE document_id=$1',[created.id])).rows[0].status,'queued');
  });

  await t.test('deletion cancels active jobs and blocks stale worker publication', async () => {
    await reset();
    const job = await claim();
    assert.equal((await db.query('SELECT delete_owned_document($1,$2) AS path',[documentId,stranger])).rows[0].path,null);
    assert.equal((await db.query('SELECT delete_owned_document($1,$2) AS path',[documentId,owner])).rows[0].path,owner+'/test.pdf');
    assert.equal((await db.query('SELECT * FROM document_index_jobs')).rows.length,0);
    assert.equal(await finish(job.lease_token),false);
    assert.equal((await db.query('SELECT * FROM document_chunks')).rows.length,0);
  });

  await t.test('the migration can be safely re-applied without deleting existing papers', async () => {
    await reset();
    const job=await claim();
    assert.equal(await finish(job.lease_token),true);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/002_auth_and_index_jobs.sql'),'utf8'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM documents')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM document_chunks')).rows[0].n,1);
    assert.equal((await db.query('SELECT status FROM document_index_jobs')).rows[0].status,'ready');
  });

  await t.test('private PDF reads require document ownership, not merely knowledge of the storage path', async () => {
    await reset();
    await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES ($1,$2)',['papers',owner+'/test.pdf']);
    await db.query('SELECT set_config($1,$2,false)',['request.jwt.claim.sub',stranger]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.exec('SELECT * FROM storage.objects'))[0].rows.length,0);
    await db.exec('RESET ROLE');
    await db.query('SELECT set_config($1,$2,false)',['request.jwt.claim.sub',owner]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.exec('SELECT * FROM storage.objects'))[0].rows.length,1);
    await db.exec('RESET ROLE');
  });
});
