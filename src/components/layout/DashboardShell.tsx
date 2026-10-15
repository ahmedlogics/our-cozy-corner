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
  to?:
    | "/customer"
    | "/customer/book"
    | "/customer/orders"
    | "/rider"
    | "/rider/jobs"
    | "/admin"
    | "/admin/orders"
    | "/admin/riders"
    | "/admin/customers"
    | "/admin/priority";
}

const navItemClass = (isActive: boolean) =>
  `relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-180 ${
    isActive
      ? "bg-[#087F75] text-white shadow-xs"
      : "text-slate-300 hover:bg-[#1D3550] hover:text-white"
  }`;

function SideNav({ items, role, onNav }: { items: NavItem[]; role: string; onNav?: () => void }) {
  return (
    <div className="flex h-full flex-col justify-between bg-[#14283F] p-5 text-white">
      <div>
        <div className="px-2 pt-1 pb-4">
          <Logo variant="light" to={role === "Rider" ? "/rider" : role === "Admin" ? "/admin" : "/customer"} />
        </div>

        <div className="mt-4 px-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#C9A56B]">
            {role} Portal
          </span>
        </div>

        <nav className="mt-3 flex flex-col gap-1.5" aria-label={`${role} navigation`}>
          {items.map((it) =>
            it.to ? (
              <Link
                key={it.label}
                to={it.to}
                onClick={onNav}
                activeOptions={{ exact: it.to === "/customer" || it.to === "/rider" || it.to === "/admin" }}
                className={navItemClass(!!it.active)}
              >
                {({ isActive }) => (
                  <span className={navItemClass(isActive || !!it.active)}>
                    <it.icon className="size-4 shrink-0" />
                    <span>{it.label}</span>
                  </span>
                )}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                className={navItemClass(!!it.active)}
              >
                <it.icon className="size-4 shrink-0" />
                <span>{it.label}</span>
              </button>
            )
          )}
        </nav>
      </div>

      <div className="border-t border-[#1F3A59] pt-4">
        <div className="flex items-center justify-between rounded-xl bg-[#0D1C2E] px-3 py-2 text-xs">
          <span className="text-slate-300 font-medium">Urban Logistics</span>
          <span className="rounded-md bg-[#087F75]/20 px-2 py-0.5 text-[10px] font-bold uppercase text-[#087F75]">
            Online
          </span>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({
  role,
  title,
  items,
  children,
}: {
  role: string;
  title: string;
  items: NavItem[];
  children: ReactNode;
}) {
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
    <div className="flex min-h-screen bg-[#F8F9F6] text-[#14283F]">
      {/* Desktop Deep Navy Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-[#1F3A59] bg-[#14283F] lg:block">
        <SideNav items={items} role={role} />
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-[#E5EAE7] bg-white/95 px-4 backdrop-blur-md md:px-8 shadow-xs">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden text-[#14283F]"
                  aria-label="Open navigation"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-r border-[#1F3A59] bg-[#14283F] p-0 text-white">
                <SheetTitle className="sr-only">{role} navigation</SheetTitle>
                <SideNav items={items} role={role} onNav={() => setOpen(false)} />
              </SheetContent>
            </Sheet>

            <h1 className="font-display text-lg font-bold tracking-tight text-[#14283F]">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-[#E5EAE7] bg-[#F8F9F6] px-3 py-1 text-xs font-semibold text-[#14283F] sm:inline-flex">
              <span className="size-2 rounded-full bg-[#087F75]" />
              {role}
            </span>

            {email ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-44 truncate text-xs font-medium text-[#617285] sm:inline">
                  {email}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={signOut}
                  className="text-xs font-semibold text-[#617285] hover:text-[#14283F]"
                >
                  <LogOut className="size-3.5 mr-1" />
                  <span>Sign out</span>
                </Button>
              </div>
            ) : (
              <Button asChild size="sm" variant="hero">
                <Link to="/auth">
                  <LogIn className="size-3.5 mr-1" />
                  <span>Sign in</span>
                </Link>
              </Button>
            )}
          </div>
        </header>

        {/* Dashboard Canvas */}
        <main className="animate-enter mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
