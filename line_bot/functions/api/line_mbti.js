import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";

dotenv.config();
//dotenv.config({ path: ".env.local" });

const config = {
    channelSecret: process.env.LINE_SECRET_APPLE,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_APPLE,
};

const client = new line.messagingApi.MessagingApiClient(config);

const router = express.Router();

const MBTI_JSON_URL = "https://lineai-e8687.web.app/mbti_data.json";

// 測試用 GET
router.get("/", (req, res) => {
    res.send("我是 line_mbti webhook");
});

// 處理 LINE Webhook
router.post("/", (req, res, next) => {
    line.middleware(config)(req, res, (err) => {
        if (err) {
            console.error("LINE middleware 驗證失敗:", err);
            return res.status(200).send("OK"); // 驗失敗也回200，避免LINE重送
        }
        next();
    });
}, async (req, res) => {
    try {
        const events = req.body.events || [];

        for (const event of events) {
            if (event.type === "message" && event.message.type === "text") {
                const userInput = event.message.text.trim().toUpperCase();
                console.log("收到文字訊息:", userInput);

                // 判斷是否為有效的 MBTI 類型 (4個字母)
                const mbtiRegex = /^[EI][NS][TF][JP]$/;
                if (mbtiRegex.test(userInput)) {
                    // 從 Firebase Hosting 取得 MBTI 資料
                    const mbtiData = await fetchMbtiData();

                    if (!mbtiData) {
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [
                                {
                                    type: "text",
                                    text: "抱歉，目前無法取得 MBTI 資料，請稍後再試 🙏",
                                },
                            ],
                        });
                        continue;
                    }

                    const info = mbtiData[userInput];

                    if (!info) {
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [
                                {
                                    type: "text",
                                    text: `找不到 ${userInput} 的相關資料，請確認輸入是否正確 🤔`,
                                },
                            ],
                        });
                        continue;
                    }

                    // 回傳 Flex Message
                    const flexMessage = buildMbtiFlexMessage(info);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [flexMessage],
                    });

                } else {
                    // 輸入不是 MBTI 格式，給予提示
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [
                            {
                                type: "text",
                                text: "👋 歡迎使用 MBTI 查詢！\n\n請輸入你的 MBTI 類型，例如：\nINFJ、ENTP、ISFP\n\n共有 16 種人格類型可供查詢 🧠",
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

// 從 Firebase Hosting 取得 MBTI JSON 資料
async function fetchMbtiData() {
    try {
        const response = await fetch(MBTI_JSON_URL);
        if (!response.ok) {
            console.error("取得 MBTI 資料失敗，狀態碼:", response.status);
            return null;
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("fetch MBTI JSON 時發生錯誤:", error);
        return null;
    }
}

// 建立 MBTI Flex Message
function buildMbtiFlexMessage(info) {
    return {
        type: "flex",
        altText: `${info.type} ${info.name} - MBTI 人格介紹`,
        contents: {
            type: "bubble",
            size: "giga",
            // ── Header ──
            header: {
                type: "box",
                layout: "vertical",
                paddingAll: "20px",
                backgroundColor: info.color,
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: info.emoji,
                                size: "3xl",
                                flex: 0,
                                margin: "none",
                            },
                            {
                                type: "box",
                                layout: "vertical",
                                margin: "md",
                                contents: [
                                    {
                                        type: "text",
                                        text: info.type,
                                        color: "#FFFFFF",
                                        size: "xxl",
                                        weight: "bold",
                                    },
                                    {
                                        type: "text",
                                        text: info.name,
                                        color: "#FFFFFFCC",
                                        size: "lg",
                                        weight: "bold",
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        type: "text",
                        text: info.tagline,
                        color: "#FFFFFFDD",
                        size: "sm",
                        wrap: true,
                        margin: "md",
                    },
                ],
            },
            // ── Body ──
            body: {
                type: "box",
                layout: "vertical",
                paddingAll: "20px",
                spacing: "lg",
                contents: [
                    // 人格描述
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: "📖 人格描述",
                                weight: "bold",
                                size: "md",
                                color: info.color,
                            },
                            {
                                type: "text",
                                text: info.description,
                                wrap: true,
                                size: "sm",
                                color: "#444444",
                            },
                        ],
                    },
                    // 分隔線
                    { type: "separator" },
                    // 人格特質
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: "✨ 人格特質",
                                weight: "bold",
                                size: "md",
                                color: info.color,
                            },
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: info.traits.map((trait) => ({
                                    type: "box",
                                    layout: "vertical",
                                    backgroundColor: info.color + "22",
                                    cornerRadius: "20px",
                                    paddingAll: "8px",
                                    margin: "sm",
                                    contents: [
                                        {
                                            type: "text",
                                            text: trait,
                                            size: "xs",
                                            color: info.color,
                                            align: "center",
                                        },
                                    ],
                                })),
                            },
                        ],
                    },
                    // 分隔線
                    { type: "separator" },
                    // 優勢 & 劣勢
                    {
                        type: "box",
                        layout: "horizontal",
                        spacing: "md",
                        contents: [
                            // 優勢
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 1,
                                spacing: "xs",
                                contents: [
                                    {
                                        type: "text",
                                        text: "💪 優勢",
                                        weight: "bold",
                                        size: "sm",
                                        color: "#27AE60",
                                    },
                                    ...info.strengths.map((s) => ({
                                        type: "text",
                                        text: `• ${s}`,
                                        size: "xs",
                                        color: "#555555",
                                        wrap: true,
                                    })),
                                ],
                            },
                            // 劣勢
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 1,
                                spacing: "xs",
                                contents: [
                                    {
                                        type: "text",
                                        text: "⚠️ 待成長",
                                        weight: "bold",
                                        size: "sm",
                                        color: "#E67E22",
                                    },
                                    ...info.weaknesses.map((w) => ({
                                        type: "text",
                                        text: `• ${w}`,
                                        size: "xs",
                                        color: "#555555",
                                        wrap: true,
                                    })),
                                ],
                            },
                        ],
                    },
                    // 分隔線
                    { type: "separator" },
                    // 適合職業
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "sm",
                        contents: [
                            {
                                type: "text",
                                text: "💼 適合職業",
                                weight: "bold",
                                size: "md",
                                color: info.color,
                            },
                            {
                                type: "text",
                                text: info.careers.join("　|　"),
                                size: "sm",
                                color: "#444444",
                                wrap: true,
                            },
                        ],
                    },
                    // 分隔線
                    { type: "separator" },
                    // 名人代表 & 最佳配對
                    {
                        type: "box",
                        layout: "horizontal",
                        spacing: "md",
                        contents: [
                            // 名人代表
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 1,
                                spacing: "xs",
                                contents: [
                                    {
                                        type: "text",
                                        text: "🌟 名人代表",
                                        weight: "bold",
                                        size: "sm",
                                        color: info.color,
                                    },
                                    {
                                        type: "text",
                                        text: info.famous.join("、"),
                                        size: "xs",
                                        color: "#555555",
                                        wrap: true,
                                    },
                                ],
                            },
                            // 最佳配對
                            {
                                type: "box",
                                layout: "vertical",
                                flex: 1,
                                spacing: "xs",
                                contents: [
                                    {
                                        type: "text",
                                        text: "💑 最佳配對",
                                        weight: "bold",
                                        size: "sm",
                                        color: info.color,
                                    },
                                    {
                                        type: "text",
                                        text: info.compatibility.join(" / "),
                                        size: "xs",
                                        color: "#555555",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            // ── Footer ──
            footer: {
                type: "box",
                layout: "vertical",
                paddingAll: "16px",
                backgroundColor: "#F8F8F8",
                contents: [
                    {
                        type: "text",
                        text: "輸入任一 MBTI 類型繼續查詢，例如 ENTP 🔍",
                        size: "xs",
                        color: "#AAAAAA",
                        align: "center",
                        wrap: true,
                    },
                ],
            },
        },
    };
}

export default router;
