export type ActivityVisibility = 'followers' | 'private';

export type ActivityCategory =
  | 'sports'
  | 'board_games'
  | 'video_games'
  | 'movies'
  | 'music'
  | 'food_drinks'
  | 'outdoors'
  | 'travel'
  | 'other';

export type FollowStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export type MyActivityStatus = 'none' | 'joined' | 'pending' | 'accepted' | 'declined';

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  creator_id: string;
  title: string;
  category: ActivityCategory;
  description: string | null;
  scheduled_at: string;
  location_name: string;
  location_lat: number | null;
  location_lng: number | null;
  max_participants: number | null;
  participant_count: number;
  visibility: ActivityVisibility;
  cancelled_at: string | null;
  created_at: string;
}

export interface FeedItem {
  id: string;
  creator_id: string;
  creator_display_name: string;
  creator_avatar_url: string | null;
  title: string;
  category: ActivityCategory;
  scheduled_at: string;
  location_name: string;
  visibility: ActivityVisibility;
  participant_count: number;
  max_participants: number | null;
  cancelled_at: string | null;
  my_status: MyActivityStatus;
}

export interface Participation {
  id: string;
  activity_id: string;
  user_id: string;
  joined_at: string;
}

export interface Invitation {
  id: string;
  activity_id: string;
  invitee_id: string;
  status: InvitationStatus;
  created_at: string;
  responded_at: string | null;
}

export interface FollowRequest {
  id: string;
  requester_id: string;
  target_id: string;
  status: FollowStatus;
  created_at: string;
  responded_at: string | null;
  requester?: Pick<User, 'id' | 'display_name' | 'username' | 'avatar_url'>;
  target?: Pick<User, 'id' | 'display_name' | 'username' | 'avatar_url'>;
}

export type ActivityParticipant = Pick<User, 'id' | 'display_name' | 'username' | 'avatar_url'>;

export type ActivityInvitation = {
  user: Pick<User, 'id' | 'display_name' | 'username' | 'avatar_url'>;
  status: InvitationStatus;
};

export interface ActivityDetail extends Activity {
  creator: Pick<User, 'id' | 'display_name' | 'username' | 'avatar_url'>;
  my_status: MyActivityStatus;
  participants?: ActivityParticipant[];
  invitations?: ActivityInvitation[];
}

export interface CreateActivityInput {
  title: string;
  category: ActivityCategory;
  description?: string;
  scheduled_at: string;
  location_name: string;
  location_lat?: number;
  location_lng?: number;
  max_participants?: number;
  visibility: ActivityVisibility;
  invitee_ids?: string[];
}
