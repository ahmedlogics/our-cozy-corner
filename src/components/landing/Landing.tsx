import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bike,
  CheckCircle2,
  Clock,
  Compass,
  Filter,
  Layers,
  MapPin,
  Menu,
  MessageSquare,
  Navigation,
  Package,
  Radio,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";
import { Reveal } from "@/components/shared/motion";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#technology", label: "Technology" },
  { href: "#priorities", label: "Priorities" },
  { href: "#chat", label: "Live Chat" },
  { href: "#tracking", label: "Tracking" },
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 16);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-300", scrolled ? "py-2.5" : "py-5")}>
      <nav
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-5 py-2.5 transition-all duration-300",
          scrolled
            ? "border border-[#E5EAE7] bg-white/95 backdrop-blur-md shadow-soft"
            : "border border-transparent bg-white/70 backdrop-blur-sm"
        )}
        aria-label="Main"
      >
        <Logo />

        <ul className="hidden items-center gap-1.5 md:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a
                href={n.href}
                className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[#617285] transition-colors hover:bg-[#E9F3EF] hover:text-[#14283F]"
              >
                {n.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2.5 md:flex">
          <Button asChild variant="ghost" size="sm" className="font-semibold text-[#14283F] hover:bg-[#E9F3EF]">
            <Link to="/auth" search={{ intent: "rider" }}>
              <Bike className="mr-1.5 size-4 text-[#087F75]" /> Become a Rider
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="font-semibold text-[#14283F] border-[#E5EAE7]">
            <Link to="/auth">Sign In</Link>
          </Button>
          <Button asChild variant="hero" size="sm">
            <Link to="/auth" search={{ intent: "customer" }}>
              <span>Book a Delivery</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-[#14283F]"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </nav>

      {/* Mobile Drawer */}
      {open && (
        <div className="mx-4 mt-2 space-y-2 rounded-2xl border border-[#E5EAE7] bg-white/95 backdrop-blur-xl p-5 shadow-elevated md:hidden">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3.5 py-2 text-sm font-semibold text-[#14283F] hover:bg-[#E9F3EF]"
            >
              {n.label}
            </a>
          ))}
          <div className="pt-3 border-t border-[#E5EAE7] flex flex-col gap-2">
            <Button asChild variant="outline" className="w-full justify-center">
              <Link to="/auth" search={{ intent: "rider" }}>
                <Bike className="mr-2 size-4 text-[#087F75]" /> Become a Rider
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-center">
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild variant="hero" className="w-full justify-center">
              <Link to="/auth" search={{ intent: "customer" }}>
                <span>Book a Delivery</span>
                <ArrowRight className="size-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

export function Landing() {
  return (
    <div className="relative min-h-screen bg-[#F8F9F6] text-[#14283F] selection:bg-[#087F75]/20 selection:text-[#087F75]">
      <Nav />

      <main>
        {/* ================================================================ */}
        {/* 1. HERO SECTION */}
        {/* ================================================================ */}
        <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-36 md:pb-28 md:pt-44">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Left Column: Editorial Headline & Actions */}
            <div>
              <Reveal>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#E5EAE7] bg-white px-3.5 py-1.5 shadow-xs">
                  <span className="size-2 rounded-full bg-[#087F75] animate-pulse" />
                  <span className="text-xs font-bold tracking-wider uppercase text-[#087F75]">
                    Smarter Within-City Delivery
                  </span>
                </div>
              </Reveal>

              <Reveal delay={100}>
                <h1 className="mt-6 font-display text-5xl font-extrabold tracking-tight text-[#14283F] sm:text-6xl md:text-[4.25rem] md:leading-[1.08]">
                  Your City. <br />
                  <span className="text-[#087F75]">Delivered Smarter.</span>
                </h1>
              </Reveal>

              <Reveal delay={200}>
                <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#617285]">
                  Book a parcel in minutes, connect with nearby riders, and follow every delivery from pickup to drop-off.
                </p>
              </Reveal>

              <Reveal delay={300}>
                <div className="mt-8 flex flex-wrap items-center gap-3.5">
                  <Button asChild variant="hero" size="xl">
                    <Link to="/auth" search={{ intent: "customer" }}>
                      <span>Book a Delivery</span>
                      <ArrowRight className="size-4 ml-1" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="xl" className="border-[#E5EAE7] bg-white hover:bg-[#E9F3EF]">
                    <Link to="/auth" search={{ intent: "rider" }}>
                      <Bike className="size-4 text-[#087F75] mr-1.5" />
                      <span>Become a Rider</span>
                    </Link>
                  </Button>
                </div>

                <div className="mt-8 flex items-center gap-4 text-xs font-semibold text-[#617285]">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-[#087F75]" /> Simple booking
                  </span>
                  <span className="size-1 rounded-full bg-[#E5EAE7]" />
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-[#087F75]" /> Connected delivery
                  </span>
                  <span className="size-1 rounded-full bg-[#E5EAE7]" />
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 text-[#087F75]" /> Clear progress
                  </span>
                </div>
              </Reveal>
            </div>

            {/* Right Column: Premium 3D Logistics Illustration with Floating Cards */}
            <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
              <Reveal delay={200}>
                <div className="relative rounded-3xl border border-[#E5EAE7] bg-white p-3 shadow-elevated">
                  {/* Subtle Background Glow */}
                  <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-[#087F75]/10 via-transparent to-[#C9A56B]/10 blur-2xl" />

                  {/* 3D Courier Illustration */}
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#F8F9F6]">
                    <img
                      src="/images/logipulse_hero_3d.jpg"
                      alt="LogiPulse 3D Courier and Logistics Delivery Route"
                      className="size-full object-cover"
                    />
                  </div>

                  {/* Floating UI Card 1: Rider Assigned */}
                  <div className="animate-float absolute -left-4 top-10 flex items-center gap-3 rounded-2xl border border-[#E5EAE7] bg-white/95 px-4 py-3 shadow-soft backdrop-blur-md">
                    <div className="grid size-9 place-items-center rounded-xl bg-[#087F75]/15 text-[#087F75]">
                      <Bike className="size-4.5" />
                    </div>
                    <div className="text-xs">
                      <p className="font-bold text-[#14283F]">Rider Assigned</p>
                      <p className="text-[#617285]">Tariq K. · 2.4 km away</p>
                    </div>
                  </div>

                  {/* Floating UI Card 2: In Transit ETA */}
                  <div className="animate-float-slow absolute -right-4 bottom-14 rounded-2xl border border-[#E5EAE7] bg-white/95 p-3.5 shadow-soft backdrop-blur-md">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#14283F]">
                      <span className="relative flex size-2.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#087F75] opacity-75" />
                        <span className="relative inline-flex size-2.5 rounded-full bg-[#087F75]" />
                      </span>
                      <span>In Transit · Active Route</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-block rounded-md bg-[#E9F3EF] px-2 py-0.5 text-[11px] font-bold text-[#087F75]">
                        Priority: High
                      </span>
                      <span className="text-[11px] text-[#617285]">ETA: ~18 mins</span>
                    </div>
                  </div>

                  {/* Floating UI Card 3: Pickup Confirmed */}
                  <div className="animate-float absolute -bottom-4 left-10 flex items-center gap-2 rounded-xl border border-[#E5EAE7] bg-white px-3 py-2 shadow-sm">
                    <CheckCircle2 className="size-4 text-[#16A34A]" />
                    <span className="text-xs font-semibold text-[#14283F]">Pickup Confirmed</span>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 2. STATS & TRUTH SECTION (Dark Ocean Navy #14283F) */}
        {/* ================================================================ */}
        <section className="mx-auto max-w-6xl px-6 py-8">
          <Reveal>
            <div className="overflow-hidden rounded-3xl bg-[#14283F] p-8 text-white shadow-elevated md:p-12">
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1 sm:border-r sm:border-white/10 sm:pr-6">
                  <span className="font-display text-4xl font-extrabold text-white md:text-5xl">3</span>
                  <p className="text-sm font-semibold text-[#C9A56B]">Connected Roles</p>
                  <p className="text-xs text-slate-300">Customer, Courier Rider & Operations Admin.</p>
                </div>

                <div className="space-y-1 sm:border-r sm:border-white/10 sm:pr-6">
                  <span className="font-display text-4xl font-extrabold text-white md:text-5xl">2</span>
                  <p className="text-sm font-semibold text-[#087F75]">Vehicle Categories</p>
                  <p className="text-xs text-slate-300">Fast Urban Bike & High-Capacity Cargo.</p>
                </div>

                <div className="space-y-1 sm:border-r sm:border-white/10 sm:pr-6">
                  <span className="font-display text-4xl font-extrabold text-white md:text-5xl">3</span>
                  <p className="text-sm font-semibold text-[#C9A56B]">Priority Levels</p>
                  <p className="text-xs text-slate-300">Normal, High & Urgent dispatch classification.</p>
                </div>

                <div className="space-y-1">
                  <span className="font-display text-4xl font-extrabold text-white md:text-5xl">1</span>
                  <p className="text-sm font-semibold text-[#087F75]">Unified Platform</p>
                  <p className="text-xs text-slate-300">Direct booking, atomic matching & real-time chat.</p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ================================================================ */}
        {/* 3. HOW IT WORKS SECTION */}
        {/* ================================================================ */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-24">
          <div className="text-center max-w-2xl mx-auto">
            <Reveal>
              <span className="text-xs font-bold tracking-wider uppercase text-[#087F75]">
                How LogiPulse Works
              </span>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#14283F] sm:text-4xl md:text-5xl">
                From Request to Delivery. <br className="hidden sm:block" />
                <span className="text-[#087F75]">Seamlessly.</span>
              </h2>
              <p className="mt-4 text-base text-[#617285]">
                One connected experience for every step of your delivery.
              </p>
            </Reveal>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              {
                num: "01",
                icon: MapPin,
                title: "Book Your Delivery",
                desc: "Choose your pickup, destination, and parcel details.",
                tag: "Search-first Booking",
              },
              {
                num: "02",
                icon: Radio,
                title: "Get Connected",
                desc: "An available nearby rider accepts your request.",
                tag: "Atomic Distance Matching",
              },
              {
                num: "03",
                icon: MessageSquare,
                title: "Follow the Journey",
                desc: "Chat with your rider and track each delivery milestone.",
                tag: "Milestones & Live Chat",
              },
            ].map((step, idx) => (
              <Reveal key={step.title} delay={idx * 120}>
                <div className="group relative flex h-full flex-col justify-between rounded-3xl border border-[#E5EAE7] bg-white p-8 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:border-[#087F75]/40 hover:shadow-elevated">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="grid size-12 place-items-center rounded-2xl bg-[#E9F3EF] text-[#087F75] transition-transform duration-300 group-hover:scale-110">
                        <step.icon className="size-6" />
                      </div>
                      <span className="font-display text-3xl font-black text-[#E5EAE7] group-hover:text-[#087F75]/30 transition-colors">
                        {step.num}
                      </span>
                    </div>

                    <h3 className="mt-7 font-display text-xl font-bold text-[#14283F]">
                      {step.title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-[#617285]">
                      {step.desc}
                    </p>
                  </div>

                  <div className="mt-8 pt-4 border-t border-[#E5EAE7]">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F75]">
                      <Sparkles className="size-3.5" />
                      <span>{step.tag}</span>
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ================================================================ */}
        {/* 4. SMART NEARBY PICKUP TECHNOLOGY */}
        {/* ================================================================ */}
        <section id="technology" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <Reveal>
                <span className="text-xs font-bold tracking-wider uppercase text-[#087F75]">
                  Smart Pickup Technology
                </span>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#14283F] sm:text-4xl">
                  The Right Pickup. <br />
                  <span className="text-[#087F75]">The Right Distance.</span>
                </h2>
                <p className="mt-4 text-base leading-relaxed text-[#617285]">
                  Riders discover available requests using calculated pickup distances, vehicle compatibility, and customizable filters.
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    {
                      icon: Compass,
                      title: "Location-based order discovery",
                      text: "Calculates precise Haversine distance from the courier's live location to each pickup pin.",
                    },
                    {
                      icon: Filter,
                      title: "Distance-radius filtering",
                      text: "Riders adjust range from 1 km to 20 km to discover orders within their immediate zone.",
                    },
                    {
                      icon: Layers,
                      title: "Nearest-first sorting",
                      text: "Orders can be arranged by shortest pickup travel or highest urgency to maximize efficiency.",
                    },
                  ].map((f) => (
                    <div key={f.title} className="flex gap-4 rounded-2xl border border-[#E5EAE7] bg-white p-4.5 shadow-xs">
                      <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-[#E9F3EF] text-[#087F75]">
                        <f.icon className="size-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[#14283F]">{f.title}</h4>
                        <p className="mt-1 text-xs leading-relaxed text-[#617285]">{f.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Right: 3D Bike & Cargo Visual */}
            <Reveal delay={200}>
              <div className="relative rounded-3xl border border-[#E5EAE7] bg-white p-4 shadow-elevated">
                <div className="relative overflow-hidden rounded-2xl bg-[#F8F9F6]">
                  <img
                    src="/images/logipulse_bike_cargo_3d.jpg"
                    alt="Courier Bike and Cargo Logistics"
                    className="size-full object-cover"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[#E9F3EF] px-2.5 py-1 text-xs font-bold text-[#087F75]">
                      <Bike className="size-3.5" /> Bike Fleet
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[#E9F3EF] px-2.5 py-1 text-xs font-bold text-[#087F75]">
                      <Truck className="size-3.5" /> Cargo Couriers
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[#617285]">
                    Strict vehicle matching enforced
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 5. PRIORITY DELIVERY SECTION */}
        {/* ================================================================ */}
        <section id="priorities" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <Reveal>
              <span className="text-xs font-bold tracking-wider uppercase text-[#087F75]">
                Operational Priorities
              </span>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#14283F] sm:text-4xl">
                Every Delivery Has Its Priority.
              </h2>
              <p className="mt-4 text-base text-[#617285]">
                Normal, High, and Urgent priorities help riders make informed decisions and administrators coordinate delivery operations.
              </p>
            </Reveal>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                priority: "NORMAL" as const,
                title: "Normal Priority",
                desc: "Standard city deliveries with balanced routing and competitive base fares.",
                badge: "Standard Queue",
                border: "border-[#E5EAE7]",
                bg: "bg-white",
              },
              {
                priority: "HIGH" as const,
                title: "High Priority",
                desc: "Time-sensitive packages, important documents, and priority pickup dispatch.",
                badge: "Accelerated Pickup",
                border: "border-amber-200",
                bg: "bg-amber-50/20",
              },
              {
                priority: "URGENT" as const,
                title: "Urgent Priority",
                desc: "Critical rush deliveries highlighted in top rider dispatch queues.",
                badge: "Immediate Dispatch",
                border: "border-rose-200",
                bg: "bg-rose-50/20",
              },
            ].map((p, idx) => (
              <Reveal key={p.title} delay={idx * 100}>
                <div
                  className={cn(
                    "relative flex h-full flex-col justify-between rounded-3xl border p-7 shadow-soft transition-all duration-300 hover:shadow-elevated",
                    p.border,
                    p.bg
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <PriorityBadge priority={p.priority} />
                      <span className="text-xs font-bold text-[#617285]">{p.badge}</span>
                    </div>
                    <h3 className="mt-5 font-display text-xl font-bold text-[#14283F]">{p.title}</h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-[#617285]">{p.desc}</p>
                  </div>

                  <div className="mt-8 flex items-center justify-between border-t border-[#E5EAE7]/70 pt-4 text-xs font-semibold text-[#14283F]">
                    <span>Courier dispatch queue</span>
                    <span className="text-[#087F75]">Active priority</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ================================================================ */}
        {/* 6. CUSTOMER–RIDER CHAT & LIVE TRACKING */}
        {/* ================================================================ */}
        <section id="chat" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <Reveal>
              <span className="text-xs font-bold tracking-wider uppercase text-[#087F75]">
                Direct Communication
              </span>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#14283F] sm:text-4xl">
                Connected from the Moment You Accept.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#617285]">
                Once a rider accepts a delivery, direct order-specific communication becomes available.
              </p>

              <div className="mt-8 space-y-3.5">
                {[
                  "Private order-scoped chat room created upon rider assignment",
                  "Fast pre-configured quick replies for instant updates",
                  "Automated read receipts and real-time Supabase message sync",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="grid size-6 place-items-center rounded-full bg-[#E9F3EF] text-[#087F75]">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <span className="text-sm font-semibold text-[#14283F]">{item}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Chat UI Preview Mockup */}
            <Reveal delay={200}>
              <div className="rounded-3xl border border-[#E5EAE7] bg-white p-5 shadow-elevated">
                <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 place-items-center rounded-xl bg-[#087F75] text-white">
                      <Bike className="size-4.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#14283F]">Tariq K. (Courier Partner)</p>
                      <p className="text-[11px] text-[#087F75] font-semibold flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-[#087F75]" /> Active delivery chat
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#617285]">#LP-9821</span>
                </div>

                <div className="my-4 space-y-3 py-2">
                  <div className="flex justify-start">
                    <div className="max-w-[78%] rounded-2xl rounded-tl-xs bg-[#E9F3EF] px-4 py-2.5 text-xs text-[#14283F]">
                      <p className="font-medium">Assalam-o-Alaikum! I have arrived at the pickup location outside your gate.</p>
                      <span className="mt-1 block text-[10px] text-[#617285]">10:24 AM</span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div className="max-w-[78%] rounded-2xl rounded-tr-xs bg-[#087F75] px-4 py-2.5 text-xs text-white">
                      <p className="font-medium">Great, sending my brother down with the sealed parcel now!</p>
                      <span className="mt-1 block text-right text-[10px] text-white/70">10:25 AM</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-1.5 pt-2 border-t border-[#E5EAE7]">
                  <span className="rounded-lg bg-[#F8F9F6] border border-[#E5EAE7] px-2.5 py-1 text-[11px] font-medium text-[#617285]">
                    Parcel is ready
                  </span>
                  <span className="rounded-lg bg-[#F8F9F6] border border-[#E5EAE7] px-2.5 py-1 text-[11px] font-medium text-[#617285]">
                    Please call upon arrival
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 7. TRACKING & ADMIN CONSOLE SECTION */}
        {/* ================================================================ */}
        <section id="tracking" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-20">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Tracking Card */}
            <Reveal>
              <div className="flex h-full flex-col justify-between rounded-3xl border border-[#E5EAE7] bg-white p-8 shadow-soft">
                <div>
                  <span className="text-xs font-bold tracking-wider uppercase text-[#087F75]">
                    Connected Order Tracking
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-bold text-[#14283F] sm:text-3xl">
                    Every Step, Clearly Tracked.
                  </h3>
                  <p className="mt-3 text-sm text-[#617285] leading-relaxed">
                    Follow your order from acceptance and pickup to transit and successful delivery.
                  </p>

                  <div className="mt-8 space-y-4">
                    {[
                      { step: "Order Accepted", sub: "Courier partner assigned to pickup", done: true },
                      { step: "Parcel Picked Up", sub: "Verified and secured by courier", done: true },
                      { step: "In Transit", sub: "Moving along designated urban route", done: true },
                      { step: "Delivered", sub: "Package received and finalized", done: false },
                    ].map((s, i) => (
                      <div key={s.step} className="flex items-start gap-3">
                        <div
                          className={cn(
                            "mt-0.5 grid size-6 place-items-center rounded-full text-xs font-bold",
                            s.done ? "bg-[#087F75] text-white" : "border-2 border-[#E5EAE7] text-[#617285]"
                          )}
                        >
                          {s.done ? <CheckCircle2 className="size-3.5" /> : i + 1}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#14283F]">{s.step}</p>
                          <p className="text-[11px] text-[#617285]">{s.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-[#E5EAE7]">
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link to="/auth" search={{ intent: "customer" }}>
                      <span>Track an Order in Customer Portal</span>
                      <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>

            {/* Admin Console Card */}
            <Reveal delay={150}>
              <div className="flex h-full flex-col justify-between rounded-3xl border border-[#1F3A59] bg-[#14283F] p-8 text-white shadow-elevated">
                <div>
                  <span className="text-xs font-bold tracking-wider uppercase text-[#087F75]">
                    Operations Management
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-bold text-white sm:text-3xl">
                    One Clear View of Every Delivery.
                  </h3>
                  <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                    Monitor orders, manage priorities, and oversee delivery operations from one connected dashboard.
                  </p>

                  <div className="mt-8 grid grid-cols-2 gap-3 text-left">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <span className="text-xs text-slate-400">Live Orders</span>
                      <p className="mt-1 font-display text-2xl font-bold text-white">Active Queue</p>
                      <p className="text-[11px] text-[#087F75] font-semibold mt-1">Real-time status events</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <span className="text-xs text-slate-400">Courier Fleet</span>
                      <p className="mt-1 font-display text-2xl font-bold text-white">Rider Registry</p>
                      <p className="text-[11px] text-[#C9A56B] font-semibold mt-1">Account & role controls</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-white/10">
                  <Button asChild variant="hero" size="sm" className="w-full bg-[#087F75] hover:bg-[#066B63]">
                    <Link to="/admin">
                      <span>Access Operations Console</span>
                      <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 8. FINAL CTA SECTION */}
        {/* ================================================================ */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.5rem] border border-[#E5EAE7] bg-white p-10 text-center shadow-elevated md:p-16">
              {/* Subtle Ambient Orbs */}
              <div className="absolute -left-20 -top-20 size-60 rounded-full bg-[#087F75]/8 blur-3xl" />
              <div className="absolute -right-20 -bottom-20 size-60 rounded-full bg-[#C9A56B]/10 blur-3xl" />

              <span className="text-xs font-bold tracking-wider uppercase text-[#087F75]">
                Fast Urban Logistics
              </span>
              <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-[#14283F] sm:text-4xl md:text-5xl">
                Ready to Move Something?
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-base text-[#617285]">
                Your next delivery starts with a few simple steps.
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-3.5">
                <Button asChild variant="hero" size="xl">
                  <Link to="/auth" search={{ intent: "customer" }}>
                    <span>Book Your Delivery</span>
                    <ArrowRight className="size-4 ml-1.5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="xl" className="border-[#E5EAE7] bg-white hover:bg-[#E9F3EF]">
                  <Link to="/auth" search={{ intent: "rider" }}>
                    <Bike className="size-4 text-[#087F75] mr-1.5" />
                    <span>Join as a Rider</span>
                  </Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ================================================================ */}
      {/* 9. FOOTER (Deep Ocean Navy #14283F) */}
      {/* ================================================================ */}
      <footer className="border-t border-[#1C3552] bg-[#14283F] text-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <Logo variant="light" />

            <nav className="flex flex-wrap gap-6 text-sm font-medium text-slate-300" aria-label="Footer">
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="hover:text-white transition-colors">
                  {n.label}
                </a>
              ))}
              <Link to="/auth" className="hover:text-white transition-colors">
                Sign In
              </Link>
              <Link to="/admin" className="text-[#C9A56B] hover:text-[#E2C38C] transition-colors font-semibold">
                Admin Console
              </Link>
            </nav>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-slate-400 sm:flex-row">
            <p>© {new Date().getFullYear()} LogiPulse. Smarter within-city delivery.</p>
            <p className="text-slate-400">Urban courier and connected logistics platform.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
