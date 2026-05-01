import admin from "firebase-admin";

// 確保 Firebase Admin 只初始化一次
if (!admin.apps.length) {
    admin.initializeApp();
}

const bucket = admin.storage().bucket();

/**
 * 清理 Storage 中 tts/ 資料夾內超過 1 天的語音檔案
 */
export async function cleanOldTtsFiles() {
    console.log("開始執行 TTS 語音檔清理排程...");

    try {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        // 只掃描 tts/ 這個資料夾底下的檔案
        const [files] = await bucket.getFiles({ prefix: "tts/" });

        if (!files || files.length === 0) {
            console.log("tts/ 資料夾目前沒有檔案，無需清理。");
            return {
                success: true,
                deletedCount: 0,
                totalFiles: 0,
                message: "無檔案可清理",
            };
        }

        console.log(`在 tts/ 找到 ${files.length} 個檔案，開始檢查是否超過 1 天...`);

        let deletedCount = 0;
        let skippedCount = 0;

        for (const file of files) {
            try {
                // 取得檔案 metadata（有些情況 getFiles 回傳的 file.metadata 可能還沒帶 timeCreated，所以保險再取一次）
                const [metadata] = file.metadata
                    ? [file.metadata]
                    : await file.getMetadata();

                const timeCreatedStr = metadata.timeCreated;
                if (!timeCreatedStr) {
                    console.log(`檔案 ${file.name} 沒有 timeCreated，略過`);
                    skippedCount++;
                    continue;
                }

                const createdTime = new Date(timeCreatedStr).getTime();
                const ageMs = now - createdTime;

                if (ageMs > oneDayMs) {
                    console.log(`刪除超過 1 天的檔案：${file.name}，建立時間：${timeCreatedStr}`);
                    await file.delete();
                    deletedCount++;
                } else {
                    skippedCount++;
                }
            } catch (err) {
                console.error(`檢查或刪除檔案 ${file.name} 時發生錯誤:`, err);
                skippedCount++;
            }
        }

        console.log(
            `TTS 清理完成：總共 ${files.length} 個檔案，刪除 ${deletedCount} 個，保留/略過 ${skippedCount} 個。`
        );

        return {
            success: true,
            deletedCount,
            skippedCount,
            totalFiles: files.length,
        };
    } catch (error) {
        console.error("執行 TTS 語音檔清理時發生錯誤:", error);
        return {
            success: false,
            error: error.message,
        };
    }
}



