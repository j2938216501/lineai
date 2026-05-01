import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import indexRouter from "./api/index.js";
import openaiRouter from "./api/openai.js";

import linebotDemoRouter from "./api/linebot_demo.js";
import lineMbtiRouter from "./api/line_mbti.js";

import linebotAiRouter from "./api/linebot_ai.js";



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
    req.path.startsWith("/linebot_ai")) {
    express.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

app.use("/", indexRouter);

//openai 測試用
app.use("/openai",openaiRouter);



//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/line_demo
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/line_demo
app.use("/line_demo", linebotDemoRouter);

//webhook
//正式 firebase雲端 url https://api-4ugb2fo6hq-de.a.run.app/line_mbti
//測試 本機 url  https://blameable-kristin-proindustrialization.ngrok-free.dev/lineai-e8687/asia-east1/api/line_mbti

app.use("/line_mbti", lineMbtiRouter);

//lineai聊天
app.use("/linebot_ai", linebotAiRouter);

export const api = onRequest(
  { 
    region: "asia-east1",
    cors: false,
    minInstances: 0,
    invoker: "public",
    ingressSettings: "ALLOW_ALL"
    //secrets: [defineSecret('LINE_SECRET_BOB_V1'),defineSecret('LINE_ACCESS_TOKEN_APPLE')]
  },
  app
);