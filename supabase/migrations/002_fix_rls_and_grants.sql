-- 1. GRANTS
--
-- 001_schema.sql didn't include explicit grants. Cloud Supabase adds these
-- automatically during project init; supabase start (local dev) only applies
-- what is in the migrations directory, so everything was denied at the
-- table-privilege level before RLS even ran.
-- GRANT statements are idempotent — safe to push to an existing cloud project.

grant usage on schema public to anon, authenticated;

grant select                            on all tables    in schema public to anon;
grant select, insert, update, delete    on all tables    in schema public to authenticated;
grant usage, select                     on all sequences in schema public to authenticated;

-- Ensure tables added by future migrations inherit the same grants.
alter default privileges in schema public
  grant select on tables to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;


-- 2. RLS RECURSION FIX
--
-- activities_select contained:
--   exists (select 1 from public.invitations where activity_id = id ...)
-- invitations_select contained:
--   exists (select 1 from public.activities a where a.id = activity_id ...)
--
-- Each plain subquery evaluates the other table's RLS policy, creating a cycle:
--   activities_select → invitations → invitations_select → activities → ...
--
-- Fix: wrap each cross-table lookup in a security-definer function. Such
-- functions run as the postgres superuser, which bypasses RLS on the queried
-- table, breaking the cycle. This is the same pattern already used by
-- are_mutual_follows() for follow_requests.

create or replace function public.has_pending_invitation(p_activity_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.invitations
    where activity_id = p_activity_id
      and invitee_id  = p_user_id
      and status     != 'declined'
  );
$$;

create or replace function public.is_activity_creator(p_activity_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.activities
    where id         = p_activity_id
      and creator_id = p_user_id
  );
$$;

drop policy "activities_select" on public.activities;
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
      and public.has_pending_invitation(id, auth.uid())
    )
  );

drop policy "invitations_select" on public.invitations;
create policy "invitations_select"
  on public.invitations for select
  to authenticated
  using (
    invitee_id = auth.uid()
    or public.is_activity_creator(activity_id, auth.uid())
  );
