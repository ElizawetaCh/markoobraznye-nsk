/* Фотоотчеты клуба: один источник для карточек раздела и всплывающих окон.
   Чтобы добавить альбом — допишите объект в массив:
   { id:'уникальный', title:'Название', date:'10 октября 2026', count:24,
     cover:'./assets/фото.webp', description:'Кратко о мероприятии',
     yandexUrl:'https://disk.yandex.ru/d/...' }
   Ссылки на Яндекс.Диск замените на реальные папки альбомов. */
window.PHOTO_ALBUMS = [
  {
    id: 'autopryatki-2026-10',
    title: 'АвтоПрятки',
    date: '10 октября 2026',
    count: 24,
    cover: './assets/admin-mikhail.webp',
    description: 'Осенняя встреча в лесу: колонна, поиск машин среди сосен и тёплый чай после заезда.',
    yandexUrl: 'https://disk.yandex.ru/d/markoobraznye-autopryatki'
  },
  {
    id: 'skhodka-2026-10',
    title: 'Сходка автоклуба',
    date: '3 октября 2026',
    count: 18,
    cover: './assets/admin-irina.webp',
    description: 'Вечерняя сходка на площадке: машины, сакура на капоте и знакомства до последнего кадра.',
    yandexUrl: 'https://disk.yandex.ru/d/markoobraznye-skhodka'
  }
];
