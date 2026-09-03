/*
# Add weekday and time to lessons

## Overview
Each schedule row (a teacher's subject + class) now also carries a weekday and a
start time, so the schedule shows *when* the class happens — e.g.
"Понедельник, 16:00 — Сольфеджио, 3 класс".

## Changes
1. `lessons` table:
   - `weekday` (int, 1..7, where 1 = Monday) — nullable so existing rows stay valid.
   - `start_time` (time) — nullable start time of the lesson, e.g. 16:00.
2. No security changes — RLS already allows anon/authenticated CRUD on `lessons`.
3. Existing rows are backfilled to weekday = 1 (Monday) so they are not blank.
*/

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS weekday int;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS start_time time;

UPDATE lessons SET weekday = 1 WHERE weekday IS NULL;
