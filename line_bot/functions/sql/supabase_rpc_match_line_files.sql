-- Supabase RPC 函數：向量相似度搜尋 line_files
-- 此函數用於 /like 指令的向量相似度搜尋功能
-- 
-- 使用方式：
-- 1. 在 Supabase Dashboard 中，進入 SQL Editor
-- 2. 執行此 SQL 語法建立函數
-- 3. 確保 pgvector 擴充功能已啟用
-- 4. 確保 line_files 表的 embedding 欄位類型為 vector(1536)

-- 先刪除舊函數（如果存在），避免返回類型衝突
DROP FUNCTION IF EXISTS match_line_files(vector, double precision, integer, text, text);

-- 建立新函數
-- 使用 SETOF 直接返回資料表類型，避免類型不匹配問題
CREATE OR REPLACE FUNCTION match_line_files(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20,
  filter_source_type text DEFAULT NULL,
  filter_source_id text DEFAULT NULL
)
RETURNS TABLE (
  -- 直接使用資料表的實際欄位，不強制轉換類型
  id bigint,
  message_id text,
  message_type text,
  source_type text,
  source_id text,
  original_file_name text,
  storage_path text,
  file_size bigint,
  content_type text,
  download_url text,
  duration integer,  -- 注意：如果資料表中是 integer，請保持為 integer
  metadata jsonb,
  embedding vector(1536),
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- 直接選擇欄位，讓 PostgreSQL 自動處理類型轉換
    lf.id,
    lf.message_id,
    lf.message_type,
    lf.source_type,
    lf.source_id,
    lf.original_file_name,
    lf.storage_path,
    lf.file_size,
    lf.content_type,
    lf.download_url,
    lf.duration,  -- 使用實際的資料表類型
    lf.metadata,
    lf.embedding,
    lf.created_at,
    lf.updated_at,
    -- 計算餘弦相似度：1 - 餘弦距離
    -- 值越接近 1 表示越相似
    (1 - (lf.embedding <=> query_embedding))::float AS similarity
  FROM line_files lf
  WHERE 
    -- 只搜尋有 embedding 的記錄
    lf.embedding IS NOT NULL
    -- 相似度必須大於閾值
    AND (1 - (lf.embedding <=> query_embedding)) > match_threshold
    -- 可選：根據來源類型過濾
    AND (filter_source_type IS NULL OR lf.source_type = filter_source_type)
    -- 可選：根據來源 ID 過濾
    AND (filter_source_id IS NULL OR lf.source_id = filter_source_id)
  -- 按照相似度排序（相似度高的在前）
  ORDER BY lf.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 注意事項：
-- 1. 此函數使用餘弦距離 (<=>) 來計算向量相似度
-- 2. 相似度 = 1 - 餘弦距離，範圍為 0-1，越接近 1 越相似
-- 3. match_threshold 預設為 0.5，可根據需求調整（建議範圍：0.3-0.8）
-- 4. 如果 embedding 欄位尚未建立索引，建議建立以提升搜尋效能：
--    CREATE INDEX ON line_files USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
--    注意：索引建立需要一些時間，且建議在有一定資料量後再建立


