import { supabaseAdmin } from "@/lib/supabase/admin";
import { runIndexPipeline } from "@/lib/pdf";

export interface IndexJob {
  document_id: string;
  user_id: string;
  attempts: number;
  max_attempts: number;
  lease_token: string;
  status: "queued" | "processing" | "ready" | "error";
}

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("索引任务超时或租约失效"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("索引任务超时或租约失效"));
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function runNextIndexJob(documentId?: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("claim_document_index_job", {
    p_document_id: documentId ?? null,
  });
  if (error) throw new Error("领取索引任务失败: " + error.message);
  const job = (data as IndexJob[] | null)?.[0];
  if (!job) return false;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 5 * 60_000);
  let heartbeatRunning = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatRunning || controller.signal.aborted) return;
    heartbeatRunning = true;
    try {
      const { data: renewed, error: renewalError } = await supabaseAdmin.rpc("heartbeat_document_index_job", {
        p_document_id: job.document_id,
        p_lease_token: job.lease_token,
        p_step: null,
        p_completed: null,
        p_total: null,
      });
      if (renewalError || !renewed) controller.abort();
    } catch {
      controller.abort();
    } finally {
      heartbeatRunning = false;
    }
  }, 30_000);

  try {
    const { data: paper, error: paperError } = await supabaseAdmin.from("documents")
      .select("storage_path,title").eq("id", job.document_id).eq("user_id", job.user_id).single();
    if (paperError || !paper) throw new Error("论文不存在或任务归属不匹配");
    const { data: pdf, error: downloadError } = await untilAborted(
      supabaseAdmin.storage.from("papers").download(paper.storage_path), controller.signal
    );
    if (downloadError || !pdf) throw new Error("下载 PDF 失败: " + (downloadError?.message ?? "文件不存在"));
    controller.signal.throwIfAborted();
    await untilAborted(runIndexPipeline({
      documentId: job.document_id,
      leaseToken: job.lease_token,
      pdfBuffer: Buffer.from(await pdf.arrayBuffer()),
      fallbackTitle: paper.title,
      signal: controller.signal,
    }), controller.signal);
    console.log("[IndexJob] completed", job.document_id, "attempt", job.attempts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "索引失败";
    const status = error instanceof Error && "status" in error ? Number(error.status) : undefined;
    const retryable = status !== 400 && status !== 401 && status !== 403 && status !== 404 &&
      !/未能从 PDF 中提取文本|EMBEDDING_DIMENSIONS|输出维度|维度不|未配置|配置有效|Invalid PDF|bad XRef|Invalid PDF structure/i.test(message);
    const { error: failureError } = await supabaseAdmin.rpc("fail_document_index_job", {
      p_document_id: job.document_id,
      p_lease_token: job.lease_token,
      p_error: message.slice(0, 1000),
      p_retryable: retryable,
    });
    console.error("[IndexJob] failed", job.document_id, message);
    if (failureError) throw new Error("保存索引失败状态失败: " + failureError.message);
  } finally {
    clearTimeout(deadline);
    clearInterval(heartbeat);
  }
  return true;
}
