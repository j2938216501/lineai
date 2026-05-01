// fix-file.js - 自動修復格式問題
import fs from 'fs';

const content = fs.readFileSync('junior_english.txt', 'utf-8');
const lines = content.split('\n');
const fixedLines = lines.map(line => {
    // 將 "123.word" 修正為 "123. word"
    return line.replace(/^(\d+)\.([^\s])/, '$1. $2');
});
fs.writeFileSync('junior_english_fixed.txt', fixedLines.join('\n'));
console.log('已修復並儲存為 junior_english_fixed.txt');