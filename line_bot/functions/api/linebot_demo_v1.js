import express from "express";
const router = express.Router();

//測試用get https://api-wiucuy53za-de.a.run.app/line_demo
router.get("/", (req, res) => {
  res.send("我是 linebot_demo webhook");
});
// 處理 line webhook https+post 
router.post("/", async (req, res) => {
    try {
        const events = req.body.events; // LINE Webhook 事件陣列
        if (!events || events.length === 0) {
            return res.status(200).send('OK'); // 沒有事件，直接回應
        }

        // 處理每個事件（例如接收訊息）
        for (const event of events) {
            if (event.type === 'message') {
                const { replyToken, message } = event;
                if (message.type === 'text') {
                    // 回覆使用者訊息
                    await client.replyMessage({
                        replyToken,
                        messages: [{
                            type: 'text',
                            text: `你說：${message.text}`
                        }]
                    });
                }
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error("Webhook 錯誤：", err);
        res.status(500).send('錯誤');
    }
});


export default router