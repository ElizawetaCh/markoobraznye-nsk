/* Админ-панель: всё содержимое приложения редактируется через формы.
   Данные берутся из ContentStore (content.js) и сохраняются в браузере. */
(function () {
  'use strict';
  const $ = q => document.querySelector(q);
  const root = $('#adminRoot');
  const store = window.ContentStore;
  if (!root || !store) return;

  const uid = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const splitList = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);
  const todayIso = () => {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  };
  const formatDate = value => {
    const date = new Date(String(value || '') + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  /* Загруженные фото уменьшаются до 1280 px и сохраняются как WebP,
     чтобы не переполнить localStorage. */
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('Выберите файл изображения'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const max = 1280;
          const scale = Math.min(1, max / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          let data;
          try {
            data = canvas.toDataURL('image/webp', 0.85);
          } catch (error) {
            data = canvas.toDataURL('image/jpeg', 0.85);
          }
          resolve(data);
        };
        image.onerror = () => reject(new Error('Не удалось прочитать изображение'));
        image.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    });
  }

  /* Всплывающее уведомление и подтверждение удаления. */
  let toastTimer = null;
  function toast(message, isError) {
    const box = $('#adminToast');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
    box.classList.toggle('is-error', Boolean(isError));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 2800);
  }

  let confirmAction = null;
  function openConfirm(title, text, action) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    confirmAction = action;
    $('#confirmDialog').showModal();
  }

  /* Разделы админки: поля формы и то, как запись выглядит в списке. */
  const SECTIONS = [
    {
      key: 'news',
      title: 'Новости',
      eyebrow: 'ПУБЛИКАЦИИ',
      desc: 'Тексты, которые участники видят на главной и во вкладке «Новости».',
      add: 'Добавить новость',
      edit: 'Редактировать новость',
      imageKey: 'picture',
      fields: [
        { name: 'title', label: 'Заголовок', type: 'text', required: true, placeholder: 'Например: Открыта запись на зимний выезд' },
        { name: 'date', label: 'Дата публикации', type: 'date', required: true },
        { name: 'text', label: 'Текст новости', type: 'textarea', required: true, rows: 6, placeholder: 'Что произошло в клубе' },
        { name: 'picture', label: 'Фото', type: 'image', hint: 'Необязательно. Загрузите кадр с телефона или компьютера.' }
      ],
      empty: () => ({ date: todayIso() }),
      collect: (values, image) => ({
        title: values.title.trim(),
        date: values.date,
        text: values.text.trim(),
        picture: image || null
      }),
      row: item => ({ title: item.title, meta: formatDate(item.date), thumb: item.picture, fallback: '▤' })
    },
    {
      key: 'events',
      title: 'Мероприятия',
      eyebrow: 'КАЛЕНДАРЬ',
      desc: 'Анонсы во вкладке «События»: дата, заголовок и короткое описание.',
      add: 'Добавить мероприятие',
      edit: 'Редактировать мероприятие',
      fields: [
        { name: 'title', label: 'Название', type: 'text', required: true, placeholder: 'Клубная встреча' },
        { name: 'date', label: 'Дата', type: 'date', required: true },
        { name: 'badge', label: 'Плашка', type: 'text', placeholder: 'ПРИМЕР или ОНЛАЙН', hint: 'Необязательно. Показывается над заголовком.' },
        { name: 'text', label: 'Описание', type: 'textarea', required: true, rows: 4, placeholder: 'Где, во сколько и что будет' }
      ],
      empty: () => ({ date: todayIso(), badge: '' }),
      collect: values => ({
        title: values.title.trim(),
        date: values.date,
        badge: values.badge.trim(),
        text: values.text.trim()
      }),
      row: item => ({
        title: item.title,
        meta: [formatDate(item.date), item.badge].filter(Boolean).join(' · '),
        fallback: '▦'
      })
    },
    {
      key: 'photos',
      title: 'Фотоотчеты',
      eyebrow: 'АЛЬБОМЫ',
      desc: 'Обложки альбомов и ссылки на полные папки с кадрами.',
      add: 'Добавить альбом',
      edit: 'Редактировать альбом',
      imageKey: 'cover',
      fields: [
        { name: 'title', label: 'Название альбома', type: 'text', required: true, placeholder: 'АвтоПрятки' },
        { name: 'date', label: 'Дата встречи', type: 'text', required: true, placeholder: '10 октября 2026', hint: 'Можно написать словами — так и покажем в карточке.' },
        { name: 'count', label: 'Сколько фото', type: 'number', min: 0, placeholder: '24' },
        { name: 'cover', label: 'Обложка', type: 'image', hint: 'Загрузите кадр с мероприятия.' },
        { name: 'description', label: 'Кратко о мероприятии', type: 'textarea', required: true, rows: 3, placeholder: 'Одно-два предложения о встрече' },
        { name: 'yandexUrl', label: 'Ссылка на Яндекс.Диск', type: 'url', placeholder: 'https://disk.yandex.ru/d/...' }
      ],
      empty: () => ({ date: formatDate(todayIso()), count: 0 }),
      collect: (values, image) => ({
        title: values.title.trim(),
        date: values.date.trim(),
        count: Number(values.count) || 0,
        cover: image || null,
        description: values.description.trim(),
        yandexUrl: values.yandexUrl.trim()
      }),
      row: item => ({
        title: item.title,
        meta: [item.date, item.count ? item.count + ' фото' : ''].filter(Boolean).join(' · '),
        thumb: item.cover,
        fallback: '▣'
      })
    },
    {
      key: 'merch',
      title: 'Мерч',
      eyebrow: 'АТРИБУТИКА',
      desc: 'Товары на главной и в разделе «Мерч»: цена, описание и размерная сетка.',
      add: 'Добавить товар',
      edit: 'Редактировать товар',
      fields: [
        { name: 'name', label: 'Название', type: 'text', required: true, placeholder: 'Футболка клуба' },
        { name: 'price', label: 'Цена', type: 'text', required: true, placeholder: '2 500 ₽' },
        {
          name: 'icon', label: 'Иконка', type: 'select', options: [
            ['shirt', 'Футболка'], ['hoodie', 'Худи'], ['cap', 'Кепка'],
            ['sticker', 'Стикер'], ['frame', 'Рамка'], ['key', 'Брелок']
          ]
        },
        { name: 'note', label: 'Короткая подпись', type: 'text', placeholder: 'Размеры S–XXL' },
        { name: 'photos', label: 'Фотографии товара', type: 'images', max: 6, hint: 'До 6 фото. Первое станет обложкой карточки. Без фото покажем иконку.' },
        { name: 'description', label: 'Описание', type: 'textarea', rows: 3, placeholder: 'Материал, посадка, особенности' },
        { name: 'sizes', label: 'Размеры', type: 'text', placeholder: 'S, M, L, XL, XXL', hint: 'Через запятую. Оставьте пустым, если размеров нет.' },
        { name: 'sizesNote', label: 'Подпись вместо размеров', type: 'text', placeholder: 'Один размер, обхват головы 56–60 см' },
        { name: 'chartColumns', label: 'Колонки размерной сетки', type: 'text', placeholder: 'Грудь, Длина, Рукав' },
        { name: 'chartRows', label: 'Строки размерной сетки', type: 'textarea', rows: 5, placeholder: 'S, 96, 68, 20\nM, 102, 70, 21', hint: 'Каждая строка — размер и мерки через запятую.' }
      ],
      empty: () => ({ icon: 'shirt' }),
      collect: values => {
        const columns = splitList(values.chartColumns);
        const rows = String(values.chartRows || '').split('\n').map(splitList).filter(row => row.length);
        return {
          name: values.name.trim(),
          price: values.price.trim(),
          icon: values.icon || 'shirt',
          note: values.note.trim(),
          description: values.description.trim(),
          sizes: splitList(values.sizes),
          sizesNote: values.sizesNote.trim(),
          chart: columns.length && rows.length ? { columns, rows } : null
        };
      },
      row: item => ({
        title: item.name,
        meta: [item.price, item.note].filter(Boolean).join(' · '),
        thumb: Array.isArray(item.photos) ? item.photos[0] : '',
        fallback: '◇'
      })
    },
    {
      key: 'admins',
      title: 'Администраторы',
      eyebrow: 'КОМАНДА',
      desc: 'Профили во вкладке «Админы»: имя, роль и фото машины.',
      add: 'Добавить администратора',
      edit: 'Редактировать администратора',
      imageKey: 'photo',
      fields: [
        { name: 'name', label: 'Имя', type: 'text', required: true, placeholder: 'Михаил' },
        { name: 'role', label: 'Роль', type: 'text', required: true, placeholder: 'Администратор' },
        { name: 'car', label: 'Подпись к фото', type: 'text', placeholder: 'Toyota Mark II в лесу', hint: 'Помогает описать кадр для незрячих участников.' },
        { name: 'photo', label: 'Фото', type: 'image' }
      ],
      empty: () => ({ role: 'Администратор' }),
      collect: (values, image) => ({
        name: values.name.trim(),
        role: values.role.trim(),
        car: values.car.trim(),
        photo: image || null
      }),
      row: item => ({ title: item.name, meta: item.role, thumb: item.photo, fallback: '♙' })
    },
    {
      key: 'partners',
      title: 'Партнёры',
      eyebrow: 'НАШИ ДРУЗЬЯ',
      desc: 'Карточки партнёров: логотип, описание и ссылка.',
      add: 'Добавить партнёра',
      edit: 'Редактировать партнёра',
      imageKey: 'logo',
      fields: [
        { name: 'name', label: 'Название', type: 'text', required: true, placeholder: 'Название компании' },
        { name: 'description', label: 'Коротко о партнёре', type: 'textarea', rows: 3, placeholder: 'Чем занимается и чем помогает клубу' },
        { name: 'url', label: 'Ссылка', type: 'url', placeholder: 'https://...' },
        { name: 'logo', label: 'Логотип', type: 'image', hint: 'Необязательно. Без логотипа покажем первую букву названия.' }
      ],
      empty: () => ({}),
      collect: (values, image) => ({
        name: values.name.trim(),
        description: values.description.trim(),
        url: values.url.trim(),
        logo: image || null
      }),
      row: item => ({
        title: item.name,
        meta: item.url || item.description || '',
        thumb: item.logo,
        fallback: (item.name || '?').trim().charAt(0).toUpperCase()
      })
    }
  ];

  /* Поля формы. */
  function fieldWrap(field, value) {
    const wrap = document.createElement('label');
    wrap.className = 'editor-field';
    const label = document.createElement('span');
    label.className = 'editor-field__label';
    label.textContent = field.label;
    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = field.rows || 4;
    } else if (field.type === 'select') {
      input = document.createElement('select');
      field.options.forEach(option => {
        const element = document.createElement('option');
        element.value = option[0];
        element.textContent = option[1];
        input.append(element);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
    }
    input.name = field.name;
    input.className = 'editor-input';
    if (field.required) input.required = true;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.min !== undefined) input.min = field.min;
    input.value = value === undefined || value === null ? '' : String(value);
    wrap.append(label, input);
    if (field.hint) {
      const hint = document.createElement('span');
      hint.className = 'editor-hint';
      hint.textContent = field.hint;
      wrap.append(hint);
    }
    return wrap;
  }

  function imageField(field, value) {
    const wrap = document.createElement('div');
    wrap.className = 'editor-field editor-field--image';
    const label = document.createElement('span');
    label.className = 'editor-field__label';
    label.textContent = field.label;
    let current = value || '';

    const row = document.createElement('div');
    row.className = 'editor-image';
    const preview = document.createElement('div');
    preview.className = 'editor-image__preview';
    const paint = () => {
      preview.replaceChildren();
      if (current) {
        const image = document.createElement('img');
        image.src = current;
        image.alt = 'Предпросмотр';
        preview.append(image);
      } else {
        const empty = document.createElement('span');
        empty.textContent = 'Нет изображения';
        preview.append(empty);
      }
    };
    paint();

    const controls = document.createElement('div');
    controls.className = 'editor-image__controls';
    const fileId = uid('file');
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.id = fileId;
    file.className = 'editor-image__file';
    const choose = document.createElement('label');
    choose.className = 'btn outlined editor-image__choose';
    choose.htmlFor = fileId;
    choose.textContent = current ? 'Заменить фото' : 'Загрузить фото';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'minilink editor-image__clear';
    clear.textContent = 'Убрать фото';
    clear.hidden = !current;

    file.addEventListener('change', async () => {
      const selected = file.files && file.files[0];
      if (!selected) return;
      choose.textContent = 'Загрузка…';
      try {
        current = await shrinkImage(selected);
        paint();
        clear.hidden = false;
        choose.textContent = 'Заменить фото';
      } catch (error) {
        toast(error.message || 'Не удалось загрузить фото', true);
        choose.textContent = current ? 'Заменить фото' : 'Загрузить фото';
      }
    });
    clear.addEventListener('click', () => {
      current = '';
      paint();
      clear.hidden = true;
      file.value = '';
      choose.textContent = 'Загрузить фото';
    });

    controls.append(choose, clear, file);
    row.append(preview, controls);
    wrap.append(label, row);
    if (field.hint) {
      const hint = document.createElement('span');
      hint.className = 'editor-hint';
      hint.textContent = field.hint;
      wrap.append(hint);
    }
    wrap.getValue = () => current;
    return wrap;
  }

  /* Multi-photo widget: up to six shots, the first one becomes the card cover. */
  function imagesField(field, value) {
    const wrap = document.createElement('div');
    wrap.className = 'editor-field editor-field--images';
    const label = document.createElement('span');
    label.className = 'editor-field__label';
    label.textContent = field.label;
    const max = field.max || 6;
    let photos = Array.isArray(value) ? value.filter(Boolean).slice(0, max) : [];

    const grid = document.createElement('div');
    grid.className = 'editor-images';

    const fileId = uid('files');
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.multiple = true;
    file.id = fileId;
    file.className = 'editor-image__file';

    const add = document.createElement('label');
    add.className = 'editor-image-add';
    add.htmlFor = fileId;

    const paint = () => {
      grid.replaceChildren();
      photos.forEach((src, index) => {
        const tile = document.createElement('div');
        tile.className = 'editor-image-tile';
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Фото ' + (index + 1);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'editor-image-tile__remove';
        remove.setAttribute('aria-label', 'Удалить фото ' + (index + 1));
        remove.textContent = '✕';
        remove.addEventListener('click', () => {
          photos.splice(index, 1);
          paint();
        });
        tile.append(img, remove);
        grid.append(tile);
      });
      if (photos.length < max) {
        add.replaceChildren();
        add.append(document.createTextNode('+ Добавить фото'));
        const small = document.createElement('small');
        small.textContent = photos.length ? photos.length + ' из ' + max : 'до ' + max;
        add.append(small);
        grid.append(add);
      }
    };

    file.addEventListener('change', async () => {
      const files = Array.from(file.files || []);
      if (!files.length) return;
      add.classList.add('is-busy');
      add.textContent = 'Загрузка…';
      for (const selected of files) {
        if (photos.length >= max) break;
        try {
          photos.push(await shrinkImage(selected));
        } catch (error) {
          toast(error.message || 'Не удалось загрузить фото', true);
        }
      }
      add.classList.remove('is-busy');
      file.value = '';
      paint();
    });

    paint();
    wrap.append(label, grid, file);
    if (field.hint) {
      const hint = document.createElement('span');
      hint.className = 'editor-hint';
      hint.textContent = field.hint;
      wrap.append(hint);
    }
    wrap.getValue = () => photos.slice();
    return wrap;
  }

  function draftFrom(config, item) {
    if (!item) return config.empty ? config.empty() : {};
    const draft = { ...item };
    if (config.key === 'merch') {
      draft.sizes = Array.isArray(item.sizes) ? item.sizes.join(', ') : '';
      draft.chartColumns = item.chart && Array.isArray(item.chart.columns) ? item.chart.columns.join(', ') : '';
      draft.chartRows = item.chart && Array.isArray(item.chart.rows) ? item.chart.rows.map(row => row.join(', ')).join('\n') : '';
    }
    return draft;
  }

  function openEditor(config, item) {
    const form = $('#editorForm');
    form.replaceChildren();
    const draft = draftFrom(config, item);
    let imageWidget = null;
    let imagesWidget = null;

    config.fields.forEach(field => {
      if (field.type === 'image') {
        imageWidget = imageField(field, draft[config.imageKey] || '');
        form.append(imageWidget);
      } else if (field.type === 'images') {
        imagesWidget = imagesField(field, draft[field.name] || []);
        form.append(imagesWidget);
      } else {
        form.append(fieldWrap(field, draft[field.name]));
      }
    });

    const actions = document.createElement('div');
    actions.className = 'editor-actions';
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn primary';
    save.textContent = item ? 'Сохранить' : 'Добавить';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn outlined';
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', () => $('#editorDialog').close());
    actions.append(save, cancel);
    form.append(actions);

    $('#editorEyebrow').textContent = config.eyebrow;
    $('#editorTitle').textContent = item ? config.edit : config.add;
    $('#editorDialog').showModal();

    form.onsubmit = async event => {
      event.preventDefault();
      if (!form.reportValidity() || save.disabled) return;
      const values = {};
      config.fields.forEach(field => {
        if (field.type === 'image' || field.type === 'images') return;
        const input = form.elements[field.name];
        values[field.name] = input ? input.value : '';
      });
      save.disabled = true;
      const label = save.textContent;
      save.textContent = 'Сохраняем…';
      try {
        let image = imageWidget ? imageWidget.getValue() : null;
        let photos = imagesWidget ? imagesWidget.getValue() : null;
        const uploads = [];
        if (typeof image === 'string' && image.startsWith('data:')) {
          uploads.push(store.uploadImage(image).then(url => { image = url; }));
        }
        if (Array.isArray(photos)) {
          photos = photos.slice();
          photos.forEach((src, index) => {
            if (typeof src === 'string' && src.startsWith('data:')) {
              uploads.push(store.uploadImage(src).then(url => { photos[index] = url; }));
            }
          });
        }
        if (uploads.length) await Promise.all(uploads);
        const record = config.collect(values, image);
        if (photos) record.photos = photos;
        record.id = item ? item.id : uid(config.key);
        const saved = store.update(data => {
          const list = data[config.key];
          const index = list.findIndex(entry => entry.id === record.id);
          if (index >= 0) list[index] = record;
          else list.unshift(record);
        });
        if (!saved) throw new Error('Не удалось сохранить изменения. Проверьте вход и свободное место в браузере.');
        $('#editorDialog').close();
        toast(item ? 'Изменения сохранены' : 'Добавлено');
      } catch (error) {
        toast(error.message || 'Не удалось сохранить', true);
      } finally {
        save.disabled = false;
        save.textContent = label;
      }
    };

    const first = form.querySelector('input, textarea, select');
    if (first) setTimeout(() => first.focus(), 60);
  }

  function askDelete(config, item) {
    const info = config.row(item) || {};
    openConfirm(
      'Удалить «' + (info.title || 'запись') + '»?',
      'Запись исчезнет из приложения у всех участников.',
      () => {
        const saved = store.update(data => {
          data[config.key] = data[config.key].filter(entry => entry.id !== item.id);
        });
        toast(saved ? 'Удалено' : 'Не удалось удалить', !saved);
      }
    );
  }

  /* Список записей внутри раздела. */
  function buildRow(config, item) {
    const info = config.row(item) || {};
    const row = document.createElement('div');
    row.className = 'admin-row';

    const thumb = document.createElement('div');
    thumb.className = 'admin-row__thumb';
    if (info.thumb) {
      const image = document.createElement('img');
      image.src = info.thumb;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      thumb.append(image);
    } else {
      thumb.classList.add('admin-row__thumb--text');
      thumb.textContent = info.fallback || '•';
    }

    const main = document.createElement('div');
    main.className = 'admin-row__main';
    const title = document.createElement('strong');
    title.className = 'admin-row__title';
    title.textContent = info.title || 'Без названия';
    const meta = document.createElement('span');
    meta.className = 'admin-row__meta';
    meta.textContent = info.meta || '';
    main.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'admin-row__actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'admin-row__btn';
    edit.textContent = 'Изменить';
    edit.addEventListener('click', () => openEditor(config, item));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-row__btn admin-row__btn--danger';
    remove.textContent = 'Удалить';
    remove.addEventListener('click', () => askDelete(config, item));
    actions.append(edit, remove);

    row.append(thumb, main, actions);
    return row;
  }

  function buildSection(config, items) {
    const section = document.createElement('section');
    section.className = 'admin-section';

    const head = document.createElement('div');
    head.className = 'admin-section__head';
    const copy = document.createElement('div');
    copy.className = 'admin-section__copy';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = config.eyebrow;
    const titleRow = document.createElement('div');
    titleRow.className = 'admin-section__title';
    const title = document.createElement('h3');
    title.textContent = config.title;
    const count = document.createElement('span');
    count.className = 'admin-section__count';
    count.textContent = items.length;
    titleRow.append(title, count);
    const desc = document.createElement('p');
    desc.textContent = config.desc;
    copy.append(eyebrow, titleRow, desc);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn primary admin-section__add';
    add.textContent = '+ ' + config.add;
    add.addEventListener('click', () => openEditor(config, null));
    head.append(copy, add);
    section.append(head);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'admin-empty';
      empty.textContent = 'Пока пусто. Нажмите «' + config.add + '», чтобы добавить первую запись.';
      section.append(empty);
      return section;
    }

    const list = document.createElement('div');
    list.className = 'admin-list';
    items.forEach(item => list.append(buildRow(config, item)));
    section.append(list);
    return section;
  }

  function exportData() {
    const blob = new Blob([store.exportJson()], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'markoobraznye-content-' + todayIso() + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Резервная копия скачана');
  }

  function renderAdmin() {
    const data = store.get();
    const panel = document.createElement('div');
    panel.className = 'admin-panel';

    const intro = document.createElement('section');
    intro.className = 'admin-intro';
    const introCopy = document.createElement('div');
    introCopy.className = 'admin-intro__copy';
    introCopy.innerHTML = '<div class="eyebrow">УПРАВЛЕНИЕ КЛУБОМ</div><h2>Всё содержимое — здесь</h2>' +
      '<p>Добавляйте и меняйте новости, мероприятия, фотоотчеты, мерч, администраторов и партнёров. Изменения сразу видны во всех разделах приложения.</p>';
    const note = document.createElement('p');
    note.className = 'admin-intro__note';
    const email = (store.session && store.session() && store.session().user && store.session().user.email) || '';
    note.textContent = 'Данные хранятся в общей базе клуба и сразу появляются у всех администраторов и участников.' +
      (email ? ' Вы вошли как ' + email + '.' : '');
    introCopy.append(note);

    const toolbar = document.createElement('div');
    toolbar.className = 'admin-toolbar';
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'btn outlined';
    exportButton.textContent = 'Скачать копию';
    exportButton.addEventListener('click', exportData);

    const importFile = document.createElement('input');
    importFile.type = 'file';
    importFile.accept = 'application/json,.json';
    importFile.hidden = true;
    importFile.addEventListener('change', async () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        store.importJson(text);
        toast('Данные загружены');
      } catch (error) {
        console.warn('Import:', error);
        toast(error.message || 'Не удалось загрузить файл', true);
      } finally {
        importFile.value = '';
      }
    });
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'btn outlined';
    importButton.textContent = 'Загрузить копию';
    importButton.addEventListener('click', () => importFile.click());

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'btn outlined admin-toolbar__danger';
    resetButton.textContent = 'Сбросить';
    resetButton.addEventListener('click', () => {
      openConfirm(
        'Сбросить всё к исходным данным?',
        'Данные клуба вернутся к исходному набору у всех администраторов и участников. Это действие нельзя отменить.',
        () => {
          const saved = store.reset();
          toast(saved ? 'Данные сброшены' : 'Не удалось сбросить', !saved);
        }
      );
    });

    toolbar.append(exportButton, importButton, resetButton, importFile);
    intro.append(introCopy, toolbar);
    panel.append(intro);

    SECTIONS.forEach(config => {
      panel.append(buildSection(config, data[config.key] || []));
    });

    root.replaceChildren(panel);
  }

  $('#editorClose').addEventListener('click', () => $('#editorDialog').close());
  $('#editorDialog').addEventListener('click', event => {
    if (event.target === $('#editorDialog')) $('#editorDialog').close();
  });
  $('#confirmCancel').addEventListener('click', () => $('#confirmDialog').close());
  $('#confirmOk').addEventListener('click', () => {
    const action = confirmAction;
    confirmAction = null;
    $('#confirmDialog').close();
    if (action) action();
  });
  $('#confirmDialog').addEventListener('click', event => {
    if (event.target === $('#confirmDialog')) $('#confirmDialog').close();
  });

  document.addEventListener('content:changed', renderAdmin);
  document.addEventListener('content:error', () => toast('Не хватает места в браузере. Уменьшите фото или удалите старые записи.', true));
  document.addEventListener('content:sync-error', () => toast('Не удалось отправить изменения на сервер. Проверьте интернет — повторим автоматически.', true));
  document.addEventListener('content:denied', () => toast('Нет доступа. Войдите как администратор.', true));
  document.addEventListener('content:synced', () => toast('Сохранено для всех'));
  renderAdmin();
})();
