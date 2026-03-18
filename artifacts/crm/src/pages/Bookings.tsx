import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminBookings,
  useUpdateAdminBookingStatus,
} from "@workspace/api-client-react";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, CalendarDays, ArrowRightLeft, CreditCard } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

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
    <Badge variant="outline" className={`font-bold tracking-wider text-[10px] uppercase shadow-sm ${colors[status] || "bg-gray-500/10 text-gray-500"}`}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    UNPAID: "bg-red-500/10 text-red-500 border-red-500/20",
    PARTIAL: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    PAID: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    REFUNDED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] uppercase ${colors[status] || "bg-gray-500/10 text-gray-500"}`}>
      {status}
    </Badge>
  );
}

export default function BookingsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const reqOpts = { request: { credentials: "include" as const } };
  const queryParams: any = { page, limit: 10 };
  if (search) queryParams.search = search;
  if (statusFilter !== "ALL") queryParams.status = statusFilter;
  
  const { data, isLoading } = useListAdminBookings(queryParams, reqOpts);
  const statusMutation = useUpdateAdminBookingStatus(reqOpts);

  const bookings = data?.data || [];

  const handleStatusChange = (id: number, newStatus: any) => {
    statusMutation.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Status Updated", description: `Booking #${id} status changed to ${newStatus}` });
          queryClient.invalidateQueries();
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" /> Bookings
          </h2>
          <p className="text-muted-foreground">Manage reservations, deliveries, and returns</p>
        </div>
        <Button className="shadow-sm hover-elevate">
          <Plus className="w-4 h-4 mr-2" /> New Booking
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="p-4 border-b border-border/40 bg-background/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search by ID or customer..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="DELIVERED">Delivered (Active)</SelectItem>
                <SelectItem value="RETURNED">Returned (Completed)</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="w-[80px]">Ref</TableHead>
                <TableHead>Client & Vehicle</TableHead>
                <TableHead>Route & Schedule</TableHead>
                <TableHead>Financials</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40 mb-2" />
                      <Skeleton className="h-3 w-48" />
                    </TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : bookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                    <CalendarDays className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No bookings found matching criteria
                  </TableCell>
                </TableRow>
              ) : (
                bookings.map((b: any) => (
                  <TableRow key={b.id} className="border-border/20 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs font-medium text-muted-foreground align-top pt-4">
                      #{b.id}
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <div className="font-semibold text-foreground mb-1">
                        {b.customer?.fullName || b.contactFullName || "Unknown"}
                      </div>
                      {b.vehicle ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{b.vehicle.modelName}</span>
                          <span className="font-mono px-1.5 py-0.5 bg-background border border-border/50 rounded inline-flex">
                            {b.vehicle.licensePlate}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Unassigned Vehicle</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <div className="flex flex-col gap-2 text-sm">
                        <div className="flex items-start gap-2">
                          <div className="w-16 text-xs font-semibold text-muted-foreground uppercase pt-0.5">Pick-up</div>
                          <div>
                            <div className="font-medium">{format(new Date(b.pickupDatetime), "MMM d, yyyy • HH:mm")}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{b.pickupLocation?.name}</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-16 text-xs font-semibold text-muted-foreground uppercase pt-0.5">Drop-off</div>
                          <div>
                            <div className="font-medium">{format(new Date(b.dropoffDatetime), "MMM d, yyyy • HH:mm")}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{b.dropoffLocation?.name}</div>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <div className="font-mono font-bold text-base mb-1">
                        {formatMoney(b.totalAmount)}
                      </div>
                      <PaymentBadge status={b.paymentStatus} />
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <Select 
                        value={b.status} 
                        onValueChange={(val) => handleStatusChange(b.id, val)}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs font-bold uppercase">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDING" className="text-xs font-bold text-amber-500">PENDING</SelectItem>
                          <SelectItem value="CONFIRMED" className="text-xs font-bold text-blue-500">CONFIRMED</SelectItem>
                          <SelectItem value="DELIVERED" className="text-xs font-bold text-emerald-500">DELIVERED</SelectItem>
                          <SelectItem value="RETURNED" className="text-xs font-bold text-slate-400">RETURNED</SelectItem>
                          <SelectItem value="CANCELED" className="text-xs font-bold text-red-500">CANCELED</SelectItem>
                          <SelectItem value="NO_SHOW" className="text-xs font-bold text-orange-500">NO SHOW</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
