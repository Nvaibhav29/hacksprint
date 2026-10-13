-- Optional: lets the "Please verify" tag on the call page persist after staff confirm/edit the name.
-- The app still works without it (the name edit saves; the verified tick just won't persist).
alter table calls add column if not exists patient_verified boolean default false;
