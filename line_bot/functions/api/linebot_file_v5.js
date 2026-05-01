import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import admin from "firebase-admin";
import { getDownloadURL } from "firebase-admin/storage";

import { createClient } from '@supabase/supabase-js';

import OpenAI from "openai";

dotenv.config();

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});



// 載入SUPABASE環境變數
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)


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

const client = new line.messagingApi.MessagingApiClient(config);
const blobClient = new line.messagingApi.MessagingApiBlobClient(config);

const router = express.Router();

//原版 檔案上傳
// router.get("/", (req, res) => {
//     res.send("我是檔案上傳助理 webhook");
// });

//supabase版檔案上傳
router.get("/", async (req, res) => {
    const { error } = await 
supabase.from('line_files').select('*').limit(1);
    if (error) return res.send("我是檔案上傳助理 webhook_資料庫連線失敗");
    res.send("我是檔案上傳助理 webhook_資料庫連線成功");
})



// 處理 LINE webhook
router.post("/", line.middleware(config), async (req, res) => {
    try {
        const events = req.body.events || [];

        for (const event of events) {
            if (event.type === "message") {
                const messageType = event.message.type; 
                const supportedTypes = ["image", "video", "audio", "file"];

                if (supportedTypes.includes(event.message.type)) {
                    await handleFileMessage(event);
                }

                // 處理文字指令
                if (messageType === "text") {
                    const text = event.message.text.trim();
                    if (text.startsWith("/")) {
                        await handleCommand(event, text);
                        continue;
                    }
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

        /*1、line Messaging api 如果傳的是圖片,會抓不到
          2、line Messaging api 如果傳的是圖片,'content-type' 都會是'image/jpeg'.
          3. line Messaging api 如果傳的是圖片,會抓不到圖片檔名
        */

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


        //寫入向量資料庫
        // 如果有檔名，去除副檔名並生成 embedding 向量
        let embedding = null;
        if (originalFileName) {
            const fileNameWithoutExtension =
                removeFileExtension(originalFileName);
            embedding = await
                generateEmbedding(fileNameWithoutExtension);
            if (embedding) console.log('檔名 embedding 生成成功');
        }


        //寫入supabase
          // 將資料寫入 Supabase
        // 確保 source_type 符合資料表約束（只允許 user/group/room）
        const validSourceType = (sourceInfo?.type || event.source?.type ||
            'user');
        const validSourceId = (sourceInfo?.id || event.source?.userId ||
            event.source?.groupId || event.source?.roomId || 'unknown');

        const { error: dbError } = await supabase
            .from('line_files')
            .insert({
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
                },
                embedding
            });

        if (dbError) {
            console.error('寫入 Supabase 時發生錯誤:', dbError);
        } else {
            console.log('資料已成功寫入 Supabase');
        }


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




 // line輸入指令 /help /find 
 
async function handleCommand(event, text) {
    try {
        const command = text.split(/\s+/)[0].toLowerCase(); // 取得指令名稱（不包含參數）
        
        switch (command) {
            case "/help":
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{
                        type: 'text',
                        text: `📁 檔案上傳助手使用說明

🎯 主要功能：

• 自動上傳檔案到安全的雲端儲存
• 提供永久有效的下載連結
• 顯示檔案詳細資訊和元數據

💡 使用方式：

• 直接傳送任何檔案
• 系統會自動處理上傳
• 回傳包含下載連結的資訊卡片

📋 支援的檔案類型：

• 🖼️ 圖片：JPG, PNG, GIF, WebP
• 🎥 影片：MP4, MOV, AVI, MKV
• 🎵 音訊：M4A, MP3, WAV, AAC
• 📄 文件：PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX
• 📦 其他：ZIP, RAR, TXT, 等

📋 指令：

• /help - 顯示使用說明
• /find - 搜尋檔案

開始傳送檔案吧！`
                    }]
                });
                break;
                
            // case "/find":
            //     await client.replyMessage({
            //         replyToken: event.replyToken,
            //         messages: [{
            //             type: 'text',
            //             text: '🔍 搜尋功能開發中，敬請期待！\n\n使用方式：/find [關鍵字]'
            //         }]
            //     });
            //     break;
            
            //實作 /find 模糊搜尋
            case "/find":
                await handleFindCommand(event, text);
                break;    

                
            default:
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{
                        type: 'text',
                        text: `❓ 未知的指令：${command}\n\n輸入 /help 查看可用指令`
                    }]
                });
        }
    } catch (error) {
        console.error('處理指令時發生錯誤:', error);
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: '❌ 處理指令時發生錯誤，請稍後再試！'
            }]
        });
    }
}


// 輸入find模糊搜尋功能
async function handleFindCommand(event, text) {
    try {
        // 提取搜尋關鍵字：/find 後面的所有文字
        const searchKeyword = text.substring(5).trim(); // 移除 "/find"

        if (!searchKeyword) {
            await client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'text',
                    text: '❌ 請輸入搜尋關鍵字\n\n使用方式：/find 關鍵字'
                }]
            });
            return;
        }

        // 在 Supabase 中搜尋（使用 ilike 進行大小寫不敏感搜尋）
        const { data, error } = await supabase
            .from('line_files')
            .select('*')
            .ilike('original_file_name', `%${searchKeyword}%`)
            .order('created_at', { ascending: false })
            .limit(20); // 限制最多回傳 20 筆

        if (error) {
            console.error('搜尋檔案時發生錯誤:', error);
            await client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'text',
                    text: '❌ 搜尋時發生錯誤，請稍後再試！'
                }]
            });
            return;
        }

        // 格式化搜尋結果
        if (!data || data.length === 0) {
            await client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'text',
                    text: `🔍 找不到符合「${searchKeyword}」的檔案\n\n請嘗試其他關鍵字`
                }]
            });
            return;
        }

        // 格式化結果清單
        let resultText = `🔍 找到 ${data.length} 個符合「${searchKeyword}」的檔案：\n\n`;

        data.forEach((file, index) => {
            const fileSizeText = file.file_size >= 1024 * 1024
                ? `${(file.file_size / 1024 / 1024).toFixed(2)} MB`
                : `${(file.file_size / 1024).toFixed(2)} KB`;

            const fileTypeEmoji = {
                'image': '🖼️',
                'video': '🎥',
                'audio': '🎵',
                'file': '📄'
            }[file.message_type] || '📄';

            resultText += `${index + 1}. ${fileTypeEmoji} ${file.original_file_name || '未命名檔案'}\n`;
            resultText += `   大小: ${fileSizeText}\n`;
            resultText += `   類型: ${file.message_type}\n`;
            resultText += `   時間: ${new Date(file.created_at).toLocaleString('zh-TW')}\n`;
            resultText += `   連結: ${file.download_url}\n\n`;
        });

        // LINE 訊息長度限制為 5000 字元，如果超過則截斷
        if (resultText.length > 4500) {
            resultText = resultText.substring(0, 4500);
            resultText += `\n\n... (顯示前 ${data.length} 筆結果，共找到 ${data.length} 筆)`;
        }

        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: resultText
            }]
        });

    } catch (error) {
        console.error('處理 /find 指令時發生錯誤:', error);
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: '❌ 處理搜尋時發生錯誤，請稍後再試！'
            }]
        });
    }
}

//把上傳檔案檔名向量化存在supabase
//去除檔名的副檔名
function removeFileExtension(fileName) {
    if (!fileName) return '';
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1) return fileName;
    return fileName.substring(0, lastDot);
}


//使用 OpenAI 將文字轉換成 embedding 向量
async function generateEmbedding(text) {
    try {
        if (!text || text.trim() === '') {
            return null;
        }

        console.log('開始生成 embedding，文字:', text);

        const response = await openai.embeddings.create({
            model: "text-embedding-3-small", // 1536 維度
            input: text.trim(),
        });

        const embedding = response.data[0].embedding;
        console.log('Embedding 生成成功，維度:',
            embedding.length);

        return embedding;
    } catch (error) {
        console.error('生成 embedding 時發生錯誤:', error);
        return null;
    }
}





export default router;