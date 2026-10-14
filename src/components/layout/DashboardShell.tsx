import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, LogIn, LogOut, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  to?: "/customer" | "/customer/book" | "/customer/orders" | "/rider" | "/rider/jobs" | "/admin" | "/admin/orders" | "/admin/riders" | "/admin/customers" | "/admin/priority";
}

const itemCls = "press relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-primary before:absolute before:left-0 before:top-1/2 before:h-0 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary before:transition-all before:duration-300 aria-[current=page]:before:h-5";

function SideNav({ items, role, onNav }: { items: NavItem[]; role: string; onNav?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <Logo />
      <p className="px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{role}</p>
      <nav className="flex flex-col gap-1" aria-label={`${role} navigation`}>
        {items.map((it) =>
          it.to ? (
            <Link
              key={it.label}
              to={it.to}
              onClick={onNav}
              activeOptions={{ exact: true }}
              activeProps={{ "aria-current": "page" }}
              aria-current={it.active ? "page" : undefined}
              className={itemCls}
            >
              <it.icon className="size-4" /> {it.label}
            </Link>
          ) : (
            <button key={it.label} type="button" aria-current={it.active ? "page" : undefined} className={itemCls}>
              <it.icon className="size-4" /> {it.label}
            </button>
          ),
        )}
      </nav>
      <div className="mt-auto border-t border-sidebar-border pt-4">
        <div className="flex items-center justify-between px-2 text-[11px] text-muted-foreground">
          <span>Karachi Express</span>
          <span className="rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[10px] uppercase">{role}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({ role, title, items, children }: { role: string; title: string; items: NavItem[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <SideNav items={items} role={role} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"><Menu /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
                <SheetTitle className="sr-only">{role} navigation</SheetTitle>
                <SideNav items={items} role={role} onNav={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
              <span className="size-2 rounded-full bg-primary" />
              {role} Portal
            </span>
            {email ? (
              <>
                <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">{email}</span>
                <Button size="sm" variant="ghost" onClick={signOut}><LogOut /> Sign out</Button>
              </>
            ) : (
              <Button asChild size="sm" variant="hero"><Link to="/auth"><LogIn /> Sign in</Link></Button>
            )}
          </div>
        </header>
        <main className="animate-enter mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
