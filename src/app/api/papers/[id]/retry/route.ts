import { after, NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runNextIndexJob } from "@/lib/indexing/jobs";

export const maxDuration = 300;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const { data: paper, error: paperError } = await supabaseAdmin.from("documents")
    .select("id,status").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (paperError) return NextResponse.json({ error: "读取论文失败" }, { status: 500 });
  if (!paper) return NextResponse.json({ error: "论文不存在" }, { status: 404 });
  if (paper.status === "ready") return NextResponse.json({ error: "论文已完成索引" }, { status: 409 });

  // Also enables owner-approved recovery of legacy failed papers with no job row.
  const { error: insertError } = await supabaseAdmin.from("document_index_jobs")
    .upsert({ document_id: id, user_id: user.id }, { onConflict: "document_id", ignoreDuplicates: true });
  if (insertError) return NextResponse.json({ error: "创建重试任务失败" }, { status: 500 });
  const { data: queued, error } = await supabaseAdmin.rpc("retry_document_index_job", {
    p_document_id: id, p_user_id: user.id,
  });
  if (error) return NextResponse.json({ error: "重试任务失败" }, { status: 500 });
  if (!queued) return NextResponse.json({ error: "索引正在执行，请稍后重试" }, { status: 409 });
  after(async () => { await runNextIndexJob(id).catch((error) => console.error("[Retry]", error)); });
  return NextResponse.json({ success: true }, { status: 202 });
}
