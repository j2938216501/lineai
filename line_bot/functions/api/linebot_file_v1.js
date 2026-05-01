import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import admin from "firebase-admin";
import { getDownloadURL } from "firebase-admin/storage";

dotenv.config();

// 初始化 Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

// 取得 Firebase Storage 實例
const bucket = admin.storage().bucket();

// LINE Bot 設定
const config = {
    channelSecret: process.env.LINE_SECRET_APPLE,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_APPLE,
};

// line api 文字、檔案
const client = new line.messagingApi.MessagingApiClient(config);
const blobClient = new line.messagingApi.MessagingApiBlobClient(config);

const router = express.Router();

router.get("/", (req, res) => {
    res.send("我是檔案上傳助理 webhook");
});

// 處理 LINE webhook
router.post("/", line.middleware(config), async (req, res) => {
    try {
        const events = req.body.events || [];

        for (const event of events) {
            if (event.type === "message") {
                const supportedTypes = ["image", "video", "audio", "file"];
                if (supportedTypes.includes(event.message.type)) {
                    await handleFileMessage(event);
                }
            }
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("處理 webhook 時發生錯誤:", error);
        res.status(500).send("Error");
    }
});

/**
 * 取得來源 ID
 */
function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return { type: "user", id: source.userId };
    if (source.type === "group" && source.groupId) return { type: "group", id: source.groupId };
    if (source.type === "room" && source.roomId) return { type: "room", id: source.roomId };
    return undefined;
}

/**
 * 生成儲存路徑
 */
function getStoragePath(sourceInfo, messageId) {
    if (!sourceInfo) return `unknown/${messageId}`;
    const prefix = sourceInfo.type === "group" ? "group" : "users";
    return `${prefix}/${sourceInfo.id}/${messageId}`;
}

/**
 * 下載檔案內容
 */
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

/**
 * 根據訊息類型取得副檔名
 */
function getExtensionFromType(messageType, contentType) {
    // 優先從 contentType 判斷
    const mimeMap = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "audio/mpeg": "mp3",
        "audio/m4a": "m4a",
        "audio/aac": "aac",
        "application/pdf": "pdf",
        "application/zip": "zip",
        "application/octet-stream": "bin",
    };

    if (mimeMap[contentType]) return mimeMap[contentType];

    // 依訊息類型給預設副檔名
    const typeDefault = {
        image: "jpg",
        video: "mp4",
        audio: "m4a",
        file: "bin",
    };
    return typeDefault[messageType] || "bin";
}

/**
 * 處理檔案訊息主流程
 */
async function handleFileMessage(event) {
    const messageId = event.message.id;
    const messageType = event.message.type;
    const originalFileName = event.message.fileName || null; // file 類型才有

    try {
        // 1. 下載檔案
        const { buffer, contentType } = await downloadMessageContent(messageId);

        // 2. 決定檔名
        const ext = getExtensionFromType(messageType, contentType);
        const fileName = originalFileName || `${messageType}_${messageId}.${ext}`;

        // 3. 決定儲存路徑
        const sourceInfo = getPushTargetFromSource(event.source);
        const storagePath = `${getStoragePath(sourceInfo, messageId)}/${fileName}`;

        // 4. 上傳到 Firebase Storage
        const file = bucket.file(storagePath);
        await file.save(buffer, {
            metadata: { contentType },
        });
        console.log("上傳成功:", storagePath);

        // 5. 取得可分享的下載連結
        const downloadURL = await getDownloadURL(file);

        // 6. 組裝回覆訊息
        const fileSizeKB = (buffer.length / 1024).toFixed(2);
        const replyText =
            `✅ 檔案上傳成功！\n\n` +
            `📄 檔名：${fileName}\n` +
            `📦 大小：${fileSizeKB} KB\n` +
            `🗂 類型：${contentType}\n\n` +
            `🔗 下載連結：\n${downloadURL}`;

        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: "text", text: replyText }],
        });

    } catch (error) {
        console.error("處理檔案訊息時發生錯誤:", error);
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: "text", text: "😥 檔案上傳失敗，請稍後再試！" }],
        });
    }
}

export default router;