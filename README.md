# Campus Event Management (B4)

Students browse upcoming events and register with live capacity tracking and personal schedule-clash prevention.

**Live demo:** <YOUR_VERCEL_URL>

**Test credentials**

| Email | Password |
|-------|----------|
| student1@test.com | <PASSWORD> |
| student2@test.com | <PASSWORD> |

## Features

- Sign up / log in (Supabase Auth, email + password)
- Browse upcoming events, search by title
- Live seat counts (auto-refresh every 10s)
- Register and unregister; "My events" tab
- Rejected when the event is full, already registered, already started, or overlapping another registered event

## Tech stack

Next.js (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres + Auth), deployed on Vercel.

## Architecture

The browser talks to Supabase directly. There is no separate backend server. Business rules are enforced inside Postgres, so they can't be bypassed from the frontend.

### Data model

- `events`: title, description, location, `start_time` and `end_time` (timestamptz), `capacity`. Check constraint: `end_time > start_time`.
- `registrations`: `event_id`, `user_id`, with `unique (event_id, user_id)`.
- `events_with_seats` (view): events plus a registration count, so clients can show seats left without reading other students' registrations.

### How the rules are enforced

All registration goes through one Postgres function, `register_for_event(event_id)`, which reads the user from `auth.uid()` (never from client input) and runs in one transaction:

1. **Row lock:** `select ... for update` on the event row. Concurrent requests for the same event queue up, so two students can't both take the last seat.
2. **Capacity:** count registrations, reject if `count >= capacity`.
3. **Duplicates:** an explicit check gives a friendly error, and the `unique (event_id, user_id)` constraint is the database-level backstop.
4. **Schedule clash:** compare the new event with the student's existing registrations using `newStart < existingEnd AND newEnd > existingStart`. Strict inequalities mean back-to-back events (12:00 end, 12:00 start) are allowed.
5. **Started events:** rejected once `start_time` has passed.

### Security

- Row Level Security is on for both tables. Events are public read. Students can only read and delete their own registrations.
- Students have no INSERT policy on `registrations`, so the only way to register is the function above. The function is `security definer` and executable only by authenticated users.

### Trade-offs and limitations

- Events are seeded through SQL. There is no admin UI, in order to focus on the core rules within the time limit.
- Seat counts refresh by polling every 10s instead of websockets or Supabase Realtime, to keep the code simple. The server still rejects overbooking even if the UI is stale.
- The clash check locks the event row, not the student. If one student registers for two different overlapping events at the exact same instant, both could pass. A per-user advisory lock would close this.

## Run locally

```bash
npm install
# .env.local
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
npm run dev
```

Database setup: run the SQL in `supabase/schema.sql` in the Supabase SQL editor.
