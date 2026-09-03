export type Teacher = {
  id: string;
  name: string;
  photo_url: string | null;
  sort_order: number;
  created_at: string;
  owner_id?: string | null;
  slug?: string | null;
};

export type Lesson = {
  id: string;
  teacher_id: string;
  subject: string;
  class_name: string;
  classroom: string | null;
  weekday: number | null;
  start_time: string | null;
  sort_order: number;
  created_at: string;
  slug?: string | null;
};

export const WEEKDAYS = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
] as const;

export function weekdayName(n: number | null): string {
  if (n == null) return '';
  return WEEKDAYS[(n - 1 + 7) % 7] ?? '';
}

export function formatTime(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

export type Homework = {
  id: string;
  lesson_id: string;
  due_date: string;
  solfeggio: string;
  music_literature: string;
  created_at: string;
};

export type HomeworkSubject = {
  id: string;
  lesson_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type HomeworkEntry = {
  id: string;
  homework_id: string;
  subject_id: string;
  content: string;
  link_url: string | null;
  created_at: string;
};
