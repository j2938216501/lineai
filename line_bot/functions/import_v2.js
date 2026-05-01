// import express from "express";
// import * as line from "@line/bot-sdk";
// import { createClient } from '@supabase/supabase-js';
// import fs from 'fs';
// import dotenv from "dotenv";
// const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseKey = process.env.SUPABASE_KEY;
// const supabase = createClient(supabaseUrl, supabaseKey);
import dotenv from "dotenv";
dotenv.config(); // 加載 .env 檔案

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// 初始化 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log("SUPABASE_URL:", supabaseUrl);
console.log("SUPABASE_KEY:", supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  throw new Error("請確認 .env 檔案中的 SUPABASE_URL 和 SUPABASE_KEY 是否正確設定！");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 讀取檔案
const fileContent = fs.readFileSync('junior_english.txt', 'utf-8');
const lines = fileContent.split('\n');

const documents = [];

for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 解析格式: "1.    abroad              	[副]在國外"
    const match = trimmed.match(/^(\d+)\.\s+(\S+)\s+\[([^\]]+)\](.+)$/);

    if (match) {
        const [, number, word, partOfSpeech, definition] = match;

        documents.push({
            collection_id: 1, // 確認 collection_id=1 已存在
            title: word,
            content: `${word} [${partOfSpeech}] ${definition.trim()}`,
            note: `${partOfSpeech}`,
            show: true
        });
    }
}

// 批次寫入 (每次 100 筆)
async function insertData() {
    for (let i = 0; i < documents.length; i += 100) {
        const batch = documents.slice(i, i + 100);
        const { error } = await supabase
            .from('knowledge_documents')
            .insert(batch);

        if (error) {
            console.error(`批次 ${i / 100 + 1} 失敗:`, error);
            throw new Error("資料插入失敗，請檢查 collection_id 是否正確。");
        } else {
            console.log(`批次 ${i / 100 + 1} 完成 (${batch.length} 筆)`);
        }
    }
    console.log('全部完成! 總共寫入 ' + documents.length + ' 筆資料。');
}

// 執行
insertData().catch(console.error);