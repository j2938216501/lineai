// 測試linebot sdk, .env有無成功

import express from 'express';
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";

dotenv.config();
//dotenv.config({ path: ".env.local" });

const config = {
    channelSecret: process.env.LINE_SECRET_APPLE,
    channelAccessToken: 
process.env.LINE_ACCESS_TOKEN_APPLE
}

console.log(config,"測試 config");
const router = express.Router();

//line node sdk
const client = new line.messagingApi.MessagingApiClient(config);

router.get('/', (req, res) => {
    console.log(config,"_______");
    console.log(client, "client");
    res.send("我是 line_bot 機器人_測試"); // ✅ 正確：在路由內使用 res
});

export default router;