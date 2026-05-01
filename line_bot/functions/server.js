import express from "express";
import indexRouter from "./api/index.js";
import openaiRouter from "./api/openai.js";
import linebotDemoRouter from "./api/linebot_demo.js";
import lineMbtiRouter from "./api/line_mbti.js";
import linebotAiRouter from "./api/linebot_ai.js";
import linebotFileRouter from "./api/linebot_file.js";
import linebotMainRouter from "./api/linebot_main.js";
import linebotNotifyRouter from "./api/linebot_notify_make.js";
import linebotLanguageyRouter from "./api/linebot_languagebup.js";
import linebotLanguageDemoRouter from "./api/linebot_language/demo.js";
import linebotLanguageWordRouter from "./api/linebot_language/word.js";
import linebotLanguageSentenceRouter from "./api/linebot_language/sentence.js";
import linebotLanguageSpeakingRouter from "./api/linebot_language/speaking.js";
import linebotLanguageQuizRouter from "./api/linebot_language/quiz.js";
import firecrawlDemoRouter from "./api/firecrawl_demo.js";
import difySupabaseRouter from "./api/dify_supabase.js";
import { createStateSwitcher } from "./middleware/state_switcher.js";
import { processnotify } from "./scheduled/line_notify.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();

// ✅ LINE webhook 路由用 raw body，其他用 json
app.use((req, res, next) => {
  if (
    req.path.startsWith("/line_demo") ||
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
    req.path.startsWith("/linebot_file")
  ) {
    express.raw({ type: "application/json" })(req, res, next);
  } else {
    express.json()(req, res, next);
  }
});

app.use("/", indexRouter);
app.use("/openai", openaiRouter);
app.use("/line_demo", linebotDemoRouter);
app.use("/line_mbti", lineMbtiRouter);
app.use("/linebot_ai", linebotAiRouter);
app.use("/linebot_file", linebotFileRouter);
app.use("/linebot_notify", linebotNotifyRouter);
app.use("/linebot_languagebup", linebotLanguageyRouter);
app.use("/firecrawl_demo", firecrawlDemoRouter);
app.use("/dify", difySupabaseRouter);
app.use("/linebot_main", linebotMainRouter);

// 語言機器人 OREN 功能切換
const functionMapping = {
  demo: "demo", "/demo": "demo", 範例: "demo", 示範: "demo", 切換範例: "demo", "/切換範例": "demo",
  單字卡: "word", 單字: "word", word: "word", vocabulary: "word", 切換單字卡: "word", "/切換單字卡": "word",
  句型卡: "sentence", 句型: "sentence", sentence: "sentence", 切換句型: "sentence", 切換句型卡: "sentence", "/切換句型卡": "sentence",
  口說: "speaking", 口說練習: "speaking", 口語練習: "speaking", 口語: "speaking", 口語表達: "speaking",
  表達: "speaking", speaking: "speaking", speak: "speaking", 切換口說: "speaking", "/切換口說": "speaking",
  牛刀小試: "quiz", exam: "quiz", quiz: "quiz", 考試: "quiz", 測驗: "quiz", 切換測驗: "quiz", "/切換測驗": "quiz",
};

const functionRouterMap = {
  default: linebotLanguageWordRouter,
  demo: linebotLanguageDemoRouter,
  word: linebotLanguageWordRouter,
  sentence: linebotLanguageSentenceRouter,
  speaking: linebotLanguageSpeakingRouter,
  quiz: linebotLanguageQuizRouter,
};

const context = { languageName: "英文" };

app.use("/linebot_language", createStateSwitcher(functionMapping, functionRouterMap, context));
app.use("/line_language", createStateSwitcher(functionMapping, functionRouterMap, context));

// 排程手動觸發
app.get("/checkAndSendNotify", async (req, res) => {
  await processnotify();
  res.status(200).json({ success: true, message: "通知檢查完成" });
});

// 健康檢查
app.get("/health", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
