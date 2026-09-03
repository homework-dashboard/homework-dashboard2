/*
# Add slug columns for human-readable URLs

1. Changes
- Add `slug` column to `teachers` (text, unique) — auto-generated from teacher name.
- Add `slug` column to `lessons` (text, unique) — auto-generated from weekday + class_name + time.
- Create a function `generate_teacher_slug()` that converts a name to a URL-friendly slug (lowercase, transliterated, hyphens).
- Create a function `generate_lesson_slug()` that builds a slug from weekday name + class name.
- Create triggers that auto-populate `slug` on INSERT and UPDATE when slug is null or name changes.
- Backfill slugs for all existing rows.
- Add unique indexes on slug columns.

2. Security
- No RLS changes. Slugs are public-facing identifiers used in URLs; they don't grant any additional access.
*/

-- Helper: transliterate Cyrillic to Latin and slugify
CREATE OR REPLACE FUNCTION slugify(input text) RETURNS text AS $$
DECLARE
  result text;
BEGIN
  IF input IS NULL OR input = '' THEN
    RETURN 'untitled';
  END IF;
  -- Transliterate Cyrillic
  result := lower(input);
  result := translate(result,
    'абвгдежзийклмнопрстуфхцчшщъыьэюяё',
    'abvgdezhziyklmnoprstufhcchshsch_y_euyae');
  -- Replace spaces and non-alphanumeric with hyphens
  result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');
  -- Trim leading/trailing hyphens
  result := trim(both '-' from result);
  -- Fallback
  IF result = '' THEN
    result := 'untitled';
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add slug column to teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS slug text;

-- Add slug column to lessons
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS slug text;

-- Backfill existing teachers with unique slugs
DO $$
DECLARE
  t_rec RECORD;
  base_slug text;
  final_slug text;
  counter int;
BEGIN
  FOR t_rec IN SELECT id, name FROM teachers WHERE slug IS NULL LOOP
    base_slug := slugify(t_rec.name);
    final_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM teachers WHERE slug = final_slug AND id <> t_rec.id) LOOP
      final_slug := base_slug || '-' || counter::text;
      counter := counter + 1;
    END LOOP;
    UPDATE teachers SET slug = final_slug WHERE id = t_rec.id;
  END LOOP;
END $$;

-- Backfill existing lessons with unique slugs
DO $$
DECLARE
  l_rec RECORD;
  base_slug text;
  final_slug text;
  counter int;
  weekday_names text[] := ARRAY['voskresene','ponedelnik','vtornik','sreda','chetver','pyatnitsa','subbota'];
  wd_name text;
BEGIN
  FOR l_rec IN SELECT id, weekday, class_name FROM lessons WHERE slug IS NULL LOOP
    IF l_rec.weekday IS NOT NULL AND l_rec.weekday >= 1 AND l_rec.weekday <= 7 THEN
      wd_name := weekday_names[l_rec.weekday];
    ELSE
      wd_name := 'urok';
    END IF;
    base_slug := slugify(wd_name || '-' || COALESCE(l_rec.class_name, ''));
    final_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM lessons WHERE slug = final_slug AND id <> l_rec.id) LOOP
      final_slug := base_slug || '-' || counter::text;
      counter := counter + 1;
    END LOOP;
    UPDATE lessons SET slug = final_slug WHERE id = l_rec.id;
  END LOOP;
END $$;

-- Create unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS teachers_slug_unique ON teachers (slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lessons_slug_unique ON lessons (slug) WHERE slug IS NOT NULL;

-- Trigger function for teachers: set slug on insert or when name changes
CREATE OR REPLACE FUNCTION set_teacher_slug() RETURNS trigger AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter int;
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;
  base_slug := slugify(NEW.name);
  final_slug := base_slug;
  counter := 1;
  WHILE EXISTS (SELECT 1 FROM teachers WHERE slug = final_slug AND id <> NEW.id) LOOP
    final_slug := base_slug || '-' || counter::text;
    counter := counter + 1;
  END LOOP;
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for lessons: set slug on insert
CREATE OR REPLACE FUNCTION set_lesson_slug() RETURNS trigger AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter int;
  weekday_names text[] := ARRAY['voskresene','ponedelnik','vtornik','sreda','chetver','pyatnitsa','subbota'];
  wd_name text;
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.weekday IS NOT NULL AND NEW.weekday >= 1 AND NEW.weekday <= 7 THEN
    wd_name := weekday_names[NEW.weekday];
  ELSE
    wd_name := 'urok';
  END IF;
  base_slug := slugify(wd_name || '-' || COALESCE(NEW.class_name, ''));
  final_slug := base_slug;
  counter := 1;
  WHILE EXISTS (SELECT 1 FROM lessons WHERE slug = final_slug AND id <> NEW.id) LOOP
    final_slug := base_slug || '-' || counter::text;
    counter := counter + 1;
  END LOOP;
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_teacher_slug ON teachers;
CREATE TRIGGER trigger_set_teacher_slug
  BEFORE INSERT OR UPDATE OF name ON teachers
  FOR EACH ROW EXECUTE FUNCTION set_teacher_slug();

DROP TRIGGER IF EXISTS trigger_set_lesson_slug ON lessons;
CREATE TRIGGER trigger_set_lesson_slug
  BEFORE INSERT OR UPDATE OF weekday, class_name ON lessons
  FOR EACH ROW EXECUTE FUNCTION set_lesson_slug();
