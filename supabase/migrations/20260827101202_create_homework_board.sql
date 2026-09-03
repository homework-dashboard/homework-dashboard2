/*
# Homework board schema (music school, no sign-in)

## Overview
Creates the data for a public homework board. Parents open the app without any
login and browse: teachers -> a teacher's schedule of subjects/classes -> the
homework table for that class. Homework rows carry a date plus two homework
fields, one for Solfeggio ("сольфеджио") and one for Music Literature
("музыкальная литература").

## New tables
1. `teachers`
   - `id` (uuid, primary key)
   - `name` (text) - teacher's display name
   - `sort_order` (int) - ordering in the list
   - `created_at` (timestamptz)
2. `lessons` - a teacher's schedule rows (subject + class)
   - `id` (uuid, primary key)
   - `teacher_id` (uuid, FK -> teachers, cascade delete)
   - `subject` (text) - e.g. Сольфеджио / Муз. литература / general label
   - `class_name` (text) - the class or group, e.g. "3 класс"
   - `sort_order` (int)
   - `created_at` (timestamptz)
3. `homework` - homework rows for one lesson/class
   - `id` (uuid, primary key)
   - `lesson_id` (uuid, FK -> lessons, cascade delete)
   - `due_date` (date) - the date the homework refers to
   - `solfeggio` (text) - homework for solfeggio
   - `music_literature` (text) - homework for music literature
   - `created_at` (timestamptz)

## Security
- RLS enabled on all three tables.
- The app has NO sign-in, so all data is intentionally public/shared and every
  policy is scoped `TO anon, authenticated` with `USING (true)` /
  `WITH CHECK (true)`. Separate policies per CRUD verb.

## Notes
1. Foreign keys cascade so removing a teacher cleans up their lessons and
   homework automatically.
2. Indexes added on the foreign keys and on homework due_date for fast lookups.
*/

CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  class_name text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  solfeggio text NOT NULL DEFAULT '',
  music_literature text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lessons_teacher_id_idx ON lessons(teacher_id);
CREATE INDEX IF NOT EXISTS homework_lesson_id_idx ON homework(lesson_id);
CREATE INDEX IF NOT EXISTS homework_due_date_idx ON homework(due_date);

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;

-- teachers policies
DROP POLICY IF EXISTS "anon_select_teachers" ON teachers;
CREATE POLICY "anon_select_teachers" ON teachers FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_teachers" ON teachers;
CREATE POLICY "anon_insert_teachers" ON teachers FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_teachers" ON teachers;
CREATE POLICY "anon_update_teachers" ON teachers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_teachers" ON teachers;
CREATE POLICY "anon_delete_teachers" ON teachers FOR DELETE
  TO anon, authenticated USING (true);

-- lessons policies
DROP POLICY IF EXISTS "anon_select_lessons" ON lessons;
CREATE POLICY "anon_select_lessons" ON lessons FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_lessons" ON lessons;
CREATE POLICY "anon_insert_lessons" ON lessons FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_lessons" ON lessons;
CREATE POLICY "anon_update_lessons" ON lessons FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_lessons" ON lessons;
CREATE POLICY "anon_delete_lessons" ON lessons FOR DELETE
  TO anon, authenticated USING (true);

-- homework policies
DROP POLICY IF EXISTS "anon_select_homework" ON homework;
CREATE POLICY "anon_select_homework" ON homework FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_homework" ON homework;
CREATE POLICY "anon_insert_homework" ON homework FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_homework" ON homework;
CREATE POLICY "anon_update_homework" ON homework FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_homework" ON homework;
CREATE POLICY "anon_delete_homework" ON homework FOR DELETE
  TO anon, authenticated USING (true);
