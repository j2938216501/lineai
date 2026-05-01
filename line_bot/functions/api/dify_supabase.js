import express from "express";
import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';

// 先載入環境變數
dotenv.config();

const DIFY_API_KEY = process.env.DIFY_API_KEY;

// 初始化 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const router = express.Router();
router.get("/", async (req, res) => {
    res.send("我是 dify demo");
});


const datasetId = "48821041-2358-492d-9692-5054d34e1ebe";
// https://cloud.dify.ai/datasets/48821041-2358-492d-9692-5054d34e1ebe/documents

//建立 Dify 知識庫並同步到 Supabase
//https://docs.dify.ai/api-reference/documents/create-a-document-from-text
//混合檢索模式要自行去 Dify官網設定

//economy
router.get("/create-document", async (req, res) => {
    try {
      const { name, description, indexing_technique = "economy" } = req.query;
  
      if (!name || !description) {
        return res.status(400).json({
          success: false,
          error: "name 和 description 是必需參數",
          example: "/dify/create-document?name=Vocabulary&description=This is test content"
        });
      }
  
      console.log('開始創建 Dify 文檔:', name);
  
      // 1. 在 Dify 中創建文檔
      const difyRequestBody = {
        name: name,
        text: description,
        indexing_technique: indexing_technique,
        process_rule: {
          mode: "automatic"
        }
      };
  
      console.log('Dify 請求內容:', JSON.stringify(difyRequestBody, null, 2));
  
      // 使用 fetch API 呼叫 Dify
      const difyResponse = await fetch(
        `https://api.dify.ai/v1/datasets/${datasetId}/document/create-by-text`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(difyRequestBody)
        }
      );
  
      if (!difyResponse.ok) {
        const errorData = await difyResponse.text();
        throw new Error(`Dify API 錯誤 (${difyResponse.status}): ${errorData}`);
      }
  
      const difyData = await difyResponse.json();
      console.log('Dify 文檔創建成功:', difyResponse.status);
      
      // 獲取 Dify 返回的文檔 ID
      const difyDocumentId = difyData.document?.id || difyData.id;
      
      if (!difyDocumentId) {
        throw new Error('Dify 未返回文檔 ID');
      }
  
      console.log('Dify 文檔 ID:', difyDocumentId);
  
      // 2. 在 Supabase 中創建對應記錄
      const { data: supabaseData, error: supabaseError } = await supabase
        .from('knowledge_collections')
        .insert({
          name: name,
          description: description,
          dify_id: difyDocumentId
        })
        .select()
        .single();
  
      if (supabaseError) {
        console.error('創建 Supabase 記錄錯誤:', supabaseError);
        return res.status(500).json({
          success: false,
          error: `Dify 文檔創建成功，但 Supabase 記錄創建失敗: ${supabaseError.message}`
        });
      }
  
      console.log('Supabase 記錄創建成功');
  
      res.json({
        success: true,
        message: "Dify 文檔和 Supabase 記錄創建成功",
        knowledge_collections: difyData,
        supabase_record: supabaseData,
        dify_id: difyDocumentId
      });
  
    } catch (error) {
      console.error('創建文檔錯誤:', error);
      console.error('錯誤詳情:', error.message);
      
      res.status(500).json({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });
  
// 從 Supabase 同步資料到 Dify 知識庫
//https://docs.dify.ai/en/use-dify/knowledge/manage-knowledge/maintain-dataset-via-api#update-a-document-with-text
router.get("/sync-document", async (req, res) => {
    try {
      const { dify_id } = req.query;
  
      if (!dify_id) {
        return res.status(400).json({
          success: false,
          error: "dify_id 是必需參數",
          example: "/dify/sync-document?dify_id=your-dify-document-id"
        });
      }
  
      console.log('開始同步 Dify 文檔:', dify_id);
  
      // 1. 從 Supabase 查詢文檔資料
      const { data: documentData, error: documentError } = await supabase
        .from('knowledge_collections')
        .select('*')
        .eq('dify_id', dify_id)
        .single();
  
      if (documentError || !documentData) {
        return res.status(404).json({
          success: false,
          error: "找不到對應的 Dify 文檔記錄",
          dify_id: dify_id
        });
      }
  
      console.log('找到文檔資料:', documentData);
  
      // 2. 從 Supabase 查詢該知識庫的所有資料
      const { data: segmentsData, error: segmentsError } = await supabase
        .from('knowledge_documents')
        .select('*')
        .eq('collection_id', documentData.id)
        .order('id', { ascending: true });
  
      if (segmentsError) {
        return res.status(500).json({
          success: false,
          error: `查詢片段資料失敗: ${segmentsError.message}`
        });
      }
  
      console.log('找到資料:', segmentsData);
  
      // 合併所有內容
      const combinedContent = segmentsData.map(segment => {
        // 確保 content 中的換行符號被正確處理
        const processedContent = segment.content.replace(/\\n/g, '\n');
        
        let segmentText = `#### id:${segment.id}\n標題：${segment.title}\n內容：\n${processedContent}`;
        
        // 如果連結存在且不為空，則添加連結
        if (segment.link && segment.link.trim() !== '') {
          segmentText += `\n連結：${segment.link}`;
        }
        
        return segmentText;
      }).join('\n\n');
  
      // 完整的文檔內容
      const fullDocumentContent = `${combinedContent}`;
  
      console.log('構建的文檔內容:', fullDocumentContent);

      // 4. 分割資料到 Dify 知識庫 
      //economy or high_quality
      const requestBody = {
        name: documentData.name,
        text: fullDocumentContent,
        indexing_technique: "economy", 
        process_rule: {
          mode: "custom",
          rules: {
            pre_processing_rules: [
              {
                "id": "remove_extra_spaces",
                "enabled": false
              },
              {
                "id": "remove_urls_emails",
                "enabled": false
              }
            ],
            segmentation: {
              separator: "####", //用 #### 切資料
              max_tokens: 1000
            }
          }
        }
      };
  
      console.log('請求內容:', JSON.stringify(requestBody, null, 2));
  
      // 5. 更新 Dify 知識庫
      const difyResponse = await fetch(
        `https://api.dify.ai/v1/datasets/${datasetId}/documents/${dify_id}/update-by-text`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );
  
      if (!difyResponse.ok) {
        const errorData = await difyResponse.text();
        throw new Error(`Dify API 錯誤 (${difyResponse.status}): ${errorData}`);
      }
  
      const difyData = await difyResponse.json();
      console.log('Dify 文檔同步成功:', difyResponse.status);
  
      res.json({
        success: true,
        message: "文檔同步成功",
        dify_id: dify_id,
        document_name: documentData.name,
        segments_count: segmentsData.length,
        document_content: fullDocumentContent,
        supabase_document: documentData,
        supabase_segments: segmentsData,
        response_status: difyResponse.status,
        dify_response: difyData
      });
  
    } catch (error) {
      console.error('同步文檔錯誤:', error.message);
      console.error('錯誤詳情:', error.stack);

      res.status(errorStatus >= 400 && errorStatus < 600 ? errorStatus : 500).json({
        success: false,
        error: error.message,
      });
    }
  });
  

// 延遲 
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


export default router;



