import express from "express";

import dotenv from "dotenv";
import * as line from "@line/bot-sdk";

import { createClient } from '@supabase/supabase-js';
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

dotenv.config();
//dotenv.config({ path: ".env.local" });

// JUDY BOT=通知秘書
const config = {
    channelSecret: process.env.LINE_SECRET_JUDY,
    channelAccessToken: 
process.env.LINE_ACCESS_TOKEN_JUDY
}
const client = new 
line.messagingApi.MessagingApiClient(config);

const router = express.Router();

//測試用get https://api-wiucuy53za-de.a.run.app/line_demo
router.get("/", (req, res) => {
  res.send("我是 linebot_notify webhook");
});
// 處理 line webhook https+post 
// 處理 line webhook
// 拿掉 line.middleware(config)

// 處理 line webhook
router.post("/", line.middleware(config), async (req, res) => {
    try {
        // LINE 會將事件放在 req.body.events 陣列中
        const events = req.body.events || [];
        console.log(events,"events")
        // 處理每個事件
        for (const event of events) {
            // 檢查是否為文字訊息事件
            if (event.type === "message" && event.message.type === "text") {
                const userMessage = event.message.text.trim(); // 取得文字內容並去除空白
                
                console.log('收到文字訊息:', userMessage);
                
                try {
                    // 調用 OpenAI 進行對話，並使用通知 function tool
                    const aiResponse = await getAIResponse(userMessage, event.source);
                    // 回覆訊息給使用者
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: aiResponse
                        }]
                    });
                    
                    console.log('成功回覆訊息');
                } catch (error) {
                    console.error('處理 AI 回應時發生錯誤:', error);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '抱歉，現在有點忙請稍後再試！😅'
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
   * 調用 OpenAI 獲取 AI 回應
   * 當使用者提到「通知我」等相關訊息時，會自動觸發 notify_me function tool
   */
  async function getAIResponse(userMessage, source) {
      // 定義通知功能的 function tool
      const tools = [{
          type: "function",
          name: "notify_me",
          description: "當使用者要求設定通知、提醒或需要被通知時使用此功能。例如：通知我、提醒我、記得告訴我等相關訊息。",
          parameters: {
              type: "object",
              properties: {
                  message: {
                      type: "string",
                      description: "需要通知的內容"
                  },
                  time: {
                      type: "string",
                      description: "通知的時間，ISO 格式：2025-02-21T12:00:00（台北時區）"
                  }
              },
              required: ["message","time"],
              additionalProperties: false,
          },
          strict: true,
      }];
  
      // 設定 instructions，明確告訴 AI 何時觸發 function
      const instructions = `
          你是一個通知助理，專門幫助使用者設定提醒和通知。
  
          重要規則：
          - 當使用者提到以下任何關鍵字或類似意思時，你「必須」使用 notify_me function：
          * 「通知我」
          * 「提醒我」
          * 「記得告訴我」
          * 「幫我處理」
          * 「設定提醒」
          * 「記得提醒我」
          * 任何要求設定通知、提醒的訊息
          
          - 如果通知的內容沒有明確的『時』和『分』（例如「明天請通知我去繳費」），則通知的『時』、『分』為參考現在的時間，例如：現在是5點10分，則通知的時間就是明天5點10分。
  
          - 使用繁體中文回覆
          - 回覆親切、友善
          - 當觸發 notify_me function 時，要從使用者的訊息中提取：
          * message: 需要通知的內容
          * time: 時間資訊
  
          範例：
          使用者：「通知我明天下午3點開會」
          → 你應該調用 notify_me function，參數：
          - message: "明天下午3點開會"
          - time: "明天下午3點"
  
          使用者：「提醒我去繳費」
          → 你應該調用 notify_me function，參數：
          - message: "提醒我去繳費"
          - time: "明天5點10分"
  `
      const response = await openai.responses.create({
          model: "gpt-4o-mini",
          instructions,
          tools,
          input: [
              {
                  role: "user",
                  content: userMessage
              }
          ],
          temperature: 0.7,
          max_output_tokens: 500,
      });
  
      let output_text = response.output_text;
      // 檢查是否有觸發 function call
     for (const item of response.output) {
          if (item.type === "function_call") {
            if (item.name == "notify_me"){
              return item.arguments;
            } 
          }
      }  
      
      return output_text;
    
  }
  
  
  function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
  }
  // 延遲的功能
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  

export default router