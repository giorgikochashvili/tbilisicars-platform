import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Car,
  Calendar,
  Wrench,
  Users,
  UserCog,
  Shield,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AuditRow {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  entity_type: string;
  entity_id: number;
  entity_ref: string | null;
  action: string;
  summary: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

interface AuditResponse {
  total: number;
  rows: AuditRow[];
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  booking: "Booking",
  payment: "Payment",
  service: "Service",
  customer: "Customer",
  vehicle: "Vehicle",
  team_member: "Team Member",
};

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  status_changed: "Status Changed",
  payment_added: "Payment Added",
  payment_deleted: "Payment Deleted",
  deposit_received: "Deposit Received",
  deposit_returned: "Deposit Returned",
  refund_added: "Refund Added",
};

const ENTITY_COLORS: Record<string, string> = {
  booking: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  payment: "bg-green-500/10 text-green-400 border-green-500/20",
  service: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  customer: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  vehicle: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  team_member: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const ACTION_COLORS: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  updated: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  deleted: "bg-red-500/10 text-red-400 border-red-500/20",
  status_changed: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  payment_added: "bg-green-500/10 text-green-400 border-green-500/20",
  payment_deleted: "bg-red-500/10 text-red-400 border-red-500/20",
  deposit_received: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  deposit_returned: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  refund_added: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const EntityIcon = ({ type }: { type: string }) => {
  const cls = "w-3.5 h-3.5";
  switch (type) {
    case "booking": return <Calendar className={cls} />;
    case "payment": return <CreditCard className={cls} />;
    case "vehicle": return <Car className={cls} />;
    case "service": return <Wrench className={cls} />;
    case "customer": return <Users className={cls} />;
    case "team_member": return <UserCog className={cls} />;
    default: return <Shield className={cls} />;
  }
};

const LIMIT = 50;

export default function AuditLogs() {
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [entityRefSearch, setEntityRefSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  function resetPage() { setPage(0); }

  const params = new URLSearchParams();
  if (entityType && entityType !== "all") params.set("entityType", entityType);
  if (action && action !== "all") params.set("action", action);
  if (entityRefSearch.trim()) params.set("entityRef", entityRefSearch.trim());
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  params.set("limit", String(LIMIT));
  params.set("offset", String(page * LIMIT));

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ["audit-logs", entityType, action, entityRefSearch, dateFrom, dateTo, page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit-logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load audit logs");
      return res.json();
    },
    staleTime: 10_000,
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground text-sm">
            Internal activity log — who did what and when
          </p>
        </div>
        {data && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {data.total.toLocaleString()} entries
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end bg-card/60 border border-border/40 rounded-xl p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Filters</span>
        </div>

        {/* Entity Type */}
        <Select value={entityType} onValueChange={(v) => { setEntityType(v); resetPage(); }}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="booking">Booking</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="vehicle">Vehicle</SelectItem>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="team_member">Team Member</SelectItem>
          </SelectContent>
        </Select>

        {/* Action */}
        <Select value={action} onValueChange={(v) => { setAction(v); resetPage(); }}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
            <SelectItem value="status_changed">Status Changed</SelectItem>
            <SelectItem value="payment_added">Payment Added</SelectItem>
            <SelectItem value="payment_deleted">Payment Deleted</SelectItem>
            <SelectItem value="deposit_received">Deposit Received</SelectItem>
            <SelectItem value="deposit_returned">Deposit Returned</SelectItem>
            <SelectItem value="refund_added">Refund Added</SelectItem>
          </SelectContent>
        </Select>

        {/* Reference search */}
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Search ref (TC-000018…)"
            value={entityRefSearch}
            onChange={(e) => { setEntityRefSearch(e.target.value); resetPage(); }}
          />
        </div>

        {/* Date From */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">From</span>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
          />
        </div>

        {/* Date To */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">To</span>
          <Input
            type="date"
            className="h-8 text-xs w-36"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
          />
        </div>

        {/* Clear */}
        {(entityType !== "all" || action !== "all" || entityRefSearch || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setEntityType("all");
              setAction("all");
              setEntityRefSearch("");
              setDateFrom("");
              setDateTo("");
              setPage(0);
            }}
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40">
              <TableHead className="text-xs w-40">Date / Time</TableHead>
              <TableHead className="text-xs w-32">Actor</TableHead>
              <TableHead className="text-xs w-28">Entity</TableHead>
              <TableHead className="text-xs w-28">Reference</TableHead>
              <TableHead className="text-xs w-36">Action</TableHead>
              <TableHead className="text-xs">Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-border/40">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 rounded bg-muted/40 animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.rows.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No audit log entries found
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((row) => (
                <TableRow key={row.id} className="border-border/40 hover:bg-muted/20 text-xs">
                  <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {format(new Date(row.created_at), "dd MMM yyyy")}
                    <br />
                    <span className="opacity-60">{format(new Date(row.created_at), "HH:mm:ss")}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.actor_name ? (
                      <span className="font-medium">{row.actor_name}</span>
                    ) : row.actor_id ? (
                      <span className="text-muted-foreground">Admin #{row.actor_id}</span>
                    ) : (
                      <span className="text-muted-foreground italic">System</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium gap-1 ${ENTITY_COLORS[row.entity_type] ?? "bg-muted/40 text-muted-foreground"}`}
                    >
                      <EntityIcon type={row.entity_type} />
                      {ENTITY_TYPE_LABELS[row.entity_type] ?? row.entity_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {row.entity_ref ?? `#${row.entity_id}`}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium ${ACTION_COLORS[row.action] ?? "bg-muted/40 text-muted-foreground"}`}
                    >
                      {ACTION_LABELS[row.action] ?? row.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-sm">
                    {row.summary}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, data?.total ?? 0)} of{" "}
            {data?.total ?? 0} entries
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
            </Button>
            <span className="flex items-center px-2 font-medium">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
