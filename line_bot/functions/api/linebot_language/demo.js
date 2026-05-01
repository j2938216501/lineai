import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";

dotenv.config();

// LINE Bot 配置
const config = {
    channelSecret: process.env.LINE_SECRET_OREN2,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_OREN2
}

const client = new line.messagingApi.MessagingApiClient(config);
const router = express.Router();

// ==================== 狀態管理 ====================
// 使用者狀態管理（key: userId、groupId 或 roomId, value: 使用者狀態物件）
const userStateMap = new Map();

// 預設使用者狀態
const DEFAULT_USER_STATE = {
    option1: 0,  // 選項1的索引
    option2: 0   // 選項2的索引
};

// ==================== 選單選項配置 ====================
// 選項1的選項陣列（可自行修改）
const OPTION1_PROMPTS = [
    '選項1-1',
    '選項1-2',
    '選項1-3',
    '選項1-4'
];

// 選項1的簡化標籤陣列（用於按鈕顯示）
const OPTION1_SHORT_LABELS = [
    '選1-1',
    '選1-2',
    '選1-3',
    '選1-4'
];

// 選項2的選項陣列（可自行修改）
const OPTION2_PROMPTS = [
    '選項2-1',
    '選項2-2',
    '選項2-3'
];

// 選項2的簡化標籤陣列（用於按鈕顯示）
const OPTION2_SHORT_LABELS = [
    '選2-1',
    '選2-2',
    '選2-3'
];

// ==================== QuickReply 建立函數 ====================
/*
 * 建立主選單的 quickReply
 * @param {Object} userState - 使用者狀態
 */
function createMainQuickReply(userState = DEFAULT_USER_STATE) {
    const option1Label = OPTION1_SHORT_LABELS[userState.option1] || '未設定';
    const option2Label = OPTION2_SHORT_LABELS[userState.option2] || '未設定';

    const option1ButtonLabel = `⚙️ 選項1:${option1Label}`;
    const option2ButtonLabel = `📂 選項2:${option2Label}`;

    return {
        items: [
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: '執行功能',
                    text: '執行功能'
                }
            },
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: option1ButtonLabel,
                    text: '設定選項1'
                }
            },
            {
                type: 'action',
                action: {
                    type: 'message',
                    label: option2ButtonLabel,
                    text: '設定選項2'
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
 * 建立選項1的 quickReply
 */
function createOption1QuickReply() {
    return {
        items: OPTION1_PROMPTS.map((optionText, index) => ({
            type: 'action',
            action: {
                type: 'message',
                label: OPTION1_PROMPTS[index] || optionText,
                text: `選擇選項1:${optionText}`
            }
        }))
    };
}

/**
 * 建立選項2的 quickReply
 */
function createOption2QuickReply() {
    return {
        items: OPTION2_PROMPTS.map((optionText) => ({
            type: 'action',
            action: {
                type: 'message',
                label: optionText,
                text: `選擇選項2:${optionText}`
            }
        }))
    };
}

/**
 * 建立幫助訊息內容
 */
function createHelpMessage() {
    return `📚 功能說明

🔹 主要功能：
• 切換功能 / 功能名稱 - 進入功能模式
• 執行功能 - 執行主要功能（使用您設定的選項）

🔹 設定功能：
• ⚙️ 設定選項1 - 選擇選項1的值
• 📂 設定選項2 - 選擇選項2的值

💡 提示：輸入「切換功能」或「功能名稱」即可開始使用！`;
}

// ==================== 工具函數 ====================
/**
 * 從事件來源取得使用者 ID
 */
function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
}

// ==================== 路由處理 ====================
router.get("/", (req, res) => {
    res.send("我是 demo webhook");
});

// 處理 line webhook
router.post("/", line.middleware(config), async (req, res) => {
    try {
        // LINE 會將事件放在 req.body.events 陣列中
        const events = req.body.events || [];

        // 處理每個事件
        for (const event of events) {
            // 處理 postback 事件（如果需要）
            if (event.type === 'postback' && event.postback.data) {
                try {
                    const postbackData = event.postback.data;
                    // 在這裡處理 postback 事件
                    // 例如：await handlePostback(event, postbackData);
                    continue;
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

                console.log(userId, "userId");

                if (!userId) {
                    console.error('無法取得使用者 ID，跳過處理');
                    continue;
                }

                console.log('收到文字訊息:', text);

                // 處理「執行功能」按鈕
                if (text === '執行功能') {
                    try {
                        // 取得使用者保存的狀態，如果沒有則使用預設值
                        const userState = userStateMap.get(userId) || DEFAULT_USER_STATE;

                        // TODO: 在這裡實作主要功能邏輯
                        // 可以使用 userState.option1 和 userState.option2 來取得使用者設定的選項

                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: `✅ 功能執行中...\n選項1: ${OPTION1_PROMPTS[userState.option1]}\n選項2: ${OPTION2_PROMPTS[userState.option2]}`,
                                quickReply: createMainQuickReply(userState)
                            }]
                        });
                    } catch (error) {
                        console.error('執行功能時發生錯誤:', error);
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: '抱歉，執行功能時發生錯誤，請稍後再試。'
                            }]
                        });
                    }
                    continue;
                }

                // 處理「設定選項1」按鈕
                if (text === '設定選項1') {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '📊 請選擇選項1：',
                            quickReply: createOption1QuickReply()
                        }]
                    });
                    continue;
                }

                // 處理「設定選項2」按鈕
                if (text === '設定選項2') {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '📂 請選擇選項2：',
                            quickReply: createOption2QuickReply()
                        }]
                    });
                    continue;
                }

                // 處理「選擇選項1:xxx」
                if (text.startsWith('選擇選項1:')) {
                    const optionName = text.replace('選擇選項1:', '').trim();
                    let optionIndex = OPTION1_PROMPTS.indexOf(optionName);

                    if (optionIndex >= 0) {
                        // 取得或創建使用者狀態
                        const userState = userStateMap.get(userId) || { ...DEFAULT_USER_STATE };
                        userState.option1 = optionIndex;
                        userStateMap.set(userId, userState);

                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: `✅ 已設定選項1為：${OPTION1_PROMPTS[optionIndex]}\n\n現在可以使用「執行功能」來執行！`,
                                quickReply: createMainQuickReply(userState)
                            }]
                        });
                    } else {
                        console.error('找不到對應的選項索引，optionName:', optionName);
                        console.error('可用的選項:', OPTION1_PROMPTS);
                    }
                    continue;
                }

                // 處理「選擇選項2:xxx」
                if (text.startsWith('選擇選項2:')) {
                    const optionName = text.replace('選擇選項2:', '');
                    const optionIndex = OPTION2_PROMPTS.indexOf(optionName);

                    if (optionIndex >= 0) {
                        // 取得或創建使用者狀態
                        const userState = userStateMap.get(userId) || { ...DEFAULT_USER_STATE };
                        userState.option2 = optionIndex;
                        userStateMap.set(userId, userState);

                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: `✅ 已設定選項2為：${OPTION2_PROMPTS[optionIndex]}\n\n現在可以使用「執行功能」來執行！`,
                                quickReply: createMainQuickReply(userState)
                            }]
                        });
                    }
                    continue;
                }

                // 功能切換關鍵字（用於檢測是否為切換指令）
                const switchKeywords = ['demo', '/demo'];

                // 處理幫助指令或切換指令
                if (switchKeywords.includes(text) || text === '/help' || text === 'help' || text === '幫助') {
                    // 取得使用者保存的狀態
                    const userState = userStateMap.get(userId) || DEFAULT_USER_STATE;
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: createHelpMessage(),
                            quickReply: createMainQuickReply(userState)
                        }]
                    });
                    continue;
                }

                // 其他訊息的處理邏輯
                // TODO: 可以在這裡加入其他訊息處理邏輯
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('處理 webhook 時發生錯誤:', error);
        res.status(500).send('Error');
    }
});

export default router;


