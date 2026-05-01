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

// OpenAI API 設定
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// 使用變數儲存每個使用者的 conversation_id
const conversationStore = {};

// 使用變數儲存每個使用者的當前題目 ID
const currentQuestionIdStore = {};

const router = express.Router();

router.get("/", (req, res) => {
  res.send("我是 linebot_quiz webhook");
});

// 處理 line webhook
router.post("/", line.middleware(config), async (req, res) => {
  try {
      const events = req.body.events || [];
      
      for (const event of events) {
          if (event.type === "message" && event.message.type === "text") {
              const userMessage = event.message.text.trim();
              const sourceId = getPushTargetFromSource(event.source);
              
              console.log('收到文字訊息:', userMessage);
              console.log('來源 ID:', sourceId);
              
              if (!sourceId) {
                  console.error('無法識別來源 ID');
                  continue;
              }

              const resetKeywords = ['切換測驗', '/切換測驗', 'exam', '牛刀小試', 'quiz', '考試', '測驗'];
              if (resetKeywords.includes(userMessage)) {
                  console.log('偵測到切換測驗關鍵字，清空所有變數...');
                  clearUserData(sourceId);
                  console.log('已清空所有變數，系統重新開始');
              }

              try {
                  const aiResponse = await callOpenAIAPI(userMessage, sourceId);
                  
                  await checkAndProcessError(aiResponse, sourceId, userMessage);
                  
                  saveCurrentQuestionId(aiResponse, sourceId);
                  
                  await client.replyMessage({
                      replyToken: event.replyToken,
                      messages: [{
                          type: 'text',
                          text: `📖 題目：\n${aiResponse.question}\n\n🤖 判斷結果：\n${aiResponse.answer}`
                      }]
                  });

                  console.log('成功回覆訊息');
              } catch (error) {
                  console.error('處理 API 回應時發生錯誤:', error);
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
 * 呼叫 OpenAI API
 */
async function callOpenAIAPI(query, sourceId) {
    // 檢查是否為回答（非切換測驗關鍵字）
    const isAnswer = !['切換測驗', '/切換測驗', 'exam', '牛刀小試', 'quiz', '考試', '測驗', '下一題', '下一題'].includes(query);
    
    let currentQ;
    if (isAnswer && currentQuestionIdStore[sourceId]) {
        // 回答：從資料庫抓原本的題目
        const { data } = await supabase
            .from('knowledge_documents')
            .select('*')
            .eq('id', currentQuestionIdStore[sourceId])
            .single();
        currentQ = data;
    } else {
        // 新題目：隨機抓
        const { data: questions } = await supabase
            .from('knowledge_documents')
            .select('*')
            .eq('collection_id', 2)
            .eq('show', true);
        currentQ = questions[Math.floor(Math.random() * questions.length)];
        currentQuestionIdStore[sourceId] = currentQ.id;
    }
    
    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: `題目：${currentQ.content}\n\n判斷使用者答案是否正確，並給予解說。` },
                { role: 'user', content: query }
            ]
        })
    });
    
    const data = await response.json();
    
    return {
        question: currentQ.content,
        answer: data.choices[0].message.content,
        metadata: {}
    };
}


function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
}

function clearUserData(sourceId) {
    if (conversationStore[sourceId]) {
        delete conversationStore[sourceId];
        console.log(`已清除 ${sourceId} 的 conversation_id`);
    }
    
    if (currentQuestionIdStore[sourceId]) {
        delete currentQuestionIdStore[sourceId];
        console.log(`已清除 ${sourceId} 的當前題目 ID`);
    }
}

function saveCurrentQuestionId(aiResponse, sourceId) {
    try {
        const retrieverResources = aiResponse.metadata?.retriever_resources || [];
        
        if (retrieverResources.length === 0) {
            console.log('沒有檢索資源，跳過儲存題目 ID');
            return;
        }
        
        const firstResource = retrieverResources[0];
        const content = firstResource.content || '';
        
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

async function checkAndProcessError(aiResponse, sourceId, userMessage) {
    try {
        const answer = aiResponse.answer || '';
        
        if (!answer) {
            console.log('沒有答案，跳過檢查');
            return;
        }
        
        const errorKeywords = ['答案不正確', '答案錯誤', '錯誤', '不正確', '不正確的答案'];
        const hasError = errorKeywords.some(keyword => answer.includes(keyword));
        
        if (!hasError) {
            console.log('答案中沒有錯誤提示，無需處理');
            return;
        }
        
        console.log('偵測到答案錯誤，開始提取題目 ID...');
        
        const questionId = currentQuestionIdStore[sourceId];
        
        if (!questionId) {
            console.warn('找不到當前題目的 ID');
            return;
        }
        
        console.log(`找到題目 ID: ${questionId}，開始更新 Supabase`);
        
        const responseData = aiResponse.answer || '';
        
        await updateAiNoteInSupabase(questionId, responseData);
        
    } catch (error) {
        console.error('檢查錯誤時發生錯誤:', error);
    }
}

async function updateAiNoteInSupabase(documentId, note) {
    try {
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default router;