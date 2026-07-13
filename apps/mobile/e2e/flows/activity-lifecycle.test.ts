import { createTestUser, createMutualFollow, cleanupUsers, daysFromNow, TestUser } from '../helpers/fixtures';

describe('Activity lifecycle', () => {
  let organizer: TestUser;
  let follower: TestUser;
  let outsider: TestUser;

  beforeAll(async () => {
    [organizer, follower, outsider] = await Promise.all([
      createTestUser('organizer'),
      createTestUser('follower'),
      createTestUser('outsider'),
    ]);
    await createMutualFollow(follower, organizer);
    // outsider has no connection to organizer
  });

  afterAll(async () => {
    await cleanupUsers([organizer.id, follower.id, outsider.id]);
  });

  describe('followers-visibility activity', () => {
    let activityId: string;

    beforeAll(async () => {
      const { data, error } = await organizer.client
        .from('activities')
        .insert({
          creator_id: organizer.id,
          title: 'Basketball at the park',
          category: 'sports',
          scheduled_at: daysFromNow(1),
          location_name: 'Central Park',
          visibility: 'followers',
        })
        .select('id')
        .single();
      if (error) throw error;
      activityId = data.id;
    });

    it('organizer can see their own activity', async () => {
      const { data, error } = await organizer.client
        .from('activities')
        .select('id, title')
        .eq('id', activityId)
        .single();
      expect(error).toBeNull();
      expect(data?.title).toBe('Basketball at the park');
    });

    it('follower sees the activity via direct RLS select', async () => {
      const { data, error } = await follower.client
        .from('activities')
        .select('id')
        .eq('id', activityId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.id).toBe(activityId);
    });

    it('follower sees activity in get_feed RPC', async () => {
      const { data, error } = await follower.client.rpc('get_feed', { p_limit: 20 });
      expect(error).toBeNull();
      expect(data?.some((item: { id: string }) => item.id === activityId)).toBe(true);
    });

    it('outsider (non-follower) cannot see the activity', async () => {
      const { data, error } = await outsider.client
        .from('activities')
        .select('id')
        .eq('id', activityId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it('outsider does not see activity in their feed', async () => {
      const { data } = await outsider.client.rpc('get_feed', { p_limit: 20 });
      expect(data?.some((item: { id: string }) => item.id === activityId)).toBe(false);
    });

    describe('join flow → organizer sees participant', () => {
      beforeAll(async () => {
        const { error } = await follower.client
          .from('participations')
          .insert({ activity_id: activityId, user_id: follower.id });
        if (error) throw error;
      });

      afterAll(async () => {
        // leave so this slot is free for subsequent tests
        await follower.client
          .from('participations')
          .delete()
          .eq('activity_id', activityId)
          .eq('user_id', follower.id);
      });

      it('organizer sees follower in participant list', async () => {
        const { data, error } = await organizer.client
          .from('participations')
          .select('user_id')
          .eq('activity_id', activityId);
        expect(error).toBeNull();
        expect(data?.map((p: { user_id: string }) => p.user_id)).toContain(follower.id);
      });

      it('participant_count is incremented to 1', async () => {
        const { data } = await organizer.client
          .from('activities')
          .select('participant_count')
          .eq('id', activityId)
          .single();
        expect(data?.participant_count).toBe(1);
      });

      it('follower sees my_status as "joined" in feed', async () => {
        const { data } = await follower.client.rpc('get_feed', { p_limit: 20 });
        const item = data?.find((i: { id: string }) => i.id === activityId);
        expect(item?.my_status).toBe('joined');
      });
    });

    it('leaving removes the participation and decrements participant_count back to 0', async () => {
      // join first
      await follower.client
        .from('participations')
        .insert({ activity_id: activityId, user_id: follower.id });

      await follower.client
        .from('participations')
        .delete()
        .eq('activity_id', activityId)
        .eq('user_id', follower.id);

      const { data } = await organizer.client
        .from('activities')
        .select('participant_count')
        .eq('id', activityId)
        .single();
      expect(data?.participant_count).toBe(0);
    });
  });

  describe('capacity enforcement', () => {
    let capper: TestUser;
    let cappedActivityId: string;

    beforeAll(async () => {
      capper = await createTestUser('capper');
      await createMutualFollow(capper, organizer);

      const { data } = await organizer.client
        .from('activities')
        .insert({
          creator_id: organizer.id,
          title: 'Capped activity',
          category: 'other',
          scheduled_at: daysFromNow(2),
          location_name: 'Venue',
          visibility: 'followers',
          max_participants: 1,
        })
        .select('id')
        .single();
      cappedActivityId = data!.id;

      // follower takes the only spot
      await follower.client
        .from('participations')
        .insert({ activity_id: cappedActivityId, user_id: follower.id });
    });

    afterAll(async () => {
      await cleanupUsers([capper.id]);
    });

    it('joining a full activity fails with activity_full error', async () => {
      const { error } = await capper.client
        .from('participations')
        .insert({ activity_id: cappedActivityId, user_id: capper.id });
      expect(error).not.toBeNull();
      expect(error!.message).toContain('activity_full');
    });
  });

  describe('cancelled activity', () => {
    it('organizer can cancel their activity', async () => {
      const { data: act } = await organizer.client
        .from('activities')
        .insert({
          creator_id: organizer.id,
          title: 'To be cancelled',
          category: 'other',
          scheduled_at: daysFromNow(3),
          location_name: 'Somewhere',
          visibility: 'followers',
        })
        .select('id')
        .single();

      const { error } = await organizer.client
        .from('activities')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', act!.id);
      expect(error).toBeNull();

      const { data } = await organizer.client
        .from('activities')
        .select('cancelled_at')
        .eq('id', act!.id)
        .single();
      expect(data?.cancelled_at).not.toBeNull();
    });

    it('follower cannot join a cancelled activity (past scheduled or cancelled RLS enforcement)', async () => {
      // Create activity scheduled in the past to test the scheduled_at > now() RLS guard
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { data: act } = await organizer.client
        .from('activities')
        .insert({
          creator_id: organizer.id,
          title: 'Past activity',
          category: 'other',
          scheduled_at: yesterday.toISOString(),
          location_name: 'Old venue',
          visibility: 'followers',
        })
        .select('id')
        .single();

      const { error } = await follower.client
        .from('participations')
        .insert({ activity_id: act!.id, user_id: follower.id });
      expect(error).not.toBeNull();
    });
  });
});
