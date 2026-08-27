-- Temporary preview mode until Supabase Auth is added.
-- Only TravelTank300 tables are changed.

alter table public.travel_places alter column user_id drop not null;
alter table public.travel_plans alter column user_id drop not null;

drop policy if exists "travel_places_public_select" on public.travel_places;
create policy "travel_places_public_select" on public.travel_places
for select to anon, authenticated using (true);

drop policy if exists "travel_places_public_insert" on public.travel_places;
create policy "travel_places_public_insert" on public.travel_places
for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());

drop policy if exists "travel_place_photos_public_select" on public.travel_place_photos;
create policy "travel_place_photos_public_select" on public.travel_place_photos
for select to anon, authenticated using (true);

drop policy if exists "travel_place_photos_public_insert" on public.travel_place_photos;
create policy "travel_place_photos_public_insert" on public.travel_place_photos
for insert to anon, authenticated with check (
  exists (select 1 from public.travel_places p where p.id = place_id)
);

drop policy if exists "travel_plans_public_select" on public.travel_plans;
create policy "travel_plans_public_select" on public.travel_plans
for select to anon, authenticated using (true);

drop policy if exists "travel_plans_public_insert" on public.travel_plans;
create policy "travel_plans_public_insert" on public.travel_plans
for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());

drop policy if exists "travel_plan_photos_public_select" on public.travel_plan_photos;
create policy "travel_plan_photos_public_select" on public.travel_plan_photos
for select to anon, authenticated using (true);

drop policy if exists "travel_plan_photos_public_insert" on public.travel_plan_photos;
create policy "travel_plan_photos_public_insert" on public.travel_plan_photos
for insert to anon, authenticated with check (
  exists (select 1 from public.travel_plans p where p.id = plan_id)
);;
