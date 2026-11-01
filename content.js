/* Контент приложения: единое хранилище для публичных разделов и админ-панели.
   По умолчанию данные берутся из merch-data.js и photos-data.js, а события,
   администраторы и партнёры заданы ниже. Всё, что администратор меняет через
   интерфейс, сохраняется в localStorage этого устройства.

   window.ContentStore:
   get()            — текущие данные
   update(fn)       — изменить и сохранить (fn получает объект данных)
   reset()          — вернуть исходный набор
   exportJson()     — строка для резервной копии
   importJson(text) — загрузить резервную копию */
(function () {
  'use strict';
  const KEY = 'mnsk_club_content_v1';
  const LISTS = ['news', 'events', 'photos', 'merch', 'admins', 'partners'];
  const clone = value => JSON.parse(JSON.stringify(value));

  function seed() {
    return {
      version: 1,
      news: [],
      events: [
        {
          id: 'ev-club-meeting',
          date: '2026-10-31',
          badge: 'ПРИМЕР',
          title: 'Клубная встреча',
          text: 'Тестовая запись. Адрес и время будут уточнены.'
        },
        {
          id: 'ev-club-quest',
          date: '2026-11-07',
          badge: 'ПРИМЕР',
          title: 'Клубный квест',
          text: 'Демонстрация карточки мероприятия. Это не настоящий анонс.'
        }
      ],
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

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.warn('Content store:', error);
      return seed();
    }
  }

  let data = read();

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Content save:', error);
      emit('content:error', error);
      return false;
    }
    emit('content:changed');
    return true;
  }

  function get() {
    return data;
  }

  function update(mutator) {
    const before = clone(data);
    mutator(data);
    if (save()) return true;
    data = before;
    return false;
  }

  function reset() {
    const before = data;
    data = seed();
    if (save()) return true;
    data = before;
    return false;
  }

  function exportJson() {
    return JSON.stringify(data, null, 2);
  }

  function importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Файл не похож на резервную копию');
    }
    const next = normalize(parsed);
    const hasList = LISTS.some(key => Array.isArray(parsed[key]));
    if (!hasList) throw new Error('В файле нет данных приложения');
    const before = data;
    data = next;
    if (!save()) {
      data = before;
      throw new Error('Не хватает места в браузере');
    }
    return data;
  }

  window.ContentStore = { get, update, reset, save, exportJson, importJson, seed };

  /* Keep other open tabs in sync when content changes. */
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    data = read();
    emit('content:changed');
  });
})();
