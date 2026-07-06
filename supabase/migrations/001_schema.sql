-- Enable extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table public.users (
  id            uuid        primary key references auth.users(id) on delete cascade,
  email         text        unique not null,
  username      text        unique not null,
  display_name  text        not null,
  avatar_url    text,
  bio           text,
  created_at    timestamptz default now()
);

create table public.follow_requests (
  id            uuid        primary key default gen_random_uuid(),
  requester_id  uuid        not null references public.users(id) on delete cascade,
  target_id     uuid        not null references public.users(id) on delete cascade,
  status        text        not null check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at    timestamptz default now(),
  responded_at  timestamptz,
  constraint no_self_follow check (requester_id != target_id)
);

-- At most one pending request between any two users
create unique index uq_follow_pending
  on public.follow_requests (least(requester_id, target_id), greatest(requester_id, target_id))
  where status = 'pending';

-- At most one accepted connection between any two users
create unique index uq_follow_accepted
  on public.follow_requests (least(requester_id, target_id), greatest(requester_id, target_id))
  where status = 'accepted';

create table public.activities (
  id                uuid        primary key default gen_random_uuid(),
  creator_id        uuid        not null references public.users(id) on delete cascade,
  title             text        not null,
  category          text        not null check (category in (
                                  'sports', 'board_games', 'video_games', 'movies',
                                  'music', 'food_drinks', 'outdoors', 'travel', 'other'
                                )),
  description       text,
  scheduled_at      timestamptz not null,
  location_name     text        not null,
  location_lat      float8,
  location_lng      float8,
  max_participants  int,
  participant_count int         not null default 0,
  visibility        text        not null default 'followers' check (visibility in ('followers', 'private')),
  cancelled_at      timestamptz,
  created_at        timestamptz default now()
);

create table public.participations (
  id           uuid        primary key default gen_random_uuid(),
  activity_id  uuid        not null references public.activities(id) on delete cascade,
  user_id      uuid        not null references public.users(id) on delete cascade,
  joined_at    timestamptz default now(),
  unique (activity_id, user_id)
);

create table public.invitations (
  id           uuid        primary key default gen_random_uuid(),
  activity_id  uuid        not null references public.activities(id) on delete cascade,
  invitee_id   uuid        not null references public.users(id) on delete cascade,
  status       text        not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz default now(),
  responded_at timestamptz,
  unique (activity_id, invitee_id)
);

create table public.device_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users(id) on delete cascade,
  token      text        not null,
  platform   text        check (platform in ('ios', 'android')),
  created_at timestamptz default now(),
  unique (user_id, token)
);

-- ============================================================
-- TRIGGER: maintain participant_count
-- ============================================================

create or replace function trg_participations_count()
returns trigger as $$
declare
  v_count int;
  v_max   int;
begin
  if tg_op = 'INSERT' then
    select participant_count, max_participants
      into v_count, v_max
      from activities
     where id = new.activity_id
       for update;

    if v_max is not null and v_count >= v_max then
      raise exception 'activity_full';
    end if;

    update activities
       set participant_count = participant_count + 1
     where id = new.activity_id;

  elsif tg_op = 'DELETE' then
    update activities
       set participant_count = greatest(participant_count - 1, 0)
     where id = old.activity_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_participations_count
before insert or delete on participations
for each row execute function trg_participations_count();

-- ============================================================
-- HELPER FUNCTION
-- ============================================================

create or replace function public.are_mutual_follows(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.follow_requests
    where status = 'accepted'
      and (
        (requester_id = user_a and target_id = user_b) or
        (requester_id = user_b and target_id = user_a)
      )
  );
$$;

-- ============================================================
-- FEED FUNCTION
-- Returns the unified feed for the calling user:
-- - upcoming followers activities from mutual follows
-- - private activities the user is invited to (non-declined)
-- - the user's own activities
-- Sorted chronologically, cursor-paginated.
-- ============================================================

create or replace function public.get_feed(
  p_after_at  timestamptz default null,
  p_after_id  uuid        default null,
  p_limit     int         default 20
)
returns table (
  id                uuid,
  creator_id        uuid,
  creator_display_name text,
  creator_avatar_url   text,
  title             text,
  category          text,
  scheduled_at      timestamptz,
  location_name     text,
  visibility        text,
  participant_count int,
  max_participants  int,
  cancelled_at      timestamptz,
  my_status         text
)
language sql
security definer
stable
as $$
  with my_follows as (
    select
      case when requester_id = auth.uid() then target_id else requester_id end as uid
    from public.follow_requests
    where status = 'accepted'
      and (requester_id = auth.uid() or target_id = auth.uid())
  )
  select
    a.id,
    a.creator_id,
    u.display_name  as creator_display_name,
    u.avatar_url    as creator_avatar_url,
    a.title,
    a.category,
    a.scheduled_at,
    a.location_name,
    a.visibility,
    a.participant_count,
    a.max_participants,
    a.cancelled_at,
    case
      when a.visibility = 'followers' then
        case when p.user_id is not null then 'joined' else 'none' end
      else
        coalesce(inv.status, 'none')
    end as my_status
  from public.activities a
  join public.users u on u.id = a.creator_id
  left join public.participations p
    on p.activity_id = a.id and p.user_id = auth.uid()
  left join public.invitations inv
    on inv.activity_id = a.id and inv.invitee_id = auth.uid()
  where (
    a.creator_id = auth.uid()
    or (
      a.visibility = 'followers'
      and a.creator_id in (select uid from my_follows)
    )
    or (
      a.visibility = 'private'
      and inv.invitee_id = auth.uid()
      and inv.status != 'declined'
    )
  )
  and (
    p_after_at is null
    or a.scheduled_at > p_after_at
    or (a.scheduled_at = p_after_at and a.id > p_after_id)
  )
  order by a.scheduled_at asc, a.id asc
  limit p_limit;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users          enable row level security;
alter table public.follow_requests enable row level security;
alter table public.activities      enable row level security;
alter table public.participations  enable row level security;
alter table public.invitations     enable row level security;
alter table public.device_tokens   enable row level security;

-- users: any authenticated user can read; only own row update/insert
create policy "users_select"
  on public.users for select
  to authenticated using (true);

create policy "users_insert"
  on public.users for insert
  to authenticated with check (auth.uid() = id);

create policy "users_update"
  on public.users for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- follow_requests: only parties involved can see
create policy "follow_requests_select"
  on public.follow_requests for select
  to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());

create policy "follow_requests_insert"
  on public.follow_requests for insert
  to authenticated
  with check (requester_id = auth.uid() and target_id != auth.uid());

create policy "follow_requests_update"
  on public.follow_requests for update
  to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());

-- activities: complex visibility rules
create policy "activities_select"
  on public.activities for select
  to authenticated
  using (
    creator_id = auth.uid()
    or (
      visibility = 'followers'
      and public.are_mutual_follows(auth.uid(), creator_id)
    )
    or (
      visibility = 'private'
      and exists (
        select 1 from public.invitations
        where activity_id = id
          and invitee_id = auth.uid()
          and status != 'declined'
      )
    )
  );

create policy "activities_insert"
  on public.activities for insert
  to authenticated
  with check (creator_id = auth.uid());

create policy "activities_update"
  on public.activities for update
  to authenticated
  using (creator_id = auth.uid());

-- participations: readable by mutual follows of the activity creator
create policy "participations_select"
  on public.participations for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.activities a
      where a.id = activity_id
        and (
          a.creator_id = auth.uid()
          or public.are_mutual_follows(auth.uid(), a.creator_id)
        )
    )
  );

create policy "participations_insert"
  on public.participations for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.activities a
      where a.id = activity_id
        and a.visibility = 'followers'
        and a.cancelled_at is null
        and a.scheduled_at > now()
        and public.are_mutual_follows(auth.uid(), a.creator_id)
    )
  );

create policy "participations_delete"
  on public.participations for delete
  to authenticated
  using (user_id = auth.uid());

-- invitations: creator and invitee only
create policy "invitations_select"
  on public.invitations for select
  to authenticated
  using (
    invitee_id = auth.uid()
    or exists (
      select 1 from public.activities a
      where a.id = activity_id and a.creator_id = auth.uid()
    )
  );

create policy "invitations_insert"
  on public.invitations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.activities a
      where a.id = activity_id
        and a.creator_id = auth.uid()
        and a.visibility = 'private'
        and a.cancelled_at is null
    )
  );

create policy "invitations_update"
  on public.invitations for update
  to authenticated
  using (
    invitee_id = auth.uid()
    or exists (
      select 1 from public.activities a
      where a.id = activity_id and a.creator_id = auth.uid()
    )
  );

create policy "invitations_delete"
  on public.invitations for delete
  to authenticated
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_id and a.creator_id = auth.uid()
    )
  );

-- device_tokens: own only
create policy "device_tokens_all"
  on public.device_tokens for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- TRIGGER: auto-create user profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, username, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
