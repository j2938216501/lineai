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
const client = new line.messagingApi.MessagingApiClient(config);
const blobClient = new line.messagingApi.MessagingApiBlobClient(config); // 用於下載語音檔案


const router = express.Router();

//記憶功能
const memory_linebot_notify = {};
const MAX_MEMORY_LENGTH = 20;
// 合約建立狀態管理
const contractCreationState = {} // 儲存每個使用者的合約建立狀態



//測試用get https://api-4ugb2fo6hq-de.a.run.app/line_demo
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

            // 檢查是否為語音訊息事件
            if (event.type === "message" && event.message.type === "audio") {
                console.log('收到語音訊息:', event.message.id);

                try {
                    // 將語音轉換為繁體中文文字
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

                    // 調用 OpenAI 進行對話，並使用通知 function tool
                    const aiResponse = await getAIResponse(userMessage, event.source);

                    // 回覆訊息給使用者（第一筆：顯示轉換的文字，第二筆：AI 回應）
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [
                            {
                                type: 'text',
                                text: `📝 ${userMessage}`
                            },
                            {
                                type: 'text',
                                text: aiResponse
                            }
                        ]
                    });

                    console.log('成功回覆語音訊息');
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
                const userMessage = event.message.text.trim(); // 取得文字內容並去除空白

                console.log('收到文字訊息:', userMessage);

                try {

                    // 檢查是否為/contract指令_建立合約指令或正在建立合約狀態
                    const groupId = getPushTargetFromSource(event.source);
                    const isContractCommand = userMessage.startsWith('/contract');
                    const isCreatingContract = groupId && contractCreationState[groupId] && contractCreationState[groupId].isCreating;
                    
                    if (isContractCommand || isCreatingContract) {
                        const contractResponse = await handleContractCreation(userMessage, event.source, groupId);
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: contractResponse
                            }]
                        });
                        console.log('成功處理合約建立');
                        continue; // 跳過後續的 AI 回應處理
                    }

                    // 檢查是否為 /product 指令（查詢庫存）
                    if (userMessage.startsWith('/product ')) {
                        const productName = userMessage.substring(9).trim(); // 取得 /product 後面的商品名稱
                        const stockInfo = await queryStockFromMake(productName);
                        
                        let replyText;
                        if (stockInfo.success) {
                            replyText = `📦 ${stockInfo.data.產品名稱} 的資訊：\n\n`;
                            const stock = parseInt(stockInfo.data.庫存) || 0;
                            if (stock > 0) {
                                replyText += `✅ 庫存狀態：有貨（${stockInfo.data.庫存} 個）\n`;
                            } else {
                                replyText += `❌ 庫存狀態：缺貨\n`;
                            }
                            if (stockInfo.data['單價 (台幣)']) {
                                replyText += `💰 價格：NT$ ${stockInfo.data['單價 (台幣)']} 元`;
                            }
                        } else {
                            replyText = `❌ 找不到「${productName}」的資訊\n\n請確認商品名稱是否正確。`;
                        }
                        
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: replyText }]
                        });
                        
                        console.log('成功處理商品查詢');
                        continue; // 跳過後續的 AI 回應處理
                    }

     
                    // 檢查是否為 /meet 指令（嚴格判斷前5個字為 /meet）
                    if (userMessage.length >= 5 && userMessage.substring(0, 5) === '/meet' && (userMessage.length === 5 || userMessage[5] === ' ')) {
                        // 處理 /meet 指令
                        const meetText = userMessage.substring(5).trim(); // 取得 /meet 後面的文字（去除前後空白）
                        const meetResponse = await handleMeetCommand(meetText, event.source);

                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: meetResponse
                            }]
                        });

                        console.log('成功處理 /meet 指令');
                        return res.status(200).send('OK');//return early
                    }


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
    //記憶功能
    let memory = [{ role: "user", content: userMessage }];
    const groupId = getPushTargetFromSource(source);
    if (groupId) {
        memory_linebot_notify[groupId] = memory_linebot_notify[groupId] || [];
        memory_linebot_notify[groupId].push({ role: "user", content: userMessage });
        memory_linebot_notify[groupId] = memory_linebot_notify[groupId].slice(-MAX_MEMORY_LENGTH);
        memory = memory_linebot_notify[groupId];
    }


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
    }, {
        type: "function",
        name: "delete_notification",
        description: "當使用者要求刪除特定編號的通知時使用此功能。例如：刪除編號12345、刪除通知12345、移除編號12345、移除通知12345等相關詢問，其中的數字是通知的 id。",
        parameters: {
            type: "object",
            properties: {
                id: {
                    type: "integer",
                    description: "要刪除的通知編號（id）"
                }
            },
            required: ["id"],
            additionalProperties: false,
        },
        strict: true,
    }, {
        type: "function",
        name: "edit_notification",
        description: "當使用者要求編輯特定編號的通知時使用此功能。例如：編輯編號12345的內容為xxx、修改通知12345內容為xxx、更新編號12345的時間為明天下午3點、把編號12345的通知時間改成3月25日下午2點等相關詢問，其中的數字是通知的 id，可以修改的資訊有內容（message）和時間（time）。",
        parameters: {
            type: "object",
            properties: {
                id: {
                    type: "integer",
                    description: "要編輯的通知編號（id）"
                },
                message: {
                    type: "string",
                    description: "要更新的通知內容（可選，如果使用者有提到要修改內容則提供）"
                },
                time: {
                    type: "string",
                    description: "要更新的通知時間（可選，如果使用者有提到要修改時間則提供）"
                }
            },
            required: ["id"],
            additionalProperties: false,
        },
    }, {
        type: "function",
        name: "send_email",
        description: "當使用者要求寄送 email 時使用此功能。例如：請寄 email、幫我寄信、發送 email 等相關訊息。",
        parameters: {
            type: "object",
            properties: {
                to: {
                    type: "string",
                    description: "收件人的 email 地址，必須是有效的 email 格式，且只能是一筆（不能多筆）"
                },
                subject: {
                    type: "string",
                    description: "信件主題"
                },
                body: {
                    type: "string",
                    description: "信件內容，可以是純文字或 HTML 格式"
                }
            },
            required: ["to", "subject", "body"],
            additionalProperties: false,
        },
        strict: true,
        }, {
            type: "function",
            name: "query_stock",
            description: "當使用者詢問商品資訊、庫存、價格時使用此功能。例如：有沒有美式咖啡、美式咖啡多少錢、美式咖啡還有嗎、請問有賣拿鐵嗎、卡布奇諾的價格、查詢xx商品、xx還有庫存嗎等相關詢問。",
            parameters: {
                type: "object",
                properties: {
                    product_name: {
                        type: "string",
                        description: "使用者詢問的商品名稱，例如：美式咖啡、拿鐵、卡布奇諾等"
                    }
                },
                required: ["product_name"],
                additionalProperties: false,
            },
            strict: true,
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
            
            # 當訊息包含「刪除編號」、「刪除通知」、「移除編號」、「移除通知」、「幫我刪通知」、「取消通知」、「取消編號」、「取消行程」、「幫我刪掉通知」、「幫我刪除通知」、「幫我移除通知」等詞彙，且後面跟著數字時，則使用 delete_notification function。
               ## 當觸發 delete_notification function 時，要從使用者的訊息中提取：
                  id: 通知的編號（數字），例如「刪除編號12345」中的 12345
               ## 如果訊息中沒有明確的數字編號，則不應觸發此 function。

            # 當訊息包含「編輯編號」、「修改通知」、「更新編號」、「把編號...改成」、「幫我修改行程」、「幫我更新行程」、「幫我修改id」等詞彙，且後面跟著數字和要修改的內容或時間時，則使用 edit_notification function。
               ## 當觸發 edit_notification function 時，要從使用者的訊息中提取：
                  id: 通知的編號（數字），必填
                  message: 要更新的通知內容（可選，只有當使用者明確提到要修改內容時才提供）
                  time: 要更新的通知時間（可選，只有當使用者明確提到要修改時間時才提供）
               ## 時間格式處理方式與 notify_me 相同，請參考 notify_me 的時間處理規則。
               ## 如果訊息中沒有明確的數字編號，則不應觸發此 function。
               ## 至少要提供 message 或 time 其中一個，如果兩個都沒有，則不應觸發此 function。


            # 當訊息包含「寄email」、「幫我寄信」、「幫我寄email」、「發email」、「發送email」、「寄email」等詞彙時，則使用 send_email function。
               ## 當觸發 send_email function 時，要從使用者的訊息中提取：
                  to: 收件人的 email 地址（必須是有效的 email 格式，且只能是一筆，不能多筆。如果使用者要求寄送多筆 email，則無法寄送）
                  subject: 信件主題
                  body: 信件內容
               ## 如果訊息中沒有明確的 email 地址，則不應觸發此 function。
               ## 如果訊息中包含多個 email 地址，則不應觸發此 function，並告知使用者只能寄送一筆 email。


            # 當使用者詢問商品相關問題時，使用 query_stock function
               ## 觸發條件：
                - 詢問商品是否有貨：「有沒有xx」、「還有xx嗎」、「有賣xx嗎」
                - 詢問商品價格：「xx多少錢」、「xx的價格」、「xx多少」
                - 詢問庫存狀態：「xx還有庫存嗎」、「xx缺貨了嗎」
                
               ## 從使用者的問題中提取商品名稱，填入 product_name 參數   
               

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
        input: memory,
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
            } else if (item.name == "delete_notification") {
                let deleteNotificationResult = JSON.parse(item.arguments);
                // 如果有觸發 delete_notification，刪除指定的通知
                if (deleteNotificationResult && deleteNotificationResult.id) {
                    try {
                        const deleted = await deleteNotificationFromSupabase(deleteNotificationResult.id, source);
                        if (deleted) {
                            functionResults.push(`✅ 已成功刪除通知編號 ${deleteNotificationResult.id}！`);
                        } else {
                            functionResults.push(`⚠️ 找不到編號 ${deleteNotificationResult.id} 的通知，或該通知不屬於您。`);
                        }
                    } catch (error) {
                        console.error('刪除通知時發生錯誤:', error);
                        functionResults.push(`⚠️ 刪除通知失敗，請稍後再試。`);
                    }
                }
            } else if (item.name == "edit_notification") {
                let editNotificationResult = JSON.parse(item.arguments);
                // 如果有觸發 edit_notification，更新指定的通知
                if (editNotificationResult && editNotificationResult.id && (editNotificationResult.message || editNotificationResult.time)) {
                    try {
                        const updated = await updateNotificationInSupabase(editNotificationResult, source);
                        if (updated) {
                            let message = `✅ 已成功更新通知編號 ${editNotificationResult.id}！\n\n`;
                            if (editNotificationResult.message) {
                                message += `📝 新內容：${editNotificationResult.message}\n`;
                            }
                            if (editNotificationResult.time) {
                                message += `⏰ 新時間：${editNotificationResult.time}\n`;
                            }
                            functionResults.push(message);
                        } else {
                            functionResults.push(`⚠️ 找不到編號 ${editNotificationResult.id} 的通知，或該通知不屬於您。`);
                        }
                    } catch (error) {
                        console.error('更新通知時發生錯誤:', error);
                        functionResults.push(`⚠️ 更新通知失敗，請稍後再試。`);
                    }
                }
            } else if (item.name == "send_email") {
                let sendEmailResult = JSON.parse(item.arguments);
                // 如果有觸發 send_email，驗證並發送 email
                if (sendEmailResult && sendEmailResult.to && sendEmailResult.subject && sendEmailResult.body) {
                    try {
                        const result = await sendEmailViaWebhook(sendEmailResult);
                        if (result.success) {
                            functionResults.push(`✅ 已成功寄送 email！\n\n📧 收件人：${sendEmailResult.to}\n📝 主題：${sendEmailResult.subject}\n\n信件已成功送出！`);
                        } else {
                            functionResults.push(`⚠️ 寄送 email 失敗：${result.error}`);
                        }
                    } catch (error) {
                        console.error('寄送 email 時發生錯誤:', error);
                        functionResults.push(`⚠️ 寄送 email 失敗，請稍後再試。`);
                    }
                }
            } else if (item.name == "query_stock") {
                let queryStockResult = JSON.parse(item.arguments);
                // 如果有觸發 query_stock，查詢商品庫存
                if (queryStockResult && queryStockResult.product_name) {
                    try {
                        const stockInfo = await queryStockFromMake(queryStockResult.product_name);
                        if (stockInfo.success) {
                            // 格式化庫存資訊
                            let stockMessage = `📦 ${stockInfo.data.產品名稱} 的資訊：\n\n`;
                            
                            const stock = parseInt(stockInfo.data.庫存) || 0;
                            if (stock > 0) {
                                stockMessage += `✅ 庫存狀態：有貨（${stockInfo.data.庫存} 個）\n`;
                            } else {
                                stockMessage += `❌ 庫存狀態：缺貨\n`;
                            }
                            
                            if (stockInfo.data['單價 (台幣)']) {
                                stockMessage += `💰 價格：NT$ ${stockInfo.data['單價 (台幣)']} 元`;
                            }
                            
                            functionResults.push(stockMessage);
                        } else {
                            functionResults.push(`❌ 找不到「${queryStockResult.product_name}」的資訊\n\n可能的原因：\n1. 商品名稱不正確\n2. 該商品不在庫存清單中\n\n請確認商品名稱後再試一次。`);
                        }
                    } catch (error) {
                        console.error('查詢庫存時發生錯誤:', error);
                        functionResults.push(`⚠️ 查詢庫存時發生錯誤，請稍後再試。`);
                    }
                }
            }
        }
    }

    // 如果有 function call 的結果，回傳結果（多個結果用換行分隔）
    // if (functionResults.length > 0) {
    //     return functionResults.join('\n\n');
    // }

    // // 如果沒有 function call，回傳 AI 的文字回應
    // return output_text;

    // 記憶功能
    const finalResponse = functionResults.length > 0
        ? functionResults.join('\n\n')
        : output_text;

    if (groupId) {
        memory_linebot_notify[groupId].push({ role: "assistant", content: finalResponse });
        memory_linebot_notify[groupId] = memory_linebot_notify[groupId].slice(-MAX_MEMORY_LENGTH);
    }

    return finalResponse;

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


//列出read通知清單顯示
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
        message += `   📊 狀態：${notification.status}\n`;
        message += `   📅 建立時間：${formattedCreatedAt}\n\n`;

    });

    if (notifications.length === 10) {
        message += `💡 提示：最多顯示 10 筆通知，可能還有更多通知未顯示。`;
    }

    return message;
}


//從 Supabase 刪除delete指定的通知
async function deleteNotificationFromSupabase(notificationId, source) {
    const userId = getPushTargetFromSource(source);
    const sourceType = source.type || 'user';

    if (!userId) {
        throw new Error('無法取得使用者 ID');
    }

    // 先檢查該通知是否屬於該使用者，然後刪除
    // 這樣可以確保使用者只能刪除自己的通知
    const { data, error } = await supabase
        .from('line_notify')
        .delete()
        .eq('id', notificationId)
        .eq('source_id', userId)
        .eq('source_type', sourceType)
        .select();

    if (error) {
        console.error('Supabase 刪除錯誤:', error);
        throw error;
    }

    // 如果 data 有內容，表示成功刪除
    const deleted = data && data.length > 0;
    console.log(deleted ? `成功刪除通知 ID: ${notificationId}` : `找不到通知 ID: ${notificationId} 或該通知不屬於使用者`);

    return deleted;
}



//在 Supabase 中更新edit指定的通知
async function updateNotificationInSupabase(notificationData, source) {
    const userId = getPushTargetFromSource(source);
    const sourceType = source.type || 'user';
    
    if (!userId) {
        throw new Error('無法取得使用者 ID');
    }
    
    // 建立更新物件，只包含要更新的欄位
    const updateData = {};
    
    // 如果有提供 message，則更新
    if (notificationData.message) {
        updateData.message = notificationData.message;
    }
    
    // 如果有提供 time，則處理時間格式並更新
    if (notificationData.time) {
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
        
        updateData.notify_time = notifyTimeValue;
    }
    
    // 如果沒有任何要更新的欄位，則不執行更新
    if (Object.keys(updateData).length === 0) {
        throw new Error('沒有提供要更新的欄位');
    }
    
    // 更新通知，同時確保該通知屬於該使用者
    const { data, error } = await supabase
        .from('line_notify')
        .update(updateData)
        .eq('id', notificationData.id)
        .eq('source_id', userId)
        .eq('source_type', sourceType)
        .select();
    
    if (error) {
        console.error('Supabase 更新錯誤:', error);
        throw error;
    }
    
    // 如果 data 有內容，表示成功更新
    const updated = data && data.length > 0;
    console.log(updated ? `成功更新通知 ID: ${notificationData.id}` : `找不到通知 ID: ${notificationData.id} 或該通知不屬於使用者`);
    
    return updated;
}


/**
 * 處理 /meet 指令 加到google行事曆+產生google meet url
 * 使用 AI 解析文字並轉換成 API 格式，然後調用 make.com webhook
 */
async function handleMeetCommand(meetText, source) {
    const today = new Date();

    // 使用 AI 將文字轉換成 API 格式
    const instructions = `你是一個會議安排助手，專門將使用者的自然語言轉換成 JSON 格式的會議資料。

請將使用者的文字轉換成以下 JSON 格式：
{
  "summary": "會議主題（必填）",
  "description": "會議描述（選填，如果使用者有提到則提供）",
  "start": "開始時間，ISO 8601 格式，必須包含時區 +08:00（必填）",
  "end": "結束時間，ISO 8601 格式，必須包含時區 +08:00（必填）",
  "attendees": [
    {
      "name": "參與者姓名（如果使用者有提供姓名）",
      "email": "參與者電子郵件（必填）"
    }
  ],
  "meet": true 或 false（是否建立 Google Meet，預設為 true）
}

## 會議主題（summary）提取規則（非常重要）：
會議主題是必填欄位，必須從使用者的文字中提取或推斷。即使使用者沒有明確說「會議名稱是...」或「會議主題是...」，也要從上下文推斷出會議的主題。

會議主題可以是以下任何一種形式：
1. 明確提到的會議名稱：「專案會議」、「週會」、「產品討論會」、「會議」、「會報」
2. 和誰開會：「和王老闆開會」→ summary: "和王老闆開會"
3. 討論什麼：「討論新產品開發」→ summary: "討論新產品開發"
4. 會議目的：「檢討進度」、「規劃下週工作」、「review 專案」
5. 如果提到人名或職稱：「和張經理開會」→ summary: "和張經理開會"
6. 如果提到公司或部門：「和客戶開會」、「和行銷部門開會」
7. 如果只提到時間和「開會」，但沒有其他資訊，可以使用：「會議」或「例行會議」

範例：
- 「下星期三下午2點，要和王老闆開會」→ summary: "和王老闆開會"
- 「明天下午3點開會討論專案進度」→ summary: "討論專案進度"
- 「下週一上午10點，和客戶開會」→ summary: "和客戶開會"
- 「後天下午2點開會」→ summary: "會議"（如果沒有其他資訊）

## 參與者（attendees）提取規則：
1. 參與者可以是明確提到的 email 地址，例如：「邀請 abcd@gmail.com」
2. 參與者也可以是「請幫我通知 xxx@xxx.com」的形式，例如：「請幫我通知 john@example.com」→ 這也算作參與者
3. 如果使用者說「通知 xxx@xxx.com」，也要將其加入參與者清單
4. **如果 email 後面有括號，括號內的內容就是參與者的姓名**，例如：「wayne1894.teach@gmail.com (韋恩)」→ name: "韋恩", email: "wayne1894.teach@gmail.com"
5. 如果使用者只提供 email 沒有姓名（也沒有括號），name 可以使用 email 的用戶名部分（@ 前面的部分）
6. 如果使用者提到多個 email（用頓號、逗號、或「和」分隔），都要加入參與者清單
7. 如果使用者沒有提到任何參與者，attendees 可以是空陣列 []

範例：
- 「邀請 abcd@gmail.com、efgh@gmail.com」→ attendees: [{"name": "abcd", "email": "abcd@gmail.com"}, {"name": "efgh", "email": "efgh@gmail.com"}]
- 「請幫我通知 john@example.com」→ attendees: [{"name": "john", "email": "john@example.com"}]
- 「通知 abcd@gmail.com 和 xyz@gmail.com」→ attendees: [{"name": "abcd", "email": "abcd@gmail.com"}, {"name": "xyz", "email": "xyz@gmail.com"}]
- 「請幫我通知 wayne1894.teach@gmail.com (韋恩)」→ attendees: [{"name": "韋恩", "email": "wayne1894.teach@gmail.com"}]
- 「邀請 john@example.com (約翰) 和 mary@example.com (瑪麗)」→ attendees: [{"name": "約翰", "email": "john@example.com"}, {"name": "瑪麗", "email": "mary@example.com"}]

## 其他重要規則：
1. **時間資訊是必填的**：如果使用者的文字中完全沒有提到任何時間資訊（例如只是問問題、聊天等），則 start 和 end 應該設為 null 或空字串，不要產生預設時間
2. 現在時間：${formatTaipeiTime(today)}
3. 日期參考：
${getConsecutiveWeekdays(today)}
4. 如果使用者說「明天」，則日期為：${formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))}
5. 如果使用者說「後天」，則日期為：${formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2))}
6. 如果使用者只提到日期沒有時間，預設時間為當天 10:00（開始）和 11:00（結束）
7. 如果使用者只提到時間沒有日期，預設日期為今天
8. 所有時間都必須轉換為 ISO 8601 格式，並加上 +08:00 時區
9. 如果使用者提到「開會時間是X小時」，則結束時間 = 開始時間 + X小時
10. 如果使用者沒有明確提到是否建立 Google Meet，預設 meet 為 true
11. 如果使用者明確說「不要建立 google meet」或「不需要 meet」，則 meet 為 false

## 重要判斷：
- 如果使用者的文字只是問問題、聊天、或完全沒有提到會議時間，則 start 和 end 應該為 null
- 例如：「今天天氣好嗎？」→ start: null, end: null（因為沒有時間資訊）
- 例如：「下週三下午3點開會」→ start: "2026-XX-XXT15:00:00+08:00", end: "2026-XX-XXT16:00:00+08:00"（有時間資訊）

## 輸出要求：
請只回傳 JSON 格式，不要包含任何其他文字或說明。確保 summary 欄位一定有值，不能為空。`;

    try {
        // 調用 OpenAI 將文字轉換成 JSON
        const response = await openai.responses.create({
            model: "gpt-4o-mini",
            instructions: instructions,
            input: [{
                role: "user",
                content: meetText
            }],
            temperature: 0.3, // 降低溫度以獲得更準確的 JSON
            max_output_tokens: 1000,
        });

        // 解析 AI 回傳的 JSON
        let meetingData;
        try {
            // 嘗試直接解析 JSON
            meetingData = JSON.parse(response.output_text);
        } catch (e) {
            // 如果解析失敗，嘗試提取 JSON 部分
            const jsonMatch = response.output_text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                meetingData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('無法解析 AI 回傳的 JSON 格式');
            }
        }

        // 驗證必要欄位
        if (!meetingData.summary) {
            return '❌ 無法建立會議：缺少會議主題\n\n請提供會議主題，例如：「開班會」、「和客戶開會」';
        }

        // 檢查是否有時間資訊（null、空字串、或 undefined 都視為沒有時間）
        if (!meetingData.start || !meetingData.end ||
            meetingData.start === null || meetingData.end === null ||
            meetingData.start === '' || meetingData.end === '') {
            return '❌ 無法建立會議：缺少時間資訊\n\n請提供會議時間，例如：「下週三下午3點開會」、「明天上午10點開會」\n\n如果您的訊息只是問問題或聊天，請不要使用 /meet 指令。';
        }

        // 驗證時間格式和有效性
        try {
            const startTime = new Date(meetingData.start);
            const endTime = new Date(meetingData.end);

            // 檢查時間是否為有效日期
            if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
                return '❌ 無法建立會議：時間格式錯誤\n\n請提供正確的時間格式，例如：「下週三下午3點」、「明天上午10點」';
            }

            // 檢查結束時間是否晚於開始時間
            if (endTime <= startTime) {
                return '❌ 無法建立會議：結束時間必須晚於開始時間\n\n請確認會議時間設定正確';
            }

            // 檢查時間是否為未來時間（允許5分鐘的緩衝時間，避免時區問題）
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            if (startTime < fiveMinutesAgo) {
                return '❌ 無法建立會議：開始時間不能是過去時間\n\n請提供未來的時間，例如：「明天下午3點」、「下週一上午10點」';
            }
        } catch (error) {
            return '❌ 無法建立會議：時間格式錯誤\n\n請提供正確的時間格式，例如：「下週三下午3點」、「明天上午10點」';
        }

        // 確保 meet 有預設值
        if (meetingData.meet === undefined) {
            meetingData.meet = true;
        }

        // 確保 attendees 是陣列格式
        if (!meetingData.attendees || !Array.isArray(meetingData.attendees)) {
            meetingData.attendees = [];
        }

        // 調用 make.com webhook
        const webhookUrl = 'https://hook.us2.make.com/v0bbegt6migkgg385pn06yqupijkmdht?router=1';

        const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(meetingData)
        });

        if (!webhookResponse.ok) {
            const errorText = await webhookResponse.text();
            console.error('Make.com webhook 回應錯誤:', webhookResponse.status, errorText);
            return `❌ 建立會議失敗：HTTP ${webhookResponse.status}\n${errorText}`;
        }

        // 解析回傳結果
        const resultText = await webhookResponse.text();
        console.log(resultText, "resultText")
        let result;
        try {
            result = JSON.parse(resultText);
        } catch (e) {
            // 如果不是 JSON，嘗試提取 JSON 部分
            const jsonMatch = resultText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                result = { message: resultText };
            }
        }

        // 格式化回覆訊息
        let message = `✅ 已成功建立 Google 會議！\n\n`;
        message += `📅 會議主題：${result.summary || meetingData.summary}\n`;
        if (result.description || meetingData.description) {
            message += `📝 描述：${result.description || meetingData.description}\n`;
        }
        message += `⏰ 開始時間：${meetingData.start}\n`;
        message += `⏰ 結束時間：${meetingData.end}\n`;

        // 顯示參與者清單
        const attendees = result.attendees || meetingData.attendees || [];
        console.log(attendees, "attendees")
        if (attendees.length > 0) {
            message += `\n👥 參與者：\n`;
            attendees.forEach((attendee, index) => {
                const name = attendee.name || attendee.email?.split('@')[0] || '未提供姓名';
                const email = attendee.email || '未提供 email';
                message += `   ${index + 1}. ${name} (${email})\n`;
            });
        }

        if (result.event_id) {
            message += `\n🆔 會議 ID：${result.event_id}\n`;
        }

        if (result.html_link) {
            message += `🔗 行事曆連結：${result.html_link}\n`;
        }

        if (result.meet_link) {
            message += `🎥 Google Meet 連結：${result.meet_link}`;
        } else if (meetingData.meet && !result.meet_link) {
            message += `\n💡 注意：已要求建立 Google Meet，但未收到連結`;
        }

        return message;

    } catch (error) {
        console.error('處理 /meet 指令時發生錯誤:', error);
        return `❌ 處理會議請求時發生錯誤：${error.message}\n\n請確認您的指令格式是否正確。`;
    }
}


/**
 * 驗證 email 格式
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    // 基本的 email 格式驗證
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

/**
 * 檢查 email 字串中是否包含多個 email（用逗號、分號或空格分隔）
 */
function hasMultipleEmails(emailString) {
    if (!emailString || typeof emailString !== 'string') {
        return false;
    }
    // 檢查是否包含多個 email 分隔符號
    const separators = [',', ';', ' '];
    for (const sep of separators) {
        const parts = emailString.split(sep).map(s => s.trim()).filter(s => s.length > 0);
        if (parts.length > 1) {
            // 檢查每個部分是否都是有效的 email
            const validEmails = parts.filter(p => isValidEmail(p));
            if (validEmails.length > 1) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 透過 Make Webhook 發送 email
 */
async function sendEmailViaWebhook(emailData) {
    try {
        // 驗證 email 格式
        if (!isValidEmail(emailData.to)) {
            return {
                success: false,
                error: 'email 格式無效，請提供正確的 email 地址。'
            };
        }

        // 檢查是否包含多個 email
        if (hasMultipleEmails(emailData.to)) {
            return {
                success: false,
                error: '只能寄送一筆 email，無法同時寄送多筆 email。'
            };
        }

        // 準備請求資料
        const webhookUrl = 'https://hook.us2.make.com/3hkj6adxr0h09y17ijgzblgd7147n2xb';
        const requestBody = {
            to: emailData.to.trim(),
            subject: emailData.subject || '',
            body: emailData.body || ''
        };

        // 使用 fetch API 發送請求
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Make Webhook 回應錯誤:', response.status, errorText);
            return {
                success: false,
                error: `發送失敗（狀態碼：${response.status}）`
            };
        }

        console.log('成功發送 email 到:', emailData.to);
        return {
            success: true
        };

    } catch (error) {
        console.error('發送 email 時發生錯誤:', error);
        return {
            success: false,
            error: error.message || '發送 email 時發生未知錯誤'
        };
    }
}



/**
 * 處理合約建立流程
 */
async function handleContractCreation(userMessage, source, groupId) {
    // 初始化合約狀態
    if (!contractCreationState[groupId]) {
        contractCreationState[groupId] = {
            isCreating: false,
            data: {
                檔案名稱: null,
                甲方: null,
                合約日期: null,
                合約金額: null
            }
        };
    }

    const state = contractCreationState[groupId];

    // 如果是第一次輸入 /contract，開始建立流程
    if (userMessage === '/contract' || userMessage === '/contract ' || userMessage.startsWith('/contract ')) {
        state.isCreating = true;
        state.waitingConfirmation = false;
        state.data = {
            檔案名稱: null,
            甲方: null,
            合約日期: null,
            合約金額: null
        };
        return getContractTemplate();
    }

    // 如果正在建立合約，解析使用者輸入
    if (state.isCreating) {
        return await processContractInput(userMessage, state, groupId);
    }

    // 如果不在建立狀態，但輸入 /contract，重新開始
    state.isCreating = true;
    state.data = {
        檔案名稱: null,
        甲方: null,
        合約日期: null,
        合約金額: null
    };
    return getContractTemplate();
}

/**
 * 取得合約範本
 */
function getContractTemplate() {
    return `📋 建立合約

請依照以下格式填寫合約資訊：

檔案名稱：
甲方：
合約日期：
合約金額：

📝 範例：
檔案名稱：oo網站
甲方：王呈亮
合約日期：115 年 5 月 1 日起，至 116 年 4 月 30 日止
合約金額：12,000

請開始填寫您的合約資訊，您可以一次填寫所有欄位，或分次填寫。`;
}

/**
 * 處理合約輸入
 */
async function processContractInput(userMessage, state, groupId) {
    // 如果使用者輸入 /contract，重置狀態
    if (userMessage === '/contract' || userMessage === '/contract ' || userMessage.startsWith('/contract ')) {
        state.isCreating = true;
        state.waitingConfirmation = false;
        state.data = {
            檔案名稱: null,
            甲方: null,
            合約日期: null,
            合約金額: null
        };
        return getContractTemplate();
    }

    // 使用 OpenAI 來解析使用者輸入的合約資訊
    const parsedData = await parseContractInput(userMessage, state.data);
    
    // 更新合約資料
    let updated = false;
    for (const key in parsedData) {
        if (parsedData[key] !== null && parsedData[key] !== undefined && parsedData[key] !== '') {
            if (state.data[key] !== parsedData[key]) {
                state.data[key] = parsedData[key];
                updated = true;
                // 如果有更新，重置確認狀態
                state.waitingConfirmation = false;
            }
        }
    }

    // 檢查所有欄位是否都已填寫
    const missingFields = [];
    if (!state.data.檔案名稱 || state.data.檔案名稱.trim() === '') {
        missingFields.push('檔案名稱');
    }
    if (!state.data.甲方 || state.data.甲方.trim() === '') {
        missingFields.push('甲方');
    }
    if (!state.data.合約日期 || state.data.合約日期.trim() === '') {
        missingFields.push('合約日期');
    }
    if (!state.data.合約金額 || state.data.合約金額.trim() === '') {
        missingFields.push('合約金額');
    }

    // 如果所有欄位都已填寫，準備發送
    if (missingFields.length === 0) {
        // 檢查是否已經顯示過確認訊息（透過檢查 state 是否有 waitingConfirmation 標記）
        if (!state.waitingConfirmation) {
            // 第一次所有欄位都填寫完成，顯示確認訊息
            state.waitingConfirmation = true;
            return `📋 合約資訊確認：

檔案名稱：${state.data.檔案名稱}
甲方：${state.data.甲方}
合約日期：${state.data.合約日期}
合約金額：${state.data.合約金額}

請確認以上資訊是否正確？如果正確，請回覆「確認」或「是」；如果需要修改，請告訴我要修改的欄位。`;
        }

        // 如果已經在等待確認狀態，檢查使用者是否確認
        const isConfirmed = userMessage.toLowerCase().includes('確認') || 
                           userMessage.toLowerCase().includes('是') || 
                           userMessage.toLowerCase() === 'yes' ||
                           userMessage.toLowerCase() === 'ok' ||
                           userMessage.toLowerCase() === '確認送出' ||
                           userMessage.toLowerCase() === '送出';

        if (isConfirmed) {
            // 發送合約
            const result = await sendContractToWebhook(state.data);
            if (result.success) {
                // 清除合約建立狀態
                delete contractCreationState[groupId];
                let successMsg = `✅ 合約建立成功！\n\n📋 合約資訊：\n檔案名稱：${state.data.檔案名稱}\n甲方：${state.data.甲方}\n合約日期：${state.data.合約日期}\n合約金額：${state.data.合約金額}`;
                if (result.docUrl) successMsg += `\n\n📄 文件連結：${result.docUrl}`;
                return successMsg;

//                 return `✅ 合約建立成功！

// 📋 合約資訊：
// 檔案名稱：${state.data.檔案名稱}
// 甲方：${state.data.甲方}
// 合約日期：${state.data.合約日期}
// 合約金額：${state.data.合約金額}

// 合約已成功建立並送出！`;
            } else {
                return `⚠️ 合約建立失敗：${result.error}\n\n請稍後再試，或重新輸入 /contract 開始建立合約。`;
            }
        } else {
            // 使用者可能想要修改，嘗試解析修改內容
            const modifiedData = await parseContractInput(userMessage, state.data);
            let hasModification = false;
            for (const key in modifiedData) {
                if (modifiedData[key] !== null && modifiedData[key] !== undefined && modifiedData[key] !== state.data[key]) {
                    state.data[key] = modifiedData[key];
                    hasModification = true;
                }
            }
            
            if (hasModification) {
                state.waitingConfirmation = false; // 重置確認狀態，因為有修改
                return `✅ 已更新合約資訊！

目前填寫狀況：
✅ 檔案名稱：${state.data.檔案名稱}
✅ 甲方：${state.data.甲方}
✅ 合約日期：${state.data.合約日期}
✅ 合約金額：${state.data.合約金額}

請確認以上資訊是否正確？如果正確，請回覆「確認」或「是」。`;
            } else {
                // 沒有確認也沒有修改，再次顯示確認訊息
                return `📋 合約資訊確認：

檔案名稱：${state.data.檔案名稱}
甲方：${state.data.甲方}
合約日期：${state.data.合約日期}
合約金額：${state.data.合約金額}

請確認以上資訊是否正確？如果正確，請回覆「確認」或「是」；如果需要修改，請告訴我要修改的欄位。`;
            }
        }
    }

    // 如果還有未填寫的欄位，提示使用者
    if (updated) {
        return `✅ 已更新合約資訊！

目前填寫狀況：
${state.data.檔案名稱 ? '✅' : '❌'} 檔案名稱：${state.data.檔案名稱 || '尚未填寫'}
${state.data.甲方 ? '✅' : '❌'} 甲方：${state.data.甲方 || '尚未填寫'}
${state.data.合約日期 ? '✅' : '❌'} 合約日期：${state.data.合約日期 || '尚未填寫'}
${state.data.合約金額 ? '✅' : '❌'} 合約金額：${state.data.合約金額 || '尚未填寫'}

還缺少：${missingFields.join('、')}

請繼續填寫缺少的欄位。`;
    } else {
        return `❌ 無法識別您輸入的合約資訊。

請依照以下格式填寫：
檔案名稱：xxx
甲方：xxx
合約日期：xxx
合約金額：xxx

目前填寫狀況：
${state.data.檔案名稱 ? '✅' : '❌'} 檔案名稱：${state.data.檔案名稱 || '尚未填寫'}
${state.data.甲方 ? '✅' : '❌'} 甲方：${state.data.甲方 || '尚未填寫'}
${state.data.合約日期 ? '✅' : '❌'} 合約日期：${state.data.合約日期 || '尚未填寫'}
${state.data.合約金額 ? '✅' : '❌'} 合約金額：${state.data.合約金額 || '尚未填寫'}

還缺少：${missingFields.join('、')}

請重新輸入缺少的欄位。`;
    }
}

/**
 * 使用 OpenAI 解析合約輸入
 */
async function parseContractInput(userMessage, currentData) {
    const instructions = `你是一個合約資訊解析助手。請從使用者的輸入中提取合約資訊。

使用者目前的合約資料：
${JSON.stringify(currentData, null, 2)}

請從使用者的輸入中提取以下欄位（如果有的話）：
- 檔案名稱
- 甲方
- 合約日期
- 合約金額

請以 JSON 格式回覆，只包含有更新的欄位。如果某個欄位沒有在輸入中找到，請設為 null。
格式範例：
{
  "檔案名稱": "wayne1894網站",
  "甲方": null,
  "合約日期": null,
  "合約金額": null
}

請只回覆 JSON，不要有其他文字。`;

    try {
        const response = await openai.responses.create({
            model: "gpt-4o-mini",
            input: userMessage,
            instructions: instructions,
            temperature: 0.3,
            max_output_tokens: 500,
        });

        const outputText = response.output_text.trim();
        // 嘗試解析 JSON（可能包含 markdown 程式碼區塊）
        let jsonText = outputText;
        if (outputText.includes('```')) {
            const jsonMatch = outputText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
                jsonText = jsonMatch[1];
            }
        }

        const parsed = JSON.parse(jsonText);
        
        // 合併到現有資料
        const result = { ...currentData };
        for (const key in parsed) {
            if (parsed[key] !== null && parsed[key] !== undefined && parsed[key] !== '') {
                result[key] = parsed[key];
            }
        }
        
        return result;
    } catch (error) {
        console.error('解析合約輸入時發生錯誤:', error);
        // 如果解析失敗，嘗試簡單的關鍵字匹配
        return extractContractFieldsSimple(userMessage, currentData);
    }
}

/**
 * 簡單的關鍵字匹配提取合約欄位（備用方案）
 */
function extractContractFieldsSimple(userMessage, currentData) {
    const result = { ...currentData };
    
    // 嘗試匹配「檔案名稱：xxx」格式
    const fileNameMatch = userMessage.match(/檔案名稱[：:]\s*(.+?)(?:\n|$)/);
    if (fileNameMatch) {
        result.檔案名稱 = fileNameMatch[1].trim();
    }
    
    // 嘗試匹配「甲方：xxx」格式
    const partyMatch = userMessage.match(/甲方[：:]\s*(.+?)(?:\n|$)/);
    if (partyMatch) {
        result.甲方 = partyMatch[1].trim();
    }
    
    // 嘗試匹配「合約日期：xxx」格式
    const dateMatch = userMessage.match(/合約日期[：:]\s*(.+?)(?:\n|$)/);
    if (dateMatch) {
        result.合約日期 = dateMatch[1].trim();
    }
    
    // 嘗試匹配「合約金額：xxx」格式
    const amountMatch = userMessage.match(/合約金額[：:]\s*(.+?)(?:\n|$)/);
    if (amountMatch) {
        result.合約金額 = amountMatch[1].trim();
    }
    
    return result;
}


// 發送合約到 Make Webhook,建立googleDoc文件合約內容 
async function sendContractToWebhook(contractData) {
    try {
        // const webhookUrl = 'https://hook.us2.make.com/gtj91w53482de8teoyy7mps2asb1odwu'; //a29382165@gmail.com,make額度滿了
        const webhookUrl = 'https://hook.us2.make.com/5xfgdhmxqnyq9tc5aasnn54t6br3lyxj'; //換k29382165@gmail.com,make webhook
        const requestBody = {
            檔案名稱: contractData.檔案名稱 || '',
            甲方: contractData.甲方 || '',
            合約日期: contractData.合約日期 || '',
            合約金額: contractData.合約金額 || ''
        };

        // 驗證所有欄位都已填寫
        if (!requestBody.檔案名稱 || !requestBody.甲方 || !requestBody.合約日期 || !requestBody.合約金額) {
            return {
                success: false,
                error: '合約資訊不完整，無法發送'
            };
        }

        // 使用 fetch API 發送請求
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Make Webhook 回應錯誤:', response.status, errorText);
            return {
                success: false,
                error: `發送失敗（狀態碼：${response.status}）`
            };
        }

        // console.log('成功發送合約到 Make Webhook');
        // return {
        //     success: true
        // };

        const resultText = await response.text();
        let docUrl = null;
        try {
            const result = JSON.parse(resultText);
            docUrl = result.url || result.doc_url || result.documentUrl || null;
        } catch (e) { }
        console.log('成功發送合約到 Make Webhook', resultText);
        return { success: true, docUrl };

    } catch (error) {
        console.error('發送合約時發生錯誤:', error);
        return {
            success: false,
            error: error.message || '發送合約時發生未知錯誤'
        };
    }
}

//product庫存查詢
/**
 * 處理庫存查詢
 */
async function handleStockQuery(productName) {
    try {
        if (!productName || productName.trim() === '') {
            return '❌ 請提供商品名稱\n\n使用方式：/product 商品名稱\n例如：/product 美式咖啡';
        }

        const webhookUrl = 'https://hook.us2.make.com/mpxtpxkz613vqvbzz6edomnyt64da1rv';

        const response = await fetch(`${webhookUrl}?q=${encodeURIComponent(productName)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Make.com webhook 回應錯誤:', response.status, errorText);
            return `❌ 查詢失敗（狀態碼：${response.status}）`;
        }

        const resultText = await response.text();
        console.log('Make.com 回傳結果:', resultText);

        let result;
        try {
            result = JSON.parse(resultText);
        } catch (e) {
            console.error('無法解析 JSON:', e);
            return `❌ 查詢結果格式錯誤\n\n伺服器回應：${resultText}`;
        }

        if (!result || !result.產品名稱) {
            return `❌ 找不到「${productName}」\n\n請確認商品名稱是否正確。`;
        }

        let message = `📦 庫存查詢結果\n\n`;
        message += `🏷️ 商品名稱：${result.產品名稱}\n`;

        const stock = parseInt(result.庫存) || 0;
        if (stock > 0) {
            message += `📊 庫存數量：${result.庫存} 個\n`;
            message += `✅ 狀態：有庫存\n`;
        } else {
            message += `📊 庫存數量：${result.庫存 || 0} 個\n`;
            message += `⚠️ 狀態：缺貨\n`;
        }

        if (result['單價 (台幣)']) {
            message += `💰 單價：NT$ ${result['單價 (台幣)']} 元`;
        }

        return message;

    } catch (error) {
        console.error('查詢庫存時發生錯誤:', error);
        return `❌ 查詢庫存時發生錯誤：${error.message}`;
    }
}


/**
 * 從 Make.com 查詢商品庫存
 */
async function queryStockFromMake(productName) {
    try {
        const webhookUrl = 'https://hook.us2.make.com/mpxtpxkz613vqvbzz6edomnyt64da1rv';
        
        const response = await fetch(`${webhookUrl}?q=${encodeURIComponent(productName)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Make.com webhook 回應錯誤:', response.status);
            return {
                success: false,
                error: `查詢失敗（狀態碼：${response.status}）`
            };
        }

        const resultText = await response.text();
        console.log('Make.com 回傳庫存資料:', resultText);
        
        let result;
        try {
            result = JSON.parse(resultText);
        } catch (e) {
            console.error('無法解析庫存 JSON:', e);
            return {
                success: false,
                error: '查詢結果格式錯誤'
            };
        }

        // 檢查是否找到商品
        if (!result || !result.產品名稱) {
            return {
                success: false,
                error: '找不到商品'
            };
        }

        return {
            success: true,
            data: result
        };

    } catch (error) {
        console.error('查詢庫存時發生錯誤:', error);
        return {
            success: false,
            error: error.message
        };
    }
}


/*
 * 將語音訊息轉換為繁體中文文字
 * @param {string} messageId - LINE 語音訊息 ID
 * @returns {Promise<string>} 轉換後的繁體中文文字
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
        // OpenAI SDK 可以直接接受 File 物件
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




export default router