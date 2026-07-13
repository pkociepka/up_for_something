import { createTestUser, createMutualFollow, cleanupUsers, daysFromNow, TestUser } from '../helpers/fixtures';

describe('Follow system', () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;

  beforeAll(async () => {
    [alice, bob, carol] = await Promise.all([
      createTestUser('alice'),
      createTestUser('bob'),
      createTestUser('carol'),
    ]);
  });

  afterAll(async () => {
    await cleanupUsers([alice.id, bob.id, carol.id]);
  });

  describe('pending request visibility', () => {
    beforeAll(async () => {
      const { error } = await alice.client
        .from('follow_requests')
        .insert({ requester_id: alice.id, target_id: bob.id, status: 'pending' });
      if (error) throw error;
    });

    it('requester (alice) can see the pending request', async () => {
      const { data } = await alice.client
        .from('follow_requests')
        .select('id')
        .eq('requester_id', alice.id)
        .eq('target_id', bob.id)
        .eq('status', 'pending');
      expect(data).toHaveLength(1);
    });

    it('target (bob) can see the pending request', async () => {
      const { data } = await bob.client
        .from('follow_requests')
        .select('id')
        .eq('requester_id', alice.id)
        .eq('status', 'pending');
      expect(data).toHaveLength(1);
    });

    it('third party (carol) cannot see the pending request', async () => {
      const { data } = await carol.client
        .from('follow_requests')
        .select('id')
        .eq('requester_id', alice.id)
        .eq('target_id', bob.id);
      expect(data).toHaveLength(0);
    });
  });

  describe('after acceptance — activity visibility', () => {
    let bobActivityId: string;

    beforeAll(async () => {
      // bob accepts alice's request
      await bob.client
        .from('follow_requests')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('requester_id', alice.id)
        .eq('target_id', bob.id);

      const { data } = await bob.client
        .from('activities')
        .insert({
          creator_id: bob.id,
          title: "Bob's board game night",
          category: 'board_games',
          scheduled_at: daysFromNow(3),
          location_name: "Bob's place",
          visibility: 'followers',
        })
        .select('id')
        .single();
      bobActivityId = data!.id;
    });

    it('alice (mutual follower) can see bob\'s activity', async () => {
      const { data, error } = await alice.client
        .from('activities')
        .select('id')
        .eq('id', bobActivityId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.id).toBe(bobActivityId);
    });

    it('carol (no connection) cannot see bob\'s activity', async () => {
      const { data } = await carol.client
        .from('activities')
        .select('id')
        .eq('id', bobActivityId)
        .maybeSingle();
      expect(data).toBeNull();
    });

    it("alice's activity appears in bob's feed", async () => {
      const { data: aliceAct } = await alice.client
        .from('activities')
        .insert({
          creator_id: alice.id,
          title: "Alice's morning run",
          category: 'sports',
          scheduled_at: daysFromNow(2),
          location_name: 'The track',
          visibility: 'followers',
        })
        .select('id')
        .single();

      const { data: feed } = await bob.client.rpc('get_feed', { p_limit: 20 });
      expect(feed?.some((item: { id: string }) => item.id === aliceAct!.id)).toBe(true);
    });
  });

  describe('after unfollow — activity access revoked', () => {
    let aliceActivity2Id: string;

    beforeAll(async () => {
      const { data } = await alice.client
        .from('activities')
        .insert({
          creator_id: alice.id,
          title: "Alice's second event",
          category: 'other',
          scheduled_at: daysFromNow(5),
          location_name: 'Park',
          visibility: 'followers',
        })
        .select('id')
        .single();
      aliceActivity2Id = data!.id;
    });

    it('bob can see the activity before unfollowing', async () => {
      const { data } = await bob.client
        .from('activities')
        .select('id')
        .eq('id', aliceActivity2Id)
        .maybeSingle();
      expect(data?.id).toBe(aliceActivity2Id);
    });

    it('after alice unfollows bob, bob can no longer see her activity', async () => {
      // Delete the accepted follow_request row (acts as "unfollow")
      await alice.client
        .from('follow_requests')
        .delete()
        .or(
          `and(requester_id.eq.${alice.id},target_id.eq.${bob.id}),` +
          `and(requester_id.eq.${bob.id},target_id.eq.${alice.id})`
        );

      const { data } = await bob.client
        .from('activities')
        .select('id')
        .eq('id', aliceActivity2Id)
        .maybeSingle();
      expect(data).toBeNull();
    });
  });

  describe('self-follow prevention', () => {
    it('user cannot follow themselves', async () => {
      const { error } = await alice.client
        .from('follow_requests')
        .insert({ requester_id: alice.id, target_id: alice.id, status: 'pending' });
      expect(error).not.toBeNull();
    });
  });
});
