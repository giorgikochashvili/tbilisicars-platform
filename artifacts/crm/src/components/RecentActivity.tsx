import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Activity, Calendar, CreditCard, Car, Wrench, Users, UserCog, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AuditRow {
  id: number;
  actor_name: string | null;
  actor_id: number | null;
  entity_type: string;
  entity_ref: string | null;
  action: string;
  summary: string;
  created_at: string;
}

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

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  status_changed: "Status",
  payment_added: "Payment",
  payment_deleted: "Removed",
  deposit_received: "Deposit In",
  deposit_returned: "Deposit Out",
  refund_added: "Refund",
};

const EntityIcon = ({ type }: { type: string }) => {
  const cls = "w-3 h-3";
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

interface RecentActivityProps {
  entityType: string;
  entityId: number | null | undefined;
  limit?: number;
}

export function RecentActivity({ entityType, entityId, limit = 8 }: RecentActivityProps) {
  const { data, isLoading } = useQuery<{ rows: AuditRow[] }>({
    queryKey: ["audit-entity", entityType, entityId, limit],
    queryFn: async () => {
      if (!entityId) return { rows: [] };
      const res = await fetch(
        `/api/admin/audit-logs/entity?entityType=${entityType}&entityId=${entityId}&limit=${limit}`,
        { credentials: "include" },
      );
      if (!res.ok) return { rows: [] };
      return res.json();
    },
    enabled: !!entityId,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 pt-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  const rows = data?.rows ?? [];

  if (!rows.length) {
    return (
      <div className="py-4 text-center text-muted-foreground text-xs">
        No activity recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-start gap-3 rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-xs"
        >
          <div className="mt-0.5 shrink-0 text-muted-foreground">
            <EntityIcon type={row.entity_type} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground/80 leading-snug">{row.summary}</p>
            <p className="text-muted-foreground/60 text-[10px] mt-0.5">
              {row.actor_name ?? (row.actor_id ? `Admin #${row.actor_id}` : "System")}
              {" · "}
              <span title={format(new Date(row.created_at), "dd MMM yyyy HH:mm:ss")}>
                {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
              </span>
            </p>
          </div>
          <Badge
            variant="outline"
            className={`shrink-0 text-[9px] font-medium px-1.5 py-0.5 ${ACTION_COLORS[row.action] ?? "bg-muted/40 text-muted-foreground"}`}
          >
            {ACTION_LABELS[row.action] ?? row.action}
          </Badge>
        </div>
      ))}
    </div>
  );
}
