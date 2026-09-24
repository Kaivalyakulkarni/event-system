-- Tables
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  capacity int not null check (capacity > 0),
  created_at timestamptz default now(),
  check (end_time > start_time)
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (event_id, user_id)
);
create index on registrations (user_id);

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Row Level Security
alter table events enable row level security;
alter table registrations enable row level security;
alter table admins enable row level security;

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create policy "events readable" on events for select using (true);
create policy "admins insert events" on events for insert with check (is_admin());
create policy "admins update events" on events for update using (is_admin());
create policy "admins delete events" on events for delete using (is_admin());
create policy "own regs readable" on registrations for select using (auth.uid() = user_id);
create policy "own regs deletable" on registrations for delete using (auth.uid() = user_id);
create policy "admin sees self" on admins for select using (auth.uid() = user_id);

-- View: events with live seat counts
create view events_with_seats as
select e.*,
  (select count(*) from registrations r where r.event_id = e.id)::int as registered_count
from events e;
grant select on events_with_seats to anon, authenticated;

-- Registration: capacity, duplicate and schedule-clash rules in one transaction
create or replace function register_for_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_event events%rowtype;
  v_count int;
  v_clash text;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.start_time <= now() then raise exception 'EVENT_STARTED'; end if;

  if exists (select 1 from registrations
             where event_id = p_event_id and user_id = v_user) then
    raise exception 'ALREADY_REGISTERED';
  end if;

  select count(*) into v_count from registrations where event_id = p_event_id;
  if v_count >= v_event.capacity then raise exception 'EVENT_FULL'; end if;

  select e.title into v_clash
  from registrations r join events e on e.id = r.event_id
  where r.user_id = v_user
    and v_event.start_time < e.end_time
    and v_event.end_time > e.start_time
  limit 1;
  if v_clash is not null then raise exception 'SCHEDULE_CLASH: %', v_clash; end if;

  insert into registrations (event_id, user_id) values (p_event_id, v_user);
end;
$$;
revoke execute on function register_for_event(uuid) from public;
grant execute on function register_for_event(uuid) to authenticated;

-- Admin: list registrations for an event
create or replace function event_registrations(p_event_id uuid)
returns table (email text, registered_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select u.email::text, r.created_at
  from registrations r join auth.users u on u.id = r.user_id
  where r.event_id = p_event_id and is_admin()
  order by r.created_at;
$$;
revoke execute on function event_registrations(uuid) from public;
grant execute on function event_registrations(uuid) to authenticated;

-- Seed data: first two overlap, third only touches the second
insert into events (title, description, location, start_time, end_time, capacity) values
('Intro to AI Workshop', 'Hands-on basics', 'Hall A', '2026-10-05 10:00+05:30', '2026-10-05 12:00+05:30', 2),
('Hackathon Kickoff', 'Team formation', 'Hall B', '2026-10-05 11:00+05:30', '2026-10-05 13:00+05:30', 50),
('Career Talk', 'Alumni panel', 'Auditorium', '2026-10-05 13:00+05:30', '2026-10-05 14:00+05:30', 100);