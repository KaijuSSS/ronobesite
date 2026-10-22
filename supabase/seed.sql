-- =====================================================================
-- RanobeSite: демонстрационные данные для локальной разработки
-- =====================================================================
-- Все тексты ниже написаны специально для демо и не взяты из
-- существующих произведений.
--
-- Как использовать:
--   1. Примените миграции и зарегистрируйте первого администратора
--      (см. README, раздел «Первый администратор»).
--   2. Выполните этот файл в SQL Editor Supabase.
-- Скрипт идемпотентен: повторный запуск ничего не дублирует.
-- Авторами демо-книг становится первый администратор.

create or replace function pg_temp.demo_doc(paragraphs text[])
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'type', 'doc',
    'content', coalesce(jsonb_agg(
      case
        when p = '***' then jsonb_build_object('type', 'horizontalRule')
        when p like '## %' then jsonb_build_object(
          'type', 'heading', 'attrs', jsonb_build_object('level', 2),
          'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', substr(p, 4))))
        else jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', p)))
      end
      order by ord
    ), '[]'::jsonb)
  )
  from unnest(paragraphs) with ordinality as t(p, ord);
$$;

do $$
declare
  v_author uuid;
  v_book uuid;
  v_chapter uuid;
  v_revision uuid;
  v_queue uuid;
  v_now timestamptz := now();
begin
  select user_id into v_author
  from public.user_roles
  where role = 'admin'
  order by created_at
  limit 1;

  if v_author is null then
    raise exception 'Сначала зарегистрируйте администратора (README → «Первый администратор»)';
  end if;

  if exists (select 1 from public.books where title = 'Хранитель последнего маяка') then
    raise notice 'Демо-данные уже загружены';
    return;
  end if;

  -- -------------------------------------------------------------------
  -- 1. Опубликованная книга с тремя главами
  -- -------------------------------------------------------------------
  insert into public.books (author_id, title, description, status, publication_state, published_at, created_at)
  values (
    v_author,
    'Хранитель последнего маяка',
    'На краю обитаемого мира стоит маяк, свет которого удерживает туман по ту сторону моря. '
      || 'Юная Ирма получает его в наследство вместе с ключом, дневником предыдущего хранителя и странным правилом: '
      || '«Никогда не гаси огонь до рассвета». Вскоре она понимает, что туман умеет говорить — и что он помнит её имя.',
    'ongoing', 'published', v_now - interval '20 days', v_now - interval '21 days'
  )
  returning id into v_book;

  insert into public.book_genres (book_id, genre_id)
  select v_book, id from public.genres where slug in ('fantasy', 'adventure', 'mystery');

  -- Глава 1
  insert into public.chapters (book_id, number) values (v_book, 1) returning id into v_chapter;
  insert into public.chapter_revisions (chapter_id, author_id, title, content, state, submitted_at, reviewed_at)
  values (v_chapter, v_author, 'Ключ с солёным привкусом', pg_temp.demo_doc(array[
    'Нотариус говорил так тихо, будто боялся разбудить кого-то в соседней комнате. Он положил на стол связку из одного-единственного ключа — тяжёлого, потемневшего, пахнущего морем, хотя до побережья отсюда было три дня пути.',
    '— Ваш двоюродный дед оставил вам маяк на мысе Серой Чайки, — сказал он. — И ещё вот это.',
    'Рядом с ключом лёг дневник в кожаной обложке. Ирма открыла его наугад. Поперёк страницы крупными буквами было выведено: «Никогда не гаси огонь до рассвета».',
    'Она не помнила никакого деда. Зато прекрасно помнила, сколько стоит комната под крышей, за которую она не платила уже второй месяц.',
    '***',
    'Дорога к мысу заняла четыре дня. Последние вёрсты Ирма шла пешком: возница наотрез отказался ехать дальше старого межевого камня. «Там туман, — буркнул он, — а в тумане я не езжу». Тумана, впрочем, не было. Было ясное небо, крики птиц и белая башня, торчащая над скалами, как поднятый палец.',
    'Ключ повернулся в замке легко, словно дверь ждала именно её.'
  ]), 'approved', v_now - interval '20 days', v_now - interval '20 days')
  returning id into v_revision;
  update public.chapters
  set published_revision_id = v_revision, published_title = 'Ключ с солёным привкусом',
      word_count = (select word_count from public.chapter_revisions where id = v_revision),
      published_at = v_now - interval '20 days'
  where id = v_chapter;

  -- Глава 2
  insert into public.chapters (book_id, number) values (v_book, 2) returning id into v_chapter;
  insert into public.chapter_revisions (chapter_id, author_id, title, content, state, submitted_at, reviewed_at)
  values (v_chapter, v_author, 'Первая ночь', pg_temp.demo_doc(array[
    'Внутри маяк оказался больше, чем снаружи, — по крайней мере, так казалось. Винтовая лестница уходила вверх на сто сорок две ступени. Ирма пересчитала их дважды и оба раза сбилась на сто семнадцатой.',
    'Наверху стояла линза размером с карету. Под ней, в медной чаше, тлели угли — ровно, без дыма, будто кто-то подбросил их час назад.',
    'К вечеру с моря пришёл туман. Он не стелился по воде, как положено порядочному туману, а шёл стеной, медленно и уверенно, и остановился ровно там, куда дотягивался свет маяка.',
    '— Ирма, — сказал туман голосом её матери. — Открой окно, тут холодно.',
    'Она прижалась спиной к тёплому медному боку чаши и открыла дневник на первой странице. До рассвета оставалось семь часов.'
  ]), 'approved', v_now - interval '12 days', v_now - interval '12 days')
  returning id into v_revision;
  update public.chapters
  set published_revision_id = v_revision, published_title = 'Первая ночь',
      word_count = (select word_count from public.chapter_revisions where id = v_revision),
      published_at = v_now - interval '12 days'
  where id = v_chapter;

  -- Глава 3
  insert into public.chapters (book_id, number) values (v_book, 3) returning id into v_chapter;
  insert into public.chapter_revisions (chapter_id, author_id, title, content, state, submitted_at, reviewed_at)
  values (v_chapter, v_author, 'Записи хранителя', pg_temp.demo_doc(array[
    '## 14 октября',
    '«Туман сегодня пробовал торговаться. Предлагал вернуть то, что я потерял, если я хотя бы на минуту прикрою заслонку. Я не стал спрашивать, что именно он имеет в виду. Подозреваю, он и сам не знает — просто нащупывает».',
    '## 2 ноября',
    '«Угля почти не осталось, но огонь горит. Кажется, ему нужен вовсе не уголь».',
    '***',
    'Ирма перечитала последнюю запись трижды. Потом посмотрела на чашу. Угли светились так же ровно, как в первый вечер, хотя она не подкладывала ни одного.',
    'Внизу, у самой кромки света, кто-то постучал в дверь.'
  ]), 'approved', v_now - interval '2 days', v_now - interval '2 days')
  returning id into v_revision;
  update public.chapters
  set published_revision_id = v_revision, published_title = 'Записи хранителя',
      word_count = (select word_count from public.chapter_revisions where id = v_revision),
      published_at = v_now - interval '2 days'
  where id = v_chapter;

  perform public.refresh_book_stats(v_book);

  -- -------------------------------------------------------------------
  -- 2. Опубликованная книга + новая глава на проверке
  -- -------------------------------------------------------------------
  insert into public.books (author_id, title, description, status, publication_state, published_at, created_at)
  values (
    v_author,
    'Кофейня на изнанке города',
    'Каждую ночь ровно в 3:33 в переулке за старой типографией открывается кофейня, которой нет на картах. '
      || 'Бариста по имени Лев варит кофе для тех, кто заблудился: призраков, забытых снов и одного очень вежливого дракона. '
      || 'Тёплая история о гостях, которым больше некуда пойти.',
    'completed', 'published', v_now - interval '40 days', v_now - interval '41 days'
  )
  returning id into v_book;

  insert into public.book_genres (book_id, genre_id)
  select v_book, id from public.genres where slug in ('slice-of-life', 'mystery', 'comedy');

  insert into public.chapters (book_id, number) values (v_book, 1) returning id into v_chapter;
  insert into public.chapter_revisions (chapter_id, author_id, title, content, state, submitted_at, reviewed_at)
  values (v_chapter, v_author, 'Посетитель в 3:34', pg_temp.demo_doc(array[
    'Первый посетитель всегда приходил ровно через минуту после открытия. Лев успевал только снять стулья со столов и включить кофемашину, которая, как и всё здесь, работала не от электричества, а от честного слова.',
    'Сегодня это была пожилая дама в шляпке с вуалью. Она долго изучала меню, в котором не было цен, а потом спросила:',
    '— У вас есть что-нибудь со вкусом лета, когда мне было девять?',
    'Лев кивнул и достал с верхней полки банку без этикетки. Внутри пахло нагретой травой и малиной с куста у забора.'
  ]), 'approved', v_now - interval '40 days', v_now - interval '40 days')
  returning id into v_revision;
  update public.chapters
  set published_revision_id = v_revision, published_title = 'Посетитель в 3:34',
      word_count = (select word_count from public.chapter_revisions where id = v_revision),
      published_at = v_now - interval '40 days'
  where id = v_chapter;

  insert into public.chapters (book_id, number) values (v_book, 2) returning id into v_chapter;
  insert into public.chapter_revisions (chapter_id, author_id, title, content, state, submitted_at, reviewed_at)
  values (v_chapter, v_author, 'Дракон, который не любил сахар', pg_temp.demo_doc(array[
    'Дракон занимал сразу три столика и извинялся за это каждые пять минут.',
    '— Мне, пожалуйста, эспрессо. Без сахара. Сахар напоминает мне о рыцарях, — сказал он и смущённо выпустил из ноздри колечко дыма.',
    'Лев не стал уточнять, какая связь между рыцарями и сахаром. За годы работы он усвоил главное правило кофейни: каждому гостю нужен не ответ, а чашка, которую не придётся допивать в одиночестве.'
  ]), 'approved', v_now - interval '35 days', v_now - interval '35 days')
  returning id into v_revision;
  update public.chapters
  set published_revision_id = v_revision, published_title = 'Дракон, который не любил сахар',
      word_count = (select word_count from public.chapter_revisions where id = v_revision),
      published_at = v_now - interval '35 days'
  where id = v_chapter;

  perform public.refresh_book_stats(v_book);

  -- Глава 3 отправлена на модерацию (пример ожидающей заявки)
  insert into public.chapters (book_id, number) values (v_book, 3) returning id into v_chapter;
  insert into public.chapter_revisions (chapter_id, author_id, title, content, state, submitted_at)
  values (v_chapter, v_author, 'Последний заказ перед рассветом', pg_temp.demo_doc(array[
    'Без пяти шесть колокольчик над дверью звякнул в последний раз за ночь. На пороге стояла девочка в пижаме и с плюшевым зайцем под мышкой.',
    '— Я, кажется, сплю, — сообщила она очень серьёзно.',
    '— Здесь все немного спят, — согласился Лев и поставил на стойку чашку какао с зефиром.'
  ]), 'pending', v_now - interval '3 hours')
  returning id into v_revision;

  insert into public.moderation_queue (kind, book_id, chapter_id, chapter_revision_id, submitted_by, created_at)
  values ('chapter_revision', v_book, v_chapter, v_revision, v_author, v_now - interval '3 hours')
  returning id into v_queue;
  insert into public.moderation_events (queue_id, actor_id, action, created_at)
  values (v_queue, v_author, 'submitted', v_now - interval '3 hours');

  -- -------------------------------------------------------------------
  -- 3. Новая книга на проверке (видна только автору и модераторам)
  -- -------------------------------------------------------------------
  insert into public.books (author_id, title, description, status, publication_state, created_at)
  values (
    v_author,
    'Код седьмого неба',
    'В орбитальном городе, где погоду заказывают по подписке, курьер Тимур случайно получает посылку '
      || 'с чужим воспоминанием. Теперь за ним охотятся те, кто это воспоминание потерял, и те, кто очень хочет его продать.',
    'ongoing', 'pending', v_now - interval '1 day'
  )
  returning id into v_book;

  insert into public.book_genres (book_id, genre_id)
  select v_book, id from public.genres where slug in ('sci-fi', 'action');

  insert into public.moderation_queue (kind, book_id, submitted_by, created_at)
  values ('book', v_book, v_author, v_now - interval '20 hours')
  returning id into v_queue;
  insert into public.moderation_events (queue_id, actor_id, action, created_at)
  values (v_queue, v_author, 'submitted', v_now - interval '20 hours');

  insert into public.chapters (book_id, number) values (v_book, 1) returning id into v_chapter;
  insert into public.chapter_revisions (chapter_id, author_id, title, content, state)
  values (v_chapter, v_author, 'Доставка без подписи', pg_temp.demo_doc(array[
    'Посылка весила меньше, чем пустая коробка. Тимур проверил это дважды на весах у шлюза, потом пожал плечами и сунул её в рюкзак.',
    'Адресат не открыл дверь. Вместо него открылось воспоминание — чужое, тёплое и пахнущее дождём, которого на станции не было уже двадцать лет.'
  ]), 'draft');

  -- -------------------------------------------------------------------
  -- 4. Черновик (не виден никому, кроме автора)
  -- -------------------------------------------------------------------
  insert into public.books (author_id, title, description, status, created_at)
  values (
    v_author,
    'Сад медленных часов',
    'Черновик: история садовника, который выращивает часы вместо цветов.',
    'ongoing', v_now - interval '5 hours'
  )
  returning id into v_book;

  insert into public.book_genres (book_id, genre_id)
  select v_book, id from public.genres where slug in ('fantasy', 'drama');

  raise notice 'Демо-данные загружены';
end;
$$;
