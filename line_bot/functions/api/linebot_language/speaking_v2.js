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

const config = {
    channelSecret: process.env.LINE_SECRET_OREN2,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_OREN2
}

const client = new line.messagingApi.MessagingApiClient(config);
const blobClient = new line.messagingApi.MessagingApiBlobClient(config); // 用於下載語音檔案

const router = express.Router();

// 使用者狀態管理（記錄對話狀態、場景、難度、對話歷史）
// key: userId, value: { hasStarted, scenarioKey, levelKey, conversationHistory: [{role, content}] }
const userConversationState = new Map();

// 預設場景和難度設定（可在這裡修改）
const DEFAULT_SCENARIO_KEY = 'restaurant';
const DEFAULT_LEVEL_KEY = 'beginner';

// 難度等級中文對照表
const LEVEL_NAMES = {
    'beginner': '初級',
    'intermediate': '中級',
    'advanced': '高級'
};

// 難度等級鍵值陣列
const LEVEL_KEYS = ['beginner', 'intermediate', 'advanced'];

// 語言設定
const LANGUAGES = {
    'english': {
        key: 'english',
        name: '英文'
    },
    'chinese': {
        key: 'chinese',
        name: '中文'
    },
    'japanese': {
        key: 'japanese',
        name: '日文'
    }
};

// 預設語言設定
const DEFAULT_LANGUAGE_KEY = 'english';

// 使用者難度設定（key: userId, value: levelKey）
const userLevelMap = new Map();

/**
 * 口說場景定義
 * 包含多個場景，每個場景有多個難度等級
 */
const language = LANGUAGES[DEFAULT_LANGUAGE_KEY];
const speakingScenarios = {
    'restaurant': {
        name: '餐廳點餐',
        description: '練習在餐廳點餐的對話',
        level: {
            'beginner': {
                english: "Hi! What would you like to eat?",
                chinese: "嗨！你想吃點什麼？",
                japanese: "こんにちは！何を食べますか？",
                context: `你是一位友善的服務生。保持回應簡短簡單。詢問食物選擇、辣度和飲料。使用簡單的單字。永遠用${language.name}回應，並溫和地糾正文法和發音錯誤。在問下一個問題之前，先確認他們的選擇。幫助學生學習${language.name}口說技能。如果使用者說非${language.name}，忽略它並要求他們說${language.name}。`
            },
            'intermediate': {
                english: "Hello! What would you like to order?",
                chinese: "您好！請問您想點什麼呢？",
                japanese: "こんにちは！ご注文は何になさいますか？",
                context: `你是一位服務生。保持回應自然且簡短。詢問食物、烹調偏好和飲料。永遠用${language.name}回應，並溫和地糾正文法和發音錯誤。在問下一個問題之前，先確認他們的選擇。幫助學生學習${language.name}口說技能。如果使用者說非${language.name}，忽略它並要求他們說${language.name}。`
            },
            'advanced': {
                english: "Good evening! What would you like?",
                chinese: "晚上好！請問您想要什麼？",
                japanese: "こんばんは。ご注文は何になさいますか？",
                context: `你是一位在高級餐廳工作的服務生。保持回應專業但簡短。詢問食物、酒類和偏好。永遠用${language.name}回應，並溫和地糾正文法和發音錯誤。在問下一個問題之前，先確認他們的選擇。幫助學生學習${language.name}口說技能。如果使用者說非${language.name}，忽略它並要求他們說${language.name}。`
            }
        }
    }
};


/*
 * 建立口說練習功能的 quickReply
 * @param {string} levelKey - 當前難度等級（'beginner', 'intermediate', 'advanced'）
 * @returns {Object} quickReply 物件
 */
function createSpeakingQuickReply(levelKey = DEFAULT_LEVEL_KEY) {
    const levelLabel = LEVEL_NAMES[levelKey];

    return {
        items: [
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: '開始對話',
                    text: '開始對話'
                }
            },
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: `⚙️ 難度:${levelLabel}`,
                    text: '設定難度'
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
 * 建立難度選項的 quickReply
 */
function createLevelQuickReply() {
    return {
        items: LEVEL_KEYS.map((key) => ({
            type: 'action',
            action: {
                type: 'message',
                label: LEVEL_NAMES[key],
                text: `選擇難度:${key}`
            }
        }))
    };
}

/**
 * 建立幫助訊息內容
 */
function createHelpMessage() {
    return `🎤 ${language.name}口說練習功能說明

🔹 主要功能：
• 開始對話 - 開始口說練習對話
• 設定難度 - 選擇口說練習難度等級（初級/中級/高級）

🔹 口說練習功能：
• 🎤 使用語音訊息進行${language.name}口說練習
• ✏️ 自動提供文法修正建議（中文說明）
• 💬 AI 會根據對話歷史理解上下文
• 🔊 聽 AI 的語音回應

🔹 難度等級：
• 初級 - 簡單的單字和短句
• 中級 - 中等難度的對話
• 高級 - 較複雜的對話情境

💡 提示：點擊「開始對話」即可開始練習！`;
}

router.get("/", (req, res) => {
    res.send("我是 linebot_speaking webhook");
});

// 處理 line webhook
router.post("/", line.middleware(config), async (req, res) => {
    try {
        // LINE 會將事件放在 req.body.events 陣列中
        const events = req.body.events || [];

        // 處理每個事件
        for (const event of events) {
            const userId = getPushTargetFromSource(event.source);

            if (!userId) {
                console.error('無法取得使用者 ID，跳過處理');
                continue;
            }

            // 檢查是否為語音訊息事件
            if (event.type === "message" && event.message.type === "audio") {
                console.log('收到語音訊息:', event.message.id);

                try {
                    // 將語音轉換為文字
                    const userMessage = await convertAudioToText(event.message.id);

                    if (!userMessage || userMessage.trim() === '') {
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: '抱歉，無法辨識語音內容，請再試一次。'
                            }]
                        });
                        continue;
                    }

                    console.log('語音轉換後的文字:', userMessage);

                    // 取得使用者對話狀態
                    const userState = userConversationState.get(userId);

                    if (!userState || !userState.hasStarted) {
                        // 如果還沒開始對話，提示使用者先點擊「開始對話」
                        const currentLevelKey = userLevelMap.get(userId) || DEFAULT_LEVEL_KEY;
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: '🎤 請先點擊「開始對話」來開始口說練習！',
                                quickReply: createSpeakingQuickReply(currentLevelKey)
                            }]
                        });
                        continue;
                    }

                    // 處理使用者的語音回覆
                    await handleUserResponse(userId, userMessage, event.replyToken);

                } catch (error) {
                    console.error('處理語音訊息時發生錯誤:', error);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '抱歉，處理語音訊息時發生錯誤，請稍後再試！😅'
                        }]
                    });
                }
                continue;
            }

            // 檢查是否為文字訊息事件
            if (event.type === "message" && event.message.type === "text") {
                const text = event.message.text; // 取得文字內容

                console.log('收到文字訊息:', text);

                // 取得使用者當前難度和語言設定
                const currentLevelKey = userLevelMap.get(userId) || DEFAULT_LEVEL_KEY;

                // 處理「開始對話」按鈕
                if (text === '開始對話') {
                    // 開始對話（每次都會清空對話記錄並重新開始）
                    try {
                        // 使用預設場景和使用者設定的難度與語言
                        const levelKey = currentLevelKey;
                        const scenario = speakingScenarios[DEFAULT_SCENARIO_KEY];
                        const levelData = scenario.level[levelKey];

                        // 直接使用 initialPrompt 作為開場對話
                        const aiResponse = levelData[language.key];


                        // 清空對話記錄並初始化使用者狀態（重新開始）
                        userConversationState.set(userId, {
                            hasStarted: true,
                            scenarioKey: DEFAULT_SCENARIO_KEY,
                            levelKey: levelKey,
                            conversationHistory: [
                                { role: 'assistant', content: aiResponse }
                            ]
                        });

                        // 生成語音
                        const audioMessages = await buildTtsVoiceMessages(aiResponse, `opening_${Date.now()}`);

                        // 建立 Flex Message 卡片
                        const flexCard = createSpeakingFlexCard(aiResponse, scenario, levelKey);

                        // 回覆訊息（Flex Message + 語音）
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [flexCard, ...audioMessages]
                        });
                    } catch (error) {
                        console.error('生成開場對話時發生錯誤:', error);
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: '抱歉，生成對話時發生錯誤，請稍後再試。',
                                quickReply: createSpeakingQuickReply(currentLevelKey)
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
                            text: '📊 請選擇口說練習難度等級：',
                            quickReply: createLevelQuickReply()
                        }]
                    });
                    continue;
                }

                // 處理「選擇難度:xxx」
                if (text.startsWith('選擇難度:')) {
                    const selectedLevelKey = text.replace('選擇難度:', '').trim();

                    if (LEVEL_KEYS.includes(selectedLevelKey)) {
                        // 更新使用者難度設定
                        userLevelMap.set(userId, selectedLevelKey);

                        // 如果對話已開始，也更新對話狀態中的難度
                        const userState = userConversationState.get(userId);
                        if (userState) {
                            userState.levelKey = selectedLevelKey;
                            userConversationState.set(userId, userState);
                        }

                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: `✅ 已設定難度為：${LEVEL_NAMES[selectedLevelKey]}\n\n現在可以點擊「開始對話」來開始練習！`,
                                quickReply: createSpeakingQuickReply(selectedLevelKey)
                            }]
                        });
                    } else {
                        console.error('找不到對應的難度等級，selectedLevelKey:', selectedLevelKey);
                    }
                    continue;
                }

                // 功能切換關鍵字（用於檢測是否為切換指令）
                const switchKeywords = ['切換口說', '/切換口說', '口說', '口說練習'];
                // 處理幫助指令
                if (switchKeywords.includes(text) || text === '/help' || text === 'help' || text === '幫助') {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: createHelpMessage(),
                            quickReply: createSpeakingQuickReply(currentLevelKey)
                        }]
                    });
                    continue;
                }

            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('處理 webhook 時發生錯誤:', error);
        res.status(500).send('Error');
    }
});

/*
 * 將語音訊息轉換為文字
 * @param {string} messageId - LINE 語音訊息 ID
 * @returns {Promise<string>} 轉換後的文字
 */
async function convertAudioToText(messageId) {
    try {
        console.log('開始下載語音檔案:', messageId);

        // 從 LINE 下載語音檔案
        const response = await blobClient.getMessageContentWithHttpInfo(messageId);

        // 收集音訊資料
        const chunks = [];
        for await (const chunk of response.body) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);

        console.log('語音檔案下載完成，大小:', (audioBuffer.length / 1024).toFixed(2), 'KB');

        // 使用 Node.js 22 的原生 File API 建立檔案物件
        const audioFile = new File(
            [audioBuffer],
            'audio.m4a',
            { type: 'audio/m4a' }
        );

        // 使用 OpenAI gpt-4o-mini-transcribe 
        console.log('開始語音轉文字...');
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'gpt-4o-mini-transcribe'
        });

        const transcribedText = typeof transcription === 'string' ? transcription : transcription.text || '';
        console.log('語音轉文字完成:', transcribedText);

        return transcribedText.trim();
    } catch (error) {
        console.error('語音轉文字時發生錯誤:', error);
        throw new Error(`語音轉換失敗: ${error.message}`);
    }
}

/*
 * 處理使用者的回覆
 * @param {string} userId - 使用者 ID
 * @param {string} userMessage - 使用者的訊息
 * @param {string} replyToken - LINE 回覆 Token
 */
async function handleUserResponse(userId, userMessage, replyToken) {
    try {
        const userState = userConversationState.get(userId);
        if (!userState) {
            throw new Error('找不到使用者狀態');
        }

        const { scenarioKey, levelKey, conversationHistory } = userState;

        // 生成修正建議（用中文）
        const correction = await generateCorrection(userMessage, scenarioKey, levelKey);

        // 生成 AI 對話回應（傳入完整對話歷史）
        const aiResponseResult = await generateAIDialogue(scenarioKey, levelKey, userMessage, conversationHistory);
        const aiResponse = aiResponseResult.dialogue;
        const isConversationComplete = aiResponseResult.isComplete;

        // 更新對話歷史
        userState.conversationHistory.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: aiResponse }
        );
        userConversationState.set(userId, userState);

        // 生成語音
        const audioMessages = await buildTtsVoiceMessages(aiResponse, `response_${Date.now()}`);

        // 建立 Flex Message 卡片（包含使用者訊息、修正建議、AI 回應）
        const flexCard = createConversationFlexCard(userMessage, correction, aiResponse, speakingScenarios[scenarioKey], levelKey);

        // 回覆訊息
        await client.replyMessage({
            replyToken: replyToken,
            messages: [flexCard, ...audioMessages]
        });

        // 如果對話完成，生成總結並清空對話記錄
        if (isConversationComplete) {
            try {
                // 使用更新後的完整對話歷史來生成總結
                const completeHistory = userState.conversationHistory;

                // 生成對話總結
                const summary = await generateConversationSummary(completeHistory, scenarioKey, levelKey);

                // 清空對話記錄
                userConversationState.delete(userId);

                // 取得當前難度設定
                const currentLevelKey = userLevelMap.get(userId) || DEFAULT_LEVEL_KEY;

                // 發送總結訊息
                await client.pushMessage({
                    to: userId,
                    messages: [
                        {
                            type: 'text',
                            text: summary,
                            quickReply: createSpeakingQuickReply(currentLevelKey)
                        }
                    ]
                });

                console.log('對話完成，總結已發送，對話記錄已清空');
            } catch (error) {
                console.error('生成對話總結時發生錯誤:', error);
                // 即使總結失敗，也要清空對話記錄
                userConversationState.delete(userId);
            }
        }

    } catch (error) {
        console.error('處理使用者回覆時發生錯誤:', error);
        throw error;
    }
}

/*
 * 生成文法修正建議（用中文）
 * @param {string} userMessage - 使用者的訊息
 * @param {string} scenarioKey - 場景鍵值
 * @param {string} levelKey - 難度等級
 * @returns {Promise<Object>} 修正建議物件 { hasError, correctedText, suggestions }
 */
async function generateCorrection(userMessage, scenarioKey, levelKey) {
    try {
        const prompt = `你是一位專業的${language.name}口說練習老師。學生的母語是繁體中文(台灣)。

學生剛才說了這句話（${language.name}）：
"${userMessage}"

請分析這句話，並用繁體中文(台灣)提供以下內容：
1. 如果這句話有文法錯誤、發音問題或用詞不當，請提供修正後的版本（${language.name}）
2. 用繁體中文(台灣)說明需要改進的地方
3. 如果這句話沒有明顯錯誤，請給予鼓勵

請按照以下 JSON 格式回傳，不要包含任何其他文字：
{
  "hasError": true/false,
  "correctedText": "修正後的${language.name}句子（如果沒有錯誤，就回傳原句）",
  "suggestions": "用繁體中文(台灣)說明需要改進的地方，或給予鼓勵。請使用繁體中文，不要使用簡體中文。"
}`;

        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            instructions: `你是一位專業的${language.name}口說練習老師。請仔細分析學生的${language.name}句子，提供友善且有用的修正建議。請使用繁體中文(台灣)說明，因為學生的母語是繁體中文(台灣)。請務必使用繁體中文，絕對不要使用簡體中文。`,
            input: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_output_tokens: 300,
            temperature: 0.7
        });

        const responseText = response.output_text.trim();
        try {
            const correction = JSON.parse(responseText);
            console.log('修正建議生成完成:', correction);
            return correction;
        } catch (error) {
            console.error('無法解析修正建議 JSON:', error);
            // 如果解析失敗，返回預設值
            return {
                hasError: false,
                correctedText: userMessage,
                suggestions: "說得很好！繼續保持！"
            };
        }
    } catch (error) {
        console.error('生成修正建議時發生錯誤:', error);
        // 發生錯誤時返回預設值
        return {
            hasError: false,
            correctedText: userMessage,
            suggestions: "無法分析，請繼續練習！"
        };
    }
}

/*
 * 生成對話總結
 * @param {Array} conversationHistory - 對話歷史陣列
 * @param {string} scenarioKey - 場景鍵值
 * @param {string} levelKey - 難度等級
 * @returns {Promise<string>} 對話總結（中文）
 */
async function generateConversationSummary(conversationHistory, scenarioKey, levelKey) {
    try {
        const scenario = speakingScenarios[scenarioKey];
        const scenarioName = scenario ? scenario.name : '口說練習';

        // 建立對話內容摘要
        const conversationText = conversationHistory
            .map(msg => `${msg.role === 'assistant' ? 'AI' : '學生'}: ${msg.content}`)
            .join('\n');

        const prompt = `你是一位專業的${language.name}口說練習老師。學生的母語是繁體中文(台灣)。

剛才完成了一個${scenarioName}的${language.name}口說練習對話。以下是完整的對話內容：

${conversationText}

請用繁體中文(台灣)生成一個友善且鼓勵的對話總結，包含：
1. 對學生表現的肯定和鼓勵
2. 指出學生在對話中表現好的地方
3. 如果有需要改進的地方，用友善的方式提出建議
4. 鼓勵學生繼續練習

請保持總結簡短（約100-150字），語氣友善且鼓勵。請使用繁體中文，不要使用簡體中文。`;

        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            instructions: `你是一位專業的${language.name}口說練習老師。請用繁體中文(台灣)生成友善且鼓勵的對話總結，幫助學生了解自己的表現並繼續進步。請務必使用繁體中文，絕對不要使用簡體中文。`,
            input: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_output_tokens: 300,
            temperature: 0.8
        });

        const summary = response.output_text.trim();
        const finalSummary = `🎉 對話完成！\n\n${summary}\n\n💡 您可以點擊「開始對話」來進行新的練習！`;

        console.log('對話總結生成完成');
        return finalSummary;
    } catch (error) {
        console.error('生成對話總結時發生錯誤:', error);
        return `🎉 對話完成！\n\n您表現得很好！繼續保持練習，您的${language.name}口說會越來越進步！\n\n💡 您可以點擊「開始對話」來進行新的練習！`;
    }
}

/*
 * 生成 AI 對話回應
 * 使用場景和難度等級的 context 作為 prompt，並包含完整對話歷史
 * @param {string} scenarioKey - 場景鍵值（如 'restaurant'）
 * @param {string} levelKey - 難度等級（'beginner', 'intermediate', 'advanced'）
 * @param {string} userMessage - 使用者的訊息
 * @param {Array} conversationHistory - 對話歷史陣列 [{role, content}, ...]
 * @returns {Promise<Object>} { dialogue: string, isComplete: boolean } AI 的對話回應和完成狀態
 */
async function generateAIDialogue(scenarioKey, levelKey, userMessage, conversationHistory = []) {
    try {
        const scenario = speakingScenarios[scenarioKey];
        if (!scenario) {
            throw new Error(`找不到場景: ${scenarioKey}`);
        }

        const levelData = scenario.level[levelKey];
        if (!levelData) {
            throw new Error(`找不到難度等級: ${levelKey}`);
        }

        // 動態替換 context 中的語言相關文字
        let adjustedContext = levelData.context;

        // 建立對話歷史的 input 陣列
        const inputMessages = [];

        // 首先加入系統提示（context）
        const languageInstruction = language.name === '中文'
            ? '繁體中文(台灣)'
            : language.name;
        const systemPrompt = `${adjustedContext}

這是一個${language.name}口說練習課程。一位學生正在與你練習${language.name}口說技能。請根據上述角色設定回應學生。保持你的回應簡短、簡單且自然。直接用${languageInstruction}回應，不要添加任何說明或前綴。${language.name === '中文' ? '請務必使用繁體中文，絕對不要使用簡體中文。' : ''}

重要：如果對話已經完成（例如：點餐完成、問題解決、任務達成等），請在回應的最後加上特殊標記 [CONVERSATION_COMPLETE] 來表示對話已完成。
對話完成的判斷條件請根據上下文，並且你的回應內容也要符合對話完成的條件。
`;

        inputMessages.push({
            role: "user",
            content: systemPrompt
        });

        // 加入完整的對話歷史（除了最後一筆使用者訊息，因為會單獨加入）
        if (conversationHistory && conversationHistory.length > 0) {
            // 將對話歷史轉換為 input 格式
            for (const msg of conversationHistory) {
                // OpenAI Responses API 使用 'user' 和 'assistant' 角色
                const role = msg.role === 'assistant' ? 'assistant' : 'user';
                inputMessages.push({
                    role: role,
                    content: msg.content
                });
            }
        }

        // 最後加入當前使用者的訊息
        inputMessages.push({
            role: "user",
            content: userMessage
        });

        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            instructions: `你是一位${language.name}口說練習助手。這是一個口說練習課程，學生正在練習${language.name}對話技能。用自然流暢的${languageInstruction}回應，保持簡短簡單。只輸出對話內容，不要添加任何說明。請根據對話歷史理解上下文，保持對話的連貫性。${language.name === '中文' ? '請務必使用繁體中文，絕對不要使用簡體中文。' : ''}`,
            input: inputMessages,
            max_output_tokens: 200,
            temperature: 0.8
        });

        let dialogue = response.output_text.trim();

        // 檢查對話是否完成（AI 會在回應最後加上 [CONVERSATION_COMPLETE] 標記）
        const isComplete = dialogue.includes('[CONVERSATION_COMPLETE]');

        // 移除標記（如果有的話）
        if (isComplete) {
            dialogue = dialogue.replace('[CONVERSATION_COMPLETE]', '').trim();
        }

        console.log('AI 對話回應生成完成:', dialogue);
        console.log('對話是否完成:', isComplete);
        console.log('使用的對話歷史長度:', conversationHistory.length);

        return {
            dialogue: dialogue,
            isComplete: isComplete
        };
    } catch (error) {
        console.error('生成 AI 對話回應時發生錯誤:', error);
        throw error;
    }
}

/*
 * 產生文字轉語音所需的 LINE 訊息陣列
 * @param {string} text - 要轉換為語音的文字
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
            instructions: `這是${language.name}口說練習對話，請自然流暢地朗讀，語速適中，注意語調和停頓，就像真實的對話一樣。`
        });

        const audioBuffer = Buffer.from(await speech.arrayBuffer());

        // 2. 上傳到 Firebase Storage 取得公開 URL
        const filePath = `tts/speaking/${Date.now()}_${messageId}`;
        const file = bucket.file(filePath);

        await file.save(audioBuffer, {
            metadata: {
                contentType: "audio/wav",
                metadata: {
                    source: "linebot_speaking",
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
        // 發生錯誤就改回傳空陣列，讓外層只顯示文字
        return [];
    }
}

/*
 * 粗估語音長度
 * @param {string} text - 要估算的文字
 * @returns {number} 語音長度（毫秒）
 */
function estimateSpeechDurationMs(text) {
    const clean = (text || "").trim();
    if (!clean) return 3000;

    // 對話：大約 2.5 個單字 / 秒（考慮停頓）
    const wordCount = clean.split(/\s+/).length;
    let seconds = wordCount / 2.5;

    // 設一個合理區間，避免太短或太長
    seconds = Math.max(2, Math.min(15, seconds));

    return Math.round(seconds * 1000);
}

/*
 * 創建口說練習 Flex Message 卡片
 * @param {string} dialogueText - AI 的對話文字
 * @param {Object} scenario - 場景物件 { name, description, level }
 * @param {string} levelKey - 難度等級（'beginner', 'intermediate', 'advanced'）
 * @returns {Object} Flex Message 物件
 */
function createSpeakingFlexCard(dialogueText, scenario, levelKey = DEFAULT_LEVEL_KEY) {
    // 如果沒有傳入 scenario，使用預設場景
    const currentScenario = scenario || speakingScenarios[DEFAULT_SCENARIO_KEY];
    return {
        type: "flex",
        altText: `🎤 口說練習：${currentScenario.name}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `🎤 ${language.name}口說練習`,
                        weight: "bold",
                        size: "lg",
                        color: "#FFFFFF"
                    },
                    {
                        type: "text",
                        text: `情境：${currentScenario.name} | 難度：${LEVEL_NAMES[levelKey] || levelKey}`,
                        size: "sm",
                        color: "#FFFFFFCC"
                    }
                ],
                backgroundColor: "#9B59B6",
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                contents: [
                    {
                        type: "text",
                        text: "💬 AI 對話",
                        weight: "bold",
                        size: "md",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: dialogueText || "對話內容",
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
                        text: "💡 提示",
                        weight: "bold",
                        size: "sm",
                        margin: "md"
                    },
                    {
                        type: "text",
                        text: `請用語音訊息回覆，開始練習${language.name}口說！`,
                        size: "xs",
                        color: "#666666",
                        wrap: true
                    }
                ],
                paddingAll: "20px"
            }
        }
    };
}

/*
 * 創建對話 Flex Message 卡片（包含使用者訊息、修正建議、AI 回應）
 * @param {string} userMessage - 使用者的訊息
 * @param {Object} correction - 修正建議物件 { hasError, correctedText, suggestions }
 * @param {string} aiResponse - AI 的對話回應
 * @param {Object} scenario - 場景物件 { name, description, level }
 * @param {string} levelKey - 難度等級（'beginner', 'intermediate', 'advanced'）
 * @returns {Object} Flex Message 物件
 */
function createConversationFlexCard(userMessage, correction, aiResponse, scenario, levelKey = DEFAULT_LEVEL_KEY) {
    const currentScenario = scenario || speakingScenarios[DEFAULT_SCENARIO_KEY];
    const bodyContents = [
        {
            type: "text",
            text: "👤 你的回覆",
            weight: "bold",
            size: "md",
            margin: "md"
        },
        {
            type: "text",
            text: userMessage || "訊息",
            size: "sm",
            color: "#333333",
            wrap: true
        }
    ];

    // 如果有修正建議，加入修正區塊
    if (correction) {
        bodyContents.push({
            type: "separator",
            margin: "md"
        });

        if (correction.hasError) {
            bodyContents.push(
                {
                    type: "text",
                    text: "✏️ 修正建議",
                    weight: "bold",
                    size: "sm",
                    margin: "md",
                    color: "#E74C3C"
                },
                {
                    type: "text",
                    text: correction.correctedText || userMessage,
                    size: "sm",
                    color: "#27AE60",
                    wrap: true,
                    weight: "bold"
                },
                {
                    type: "text",
                    text: correction.suggestions || "需要改進",
                    size: "xs",
                    color: "#666666",
                    wrap: true,
                    margin: "xs"
                }
            );
        } else {
            bodyContents.push(
                {
                    type: "text",
                    text: "✅ 很棒！",
                    weight: "bold",
                    size: "sm",
                    margin: "md",
                    color: "#27AE60"
                },
                {
                    type: "text",
                    text: correction.suggestions || "繼續保持！",
                    size: "xs",
                    color: "#666666",
                    wrap: true
                }
            );
        }
    }

    // 加入 AI 回應
    bodyContents.push(
        {
            type: "separator",
            margin: "md"
        },
        {
            type: "text",
            text: "💬 AI 回應",
            weight: "bold",
            size: "md",
            margin: "md"
        },
        {
            type: "text",
            text: aiResponse || "回應",
            size: "sm",
            color: "#333333",
            wrap: true
        }
    );

    return {
        type: "flex",
        altText: `🎤 口說練習對話：${currentScenario.name}`,
        contents: {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `🎤 ${language.name}口說練習`,
                        weight: "bold",
                        size: "lg",
                        color: "#FFFFFF"
                    },
                    {
                        type: "text",
                        text: `情境：${currentScenario.name} | 難度：${LEVEL_NAMES[levelKey] || levelKey}`,
                        size: "sm",
                        color: "#FFFFFFCC"
                    }
                ],
                backgroundColor: "#9B59B6",
                paddingAll: "20px"
            },
            body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                contents: bodyContents,
                paddingAll: "20px"
            }
        }
    };
}

function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
}

export default router;




