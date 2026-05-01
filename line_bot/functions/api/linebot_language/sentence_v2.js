import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import OpenAI from "openai";
import { createClient } from '@supabase/supabase-js';
import admin from "firebase-admin";
import { getDownloadURL } from "firebase-admin/storage";


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
// const supabaseUrl = process.env.SUPABASE_URL
// const supabaseKey = process.env.SUPABASE_KEY
// const supabase = createClient(supabaseUrl, supabaseKey);


dotenv.config();

// 初始化 Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

// 取得 Firebase Storage 實例
const bucket = admin.storage().bucket();

// 使用者狀態管理（key: userId、groupId 或 roomId, value: { level, category }）
const userStateMap = new Map();

// 預設使用者狀態（level: 1=國中, category: 0=關於學習）
const DEFAULT_USER_STATE = { level: 1, category: 0 };

// 難度等級陣列
const LEVEL_PROMPTS = [
    '國小程度（CEFR A1-A2）',
    '國中程度（CEFR B1）',
    '高中程度（CEFR B2）',
    '大學程度（CEFR C1）'
];

// 難度簡化標籤陣列（對應 LEVEL_PROMPTS 的索引）
const LEVEL_SHORT_LABELS = [
    '國小',
    '國中',
    '高中',
    '大學'
];

// 類別陣列
const CATEGORY_PROMPTS = [
    '關於學習',
    '關於工作',
    '關於家庭',
    '關於朋友',
    '關於興趣',
    '關於健康',
    '關於旅行',
    '關於美食',
    '關於運動',
    '關於音樂',
    '關於電影',
    '關於天氣',
    '關於購物',
    '關於交通',
    '關於科技',
    '關於環境',
    '關於文化',
    '關於教育'
];

// 類別簡化標籤陣列（用於按鈕顯示）
const CATEGORY_SHORT_LABELS = [
    '學習',
    '工作',
    '家庭',
    '朋友',
    '興趣',
    '健康',
    '旅行',
    '美食',
    '運動',
    '音樂',
    '電影',
    '天氣',
    '購物',
    '交通',
    '科技',
    '環境',
    '文化',
    '教育'
];

// 句型類型陣列（隨機選擇）
const SENTENCE_TYPE_PROMPTS = [
    '疑問句',
    '肯定句',
    '否定句',
    '條件句',
    '比較句',
    '被動句',
    '完成式',
    '進行式',
    '祈使句',
    '感嘆句',
    '複合句',
    '倒裝句'
];

const config = {
    channelSecret: process.env.LINE_SECRET_OREN2,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_OREN2
}

const client = new line.messagingApi.MessagingApiClient(config);


const router = express.Router();


router.get("/", (req, res) => {
    res.send("我是 linebot_sentence webhook");
});

/*
 * 建立句型卡功能的 quickReply
 * @param {Object} userState - 使用者狀態 { level, category }
 */
function createSentenceQuickReply(userState = DEFAULT_USER_STATE) {
    const levelLabel = LEVEL_SHORT_LABELS[userState.level];
    const categoryLabel = CATEGORY_SHORT_LABELS[userState.category];

    const difficultyLabel = `⚙️ 難度:${levelLabel}`;
    const categoryButtonLabel = `📂 類別:${categoryLabel}`;

    return {
        items: [
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: '產生句型',
                    text: '產生句型'
                }
            },
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: difficultyLabel,
                    text: '設定難度'
                }
            },
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: categoryButtonLabel,
                    text: '設定類別'
                }
            },
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: '📖 幫助',
                    text: '/help'
                }
            }
        ]
    };
}

/**
 * 建立幫助訊息內容
 */
function createHelpMessage() {
    return `📝 英文句型卡功能說明

🔹 主要功能：
• /切換句型卡 - 進入句型卡模式
• 產生句型 - 生成句型卡（使用您設定的難度和類別）

🔹 句型卡功能：
• 📖 顯示句型、中文翻譯、句型類型
• 📚 提供詳細文法解說
• 💬 顯示使用情境範例
• 🔤 提供類似句型參考
• 💡 提供學習小提示
• 🔊 聽發音 - 點擊按鈕聽句型發音
• 再來一張 - 生成新的句型卡

🔹 設定功能：
• ⚙️ 設定難度 - 選擇句型難度等級
• 📂 設定類別 - 選擇句型類別

💡 提示：輸入「切換句型卡」或「句型卡」即可開始使用！`;
}

/**
 * 建立難度選項的 quickReply
 */
function createLevelQuickReply() {
    return {
        items: LEVEL_PROMPTS.map((levelText, index) => ({
            type: 'action',
            action: {
                type: 'message',
                label: LEVEL_PROMPTS[index] || levelText,
                text: `選擇難度:${levelText}`
            }
        }))
    };
}

/*
 * 建立類別選項的 quickReply（分頁顯示，每頁最多 12 個類別）
 * @param {number} page - 頁碼（0 或 1）
 */
function createCategoryQuickReply(page = 0) {
    const itemsPerPage = 12; // 每頁最多 12 個類別（留一個位置給導航按鈕）
    const startIndex = page * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, CATEGORY_PROMPTS.length);
    const categories = CATEGORY_PROMPTS.slice(startIndex, endIndex);

    const items = categories.map((category) => ({
        type: 'action',
        action: {
            type: 'message',
            label: category,
            text: `選擇類別:${category}`
        }
    }));

    // 添加導航按鈕
    if (page === 0 && CATEGORY_PROMPTS.length > itemsPerPage) {
        // 第一頁：添加「下一頁」按鈕
        items.push({
            type: 'action',
            action: {
                type: 'message',
                label: '➡️ 下一頁',
                text: '下一頁類別'
            }
        });
    } else if (page === 1) {
        // 第二頁：添加「上一頁」按鈕
        items.push({
            type: 'action',
            action: {
                type: 'message',
                label: '⬅️ 上一頁',
                text: '上一頁類別'
            }
        });
    }

    return { items };
}

// 處理 line webhook
router.post("/", line.middleware(config), async (req, res) => {
    try {
        // LINE 會將事件放在 req.body.events 陣列中
        const events = req.body.events || [];

        // 處理每個事件
        for (const event of events) {
            // 處理 postback 事件
            if (event.type === 'postback' && event.postback.data) {
                try {
                    const postbackData = event.postback.data;

                    // 處理聽發音
                    if (postbackData.startsWith('pronounce_')) {
                        const sentence = postbackData.replace('pronounce_', '');
                        const messageId = `${Date.now()}_${sentence.slice(0, 20)}`;
                        const audioMessages = await buildTtsVoiceMessages(sentence, messageId);

                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: audioMessages
                        });
                        continue;
                    }

                } catch (error) {
                    console.error('處理 postback 時發生錯誤:', error);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '抱歉，處理請求時發生錯誤，請稍後再試。'
                        }]
                    });
                    continue;
                }
            }

            // 檢查是否為文字訊息事件
            if (event.type === "message" && event.message.type === "text") {
                const text = event.message.text;
                const userId = getPushTargetFromSource(event.source);

                if (!userId) {
                    console.error('無法取得使用者 ID，跳過處理');
                    continue;
                }

                console.log('收到文字訊息:', text);

                // 處理「產生句型」按鈕
                if (text === '產生句型') {
                    try {
                        // 取得使用者保存的狀態，如果沒有則使用預設值
                        const userState = userStateMap.get(userId) || DEFAULT_USER_STATE;

                        // 隨機選擇句型類型
                        const randomSentenceType = SENTENCE_TYPE_PROMPTS[Math.floor(Math.random() * SENTENCE_TYPE_PROMPTS.length)];

                        // 生成句型卡（使用使用者設定的難度和類別，以及隨機的句型類型）
                        const sentenceCard = await generateSentenceCard(userState.level, userState.category, randomSentenceType, userState.seenSentences);

                        // 記錄已看過的句型（使用句型的開頭部分作為識別）
                        if (sentenceCard.sentence) {
                            if (!userState.seenSentences) {
                                userState.seenSentences = [];
                            }
                            // 記錄句型的前20個字元作為識別
                            userState.seenSentences.push(sentenceCard.sentence.toLowerCase().slice(0, 20));
                            userStateMap.set(userId, userState);
                        }

                        // 使用 Flex Message 回覆
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [createSentenceFlexCard(sentenceCard)]
                        });
                    } catch (error) {
                        console.error('生成句型卡時發生錯誤:', error);
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: '抱歉，生成句型卡時發生錯誤，請稍後再試。'
                            }]
                        });
                    }
                    continue;
                }

                // 處理「設定難度」按鈕
                if (text === '設定難度') {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '📊 請選擇句型難度等級：',
                            quickReply: createLevelQuickReply()
                        }]
                    });
                    continue;
                }

                // 處理「設定類別」按鈕
                if (text === '設定類別') {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '📂 請選擇句型類別（第 1 頁）：',
                            quickReply: createCategoryQuickReply(0)
                        }]
                    });
                    continue;
                }

                // 處理「下一頁類別」按鈕
                if (text === '下一頁類別') {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '📂 請選擇句型類別（第 2 頁）：',
                            quickReply: createCategoryQuickReply(1)
                        }]
                    });
                    continue;
                }

                // 處理「上一頁類別」按鈕
                if (text === '上一頁類別') {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '📂 請選擇句型類別（第 1 頁）：',
                            quickReply: createCategoryQuickReply(0)
                        }]
                    });
                    continue;
                }

                // 處理「選擇難度:xxx」
                if (text.startsWith('選擇難度:')) {
                    const levelName = text.replace('選擇難度:', '').trim();
                    let levelIndex = LEVEL_PROMPTS.indexOf(levelName);

                    if (levelIndex >= 0) {
                        // 取得或創建使用者狀態
                        const userState = userStateMap.get(userId) || DEFAULT_USER_STATE;
                        userState.level = levelIndex;
                        userStateMap.set(userId, userState);

                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: `✅ 已設定難度為：${LEVEL_PROMPTS[levelIndex]}\n\n現在可以使用「產生句型」來生成句型卡！`,
                                quickReply: createSentenceQuickReply(userState)
                            }]
                        });
                    } else {
                        console.error('找不到對應的難度索引，levelName:', levelName);
                        console.error('可用的難度:', LEVEL_PROMPTS);
                    }
                    continue;
                }

                // 處理「選擇類別:xxx」
                if (text.startsWith('選擇類別:')) {
                    const categoryName = text.replace('選擇類別:', '');
                    const categoryIndex = CATEGORY_PROMPTS.indexOf(categoryName);

                    if (categoryIndex >= 0) {
                        // 取得或創建使用者狀態
                        const userState = userStateMap.get(userId) || DEFAULT_USER_STATE;
                        userState.category = categoryIndex;
                        userStateMap.set(userId, userState);

                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: `✅ 已設定類別為：${CATEGORY_PROMPTS[categoryIndex]}\n\n現在可以使用「產生句型」來生成句型卡！`,
                                quickReply: createSentenceQuickReply(userState)
                            }]
                        });
                    }
                    continue;
                }

                // 功能切換關鍵字（用於檢測是否為切換指令）
                const switchKeywords = ['切換句型卡', '/切換句型卡', '句型卡'];

                // 處理幫助指令
                if (switchKeywords.includes(text) || text === '/help' || text === 'help' || text === '幫助') {
                    // 取得使用者保存的狀態
                    const userState = userStateMap.get(userId) || DEFAULT_USER_STATE;
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: createHelpMessage(),
                            quickReply: createSentenceQuickReply(userState)
                        }]
                    });
                    continue;
                }

                // 其他訊息的處理邏輯 - 目前沒有實作

            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('處理 webhook 時發生錯誤:', error);
        res.status(500).send('Error');
    }
});


/*
 * 句型卡生成函數
 * @param {number} level - 難度等級索引（對應 LEVEL_PROMPTS 陣列的索引）
 * @param {number} category - 類別索引（對應 CATEGORY_PROMPTS 陣列的索引）
 * @param {string} sentenceType - 句型類型（對應 SENTENCE_TYPE_PROMPTS）
 * @param {Array} seenSentences - 已看過的句型識別碼陣列
 */
async function generateSentenceCard(level, category, sentenceType, seenSentences = []) {
    try {
        console.log(seenSentences, "seenSentences");

        // 建立已看過句型的提示文字
        const seenSentencesText = seenSentences.length > 0
            ? `\n\n重要：以下句型開頭已經學習過，請不要重複生成類似的句型：${seenSentences.join(', ')}。\n`
            : '';

        const prompt = `你是一個專業的英文學習助手。請為${LEVEL_PROMPTS[level]}的學習者生成一個${CATEGORY_PROMPTS[category]}的${sentenceType}句型卡。
${seenSentencesText}
請按照以下 JSON 格式回傳，不要包含任何其他文字：

{
  "sentence": "完整英文句型",
  "translation": "中文翻譯",
  "sentenceType": "${sentenceType}",
  "grammarExplanation": "詳細的文法解說，說明這個句型的結構、用法和重點",
  "usageContext": "使用情境說明，何時會用到這個句型",
  "similarSentences": ["類似句型範例1", "類似句型範例2", "類似句型範例3"],
  "difficulty": "${LEVEL_PROMPTS[level]}",
  "category": "${CATEGORY_PROMPTS[category]}",
  "learningTip": "學習小提示，幫助記憶和應用這個句型"
}

要求：
1. 句型要符合${LEVEL_PROMPTS[level]}，且必須是${sentenceType}
2. 句型要與${CATEGORY_PROMPTS[category]}相關
3. 文法解說要詳細且易懂，重點說明句型結構
4. 使用情境要具體且實用
5. 類似句型要適合該程度，且與主題相關
6. 學習小提示要具體且有幫助
7. 如果提供了已學習過的句型列表，請確保生成的是全新的、不同的句型`;

        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            instructions: "你是一個專業的英文學習助手，專門生成適合不同程度的句型卡。請嚴格按照要求的 JSON 格式回傳，確保文法解說詳細且易懂。",
            input: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_output_tokens: 1000,
            temperature: 0.7
        });

        const responseText = response.output_text.trim();
        try {
            return JSON.parse(responseText);
        } catch (error) {
            console.error('無法解析句型卡 JSON 回應:', error);
            throw error;
        }
    } catch (error) {
        console.error('Sentence card generation error:', error);
        throw error;
    }
}

/**
 * 創建句型卡 Flex 訊息
 */
function createSentenceFlexCard(sentenceData) {
    return {
        type: "flex",
        altText: `📝 句型卡：${sentenceData.sentence}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "📝 每日句型卡",
                        weight: "bold",
                        size: "lg",
                        color: "#FFFFFF"
                    },
                    {
                        type: "text",
                        text: `${sentenceData.category} | ${sentenceData.difficulty}`,
                        size: "sm",
                        color: "#FFFFFFCC"
                    }
                ],
                backgroundColor: "#3498DB",
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                contents: [
                    {
                        type: "box",
                        layout: "vertical",
                        spacing: "xs",
                        contents: [
                            {
                                type: "text",
                                text: sentenceData.sentence || "句型",
                                weight: "bold",
                                size: "lg",
                                wrap: true
                            },
                            {
                                type: "text",
                                text: sentenceData.translation || "中文翻譯",
                                size: "md",
                                color: "#666666",
                                wrap: true
                            }
                        ]
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: `類型：${sentenceData.sentenceType || '句型類型'}`,
                                size: "sm",
                                color: "#3498DB",
                                weight: "bold"
                            }
                        ],
                        backgroundColor: "#EBF5FB",
                        paddingAll: "8px",
                        cornerRadius: "4px"
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: "📚 文法解說",
                        weight: "bold",
                        size: "md",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: sentenceData.grammarExplanation || "文法解說",
                        size: "sm",
                        color: "#333333",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: "💬 使用情境",
                        weight: "bold",
                        size: "sm",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: sentenceData.usageContext || "使用情境",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: "🔤 類似句型",
                        weight: "bold",
                        size: "sm",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: (sentenceData.similarSentences && Array.isArray(sentenceData.similarSentences) && sentenceData.similarSentences.length > 0)
                            ? sentenceData.similarSentences.join("\n")
                            : "無",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: "💡 學習小提示",
                        weight: "bold",
                        size: "sm",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: sentenceData.learningTip || "學習小提示",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    }
                ],
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                    {
                        type: "button",
                        action: {
                            type: "postback",
                            label: "🔊 聽發音",
                            data: `pronounce_${sentenceData.sentence}`
                        },
                        style: "secondary",
                        color: "#F39C12"
                    },
                    {
                        type: "button",
                        action: {
                            type: "message",
                            label: "再來一張",
                            text: "產生句型"
                        },
                        style: "primary",
                        color: "#3498DB"
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

/*
 * 產生文字轉語音所需的 LINE 訊息陣列
 * @param {string} text - 要轉換為語音的句型
 * @param {string} messageId - 訊息 ID（用於檔案命名）
 * @returns {Promise<Array>} LINE audio 訊息陣列
 */
async function buildTtsVoiceMessages(text, messageId) {
    try {
        // 1. 呼叫 OpenAI TTS 產生語音
        const speech = await openai.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice: "alloy",
            input: text,
            instructions: "這是英文句型，請自然流暢地朗讀，語速適中，注意語調和停頓",
        });

        const audioBuffer = Buffer.from(await speech.arrayBuffer());

        // 2. 上傳到 Firebase Storage 取得公開 URL
        const filePath = `tts/${Date.now()}_${messageId}.wav`;
        const file = bucket.file(filePath);

        await file.save(audioBuffer, {
            metadata: {
                contentType: "audio/wav",
                metadata: {
                    source: "linebot_sentence_pronunciation",
                    text: text.slice(0, 200)
                }
            }
        });

        const publicUrl = await getDownloadURL(file);

        // 3. 粗估語音長度（毫秒）給 LINE 使用
        const durationMs = estimateSpeechDurationMs(text);

        // 回傳可直接塞到 LINE messages 的陣列
        console.log("語音訊息已產生，URL:", publicUrl);
        return [
            {
                type: "audio",
                originalContentUrl: publicUrl,
                duration: durationMs
            }
        ];
    } catch (error) {
        console.error("產生語音時發生錯誤:", error);
        // 發生錯誤就改回傳文字訊息陣列
        return [
            {
                type: "text",
                text: "❌ 目前無法產生語音，請稍後再試。"
            }
        ];
    }
}

/*
 * 粗估語音長度（針對英文句型）
 * @param {string} text - 要估算的句型
 * @returns {number} 語音長度（毫秒）
 */
function estimateSpeechDurationMs(text) {
    const clean = (text || "").trim();
    if (!clean) return 3000;

    // 英文句型：大約 2.5 個單字 / 秒（考慮停頓）
    const wordCount = clean.split(/\s+/).length;
    let seconds = wordCount / 2.5;

    // 設一個合理區間，避免太短或太長
    seconds = Math.max(2, Math.min(15, seconds));

    return Math.round(seconds * 1000);
}

function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
}


export default router;


