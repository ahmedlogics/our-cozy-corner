import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Bike, MapPin, MessageSquareLock, Radar, Radio, ShieldCheck, Zap, Menu, X, Package, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";
import { Magnetic, Reveal, useParallax } from "@/components/shared/motion";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#trust", label: "Why LogiPulse" },
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-300", scrolled ? "py-2" : "py-4")}>
      <nav className={cn("mx-auto flex max-w-6xl items-center justify-between rounded-full px-4 py-2 transition-all duration-300", scrolled && "glass shadow-soft")} aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">{n.label}</a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/auth" search={{ intent: "rider" }}>
              <Bike className="mr-1 size-4 text-primary" /> Become a rider
            </Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild variant="hero">
            <Link to="/auth" search={{ intent: "customer" }}>Book a delivery</Link>
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X /> : <Menu />}
        </Button>
      </nav>
      {open && (
        <div className="glass mx-4 mt-2 space-y-2 rounded-2xl p-4 md:hidden">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-secondary">{n.label}</a>
          ))}
          <div className="pt-2 border-t border-border flex flex-col gap-2">
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth" search={{ intent: "rider" }}>
                <Bike className="mr-2 size-4 text-primary" /> Become a rider
              </Link>
            </Button>
            <Button asChild variant="hero" className="w-full">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

function RouteVisual() {
  const y = useParallax(0.08);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md" style={{ transform: `translateY(${y}px)` }}>
      <div className="absolute inset-0 rounded-[2.5rem] glass grid-lines shadow-soft" />
      <svg viewBox="0 0 400 400" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <linearGradient id="route" x1="0" x2="1">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--primary-glow)" />
          </linearGradient>
        </defs>
        <path d="M70 320 C 120 220, 160 300, 210 200 S 300 120, 330 80" fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round" />
        <path d="M70 320 C 120 220, 160 300, 210 200 S 300 120, 330 80" fill="none" stroke="url(#route)" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 10" className="animate-dash" />
        <circle cx="70" cy="320" r="10" fill="var(--primary)" />
        <circle cx="70" cy="320" r="22" fill="var(--primary)" opacity="0.2" />
        <circle cx="330" cy="80" r="10" fill="var(--primary-glow)" />
        <circle r="7" fill="var(--foreground)">
          <animateMotion dur="5s" repeatCount="indefinite" path="M70 320 C 120 220, 160 300, 210 200 S 300 120, 330 80" />
        </circle>
      </svg>
      <div className="glass absolute -left-4 top-10 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-soft animate-float">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary"><Package className="size-4" /></span>
        <div className="text-sm"><p className="font-semibold">Pickup</p><p className="text-muted-foreground">Within your city</p></div>
      </div>
      <div className="glass absolute -right-4 bottom-12 rounded-2xl px-4 py-3 shadow-soft animate-float [animation-delay:1.5s]">
        <p className="mb-2 text-xs text-muted-foreground">Order priority</p>
        <div className="flex gap-1.5"><PriorityBadge priority="NORMAL" /><PriorityBadge priority="HIGH" /><PriorityBadge priority="URGENT" /></div>
      </div>
    </div>
  );
}

const JOURNEY = [
  { icon: Package, title: "Request" },
  { icon: Bike, title: "Rider accepts" },
  { icon: MapPin, title: "Pickup" },
  { icon: ShieldCheck, title: "Delivered" },
];

const STEPS = [
  { icon: MapPin, title: "Book your pickup", text: "Set pickup and drop-off inside the city, choose a priority and confirm." },
  { icon: Radar, title: "A nearby rider accepts", text: "Riders see orders ranked by distance and urgency, then accept the one that fits." },
  { icon: Navigation, title: "Follow every step", text: "Status moves from accepted to picked up to delivered — and you can chat the whole way." },
];

const FEATURES = [
  { icon: Radio, title: "Smart pickup discovery", text: "Distance-aware matching surfaces the closest, most urgent parcels to riders first." },
  { icon: Zap, title: "Live status updates", text: "A clear, honest timeline of each order — no simulated tracking." },
  { icon: MessageSquareLock, title: "Secure customer–rider chat", text: "A private conversation opens the moment a rider accepts your order." },
];

const TRUST = [
  { icon: ShieldCheck, title: "Role-based access", text: "Customers, riders and admins each see only what they should." },
  { icon: MapPin, title: "Built for the city", text: "Focused on within-city delivery, so every route stays short and predictable." },
  { icon: Bike, title: "Fair for riders", text: "Riders choose their jobs, with distance shown up front." },
];

export function Landing() {
  return (
    <div className="relative overflow-x-clip bg-gradient-surface">
      <Nav />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-36 md:grid-cols-[1.1fr_1fr] md:pt-44">
          <div>
            <Reveal>
              <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-primary shadow-glow" /> Same-city parcel delivery
              </span>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="mt-6 text-5xl font-bold leading-[1.05] md:text-7xl">
                Your city, <br /><span className="text-gradient">on a pulse.</span>
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="mt-6 max-w-lg text-lg text-muted-foreground">
                Book a parcel across town in seconds. Nearby riders pick it up fast, and you stay in touch until it lands at the door.
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="mt-10 flex flex-wrap gap-3">
                <Magnetic>
                  <Button asChild variant="hero" size="xl"><Link to="/auth" search={{ intent: "customer" }}>Book a delivery <ArrowRight /></Link></Button>
                </Magnetic>
                <Magnetic>
                  <Button asChild variant="glass" size="xl"><Link to="/auth" search={{ intent: "rider" }}><Bike /> Become a rider</Link></Button>
                </Magnetic>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Sign-in required to book or ride.</p>
            </Reveal>
          </div>
          <Reveal delay={200}><RouteVisual /></Reveal>
        </section>

        <section aria-label="Delivery journey" className="mx-auto max-w-6xl px-6">
          <Reveal>
            <div className="glass relative overflow-hidden rounded-3xl p-6 md:p-8">
              <div className="absolute inset-x-8 top-[3.25rem] hidden h-0.5 rounded-full bg-border md:block" aria-hidden>
                <div className="animate-story h-full rounded-full bg-gradient-signal" />
              </div>
              <ol className="relative grid gap-6 md:grid-cols-4">
                {JOURNEY.map((j, i) => (
                  <li key={j.title} className="flex items-start gap-3 md:flex-col md:items-center md:text-center">
                    <span className="lift grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-card text-primary" style={{ transitionDelay: `${i * 60}ms` }}><j.icon className="size-5" /></span>
                    <div><p className="text-xs text-muted-foreground">Step {i + 1}</p><p className="font-semibold">{j.title}</p></div>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <Reveal><h2 className="text-3xl font-bold md:text-5xl">Three steps. <span className="text-muted-foreground">Door to door.</span></h2></Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 120} className={cn(i === 1 && "md:translate-y-8")}>
                <article className="group h-full rounded-3xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow">
                  <div className="flex items-center justify-between">
                    <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110"><s.icon /></span>
                    <span className="font-display text-4xl font-bold text-muted">0{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-muted-foreground">{s.text}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <div className="grid gap-12 md:grid-cols-[1fr_1.4fr]">
            <Reveal>
              <h2 className="text-3xl font-bold md:text-5xl">Built for speed <span className="text-gradient">and clarity.</span></h2>
              <p className="mt-4 text-muted-foreground">Everything a short-haul delivery needs, and nothing it doesn't.</p>
            </Reveal>
            <div className="space-y-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 100}>
                  <article className="glass flex gap-5 rounded-3xl p-6 transition-colors hover:bg-secondary/60">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-signal text-primary-foreground"><f.icon /></span>
                    <div><h3 className="text-lg font-semibold">{f.title}</h3><p className="mt-1 text-muted-foreground">{f.text}</p></div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.5rem] border border-border bg-card p-8 md:p-14">
              <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl" aria-hidden />
              <h2 className="relative text-3xl font-bold md:text-4xl">Designed to be trusted.</h2>
              <div className="relative mt-10 grid gap-8 md:grid-cols-3">
                {TRUST.map((t) => (
                  <div key={t.title}><t.icon className="size-6 text-primary" /><h3 className="mt-3 font-semibold">{t.title}</h3><p className="mt-1 text-sm text-muted-foreground">{t.text}</p></div>
                ))}
              </div>
              <div className="relative mt-12 flex flex-wrap gap-3">
                <Button asChild variant="hero" size="lg"><Link to="/auth">Get started <ArrowRight /></Link></Button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <Logo />
          <nav className="flex flex-wrap gap-6 text-sm text-muted-foreground" aria-label="Footer">
            {NAV.map((n) => <a key={n.href} href={n.href} className="hover:text-foreground">{n.label}</a>)}
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
            <Link to="/admin" className="hover:text-foreground">Admin Console</Link>
          </nav>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} LogiPulse. Within-city delivery.</p>
        </div>
      </footer>
    </div>
  );
}
