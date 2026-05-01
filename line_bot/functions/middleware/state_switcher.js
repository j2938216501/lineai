/**
 * 通用狀態切換器 Middleware
 * 根據使用者狀態動態載入對應的功能模組
 * 可傳入額外的上下文資訊供子 router 使用
 * 
 * 功能：
 * - 使用 Supabase 持久化儲存狀態
 * - 記憶體快取機制減少資料庫查詢
 * - 錯誤處理機制確保程式穩定運行
 */

import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// 初始化 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 記憶體快取：key 為 'sourceId_sourceType'，value 為 functionName
// 用於減少資料庫查詢次數
const stateCache = new Map();

// 產生快取 key
function getCacheKey(sourceId, sourceType) {
    return `${sourceId}_${sourceType}`;
}

// 取得使用者 ID 和來源類型
function getSourceInfo(source) {
    if (source.type === "user" && source.userId) {
        return { sourceId: source.userId, sourceType: "user" };
    }
    if (source.type === "group" && source.groupId) {
        return { sourceId: source.groupId, sourceType: "group" };
    }
    if (source.type === "room" && source.roomId) {
        return { sourceId: source.roomId, sourceType: "room" };
    }
    return undefined;
}

// 從 Supabase 取得使用者狀態（帶記憶體快取）
// 此函數設計為永遠不會拋出異常，查詢失敗時返回 null
async function getUserState(sourceId, sourceType) {
    // 參數驗證
    if (!sourceId || !sourceType) {
        console.warn('getUserState: 缺少必要參數', { sourceId, sourceType });
        return null;
    }

    // 先檢查記憶體快取
    const cacheKey = getCacheKey(sourceId, sourceType);
    if (stateCache.has(cacheKey)) {
        const cachedState = stateCache.get(cacheKey);
        console.log(`從快取取得狀態: ${cacheKey} -> ${cachedState}`);
        return cachedState;
    }

    // 快取中沒有，從資料庫查詢
    try {
        const { data, error } = await supabase
            .from('line_user_state')
            .select('function_name')
            .eq('source_id', sourceId)
            .eq('source_type', sourceType)
            .single();//

        if (error) {
            // 如果找不到記錄，返回 null（不是錯誤）
            if (error.code === 'PGRST116') {
                return null;
            }
            console.error('查詢使用者狀態錯誤:', error);
            return null;
        }

        const functionName = data?.function_name || null;

        // 將查詢結果存入快取
        if (functionName) {
            stateCache.set(cacheKey, functionName);
            console.log(`狀態已存入快取: ${cacheKey} -> ${functionName}`);
        }

        return functionName;
    } catch (error) {
        // 捕獲所有可能的異常，確保函數不會拋出錯誤
        console.error('查詢使用者狀態異常:', error);
        return null;
    }
}

// 更新或插入使用者狀態到 Supabase 和記憶體快取
// 此函數設計為永遠不會拋出異常，資料庫更新失敗時仍會更新快取並繼續執行
async function setUserState(sourceId, sourceType, functionName) {
    // 先更新記憶體快取（即使資料庫更新失敗，記憶體也會更新）
    const cacheKey = getCacheKey(sourceId, sourceType);
    stateCache.set(cacheKey, functionName);
    console.log(`記憶體快取已更新: ${cacheKey} -> ${functionName}`);

    try {
        // 先查詢是否存在相同的 source_id 和 source_type 記錄
        const { data: existingData, error: queryError } = await supabase
            .from('line_user_state')
            .select('id')
            .eq('source_id', sourceId)
            .eq('source_type', sourceType)
            .limit(1);

        if (queryError) {
            console.error('查詢使用者狀態錯誤（使用快取繼續執行）:', queryError);
            return null;
        }

        let result;
        if (existingData && existingData.length > 0) {
            // 記錄存在，執行更新
            const { data, error } = await supabase
                .from('line_user_state')
                .update({
                    function_name: functionName
                })
                .eq('source_id', sourceId)
                .eq('source_type', sourceType)
                .select()
                .single();

            if (error) {
                console.error('更新使用者狀態錯誤（使用快取繼續執行）:', error);
                return null;
            }
            result = data;
        } else {
            // 記錄不存在，執行插入
            const { data, error } = await supabase
                .from('line_user_state')
                .insert({
                    source_id: sourceId,
                    source_type: sourceType,
                    function_name: functionName
                })
                .select()
                .single();

            if (error) {
                console.error('插入使用者狀態錯誤（使用快取繼續執行）:', error);
                return null;
            }
            result = data;
        }

        return result;
    } catch (error) {
        console.error('更新使用者狀態異常（使用快取繼續執行）:', error);
        // 不拋出錯誤，讓程式繼續使用快取執行
        return null;
    }
}

/*
 * 建立通用狀態切換器 Middleware
 * @param {Object} functionMapping - 功能切換關鍵字對應表（使用者輸入 -> 功能名稱）
 * @param {Object} functionRouterMap - 功能名稱對應 Router 的物件
 * @param {Object} context - 額外的上下文資訊，會附加到 req.context 供子 router 使用（可選）
 * @returns {Function} Express middleware 函數
 */
export function createStateSwitcher(functionMapping, functionRouterMap, context = {}) {
    return async (req, res, next) => {
        try {
            // 將 context 附加到 req 物件，供子 router 使用
            req.context = context;

            // 處理每個事件
            for (const event of req.body?.events || []) {
                const sourceInfo = getSourceInfo(event.source);
                if (!sourceInfo) continue;

                // 檢查是否是文字訊息且包含功能切換關鍵字
                if (event.type === 'message' && event.message.type === 'text') {
                    const userMessage = event.message.text;

                    // 檢查是否為功能切換關鍵字
                    const functionName = functionMapping[userMessage];
                    if (functionName) {
                        // 切換功能模式並儲存到 Supabase 和記憶體
                        // setUserState 不會拋出錯誤，即使資料庫失敗也會更新快取
                        await setUserState(sourceInfo.sourceId, sourceInfo.sourceType, functionName);
                        console.log(`使用者 ${sourceInfo.sourceId} (${sourceInfo.sourceType}) 切換到功能: ${functionName}`);

                        // 檢查 router 是否存在
                        const router = functionRouterMap[functionName];
                        if (!router) {
                            console.error(`找不到功能 ${functionName} 對應的 router`);
                            return res.status(500).json({ error: `功能 ${functionName} 尚未實作` });
                        }

                        return router(req, res, next);
                    }
                }
            }

            // 根據使用者當前功能動態載入對應的路由
            // 取得第一個事件的來源資訊（如果有多個事件，使用第一個）
            const firstEvent = req.body?.events?.[0];
            const sourceInfo = firstEvent ? getSourceInfo(firstEvent.source) : null;
            console.log('sourceInfo', sourceInfo);
            if (!sourceInfo) {
                return res.status(200).send('OK');//給 LINE 驗證用
            }

            // 從記憶體快取或 Supabase 取得當前功能狀態（如果查詢失敗，使用預設功能繼續執行）
            const currentFunction = await getUserState(sourceInfo.sourceId, sourceInfo.sourceType) || "default";
            console.log('currentFunction', currentFunction);

            const router = functionRouterMap[currentFunction];
            if (!router) {
                console.error(`找不到功能 ${currentFunction} 對應的 router`);
                return res.status(500).json({ error: `功能 ${currentFunction} 尚未實作` });
            }

            // 處理請求
            return router(req, res, next);
        } catch (error) {
            console.error('動態路由錯誤:', error);
            return res.status(500).json({ error: '動態路由錯誤' });
        }
    };
}



