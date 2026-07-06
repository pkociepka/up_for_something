# Up for Something — Design Document

## 1. Product Vision

A minimalist mobile app for spontaneous social coordination. Users follow each other (mutual acceptance), create activities (sports, board games, movie nights, etc.), and followers can instantly join. The app does one thing well: surfaces what people you know are up to, and lets you opt in with a tap.

**Non-goals (explicitly out of scope for v1):**
- In-app messaging or chat
- Public/geo-based discovery (reserved for v2)
- Algorithmic feed, recommendations, or engagement mechanics
- Comments, likes, reactions

---

## 2. Core Concepts

| Entity | Description |
|---|---|
| **User** | Has a profile (name, avatar, bio). Can follow others and create/join activities. |
| **Follow Request** | A request from A to connect with B. When accepted by B, a single bidirectional connection is established — both can see each other's activities. |
| **Activity** | An event created by a user — what, when, where, optional participant cap. Visibility is either `followers` (default) or `private`. |
| **Participation** | A user joining a `followers` activity. Instant — no host approval needed. |
| **Invitation** | A creator's explicit invite to a specific user for a `private` activity. Invitee can accept or decline. Accepted invitations serve as the participant list for private activities. |

---

## 3. User Flows

### 3.1 Onboarding
1. Sign up with email + password (or Apple/Google Sign-In — Apple required by App Store policy if any social login is offered)
2. Create profile: display name, avatar (optional), short bio (optional)
3. Land on empty feed with prompt to find and follow people

### 3.2 Social Graph
- User searches for others by username or display name
- Sends a follow request → target receives push notification
- Target accepts or declines → requester gets notified on acceptance
- Either party can unfollow at any time (no notification sent)
- Blocking (v2): a blocked user cannot send follow requests or see anything

### 3.3 Creating an Activity
1. Tap "+" → fill in:
   - Title (required)
   - Category (predefined list + "Other")
   - Date & time (required)
   - Location: place name + optional map pin (required)
   - Max participants (optional)
   - Description (optional)
   - Visibility: **Followers** (default) or **Private**
     - If Private: pick invitees from mutual follows list (required — at least one)
2. Publish:
   - Followers activity → all mutual followers receive a push notification
   - Private activity → each invitee receives a push notification ("X invited you to Y")
3. Creator can cancel (delete) the activity at any time → push notification sent to all participants/accepted invitees
4. Creator of a private activity can add or rescind invitations after creation

### 3.4 Joining an Activity

#### Followers activity
- Feed shows upcoming followers activities from mutual follows, sorted chronologically
- Tap activity → see detail (what, when, where, who's joining, spots remaining)
- Tap "Join" → instantly added; creator notified
- Can leave at any time before the activity; creator notified

#### Private activity
- Appears in the feed of invited users only (invisible to everyone else, including other mutual follows of the creator)
- Tap activity → see detail + invitation list: participants who accepted and invitees who haven't responded yet (pending). Declined invitees are not shown.
- Tap "Accept" or "Decline"
  - Accept → invitee added to participants; creator notified
  - Decline → event removed from feed; creator notified
- An invitee who declined can still re-accept (event accessible via notification history or direct link)
- Creator sees the full invitation list: accepted, pending, and declined

### 3.5 Notifications
| Trigger | Recipient |
|---|---|
| Incoming follow request | Target user |
| Follow request accepted | Requester |
| Followed user creates a followers activity | All mutual followers |
| Someone joins your followers activity | Activity creator |
| Activity you joined/accepted is cancelled | All participants / accepted invitees |
| You are invited to a private activity | Invitee |
| Invitee accepts your private activity | Activity creator |
| Invitee declines your private activity | Activity creator |
| You are added as invitee after creation | Invitee |
| Your invitation is rescinded | Invitee (if pending or accepted) |

---

## 4. Data Model

All timestamps are UTC. UUIDs for all primary keys.

### users
```
id            UUID        PK, default gen_random_uuid()
email         TEXT        UNIQUE NOT NULL
username      TEXT        UNIQUE NOT NULL   -- lowercase, URL-safe
display_name  TEXT        NOT NULL
avatar_url    TEXT
bio           TEXT
created_at    TIMESTAMPTZ DEFAULT now()
```

### follow_requests
```
id            UUID        PK
requester_id  UUID        FK → users.id
target_id     UUID        FK → users.id
status        TEXT        CHECK IN ('pending', 'accepted', 'declined', 'cancelled')
created_at    TIMESTAMPTZ DEFAULT now()
responded_at  TIMESTAMPTZ

-- at most one pending request between any two users, regardless of direction
CREATE UNIQUE INDEX ON follow_requests (LEAST(requester_id, target_id), GREATEST(requester_id, target_id)) WHERE status = 'pending';
-- at most one accepted connection between any two users; acceptance of the request IS the mutual follow
CREATE UNIQUE INDEX ON follow_requests (LEAST(requester_id, target_id), GREATEST(requester_id, target_id)) WHERE status = 'accepted';
-- declined and cancelled rows are unrestricted, allowing re-requests after either
```

A connection between two users is a single `accepted` row (whichever party initiated it is `requester_id`; the party who accepted is `target_id`). Querying whether A and B are connected: `WHERE status = 'accepted' AND ((requester_id = A AND target_id = B) OR (requester_id = B AND target_id = A))`.

### activities
```
id               UUID        PK
creator_id       UUID        FK → users.id
title            TEXT        NOT NULL
category         TEXT        NOT NULL   -- enum or free text, see §4.1
description      TEXT
scheduled_at     TIMESTAMPTZ NOT NULL
location_name    TEXT        NOT NULL   -- human-readable (e.g. "Central Park, NYC")
location_lat     FLOAT8                 -- for future map view
location_lng     FLOAT8
max_participants   INT                    -- NULL = unlimited
participant_count INT        NOT NULL DEFAULT 0  -- denormalized; maintained by trigger, never written directly
visibility         TEXT       NOT NULL DEFAULT 'followers'  -- CHECK IN ('followers', 'private')
cancelled_at     TIMESTAMPTZ            -- soft delete / cancellation
created_at       TIMESTAMPTZ DEFAULT now()
```

### participations
Used for `followers` activities only.
```
id           UUID        PK
activity_id  UUID        FK → activities.id  -- must have visibility = 'followers'
user_id      UUID        FK → users.id
joined_at    TIMESTAMPTZ DEFAULT now()
UNIQUE (activity_id, user_id)
```

### invitations
Used for `private` activities only. Accepted invitations are the participant list.
```
id           UUID        PK
activity_id  UUID        FK → activities.id  -- must have visibility = 'private'
invitee_id   UUID        FK → users.id
status       TEXT        NOT NULL DEFAULT 'pending'  -- CHECK IN ('pending', 'accepted', 'declined')
created_at   TIMESTAMPTZ DEFAULT now()
responded_at TIMESTAMPTZ
UNIQUE (activity_id, invitee_id)
```

Invitees must be mutual follows of the creator at invitation time (enforced server-side).

### device_tokens
```
id          UUID        PK
user_id     UUID        FK → users.id
token       TEXT        NOT NULL
platform    TEXT        CHECK IN ('ios', 'android')
created_at  TIMESTAMPTZ DEFAULT now()
UNIQUE (user_id, token)
```

### 4.1 participant_count integrity

`participant_count` is denormalized onto `activities` for feed query performance. It is maintained exclusively by a database trigger — application code never writes it directly.

The join path requires an atomic check-then-increment to enforce `max_participants`. The trigger acquires a row-level lock (`SELECT … FOR UPDATE`) on the activity row for the duration of the check + update — two indexed PK operations with no application round-trip inside the lock window. At realistic concurrency (a handful of friends joining the same event) this is not a bottleneck.

```sql
CREATE OR REPLACE FUNCTION trg_participations_count()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
  v_max   INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT participant_count, max_participants
      INTO v_count, v_max
      FROM activities
     WHERE id = NEW.activity_id
       FOR UPDATE;

    IF v_max IS NOT NULL AND v_count >= v_max THEN
      RAISE EXCEPTION 'activity_full';
    END IF;

    UPDATE activities
       SET participant_count = participant_count + 1
     WHERE id = NEW.activity_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- No lock needed on leave; GREATEST guards against any drift
    UPDATE activities
       SET participant_count = GREATEST(participant_count - 1, 0)
     WHERE id = OLD.activity_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_participations_count
BEFORE INSERT OR DELETE ON participations
FOR EACH ROW EXECUTE FUNCTION trg_participations_count();
```

The `activity_full` exception is caught by the API layer and returned as **409 Conflict**, which the client uses to show "this activity is now full."

### 4.2 Activity Categories (v1 predefined list)
`sports` · `board_games` · `video_games` · `movies` · `music` · `food_drinks` · `outdoors` · `travel` · `other`

---

## 5. API Design

Base URL: `/api/v1`  
Auth: Bearer JWT (access token, 15 min TTL) + refresh token (httpOnly cookie or secure storage, 30 day TTL).

All endpoints require authentication unless marked `[public]`.

### 5.1 Auth

```
POST   /auth/register          { email, password, username, display_name }
POST   /auth/login             { email, password }
POST   /auth/refresh           (uses refresh token)
POST   /auth/logout
POST   /auth/oauth/apple       { id_token }
POST   /auth/oauth/google      { id_token }
```

### 5.2 Users

```
GET    /users/me               own profile
PATCH  /users/me               { display_name?, avatar_url?, bio? }
DELETE /users/me               account deletion (GDPR)
GET    /users/:id              basic profile only (name, avatar, bio)
GET    /users/search?q=        search by username or display_name
GET    /users/me/followers     list accepted followers of current user
GET    /users/me/following     list users current user follows (accepted)
```

### 5.3 Follow Requests

```
POST   /follow-requests                    { target_id }  → send request
GET    /follow-requests/incoming           pending requests TO me
GET    /follow-requests/outgoing           pending requests FROM me
PATCH  /follow-requests/:id               { action: 'accept' | 'decline' }  (target only)
PATCH  /follow-requests/:id               { action: 'cancel' }              (requester only; must be pending)
DELETE /follows/:userId                   disconnect (delete the accepted row regardless of who was requester)
```

### 5.4 Activities

```
POST   /activities             create activity (see body below)
GET    /activities/feed        unified feed: followers activities + private invitations, sorted by scheduled_at, cursor-paginated
GET    /activities/:id         activity detail + participant/invitation list
DELETE /activities/:id         cancel activity (creator only) — sets cancelled_at
POST   /activities/:id/join    join a followers activity
DELETE /activities/:id/join    leave a followers activity
GET    /activities/mine        my created activities (upcoming + past)
```

**POST /activities body:**
```json
{
  "title": "...",
  "category": "sports",
  "description": "...",
  "scheduled_at": "2026-07-10T18:00:00Z",
  "location_name": "...",
  "location_lat": 51.1,
  "location_lng": 17.0,
  "max_participants": 8,
  "visibility": "followers",
  "invitee_ids": ["uuid", "uuid"]   // required when visibility = "private", ignored otherwise
}
```

**Invitation management (private activities only):**
```
POST   /activities/:id/invitations              { invitee_id }  add invitee (creator only; must be mutual follow)
DELETE /activities/:id/invitations/:inviteeId   rescind invitation (creator only)
PATCH  /activities/:id/invitations/me           { action: 'accept' | 'decline' }  respond to invitation
```

**Feed response shape:**
```json
{
  "items": [
    {
      "id": "...",
      "creator": { "id": "...", "display_name": "...", "avatar_url": "..." },
      "title": "...",
      "category": "sports",
      "scheduled_at": "2026-07-10T18:00:00Z",
      "location_name": "Wrocław, Park Szczytnicki",
      "visibility": "followers",
      "participant_count": 3,
      "max_participants": 8,
      "my_status": "none"
    }
  ],
  "next_cursor": "..."
}
```

`my_status` values:
| Value | Meaning |
|---|---|
| `none` | Followers activity, not joined |
| `joined` | Followers activity, joined |
| `pending` | Private activity, invitation not yet responded to |
| `accepted` | Private activity, invitation accepted |
| `declined` | Private activity, invitation declined (excluded from feed; accessible via direct link) |

**GET /activities/:id — participants field:**
- Followers activity: `participants` array (all joined users)
- Private activity: `invitations` array, each entry has `{ user, status }` where status is `accepted` or `pending`
  - Non-creator invitees do not see `declined` entries
  - Creator sees all three statuses

### 5.5 Device Tokens (Push Notifications)

```
POST   /devices     { token, platform }   register/refresh push token
DELETE /devices/:token                    unregister
```

---

## 6. Authorization Rules

| Action | Rule |
|---|---|
| View a followers activity detail | Viewer must be a mutual follow of the creator |
| See a followers activity in feed | Only mutual follows of the creator |
| Join a followers activity | Must be a mutual follow of the creator; not cancelled; not past; below max_participants |
| Leave a followers activity | Only self |
| View a private activity detail | Only creator and users with a non-declined invitation |
| See a private activity in feed | Only users with a pending or accepted invitation |
| Respond to private invitation (accept/decline) | Only the invitee; activity not cancelled; not past |
| Re-accept after declining | Allowed; must be below max_participants |
| Add invitee to private activity | Only creator; invitee must be a mutual follow of creator; activity not cancelled |
| Rescind invitation | Only creator; activity not cancelled |
| View invitation list (accepted + pending) | Creator and any invitee with a non-declined invitation |
| View invitation list (including declined) | Creator only |
| Cancel activity | Only creator |
| Accept/decline follow request | Only the target |
| Delete follow relationship | Either party |
| Search users | Any authenticated user |

Server must enforce all rules — never trust client-side filtering.

---

## 7. Mobile App Screens

### Navigation structure
```
Tab 1: Feed (home)
Tab 2: Discover / Search users
Tab 3: Create activity (+)
Tab 4: Notifications
Tab 5: Profile (me)
```

### Screen inventory

| Screen | Notes |
|---|---|
| **Sign In / Sign Up** | Email + password; Apple/Google login buttons |
| **Feed** | Chronological list of upcoming activities from mutual follows. Empty state prompts to find people. Past activities grayed out / hidden. |
| **Activity Detail** | Title, category icon, date/time, location name (tappable — opens a deep link to Apple Maps / Google Maps pre-loaded with directions from current location), creator avatar/name. Cancelled activities show banner. **Followers activity**: participant avatars + count, spots remaining, Join/Leave button. When `max_participants` is reached: progress bar turns red, count reads "N of N · Full", Join button is disabled and labelled "No spots left" with a caption "This activity is full" beneath it. **Creator view**: Join button is replaced by a "Cancel Activity" button (outlined red). Tapping it opens a bottom-sheet confirmation modal ("Cancel this activity? Everyone who joined will be notified. This cannot be undone.") with a destructive confirm and a dismiss option. **Private activity**: Accept/Decline buttons (for invitees); invitation list showing accepted participants and pending invitees (avatars + names, each with a status chip). Creator additionally sees declined invitees and an "Add people" button. |
| **Create Activity** | Form: title, category picker, date+time picker, location (text + optional map pin), max participants (stepper, optional), description (optional), visibility toggle (Followers / Private). When Private: invitee picker shows mutual follows list with multi-select. Confirm → publish. |
| **Search / Discover** | Search field → results show user cards with name + avatar + follow status button |
| **Follow Requests** | Two tabs: Incoming (accept/decline) and Outgoing (cancel request). Badge on notification tab indicates pending incoming requests. |
| **Notifications** | Chronological list of: new follow requests, accepted requests, new followers activities from mutual follows, new joiners on my followers activities, cancellations, private activity invitations, invitation responses (accepted/declined) on my private activities |
| **My Profile** | Avatar, name, bio, edit button. Tabs: Upcoming activities I created / Past activities I created. Follower & following counts (tappable lists). |
| **Other Profile** | Avatar, name, bio. Follow request button (or pending/mutual state). List of their upcoming activities (only if mutual follows). |

---

## 8. Tech Stack Recommendation

### Mobile: React Native + Expo
- Cross-platform (iOS + Android) from one codebase
- TypeScript out of the box
- Expo Router for file-based navigation
- Expo Notifications for push (wraps APNs + FCM)
- Fast OTA updates without App Store release
- Large ecosystem; easy to onboard new devs and AI coding tools

### Backend — two good options:

#### Option A: Supabase (recommended for fast launch)
- PostgreSQL with Row Level Security (enforces auth rules at DB layer)
- Built-in auth (email/password, Apple, Google)
- Auto-generated REST API + PostgREST; custom logic via Edge Functions (Deno/TypeScript)
- Push notifications: call Expo Push API from Edge Functions
- Managed infra: no servers to operate, scales automatically
- Trade-off: some vendor lock-in; complex business logic can get messy in Edge Functions

#### Option B: Node.js + PostgreSQL (recommended for control)
- Fastify (or Hono) for HTTP layer — fast, TypeScript-native, minimal
- PostgreSQL on a managed provider (Neon, Railway, Supabase DB-only, Fly Postgres)
- JWT auth with refresh tokens; bcrypt for passwords
- Expo Push Notifications API for push delivery
- Deploy on Railway, Fly.io, or Render (simple, cheap, auto-scaling)
- Trade-off: more boilerplate to write; you own the ops

**Recommendation:** Start with **Option A (Supabase)** to validate the product fast. Migrate to Option B only if Supabase constraints become real friction — which is unlikely at early scale.

### Summary table

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo (TypeScript) |
| Navigation | Expo Router |
| State / server cache | TanStack Query |
| Backend | Supabase (Option A) or Fastify + PostgreSQL (Option B) |
| Auth | Supabase Auth / custom JWT; Apple + Google Sign-In |
| Push notifications | Expo Push Notifications → APNs + FCM |
| Maps | No in-app map; location tap opens `maps://` (iOS) or `geo:` / Google Maps URL (Android) with directions from current location via `Linking.openURL()` |

---

## 9. Security Considerations

- **Identity**: JWT signed with RS256 (asymmetric); validate on every request server-side
- **Authorization**: Enforce all access rules server-side; never rely on client filtering
- **Passwords**: bcrypt (cost factor ≥ 12) or Supabase Auth (argon2)
- **Refresh tokens**: Rotate on every use (sliding window); invalidate all on logout
- **Rate limiting**: Auth endpoints (login, register, follow request) — prevent brute force and spam
- **Input validation**: Validate and sanitize all inputs server-side (length limits, type checks)
- **Location data**: Store lat/lng but only expose to mutual follows; never return in search results
- **HTTPS only**: Enforce TLS everywhere; HSTS on the API domain
- **Push tokens**: Scoped to authenticated user; rotate stale tokens
- **Account deletion**: Hard delete user data on request; cascade delete activities, participations, follow relationships

---

## 10. Infrastructure

### 10.1 Mobile App

| Setting | Value |
|---|---|
| Bundle ID (iOS) | `com.upforsomething.app` |
| Application ID (Android) | `com.upforsomething.app` |
| Expo slug | `upforsomething` |
| App name (display) | `Up for Something` |

### 10.2 Supabase

| Setting | Value |
|---|---|
| Region | `eu-central-1` (Frankfurt) |
| Project name | `upforsomething` |

All schema, RLS policies, Edge Functions, and seed data are managed as code under `supabase/` in the monorepo and applied via the Supabase CLI in CI/CD (see §8 monorepo structure).

---

## 11. Design System

### 10.1 Color Palette

All colors defined as design tokens and consumed via a theme object in React Native. Both themes share the same token names; only their values differ.

#### Brand / Primary
| Token | Light | Dark | Usage |
|---|---|---|---|
| `primary` | `#FF6B35` | `#FF6B35` | Buttons, active states, links |
| `primary-subtle` | `#FFF0EB` | `#3D1A0A` | Chip backgrounds, icon backgrounds, tinted surfaces |
| `primary-pressed` | `#E55A25` | `#E55A25` | Button press state |

#### Backgrounds (layered — follows iOS/Android elevation model)
| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg-screen` | `#F2F2F7` | `#000000` | Screen / grouped list background |
| `bg-card` | `#FFFFFF` | `#1C1C1E` | Cards, sheets, nav bars |
| `bg-elevated` | `#FFFFFF` | `#2C2C2E` | Modals, bottom sheets, popovers |
| `bg-input` | `#F2F2F7` | `#2C2C2E` | Text inputs, search bars |

#### Text
| Token | Light | Dark | Usage |
|---|---|---|---|
| `text-primary` | `#1C1C1E` | `#FFFFFF` | Headlines, names, primary content |
| `text-secondary` | `#3C3C43` | `#EBEBF5` at 60% → `#9A9AAF` | Descriptions, secondary info |
| `text-tertiary` | `#8E8E93` | `#EBEBF5` at 30% → `#636370` | Timestamps, counts, placeholders |
| `text-on-primary` | `#FFFFFF` | `#FFFFFF` | Text on orange buttons |

#### Semantic
| Token | Light | Dark | Usage |
|---|---|---|---|
| `success` | `#30D158` | `#32D74B` | Joined state, accepted chip |
| `success-subtle` | `#E8F8EE` | `#0C2A14` | Joined button background |
| `danger` | `#FF453A` | `#FF453A` | Decline button, cancelled badge |
| `danger-subtle` | `#FFE5E3` | `#2D0D0C` | Decline button background |
| `info` | `#0A84FF` | `#0A84FF` | Tappable links (creator name, location) |

#### Separators & Borders
| Token | Light | Dark | Usage |
|---|---|---|---|
| `separator` | `#E5E5EA` | `#38383A` | Nav bar borders, section dividers |
| `separator-light` | `#F2F2F7` | `#2C2C2E` | Intra-card row dividers |

---

### 10.2 Typography

**Typeface:** Inter Variable (via `expo-font` + `@expo-google-fonts/inter`)  
**Fallback:** System — `-apple-system` (iOS), `Roboto` (Android)

| Token | Size | Weight | Line height | Usage |
|---|---|---|---|---|
| `display` | 26px | 800 ExtraBold | 1.15 | Activity detail title |
| `title1` | 22px | 800 ExtraBold | 1.2 | Profile name, screen titles |
| `title2` | 19px | 700 Bold | 1.2 | Card titles |
| `title3` | 17px | 700 Bold | 1.3 | Navigation bar titles |
| `callout` | 15px | 600 SemiBold | 1.4 | Creator names, button labels |
| `body` | 15px | 400 Regular | 1.5 | Descriptions, general content |
| `subhead` | 13px | 500 Medium | 1.4 | Card metadata (date, location) |
| `footnote` | 12px | 500 Medium | 1.4 | Timestamps, participant counts |
| `caption` | 11px | 700 Bold | 1.3 | Chips, badges (all caps + 0.4px tracking) |

---

### 10.3 Spacing & Shape

**Spacing scale** (4px base unit):
```
xs:  4px    inner chip padding, icon gaps
sm:  8px    between related elements
md:  12px   card internal padding (vertical)
lg:  16px   screen horizontal margin, section padding
xl:  20px   card internal padding (horizontal), hero sections
2xl: 24px   between major sections
3xl: 32px   empty state padding
4xl: 48px   large vertical breathing room
```

**Border radius:**
```
sm:   8px    small UI elements (icon wrappers)
md:   12px   inputs, chips, category chips, search bar
lg:   16px   cards, bottom sheets
xl:   20px   pill buttons
full: 9999px avatars, status badges
```

**Shadows:**
```
card:         0 1px 4px rgba(0,0,0,0.07)    light  /  none (use bg contrast in dark)
elevated:     0 4px 16px rgba(0,0,0,0.12)   light  /  0 4px 16px rgba(0,0,0,0.4) dark
primary-glow: 0 4px 16px rgba(255,107,53,0.4)  both themes (nav + button)
```

---

### 10.4 Icon Library

**Package:** `lucide-react-native`  
**Dependency:** `react-native-svg` (required; supported natively in Expo)  
**Stroke width:** 1.75px (default) across all icons for visual consistency

| Location | Icon name | Notes |
|---|---|---|
| Feed tab | `Home` | |
| Search tab | `Search` | |
| Notifications tab | `Bell` | |
| Profile tab | `User` | |
| Back button | `ChevronLeft` | |
| Date / when | `Calendar` | |
| Location / where | `MapPin` | tappable → Maps deep link |
| Participants | `Users` | |
| Private activity | `Lock` | |
| Description / note | `MessageSquare` | |
| Close / dismiss | `X` | |
| Joined / accepted | `Check` | |
| Settings | `Settings` | |
| Edit profile | `Pencil` | |
| Cancel activity | `Trash2` | |
| Add invitee | `UserPlus` | |

**Category icons** — Lucide icons (same library, same stroke width, consistent with all other UI chrome):

| Category | Lucide icon name | Sprite ID |
|---|---|---|
| Sports | `Dumbbell` | `ico-dumbbell` |
| Board Games | `Dice5` | `ico-dice` |
| Video Games | `Gamepad2` | `ico-gamepad` |
| Movies | `Film` | `ico-film` |
| Music | `Music` | `ico-music` |
| Food & Drinks | `Coffee` | `ico-coffee` |
| Outdoors | `MountainSnow` | `ico-mountain-snow` |
| Other | `MoreHorizontal` | `ico-more` |

---

### 10.5 App Icon Direction

Shape: square with rounded corners (standard iOS/Android)  
Background: solid `#FF6B35` orange  
Mark: a bold white spark / lightning bolt — communicates spontaneity and energy  
Style: flat, no gradients, no shadows — works at all sizes from 20px notification to 1024px store listing  

Avoid: people/figure silhouettes (generic), map pins (overused in social apps), calendar icons (too utilitarian)

---

## 12. Future Considerations (v2+)

- **Settings / account screen**: Logout, account deletion (GDPR), push notification preferences (per-event-type toggles), profile privacy controls
- **Public profiles & geo-based discovery**: Profiles opt into public mode; a separate "Nearby" feed shows public activities within a configurable radius (requires geospatial indexing, e.g. PostGIS or `earthdistance` extension)
- **Activity recurrence**: Repeat weekly / custom schedule
- **Calendar integration**: Export activity to device calendar (no backend needed; client-side only)
- **Blocking**: Block user → they cannot follow or see anything
- **Moderation / reporting**: Report inappropriate content
- **Web app**: Same backend, new frontend (Next.js)
