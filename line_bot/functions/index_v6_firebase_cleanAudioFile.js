import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import indexRouter from "./api/index.js";
import openaiRouter from "./api/openai.js";

import { processnotify } from "./scheduled/line_notify.js";


import linebotDemoRouter from "./api/linebot_demo.js";
import lineMbtiRouter from "./api/line_mbti.js";

import linebotAiRouter from "./api/linebot_ai.js";

import linebotFileRouter from "./api/linebot_file.js";

import linebotMainRouter from "./api/linebot_main.js";
import linebotNotifyRouter from "./api/linebot_notify_make.js"; //原來linebot_notify增加make 串google日曆+meet+gmail寄信+google文件合約建立功能
// import linebotNotifyRouter from "./api/linebot_notify.js";  //原來 linebot_notify
import linebotLanguageyRouter from "./api/linebot_language.js";
import linebotLanguageyRouter2 from "./api/linebot_language2.js";

import { onSchedule } from "firebase-functions/v2/scheduler"; // 排程函數

import { cleanOldTtsFiles } from "./scheduled/cleanup_tts.js";

const app = express();

//import { defineSecret } from "firebase-functions/params";

//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/line_demo
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/line_demo


// ✅ /line_demo 用 raw body（給 line.middleware 驗簽章用）
// ✅ 其他路由用 json
app.use((req, res, next) => {
  if (req.path.startsWith("/line_demo") || 
    req.path.startsWith("/line_mbti") || 
    req.path.startsWith("/linebot_ai") ||
    req.path.startsWith("/linebot_main") ||
    req.path.startsWith("/linebot_notify") || 
    req.path.startsWith("/linebot_notify_make") ||
    req.path.startsWith("/linebot_language") ||
    req.path.startsWith("/linebot_language2") ||
    req.path.startsWith("/linebot_file")) {
    express.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

app.use("/", indexRouter);

//openai 測試用
app.use("/openai",openaiRouter);



//第一個機器人APPLE
//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/line_demo
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/line_demo
app.use("/line_demo", linebotDemoRouter);

//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/line_mbti
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/line_mbti

app.use("/line_mbti", lineMbtiRouter);

//lineai聊天
//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_ai
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_ai
app.use("/linebot_ai", linebotAiRouter);


//lineai檔案上傳
//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_file
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_file

app.use("/linebot_file", linebotFileRouter);


// __________________________________________________________________________________________________________

//第二個機器人JUDY
//lineai通知
//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_notify
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_notify
app.use("/linebot_notify", linebotNotifyRouter);



//第三個機器人OREN 備份
//lineai通知
//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_language
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_language
app.use("/linebot_language", linebotLanguageyRouter);


//第四個機器人OREN
//lineai通知
//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_language2
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_language2
app.use("/linebot_language2", linebotLanguageyRouter2);




//webhook all全部
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_main
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_main
app.use("/linebot_main", linebotMainRouter);



export const api = onRequest(
  { 
    region: "asia-east1",
    cors: false,
    minInstances: 0,
    invoker: "public",
    ingressSettings: "ALLOW_ALL"
    //secrets: [defineSecret('LINE_SECRET_APPLE'),defineSecret('LINE_ACCESS_TOKEN_APPLE')]
  },
  app
);


// ==================== 排程函數 ===================
//通知排程器cron：每 5 分鐘執行一次，檢查並發送待處理的通知
export const checkAndSendNotifications = onSchedule(
  {
      schedule: "*/5 * * * *", // 每 1 分鐘執行一次 * * * * * ,firebase要錢,  5min一次 */5 * * * *
      timeZone: "Asia/Taipei",
      region: "asia-east1",
  },
  async (event) => {
      //你的程式碼
      await processnotify(); //通知主程式
  }
);


//cron排程手動測試 不要給linewebhook !!!
//正式網址：https://api-4ugb2fo6hq-de.a.run.app/checkAndSendNotify
//測試網址：https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/scheduled/checkAndSendNotify
app.get("/checkAndSendNotify", async (req, res) => {
    await processnotify(); //通知主程式
    //這也可以當做手動觸發通知檢查的API
    res.status(200).json({
        success: true,
        message: "通知檢查完成",
    });
});


/**
 * 語音檔清理排程：每天凌晨 4:00 執行一次，刪除 tts/ 資料夾中超過 1 天的語音檔案
 */
export const cleanupTtsAudios = onSchedule(
  {
      schedule: "0 4 * * *", // 每天 04:00
      timeZone: "Asia/Taipei",
      region: "asia-east1",
  },
  async (event) => {
      await cleanOldTtsFiles();
  }
);

// 手動觸發 TTS 清理（方便測試）
//正式網址：https://api-4ugb2fo6hq-de.a.run.app/cleanupTtsAudios
//測試網址 https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/cleanupTtsAudios

app.get("/cleanupTtsAudios", async (req, res) => {
  const result = await cleanOldTtsFiles();
  res.status(200).json({
      success: result.success,
      deletedCount: result.deletedCount ?? 0,
      skippedCount: result.skippedCount ?? 0,
      totalFiles: result.totalFiles ?? 0,
      message: result.message || (result.success ? "TTS 清理完成" : "TTS 清理失敗"),

      error: result.error || null,
  });
});




