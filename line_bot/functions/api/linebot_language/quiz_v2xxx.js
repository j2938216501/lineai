import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const config = {
    channelSecret: process.env.LINE_SECRET_OREN2,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_OREN2
}

const client = new line.messagingApi.MessagingApiClient(config);

// Supabase 設定
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Dify API 設定
const DIFY_API_KEY = process.env.DIFY_CHAT_API_KEY;
const DIFY_API_URL = "https://api.dify.ai/v1/chat-messages";

// 使用變數儲存每個使用者的 conversation_id
// key: source_id (userId, groupId, roomId)
// value: conversation_id
const conversationStore = {};

// 使用變數儲存每個使用者的當前題目 ID
// key: source_id (userId, groupId, roomId)
// value: 題目 ID (數字)
const currentQuestionIdStore = {};

const router = express.Router();

router.get("/", (req, res) => {
  res.send("我是 linebot_dify webhook");
});

// 處理 line webhook
router.post("/", line.middleware(config), async (req, res) => {
  try {
      // LINE 會將事件放在 req.body.events 陣列中
      const events = req.body.events || [];
      
      // 處理每個事件
      for (const event of events) {
          // 檢查是否為文字訊息事件
          if (event.type === "message" && event.message.type === "text") {
              const userMessage = event.message.text.trim(); // 取得文字內容並去除空白
              const sourceId = getPushTargetFromSource(event.source);
              
              console.log('收到文字訊息:', userMessage);
              console.log('來源 ID:', sourceId);
              
              if (!sourceId) {
                  console.error('無法識別來源 ID');
                  continue;
              }

              // 檢查是否為「切換測驗」關鍵字，如果是則清空所有變數
              const resetKeywords = ['切換測驗', '/切換測驗', 'exam', '牛刀小試', 'quiz', '考試', '測驗'];
              if (resetKeywords.includes(userMessage)) {
                  console.log('偵測到切換測驗關鍵字，清空所有變數...');
                  clearUserData(sourceId);
                  console.log('已清空所有變數，系統重新開始');
              }

              try {
                  // 呼叫 Dify API 獲取回應
                  const difyResponse = await callDifyAPI(userMessage, sourceId);
                  
                  // 先檢查答案是否錯誤（使用上一個題目的 ID）
                  await checkAndProcessError(difyResponse, sourceId, userMessage);
                  
                  // 儲存當前題目的 ID（從 retriever_resources 提取）
                  // 這樣下次檢查錯誤時，就能使用這個 ID 了
                  saveCurrentQuestionId(difyResponse, sourceId);
                  
                  // 回覆訊息給使用者
                  await client.replyMessage({
                      replyToken: event.replyToken,
                      messages: [{
                          type: 'text',
                          text: difyResponse.answer || '抱歉，我無法理解您的訊息。'
                      }]
                  });
                  
                  console.log('成功回覆訊息');
              } catch (error) {
                  console.error('處理 Dify API 回應時發生錯誤:', error);
                  await client.replyMessage({
                      replyToken: event.replyToken,
                      messages: [{
                          type: 'text',
                          text: '抱歉，我現在有點忙，請稍後再試！😅'
                      }]
                  });
              }
          }
      }
      
      res.status(200).send('OK');
  } catch (error) {
      console.error('處理 webhook 時發生錯誤:', error);
      res.status(500).send('Error');
  }
});

/**
 * 呼叫 Dify Chat API
 * @param {string} query - 使用者輸入的訊息
 * @param {string} sourceId - 使用者/群組/房間的唯一識別碼
 * @returns {Promise<Object>} Dify API 回應
 */
async function callDifyAPI(query, sourceId) {
    // 取得該使用者的 conversation_id（如果有的話）
    const conversationId = conversationStore[sourceId];
    
    console.log('目前的 conversation_id:', conversationId || '無（將建立新對話）');
    
    // 構建請求參數（按照 Dify API 範例的格式）
    const requestBody = {
        inputs: {
            collection : "高中文法"
        }, // 應用變數值，即使沒有變數也要傳空物件
        query: query, // 使用者輸入的訊息
        response_mode: "blocking", // 使用 blocking 模式（也可以使用 "streaming"）
        user: sourceId, // 使用 sourceId 作為 Dify 的 user identifier
        auto_generate_name: true // 自動生成對話標題
    };
    
    // 如果有 conversation_id，就加入請求中繼續對話
    // 如果沒有，不加入這個欄位（API 會自動建立新的對話）
    if (conversationId) {
        requestBody.conversation_id = conversationId;
    }
    
    console.log('發送請求到 Dify API:', JSON.stringify(requestBody, null, 2));
    
    // 發送請求到 Dify API
    const response = await fetch(DIFY_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DIFY_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error('Dify API 錯誤:', response.status, errorText);
        throw new Error(`Dify API 錯誤 (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Dify API 回應:', JSON.stringify(data, null, 2));
    
    // 保存 conversation_id（如果回應中有）
    if (data.conversation_id) {
        conversationStore[sourceId] = data.conversation_id;
        console.log('已儲存 conversation_id:', data.conversation_id, 'for sourceId:', sourceId);
    }
    
    return data;
}

/**
 * 從 LINE event source 取得唯一識別碼
 * @param {Object} source - LINE event source 物件
 * @returns {string|undefined} 來源的唯一識別碼
 */
function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
}

/**
 * 清空使用者的所有變數（重新開始）
 * @param {string} sourceId - 使用者/群組/房間的唯一識別碼
 */
function clearUserData(sourceId) {
    // 清空 conversation_id
    if (conversationStore[sourceId]) {
        delete conversationStore[sourceId];
        console.log(`已清除 ${sourceId} 的 conversation_id`);
    }
    
    // 清空當前題目 ID
    if (currentQuestionIdStore[sourceId]) {
        delete currentQuestionIdStore[sourceId];
        console.log(`已清除 ${sourceId} 的當前題目 ID`);
    }
}

/**
 * 儲存當前題目的 ID（從 retriever_resources 提取）
 * @param {Object} difyResponse - Dify API 回應物件
 * @param {string} sourceId - 使用者/群組/房間的唯一識別碼
 */
function saveCurrentQuestionId(difyResponse, sourceId) {
    try {
        const retrieverResources = difyResponse.metadata?.retriever_resources || [];
        
        if (retrieverResources.length === 0) {
            console.log('沒有檢索資源，跳過儲存題目 ID');
            return;
        }
        
        // 從第一個 retriever_resource 中提取 ID（當前題目的編號）
        const firstResource = retrieverResources[0];
        const content = firstResource.content || '';
        
        // 使用正則表達式提取 id:數字 的格式
        const idPattern = /id\s*:\s*(\d+)/i;
        const match = content.match(idPattern);
        
        if (match && match[1]) {
            const questionId = parseInt(match[1], 10);
            if (!isNaN(questionId)) {
                currentQuestionIdStore[sourceId] = questionId;
                console.log(`已儲存當前題目 ID: ${questionId} for sourceId: ${sourceId}`);
            }
        }
    } catch (error) {
        console.error('儲存題目 ID 時發生錯誤:', error);
    }
}

/**
 * 檢查答案是否錯誤，如果錯誤則從變數中提取 ID 並寫入 Supabase
 * @param {Object} difyResponse - Dify API 回應物件
 * @param {string} sourceId - 使用者/群組/房間的唯一識別碼
 * @param {string} userMessage - 使用者的回答
 */
async function checkAndProcessError(difyResponse, sourceId, userMessage) {
    try {
        const answer = difyResponse.answer || '';
        
        if (!answer) {
            console.log('沒有答案，跳過檢查');
            return;
        }
        
        // 檢查答案中是否包含錯誤相關的關鍵字
        const errorKeywords = ['答案不正確', '答案錯誤', '錯誤', '不正確', '不正確的答案'];
        const hasError = errorKeywords.some(keyword => answer.includes(keyword));
        
        if (!hasError) {
            console.log('答案中沒有錯誤提示，無需處理');
            return;
        }
        
        console.log('偵測到答案錯誤，開始提取題目 ID...');
        
        // 從變數中取得當前題目的 ID（上一個題目）
        const questionId = currentQuestionIdStore[sourceId];
        
        if (!questionId) {
            console.warn('找不到當前題目的 ID');
            return;
        }
        
        console.log(`找到題目 ID: ${questionId}，開始更新 Supabase`);
        
        // 把 AI 回傳的答案原封不動寫入 ai_note 欄位
        const responseData = difyResponse.answer || '';
        
        // 查詢 Supabase 中的對應記錄並更新 ai_note
        await updateAiNoteInSupabase(questionId, responseData);
        
    } catch (error) {
        console.error('檢查錯誤時發生錯誤:', error);
        // 不中斷主流程，只記錄錯誤
    }
}

/**
 * 在 Supabase 中查詢並更新 ai_note 欄位
 * @param {number} documentId - 文檔 ID（knowledge_documents 表的 id 欄位）
 * @param {string} note - 要寫入的 AI 備註
 */
async function updateAiNoteInSupabase(documentId, note) {
    try {
        // 查詢對應的記錄
        const { data: document, error: queryError } = await supabase
            .from('knowledge_documents')
            .select('id, ai_note')
            .eq('id', documentId)
            .single();
        
        if (queryError) {
            console.error(`查詢 ID ${documentId} 時發生錯誤:`, queryError);
            return;
        }
        
        if (!document) {
            console.warn(`找不到 ID 為 ${documentId} 的記錄`);
            return;
        }
        
        // 更新 ai_note（如果已有內容，則追加）
        const currentNote = document.ai_note || '';
        const timestamp = new Date().toISOString();
        const newNote = currentNote 
            ? `${currentNote}\n\n[${timestamp}] 答題錯誤\n${note}`
            : `[${timestamp}] 答題錯誤\n${note}`;
        
        const { error: updateError } = await supabase
            .from('knowledge_documents')
            .update({ ai_note: newNote })
            .eq('id', documentId);
        
        if (updateError) {
            console.error(`更新 ID ${documentId} 的 ai_note 時發生錯誤:`, updateError);
        } else {
            console.log(`成功更新 ID ${documentId} 的 ai_note`);
        }
        
    } catch (error) {
        console.error(`處理 ID ${documentId} 時發生錯誤:`, error);
    }
}

/**
 * 延遲函數
 * @param {number} ms - 延遲時間（毫秒）
 * @returns {Promise}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default router;



