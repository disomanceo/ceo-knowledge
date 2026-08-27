create extension if not exists pgcrypto;

create or replace function public.travel_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.travel_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  category text not null default 'สถานที่อื่น ๆ',
  visit_date date not null,
  rating smallint not null default 0 check (rating between 0 and 5),
  note text not null default '',
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  location_name text not null default '',
  subdistrict text not null default '',
  district text not null default '',
  province text not null default '',
  cover_image_url text,
  cover_drive_file_id text,
  photo_count integer not null default 0 check (photo_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists travel_places_user_visit_date_idx on public.travel_places (user_id, visit_date desc);
create index if not exists travel_places_user_created_at_idx on public.travel_places (user_id, created_at desc);
create index if not exists travel_places_province_idx on public.travel_places (province);

create table if not exists public.travel_place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.travel_places(id) on delete cascade,
  drive_file_id text not null,
  drive_url text not null,
  thumbnail_url text,
  file_name text not null,
  mime_type text not null default 'image/jpeg',
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists travel_place_photos_place_sort_idx on public.travel_place_photos (place_id, sort_order);
create unique index if not exists travel_place_photos_one_cover_idx on public.travel_place_photos (place_id) where is_cover = true;

create table if not exists public.travel_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  start_date date,
  end_date date,
  budget numeric(12,2) not null default 0 check (budget >= 0),
  note text not null default '',
  status text not null default 'planning' check (status in ('idea','planning','ready','travelling','completed','cancelled')),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  location_name text not null default '',
  subdistrict text not null default '',
  district text not null default '',
  province text not null default '',
  cover_image_url text,
  cover_drive_file_id text,
  photo_count integer not null default 0 check (photo_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint travel_plans_date_order check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists travel_plans_user_start_date_idx on public.travel_plans (user_id, start_date desc nulls last);
create index if not exists travel_plans_user_created_at_idx on public.travel_plans (user_id, created_at desc);

create table if not exists public.travel_plan_stops (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.travel_plans(id) on delete cascade,
  place_name text not null check (char_length(trim(place_name)) between 1 and 200),
  planned_date date,
  visit_order integer not null default 0 check (visit_order >= 0),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  location_name text not null default '',
  subdistrict text not null default '',
  district text not null default '',
  province text not null default '',
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists travel_plan_stops_plan_order_idx on public.travel_plan_stops (plan_id, visit_order);

create table if not exists public.travel_plan_photos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.travel_plans(id) on delete cascade,
  drive_file_id text not null,
  drive_url text not null,
  thumbnail_url text,
  file_name text not null,
  mime_type text not null default 'image/jpeg',
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists travel_plan_photos_plan_sort_idx on public.travel_plan_photos (plan_id, sort_order);
create unique index if not exists travel_plan_photos_one_cover_idx on public.travel_plan_photos (plan_id) where is_cover = true;

drop trigger if exists travel_places_set_updated_at on public.travel_places;
create trigger travel_places_set_updated_at before update on public.travel_places for each row execute function public.travel_set_updated_at();
drop trigger if exists travel_plans_set_updated_at on public.travel_plans;
create trigger travel_plans_set_updated_at before update on public.travel_plans for each row execute function public.travel_set_updated_at();
drop trigger if exists travel_plan_stops_set_updated_at on public.travel_plan_stops;
create trigger travel_plan_stops_set_updated_at before update on public.travel_plan_stops for each row execute function public.travel_set_updated_at();

alter table public.travel_places enable row level security;
alter table public.travel_place_photos enable row level security;
alter table public.travel_plans enable row level security;
alter table public.travel_plan_stops enable row level security;
alter table public.travel_plan_photos enable row level security;

drop policy if exists "travel_places_select_own" on public.travel_places;
create policy "travel_places_select_own" on public.travel_places for select to authenticated using (auth.uid() = user_id);
drop policy if exists "travel_places_insert_own" on public.travel_places;
create policy "travel_places_insert_own" on public.travel_places for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "travel_places_update_own" on public.travel_places;
create policy "travel_places_update_own" on public.travel_places for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "travel_places_delete_own" on public.travel_places;
create policy "travel_places_delete_own" on public.travel_places for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "travel_place_photos_select_own" on public.travel_place_photos;
create policy "travel_place_photos_select_own" on public.travel_place_photos for select to authenticated using (exists (select 1 from public.travel_places p where p.id = place_id and p.user_id = auth.uid()));
drop policy if exists "travel_place_photos_insert_own" on public.travel_place_photos;
create policy "travel_place_photos_insert_own" on public.travel_place_photos for insert to authenticated with check (exists (select 1 from public.travel_places p where p.id = place_id and p.user_id = auth.uid()));
drop policy if exists "travel_place_photos_update_own" on public.travel_place_photos;
create policy "travel_place_photos_update_own" on public.travel_place_photos for update to authenticated using (exists (select 1 from public.travel_places p where p.id = place_id and p.user_id = auth.uid())) with check (exists (select 1 from public.travel_places p where p.id = place_id and p.user_id = auth.uid()));
drop policy if exists "travel_place_photos_delete_own" on public.travel_place_photos;
create policy "travel_place_photos_delete_own" on public.travel_place_photos for delete to authenticated using (exists (select 1 from public.travel_places p where p.id = place_id and p.user_id = auth.uid()));

drop policy if exists "travel_plans_select_own" on public.travel_plans;
create policy "travel_plans_select_own" on public.travel_plans for select to authenticated using (auth.uid() = user_id);
drop policy if exists "travel_plans_insert_own" on public.travel_plans;
create policy "travel_plans_insert_own" on public.travel_plans for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "travel_plans_update_own" on public.travel_plans;
create policy "travel_plans_update_own" on public.travel_plans for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "travel_plans_delete_own" on public.travel_plans;
create policy "travel_plans_delete_own" on public.travel_plans for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "travel_plan_stops_select_own" on public.travel_plan_stops;
create policy "travel_plan_stops_select_own" on public.travel_plan_stops for select to authenticated using (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "travel_plan_stops_insert_own" on public.travel_plan_stops;
create policy "travel_plan_stops_insert_own" on public.travel_plan_stops for insert to authenticated with check (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "travel_plan_stops_update_own" on public.travel_plan_stops;
create policy "travel_plan_stops_update_own" on public.travel_plan_stops for update to authenticated using (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid())) with check (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "travel_plan_stops_delete_own" on public.travel_plan_stops;
create policy "travel_plan_stops_delete_own" on public.travel_plan_stops for delete to authenticated using (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid()));

drop policy if exists "travel_plan_photos_select_own" on public.travel_plan_photos;
create policy "travel_plan_photos_select_own" on public.travel_plan_photos for select to authenticated using (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "travel_plan_photos_insert_own" on public.travel_plan_photos;
create policy "travel_plan_photos_insert_own" on public.travel_plan_photos for insert to authenticated with check (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "travel_plan_photos_update_own" on public.travel_plan_photos;
create policy "travel_plan_photos_update_own" on public.travel_plan_photos for update to authenticated using (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid())) with check (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "travel_plan_photos_delete_own" on public.travel_plan_photos;
create policy "travel_plan_photos_delete_own" on public.travel_plan_photos for delete to authenticated using (exists (select 1 from public.travel_plans p where p.id = plan_id and p.user_id = auth.uid()));;
