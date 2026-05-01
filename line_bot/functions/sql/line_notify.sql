-- LINE 通知機器人資料表
-- 請在 Supabase SQL Editor 中執行此腳本

-- 建立 line_notify 資料表
CREATE TABLE IF NOT EXISTS line_notify (
  id BIGSERIAL PRIMARY KEY,
  source_id VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) NOT NULL, -- 'user', 'group', 'room'
  message TEXT NOT NULL,
  notify_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

-- 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_line_notify_source_id ON line_notify(source_id);
CREATE INDEX IF NOT EXISTS idx_line_notify_status ON line_notify(status);
CREATE INDEX IF NOT EXISTS idx_line_notify_notify_time ON line_notify(notify_time);
CREATE INDEX IF NOT EXISTS idx_line_notify_created_at ON line_notify(created_at);

-- 建立 updated_at 自動更新的觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_line_notify_updated_at 
    BEFORE UPDATE ON line_notify 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 建立註解
COMMENT ON TABLE line_notify IS 'LINE 通知機器人的通知記錄表';
COMMENT ON COLUMN line_notify.id IS '通知記錄的唯一識別碼';
COMMENT ON COLUMN line_notify.source_id IS 'LINE 使用者 ID、群組 ID 或房間 ID';
COMMENT ON COLUMN line_notify.source_type IS '來源類型：user, group, room';
COMMENT ON COLUMN line_notify.message IS '通知訊息內容';
COMMENT ON COLUMN line_notify.notify_time IS '預定通知時間（ISO 8601 格式）';
COMMENT ON COLUMN line_notify.status IS '通知狀態：pending, sent, failed, cancelled';
COMMENT ON COLUMN line_notify.created_at IS '記錄建立時間';
COMMENT ON COLUMN line_notify.updated_at IS '記錄最後更新時間';
COMMENT ON COLUMN line_notify.sent_at IS '通知實際發送時間';
COMMENT ON COLUMN line_notify.error_message IS '錯誤訊息（如果發送失敗）';


