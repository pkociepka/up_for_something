// Shared TypeScript types — consumed by apps/mobile and supabase/functions
export type ActivityVisibility = 'followers' | 'private';

export type ActivityCategory =
  | 'sports'
  | 'board_games'
  | 'video_games'
  | 'movies'
  | 'music'
  | 'food_drinks'
  | 'outdoors'
  | 'other';

export type FollowStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export type MyActivityStatus = 'none' | 'joined' | 'pending' | 'accepted' | 'declined';
