-- 1. TRIGGER SECURITY FIX
--
-- trg_participations_count ran with the privileges of the session user
-- (whoever inserted/deleted the participation). The activities_update RLS
-- policy restricts updates to the creator, so the trigger's
-- UPDATE activities SET participant_count = ...
-- was silently denied for any non-creator (e.g., a follower joining). The
-- count never changed, which also meant the activity_full guard never fired.
--
-- Making the function SECURITY DEFINER causes it to execute as its owner
-- (postgres superuser), which bypasses RLS and lets the count be maintained
-- correctly regardless of who performs the participation change.

create or replace function trg_participations_count()
returns trigger
language plpgsql
security definer
as $$
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
$$;


-- 2. MISSING follow_requests DELETE POLICY
--
-- The app's unfollow action deletes the accepted follow_requests row, but no
-- FOR DELETE policy existed. With RLS enabled, a missing policy defaults to
-- deny-all, so deletes were silently blocked (0 rows affected, no error).

create policy "follow_requests_delete"
  on public.follow_requests for delete
  to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
