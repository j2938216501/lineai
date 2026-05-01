import express from "express";

import dotenv from "dotenv";
import * as line from "@line/bot-sdk";

import { createClient } from '@supabase/supabase-js';
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

dotenv.config();
//dotenv.config({ path: ".env.local" });

// JUDY BOT=通知秘書
const config = {
    channelSecret: process.env.LINE_SECRET_JUDY,
    channelAccessToken:
        process.env.LINE_ACCESS_TOKEN_JUDY
}
const client = new
    line.messagingApi.MessagingApiClient(config);

const router = express.Router();

//測試用get https://api-wiucuy53za-de.a.run.app/line_demo
router.get("/", (req, res) => {
    res.send("我是 linebot_notify webhook");
});
// 處理 line webhook https+post 
// 處理 line webhook
// 拿掉 line.middleware(config)

// 處理 line webhook
router.post("/", line.middleware(config), async (req, res) => {
    try {
        // LINE 會將事件放在 req.body.events 陣列中
        const events = req.body.events || [];
        console.log(events, "events")
        // 處理每個事件
        for (const event of events) {
            // 檢查是否為文字訊息事件
            if (event.type === "message" && event.message.type === "text") {
                const userMessage = event.message.text.trim(); // 取得文字內容並去除空白

                console.log('收到文字訊息:', userMessage);

                try {
                    // 調用 OpenAI 進行對話，並使用通知 function tool
                    const aiResponse = await getAIResponse(userMessage, event.source);
                    // 回覆訊息給使用者
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: aiResponse
                        }]
                    });

                    console.log('成功回覆訊息');
                } catch (error) {
                    console.error('處理 AI 回應時發生錯誤:', error);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '抱歉，現在有點忙請稍後再試！😅'
                        }]
                    });
                }
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('處理 webhook 時發生錯誤:', error);
        res.status(500).send('Error');
    }
});

/**
 * 調用 OpenAI 獲取 AI 回應
 * 當使用者提到「通知我」等相關訊息時，會自動觸發 notify_me function tool
 */
async function getAIResponse(userMessage, source) {
    // 定義通知功能的 function tool
    const tools = [{
        type: "function",
        name: "notify_me",
        description: "當使用者要求設定通知、提醒或需要被通知時使用此功能。例如：通知我、提醒我、記得告訴我等相關訊息。",
        parameters: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "需要通知的內容"
                },
                time: {
                    type: "string",
                    description: "通知的時間，ISO 格式：2025-02-21T12:00:00（台北時區）"
                }
            },
            required: ["message", "time"],
            additionalProperties: false,
        },
        strict: true,
    }, {
        type: "function",
        name: "list_notifications",
        description: "當使用者要查看、列出、顯示通知清單時使用此功能。例如：列出通知清單、顯示所有通知、查看通知、有哪些通知、幫我列出目前通知、幫我列出通知、我的通知等相關詢問。",
        parameters: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
        }
    }

    ];

    // 設定 instructions，明確告訴 AI 何時觸發 function
    const today = new Date();
    const instructions = `
            你是一個通知助理，專門幫助使用者設定提醒和通知。
    
            # 當訊息包含「通知我」、「提醒我」、「記得告訴我」、「幫我處理」、「設定提醒」、 「記得告訴我」等詞彙，則使用 notify_me function。
                ## 當觸發 notify_me function 時，要從使用者的訊息中提取：
                message: 需要通知的內容
                time: 時間資訊
            # 當訊息包含「列出通知清單」、「幫我列出目前通知」、「幫我列出所有通知」、「幫我列出通知」、「顯示所有通知」、「查看通知」、「有哪些通知」、「我的通知」等相關詢問時，則使用 list_notifications function。 
                ## list_notifications function 不需要任何參數，直接調用即可。
            
            # 如果沒有「通知我」這類字詞，則不會觸發 notify_me。例如：「3月15日下午5點，要去台北。」因為沒有明確告知要通知我，所以不會觸發。
            # 如果通知的內容沒有明確的『時』和『分』（例如「請明天通知我去買米」），則通知的『時』、『分』為參考「現在時間」，例如：「現在時間」是6點10分，則通知的時間就是明天6點10分。
            # 例如：「我明天下午三點要去打球，請在中午12點時通知我。」應轉換為：
                ## time: "2025-02-21T12:00:00"(格式參考)
                ## message: "明天下午三點要去打球"
            #請確保 time 是基於「現在時間」計算的結果，請參考『日期參考』。
                ## 今天是 ${formatDate(today)}，若說「明天」，則 time : "${formatDate(new Date(today.getTime() + 24 * 60 * 60 * 1000))}"
                ## 例如：現在時間為 ${formatTaipeiTime(today)}，若說「30分鐘後」，則 time : "${formatTaipeiTime(new Date(today.getTime() + 30 * 60 * 1000))}"
            # 例如：「3月31日網站上線前，請通知我要註冊」因為沒有明確的『時』和『分』，time 應參考「現在時間」
            # 例如：「星期三下午三點要跟客戶開會，請提早一小時通知我」，則通知時間會是實際的時間減去一小時，以此類推。
            # 若通知時間為過去時間，應回覆：「通知時間已過，請提供未來的時間。」
            #日期參考：
            ##星期日:2026-04-12
            ##星期一:2026-04-13
            ##星期二:2026-04-14
            ##星期三:2026-04-15
            ##星期四:2026-04-16
            ##星期五:2026-04-17
            ##星期六:2026-04-18
            ##下週一:2026-04-20
            ##下週二:2026-04-21
            ##下週三:2026-04-22
            ##下週四:2026-04-23
            ##下週五:2026-04-24
            ##下週六:2026-04-25
            ##下週日:2026-04-26 
            ${getConsecutiveWeekdays(today)}
            ## 現在時間：${formatTaipeiTime(today)}
    
            # 使用繁體中文回覆
            # 回覆要親切、友善`

    console.log(instructions, "instructions提示詞:")

    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions,
        tools,
        input: [
            {
                role: "user",
                content: userMessage
            }
        ],
        temperature: 0.7,
        max_output_tokens: 500,
    });



    let output_text = response.output_text;
    let functionResults = []; // 儲存所有 function call 的結果

    // 檢查是否有觸發 function call
    for (const item of response.output) {
        if (item.type === "function_call") {
            if (item.name == "notify_me") {
                let notifyResult = JSON.parse(item.arguments);
                // 如果有觸發 notify_me，將資料寫入 Supabase
                if (notifyResult && notifyResult.message && notifyResult.time) {
                    try {
                        const notificationId = await saveNotificationToSupabase(notifyResult, source);
                        functionResults.push(`✅ 已成功設定通知！\n\n📝 通知內容：${notifyResult.message}\n⏰ 通知時間：${notifyResult.time}\n🆔 通知編號：${notificationId}\n\n我會在指定時間提醒您！`);
                    } catch (error) {
                        console.error('儲存通知到 Supabase 時發生錯誤:', error);
                        functionResults.push(`⚠️ 通知設定失敗，請稍後再試。`);
                    }
                }

            } else if (item.name == "list_notifications") {
                // 如果有觸發 list_notifications，查詢並顯示通知清單
                try {
                    let notifications = await getNotificationsFromSupabase(source);
                    functionResults.push(formatNotificationsList(notifications));
                } catch (error) {
                    console.error('查詢通知清單時發生錯誤:', error);
                    functionResults.push(`⚠️ 查詢通知清單失敗，請稍後再試。`);
                }
            }

        }
    }

    // 如果有 function call 的結果，回傳結果（多個結果用換行分隔）
    if (functionResults.length > 0) {
        return functionResults.join('\n\n');
    }

    // 如果沒有 function call，回傳 AI 的文字回應
    return output_text;


    /*
    let output_text = response.output_text;
    // 檢查是否有觸發 function call
    for (const item of response.output) {
        if (item.type === "function_call") {
            if (item.name == "notify_me") {
                return item.arguments;
            }
        }
    }

    return output_text;
    */

}


function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
}
// 延遲的功能
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// 格式化台北時間
function formatTaipeiTime(date) {
    return date.toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// 日期格式化函數
function formatDate(date) {
    const formatter = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
}

// 取得從今天開始的連續日期列表（14天）
function getConsecutiveWeekdays(startDate) {
    const result = [];
    for (let i = 0; i < 14; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        // 使用 Intl.DateTimeFormat 取得台北時區的日期和星期幾（類似 formatTaipeiTime）
        const formatter = new Intl.DateTimeFormat('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'long'
        });
        const parts = formatter.formatToParts(currentDate);
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        const weekdayName = parts.find(p => p.type === 'weekday').value;
        const dateStr = `${year}-${month}-${day}`;

        // 判斷顯示文字
        let displayText = '';
        if (i === 0) {
            displayText = `## 今天（${weekdayName}）：${dateStr}`;
        } else if (i === 1) {
            displayText = `## 明天（${weekdayName}）：${dateStr}`;
        } else if (i === 2) {
            displayText = `## 後天（${weekdayName}）：${dateStr}`;
        } else {
            // 計算這是第幾週（從今天開始算）
            const currentWeek = Math.floor(i / 7);
            let prefix = '';

            if (currentWeek === 0) {
                // 第一週的剩餘天數，直接顯示星期名稱
                prefix = weekdayName;
            } else if (currentWeek === 1) {
                // 第二週，加上「下」前綴
                prefix = `下${weekdayName}`;
            } else if (currentWeek === 2) {
                // 第三週，加上「下下」前綴
                prefix = `下下${weekdayName}`;
            } else {
                // 更遠的日期
                prefix = `下下下${weekdayName}`;
            }

            displayText = `## ${prefix}：${dateStr}`;
        }

        result.push(displayText);
    }

    return result.join('\n');
}


//將通知資料訊息儲存到 Supabase 
async function saveNotificationToSupabase(notificationData, source) {
    const userId = getPushTargetFromSource(source);
    const sourceType = source.type || 'user';

    if (!userId) {
        throw new Error('無法取得使用者 ID');
    }

    // 驗證時間是否有效
    const notifyTime = new Date(notificationData.time);
    if (isNaN(notifyTime.getTime())) {
        throw new Error('無效的時間格式');
    }

    let notifyTimeValue = notificationData.time;
    // 如果時間字串沒有時區資訊，假設為台北時間並加上 +08:00
    if (!notifyTimeValue.includes('Z') && !notifyTimeValue.includes('+') && !notifyTimeValue.match(/-\d{2}:\d{2}$/)) {
        notifyTimeValue = notifyTimeValue + '+08:00';
        console.log(notifyTimeValue, "notifyTimeValue台北時間")
    }

    const { data, error } = await supabase
        .from('line_notify')
        .insert([
            {
                source_id: userId,
                source_type: sourceType,
                message: notificationData.message,
                notify_time: notifyTimeValue, // Supabase 會自動轉換為 UTC 儲存
                status: 'pending'
            }
        ])
        .select('id')
        .single();

    if (error) {
        console.error('Supabase 插入錯誤:', error);
        throw error;
    }

    console.log('成功儲存通知到 Supabase，ID:', data.id);
    return data.id;
}

/**
 * 從 Supabase 查詢尚未發送的通知清單
 */
async function getNotificationsFromSupabase(source) {
    const userId = getPushTargetFromSource(source);
    const sourceType = source.type || 'user';

    if (!userId) {
        throw new Error('無法取得使用者 ID');
    }

    // 查詢該使用者的待發送通知，最多 10 筆，按通知時間排序
    const { data, error } = await supabase
        .from('line_notify')
        .select('id, message, notify_time, status, created_at')
        .eq('source_id', userId)
        .eq('source_type', sourceType)
        .eq('status', 'pending')
        .order('notify_time', { ascending: true })
        .limit(10);

    if (error) {
        console.error('Supabase 查詢錯誤:', error);
        throw error;
    }

    console.log('成功查詢通知清單，共', data?.length || 0, '筆');
    return data || [];
}


//列出通知清單顯示
function formatNotificationsList(notifications) {
    if (!notifications || notifications.length === 0) {
        return `📋 目前沒有待發送的通知。\n\n您可以說「通知我...」來設定新的通知！`;
    }

    let message = `📋 您的通知清單（共 ${notifications.length} 筆）：\n\n`;

    notifications.forEach((notification, index) => {
        // 將 notify_time 轉換為台北時間顯示
        const notifyTime = new Date(notification.notify_time);
        const formattedTime = formatTaipeiTime(notifyTime);

        // 將 created_at 轉換為台北時間顯示
        const createdAt = new Date(notification.created_at);
        const formattedCreatedAt = formatTaipeiTime(createdAt);

        message += `${index + 1}. 🆔 ID: ${notification.id}\n`;
        message += `   ⏰ 通知時間：${formattedTime}\n`;
        message += `   📝 內容：${notification.message}\n`;
        message += `   📊 狀態：${notification.status}\n\n`;
        message += `   📅 建立時間：${formattedCreatedAt}\n`;
        
    });

    if (notifications.length === 10) {
        message += `💡 提示：最多顯示 10 筆通知，可能還有更多通知未顯示。`;
    }

    return message;
}


export default router