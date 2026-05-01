import express from "express";
import { createServer } from "http";

// 把 index.js 裡的 app 直接複製過來會很複雜
// 先用這個測試 Render 能不能跑
const app = express();

app.get("/", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});