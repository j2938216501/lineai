import express from "express";

import dotenv from "dotenv";
import * as line from "@line/bot-sdk";

import { createClient } from '@supabase/supabase-js';
import OpenAI from "openai";

import admin from "firebase-admin";
import { getDownloadURL } from "firebase-admin/storage";
// 初始化 Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}
// 取得 Firebase Storage 實例
const bucket = admin.storage().bucket();


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
    channelSecret: process.env.LINE_SECRET_OREN2,
    channelAccessToken:
        process.env.LINE_ACCESS_TOKEN_OREN2
}
const client = new line.messagingApi.MessagingApiClient(config);
const blobClient = new line.messagingApi.MessagingApiBlobClient(config); // 用於下載語音檔案



const router = express.Router();

//測試用get https://api-wiucuy53za-de.a.run.app/line_demo
router.get("/", (req, res) => {
  res.send("我是 linebot_language2 webhook");
});
// 處理 line webhook https+post 
// 處理 line webhook
// 拿掉 line.middleware(config)

//echo 你傳AAA, LINE BOT回AAA一樣文字內容
router.post("/", line.middleware(config), async (req, res) => {
    try {
        const events = req.body.events || [];
        for (const event of events) {

            // 檢查是否為語音訊息事件
            if (event.type === "message" && event.message.type === "audio") {
                console.log('收到語音訊息:', event.message.id);

                try {
                    // 將語音轉換為原文文字
                    const userMessage = await convertAudioToText(event.message.id);

                    if (!userMessage || userMessage.trim() === '') {
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: '抱歉，無法辨識語音內容，請再試一次。'
                            }]
                        });
                        continue;
                    }

                    console.log('語音轉換後的文字:', userMessage);

                    // 回覆訊息給使用者（第一筆：顯示轉換的文字，第二筆：AI 回應）
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [
                            {
                                type: 'text',
                                text: `📝 ${userMessage}`
                            }
                        ]
                    });

                    console.log('成功回覆語音訊息');
                } catch (error) {
                    console.error('處理語音訊息時發生錯誤:', error);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '抱歉，處理語音訊息時發生錯誤，請稍後再試！😅'
                        }]
                    });
                }
                continue;
            }

            // 文字訊息 → 轉語音
            if (event.type === "message" &&
                event.message.type === "text") {
                const text = event.message.text; // 取得文字內容
               

                console.log('收到文字訊息，準備轉語音:',
                    text);
                const messages = await
                    buildTtsVoiceMessages(text,
                        event.message.id);
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages
                });
            }

            //echo push msg
            // if (event.type === "message" && event.message.type === "text") {
            //     const text = event.message.text;
            //     console.log('收到文字訊息 :', text);
            //     await client.replyMessage({
            //         replyToken: event.replyToken,
            //         messages: [{
            //             type: 'text',
            //             text: text
            //         }]
            //     });

            //     await sleep(2000); //延遲2秒

            //     const source = event.source;
            //     const sourceId = getPushTargetFromSource(source);
            //     // Push Message 範例 - 發送到個人、群組或聊天室
            //     // sourceId 可以是 userId、groupId 或 roomId
            //     if (sourceId) {
            //         try {
            //             await client.pushMessage({
            //                 to: sourceId, // 可以是個人、群組或聊天室的 ID
            //                 messages: [{
            //                 type: 'text',
            //                 text: ` 這是透過 Push Message 發送到
            //                 ${source.type}的訊息！`
            //                 }]
            //             });
            //             console.log(`Push Message 發送到${source.type}
            //             成功`);
            //         } catch (error) {
            //             console.error(`Push Message 發送到
            //             ${source.type}失敗:`, error);
            //         }
            //     }

            // }
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


/* 語音->文字 stt
 *將語音訊息轉換為繁體中文文字
 *@param {string} messageId - LINE 語音訊息 ID
 *@returns {Promise<string>} 轉換後的繁體中文文字
*/
async function convertAudioToText(messageId) {
    try {
        console.log('開始下載語音檔案:', messageId);

        // 從 LINE 下載語音檔案
        const response = await blobClient.getMessageContentWithHttpInfo(messageId);

        // 收集音訊資料
        const chunks = [];
        for await (const chunk of response.body) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);

        console.log('語音檔案下載完成，大小:', (audioBuffer.length / 1024).toFixed(2), 'KB');

        // 使用 Node.js 22 的原生 File API 建立檔案物件
        // OpenAI SDK 可以直接接受 File 物件
        const audioFile = new File(
            [audioBuffer],
            'audio.m4a',
            { type: 'audio/m4a' }
        );

        // 使用 OpenAI gpt-4o-mini-transcribe 
        console.log('開始語音轉文字...');
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'gpt-4o-mini-transcribe'
        });

        const transcribedText = typeof transcription === 'string' ? transcription : transcription.text || '';
        console.log('語音轉文字完成:', transcribedText);

        return transcribedText.trim();
    } catch (error) {
        console.error('語音轉文字時發生錯誤:', error);
        throw new Error(`語音轉換失敗: ${error.message}`);
    }
}

// 產生「文字轉語音」所需的 LINE 訊息陣列（交由外層放入 messages）
async function buildTtsVoiceMessages(text, messageId) {
    try {
        // 1. 呼叫 OpenAI TTS 產生語音（mp3）
        const speech = await openai.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice: "alloy",
            input: text,
            //instructions: "你說話時可以慢一點，非常慢"
        });

        const audioBuffer = Buffer.from(await speech.arrayBuffer());

        // 2. 上傳到 Firebase Storage 取得公開 URL
        const filePath = `tts/${Date.now()}_${messageId}`;
        const file = bucket.file(filePath);

        await file.save(audioBuffer, {
            metadata: {
                contentType: "audio/wav",
                metadata: {
                    source: "linebot_tts",
                    text: text.slice(0, 200)
                }
            }
        });

        const publicUrl = await getDownloadURL(file);

        // 3. 粗估語音長度（毫秒）給 LINE 使用
        const durationMs = estimateSpeechDurationMs(text);

        // 回傳可直接塞到 LINE messages 的陣列
        console.log("語音訊息已產生，URL:", publicUrl);
        return [
            {
                type: "audio",
                originalContentUrl: publicUrl,
                duration: durationMs
            }
        ];
    } catch (error) {
        console.error("產生語音時發生錯誤:", error);
        // 發生錯誤就改回傳文字訊息陣列，讓外層照常 replyMessage
        return [
            {
                type: "text",
                text: "❌ 目前無法產生語音，先用文字回覆您：\n\n" + text
            }
        ];
    }
}


// 粗估語音長度（針對「中文 + 其他語言混合」的情境）
// 假設：
// - 中文：大約 3～4 個字 / 秒（這裡抓 3 字 / 秒，比較保守，時間會稍微長一點）
// - 其他字元（英文、數字、符號）：大約 6 個字元 / 秒
function estimateSpeechDurationMs(text) {
    const clean = (text || "").trim();
    if (!clean) return 2000;

    // 計算中文字數
    const chineseMatches = clean.match(/[\u4e00-\u9fff]/g) || [];
    const chineseCount = chineseMatches.length;

    // 其他字元數（英文、數字、標點、空白等）
    const otherCount = Math.max(0, clean.length - chineseCount);

    // 中文：3 字 / 秒；其他：6 字 / 秒
    const chineseSeconds = chineseCount / 3;
    const otherSeconds = otherCount / 6;

    let seconds = chineseSeconds + otherSeconds;

    // 設一個合理區間，避免太短或太長
    seconds = Math.max(1.5, Math.min(90, seconds));

    return Math.round(seconds * 1000);
}





export default router