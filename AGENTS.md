<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Feature logic lives in `src/features/<domain>` (auth, customer, rider, orders, locations, pricing, priority, chat, admin); UI in `src/components/{shared,landing,layout,ui}` — keeps UI separate from services/DB.
- Supabase (user's own external project) is the only database; never add Lovable Cloud or mock data.
- Dashboard routes share `DashboardShell`; avoid scroll effects on dashboards (performance).
- Database changes ship as idempotent SQL files in `sql/` that the owner runs in their Supabase SQL editor — `drizzle/migrations` is read-only and no migration tool reaches the external project.
