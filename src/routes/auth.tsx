import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bike, Loader2, Package, Shield, Truck } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getUserRoleState } from "@/features/auth/roles";
import { cn } from "@/lib/utils";

type Search = { intent?: "customer" | "rider" | undefined; redirect?: string | undefined };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    intent: s["intent"] === "customer" || s["intent"] === "rider" ? s["intent"] : undefined,
    redirect:
      typeof s["redirect"] === "string" && s["redirect"].startsWith("/") && !s["redirect"].startsWith("//")
        ? s["redirect"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — LogiPulse" },
      { name: "description", content: "Sign in to LogiPulse to book, deliver and track within-city deliveries." },
      { property: "og:title", content: "Sign in — LogiPulse" },
      { property: "og:description", content: "Sign in to LogiPulse to book, deliver and track within-city deliveries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { intent, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [role, setRole] = useState<"customer" | "rider">(intent === "rider" ? "rider" : "customer");
  const [busy, setBusy] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState<"BIKE" | "CARGO">("BIKE");
  const [plate, setPlate] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigateAfterAuth = async (userId?: string) => {
    if (redirect) {
      navigate({ to: redirect as "/customer" });
      return;
    }

    // Resolve true database roles (admin > rider > customer)
    const roleState = await getUserRoleState(userId);

    if (roleState.isAdmin) {
      navigate({ to: "/admin" });
      return;
    }

    if (roleState.isRider) {
      navigate({ to: "/rider" });
      return;
    }

    // If new registration explicitly chose courier rider:
    if (role === "rider") {
      if (userId) {
        try {
          await supabase.rpc("register_rider", { p_vehicle: vehicle });
          if (plate.trim()) {
            await supabase.rpc("set_rider_plate", { p_plate: plate.trim() });
          }
        } catch {
          // ignore if already registered
        }
      }
      navigate({ to: "/rider" });
      return;
    }

    navigate({ to: "/customer" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    try {
      if (mode === "up") {
        if (!phone.trim()) {
          throw new Error("Phone number is required");
        }
        if (!/^\+?[0-9 -]{10,16}$/.test(phone.trim())) {
          throw new Error("Enter a valid phone number (e.g. 0300 1234567)");
        }

        const signupData: Record<string, string> = {
          full_name: name.trim(),
          phone: phone.trim(),
          role: role,
        };

        if (role === "rider") {
          signupData["vehicle_type"] = vehicle;
          if (plate.trim()) {
            signupData["plate_number"] = plate.trim();
          }
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + (role === "rider" ? "/rider" : "/customer"),
            data: signupData,
          },
        });

        if (error) throw error;

        if (data.session) {
          if (role === "rider") {
            try {
              await supabase.rpc("register_rider", { p_vehicle: vehicle });
              if (plate.trim()) {
                await supabase.rpc("set_rider_plate", { p_plate: plate.trim() });
              }
            } catch {
              // will be prompted by rider onboarding if needed
            }
          }
          toast.success(`Account created! Welcome to LogiPulse, ${name.split(" ")[0]}.`);
          await navigateAfterAuth(data.user?.id);
        } else {
          toast.success("Check your email to confirm your account, then sign in.");
          setMode("in");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Signed in successfully!");
        await navigateAfterAuth(data.user?.id);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth",
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error((err as Error).message ?? "Google sign-in failed");
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-surface px-6 py-10">
      <div className="glass animate-enter w-full max-w-md rounded-3xl p-8 shadow-soft">
        <Logo />

        <div className="mt-8 flex rounded-2xl border border-border bg-secondary/30 p-1">
          <button
            type="button"
            onClick={() => setRole("customer")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all",
              role === "customer" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Package className="size-3.5" /> Customer
          </button>
          <button
            type="button"
            onClick={() => setRole("rider")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all",
              role === "rider" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Bike className="size-3.5" /> Courier Rider
          </button>
        </div>

        <h1 className="mt-6 text-2xl font-bold">
          {mode === "in"
            ? "Welcome back"
            : role === "rider"
              ? "Join as a Courier Rider"
              : "Create Customer Account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {role === "rider"
            ? "Deliver parcels across Karachi and earn on every drop."
            : "Book same-city deliveries and track parcels in real time."}
        </p>

        <Button variant="glass" className="mt-6 w-full" onClick={google} type="button">
          Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "up" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Tariq Khan"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0300 1234567"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Used for delivery coordination and SMS updates.</p>
              </div>

              {role === "rider" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Vehicle type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setVehicle("BIKE")}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border p-3 text-left transition-colors",
                          vehicle === "BIKE" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                        )}
                      >
                        <Bike className="size-4 text-primary" />
                        <div>
                          <p className="text-xs font-semibold">Bike</p>
                          <p className="text-[10px] text-muted-foreground">Standard</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVehicle("CARGO")}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border p-3 text-left transition-colors",
                          vehicle === "CARGO" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
                        )}
                      >
                        <Truck className="size-4 text-primary" />
                        <div>
                          <p className="text-xs font-semibold">Cargo</p>
                          <p className="text-[10px] text-muted-foreground">Bulk / Care</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="plate">Vehicle plate number (optional)</Label>
                    <Input
                      id="plate"
                      placeholder="e.g. KHI-1234"
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.replace(/\s+/g, ""))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              placeholder="••••••••"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" variant="hero" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {mode === "in" ? "Sign in" : role === "rider" ? "Register as Rider" : "Create Account"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        <div className="mt-6 border-t border-border pt-4 text-center space-y-2">
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="size-3.5 text-primary" />
            <span>Staff or Administrator? Sign in above to enter the Dispatch Console.</span>
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setMode("in");
                setEmail("admin@tmms.pk");
                setPassword("Admin123!");
              }}
              className="rounded-lg border border-border bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              Fill Admin: admin@tmms.pk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
