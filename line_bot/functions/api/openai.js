import express from "express";
import dotenv from "dotenv";

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

dotenv.config();
const router = express.Router();
import OpenAI from "openai";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
router.get("/", async (req, res) => {
const response = await openai.responses.create({
    model: "gpt-4o-mini",
    //model: "gpt-5-nano",
    instructions: "你將會收到一段文字，你的任務是把它翻譯成表情符號。不要使用任何普通文字，盡量只用表情符號。",
    input: "今天的天氣真美麗", //今天的天氣是陰天
    });
res.json({ response: response.output_text });
});

// 本機 http://127.0.0.1:5001/lineai-e8687/asia-east1/api/role
router.get("/role", async (req, res) => {
    const input = [
        {
            role: "user",
            content: "嗨！我是Oren，你現在在做什麼？"
        },
        {
            role: "assistant",
            content: "我正在等你提出問題，需要什麼幫忙嗎？"
        },
        {
            role: "user",
            content: "你記得我叫什麼名字嗎？"
        },
        {   role: "assistant",
            content: "當然,Oren!有什麼我可以幫你的呢?"
        },
        {
            role: "user",
            content: "談談什麼是ai agent?"
        },
        // {
        //     role: "developer",
        //     content: "用英文回答"
        // }


    ];
    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是 LINE AI 小幫手，回覆要親切並使用繁體中文。",
        input: input,
    });
    console.log(response,"response");
    res.json({ response: response.output_text });
})

// http://127.0.0.1:5001/lineai-e8687/asia-east1/api/openai/fewshot?q=llm
router.get("/prompt", async (req, res) => {
    // 定義 Prompt 
    const template = `根據以下上下文回答問題。
  如果無法根據提供的信息回答，請回答"我不知道"。
  
  上下文: 大型語言模型(LLM)是自然語言處理中最新使用的模型。
  與較小的模型相比，它們出色的性能使它們對於構建支持自然語言處理的應用程序的開發人員非常有用。
  這些模型可以通過 Hugging Face 的 transformers 庫、OpenAI 的 sdk 來開發。
  
  問題: {query}
  回答:
  `;
    const query = req.query.q || "請問蘋果的英文單字？";
    const prompt = template.replace("{query}", query);
    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是 LINE AI 小幫手，使用繁體中文，並根據提供的上下文回答。",
        input: [
            {
                role: "user",
                content: prompt
            }
        ]
    });
    res.json({
        response: response.output_text
    });
});

// http://127.0.0.1:5001/lineai-e8687/asia-east1/api/openai/fewshot?q=今天出太陽,很舒服喜歡
router.get("/fewshot", async (req, res) => {
    const template = `
        你是一個文字情緒字眼分析系統，負責從文字中找出帶有情緒的字眼，並判斷整體語氣。
        規則：
        - 如果文字中沒有明顯的情緒字眼，請回覆：「我不知道」。
        - 回覆格式需包含：
        分析：
        情緒字眼：
        情緒判斷：正面 / 負面 / 中性
        #範例 1
        文字：今天好沮喪，整個人沒勁。
        分析：句子中包含明顯的負面情緒描述，語氣低落。
        情緒字眼：沮喪、提不起勁
        情緒判斷：負面
        #範例 2
        文字：我超期待明天的旅行，真的好興奮！
        分析：文字中含有正向期待與興奮的語氣。
        情緒字眼：期待、興奮
        情緒判斷：正面
        
        請依照相同格式分析以下文字：
        文字：{query}
        分析：
        情緒字眼：
        情緒判斷：
        `;
    const query = req.query.q;
    const prompt = template.replace("{query}", query);

    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是一個情緒字眼分析 AI，負責辨識文字中的情緒字眼並判斷情緒傾向，並使用繁體中文回答。",
        input: [
            {
                role: "user",
                content: prompt
            }
        ]
    });

    res.json({
        response: response.output_text
    });
});


// http://127.0.0.1:5001/lineai-e8687/asia-east1/api/openai/webSearch?q=台北今天天氣如何?
// http://127.0.0.1:5001/lineai-e8687/asia-east1/api/openai/webSearch?q=明天天氣如何?
router.get("/webSearch", async (req, res) => {
    let query = req.query.q || "";

    // 設定台灣的地理位置資訊
    const userLocation = {
        type: "approximate",      // 必要參數：表示提供的是大致的地理位置資訊
        country: "TW",           // 台灣的 ISO 國家代碼
        city: "Taipei",               // 城市名稱（可從 query 參數指定）
        region: "Taiwan",          // 地區名稱
        timezone: "Asia/Taipei"    // IANA 時區
    };


    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是 LINE AI 聊天機器人，回覆親切並使用繁體中文。",
        tools: [
            {
                type: "web_search",
                user_location: userLocation
            },
            
        ],
        input: [
            {
                role: "user",
                content: query
            }
        ],
        include: [
            "web_search_call.action.sources"
        ]
    });
    // 印出關鍵資訊
    const hasWebSearch = response.output?.some(o => o.type ===
        "web_search_call");
    console.log("是否有網路搜尋:", hasWebSearch);
    // console.log("Output Text:", response.output_text);
    const webSearchCall = response.output?.find(o => o.type ===
        "web_search_call");
    if (webSearchCall?.action?.sources) {
        //console.log("搜尋來源:", webSearchCall.action.sources);
    }
    res.json({
        response: response.output_text
    });
})

//輸出結構化JSON
// http://127.0.0.1:5001/lineai-e8687/asia-east1/api/openai/structured?q=我買了一台 iMac，價格是 50000 元，顏色是綠色或紫色，喜歡！
router.get("/structured", async (req, res) => {
    const userInput = req.query.q || "我買了一台 iMac，價格是 50000 元，顏色是綠色或紫色，喜歡！";

    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是一個產品評論分析助手，請從使用者輸入中提取產品資訊並輸出結構化 JSON。使用繁體中文。",
        input: [
            {
                role: "user",
                //法1 評論
                // content: `請分析以下評論 並輸出結構化 JSON：${userInput}`

                //法2 評論
                content: `請分析以下評論：${userInput}`
            }
        ],
        //法1 結構化JSON
        // text: { format: { type: "json_object" } }

        //法2 結構化JSON
        text: {
            format: {
                type: "json_schema",
                name: "product_review",
                schema: zodResponseFormat(z.object({
                    product_name: z.string(),
                    price: z.number(),
                    color: z.string(),
                    features: z.array(z.string()), // 陣列欄位：產品特色列表
                }), "product_review").json_schema.schema
            }
        }
    });

    // 解析 JSON 輸出
    let parsedJson = null;
    try {
        parsedJson = JSON.parse(response.output_text);
    } catch (e) {
        console.error("JSON 解析失敗:", e);
    }

    res.json({
        output_text: parsedJson,
    });
});

// http://127.0.0.1:5001/lineai-e8687/asia-east1/api/openai/control
router.get("/control", async (req, res) => {
    const userInput = req.query.q || "請形容可樂的味道";
    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是一個 LINE AI 聊天機器人，回覆親切並使用繁體中文。",
        input: [
            {
                role: "user",
                content: userInput
            }
        ],
        // 控制回覆字數：限制最大輸出長度
        max_output_tokens: 500,

        // 控制創意指數：0.7 表示中等創意，適合一般對話
        // 可調整範圍：0.0（保守）到 2.0（高創意）
        temperature: 0.7,

        // 控制選詞範圍：0.9 表示考慮前 90% 機率的詞彙
        // 可調整範圍：0.1（嚴格選詞）到 1.0（考慮所有詞）
        top_p: 1,
    });
    res.json({
        response: response.output_text
    });
});


//openai 向量embedding 文字向量化:text-embedding-3-small
router.get("/embedding", async (req, res) => {
    try {
        // 從 query 參數獲取兩個文本，預設範例文字
        const text1 = req.query.text1 || "如何預防中暑";
        const text2 = req.query.text2 || "預防中暑的方法";

        // 使用 OpenAI Embeddings API 生成向量
        const response1 = await openai.embeddings.create({
            model: "text-embedding-3-small", // 使用最新的小型 embedding 模型
            input: text1,
        });

        const response2 = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text2,
        });

        // 提取向量
        const vector1 = response1.data[0].embedding;
        const vector2 = response2.data[0].embedding;

        // 計算餘弦相似度（Cosine Similarity）
        // 公式：cos(θ) = (A · B) / (||A|| * ||B||)
        function cosineSimilarity(vec1, vec2) {
            if (vec1.length !== vec2.length) {
                throw new Error("向量長度不相等");
            }

            let dotProduct = 0;
            let norm1 = 0;
            let norm2 = 0;

            for (let i = 0; i < vec1.length; i++) {
                dotProduct += vec1[i] * vec2[i];
                norm1 += vec1[i] * vec1[i];
                norm2 += vec2[i] * vec2[i];
            }

            norm1 = Math.sqrt(norm1);
            norm2 = Math.sqrt(norm2);

            return dotProduct / (norm1 * norm2);
        }

        // 計算餘弦相似度
        const cosineSim = cosineSimilarity(vector1, vector2);
        const dimensions = vector1.length;

        // 返回結果
        res.json({
            text1: text1,
            text2: text2,
            vector1: {
                dimensions: dimensions,
                sample: vector1.slice(0, 5), // 只顯示前 5 個維度作為範例
            },
            vector2: {
                dimensions: dimensions,
                sample: vector2.slice(0, 5), // 只顯示前 5 個維度作為範例
            },
            cosine_similarity: {
                value: cosineSim,
                percentage: (cosineSim * 100).toFixed(2) + "%",
                explanation: "餘弦相似度：範圍 -1 到 1，數值越接近 1 表示兩個文本語意越相似"
            },
            interpretation: {
                similarity_level: cosineSim > 0.8 ? "非常相似" :
                    cosineSim > 0.6 ? "相似" :
                        cosineSim > 0.4 ? "中等相似" :
                            cosineSim > 0.2 ? "不太相似" : "差異很大",
                note: "建議使用餘弦相似度來判斷文本語意相似度"
            }
        });

    } catch (error) {
        console.error("Embedding 錯誤:", error);
        res.status(500).json({
            error: "生成 embedding 時發生錯誤",
            message: error.message
        });
    }
});



//範例 functions calling 星座

function getHoroscope(sign) {
    const horoscopes = {
        "摩羯座": "今日運勢不錯，工作上會有新的突破，財運平穩。",
        "水瓶座": "今日人際關係順暢，適合拓展社交圈。",
        "雙魚座": "今日直覺敏銳，創意豐富，適合藝術創作。",
        "牡羊座": "今日精力充沛，適合挑戰新事物。",
        "金牛座": "今日財運旺盛，適合處理財務相關事務。",
        "雙子座": "今日溝通能力強，適合談判或簽約。",
        "巨蟹座": "今日家庭運佳，適合與家人共度時光。",
        "獅子座": "今日魅力四射，容易成為眾人焦點。",
        "處女座": "今日工作效率高，細心處理可獲得好成果。",
        "天秤座": "今日貴人運強，遇到困難會有人協助。",
        "天蠍座": "今日洞察力強，適合深入研究或調查。",
        "射手座": "今日冒險運佳，適合旅行或學習新技能。",
    };
    return horoscopes[sign] || `${sign} 今日運勢平穩，保持平常心即可。`;
}


router.get("/functions_calling", async (req, res) => {

    //1. 定義工具
    const tools = [
        {
            type: "function",
            name: "get_horoscope",
            description: "取得今日星座運勢。",
            parameters: {
                type: "object",
                properties: {
                    sign: {
                        type: "string",
                        description: "星座，例如：摩羯座或金牛座",
                    },
                },
                required: ["sign"], //強制模型回傳 sign 參數
                additionalProperties: false, //強制模型不能回傳其他參數 (strict: true 的話，需搭配使用)
            },
            strict: true, //強制模型遵守參數規則 function 的參數
        },
    ];
    // 2. 掛載工具，並定義提示詞，最好有明確的提示詞，讓模型知道要使用哪些工具
    const userInput = req.query.q || "請查詢摩羯座的今日運勢。";
    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是一個星座運勢查詢助手，請使用繁體中文回答。",
        tools: tools,
        input: [
            {
                role: "user",
                content: userInput
            }
        ],
    });

    let result = null;

    // 3. 檢查是否有觸發工具，如果有的話，呼叫相應的 function
    response.output.forEach((item) => {
        if (item.type === "function_call") {
            if (item.name == "get_horoscope") {
                console.log(item.arguments, "item.arguments");//回傳的是字串，需要解析成 JSON
                let sign = JSON.parse(item.arguments).sign;
                result = getHoroscope(sign);
            }
        }
    });
    res.json({
        response: result || response.output_text
    });

});
  


//cld function calling 範例
// ========== 台灣美食點餐助理 - 多工具 Function Calling ==========
// http://127.0.0.1:5001/lineai-e8687/asia-east1/api/openai/functions_calling_food?q=我想吃餛飩麵
router.get("/functions_calling_food", async (req, res) => {
    // 1. 定義多種「點餐工具」，每種對應不同的餐廳類型
    const tools = [
        {
            type: "function",
            name: "order_noodles",
            description: "點麵食類。當使用者提到麵類食物時使用，例如：排骨麵、雞湯麵、陽春麵、乾麵、米粉等。",
            parameters: {
                type: "object",
                properties: {
                    dish: { type: "string", description: "麵食名稱，例如：餛飩麵、排骨麵、乾麵" },
                    size: { type: "string", enum: ["小碗", "大碗"], description: "份量大小" }
                },
                required: ["dish", "size"],
                additionalProperties: false,
            },
            strict: true,
        },
        {
            type: "function",
            name: "order_rice",
            description: "點飯食類。當使用者提到飯類食物時使用，例如：雞排飯、雞腿飯、排骨飯、蛋炒飯等。",
            parameters: {
                type: "object",
                properties: {
                    dish: { type: "string", description: "飯食名稱，例如：雞排飯、雞腿飯" },
                    extra: { type: "string", description: "加點配菜，例如：滷蛋、燙青菜、豆腐" }
                },
                required: ["dish", "extra"],
                additionalProperties: false,
            },
            strict: true,
        },
        {
            type: "function",
            name: "order_drink",
            description: "點飲料類。當使用者提到飲料時使用，例如：珍珠奶茶、紅茶、綠茶、冬瓜茶等。",
            parameters: {
                type: "object",
                properties: {
                    drink: { type: "string", description: "飲料名稱，例如：珍珠奶茶、冬瓜茶" },
                    sugar: { type: "string", enum: ["無糖", "少糖", "半糖", "全糖"], description: "甜度" },
                    ice: { type: "string", enum: ["去冰", "少冰", "正常冰"], description: "冰塊" }
                },
                required: ["drink", "sugar", "ice"],
                additionalProperties: false,
            },
            strict: true,
        },
        {
            type: "function",
            name: "order_snack",
            description: "點小吃類。當使用者提到小吃點心時使用，例如：臭豆腐、蚵仔煎、鹽酥雞、滷味等。",
            parameters: {
                type: "object",
                properties: {
                    snack: { type: "string", description: "小吃名稱，例如：臭豆腐、蚵仔煎" },
                    spicy: { type: "string", enum: ["不辣", "小辣", "中辣", "大辣"], description: "辣度" }
                },
                required: ["snack", "spicy"],
                additionalProperties: false,
            },
            strict: true,
        }
    ];

    // 2. 取得使用者輸入
    const userInput = req.query.q || "我想吃鹽酥雞配珍珠奶茶";
    console.log("📝 使用者點餐：", userInput);

    // 3. 第一次呼叫：讓模型決定點什麼
    const firstResponse = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: `你是一個親切的台灣美食點餐助理，幫使用者根據想吃的食物選擇對應的點餐工具。

重要規則：
- 麵食（排骨麵、乾麵、米粉）→ order_noodles
- 飯食（雞排飯、雞腿飯、炒飯）→ order_rice
- 飲料（奶茶、紅茶、冬瓜茶）→ order_drink
- 小吃（臭豆腐、蚵仔煎、鹽酥雞）→ order_snack
- 使用繁體中文，語氣親切像在地小吃攤老闆
- 可以同時點多種食物（觸發多個工具）`,
        tools: tools,
        input: [{ role: "user", content: userInput }],
    });

    // 4. 找出所有觸發的工具
    const functionCalls = firstResponse.output?.filter(item => item.type === "function_call") || [];
    console.log(`🍽️ 觸發了 ${functionCalls.length} 個點餐項目`);

    // 5. 執行對應 function 並收集結果
    const orderResults = [];
    const newInput = [{ role: "user", content: userInput }];

    for (const functionCall of functionCalls) {
        const args = typeof functionCall.arguments === "string"
            ? JSON.parse(functionCall.arguments)
            : functionCall.arguments;

        let result;
        switch (functionCall.name) {
            case "order_noodles": result = orderNoodles(args.dish, args.size); break;
            case "order_rice":    result = orderRice(args.dish, args.extra);   break;
            case "order_drink":   result = orderDrink(args.drink, args.sugar, args.ice); break;
            case "order_snack":   result = orderSnack(args.snack, args.spicy); break;
            default: result = "不好意思，我們沒有這道菜 😅";
        }

        console.log(`✅ ${functionCall.name}:`, result);

        newInput.push({
            type: "function_call",
            call_id: functionCall.call_id,
            name: functionCall.name,
            arguments: functionCall.arguments
        });
        newInput.push({
            type: "function_call_output",
            call_id: functionCall.call_id,
            output: JSON.stringify({ result })
        });

        orderResults.push({ 項目: functionCall.name, 參數: args, 結果: result });
    }

    // 6. 第二次呼叫：產生最終回應
    let finalResponse = firstResponse;
    if (functionCalls.length > 0) {
        finalResponse = await openai.responses.create({
            model: "gpt-4o-mini",
            instructions: "根據點餐結果，用親切的台灣在地口吻，用繁體中文幫使用者確認訂單，可以加上一些溫馨提醒或推薦。",
            tools: tools,
            input: newInput,
        });
    }

    // 7. 回傳結果
    res.json({
        使用者點餐: userInput,
        點餐項目數: functionCalls.length,
        訂單明細: orderResults,
        店員回覆: finalResponse.output_text,
    });
});

// ========== 各點餐 function ==========

function orderNoodles(dish, size) {
    const prices = { "小碗": 80, "大碗": 100 };
    const emojis = { "餛飩麵": "🍜", "排骨麵": "🍜", "乾麵": "🍜", "陽春麵": "🍜", "米粉": "🍝" };
    const emoji = emojis[dish] || "🍜";
    return `${emoji} ${size}${dish} NT$${prices[size]}，湯頭濃郁，麵條Q彈，稍等一下馬上好！`;
}

function orderRice(dish, extra) {
    const prices = { "控肉飯": 60, "雞腿飯": 100, "排骨飯": 90, "蛋炒飯": 70 };
    const emojis = { "雞排飯": "🍗", "雞腿飯": "🍗", "排骨飯": "🍗", "蛋炒飯": "🍳" };
    const price = (prices[dish] || 80) + 20;
    const emoji = emojis[dish] || "🍚";
    return `${emoji} ${dish} + ${extra} NT$${price}，飯煮得軟硬適中，配菜新鮮！`;
}

function orderDrink(drink, sugar, ice) {
    const prices = { "珍珠奶茶": 60, "紅茶": 25, "綠茶": 25, "檸檬愛玉": 30, "冬瓜茶": 30 };
    const emoji = drink.includes("奶茶") ? "🧋" : drink.includes("冬瓜茶") ? "🥤" : "🧉";
    return `${emoji} ${drink}（${sugar}/${ice}）NT$${prices[drink] || 40}，手搖現做，好喝保證！`;
}

function orderSnack(snack, spicy) {
    const prices = { "臭豆腐": 60, "蚵仔煎": 70, "鹽酥雞": 80, "滷味": 50 };
    const emojis = { "臭豆腐": "🧄", "蚵仔煎": "🦪", "鹽酥雞": "🍗", "滷味": "🍢" };
    const emoji = emojis[snack] || "🍡";
    const spicyNote = spicy === "不辣" ? "不加辣醬" : `加${spicy}辣醬`;
    return `${emoji} ${snack}（${spicyNote}）NT$${prices[snack] || 60}，現點現做，香氣四溢！`;
}




export default router;