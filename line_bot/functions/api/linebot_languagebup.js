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
    channelSecret: process.env.LINE_SECRET_OREN,
    channelAccessToken: 
process.env.LINE_ACCESS_TOKEN_OREN
}
const client = new 
line.messagingApi.MessagingApiClient(config);

const router = express.Router();

//測試用get https://api-wiucuy53za-de.a.run.app/line_demo
router.get("/", (req, res) => {
  res.send("我是 linebot_language webhook");
});
// 處理 line webhook https+post 
// 處理 line webhook
// 拿掉 line.middleware(config)

//echo 你傳AAA, LINE BOT回AAA一樣文字內容
router.post("/", line.middleware(config), async (req, res) => {
    try {
        const events = req.body.events || [];
        for (const event of events) {
            if (event.type === "message" && event.message.type === "text") {
                const text = event.message.text;
                console.log('收到文字訊息 :', text);
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{
                        type: 'text',
                        text: text
                    }]
                });

                await sleep(2000); //延遲2秒

                const source = event.source;
                const sourceId = getPushTargetFromSource(source);
                // Push Message 範例 - 發送到個人、群組或聊天室
                // sourceId 可以是 userId、groupId 或 roomId
                if (sourceId) {
                    try {
                        await client.pushMessage({
                            to: sourceId, // 可以是個人、群組或聊天室的 ID
                            messages: [{
                            type: 'text',
                            text: ` 這是透過 Push Message 發送到
                            ${source.type}的訊息！`
                            }]
                        });
                        console.log(`Push Message 發送到${source.type}
                        成功`);
                    } catch (error) {
                        console.error(`Push Message 發送到
                        ${source.type}失敗:`, error);
                    }
                }

            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('處理 webhook 時發生錯誤:', error);
        res.status(500).send('Error');
    }
});

/*
老師版本
router.post("/", line.middleware(config), async (req, res) => {
    try {
        // LINE 會將事件放在 req.body.events 陣列中
        const events = req.body.events || [];
        // 
處理每個事件
        for (const event of events) {
            // 
檢查是否為文字訊息事件
            if (event.type === "message" && event.message.type === "text") {
                const text = event.message.text; // 取得文字內容
                console.log('收到文字訊息 :', text);
                // 
自動回覆相同的文字
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{
                        type: 'text',
                        text: text
                    }]
                });
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('處理 webhook 時發生錯誤:', error);
        res.status(500).send('Error');
    }
});


*/

// push msg
function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) 
return source.userId;
    if (source.type === "group" && source.groupId) 
return source.groupId;
    if (source.type === "room" && source.roomId) 
return source.roomId;
    return undefined;
}
 //做延遲功能 sleep
  function sleep(ms) {
    return new Promise(resolve => 
setTimeout(resolve, ms));
}  


export default router