import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import Firecrawl from '@mendable/firecrawl-js';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });


const router = express.Router();


router.get("/", async (req, res) => {
    // const doc = await firecrawl.scrape('https://hahow.in/', { formats: ['markdown'] });
    const doc = await firecrawl.scrape('https://wallstreetcn.com/', { formats: ['markdown'] });
    console.log(doc.markdown,"doc____________________");

    if (!doc.markdown) {
        res.send("網站抓取失敗");
        return;
    }

    // 使用 OpenAI 的 GPT-4.1-mini 模型生成摘要
    const summary = await openai.responses.create({
        model: "gpt-4.1-mini",
        //instructions: "你是一位專業的摘要生成器，請你根據以下內容生成一段摘要。不要使用任何普通文字，盡量只用表情符號。",
        // instructions: "這是一個線上課程網站，你能幫我從這個網站中的markdown格式中找出目前有什麼課程嗎？",
        instructions: "這是一個財經網站，幫我從這個網站中的markdown格式中找出目前有什麼重要財經資訊跟ai相關內容",
        input: [
            {
                role: "user",
                content: doc.markdown
            }
        ],
    });
    if (summary.output_text) {
        res.send(summary.output_text);
    } else {
        res.send("摘要生成失敗");
    }


});


//做延遲
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


export default router;



