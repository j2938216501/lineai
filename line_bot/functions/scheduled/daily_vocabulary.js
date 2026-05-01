import * as line from "@line/bot-sdk";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// ============ 設定區 ============
// 要推送的 LINE 使用者/群組 ID（可以修改）
const TARGET_IDS = [
    "U424dd980df1cbc3ef59c6015c5220aa9"  // 替換成實際的 LINE ID
]; 

// 要抓取的 collection_id（1 = 國中單字）
const COLLECTION_ID = 1;

// 每次推送的單字數量
const WORD_COUNT = 10;
// ================================

// LINE Bot 設定
const config = {
    channelSecret: process.env.LINE_SECRET_OREN2,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_OREN2
};

const lineClient = new line.messagingApi.MessagingApiClient(config);

// Supabase 設定
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/*
 * 每日英文單字推播
 * @returns {Promise<Object>} 處理結果
 */
export async function processDailyVocabulary() {
    console.log("開始執行每日英文單字推播...");
    
    try {
        // 從 knowledge_documents 隨機抓取 10 筆單字
        // 條件：collection_id = 1 且 show = true
        const { data: words, error: queryError } = await supabase
            .from("knowledge_documents")
            .select("*")
            .eq("collection_id", COLLECTION_ID)
            .eq("show", true);
        
        if (queryError) {
            console.error("查詢單字時發生錯誤:", queryError);
            return { success: false, error: queryError.message };
        }
        
        if (!words || words.length === 0) {
            console.log("沒有可用的單字");
            return { success: true, count: 0, message: "沒有可用的單字" };
        }
        
        // 隨機選取指定數量的單字
        const selectedWords = shuffleArray(words).slice(0, WORD_COUNT);
        
        console.log(`選取了 ${selectedWords.length} 個單字準備推送`);
        
        // 組合訊息
        const message = formatVocabularyMessage(selectedWords);
        
        // 推送給每個目標
        const results = [];
        for (const targetId of TARGET_IDS) {
            try {
                await lineClient.pushMessage({
                    to: targetId,
                    messages: [
                        {
                            type: "text",
                            text: message
                        }
                    ]
                });
                console.log(`成功推送給 ${targetId}`);
                results.push({ targetId, status: "success" });
            } catch (error) {
                console.error(`推送給 ${targetId} 失敗:`, error);
                results.push({ targetId, status: "failed", error: error.message });
            }
        }
        
        console.log("每日英文單字推播完成");
        return {
            success: true,
            wordCount: selectedWords.length,
            targetCount: TARGET_IDS.length,
            results
        };
    } catch (error) {
        console.error("執行每日單字推播時發生錯誤:", error);
        return { success: false, error: error.message };
    }
}

/*
 * 格式化單字訊息
 * @param {Array} words - 單字陣列
 * @returns {string} 格式化後的訊息
 */
function formatVocabularyMessage(words) {
    const today = new Date().toLocaleDateString("zh-TW", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
    
    let message = `📚 每日英文單字 - ${today}\n\n`;
    
    words.forEach((word, index) => {
        // 根據你的資料結構調整欄位名稱
        message += `${index + 1}. ${word.title || word.word || word.name}\n`;
        if (word.content || word.meaning || word.definition) {
            message += `   ${word.content || word.meaning || word.definition}\n`;
        }
        message += "\n";
    });
    
    message += "💪 加油！每天學習一點點！";
    
    return message;
}

/*
 * 隨機打亂陣列
 * @param {Array} array - 原始陣列
 * @returns {Array} 打亂後的陣列
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

