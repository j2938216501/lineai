import express from "express";

import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
dotenv.config();
const config = {
    channelSecret: process.env.LINE_SECRET_APPLE,
    channelAccessToken: 
process.env.LINE_ACCESS_TOKEN_APPLE
}
const client = new 
line.messagingApi.MessagingApiClient(config);

const router = express.Router();

//測試用get https://api-wiucuy53za-de.a.run.app/line_demo
router.get("/", (req, res) => {
  res.send("我是 linebot_demo webhook");
});
// 處理 line webhook https+post 
// 處理 line webhook
// 拿掉 line.middleware(config)
router.post("/", async (req, res) => {
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



export default router