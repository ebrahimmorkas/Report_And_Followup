import { useEffect, useState } from 'react';
import { api, qs } from './api';

/** Jamiats visible to the current user. */
export function useJamiats({ activeOnly = false } = {}) {
  const [jamiats, setJamiats] = useState([]);
  useEffect(() => {
    api.get(`/masters/jamiats${qs({ active: activeOnly ? 'true' : '' })}`).then((d) => setJamiats(d.jamiats)).catch(() => {});
  }, [activeOnly]);
  return jamiats;
}

/** Jamaats of one Jamiat (empty when no Jamiat selected). */
export function useJamaats(jamiatId, { activeOnly = false } = {}) {
  const [jamaats, setJamaats] = useState([]);
  useEffect(() => {
    if (!jamiatId) return setJamaats([]);
    let cancelled = false;
    api
      .get(`/masters/jamaats${qs({ jamiat: jamiatId, active: activeOnly ? 'true' : '' })}`)
      .then((d) => !cancelled && setJamaats(d.jamaats))
      .catch(() => !cancelled && setJamaats([]));
    return () => {
      cancelled = true;
    };
  }, [jamiatId, activeOnly]);
  return jamaats;
}

/** Activities for a tab ('report' | 'followup'). */
export function useActivities(type, { activeOnly = false } = {}) {
  const [activities, setActivities] = useState([]);
  useEffect(() => {
    api
      .get(`/activities${qs({ type, active: activeOnly ? 'true' : '' })}`)
      .then((d) => setActivities(d.activities))
      .catch(() => {});
  }, [type, activeOnly]);
  return activities;
}
