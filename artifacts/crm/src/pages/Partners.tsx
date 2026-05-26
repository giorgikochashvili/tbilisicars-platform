import { useState, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, MoreHorizontal, Eye, Edit, UserCheck, UserX, Handshake,
} from "lucide-react";
import { PartnerFormDialog } from "@/components/partners/PartnerFormDialog";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json().catch(() => null);
}

export default function PartnersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [mutating, setMutating] = useState<number | null>(null);

  const { data: partners = [], isLoading } = useQuery<any[]>({
    queryKey: ["partners-vehicle-owner"],
    queryFn: () => apiFetch("/api/admin/partners?partnerRole=VEHICLE_OWNER"),
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["partners-vehicle-owner"] });
  }, [queryClient]);

  const filteredPartners = search.trim()
    ? partners.filter((p) =>
        p.name?.toLowerCase().includes(search.trim().toLowerCase())
      )
    : partners;

  const handleToggleActive = async (partner: any) => {
    const action = partner.isActive ? "deactivate" : "reactivate";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${partner.name}"?`)) return;
    setMutating(partner.id);
    try {
      await apiFetch(`/api/admin/partners/${partner.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !partner.isActive }),
      });
      toast({ title: `Partner ${partner.isActive ? "deactivated" : "reactivated"}` });
      invalidate();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setMutating(null);
    }
  };

  const openEdit = (partner: any) => {
    setEditingPartner(partner);
    setFormDialogOpen(true);
  };

  const openCreate = () => {
    setEditingPartner(null);
    setFormDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Handshake className="w-6 h-6 text-primary" />
            Partners
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vehicle owner partners who lease cars to the fleet.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          Add Partner
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/30">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Vehicles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredPartners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    {search ? "No partners match the search." : "No vehicle owner partners yet. Add one to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredPartners.map((p) => (
                  <TableRow key={p.id} className="border-border/30 hover:bg-muted/20 transition-colors">
                    <TableCell className="font-medium">
                      <Link href={`/partners/${p.id}`} className="hover:text-primary transition-colors">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.type ?? "Individual"}</TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {p.contactNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.contactEmail ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.ownedVehicleCount ?? 0}
                    </TableCell>
                    <TableCell>
                      {p.isActive ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20 text-xs">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={mutating === p.id}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/partners/${p.id}`} className="flex items-center gap-2 cursor-pointer">
                              <Eye className="w-4 h-4" />
                              View Detail
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(p)} className="gap-2">
                            <Edit className="w-4 h-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(p)}
                            className={`gap-2 ${p.isActive ? "text-destructive focus:text-destructive" : ""}`}
                          >
                            {p.isActive ? (
                              <><UserX className="w-4 h-4" /> Deactivate</>
                            ) : (
                              <><UserCheck className="w-4 h-4" /> Reactivate</>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <PartnerFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        partner={editingPartner}
        onSuccess={invalidate}
      />
    </div>
  );
}
