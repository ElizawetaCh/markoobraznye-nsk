/* Контент приложения: общее хранилище для публичных разделов и админ-панели.
   Источник правды — таблица public.content в Supabase (по одной строке на раздел).
   Локальная копия в localStorage нужна для мгновенного старта и офлайн-режима:
   при потере сети приложение продолжает показывать последние загруженные данные.

   window.ContentStore:
   get()                    — текущие данные
   update(fn)               — изменить и отправить на сервер (только редактор)
   reset()                  — вернуть исходный набор и отправить его на сервер
   exportJson()             — строка для резервной копии
   importJson(text)         — загрузить резервную копию
   refresh()                — перечитать общий контент
   signIn(email, password)  — вход администратора
   signOut()                — выход
   session() / role()       — текущая сессия и роль
   isEditor()               — есть ли право на запись
   uploadImage(dataUrl)     — загрузить фото в Storage и вернуть публичный URL
   ready                    — промис первичной инициализации */
(function () {
  'use strict';
  const KEY = 'mnsk_club_content_v1';
  const LEGACY_KEY = 'mnsk_club_content_legacy_v1';
  const LISTS = ['news', 'events', 'photos', 'merch', 'admins', 'partners'];
  const SUPABASE_URL = 'https://mdaqqkacxzmgazxtmwfv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_kWfOdeslRifMrsnPLb-fEg_hkff-VMg';
  const clone = value => JSON.parse(JSON.stringify(value));

  const client = (function () {
    try {
      if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    } catch (error) {
      console.warn('Supabase client:', error);
      return null;
    }
  })();

  function seed() {
    return {
      version: 1,
      news: [],
      events: [],
      photos: clone(window.PHOTO_ALBUMS || []),
      merch: clone(window.MERCH_PRODUCTS || []),
      admins: [
        {
          id: 'adm-mikhail',
          name: 'Михаил',
          role: 'Администратор',
          car: 'Toyota Mark II в лесу',
          photo: './assets/admin-mikhail.webp'
        },
        {
          id: 'adm-irina',
          name: 'Ирина',
          role: 'Администратор',
          car: 'Toyota Mark II на автомобильной площадке',
          photo: './assets/admin-irina.webp'
        },
        {
          id: 'adm-ekaterina',
          name: 'Екатерина',
          role: 'Администратор',
          car: 'Белый Toyota Chaser на фоне музыкального мурала',
          photo: './assets/admin-ekaterina.webp'
        }
      ],
      partners: []
    };
  }

  function normalize(raw) {
    const base = seed();
    if (!raw || typeof raw !== 'object') return base;
    const out = { version: 1 };
    LISTS.forEach(key => {
      out[key] = Array.isArray(raw[key]) ? raw[key] : base[key];
    });
    return out;
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (error) {
      console.warn('Content store:', error);
      return null;
    }
  }

  function readLegacy() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (error) {
      return null;
    }
  }

  const localBeforeSync = readLocal();
  if (localBeforeSync && !readLegacy()) {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(localBeforeSync));
    } catch (error) {
      console.warn('Content legacy snapshot:', error);
    }
  }

  let data = localBeforeSync || seed();
  let session = null;
  let editorRole = null;
  let roleError = null;
  let channel = null;
  let syncChain = Promise.resolve(true);
  let pending = [];

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function saveLocal(silent) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Content save:', error);
      emit('content:error', error);
      return false;
    }
    if (!silent) emit('content:changed');
    return true;
  }

  function get() {
    return data;
  }

  function canWrite() {
    return Boolean(editorRole);
  }

  function update(mutator) {
    if (!canWrite()) {
      emit('content:denied');
      return false;
    }
    const before = clone(data);
    try {
      mutator(data);
    } catch (error) {
      console.warn('Content update:', error);
      data = before;
      return false;
    }
    const changed = LISTS.filter(key => JSON.stringify(before[key]) !== JSON.stringify(data[key]));
    if (!changed.length) return true;
    if (!saveLocal()) {
      data = before;
      return false;
    }
    emit('content:changed');
    queueSync(changed);
    return true;
  }

  async function pushSections(sections) {
    if (!client || !session) return false;
    const unique = Array.from(new Set(sections)).filter(key => LISTS.includes(key));
    if (!unique.length) return true;
    const payload = unique.map(section => ({ section, items: data[section] }));
    try {
      const { error } = await client.from('content').upsert(payload, { onConflict: 'section' });
      if (error) throw error;
    } catch (error) {
      unique.forEach(key => {
        if (!pending.includes(key)) pending.push(key);
      });
      console.warn('Content sync:', error);
      emit('content:sync-error', error);
      return false;
    }
    pending = pending.filter(key => !unique.includes(key));
    emit('content:synced', { sections: unique });
    return true;
  }

  function queueSync(sections) {
    if (!client || !session) return Promise.resolve(false);
    const copy = sections.slice();
    syncChain = syncChain.then(() => pushSections(copy)).catch(error => {
      console.warn('Content sync queue:', error);
      return false;
    });
    return syncChain;
  }

  function applyRow(row) {
    if (!row || !LISTS.includes(row.section)) return false;
    if (pending.includes(row.section)) return false;
    const next = Array.isArray(row.items) ? row.items : [];
    if (JSON.stringify(data[row.section]) === JSON.stringify(next)) return false;
    data[row.section] = next;
    saveLocal(true);
    emit('content:changed');
    return true;
  }

  function subscribeRealtime() {
    if (!client || channel) return;
    channel = client.channel('mnsk-content-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content' }, payload => {
        applyRow(payload.new);
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime:', status);
        }
      });
  }

  async function uploadDataUrls(value, cache) {
    if (typeof value === 'string') {
      if (!value.startsWith('data:image/')) return value;
      if (!cache.has(value)) cache.set(value, uploadImage(value));
      return cache.get(value);
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map(item => uploadDataUrls(item, cache)));
    }
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = await uploadDataUrls(item, cache);
      }
      return out;
    }
    return value;
  }

  async function refresh() {
    if (!client) return false;
    try {
      const { data: rows, error } = await client.from('content').select('section,items');
      if (error) throw error;
      const next = seed();
      (rows || []).forEach(row => {
        if (row && LISTS.includes(row.section) && Array.isArray(row.items)) {
          next[row.section] = row.items;
        }
      });

      /* Однократный перенос данных, сделанных до появления общей базы:
         раздел переносится, только если на сервере он ещё совпадает с
         исходным набором, а локальная копия отличается от него.
         Старые фото в base64 сначала загружаются в Storage. */
      let migrate = [];
      if (editorRole === 'owner') {
        const legacy = readLegacy();
        if (legacy) {
          const base = seed();
          LISTS.forEach(key => {
            const serverUntouched = JSON.stringify(next[key]) === JSON.stringify(base[key]);
            const localCustomized = JSON.stringify(legacy[key]) !== JSON.stringify(base[key]);
            if (serverUntouched && localCustomized) {
              next[key] = legacy[key];
              migrate.push(key);
            }
          });
        }
      }
      if (migrate.length) {
        const serverSnapshot = clone(next);
        try {
          const uploaded = new Map();
          for (const key of migrate) {
            next[key] = await uploadDataUrls(next[key], uploaded);
          }
        } catch (error) {
          console.warn('Content migration upload:', error);
          emit('content:migration-error', error);
          migrate.forEach(key => {
            next[key] = serverSnapshot[key];
          });
          migrate = [];
        }
      }

      data = normalize(next);
      saveLocal(true);
      emit('content:changed');
      subscribeRealtime();

      if (editorRole === 'owner') {
        if (migrate.length) {
          const ok = await queueSync(migrate);
          if (ok) {
            try {
              localStorage.removeItem(LEGACY_KEY);
            } catch (error) {
              console.warn('Content legacy cleanup:', error);
            }
          }
        } else if (readLegacy()) {
          try {
            localStorage.removeItem(LEGACY_KEY);
          } catch (error) {
            console.warn('Content legacy cleanup:', error);
          }
        }
      }

      emit('content:online');
      return true;
    } catch (error) {
      console.warn('Content fetch:', error);
      emit('content:offline', error);
      return false;
    }
  }

  function reset() {
    if (!canWrite()) {
      emit('content:denied');
      return false;
    }
    const before = data;
    data = seed();
    if (!saveLocal()) {
      data = before;
      return false;
    }
    emit('content:changed');
    queueSync(LISTS.slice());
    return true;
  }

  function exportJson() {
    return JSON.stringify(data, null, 2);
  }

  function importJson(text) {
    if (!canWrite()) {
      emit('content:denied');
      throw new Error('Нет доступа: войдите как администратор');
    }
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Файл не похож на резервную копию');
    }
    const next = normalize(parsed);
    const hasList = LISTS.some(key => Array.isArray(parsed[key]));
    if (!hasList) throw new Error('В файле нет данных приложения');
    const before = data;
    data = next;
    if (!saveLocal()) {
      data = before;
      throw new Error('Не хватает места в браузере');
    }
    emit('content:changed');
    queueSync(LISTS.slice());
    return data;
  }

  /* ── Авторизация ──────────────────────────────────────────────────────── */

  function authMessage(error) {
    const text = String((error && (error.message || error.error_description)) || error || '');
    if (/invalid login credentials/i.test(text)) return 'Неверный e-mail или пароль.';
    if (/email not confirmed/i.test(text)) return 'E-mail не подтверждён. Подтвердите адрес в письме.';
    if (/failed to fetch|network/i.test(text)) return 'Нет связи с сервером. Проверьте интернет.';
    return text || 'Не удалось войти.';
  }

  let rolePromise = null;

  async function resolveRole() {
    roleError = null;
    if (!client || !session) {
      editorRole = null;
      return null;
    }
    if (rolePromise) return rolePromise;

    rolePromise = (async () => {
      const email = String((session.user && session.user.email) || '').trim().toLowerCase();
      if (!email) {
        editorRole = null;
        return null;
      }

      /* Первый вошедший редактор становится владельцем; для остальных
         функция просто проверяет, есть ли доступ. */
      const check = async () => {
        await client.rpc('claim_owner');
        const { data: row, error } = await client
          .from('editors')
          .select('role,email')
          .eq('email', email)
          .maybeSingle();
        if (error) throw error;
        editorRole = row ? row.role : null;
      };

      try {
        await check();
      } catch (error) {
        /* Токен мог устареть, пока вкладка была закрыта. Обновляем сессию
           и пробуем ещё раз, чтобы администратор не терял доступ. */
        try {
          const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
          if (refreshError) throw refreshError;
          if (refreshed && refreshed.session) session = refreshed.session;
          await check();
        } catch (retryError) {
          console.warn('Role check:', retryError);
          roleError = retryError;
          editorRole = null;
        }
      }
      return editorRole;
    })();

    try {
      return await rolePromise;
    } finally {
      rolePromise = null;
    }
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Сервис входа не загрузился. Обновите страницу.');
    const { data: auth, error } = await client.auth.signInWithPassword({
      email: String(email || '').trim(),
      password: String(password || '')
    });
    if (error) throw new Error(authMessage(error));
    session = auth.session;
    const role = await resolveRole();
    if (!role) {
      try {
        await client.auth.signOut();
      } catch (error) {
        console.warn('Sign out:', error);
      }
      session = null;
      const code = String((roleError && (roleError.code || '')) || '');
      const text = String((roleError && (roleError.message || roleError)) || '');
      if (code === 'PGRST205' || /Could not find the table/i.test(text) || /claim_owner/i.test(text)) {
        throw new Error('Общая база ещё не создана. Выполните supabase/schema.sql в Supabase и попробуйте снова.');
      }
      throw new Error('Этот e-mail не в списке редакторов клуба.');
    }
    emit('auth:changed', { event: 'SIGNED_IN', session, role });
    await refresh();
    return { session, role, email: email };
  }

  async function signOut() {
    if (client) {
      try {
        await client.auth.signOut();
      } catch (error) {
        console.warn('Sign out:', error);
      }
    }
    session = null;
    editorRole = null;
    pending = [];
    emit('auth:changed', { event: 'SIGNED_OUT', session: null, role: null });
  }

  async function initAuth() {
    if (!client) return null;
    try {
      const { data: auth } = await client.auth.getSession();
      session = auth && auth.session ? auth.session : null;
      if (session) await resolveRole();
      client.auth.onAuthStateChange((event, nextSession) => {
        session = nextSession || null;
        if (event === 'SIGNED_OUT' || !session) {
          editorRole = null;
          emit('auth:changed', { event, session: null, role: null });
          return;
        }
        emit('auth:changed', { event, session, role: editorRole });
        /* Проверять права внутри callback нельзя: Supabase держит блокировку.
           Поэтому повторная проверка идёт следующим тиком. */
        setTimeout(async () => {
          const role = await resolveRole();
          emit('auth:changed', { event, session, role });
        }, 0);
      });
      emit('auth:changed', { event: 'INITIAL', session, role: editorRole });
      return session;
    } catch (error) {
      console.warn('Auth init:', error);
      return null;
    }
  }

  async function uploadImage(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
    if (!client || !canWrite()) throw new Error('Нет доступа к загрузке фото');
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const type = blob.type || 'image/webp';
    const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : type === 'image/gif' ? 'gif' : 'webp';
    const stamp = new Date().toISOString().slice(0, 10);
    const path = 'uploads/' + stamp + '/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await client.storage.from('media').upload(path, blob, {
      contentType: type,
      cacheControl: '31536000',
      upsert: false
    });
    if (error) throw new Error('Не удалось загрузить фото: ' + error.message);
    const { data: pub } = client.storage.from('media').getPublicUrl(path);
    return pub.publicUrl;
  }

  const ready = (async () => {
    await initAuth();
    await refresh();
    return true;
  })();

  window.ContentStore = {
    get,
    update,
    reset,
    save: saveLocal,
    exportJson,
    importJson,
    seed,
    refresh,
    signIn,
    signOut,
    session: () => session,
    role: () => editorRole,
    refreshRole: resolveRole,
    isEditor: canWrite,
    uploadImage,
    ready
  };

  /* Изменения в другой вкладке этого же браузера. */
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    data = readLocal() || data;
    emit('content:changed');
  });

  /* Если связь вернулась — отправить то, что не ушло. */
  window.addEventListener('online', () => {
    if (pending.length && session) queueSync(pending.slice());
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
})();
