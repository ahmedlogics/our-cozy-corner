# LogiPulse — Within-City Courier Platform

LogiPulse connects customers who need a parcel moved across town with nearby riders. Admins run day-to-day operations. Everything is stored in the owner's own Supabase project.

## Features
- **Customer:** sign up or sign in, book a delivery (pickup and drop-off pins inside the service area, vehicle choice, priority, Handle With Care), see a price quote calculated on the server, list and view orders, follow a status timeline, and chat with the rider once the order is accepted.
- **Rider:** see pending orders that match their vehicle. Each order shows the Haversine (straight-line) distance from the rider's position to the pickup. Riders can filter by radius and priority (both filters apply together, AND logic) and sort by Nearest First or Priority First. They accept orders atomically, move them through PICKED_UP → IN_TRANSIT → DELIVERED, and chat with the customer.
- **Admin:** live stats from the database, order, rider and customer tables, account activation, and priority changes.

## Tech stack
TanStack Start (React 19, Vite 7), Tailwind CSS v4, shadcn/ui, TanStack Query, Leaflet maps, Supabase (Postgres, Auth, RLS, RPC, Realtime).

## Architecture
```text
src/routes/_authenticated/customer.*  -> Customer dashboard
src/routes/_authenticated/rider.*     -> Rider dashboard
src/routes/_authenticated/admin.*     -> Admin dashboard (guarded by role + DB-side require_admin())
src/features/<domain>                 -> data access & business helpers (orders, rider, chat, admin, pricing, priority, locations)
src/components/{shared,landing,layout,ui} -> UI only
```
The browser talks to Supabase directly with the **publishable key** through `@/integrations/supabase/client`. Every protected read or write is enforced in the database: RLS policies plus `SECURITY DEFINER` functions (`accept_order`, `update_order_status`, `update_order_priority`, `admin_*`). Their EXECUTE permission is revoked from `anon` and granted only to `authenticated`. Hiding a button in the UI is never what keeps data safe.

## Database
Tables: `profiles`, `user_roles`, `rider_profiles`, `orders`, `order_status_events`, `messages`, `service_areas`, `pricing_rules`.
- Prices come from `pricing_rules` and are calculated in the database. Clients cannot write fare columns.
- `accept_order` takes a per-rider advisory lock, then runs `SELECT … FOR UPDATE` and a conditional `UPDATE … WHERE status='PENDING' AND rider_id IS NULL`. As a result, exactly one rider wins a given order, and a rider can hold only one active delivery at a time.
- `update_order_status` allows only the next step in the sequence, and only for the assigned rider. Each change is recorded in `order_status_events`.
- Customers and the assigned rider can only read chat messages after the order has a rider. They can only send messages while the delivery is active.

## Nearby pickup logic
`src/features/locations/haversine.ts` calculates the great-circle distance (R = 6371 km) from the rider's browser location to each pickup. No distances are hard-coded. Orders outside the chosen radius, or needing a different vehicle, are excluded. **Priority First** sorts URGENT > HIGH > NORMAL, and orders with the same priority are ordered by distance.

## Setup
1. `bun install`
2. Copy `.env.example` to `.env` and fill in your project URL and **publishable** key. Never use the service-role key in this app.
3. Supabase → SQL Editor: run the files in `supabase/migrations/` in name order. They are idempotent and mirror `drizzle/migrations` + `sql/`.
4. Auth → URL Configuration: set Site URL and Redirect URLs to your deployed domain and to `http://localhost:8080`.
5. To make someone an admin, run: `insert into user_roles(user_id, role) values ('<uuid>', 'admin');`
6. `bun run dev`. The app runs at http://localhost:8080.

## Deployment
Run `bun run build`. Deploy to any edge/Node host and set the `VITE_*` variables at build time. Location access in the browser requires HTTPS. Maps use OpenStreetMap tiles, which need no API key.

## Tests
`bunx vitest run` covers Haversine, chat rules, admin helpers and routing.
