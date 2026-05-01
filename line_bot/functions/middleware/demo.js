//middleware/demo.js
export function demo(req, res, next) {
    console.log("[Demo Middleware] 進入 /users 路由前先執行");
    next(); // 別忘了呼叫 next() 才會繼續執行
}