import { createTestUser, createMutualFollow, cleanupUsers, daysFromNow, TestUser } from '../helpers/fixtures';

describe('Private activities', () => {
  let creator: TestUser;
  let invitee: TestUser;
  let noninvitee: TestUser;
  let activityId: string;

  beforeAll(async () => {
    [creator, invitee, noninvitee] = await Promise.all([
      createTestUser('priv-creator'),
      createTestUser('priv-invitee'),
      createTestUser('priv-noninvitee'),
    ]);
    // All are mutual follows with creator (pre-condition for invitations in this app)
    await Promise.all([
      createMutualFollow(invitee, creator),
      createMutualFollow(noninvitee, creator),
    ]);

    const { data, error } = await creator.client
      .from('activities')
      .insert({
        creator_id: creator.id,
        title: 'Private dinner',
        category: 'food_drinks',
        scheduled_at: daysFromNow(2),
        location_name: 'My place',
        visibility: 'private',
      })
      .select('id')
      .single();
    if (error) throw error;
    activityId = data.id;

    // Creator invites invitee
    const { error: invErr } = await creator.client
      .from('invitations')
      .insert({ activity_id: activityId, invitee_id: invitee.id });
    if (invErr) throw invErr;
  });

  afterAll(async () => {
    await cleanupUsers([creator.id, invitee.id, noninvitee.id]);
  });

  it('invitee can see the private activity', async () => {
    const { data, error } = await invitee.client
      .from('activities')
      .select('id, visibility')
      .eq('id', activityId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(activityId);
    expect(data?.visibility).toBe('private');
  });

  it('non-invitee cannot see the private activity (even with mutual follow)', async () => {
    const { data, error } = await noninvitee.client
      .from('activities')
      .select('id')
      .eq('id', activityId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('invitee sees invitation in feed with my_status "pending"', async () => {
    const { data, error } = await invitee.client.rpc('get_feed', { p_limit: 20 });
    expect(error).toBeNull();
    const item = data?.find((i: { id: string }) => i.id === activityId);
    expect(item).toBeDefined();
    expect(item?.my_status).toBe('pending');
  });

  it('invitee can accept the invitation', async () => {
    const { error } = await invitee.client
      .from('invitations')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('activity_id', activityId)
      .eq('invitee_id', invitee.id);
    expect(error).toBeNull();
  });

  it('creator sees invitee response as accepted', async () => {
    const { data, error } = await creator.client
      .from('invitations')
      .select('status')
      .eq('activity_id', activityId)
      .eq('invitee_id', invitee.id)
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe('accepted');
  });

  it('invitee feed shows my_status as "accepted"', async () => {
    const { data } = await invitee.client.rpc('get_feed', { p_limit: 20 });
    const item = data?.find((i: { id: string }) => i.id === activityId);
    expect(item?.my_status).toBe('accepted');
  });

  it('after declining, invitee can no longer see the private activity', async () => {
    await invitee.client
      .from('invitations')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('activity_id', activityId)
      .eq('invitee_id', invitee.id);

    const { data } = await invitee.client
      .from('activities')
      .select('id')
      .eq('id', activityId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it('non-invitee cannot insert a participation on a private activity', async () => {
    // private activities don't support participations (only invitations)
    // The invitations_insert policy requires creator_id = auth.uid()
    const { error } = await noninvitee.client
      .from('invitations')
      .insert({ activity_id: activityId, invitee_id: noninvitee.id });
    expect(error).not.toBeNull();
  });

  it('creator can see all invitations including declined', async () => {
    const { data, error } = await creator.client
      .from('invitations')
      .select('status, invitee_id')
      .eq('activity_id', activityId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe('declined');
  });
});
