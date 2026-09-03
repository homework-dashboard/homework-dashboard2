import { useEffect, useState, useCallback } from 'react';

export type Route =
  | { view: 'teachers' }
  | { view: 'lessons'; teacherSlug: string }
  | { view: 'homework'; teacherSlug: string; lessonSlug: string }
  | { view: 'lessons-legacy'; teacherId: string }
  | { view: 'homework-legacy'; teacherId: string; lessonId: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Detect base path at runtime: /homework-dashboard/ on GitHub Pages, / on bolt.host
const BASE = (() => {
  const path = window.location.pathname;
  if (path.indexOf('/homework-dashboard/') === 0 || path === '/homework-dashboard') {
    return '/homework-dashboard';
  }
  return '';
})();

function parsePath(): Route {
  const path = window.location.pathname.slice(BASE.length) || '/';
  const parts = path.split('/').filter(Boolean);

  // New hierarchical URLs: prepodavateli/{teacher}/{lesson}
  if (parts.length >= 3 && parts[0] === 'prepodavateli') {
    return { view: 'homework', teacherSlug: parts[1], lessonSlug: parts[2] };
  }
  if (parts.length >= 2 && parts[0] === 'prepodavateli') {
    return { view: 'lessons', teacherSlug: parts[1] };
  }
  if (parts.length >= 1 && parts[0] === 'prepodavateli') {
    return { view: 'teachers' };
  }

  // Legacy slug URLs with /zadanie/ segment
  if (parts.length >= 4 && parts[0] === 'prepodavateli' && parts[2] === 'zadanie') {
    return { view: 'homework', teacherSlug: parts[1], lessonSlug: parts[3] };
  }

  // Legacy UUID-based URLs
  if (parts.length >= 3 && parts[0] === 'homework' && UUID_RE.test(parts[1]) && UUID_RE.test(parts[2])) {
    return { view: 'homework-legacy', teacherId: parts[1], lessonId: parts[2] };
  }
  if (parts.length >= 2 && parts[0] === 'lessons' && UUID_RE.test(parts[1])) {
    return { view: 'lessons-legacy', teacherId: parts[1] };
  }

  return { view: 'teachers' };
}

export function routeToPath(route: Route): string {
  if (route.view === 'homework') return `${BASE}/prepodavateli/${route.teacherSlug}/${route.lessonSlug}`;
  if (route.view === 'lessons') return `${BASE}/prepodavateli/${route.teacherSlug}`;
  return `${BASE}/prepodavateli`;
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => {
    // Redirect old hash-based URLs to clean paths
    if (window.location.hash) {
      const hash = window.location.hash.replace(/^#\/?/, '');
      const parts = hash.split('/').filter(Boolean);
      if (parts.length >= 3 && parts[0] === 'prepodavateli') {
        const cleanPath = `${BASE}/prepodavateli/${parts[1]}/${parts[2]}`;
        window.history.replaceState(null, '', cleanPath);
      } else if (parts.length >= 2 && parts[0] === 'prepodavateli') {
        const cleanPath = `${BASE}/prepodavateli/${parts[1]}`;
        window.history.replaceState(null, '', cleanPath);
      } else if (parts.length >= 1 && parts[0] === 'prepodavateli') {
        const cleanPath = `${BASE}/prepodavateli`;
        window.history.replaceState(null, '', cleanPath);
      }
    }
    return parsePath();
  });

  useEffect(() => {
    const onPopState = () => setRoute(parsePath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((r: Route) => {
    const path = routeToPath(r);
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setRoute(r);
  }, []);

  return { route, navigate };
}
