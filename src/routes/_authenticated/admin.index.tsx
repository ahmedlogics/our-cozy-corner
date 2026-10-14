import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowUp, Bike, CheckCircle2, Clock, Minus, Package, Users, Truck, DollarSign, Save } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashCard, ErrorState } from "@/components/shared/States";
import { AdminTableSkeleton, StatCard } from "@/components/shared/AdminBits";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminNav, adminStatsQuery, pricingRulesQuery, updatePricingRule } from "@/features/admin/admin";
import { useOrdersRealtime } from "@/features/orders/realtime";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin overview — LogiPulse" },
      { name: "description", content: "Live delivery metrics computed from real LogiPulse orders." },
      { property: "og:title", content: "Admin overview — LogiPulse" },
      { property: "og:description", content: "Live delivery metrics computed from real LogiPulse orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Overview,
});

function PricingRulesEditor() {
  const qc = useQueryClient();
  const q = useQuery(pricingRulesQuery);
  const [bikeBase, setBikeBase] = useState("100");
  const [bikePerKm, setBikePerKm] = useState("25");
  const [bikeCare, setBikeCare] = useState("50");

  const [cargoBase, setCargoBase] = useState("300");
  const [cargoPerKm, setCargoPerKm] = useState("50");
  const [cargoCare, setCargoCare] = useState("100");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data) {
      const bike = q.data.find((r) => r.vehicle_type === "BIKE");
      if (bike) {
        setBikeBase(String(bike.base_fare));
        setBikePerKm(String(bike.per_km_rate));
        setBikeCare(String(bike.care_fee));
      }
      const cargo = q.data.find((r) => r.vehicle_type === "CARGO");
      if (cargo) {
        setCargoBase(String(cargo.base_fare));
        setCargoPerKm(String(cargo.per_km_rate));
        setCargoCare(String(cargo.care_fee));
      }
    }
  }, [q.data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePricingRule({
        vehicle_type: "BIKE",
        base_fare: Number(bikeBase) || 100,
        per_km_rate: Number(bikePerKm) || 25,
        care_fee: Number(bikeCare) || 50,
      });
      await updatePricingRule({
        vehicle_type: "CARGO",
        base_fare: Number(cargoBase) || 300,
        per_km_rate: Number(cargoPerKm) || 50,
        care_fee: Number(cargoCare) || 100,
      });
      await qc.invalidateQueries({ queryKey: ["admin", "pricing_rules"] });
      toast.success("Pricing rules updated in Supabase!");
    } catch (err) {
      toast.error((err as Error).message || "Failed to update pricing rules");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard
      title="Pricing Rules Configuration"
      description="Manage active base rates, per-kilometer pricing, and handle with care fees for Bike and Cargo delivery in PKR."
    >
      <div className="grid gap-6 md:grid-cols-2 pt-2">
        {/* Bike Pricing */}
        <div className="rounded-xl border border-[#D9C5B2] bg-[#FAF6F0] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-[#B4532A] text-[#FAF6F0]">
              <Bike className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-[#2B211B]">Motorbike Delivery</p>
              <p className="text-[11px] text-[#7C6F64]">Small parcels, documents, express courier</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="space-y-1">
              <Label htmlFor="bike-base" className="text-[11px] font-semibold text-[#2B211B]">Base Fare (Rs)</Label>
              <Input
                id="bike-base"
                type="number"
                value={bikeBase}
                onChange={(e) => setBikeBase(e.target.value)}
                className="bg-white text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bike-km" className="text-[11px] font-semibold text-[#2B211B]">Rate/KM (Rs)</Label>
              <Input
                id="bike-km"
                type="number"
                value={bikePerKm}
                onChange={(e) => setBikePerKm(e.target.value)}
                className="bg-white text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bike-care" className="text-[11px] font-semibold text-[#2B211B]">Care Fee (Rs)</Label>
              <Input
                id="bike-care"
                type="number"
                value={bikeCare}
                onChange={(e) => setBikeCare(e.target.value)}
                className="bg-white text-xs h-8"
              />
            </div>
          </div>
        </div>

        {/* Cargo Pricing */}
        <div className="rounded-xl border border-[#D9C5B2] bg-[#FAF6F0] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-[#2B211B] text-[#FAF6F0]">
              <Truck className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-sm text-[#2B211B]">Cargo Delivery</p>
              <p className="text-[11px] text-[#7C6F64]">Heavy boxes, appliances, loader available (Rs. 100)</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="space-y-1">
              <Label htmlFor="cargo-base" className="text-[11px] font-semibold text-[#2B211B]">Base Fare (Rs)</Label>
              <Input
                id="cargo-base"
                type="number"
                value={cargoBase}
                onChange={(e) => setCargoBase(e.target.value)}
                className="bg-white text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cargo-km" className="text-[11px] font-semibold text-[#2B211B]">Rate/KM (Rs)</Label>
              <Input
                id="cargo-km"
                type="number"
                value={cargoPerKm}
                onChange={(e) => setCargoPerKm(e.target.value)}
                className="bg-white text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cargo-care" className="text-[11px] font-semibold text-[#2B211B]">Care Fee (Rs)</Label>
              <Input
                id="cargo-care"
                type="number"
                value={cargoCare}
                onChange={(e) => setCargoCare(e.target.value)}
                className="bg-white text-xs h-8"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#D9C5B2]/60 pt-3">
        <p className="text-xs text-[#7C6F64]">
          Updates will be stored in Supabase <code className="font-mono text-[#2B211B]">pricing_rules</code> table and take effect immediately.
        </p>
        <Button size="sm" variant="hero" onClick={handleSave} disabled={saving} className="text-xs">
          <Save className="size-3.5 mr-1.5" />
          {saving ? "Saving..." : "Save Pricing Rules"}
        </Button>
      </div>
    </DashCard>
  );
}

function Overview() {
  useOrdersRealtime([["admin"]]);
  const q = useQuery(adminStatsQuery);
  return (
    <DashboardShell role="Admin" title="Overview" items={adminNav("overview")}>
      {q.isLoading ? <AdminTableSkeleton rows={5} /> : q.isError || !q.data ? <ErrorState description={(q.error as Error)?.message ?? "Couldn't load stats"} /> : (() => {
        const s = q.data;
        return (
          <>
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Right now</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard index={0} label="Pending orders" value={s.pending} hint="Waiting for a rider" icon={Clock} tone="warning" />
                <StatCard index={1} label="Active deliveries" value={s.active} hint="Accepted, picked up or in transit" icon={Activity} />
                <StatCard index={2} label="Active riders" value={s.active_riders} hint={`of ${s.total_riders} registered`} icon={Bike} tone="success" />
                <StatCard index={3} label="Orders today" value={s.orders_today} icon={Package} />
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Open orders by priority</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard index={0} label="Normal" value={s.open_normal} hint={`${s.all_normal} all-time`} icon={Minus} />
                <StatCard index={1} label="High" value={s.open_high} hint={`${s.all_high} all-time`} icon={ArrowUp} tone="warning" />
                <StatCard index={2} label="Urgent" value={s.open_urgent} hint={`${s.all_urgent} all-time`} icon={AlertTriangle} tone="destructive" />
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">All-time</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard index={0} label="Total orders" value={s.total_orders} icon={Package} />
                <StatCard index={1} label="Delivered" value={s.delivered} icon={CheckCircle2} tone="success" />
                <StatCard index={2} label="Customers" value={s.total_customers} icon={Users} />
                <StatCard index={3} label="Riders" value={s.total_riders} icon={Bike} />
              </div>
            </section>
            
            {/* Administrator Pricing Rules Management */}
            <PricingRulesEditor />

            <DashCard title="Orders per day" description="Last 14 days">
              <ChartContainer config={{ orders: { label: "Orders", color: "var(--primary)" } }} className="h-64 w-full">
                <BarChart data={s.daily.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString("en-PK", { day: "numeric", month: "short" }) }))}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--color-orders)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </DashCard>
          </>
        );
      })()}
    </DashboardShell>
  );
}
