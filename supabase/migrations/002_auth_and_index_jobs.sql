-- Run after 001_init.sql. Keeps legacy papers/chunks intact; no automatic ownership transfer.
BEGIN;
SET LOCAL search_path = public, extensions;

-- Replace demo-era policies on the two application tables with read-only owner policies.
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE policy record;
BEGIN
  FOR policy IN SELECT schemaname,tablename,policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('documents','document_chunks')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',policy.policyname,policy.schemaname,policy.tablename);
  END LOOP;
END; $$;
CREATE POLICY "Owner can read documents" ON public.documents FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Owner can read chunks" ON public.document_chunks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND d.user_id = (SELECT auth.uid())));

CREATE TABLE IF NOT EXISTS public.document_index_jobs (
  document_id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','error')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  step text NOT NULL DEFAULT 'queued',
  completed_chunks integer NOT NULL DEFAULT 0,
  total_chunks integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_index_jobs_pending
  ON public.document_index_jobs (next_attempt_at) WHERE status IN ('queued','processing');
ALTER TABLE public.document_index_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own index jobs" ON public.document_index_jobs;
CREATE POLICY "Users can view own index jobs" ON public.document_index_jobs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- The server owns writes and state transitions. Authenticated readers still pass RLS.
REVOKE ALL ON public.document_index_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.document_index_jobs TO authenticated;
GRANT ALL ON public.document_index_jobs TO service_role;
REVOKE ALL ON public.documents, public.document_chunks FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.documents, public.document_chunks FROM authenticated;
GRANT SELECT ON public.documents, public.document_chunks TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_document_index_job(p_document_id uuid DEFAULT NULL)
RETURNS SETOF public.document_index_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE selected_job public.document_index_jobs; expired_job record;
BEGIN
  -- A worker that used its final attempt and died must become visibly failed.
  FOR expired_job IN SELECT document_id FROM public.document_index_jobs
    WHERE status = 'processing' AND lease_expires_at < now() AND attempts >= max_attempts
    ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 25
  LOOP
    UPDATE public.documents SET status = 'error', error_message = '索引任务中断且已达到重试上限，请手动重试'
      WHERE id = expired_job.document_id;
    UPDATE public.document_index_jobs SET status = 'error', step = 'failed', lease_token = NULL,
      lease_expires_at = NULL, last_error = '索引任务中断且已达到重试上限', updated_at = now()
      WHERE document_id = expired_job.document_id;
  END LOOP;

  SELECT * INTO selected_job FROM public.document_index_jobs j
  WHERE (p_document_id IS NULL OR j.document_id = p_document_id)
    AND j.attempts < j.max_attempts
    AND ((j.status = 'queued' AND j.next_attempt_at <= now())
      OR (j.status = 'processing' AND j.lease_expires_at < now()))
  ORDER BY j.next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY UPDATE public.document_index_jobs SET status = 'processing', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_expires_at = now() + interval '2 minutes',
    step = 'downloading', completed_chunks = 0, total_chunks = 0, updated_at = now()
  WHERE document_id = selected_job.document_id RETURNING *;
END; $$;

CREATE OR REPLACE FUNCTION public.create_document_with_index_job(
  p_user_id uuid, p_title text, p_filename text, p_storage_path text, p_file_size bigint
) RETURNS SETOF public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE paper public.documents;
BEGIN
  IF p_user_id IS NULL OR p_storage_path NOT LIKE p_user_id::text || '/%' THEN
    RAISE EXCEPTION 'Invalid storage ownership';
  END IF;
  INSERT INTO public.documents(user_id,title,filename,storage_path,file_size,status)
    VALUES(p_user_id,p_title,p_filename,p_storage_path,p_file_size,'processing') RETURNING * INTO paper;
  INSERT INTO public.document_index_jobs(document_id,user_id) VALUES(paper.id,p_user_id);
  RETURN NEXT paper;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_owned_document(p_document_id uuid, p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE storage_path text;
BEGIN
  -- Consistent lock order with publication: job first, then document.
  PERFORM 1 FROM public.document_index_jobs WHERE document_id = p_document_id FOR UPDATE;
  SELECT d.storage_path INTO storage_path FROM public.documents d
    WHERE d.id = p_document_id AND d.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM public.documents WHERE id = p_document_id AND user_id = p_user_id;
  RETURN storage_path;
END; $$;

CREATE OR REPLACE FUNCTION public.heartbeat_document_index_job(
  p_document_id uuid, p_lease_token uuid, p_step text, p_completed integer, p_total integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  UPDATE public.document_index_jobs SET lease_expires_at = now() + interval '2 minutes',
    step = COALESCE(p_step,step), completed_chunks = COALESCE(p_completed,completed_chunks),
    total_chunks = COALESCE(p_total,total_chunks), updated_at = now()
  WHERE document_id = p_document_id AND status = 'processing' AND lease_token = p_lease_token
    AND lease_expires_at > now();
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_document_index_job(
  p_document_id uuid, p_lease_token uuid, p_chunks jsonb, p_title text, p_page_count integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE job public.document_index_jobs;
BEGIN
  SELECT * INTO job FROM public.document_index_jobs WHERE document_id = p_document_id FOR UPDATE;
  IF NOT FOUND OR job.status <> 'processing' OR job.lease_token IS DISTINCT FROM p_lease_token
    OR job.lease_expires_at <= now() THEN RETURN false; END IF;
  IF jsonb_typeof(p_chunks) <> 'array' OR jsonb_array_length(p_chunks) = 0 THEN
    RAISE EXCEPTION 'Cannot publish an empty index';
  END IF;
  PERFORM 1 FROM public.documents WHERE id = p_document_id AND user_id = job.user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Replace the complete index in one transaction: no partial visibility or duplicate retry rows.
  DELETE FROM public.document_chunks WHERE document_id = p_document_id;
  INSERT INTO public.document_chunks (document_id,chunk_index,content,content_hash,embedding,metadata)
  SELECT p_document_id, (c->>'chunk_index')::integer, c->>'content', c->>'content_hash',
    (c->>'embedding')::extensions.vector, COALESCE(c->'metadata','{}'::jsonb)
  FROM jsonb_array_elements(p_chunks) c;
  UPDATE public.documents SET status = 'ready', error_message = NULL,
    title = CASE WHEN p_title <> '' THEN p_title ELSE title END, page_count = p_page_count
  WHERE id = p_document_id;
  UPDATE public.document_index_jobs SET status = 'ready', step = 'completed',
    completed_chunks = jsonb_array_length(p_chunks), total_chunks = jsonb_array_length(p_chunks),
    lease_token = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = now()
  WHERE document_id = p_document_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.fail_document_index_job(
  p_document_id uuid, p_lease_token uuid, p_error text, p_retryable boolean DEFAULT true
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE job public.document_index_jobs; retry boolean;
BEGIN
  SELECT * INTO job FROM public.document_index_jobs WHERE document_id = p_document_id FOR UPDATE;
  IF NOT FOUND OR job.status <> 'processing' OR job.lease_token IS DISTINCT FROM p_lease_token
    OR job.lease_expires_at <= now() THEN RETURN false; END IF;
  retry := p_retryable AND job.attempts < job.max_attempts;
  UPDATE public.document_index_jobs SET status = CASE WHEN retry THEN 'queued' ELSE 'error' END,
    step = CASE WHEN retry THEN 'retry_wait' ELSE 'failed' END, last_error = left(p_error,1000),
    next_attempt_at = now() + make_interval(secs => (power(2,job.attempts) * 5)::integer),
    lease_token = NULL, lease_expires_at = NULL, updated_at = now() WHERE document_id = p_document_id;
  UPDATE public.documents SET status = CASE WHEN retry THEN 'processing' ELSE 'error' END,
    error_message = CASE WHEN retry THEN '索引暂时失败，等待自动重试' ELSE left(p_error,1000) END
  WHERE id = p_document_id AND user_id = job.user_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.retry_document_index_job(p_document_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE job public.document_index_jobs;
BEGIN
  SELECT * INTO job FROM public.document_index_jobs WHERE document_id = p_document_id FOR UPDATE;
  IF NOT FOUND OR job.user_id <> p_user_id OR job.status = 'ready'
    OR (job.status = 'processing' AND job.lease_expires_at > now()) THEN RETURN false; END IF;
  PERFORM 1 FROM public.documents WHERE id = p_document_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.document_index_jobs SET status = 'queued', attempts = 0, next_attempt_at = now(),
    step = 'queued', lease_token = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = now()
  WHERE document_id = p_document_id;
  UPDATE public.documents SET status = 'processing', error_message = NULL WHERE id = p_document_id;
  RETURN true;
END; $$;

-- Queue mutation RPCs cannot be invoked with a browser's anon/user JWT.
REVOKE ALL ON FUNCTION public.claim_document_index_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_document_index_job(uuid,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_document_index_job(uuid,uuid,jsonb,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_document_index_job(uuid,uuid,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_document_index_job(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_document_with_index_job(uuid,text,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_owned_document(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_document_index_job(uuid),
  public.heartbeat_document_index_job(uuid,uuid,text,integer,integer),
  public.finish_document_index_job(uuid,uuid,jsonb,text,integer),
  public.fail_document_index_job(uuid,uuid,text,boolean),
  public.retry_document_index_job(uuid,uuid),
  public.create_document_with_index_job(uuid,text,text,text,bigint),
  public.delete_owned_document(uuid,uuid) TO service_role;

-- Read access remains RLS-scoped even when called directly through PostgREST.
ALTER FUNCTION public.search_document_chunks(extensions.vector,uuid,integer,double precision) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.search_document_chunks(extensions.vector,uuid,integer,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_document_chunks(extensions.vector,uuid,integer,double precision) TO authenticated, service_role;

-- Keep private PDF reads aligned with document ownership, including historical storage paths.
UPDATE storage.buckets SET public = false WHERE id = 'papers';
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to view own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own paper files" ON storage.objects;
CREATE POLICY "Users can read own paper files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'papers' AND EXISTS (SELECT 1 FROM public.documents d
    WHERE d.storage_path = name AND d.user_id = (SELECT auth.uid())));

COMMIT;
NOTIFY pgrst, 'reload schema';
