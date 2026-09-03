/*
# Redesign homework for dynamic subject columns + add classroom to lessons

## Overview
1. Add `classroom` column to `lessons` (replaces "subject" column display in schedule view).
2. Create `homework_subjects` table — one row per subject column in a lesson's homework page.
   Each lesson starts with one default subject.
3. Create `homework_entries` table — one row per (homework_date_row, subject) pair, holding the
   text content. This replaces the fixed `solfeggio`/`music_literature` columns on `homework`.
4. Migrate existing `homework` rows: create a subject from the lesson's subject name (or
   "Сольфеджио" as fallback), and move `solfeggio`/`music_literature` text into entries.
5. RLS policies on new tables — same ownership model as existing homework/lessons.

## New Tables
- `homework_subjects`: id, lesson_id, name, sort_order, created_at
- `homework_entries`: id, homework_id, subject_id, content, created_at

## Modified Tables
- `lessons`: added `classroom` text column (nullable)

## Security
- RLS enabled on both new tables.
- Policies follow the same pattern: admin OR owner of the lesson's teacher.
- SELECT open to anon+authenticated (public board).
*/

-- 1. Add classroom column to lessons
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS classroom text;

-- 2. Create homework_subjects table
CREATE TABLE IF NOT EXISTS homework_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE homework_subjects ENABLE ROW LEVEL SECURITY;

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_homework_subjects_lesson ON homework_subjects(lesson_id, sort_order);

-- 3. Create homework_entries table
CREATE TABLE IF NOT EXISTS homework_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES homework_subjects(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(homework_id, subject_id)
);

ALTER TABLE homework_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_homework_entries_hw ON homework_entries(homework_id);

-- 4. RLS policies for homework_subjects
-- SELECT: public (anyone can view the board)
DROP POLICY IF EXISTS "select_homework_subjects" ON homework_subjects;
CREATE POLICY "select_homework_subjects" ON homework_subjects
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: admin OR lesson owner
DROP POLICY IF EXISTS "insert_homework_subjects" ON homework_subjects;
CREATE POLICY "insert_homework_subjects" ON homework_subjects
  FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true))
    OR (EXISTS (SELECT 1 FROM lessons l JOIN teachers t ON t.id = l.teacher_id WHERE l.id = homework_subjects.lesson_id AND t.owner_id = auth.uid()))
  );

-- UPDATE: admin OR lesson owner
DROP POLICY IF EXISTS "update_homework_subjects" ON homework_subjects;
CREATE POLICY "update_homework_subjects" ON homework_subjects
  FOR UPDATE TO authenticated
  USING (
    (EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true))
    OR (EXISTS (SELECT 1 FROM lessons l JOIN teachers t ON t.id = l.teacher_id WHERE l.id = homework_subjects.lesson_id AND t.owner_id = auth.uid()))
  )
  WITH CHECK (
    (EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true))
    OR (EXISTS (SELECT 1 FROM lessons l JOIN teachers t ON t.id = l.teacher_id WHERE l.id = homework_subjects.lesson_id AND t.owner_id = auth.uid()))
  );

-- DELETE: admin OR lesson owner
DROP POLICY IF EXISTS "delete_homework_subjects" ON homework_subjects;
CREATE POLICY "delete_homework_subjects" ON homework_subjects
  FOR DELETE TO authenticated
  USING (
    (EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true))
    OR (EXISTS (SELECT 1 FROM lessons l JOIN teachers t ON t.id = l.teacher_id WHERE l.id = homework_subjects.lesson_id AND t.owner_id = auth.uid()))
  );

-- 5. RLS policies for homework_entries
-- SELECT: public
DROP POLICY IF EXISTS "select_homework_entries" ON homework_entries;
CREATE POLICY "select_homework_entries" ON homework_entries
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: admin OR lesson owner (via homework -> lesson -> teacher)
DROP POLICY IF EXISTS "insert_homework_entries" ON homework_entries;
CREATE POLICY "insert_homework_entries" ON homework_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true))
    OR (EXISTS (
      SELECT 1 FROM homework_entries he
      JOIN homework h ON h.id = he.homework_id
      JOIN lessons l ON l.id = h.lesson_id
      JOIN teachers t ON t.id = l.teacher_id
      WHERE he.homework_id = homework_entries.homework_id AND t.owner_id = auth.uid()
    ))
    OR (EXISTS (
      SELECT 1 FROM homework h
      JOIN lessons l ON l.id = h.lesson_id
      JOIN teachers t ON t.id = l.teacher_id
      WHERE h.id = homework_entries.homework_id AND t.owner_id = auth.uid()
    ))
  );

-- UPDATE: admin OR lesson owner
DROP POLICY IF EXISTS "update_homework_entries" ON homework_entries;
CREATE POLICY "update_homework_entries" ON homework_entries
  FOR UPDATE TO authenticated
  USING (
    (EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true))
    OR (EXISTS (
      SELECT 1 FROM homework h
      JOIN lessons l ON l.id = h.lesson_id
      JOIN teachers t ON t.id = l.teacher_id
      WHERE h.id = homework_entries.homework_id AND t.owner_id = auth.uid()
    ))
  )
  WITH CHECK (
    (EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true))
    OR (EXISTS (
      SELECT 1 FROM homework h
      JOIN lessons l ON l.id = h.lesson_id
      JOIN teachers t ON t.id = l.teacher_id
      WHERE h.id = homework_entries.homework_id AND t.owner_id = auth.uid()
    ))
  );

-- DELETE: admin OR lesson owner
DROP POLICY IF EXISTS "delete_homework_entries" ON homework_entries;
CREATE POLICY "delete_homework_entries" ON homework_entries
  FOR DELETE TO authenticated
  USING (
    (EXISTS (SELECT 1 FROM teacher_profiles tp WHERE tp.teacher_id = auth.uid() AND tp.is_admin = true))
    OR (EXISTS (
      SELECT 1 FROM homework h
      JOIN lessons l ON l.id = h.lesson_id
      JOIN teachers t ON t.id = l.teacher_id
      WHERE h.id = homework_entries.homework_id AND t.owner_id = auth.uid()
    ))
  );

-- 6. Migrate existing homework data: create a subject for each lesson that has homework,
--    and move solfeggio/music_literature into entries.
DO $$
DECLARE
  hw RECORD;
  v_lesson RECORD;
  v_subject_id uuid;
  v_subj_name text;
BEGIN
  FOR hw IN SELECT id, lesson_id, solfeggio, music_literature FROM homework LOOP
    -- Get the lesson to find its subject name
    SELECT * INTO v_lesson FROM lessons WHERE id = hw.lesson_id;
    v_subj_name := COALESCE(NULLIF(v_lesson.subject, ''), 'Сольфеджио');

    -- Check if a subject already exists for this lesson
    SELECT id INTO v_subject_id FROM homework_subjects WHERE lesson_id = hw.lesson_id AND sort_order = 0;
    IF v_subject_id IS NULL THEN
      INSERT INTO homework_subjects (lesson_id, name, sort_order)
      VALUES (hw.lesson_id, v_subj_name, 0)
      RETURNING id INTO v_subject_id;
    END IF;

    -- Insert entries for solfeggio (if non-empty)
    IF hw.solfeggio IS NOT NULL AND hw.solfeggio != '' THEN
      INSERT INTO homework_entries (homework_id, subject_id, content)
      VALUES (hw.id, v_subject_id, hw.solfeggio)
      ON CONFLICT (homework_id, subject_id) DO NOTHING;
    END IF;

    -- If music_literature is different and non-empty, create a second subject
    IF hw.music_literature IS NOT NULL AND hw.music_literature != '' THEN
      DECLARE v_subject2_id uuid;
      BEGIN
        SELECT id INTO v_subject2_id FROM homework_subjects WHERE lesson_id = hw.lesson_id AND sort_order = 1;
        IF v_subject2_id IS NULL THEN
          INSERT INTO homework_subjects (lesson_id, name, sort_order)
          VALUES (hw.lesson_id, 'Музыкальная литература', 1)
          RETURNING id INTO v_subject2_id;
        END IF;
        INSERT INTO homework_entries (homework_id, subject_id, content)
        VALUES (hw.id, v_subject2_id, hw.music_literature)
        ON CONFLICT (homework_id, subject_id) DO NOTHING;
      END;
    END IF;
  END LOOP;
END $$;

-- 7. Ensure every lesson has at least one homework_subject (for new lessons created later)
-- This will be handled in the frontend: when creating a homework row, also create a subject if none exists.
