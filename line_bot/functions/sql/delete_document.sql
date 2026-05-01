DELETE FROM knowledge_documents WHERE collection_id = 1;

-- 1. 先清空表格
TRUNCATE TABLE public.knowledge_documents RESTART IDENTITY CASCADE;

-- 2. 確認序列已重設為 1
SELECT setval('public.knowledge_documents_id_seq', 1, false);