import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import OpenAI from "openai";

import admin from "firebase-admin";
import { getDownloadURL } from "firebase-admin/storage";


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

dotenv.config();

// 初始化 Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

// 取得 Firebase Storage 實例
const bucket = admin.storage().bucket();

// 使用者狀態管理（key: userId、groupId 或 roomId, value: { level, category }）
const userStateMap = new Map();

// 預設使用者狀態（level: 1=國中, category: 0=日常生活）
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
    '日常生活',
    '學術相關',
    '商業職場',
    '旅遊相關',
    '飲食相關',
    '科技相關',
    '情感表達'
];

// 類別簡化標籤陣列（用於按鈕顯示，如果原標籤太長）
const CATEGORY_SHORT_LABELS = [
    '日常',
    '學術',
    '商業',
    '旅遊',
    '飲食',
    '科技',
    '情感'
];

const config = {
    channelSecret: process.env.LINE_SECRET_OREN2,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_OREN2
}

const client = new line.messagingApi.MessagingApiClient(config);


const router = express.Router();


router.get("/", (req, res) => {
    res.send("我是 linebot_demo webhook");
});

/**
 * 建立單字卡功能的 quickReply
 * @param {Object} userState - 使用者狀態 { level, category }
 */
function createWordQuickReply(userState = DEFAULT_USER_STATE) {
    const levelLabel = LEVEL_SHORT_LABELS[userState.level]; // 難度簡化標籤陣列（用於按鈕顯示）
    const categoryLabel = CATEGORY_SHORT_LABELS[userState.category]; // 類別簡化標籤陣列（用於按鈕顯示）

    const difficultyLabel = `⚙️ 難度:${levelLabel}`;
    const categoryButtonLabel = `📂 類別:${categoryLabel}`;


    return {
        items: [
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: '產生單字',
                    text: '產生單字'
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
    return `📚 英文單字卡功能說明

🔹 主要功能：
• /切換單字卡 - 進入單字卡模式
• 產生單字 - 生成單字卡（使用您設定的難度和類別）

🔹 單字卡功能：
• 📖 顯示單字、音標、詞性、中文定義
• 📝 提供英文例句及中文翻譯
• 🔤 顯示同義詞和反義詞
• 💡 提供學習小提示
• 🔊 聽發音 - 點擊按鈕聽單字發音
• 再來一張 - 生成新的單字卡

🔹 設定功能：
• ⚙️ 設定難度 - 選擇單字難度等級
• 📂 設定類別 - 選擇單字類別

💡 提示：輸入「切換單字卡」或「單字卡」即可開始使用！`;
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

/**
 * 建立類別選項的 quickReply
 */
function createCategoryQuickReply() {
    return {
        items: CATEGORY_PROMPTS.map((category) => ({
            type: 'action',
            action: {
                type: 'message',
                label: category,
                text: `選擇類別:${category}`
            }
        }))
    };
}
//程式入口點
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
                        const word = postbackData.replace('pronounce_', '');
                        const messageId = `${Date.now()}_${word}`;
                        const audioMessages = await buildTtsVoiceMessages(word, messageId);

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
                const text = event.message.text; // 取得文字內容
                const userId = getPushTargetFromSource(event.source); // 取得使用者 ID

                if (!userId) {
                    console.error('無法取得使用者 ID，跳過處理');
                    continue;
                }

                console.log('收到文字訊息:', text);

                // 處理「產生單字」按鈕
                if (text === '產生單字') {
                    try {
                        // 取得使用者保存的狀態，如果沒有則使用預設值
                        const userState = userStateMap.get(userId) || DEFAULT_USER_STATE;

                        // 生成單字卡（使用使用者設定的難度和類別）
                        const wordCard = await generateVocabularyCard(userState.level, userState.category, userState.seenWords);

                        // 記錄已看過的單字
                        if (wordCard.word) {
                            if (!userState.seenWords) {
                                userState.seenWords = [];
                            }
                            userState.seenWords.push(wordCard.word.toLowerCase());
                            userStateMap.set(userId, userState);
                        }

                        // 使用 Flex Message 回覆
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [createVocabularyFlexCard(wordCard)]
                        });
                    } catch (error) {
                        console.error('生成單字卡時發生錯誤:', error);
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: '抱歉，生成單字卡時發生錯誤，請稍後再試。'
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
                            text: '📊 請選擇單字難度等級：',
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
                            text: '📂 請選擇單字類別：',
                            quickReply: createCategoryQuickReply()
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
                                text: `✅ 已設定難度為：${LEVEL_PROMPTS[levelIndex]}\n\n現在可以使用「產生單字」來生成單字卡！`,
                                quickReply: createWordQuickReply(userState)
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
                                text: `✅ 已設定類別為：${CATEGORY_PROMPTS[categoryIndex]}\n\n現在可以使用「產生單字」來生成單字卡！`,
                                quickReply: createWordQuickReply(userState)
                            }]
                        });
                    }
                    continue;
                }

                // 功能切換關鍵字（用於檢測是否為切換指令）
                // const switchKeywords = ['切換單字卡', '/切換單字卡', '單字卡'];
                // 功能切換關鍵字（用於檢測是否為切換指令）
                const switchKeywords = ['切換單字卡', '/切換單字卡', '單字卡', '單字', 'word', 'words', 'vocabulary', 'vocabularys'];

                // 處理幫助指令
                if (switchKeywords.includes(text) || text === '/help' || text === 'help' || text === '幫助') {
                    // 取得使用者保存的狀態
                    const userState = userStateMap.get(userId) || DEFAULT_USER_STATE;
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: createHelpMessage(),
                            quickReply: createWordQuickReply(userState)
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
 * 單字卡生成函數
 * @param {number} level - 難度等級索引（對應 LEVEL_PROMPTS 陣列的索引）
 * @param {number} category - 類別索引（對應 CATEGORY_PROMPTS 陣列的索引）
 */
async function generateVocabularyCard(level, category, seenWords = []) {
    try {
        console.log(seenWords, "seenWords");
        // 建立已看過單字的提示文字
        const seenWordsText = seenWords.length > 0
            ? `\n\n重要：以下單字已經學習過，請不要重複生成：${seenWords.join(', ')}。\n`
            : '';

        const prompt = `你是一個專業的英文學習助手。請為${LEVEL_PROMPTS[level]}的學習者生成一個${CATEGORY_PROMPTS[category]}單字卡。
${seenWordsText}
請按照以下 JSON 格式回傳，不要包含任何其他文字：

{
  "word": "單字",
  "phonetic": "音標",
  "partOfSpeech": "詞性",
  "definition": "中文定義",
  "example": "英文例句",
  "exampleTranslation": "例句中文翻譯",
  "synonyms": ["同義詞1", "同義詞2"],
  "antonyms": ["反義詞1", "反義詞2"],
  "difficulty": "${LEVEL_PROMPTS[level]}",
  "category": "${CATEGORY_PROMPTS[category]}",
  "learningTip": "學習小提示"
}

要求：
1. 單字要符合${LEVEL_PROMPTS[level]}
2. 例句要實用且容易理解
3. 同義詞和反義詞要適合該程度
4. 學習小提示要具體且有幫助
5. 如果提供了已學習過的單字列表，請確保生成的是全新的、不同的單字`;

        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            instructions: "你是一個專業的英文學習助手，專門生成適合不同程度的單字卡。請嚴格按照要求的 JSON 格式回傳。",
            input: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_output_tokens: 800,
            temperature: 0.7
        });

        const responseText = response.output_text.trim();
        try {
            return JSON.parse(responseText);
        } catch (error) {
            // 拋出錯誤並包含相關資訊
            console.error('無法解析單字卡 JSON 回應:', error);
            throw error;
        }
    } catch (error) {
        console.error('Vocabulary card generation error:', error);
        throw error;
    }
}

/**
 * 創建單字卡 Flex 訊息
 */
function createVocabularyFlexCard(vocabData) {
    return {
        type: "flex",
        altText: `📚 單字卡：${vocabData.word}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "📚 每日單字卡",
                        weight: "bold",
                        size: "lg",
                        color: "#FFFFFF"
                    },
                    {
                        type: "text",
                        text: `${vocabData.category} | ${vocabData.difficulty}`,
                        size: "sm",
                        color: "#FFFFFFCC"
                    }
                ],
                backgroundColor: "#27AE60",
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: vocabData.word || "單字",
                                weight: "bold",
                                size: "xl",
                                flex: 0
                            },
                            {
                                type: "text",
                                text: vocabData.phonetic || "/音標/",
                                size: "sm",
                                color: "#666666",
                                flex: 0
                            }
                        ]
                    },
                    {
                        type: "text",
                        text: `[${vocabData.partOfSpeech || '詞性'}] ${vocabData.definition || '定義'}`,
                        size: "md",
                        color: "#333333",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: "📝 例句",
                        weight: "bold",
                        size: "md",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: vocabData.example || "例句",
                        size: "sm",
                        color: "#666666",
                        wrap: true
                    },
                    {
                        type: "text",
                        text: vocabData.exampleTranslation || "例句翻譯",
                        size: "sm",
                        color: "#999999",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "box",
                                layout: "vertical",
                                contents: [
                                    {
                                        type: "text",
                                        text: "同義詞",
                                        size: "xs",
                                        color: "#666666"
                                    },
                                    {
                                        type: "text",
                                        text: (vocabData.synonyms && Array.isArray(vocabData.synonyms) && vocabData.synonyms.length > 0)
                                            ? vocabData.synonyms.join(", ")
                                            : "無",
                                        size: "sm",
                                        wrap: true
                                    }
                                ],
                                flex: 1
                            },
                            {
                                type: "box",
                                layout: "vertical",
                                contents: [
                                    {
                                        type: "text",
                                        text: "反義詞",
                                        size: "xs",
                                        color: "#666666"
                                    },
                                    {
                                        type: "text",
                                        text: (vocabData.antonyms && Array.isArray(vocabData.antonyms) && vocabData.antonyms.length > 0)
                                            ? vocabData.antonyms.join(", ")
                                            : "無",
                                        size: "sm",
                                        wrap: true
                                    }
                                ],
                                flex: 1
                            }
                        ]
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
                        text: vocabData.learningTip || "學習小提示",
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
                            data: `pronounce_${vocabData.word}` //傳送 vocabData.word 到 postback 事件
                        },
                        style: "secondary",
                        color: "#F39C12"
                    },
                    {
                        type: "button",
                        action: {
                            type: "message",
                            label: "再來一張",
                            text: "產生單字"
                        },
                        style: "primary",
                        color: "#27AE60"
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

/*
 * 產生文字轉語音所需的 LINE 訊息陣列
 * @param {string} text - 要轉換為語音的單字
 * @param {string} messageId - 訊息 ID（用於檔案命名）
 * @returns {Promise<Array>} LINE audio 訊息陣列
 */
async function buildTtsVoiceMessages(text, messageId) {
    try {
        // 1. 呼叫 OpenAI TTS 產生語音（wav）
        const speech = await openai.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice: "alloy",
            input: text,
            instructions: "這是英文單字發音，前面不要有任何停頓，直接發音，但說話可以慢一點",
        });

        const audioBuffer = Buffer.from(await speech.arrayBuffer());

        // 2. 上傳到 Firebase Storage 取得公開 URL
        const filePath = `tts/${Date.now()}_${messageId}`;
        const file = bucket.file(filePath);

        await file.save(audioBuffer, {
            metadata: {
                contentType: "audio/wav",
                metadata: {
                    source: "linebot_word_pronunciation",
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
 * 粗估語音長度（針對英文單字）
 * @param {string} text - 要估算的單字
 * @returns {number} 語音長度（毫秒）
 */
function estimateSpeechDurationMs(text) {
    const clean = (text || "").trim();
    if (!clean) return 2000;

    // 英文單字：大約 3 個字母 / 秒
    const letterCount = clean.length;
    let seconds = letterCount / 3;

    // 設一個合理區間，避免太短或太長
    seconds = Math.max(1.5, Math.min(10, seconds));

    return Math.round(seconds * 1000);
}

function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
}


export default router;

