import { 
  useGetAdminDashboardSummary, 
  useGetAdminDashboardToday, 
  useGetAdminFleetSnapshot,
  type AdminBookingRow
} from "@workspace/api-client-react";
import { formatMoney, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  CalendarClock, Car, ArrowRightLeft, CreditCard, 
  PlayCircle, CheckCircle2, Flag, RotateCcw, 
  XCircle, UserX, AlertCircle 
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    CONFIRMED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    DELIVERED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    RETURNED: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    CANCELED: "bg-red-500/10 text-red-500 border-red-500/20",
    NO_SHOW: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  };
  return (
    <Badge 
      variant="outline" 
      className={cn("font-bold tracking-wider text-[10px] uppercase shadow-sm", colors[status] || "bg-gray-500/10 text-gray-500")}
    >
      {status.replace('_', ' ')}
    </Badge>
  );
}

function StatCard({ title, value, icon: Icon, testId, isLoading }: { title: string, value: string | number | undefined, icon: any, testId: string, isLoading?: boolean }) {
  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm hover-elevate transition-all overflow-hidden relative group" data-testid={testId}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary/10 transition-colors" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
        <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        <div className="w-8 h-8 rounded-lg bg-background/80 flex items-center justify-center border border-border/50 shadow-inner">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="relative z-10 pt-2">
        {isLoading ? (
          <Skeleton className="h-8 w-20 mt-1 rounded-md" />
        ) : (
          <div className="text-2xl font-bold font-display tracking-tight text-foreground">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

function FleetTile({ label, count, colorClass, testId, isLoading }: { label: string, count: number | undefined, colorClass: string, testId: string, isLoading: boolean }) {
  return (
    <Card className={cn("overflow-hidden border shadow-sm hover-elevate transition-all", colorClass)} data-testid={testId}>
      <div className="p-5 flex flex-col items-center justify-center gap-2 relative">
        {isLoading ? (
          <Skeleton className="h-10 w-16 bg-current opacity-20 rounded-lg" />
        ) : (
          <div className="text-4xl font-black font-display tracking-tighter drop-shadow-sm">{count ?? 0}</div>
        )}
        <div className="text-[11px] font-bold uppercase tracking-widest opacity-90">{label}</div>
      </div>
    </Card>
  );
}

function ActivityTable({ title, bookings, isLoading, emptyMessage }: { title: string, bookings?: AdminBookingRow[], isLoading: boolean, emptyMessage: string }) {
  return (
    <Card className="flex flex-col h-full border-border/40 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border/40 py-4 bg-background/50">
        <CardTitle className="text-base font-bold flex items-center gap-3 font-display">
          {title}
          <Badge variant="secondary" className="bg-primary text-primary-foreground font-bold rounded-md px-2">
            {bookings?.length || 0}
          </Badge>
        </CardTitle>
      </CardHeader>
      <div className="flex-1 overflow-auto bg-card/30">
        <Table>
          <TableHeader className="bg-background/80 sticky top-0 backdrop-blur-xl z-10">
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="w-[80px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ref</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vehicle</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Route</TableHead>
              <TableHead className="w-[80px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time</TableHead>
              <TableHead className="text-right w-[110px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border/20 hover:bg-transparent">
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-6 w-20 ml-auto rounded-full" /></TableCell>
                </TableRow>
              ))
            ) : bookings?.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="text-center h-40">
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <CalendarClock className="w-8 h-8 opacity-20" />
                    <span className="text-sm font-medium">{emptyMessage}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              bookings?.map((b) => (
                <TableRow key={b.id} className="border-border/20 hover:bg-muted/30 transition-colors cursor-default">
                  <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                    #{b.id}
                  </TableCell>
                  <TableCell className="font-semibold text-sm text-foreground">
                    {b.customer?.fullName || b.customer?.email || "Unknown"}
                  </TableCell>
                  <TableCell>
                    {b.vehicle ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{b.vehicle.modelName}</span>
                        <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 bg-background border border-border/50 rounded inline-flex w-fit mt-1">
                          {b.vehicle.licensePlate}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span className="truncate max-w-[120px] text-foreground/80">{b.pickupLocation.name}</span>
                      <ArrowRightLeft className="w-3 h-3 flex-shrink-0 text-primary/50" />
                      <span className="truncate max-w-[120px] text-foreground/80">{b.dropoffLocation.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-bold text-foreground">
                    {new Date(title.includes("Pickup") ? b.pickupDatetime : b.dropoffDatetime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={b.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const reqOpts = { request: { credentials: "include" as const } };
  
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetAdminDashboardSummary(reqOpts);
  const { data: today, isLoading: isTodayLoading, isError: isTodayError } = useGetAdminDashboardToday(reqOpts);
  const { data: fleet, isLoading: isFleetLoading, isError: isFleetError } = useGetAdminFleetSnapshot(reqOpts);

  const hasError = isSummaryError || isTodayError || isFleetError;

  if (hasError) {
    return (
      <div className="p-6">
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="pt-6 flex items-center gap-4 text-destructive">
            <AlertCircle className="w-8 h-8" />
            <div>
              <h3 className="font-bold text-lg font-display">Data Fetch Error</h3>
              <p className="text-sm opacity-80">Unable to load dashboard data. Please check your connection or contact support.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      
      {/* Top Metrics */}
      <div>
        <h2 className="text-xl font-bold font-display tracking-tight mb-4 flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-primary" /> System Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          <StatCard title="Total" value={summary?.total} icon={CalendarClock} testId="stat-total" isLoading={isSummaryLoading} />
          <StatCard title="Revenue" value={formatMoney(summary?.totalRevenue)} icon={CreditCard} testId="stat-revenue" isLoading={isSummaryLoading} />
          <StatCard title="Pending" value={summary?.pending} icon={PlayCircle} testId="stat-pending" isLoading={isSummaryLoading} />
          <StatCard title="Confirmed" value={summary?.confirmed} icon={CheckCircle2} testId="stat-confirmed" isLoading={isSummaryLoading} />
          <StatCard title="Delivered" value={summary?.delivered} icon={Flag} testId="stat-delivered" isLoading={isSummaryLoading} />
          <StatCard title="Returned" value={summary?.returned} icon={RotateCcw} testId="stat-returned" isLoading={isSummaryLoading} />
          <StatCard title="Canceled" value={summary?.canceled} icon={XCircle} testId="stat-canceled" isLoading={isSummaryLoading} />
          <StatCard title="No Show" value={summary?.noShow} icon={UserX} testId="stat-noshow" isLoading={isSummaryLoading} />
        </div>
      </div>

      {/* Fleet Snapshot */}
      <div>
        <h2 className="text-xl font-bold font-display tracking-tight mb-4 flex items-center gap-2">
          <Car className="w-5 h-5 text-primary" /> Fleet Live Status
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <FleetTile label="Available" count={fleet?.available} colorClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5" testId="tile-available" isLoading={isFleetLoading} />
          <FleetTile label="Rented" count={fleet?.rented} colorClass="bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-blue-500/5" testId="tile-rented" isLoading={isFleetLoading} />
          <FleetTile label="Maintenance" count={fleet?.maintenance} colorClass="bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-orange-500/5" testId="tile-maintenance" isLoading={isFleetLoading} />
          <FleetTile label="Reserved" count={fleet?.reserved} colorClass="bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-purple-500/5" testId="tile-reserved" isLoading={isFleetLoading} />
          <FleetTile label="Inactive" count={fleet?.inactive} colorClass="bg-slate-500/10 text-slate-400 border-slate-500/20 shadow-slate-500/5" testId="tile-inactive" isLoading={isFleetLoading} />
        </div>
      </div>

      {/* Activity Tables */}
      <div>
        <h2 className="text-xl font-bold font-display tracking-tight mb-4 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-primary" /> Today's Operations
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[500px]">
          <ActivityTable 
            title="Today's Pickups" 
            bookings={today?.pickups} 
            isLoading={isTodayLoading} 
            emptyMessage="No pickups scheduled for today." 
          />
          <ActivityTable 
            title="Today's Dropoffs" 
            bookings={today?.dropoffs} 
            isLoading={isTodayLoading} 
            emptyMessage="No dropoffs expected today." 
          />
        </div>
      </div>
      
    </div>
  );
}
