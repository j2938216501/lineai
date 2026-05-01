import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import admin from "firebase-admin";
import { getDownloadURL } from "firebase-admin/storage";
import OpenAI from "openai";

import { createClient } from '@supabase/supabase-js';

dotenv.config();


// 載入SUPABASE環境變數
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)



// 初始化 Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}
const bucket = admin.storage().bucket();

// LINE Bot 設定
const config = {
    channelSecret: process.env.LINE_SECRET_APPLE,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_APPLE,
};
const client = new line.messagingApi.MessagingApiClient(config);
const blobClient = new line.messagingApi.MessagingApiBlobClient(config);

// OpenAI 設定
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const router = express.Router();

// ── 系統提示詞 ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
你是一個友善、幽默又有點可愛的 LINE AI 聊天機器人，名字叫「小艾」。
你的個性特點：
- 😊 友善親切：對每個人都熱情有禮，讓使用者感覺被重視
- 😄 幽默風趣：適時加入一點小幽默或有趣的比喻，但不誇張
- 🤓 博學多聞：對各種話題都有一定了解，回答時條理清晰
- 💬 說話自然：用輕鬆的口吻對話，像朋友聊天一樣，避免過於正式
- 🇹🇼 使用繁體中文回覆
回覆原則：
- 回覆長度適中，不要太長（LINE 訊息不適合落落長的文字）
- 如果需要列點，適當使用 emoji 當作項目符號
- 遇到不確定的事情，誠實說不知道，並提議幫忙搜尋
- 需要最新資訊（天氣、新聞、時事等）時，會自動使用搜尋工具
`.trim();

const USER_LOCATION = {
    type: "approximate",
    country: "TW",
    city: "Taipei",
    region: "Taiwan",
    timezone: "Asia/Taipei",
};

// MBTI JSON 來源
const MBTI_JSON_URL = "https://lineai-e8687.web.app/mbti_data.json";

// ── GET 測試 ──────────────────────────────────────────────────────────
router.get("/", (req, res) => {
    res.send("我是 linebot_main 統一入口 webhook 🤖");
});

// ── POST Webhook ──────────────────────────────────────────────────────
router.post("/", (req, res, next) => {
    line.middleware(config)(req, res, (err) => {
        if (err) {
            console.error("LINE middleware 驗證失敗:", err);
            return res.status(200).send("OK");
        }
        next();
    });
}, async (req, res) => {
    try {
        const events = req.body.events || [];

        for (const event of events) {
            if (event.type !== "message") continue;

            const messageType = event.message.type;
            const fileTypes = ["image", "video", "audio", "file"];

            if (messageType === "text") {
                const text = event.message.text.trim().toUpperCase();
                // MBTI 判斷：4字母格式
                if (/^[EI][NS][TF][JP]$/.test(text)) {
                    await handleMbti(event, text);
                } else {
                    // 一般對話 + 連網搜尋
                    await handleAI(event, event.message.text.trim());
                }
            } else if (fileTypes.includes(messageType)) {
                // 檔案備份
                await handleFile(event);
            }
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("處理 webhook 時發生錯誤:", error);
        res.status(500).send("Error");
    }
});

// ════════════════════════════════════════════════════════════════════
// MBTI 處理
// ════════════════════════════════════════════════════════════════════
async function handleMbti(event, mbtiType) {
    const mbtiData = await fetchMbtiData();
    if (!mbtiData) {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: "text", text: "抱歉，目前無法取得 MBTI 資料，請稍後再試 🙏" }],
        });
    }
    const info = mbtiData[mbtiType];
    if (!info) {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: "text", text: `找不到 ${mbtiType} 的相關資料，請確認輸入是否正確 🤔` }],
        });
    }
    await client.replyMessage({
        replyToken: event.replyToken,
        messages: [buildMbtiFlexMessage(info)],
    });
}

async function fetchMbtiData() {
    try {
        const response = await fetch(MBTI_JSON_URL);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

function buildMbtiFlexMessage(info) {
    return {
        type: "flex",
        altText: `${info.type} ${info.name} - MBTI 人格介紹`,
        contents: {
            type: "bubble",
            size: "giga",
            header: {
                type: "box", layout: "vertical", paddingAll: "20px", backgroundColor: info.color,
                contents: [
                    {
                        type: "box", layout: "horizontal",
                        contents: [
                            { type: "text", text: info.emoji, size: "3xl", flex: 0 },
                            {
                                type: "box", layout: "vertical", margin: "md",
                                contents: [
                                    { type: "text", text: info.type, color: "#FFFFFF", size: "xxl", weight: "bold" },
                                    { type: "text", text: info.name, color: "#FFFFFFCC", size: "lg", weight: "bold" },
                                ],
                            },
                        ],
                    },
                    { type: "text", text: info.tagline, color: "#FFFFFFDD", size: "sm", wrap: true, margin: "md" },
                ],
            },
            body: {
                type: "box", layout: "vertical", paddingAll: "20px", spacing: "lg",
                contents: [
                    { type: "box", layout: "vertical", spacing: "sm", contents: [
                        { type: "text", text: "📖 人格描述", weight: "bold", size: "md", color: info.color },
                        { type: "text", text: info.description, wrap: true, size: "sm", color: "#444444" },
                    ]},
                    { type: "separator" },
                    { type: "box", layout: "vertical", spacing: "sm", contents: [
                        { type: "text", text: "✨ 人格特質", weight: "bold", size: "md", color: info.color },
                        { type: "box", layout: "horizontal", contents: info.traits.map(trait => ({
                            type: "box", layout: "vertical", backgroundColor: info.color + "22",
                            cornerRadius: "20px", paddingAll: "8px", margin: "sm",
                            contents: [{ type: "text", text: trait, size: "xs", color: info.color, align: "center" }],
                        }))},
                    ]},
                    { type: "separator" },
                    { type: "box", layout: "horizontal", spacing: "md", contents: [
                        { type: "box", layout: "vertical", flex: 1, spacing: "xs", contents: [
                            { type: "text", text: "💪 優勢", weight: "bold", size: "sm", color: "#27AE60" },
                            ...info.strengths.map(s => ({ type: "text", text: `• ${s}`, size: "xs", color: "#555555", wrap: true })),
                        ]},
                        { type: "box", layout: "vertical", flex: 1, spacing: "xs", contents: [
                            { type: "text", text: "⚠️ 待成長", weight: "bold", size: "sm", color: "#E67E22" },
                            ...info.weaknesses.map(w => ({ type: "text", text: `• ${w}`, size: "xs", color: "#555555", wrap: true })),
                        ]},
                    ]},
                    { type: "separator" },
                    { type: "box", layout: "vertical", spacing: "sm", contents: [
                        { type: "text", text: "💼 適合職業", weight: "bold", size: "md", color: info.color },
                        { type: "text", text: info.careers.join("　|　"), size: "sm", color: "#444444", wrap: true },
                    ]},
                    { type: "separator" },
                    { type: "box", layout: "horizontal", spacing: "md", contents: [
                        { type: "box", layout: "vertical", flex: 1, spacing: "xs", contents: [
                            { type: "text", text: "🌟 名人代表", weight: "bold", size: "sm", color: info.color },
                            { type: "text", text: info.famous.join("、"), size: "xs", color: "#555555", wrap: true },
                        ]},
                        { type: "box", layout: "vertical", flex: 1, spacing: "xs", contents: [
                            { type: "text", text: "💑 最佳配對", weight: "bold", size: "sm", color: info.color },
                            { type: "text", text: info.compatibility.join(" / "), size: "xs", color: "#555555" },
                        ]},
                    ]},
                ],
            },
            footer: {
                type: "box", layout: "vertical", paddingAll: "16px", backgroundColor: "#F8F8F8",
                contents: [{ type: "text", text: "輸入任一 MBTI 類型繼續查詢，例如 ENTP 🔍", size: "xs", color: "#AAAAAA", align: "center", wrap: true }],
            },
        },
    };
}

// ════════════════════════════════════════════════════════════════════
// AI 對話 + 連網搜尋
// ════════════════════════════════════════════════════════════════════
async function handleAI(event, userMessage) {
    try {
        const response = await openai.responses.create({
            model: "gpt-4o-mini",
            instructions: SYSTEM_PROMPT,
            tools: [{ type: "web_search", user_location: USER_LOCATION }],
            input: [{ role: "user", content: userMessage }],
            max_output_tokens: 800,
            temperature: 0.8,
        });

        const aiText = response.output_text || "抱歉，我沒辦法回答這個問題 😅";
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: "text", text: aiText }],
        });
    } catch (error) {
        console.error("AI 回應錯誤:", error);
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: "text", text: "抱歉，我現在有點忙，請稍後再試！😅" }],
        });
    }
}

// ════════════════════════════════════════════════════════════════════
// 檔案備份
// ════════════════════════════════════════════════════════════════════
async function handleFile(event) {
    const messageId = event.message.id;
    const messageType = event.message.type;
    const originalFileName = event.message.fileName || null;

    try {
        const { buffer, contentType } = await downloadMessageContent(messageId);
        const ext = getExtensionFromType(messageType, contentType);
        const fileName = originalFileName || `${messageType}_${messageId}.${ext}`;

        const sourceInfo = getPushTargetFromSource(event.source);
        const storagePath = `${getStoragePath(sourceInfo, messageId)}/${fileName}`;

        const file = bucket.file(storagePath);
        await file.save(buffer, { metadata: { contentType } });

        const downloadURL = await getDownloadURL(file);

        const validSourceType = sourceInfo?.type || event.source?.type || 'user';
        const validSourceId = sourceInfo?.id || event.source?.userId || event.source?.groupId || event.source?.roomId || 'unknown';
        const { error: dbError } = await supabase.from('line_files').insert({
            message_id: messageId,
            message_type: messageType,
            source_type: validSourceType,
            source_id: validSourceId,
            original_file_name: originalFileName || null,
            storage_path: storagePath,
            file_size: buffer.length,
            content_type: contentType,
            download_url: downloadURL,
            duration: event.message.duration || 0,
            metadata: {
                replyToken: event.replyToken,
                timestamp: new Date().toISOString(),
                eventType: event.type,
                mode: event.mode,
                webhookEventId: event.webhookEventId,
                deliveryContext: event.deliveryContext,
                message: {
                    id: event.message.id,
                    type: event.message.type,
                    fileName: event.message.fileName,
                    fileSize: event.message.fileSize,
                    duration: event.message.duration
                },
                source: event.source
            }
        });
        if (dbError) console.error('寫入 Supabase 時發生錯誤:', dbError);
        else console.log('資料已成功寫入 Supabase');

        const fileSizeKB = (buffer.length / 1024).toFixed(2);

        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: "text",
                text: `✅ 檔案上傳成功！\n\n📄 檔名：${fileName}\n📦 大小：${fileSizeKB} KB\n🗂 類型：${contentType}\n\n🔗 下載連結：\n${downloadURL}`,
            }],
        });
    } catch (error) {
        console.error("處理檔案訊息時發生錯誤:", error);
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: "text", text: "😥 檔案上傳失敗，請稍後再試！" }],
        });
    }
}

async function downloadMessageContent(messageId) {
    console.log("開始下載檔案內容:", messageId);
    const stream = await blobClient.getMessageContent(messageId);
    let contentType = "application/octet-stream";

    const buffer = await new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });

    console.log(`檔案大小: ${buffer.length} bytes, Content-Type: ${contentType}`);
    return { buffer, contentType };
}

function getExtensionFromType(messageType, contentType) {
    const mimeMap = {
        "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
        "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/m4a": "m4a", "audio/aac": "aac",
        "application/pdf": "pdf", "application/zip": "zip",
    };
    if (mimeMap[contentType]) return mimeMap[contentType];
    const typeDefault = { image: "jpg", video: "mp4", audio: "m4a", file: "bin" };
    return typeDefault[messageType] || "bin";
}

function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return { type: "user", id: source.userId };
    if (source.type === "group" && source.groupId) return { type: "group", id: source.groupId };
    if (source.type === "room" && source.roomId) return { type: "room", id: source.roomId };
    return undefined;
}

function getStoragePath(sourceInfo, messageId) {
    if (!sourceInfo) return `unknown/${messageId}`;
    const prefix = sourceInfo.type === "group" ? "group" : "users";
    return `${prefix}/${sourceInfo.id}/${messageId}`;
}

export default router;