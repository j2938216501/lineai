import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import OpenAI from "openai";

dotenv.config();

const config = {
    channelSecret: process.env.LINE_SECRET_APPLE,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_APPLE,
};

const client = new line.messagingApi.MessagingApiClient(config);
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const router = express.Router();

// ── 系統提示詞（可自行修改） ──────────────────────────────────────────
const SYSTEM_PROMPT = `
你是一個友善、幽默又有點可愛的 LINE AI 聊天機器人，名字叫「APPLE」。
你的個性特點：
- 😊 友善親切：對每個人都熱情有禮，讓使用者感覺被重視
- 😄 幽默風趣：適時加入一點小幽默或有趣的比喻，但不誇張
- 🤓 博學多聞：對各種話題都有一定了解，回答時條理清晰
- 💬 說話自然：用輕鬆的口吻對話，像朋友聊天一樣，避免過於正式
- 🇹🇼 使用繁體中文回覆

回覆原則：
- 回覆長度適中，不要太長（LINE 訊息不適合落落長的文字100字內,用繁體中文）
- 如果需要列點，適當使用 emoji 當作項目符號
- 遇到不確定的事情，誠實說不知道，並提議幫忙搜尋
- 需要最新資訊（天氣、新聞、時事、股價等）時，會自動使用搜尋工具
`.trim();

// ── 使用者位置（web_search 用） ───────────────────────────────────────
const USER_LOCATION = {
    type: "approximate",
    country: "TW",
    city: "Taipei",
    region: "Taiwan",
    timezone: "Asia/Taipei",
};

// ── 取得 AI 回應 ──────────────────────────────────────────────────────
async function getAIResponse(userMessage) {
    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: SYSTEM_PROMPT,
        tools: [
            {
                type: "web_search",
                user_location: USER_LOCATION,
            },
        ],
        input: [
            {
                role: "user",
                content: userMessage,
            },
        ],
        max_output_tokens: 500,
        temperature: 0.7,
        top_p: 1,
    });

    const hasWebSearch = response.output?.some(
        (o) => o.type === "web_search_call"
    );
    console.log("是否有觸發網路搜尋:", hasWebSearch);
    console.log("AI 回應:", response.output_text);

    return response.output_text || "抱歉，我不知道 😅";
}

// ── GET 測試 ──────────────────────────────────────────────────────────
router.get("/", (req, res) => {
    res.send("我是 linebot_ai webhook 🤖");
});

// ── POST Webhook ──────────────────────────────────────────────────────
router.post("/", (req, res, next) => {
    line.middleware(config)(req, res, (err) => {
        if (err) {
            console.error("LINE middleware 驗證失敗:", err);
            return res.status(200).send("OK"); // 驗證失敗也回 200，避免 LINE 重送
        }
        next();
    });
}, async (req, res) => {
    try {
        const events = req.body.events || [];

        for (const event of events) {
            if (event.type === "message" && event.message.type === "text") {
                const userMessage = event.message.text.trim();
                console.log("收到文字訊息:", userMessage);

                try {
                    const aiResponse = await getAIResponse(userMessage);

                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [
                            {
                                type: "text",
                                text: aiResponse,
                            },
                        ],
                    });
                    console.log("成功回覆訊息");
                } catch (aiError) {
                    console.error("處理 AI 回應時發生錯誤:", aiError);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [
                            {
                                type: "text",
                                text: "抱歉 發生錯誤，請稍後再試！😅",
                            },
                        ],
                    });
                }
            }
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("處理 webhook 時發生錯誤:", error);
        res.status(500).send("Error");
    }
});

export default router;