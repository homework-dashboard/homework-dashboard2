import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Plus, Trash2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Teacher, Lesson } from '@/types';
import { WEEKDAYS, weekdayName, formatTime } from '@/types';
import StateBlock from '@/components/StateBlock';

type MyProfile = {
  teacher_id: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
};

type Props = {
  teacherSlug: string;
  editMode: boolean;
  onOpen: (l: Lesson) => void;
  isAdmin?: boolean;
  myProfile?: MyProfile | null;
};

const COLS = 'grid grid-cols-[1.2fr_0.8fr_1fr_1fr_auto] gap-3';

export default function LessonsView({
  teacherSlug,
  editMode,
  onOpen,
  isAdmin,
  myProfile,
}: Props) {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newWeekday, setNewWeekday] = useState('1');
  const [newTime, setNewTime] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newClassroom, setNewClassroom] = useState('');
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);

    (async () => {
      const tRes = await supabase
        .from('teachers')
        .select('*')
        .eq('slug', teacherSlug)
        .maybeSingle();

      if (tRes.error) {
        setError(tRes.error.message);
        setLoading(false);
        return;
      }

      if (!tRes.data) {
        setError('Преподаватель не найден');
        setLoading(false);
        return;
      }

      const teacherData = tRes.data as Teacher;
      setTeacher(teacherData);

      const lRes = await supabase
        .from('lessons')
        .select('*')
        .eq('teacher_id', teacherData.id)
        .order('weekday', { ascending: true, nullsFirst: false })
        .order('start_time', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (lRes.error) {
        setError(lRes.error.message);
      } else {
        setLessons(lRes.data ?? []);
      }

      setLoading(false);

      if (myProfile && !isAdmin) {
        supabase.rpc('get_my_teacher_id').then(({ data }) => {
          setCanEdit(data === teacherData.id);
        });
      } else {
        setCanEdit(!!isAdmin);
      }
    })();
  }, [teacherSlug, myProfile, isAdmin]);

  const editable = editMode && canEdit;

  const lessonsByDay = useMemo(() => {
    const groups = new Map<number, Lesson[]>();

    lessons.forEach((lesson) => {
      const weekday = lesson.weekday ?? 1;

      if (!groups.has(weekday)) {
        groups.set(weekday, []);
      }

      groups.get(weekday)!.push(lesson);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekday, dayLessons]) => ({
        weekday,
        lessons: [...dayLessons].sort((a, b) =>
          (a.start_time ?? '').localeCompare(b.start_time ?? '')
        ),
      }));
  }, [lessons]);

  const addLesson = async () => {
    const class_name = newClass.trim();
    const classroom = newClassroom.trim();

    if ((!class_name && !classroom) || saving || !editable || !teacher) return;

    setSaving(true);

    const { data, error } = await supabase
      .from('lessons')
      .insert({
        teacher_id: teacher.id,
        class_name,
        classroom: classroom || null,
        weekday: Number(newWeekday) || 1,
        start_time: newTime || null,
        sort_order: lessons.length,
      })
      .select()
      .maybeSingle();

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data) setLessons((prev) => [...prev, data]);

    setNewClass('');
    setNewClassroom('');
    setNewTime('');
  };

  const patch = async (
    l: Lesson,
    field: 'weekday' | 'start_time' | 'class_name' | 'classroom',
    value: string | number | null
  ) => {
    setLessons((prev) =>
      prev.map((x) => (x.id === l.id ? { ...x, [field]: value } : x))
    );

    await supabase.from('lessons').update({ [field]: value }).eq('id', l.id);
  };

  const remove = async (l: Lesson) => {
    if (!confirm('Удалить эту строку расписания вместе с заданиями?')) return;

    setLessons((prev) => prev.filter((x) => x.id !== l.id));
    const { error } = await supabase.from('lessons').delete().eq('id', l.id);
    if (error) {
      setError(error.message);
    }
  };

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold text-slate-900 sm:text-3xl dark:text-slate-100">
            {teacher?.name ?? '…'}
          </h1>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Расписание по дням недели. Выберите строку, чтобы открыть домашние задания.
          </p>
        </div>

        {editMode && !canEdit && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            <Lock size={12} /> Только просмотр
          </span>
        )}
      </div>

      {loading || error ? (
        <StateBlock loading={loading} error={error} />
      ) : lessons.length === 0 && !editable ? (
        <StateBlock empty emptyText="Расписание пока не заполнено" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {editable ? (
            <div
              className={`${COLS} min-w-[600px] items-center border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-5 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-400`}
            >
              <span>День недели</span>
              <span>Время</span>
              <span>Класс</span>
              <span>Кабинет</span>
              <span className="w-6" />
            </div>
          ) : (
            <div className="grid min-w-[600px] grid-cols-[1.2fr_minmax(0,3.8fr)] border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-700/50 dark:text-slate-400">
              <div className="px-4 py-3 sm:px-5">День недели</div>

              <div className="grid grid-cols-[0.8fr_1fr_1fr_72px]">
                <div className="px-4 py-3">Время</div>
                <div className="px-4 py-3">Класс</div>
                <div className="px-4 py-3">Кабинет</div>
                <div />
              </div>
            </div>
          )}

          {editable ? (
            <div>
              {lessonsByDay.map(({ weekday, lessons: dayLessons }, groupIndex) => (
                <div
                  key={weekday}
                  className={
                    groupIndex > 0
                      ? 'border-t-2 border-stone-200 dark:border-slate-600'
                      : ''
                  }
                >
                  {dayLessons.map((l, index) => (
                    <div
                      key={l.id}
                      className={`${COLS} min-w-[600px] items-center px-4 py-3 sm:px-5 ${
                        index > 0
                          ? 'border-t border-stone-100 dark:border-slate-700'
                          : ''
                      }`}
                    >
                      <select
                        value={l.weekday ?? 1}
                        onChange={(e) =>
                          patch(l, 'weekday', Number(e.target.value))
                        }
                        className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      >
                        {WEEKDAYS.map((d, i) => (
                          <option key={d} value={i + 1}>
                            {d}
                          </option>
                        ))}
                      </select>

                      <input
                        type="time"
                        value={formatTime(l.start_time)}
                        onChange={(e) =>
                          patch(l, 'start_time', e.target.value || null)
                        }
                        className="rounded-lg border border-stone-300 px-2 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      />

                      <input
                        defaultValue={l.class_name}
                        placeholder="Класс"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== l.class_name) patch(l, 'class_name', v);
                        }}
                        className="rounded-lg border border-stone-300 px-3 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      />

                      <input
                        defaultValue={l.classroom ?? ''}
                        placeholder="Кабинет"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (l.classroom ?? '')) {
                            patch(l, 'classroom', v || null);
                          }
                        }}
                        className="rounded-lg border border-stone-300 px-2 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      />

                      <button
                        onClick={() => remove(l)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                        title="Удалить"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div>
              {lessonsByDay.map(({ weekday, lessons: dayLessons }, groupIndex) => (
                <div
                  key={weekday}
                  className={`grid min-w-[600px] grid-cols-[1.2fr_minmax(0,3.8fr)] ${
                    groupIndex > 0
                      ? 'border-t-2 border-stone-200 dark:border-slate-600'
                      : ''
                  }`}
                >
                  <div className="flex flex-col justify-center border-r border-stone-100 bg-stone-50/60 px-4 py-4 sm:px-5 dark:border-slate-700 dark:bg-slate-700/20">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {weekdayName(weekday)}
                    </span>
                  </div>

                  <div>
                    {dayLessons.map((l, index) => (
                      <button
                        key={l.id}
                        onClick={() => onOpen(l)}
                        className={`group grid w-full grid-cols-[0.8fr_1fr_1fr_72px] text-left transition-colors hover:bg-amber-50/60 dark:hover:bg-slate-700/50 ${
                          index > 0
                            ? 'border-t border-stone-100 dark:border-slate-700'
                            : ''
                        }`}
                      >
                        <span className="flex items-center px-4 py-4 text-slate-600 dark:text-slate-400">
                          {formatTime(l.start_time) || '—'}
                        </span>

                        <span className="flex items-center px-4 py-4 font-medium text-slate-800 dark:text-slate-200">
                          {l.class_name || '—'}
                        </span>

                        <span className="flex items-center px-4 py-4 text-slate-600 dark:text-slate-400">
                          {l.classroom || '—'}
                        </span>

                        <span className="flex items-center justify-center px-4 py-4">
                          <ChevronRight
                            size={20}
                            className="text-stone-300 transition-transform group-hover:translate-x-1 group-hover:text-amber-600 dark:text-slate-600 dark:group-hover:text-amber-400"
                          />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {editable && (
            <div
              className={`${COLS} min-w-[600px] items-center gap-3 border-t-2 border-stone-200 bg-stone-50 px-4 py-3 sm:px-5 dark:border-slate-600 dark:bg-slate-700/50`}
            >
              <select
                value={newWeekday}
                onChange={(e) => setNewWeekday(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </select>

              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLesson()}
                className="rounded-lg border border-stone-300 px-2 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />

              <input
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLesson()}
                placeholder="Класс"
                className="rounded-lg border border-stone-300 px-2 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />

              <input
                value={newClassroom}
                onChange={(e) => setNewClassroom(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLesson()}
                placeholder="Кабинет"
                className="rounded-lg border border-stone-300 px-2 py-2 text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />

              <button
                onClick={addLesson}
                disabled={(!newClass.trim() && !newClassroom.trim()) || saving}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">
                  {saving ? 'Сохранение...' : 'Добавить'}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
