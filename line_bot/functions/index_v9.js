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
// import linebotLanguageyRouter from "./api/linebot_language.js"; //備份文字Oren
import linebotLanguageyRouter from "./api/linebot_languagebup.js"; //備份文字Oren bot改languagebup

// import linebotLanguageyRouter2 from "./api/linebot_language2.js"; //語言助理Oren Language bot

//語言助理Oren Language bot rich menu進階切換版
import linebotLanguageDemoRouter from "./api/linebot_language/demo.js";
import linebotLanguageWordRouter from "./api/linebot_language/word.js";
import linebotLanguageSentenceRouter from "./api/linebot_language/sentence.js";
import linebotLanguageSpeakingRouter from "./api/linebot_language/speaking.js";
import linebotLanguageQuizRouter from "./api/linebot_language/quiz.js";


import { onSchedule } from "firebase-functions/v2/scheduler"; // 排程函數

// line選單地圖rich menu切換功能
import { createStateSwitcher } from "./middleware/state_switcher.js";

//firecrawl
import firecrawlDemoRouter from "./api/firecrawl_demo.js";



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
    req.path.startsWith("/linebot_languagebup") ||
    req.path.startsWith("/linebot_language") ||
    req.path.startsWith("/line_language") ||
    req.path.startsWith("/linebot_language2") ||
    req.path.startsWith("/firecrawl_demo") ||
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
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_languagebup
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_languagebup
app.use("/linebot_languagebup", linebotLanguageyRouter);


//第四個機器人OREN
//lineai通知
//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_language2
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_language2
// app.use("/linebot_language2", linebotLanguageyRouter2); // Oren Language BOT=語言秘書

//Oren Language BOT=語言秘書 進階切換版
// 功能切換關鍵字對應表（使用者輸入 -> 功能名稱）
const functionMapping = {
  'demo': 'demo',
  '/demo': 'demo',
  '範例': 'demo',
  '示範': 'demo',
  '切換範例': 'demo',
  '/切換範例': 'demo',
  '單字卡': 'word',
  '單字': 'word',
  'word': 'word',
  'vocabulary': 'word',
  '切換單字卡': 'word',
  '/切換單字卡': 'word',
  '句型卡': 'sentence',
  '句型': 'sentence',
  'sentence': 'sentence',
  '切換句型': 'sentence',
  '切換句型卡': 'sentence',
  '/切換句型卡': 'sentence',
  '口說': 'speaking',
  '口說練習': 'speaking',
  '口語練習': 'speaking',
  '口語': 'speaking',
  '口語表達': 'speaking',
  '表達': 'speaking',
  'speaking': 'speaking',
  'speak': 'speaking',
  '切換口說': 'speaking',
  '/切換口說': 'speaking',
  '牛刀小試': 'quiz',
  'exam': 'quiz',
  'quiz': 'quiz',
  '考試': 'quiz',
  '測驗': 'quiz',
  '切換測驗': 'quiz',
  '/切換測驗': 'quiz'
};
// 功能名稱對應 Router (請留意 LINE Bot 的 config 是否正確)
const functionRouterMap = {
  'default': linebotLanguageWordRouter,
  'demo': linebotLanguageDemoRouter, 
  'word': linebotLanguageWordRouter,
  'sentence': linebotLanguageSentenceRouter,
  'speaking': linebotLanguageSpeakingRouter,
  'quiz': linebotLanguageQuizRouter
};

const context = {
  languageName: '英文', // 可隨時更改語言名稱
  // 可以在這裡加入其他額外資訊：接收方式 req.context.languageName
};

//第四個機器人OREN - 原始版本
//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/linebot_language
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/linebot_language
app.use("/linebot_language", createStateSwitcher(
  functionMapping,
  functionRouterMap,
  context
));

//第四個機器人OREN - 新版本
//webhook  
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/line_language
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/line_language
app.use("/line_language", createStateSwitcher(
  functionMapping,
  functionRouterMap,
  context
));


//firecrawl 爬蟲抓取資料
//正式網址：https://api-4ugb2fo6hq-de.a.run.app/firecrawl_demo
//測試網址：https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/firecrawl_demo
app.use("/firecrawl_demo", firecrawlDemoRouter);






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