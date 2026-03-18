import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageOpen, CalendarDays, Car, Users, MapPin, BadgeDollarSign, Tag } from "lucide-react";

function Placeholder({ title, description, icon: Icon }: { title: string, description: string, icon: any }) {
  return (
    <div className="h-[75vh] flex items-center justify-center animate-in fade-in duration-500">
      <Card className="w-full max-w-md border-dashed border-border/60 bg-card/30 backdrop-blur-sm shadow-none text-center p-8 hover-elevate transition-all">
        <CardHeader className="flex flex-col items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-inner">
            <Icon className="w-10 h-10 text-primary" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold font-display tracking-tight">{title}</CardTitle>
            <CardDescription className="text-base font-medium">{description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}

export function BookingsPage() { return <Placeholder title="Bookings" description="Full booking management and timeline view coming in Phase 2." icon={CalendarDays} />; }
export function FleetPage() { return <Placeholder title="Fleet" description="Vehicle inventory, brand and model management coming in Phase 2." icon={Car} />; }
export function CustomersPage() { return <Placeholder title="Customers" description="Customer profiles and rental history coming in Phase 2." icon={Users} />; }
export function LocationsPage() { return <Placeholder title="Locations" description="Branch and meet & greet location management coming in Phase 2." icon={MapPin} />; }
export function ExtrasPage() { return <Placeholder title="Extras" description="Additional equipment pricing and availability coming in Phase 2." icon={PackageOpen} />; }
export function RatesPage() { return <Placeholder title="Rates & Tiers" description="Dynamic pricing models and seasonal rates coming in Phase 2." icon={BadgeDollarSign} />; }
export function PromotionsPage() { return <Placeholder title="Promotions" description="Discount codes and marketing campaigns coming in Phase 2." icon={Tag} />; }
