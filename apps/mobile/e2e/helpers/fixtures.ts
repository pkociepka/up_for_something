import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, clientAs } from './clients';

const PASSWORD = 'TestPass123!';

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const tag = `${label}-${Date.now()}`;
  const email = `${tag}@e2e.test`;

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: tag.replace(/[^a-z0-9]/gi, '_'),
      display_name: `Test ${label}`,
    },
  });
  if (error) throw new Error(`createUser failed for ${label}: ${error.message}`);

  const client = await clientAs(email, PASSWORD);
  return { id: data.user.id, email, client };
}

export async function createMutualFollow(sender: TestUser, receiver: TestUser): Promise<void> {
  const { error: reqErr } = await sender.client
    .from('follow_requests')
    .insert({ requester_id: sender.id, target_id: receiver.id, status: 'pending' });
  if (reqErr) throw new Error(`send follow failed: ${reqErr.message}`);

  const { error: accErr } = await receiver.client
    .from('follow_requests')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('requester_id', sender.id)
    .eq('target_id', receiver.id);
  if (accErr) throw new Error(`accept follow failed: ${accErr.message}`);
}

export async function cleanupUsers(ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => adminClient.auth.admin.deleteUser(id)));
}

export function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
