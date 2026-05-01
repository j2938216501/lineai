// firebase functions 視設為 require 模組系統。
import { onRequest } from "firebase-functions/v2/https"; // 第二代 HTTPS function
import express from "express";

import indexRouter from "./api/index.js";
import linebotDemoRouter from "./api/linebot_demo.js";


const app = express();
app.use(express.json());

app.use("/", indexRouter);
app.use("/line_demo", linebotDemoRouter);


//export const api = onRequest({},app); //原來的
export const api = onRequest(
  { 
  
     region: "asia-east1",  //設定地理位置為台灣
     cors: false,  //true 讓前端瀏覽器可以呼叫請寫 
     minInstances: 0, //	沒流量時關閉，省錢但有冷啟動延遲
     invoker: "public",
     ingressSettings: "ALLOW_ALL"
   }
  ,app);

 





