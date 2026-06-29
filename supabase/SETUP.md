# Supabase 设置指南

## 步骤 1：创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com) 并登录
2. 点击 **New project**
3. 填写：
   - **Name**: `paper-assistant`
   - **Database Password**: 设置一个强密码（保存好！）
   - **Region**: 选择离你最近的区域（亚洲选 Tokyo 或 Singapore）
   - **Pricing Plan**: Free（免费层包含 500MB 数据库 + 2 个项目）
4. 点击 **Create new project**，等待初始化完成（约 2 分钟）

## 步骤 2：获取 API 密钥

1. 进入 **Project Settings → API**
2. 复制以下值：
   - **Project URL** → 填入 `.env.local` 的 `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → 填入 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → 填入 `SUPABASE_SERVICE_ROLE_KEY`（⚠️ 机密！）

## 步骤 3：启用 pgvector 扩展

在 Supabase Dashboard 左侧导航中：

1. 进入 **SQL Editor**
2. 点击 **New query**
3. 粘贴并执行：
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
   ```
4. 点击 **Run** 按钮执行

## 步骤 4：执行数据库迁移

1. 在 SQL Editor 中点击 **New query**
2. 将 `supabase/migrations/001_init.sql` 的**全部内容**粘贴进去
3. 点击 **Run** 执行

或者使用 Supabase CLI：
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## 步骤 5：创建 Storage Bucket

1. 进入 **Storage** 页面
2. 点击 **New bucket**
3. 名称填 `papers`
4. **取消勾选** "Public bucket"（设为私有）
5. 点击 **Create bucket**

## 步骤 6：配置 Storage RLS 策略

在 SQL Editor 中执行以下 SQL（已在 001_init.sql 底部注释中）：

```sql
-- 允许认证用户上传 PDF
CREATE POLICY "Allow authenticated uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'papers'
    AND (storage.extension(name) = 'pdf')
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 允许用户查看自己上传的文件
CREATE POLICY "Allow users to view own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'papers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 允许用户删除自己的文件
CREATE POLICY "Allow users to delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'papers'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

## 验证

执行以下 SQL 确认表已创建：
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

预期输出：`chat_messages`, `chat_sessions`, `document_chunks`, `documents`
