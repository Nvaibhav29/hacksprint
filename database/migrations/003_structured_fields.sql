-- Optional but recommended: stores the extra structure the LLM already extracts.
-- The app keeps working without it (uploads fall back to the original columns).
alter table actions add column if not exists owner  text;   -- patient_request | staff_commitment | follow_up
alter table actions add column if not exists due_by text;   -- deadline stated on the call, e.g. "within 24 hours"
alter table calls   add column if not exists entities jsonb;  -- {medications, doctors, dates, amounts}
alter table calls   add column if not exists urgent_clinical_flag boolean default false;
