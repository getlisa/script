-- Create call_history table with all required columns
CREATE TABLE IF NOT EXISTS call_history (
    id BIGSERIAL PRIMARY KEY,
    call_id VARCHAR(255) UNIQUE NOT NULL,
    agent_id VARCHAR(255),
    call_status VARCHAR(50),
    start_timestamp TIMESTAMPTZ,
    end_timestamp TIMESTAMPTZ,
    transcript TEXT,
    recording_url TEXT,
    call_type VARCHAR(100),
    from_number VARCHAR(50),
    appointment_status VARCHAR(100),
    appointment_date DATE,
    appointment_time TIME,
    client_name VARCHAR(255),
    client_address TEXT,
    client_email VARCHAR(255),
    notes TEXT,
    user_sentiment VARCHAR(50),
    call_successful BOOLEAN,
    in_voicemail BOOLEAN,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    intent VARCHAR(50),
    summary TEXT,
    quick_summary VARCHAR(255)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_call_history_call_id ON call_history(call_id);
CREATE INDEX IF NOT EXISTS idx_call_history_agent_id ON call_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_history_start_timestamp ON call_history(start_timestamp);
CREATE INDEX IF NOT EXISTS idx_call_history_intent ON call_history(intent);
CREATE INDEX IF NOT EXISTS idx_call_history_processed ON call_history(processed);

-- Add comments for documentation
COMMENT ON TABLE call_history IS 'Enhanced call logs with AI-extracted summaries and contact information';
COMMENT ON COLUMN call_history.summary IS 'AI-generated 3-5 line summary of the call';
COMMENT ON COLUMN call_history.quick_summary IS 'AI-generated 3-4 word summary for list view';
COMMENT ON COLUMN call_history.intent IS 'AI-classified intent: Service, Emergency, Quotation, Inquiry, Others'; 