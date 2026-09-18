import { useEffect, useState } from "react";
import { fetchMajors } from "../api/backend/majors";

const moduleCache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();

function getMajors(school: string): Promise<string[]> {
  const cached = moduleCache.get(school);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(school);
  if (existing) return existing;

  const promise = fetchMajors(school)
    .then((majors) => {
      moduleCache.set(school, majors);
      inflight.delete(school);
      return majors;
    })
    .catch((err: unknown) => {
      inflight.delete(school);
      throw err;
    });

  inflight.set(school, promise);
  return promise;
}

// `school` should already be settled (e.g. debounced) by the caller — every
// change triggers a fetch (cached per exact string after the first).
export function useMajors(school: string) {
  const trimmed = school.trim();
  const [majors, setMajors] = useState<string[]>(trimmed ? moduleCache.get(trimmed) ?? [] : []);
  const [loading, setLoading] = useState(!!trimmed && !moduleCache.has(trimmed));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trimmed) {
      setMajors([]);
      setLoading(false);
      setError(null);
      return;
    }
    const cached = moduleCache.get(trimmed);
    if (cached) {
      setMajors(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMajors(trimmed)
      .then((list) => {
        if (cancelled) return;
        setMajors(list);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "학과 목록을 불러오지 못했습니다.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trimmed]);

  return { majors, loading, error };
}
