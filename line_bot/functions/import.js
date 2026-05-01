// import express from "express";
// import * as line from "@line/bot-sdk";
// import { createClient } from '@supabase/supabase-js';
// import fs from 'fs';
// import dotenv from "dotenv";
// const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseKey = process.env.SUPABASE_KEY;
// const supabase = createClient(supabaseUrl, supabaseKey);

//匯入971筆單字到supabase public.knowledge_documents , 關聯 public.knowledge_collections 國中單字

import dotenv from "dotenv";
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("請確認 .env 檔案中的 SUPABASE_URL 和 SUPABASE_KEY 是否正確設定！");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 讀取檔案
const fileContent = fs.readFileSync('junior_english_fixed.txt', 'utf-8');
const lines = fileContent.split('\n');

const documents = [];

for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 修改正規表達式，讓它能處理複合詞（包含空格的單字）
    const match = trimmed.match(/^(\d+)\.\s+(.+?)\s+\[([^\]]+)\](.+)$/);

    if (match) {
        const [, number, word, partOfSpeech, definition] = match;
        if (documents.length >= 1000) break;
        
        documents.push({
            collection_id: 1,
            title: word,
            content: `${word} [${partOfSpeech}] ${definition.trim()}`,
            note: `${partOfSpeech}`,
            show: true
        });
    } else {
        // 如果某一行無法解析，印出來方便除錯
        console.log(`無法解析的行: ${trimmed.substring(0, 50)}...`);
    }
}

console.log(`共讀取 ${documents.length} 筆資料（目標 1000 筆）`);

// 批次寫入 (每次 100 筆)
async function insertData() {
    let totalInserted = 0;
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
            totalInserted += batch.length;
        }
    }
    console.log(`全部完成! 總共寫入 ${totalInserted} 筆資料。`);
}

// 執行
insertData().catch(console.error);