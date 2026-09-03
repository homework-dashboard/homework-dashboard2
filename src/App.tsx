import { useEffect, useState, useCallback } from 'react';
import { Music, Home, Pencil, LogIn, LogOut, ShieldCheck, Moon, Sun, UserCircle, Save } from 'lucide-react';
import type { Teacher, Lesson } from '@/types';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/useTheme';
import { useRouter } from '@/lib/useRouter';
import TeachersView from '@/components/TeachersView';
import LessonsView from '@/components/LessonsView';
import HomeworkView from '@/components/HomeworkView';
import AuthModal from '@/components/AuthModal';
import AdminPanel from '@/components/AdminPanel';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import ProfileModal from '@/components/ProfileModal';

type MyProfile = {
  teacher_id: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
};

function App() {
  const { theme, toggle } = useTheme();
  const { route, navigate } = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [session, setSession] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const checkAdmin = useCallback(async () => {
    const { data } = await supabase.rpc('is_current_admin');
    setIsAdmin(!!data);
    return !!data;
  }, []);

  const loadProfile = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_teacher_profile') as { data: MyProfile[] | null };
    if (data && data.length > 0) {
      setMyProfile(data[0]);
      if (data[0].must_change_password) {
        setForcePasswordChange(true);
      }
    } else {
      setMyProfile(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
      if (data.session) {
        (async () => {
          await checkAdmin();
          await loadProfile();
        })();
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(!!sess);
      if (sess) {
        (async () => {
          await checkAdmin();
          await loadProfile();
          if (event === 'PASSWORD_RECOVERY') {
            setForcePasswordChange(true);
          }
          if (event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') {
            setForcePasswordChange(true);
          }
        })();
      } else {
        setIsAdmin(false);
        setMyProfile(null);
        setEditMode(false);
        setForcePasswordChange(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [checkAdmin, loadProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // Redirect legacy UUID-based URLs to new slug-based URLs
  useEffect(() => {
    if (route.view === 'lessons-legacy') {
      (async () => {
        const { data } = await supabase
          .from('teachers')
          .select('slug')
          .eq('id', route.teacherId)
          .maybeSingle();
        if (data?.slug) {
          navigate({ view: 'lessons', teacherSlug: data.slug });
        } else {
          navigate({ view: 'teachers' });
        }
      })();
    } else if (route.view === 'homework-legacy') {
      (async () => {
        const [teacherRes, lessonRes] = await Promise.all([
          supabase.from('teachers').select('slug').eq('id', route.teacherId).maybeSingle(),
          supabase.from('lessons').select('slug').eq('id', route.lessonId).maybeSingle(),
        ]);
        if (teacherRes.data?.slug && lessonRes.data?.slug) {
          navigate({ view: 'homework', teacherSlug: teacherRes.data.slug, lessonSlug: lessonRes.data.slug });
        } else if (teacherRes.data?.slug) {
          navigate({ view: 'lessons', teacherSlug: teacherRes.data.slug });
        } else {
          navigate({ view: 'teachers' });
        }
      })();
    }
  }, [route, navigate]);

  const openTeacher = (t: Teacher) => {
    if (t.slug) {
      navigate({ view: 'lessons', teacherSlug: t.slug });
    }
  };

  const openLesson = (l: Lesson) => {
    if (route.view === 'lessons' && l.slug) {
      navigate({ view: 'homework', teacherSlug: route.teacherSlug, lessonSlug: l.slug });
    }
  };

  const goTeachers = () => navigate({ view: 'teachers' });

  const goLessons = () => {
    if (route.view === 'lessons' || route.view === 'homework') {
      navigate({ view: 'lessons', teacherSlug: route.teacherSlug });
    } else {
      goTeachers();
    }
  };

  const deleteMyAccount = async () => {
    const currentSession = (await supabase.auth.getSession()).data.session;
    if (!currentSession) throw new Error('Сессия завершена. Войдите снова.');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user-account`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentSession.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ userId: currentSession.user.id }),
      }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Ошибка ${response.status}`);
    }
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-stone-100 transition-colors dark:bg-slate-900">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/85 backdrop-blur dark:border-slate-700 dark:bg-slate-800/85">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <button
            onClick={goTeachers}
            className="group flex items-center gap-3 text-left"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm transition-transform group-hover:scale-105 sm:h-11 sm:w-11">
              <Music size={20} strokeWidth={2} />
            </span>
            <span>
              <span className="block font-display text-lg font-semibold leading-none text-slate-900 sm:text-2xl dark:text-slate-100">
                Расписание и задания
              </span>
              <span className="hidden text-xs font-medium uppercase tracking-widest text-amber-700 sm:block dark:text-amber-400">
                Музыкальная школа № 1 им. Н. Г. Сабитова
              </span>
            </span>
          </button>

          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <button
              onClick={toggle}
              className="flex items-center justify-center rounded-full bg-stone-100 p-2.5 text-slate-600 ring-1 ring-inset ring-stone-300 transition-colors hover:bg-stone-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-600"
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {session ? (
              <>
                {isAdmin && (
                  <button
                    onClick={() => setAdminOpen(true)}
                    className="flex items-center gap-2 rounded-full bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-900 sm:px-4 dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    <ShieldCheck size={16} /> <span className="hidden sm:inline">Админка</span>
                  </button>
                )}
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
                    editMode
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-stone-100 text-slate-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-600'
                  }`}
                >
                  {editMode ? <Save size={16} /> : <Pencil size={16} />}
                  <span className="hidden sm:inline">{editMode ? 'Сохранить' : 'Редактировать'}</span>
                </button>
                {myProfile && (
                  <button
                    onClick={() => setProfileOpen(true)}
                    className="hidden items-center gap-1.5 rounded-full bg-stone-100 px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-inset ring-stone-300 transition-colors hover:bg-stone-200 sm:flex dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-600"
                    title="Открыть профиль"
                  >
                    <UserCircle size={16} /> {myProfile.display_name}
                  </button>
                )}
                <button
                  onClick={() => setChangePasswordOpen(true)}
                  className="flex items-center justify-center rounded-full bg-stone-100 p-2.5 text-slate-600 ring-1 ring-inset ring-stone-300 transition-colors hover:bg-stone-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-600 sm:hidden"
                  title="Сменить пароль"
                >
                  <ShieldCheck size={16} />
                </button>
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-stone-300 transition-colors hover:bg-stone-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-600 sm:px-4"
                >
                  <LogOut size={16} /> <span className="hidden sm:inline">Выйти</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-stone-300 transition-colors hover:bg-stone-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-600 sm:px-4"
              >
                <LogIn size={16} /> <span>Вход</span>
              </button>
            )}
          </div>
        </div>

      </header>

      <nav className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
          <li>
            <button
              onClick={goTeachers}
              className="flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-stone-200 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <Home size={14} /> <span className="hidden sm:inline">Преподаватели</span>
            </button>
          </li>
          {route.view !== 'teachers' && route.view !== 'lessons-legacy' && route.view !== 'homework-legacy' && (
            <>
              <li className="text-stone-400 dark:text-slate-600">/</li>
              <li>
                <button
                  onClick={goLessons}
                  className="rounded-md px-2 py-1 font-medium hover:bg-stone-200 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  Расписание
                </button>
              </li>
            </>
          )}
          {(route.view === 'homework' || route.view === 'homework-legacy') && (
            <>
              <li className="text-stone-400 dark:text-slate-600">/</li>
              <li className="rounded-md px-2 py-1 font-medium text-slate-800 dark:text-slate-200">
                Задание
              </li>
            </>
          )}
        </ol>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        {route.view === 'teachers' && (
          <TeachersView
            editMode={editMode}
            onOpen={openTeacher}
            isAdmin={isAdmin}
            myProfile={myProfile}
            onDeletedSection={() => loadProfile()}
          />
        )}
        {route.view === 'lessons' && (
          <LessonsView
            teacherSlug={route.teacherSlug}
            editMode={editMode}
            onOpen={openLesson}
            isAdmin={isAdmin}
            myProfile={myProfile}
          />
        )}
        {route.view === 'homework' && (
          <HomeworkView
            lessonSlug={route.lessonSlug}
            teacherSlug={route.teacherSlug}
            editMode={editMode}
            isAdmin={isAdmin}
            myProfile={myProfile}
          />
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-4 text-center text-xs text-slate-400 sm:px-6 dark:text-slate-500">
        Домашние задания музыкальной школы
      </footer>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => {
          window.location.reload();
        }}
      />

      {profileOpen && myProfile && (
        <ProfileModal
          profileName={myProfile.display_name}
          onClose={() => setProfileOpen(false)}
          onProfileUpdated={(displayName) => setMyProfile((profile) => profile ? { ...profile, display_name: displayName } : profile)}
          onDeleteAccount={deleteMyAccount}
        />
      )}

      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      {changePasswordOpen && session && !forcePasswordChange && (
        <ChangePasswordModal
          onClose={() => setChangePasswordOpen(false)}
          onChanged={() => {
            window.location.reload();
          }}
        />
      )}

      {forcePasswordChange && session && (
        <ChangePasswordModal
          forced
          onClose={() => setForcePasswordChange(false)}
          onChanged={() => {
            window.location.reload();
          }}
        />
      )}

    </div>
  );
}

export default App;
