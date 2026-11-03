-- Маркообразные Новосибирск — общая база Supabase.
-- Как применить: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Скрипт можно запускать повторно: он не удаляет данные и не перезаписывает
-- уже существующие разделы контента (ON CONFLICT DO NOTHING).

begin;

-- 1. Редакторы ────────────────────────────────────────────────────────────────
-- Список e-mail, которым разрешено менять контент. Первый вошедший
-- администратор автоматически становится владельцем (функция claim_owner).
create table if not exists public.editors (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now()
);

alter table public.editors enable row level security;
grant select on public.editors to authenticated;

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.editors e
    where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.editors e
    where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and e.role = 'owner'
  );
$$;

revoke all on function public.is_editor() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_editor() to anon, authenticated;
grant execute on function public.is_owner() to anon, authenticated;

-- Редакторы видят список коллег. Добавлять и удалять их можно только
-- через SQL Editor или service_role, чтобы никто не выдал доступ себе.
drop policy if exists "editors can read the allowlist" on public.editors;
create policy "editors can read the allowlist"
  on public.editors for select
  to authenticated
  using (public.is_editor());

-- Первый зарегистрированный пользователь становится владельцем.
-- Если владелец уже есть, функция просто отвечает, есть ли доступ.
create or replace function public.claim_owner()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_uid is null or v_email = '' then
    return false;
  end if;

  if exists (select 1 from public.editors) then
    return exists (select 1 from public.editors where lower(email) = v_email);
  end if;

  insert into public.editors (email, user_id, role)
  values (v_email, v_uid, 'owner')
  on conflict (email) do update
    set user_id = excluded.user_id,
        role = 'owner';

  return true;
end;
$$;

revoke all on function public.claim_owner() from public;
grant execute on function public.claim_owner() to authenticated;

-- 2. Общий контент ────────────────────────────────────────────────────────────
-- Одна строка на раздел приложения: news, events, photos, merch, admins, partners.
-- Внутри items — JSON-массив записей ровно в том виде, в котором их ждёт фронтенд.
create table if not exists public.content (
  section text primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint content_section_check check (section in ('news', 'events', 'photos', 'merch', 'admins', 'partners')),
  constraint content_items_array_check check (jsonb_typeof(items) = 'array')
);

alter table public.content enable row level security;
grant select on public.content to anon, authenticated;
grant insert, update, delete on public.content to authenticated;

create or replace function public.touch_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists content_touch on public.content;
create trigger content_touch
  before insert or update on public.content
  for each row execute function public.touch_content();

-- Читать контент может любой посетитель сайта.
drop policy if exists "content is public" on public.content;
create policy "content is public"
  on public.content for select
  to anon, authenticated
  using (true);

-- Писать — только редакторы из allowlist.
drop policy if exists "editors insert content" on public.content;
create policy "editors insert content"
  on public.content for insert
  to authenticated
  with check (public.is_editor());

drop policy if exists "editors update content" on public.content;
create policy "editors update content"
  on public.content for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

drop policy if exists "editors delete content" on public.content;
create policy "editors delete content"
  on public.content for delete
  to authenticated
  using (public.is_editor());

-- 3. Realtime ─────────────────────────────────────────────────────────────────
-- Изменения сразу прилетают на открытые устройства других администраторов.
do $$
begin
  alter publication supabase_realtime add table public.content;
exception
  when duplicate_object then null;
  when undefined_object then null;
  when insufficient_privilege then null;
end;
$$;

-- 4. Хранилище фото ───────────────────────────────────────────────────────────
-- Публичный bucket media: читают все, загружают только редакторы.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media is public" on storage.objects;
create policy "media is public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'media');

drop policy if exists "editors upload media" on storage.objects;
create policy "editors upload media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media' and public.is_editor());

drop policy if exists "editors update media" on storage.objects;
create policy "editors update media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media' and public.is_editor())
  with check (bucket_id = 'media' and public.is_editor());

drop policy if exists "editors delete media" on storage.objects;
create policy "editors delete media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media' and public.is_editor());

-- 5. Подписки на push ─────────────────────────────────────────────────────────
-- Понадобятся на следующем этапе. Записывать подписку может любой посетитель,
-- читать их сможет только Edge Function через service_role.
create table if not exists public.push_subscriptions (
  id bigint generated by default as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
grant insert on public.push_subscriptions to anon, authenticated;
grant usage, select on sequence public.push_subscriptions_id_seq to anon, authenticated;

drop policy if exists "anyone can subscribe to push" on public.push_subscriptions;
create policy "anyone can subscribe to push"
  on public.push_subscriptions for insert
  to anon, authenticated
  with check (true);

-- 6. Начальные данные ─────────────────────────────────────────────────────────
-- Если раздел уже существует, он не перезаписывается.
insert into public.content (section, items) values
  ('news', $seed_news$[]$seed_news$::jsonb),
  ('events', $seed_events$[{"id":"ev-club-meeting","date":"2026-10-31","badge":"ПРИМЕР","title":"Клубная встреча","text":"Тестовая запись. Адрес и время будут уточнены."},{"id":"ev-club-quest","date":"2026-11-07","badge":"ПРИМЕР","title":"Клубный квест","text":"Демонстрация карточки мероприятия. Это не настоящий анонс."}]$seed_events$::jsonb),
  ('photos', $seed_photos$[{"id":"autopryatki-2026-10","title":"АвтоПрятки","date":"10 октября 2026","count":24,"cover":"./assets/admin-mikhail.webp","description":"Осенняя встреча в лесу: колонна, поиск машин среди сосен и тёплый чай после заезда.","yandexUrl":"https://disk.yandex.ru/d/markoobraznye-autopryatki"},{"id":"skhodka-2026-10","title":"Сходка автоклуба","date":"3 октября 2026","count":18,"cover":"./assets/admin-irina.webp","description":"Вечерняя сходка на площадке: машины, сакура на капоте и знакомства до последнего кадра.","yandexUrl":"https://disk.yandex.ru/d/markoobraznye-skhodka"}]$seed_photos$::jsonb),
  ('merch', $seed_merch$[{"id":"tee","name":"Футболка клуба","price":"2 500 ₽","icon":"shirt","note":"Размеры S–XXL","description":"Плотный хлопок 240 г/м², свободная посадка. Принт с сакурой и самураем на груди.","sizes":["S","M","L","XL","XXL"],"chart":{"columns":["Грудь","Длина","Рукав"],"rows":[["S","96","68","20"],["M","102","70","21"],["L","108","72","22"],["XL","114","74","23"],["XXL","120","76","24"]]}},{"id":"hoodie","name":"Худи","price":"4 200 ₽","icon":"hoodie","note":"Размеры S–XXL","description":"Тёплое худи на флисе, карман-кенгуру и вышивка клуба. Не садится после стирки.","sizes":["S","M","L","XL","XXL"],"chart":{"columns":["Грудь","Длина","Рукав"],"rows":[["S","104","66","60"],["M","110","68","61"],["L","116","70","62"],["XL","122","72","63"],["XXL","128","74","64"]]}},{"id":"cap","name":"Кепка","price":"1 900 ₽","icon":"cap","note":"Один размер","description":"Шестипанельная кепка с вышитым самураем. Регулируется ремешком сзади.","sizesNote":"Один размер, обхват головы 56–60 см."},{"id":"stickers","name":"Стикерпак","price":"300 ₽","icon":"sticker","note":"8 наклеек в наборе","description":"Восемь виниловых наклеек с символикой клуба. Не боятся дождя и мойки.","sizesNote":"Без размера — подходит для стекла, кузова и ноутбука."},{"id":"frame","name":"Рамка на номер","price":"1 500 ₽","icon":"frame","note":"Под стандартный номер","description":"Рамка под стандартный номер с гравировкой «Маркообразные». Крепёж в комплекте.","sizesNote":"Без размера — универсальная, под стандартный номер."},{"id":"keyring","name":"Брелок","price":"450 ₽","icon":"key","note":"Металл, гравировка","description":"Металлический брелок с гравировкой клуба. Вес 28 г, карабин в комплекте.","sizesNote":"Без размера — один вариант."}]$seed_merch$::jsonb),
  ('admins', $seed_admins$[{"id":"adm-mikhail","name":"Михаил","role":"Администратор","car":"Toyota Mark II в лесу","photo":"./assets/admin-mikhail.webp"},{"id":"adm-irina","name":"Ирина","role":"Администратор","car":"Toyota Mark II на автомобильной площадке","photo":"./assets/admin-irina.webp"},{"id":"adm-ekaterina","name":"Екатерина","role":"Администратор","car":"Белый Toyota Chaser на фоне музыкального мурала","photo":"./assets/admin-ekaterina.webp"}]$seed_admins$::jsonb),
  ('partners', $seed_partners$[]$seed_partners$::jsonb)
on conflict (section) do nothing;

commit;

-- Готово. Дальше: Authentication → Users → Add user (e-mail и пароль),
-- затем войти этим e-mail в приложении — он станет владельцем.
