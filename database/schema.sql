-- Run this in your Supabase SQL editor to set up the schema

-- CALLS table
create table if not exists calls (
    id                  uuid primary key default gen_random_uuid(),
    created_at          timestamptz default now(),
    audio_filename      text,
    duration_seconds    int,
    language_detected   text,
    patient_name        text,
    patient_id          text,
    sentiment           text,           -- frustrated | neutral | satisfied
    sentiment_score     float,
    raw_transcript      text,
    ai_summary          text,
    asr_provider        text,           -- sarvam | vakyansh | whisper
    llm_provider        text,           -- gemini | qwen-ollama
    confidence_score    float,
    needs_review        boolean default false,
    status              text default 'processing'  -- processing | routed | needs_review
);

-- ACTIONS table
create table if not exists actions (
    id              uuid primary key default gen_random_uuid(),
    call_id         uuid references calls(id) on delete cascade,
    created_at      timestamptz default now(),
    action_text     text not null,
    department      text not null,      -- free text; see routing/departments.json for the list
    priority        text default 'medium',  -- high | medium | low
    trigger_phrase  text,
    reasoning       text,
    confidence      float,
    status          text default 'open',    -- open | in_progress | resolved
    assigned_to     text
);

-- DEPARTMENTS view for load tracking
create or replace view department_load as
select
    department,
    count(*) filter (where status = 'open') as open_count,
    count(*) as total_count
from actions
group by department;

-- Enable Row Level Security (adjust policies as needed for prod)
alter table calls enable row level security;
alter table actions enable row level security;

-- Allow all for anon key (hackathon — tighten for prod)
create policy "allow_all_calls" on calls for all using (true);
create policy "allow_all_actions" on actions for all using (true);
