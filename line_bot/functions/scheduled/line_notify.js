import * as line from "@line/bot-sdk";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// LINE Bot 設定
const config = {
    channelSecret: process.env.LINE_SECRET_JUDY,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_JUDY
};

const lineClient = new line.messagingApi.MessagingApiClient(config);

// Supabase 設定
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 執行通知檢查的核心邏輯
 * @returns {Promise<Object>} 處理結果
 */
export async function processnotify() {
    console.log("開始執行通知排程檢查...");

    try {
        // 查詢狀態為 pending 且通知時間已到的通知
        const now = new Date().toISOString();

        const { data: notify, error: queryError } = await supabase
            .from("line_notify")
            .select("*")
            .eq("status", "pending")
            .lte("notify_time", now)
            .order("notify_time", { ascending: true });

        if (queryError) {
            console.error("查詢通知時發生錯誤:", queryError);
            return { success: false, error: queryError.message };
        }

        if (!notify || notify.length === 0) {
            console.log("沒有待發送的通知");
            return { success: true, count: 0, message: "沒有待發送的通知" };
        }

        console.log(`找到 ${notify.length} 筆待發送的通知`);

        // 處理每筆通知
        const results = [];
        for (const notification of notify) {
            try {
                await sendNotification(notification);
                results.push({ id: notification.id, status: "success" });
            } catch (error) {
                console.error(`處理通知 ID ${notification.id} 時發生錯誤:`, error);
                // 更新狀態為 failed
                await updateNotifyStatus(
                    notification.id,
                    "failed",
                    error.message || "發送失敗"
                );
                results.push({ id: notification.id, status: "failed", error: error.message });
            }
        }

        console.log("通知排程檢查完成");
        return {
            success: true,
            count: notify.length,
            results: results,
            message: `處理了 ${notify.length} 筆通知`
        };
    } catch (error) {
        console.error("執行通知排程時發生錯誤:", error);
        return { success: false, error: error.message };
    }
}


/**
 * 發送通知訊息
 * @param {Object} notification - 通知資料
 */
async function sendNotification(notification) {
    const { id, source_id, source_type, message } = notification;

    console.log(`準備發送通知 ID: ${id}, 目標: ${source_id} (${source_type})`);

    try {
        // 發送 Push Message
        await lineClient.pushMessage({
            to: source_id,
            messages: [
                {
                    type: "text",
                    text: `🔔 通知提醒\n\n${message}`,
                },
            ],
        });

        console.log(`通知 ID ${id} 發送成功`);

        // 更新狀態為 sent
        await updateNotifyStatus(id, "sent", null);
    } catch (error) {
        console.error(`發送通知 ID ${id} 失敗:`, error);
        // 判斷錯誤類型
        let errorMessage = error.message || "發送失敗";
        // 更新狀態為 failed
        await updateNotifyStatus(id, "failed", errorMessage);
        throw error;
    }
}

/**
 * 更新通知狀態
 * @param {number} notifyId - 通知 ID
 * @param {string} status - 新狀態 (sent/failed)
 * @param {string|null} errorMessage - 錯誤訊息（如果有的話）
 */
async function updateNotifyStatus(notifyId, status, errorMessage) {
    const updateData = {
        status: status,
        updated_at: new Date().toISOString(),
    };

    if (status === "sent") {
        updateData.sent_at = new Date().toISOString();
    }

    if (errorMessage) {
        updateData.error_message = errorMessage;
    }

    const { error } = await supabase
        .from("line_notify")
        .update(updateData)
        .eq("id", notifyId);

    if (error) {
        console.error(`更新通知 ID ${notifyId} 狀態時發生錯誤:`, error);
        throw error;
    }

    console.log(`通知 ID ${notifyId} 狀態已更新為: ${status}`);
}


