import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Edit, Car, Handshake, Building2, Phone, Mail,
  CreditCard, Landmark, FileText, StickyNote,
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-words">{value}</span>
    </div>
  );
}

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = parseInt(params.id ?? "", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: partner, isLoading, error } = useQuery<any>({
    queryKey: ["partner-detail", partnerId],
    queryFn: () => apiFetch(`/api/admin/partners/${partnerId}`),
    enabled: !isNaN(partnerId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["partner-detail", partnerId] });
    queryClient.invalidateQueries({ queryKey: ["partners-vehicle-owner"] });
  };

  if (isNaN(partnerId)) {
    return (
      <div className="text-center text-muted-foreground py-16">Invalid partner ID.</div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-in fade-in duration-500">
        <Skeleton className="h-8 w-40" />
        <Card><CardContent className="p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
        </CardContent></Card>
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="text-center text-muted-foreground py-16">
        Partner not found.
        <div className="mt-4">
          <Link href="/partners">
            <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Back to Partners</Button>
          </Link>
        </div>
      </div>
    );
  }

  const ownedVehicles: any[] = partner.ownedVehicles ?? [];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Back + header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Link href="/partners">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Partners
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Handshake className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight">{partner.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">{partner.type ?? "Individual"}</span>
              {partner.isActive ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">Active</Badge>
              ) : (
                <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20 text-xs">Inactive</Badge>
              )}
            </div>
          </div>
        </div>
        <Button onClick={() => setEditDialogOpen(true)} variant="outline" size="sm" className="gap-2 shrink-0">
          <Edit className="w-4 h-4" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Personal ID / Company ID" value={partner.personalIdOrCompanyId} />
            {partner.contactNumber && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-mono">{partner.contactNumber}</span>
              </div>
            )}
            {partner.contactEmail && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <a href={`mailto:${partner.contactEmail}`} className="hover:text-primary transition-colors">
                  {partner.contactEmail}
                </a>
              </div>
            )}
            {!partner.contactNumber && !partner.contactEmail && !partner.personalIdOrCompanyId && (
              <p className="text-sm text-muted-foreground italic">No contact information.</p>
            )}
          </CardContent>
        </Card>

        {/* Banking details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="w-4 h-4 text-muted-foreground" />
              Banking Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Bank" value={partner.bankName} />
            <InfoRow label="Account Holder" value={partner.accountHolderName} />
            {partner.bankAccount && (
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="font-mono text-sm">{partner.bankAccount}</span>
              </div>
            )}
            {partner.iban && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">IBAN</span>
                <span className="font-mono text-sm tracking-wide">{partner.iban}</span>
              </div>
            )}
            {!partner.bankName && !partner.bankAccount && !partner.iban && !partner.accountHolderName && (
              <p className="text-sm text-muted-foreground italic">No banking details on file.</p>
            )}
          </CardContent>
        </Card>

        {/* Agreement notes */}
        {partner.agreementNotes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Agreement Notes
                <span className="text-xs font-normal text-muted-foreground ml-auto">Informational only</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{partner.agreementNotes}</p>
            </CardContent>
          </Card>
        )}

        {/* General notes */}
        {partner.generalNotes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-muted-foreground" />
                General Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{partner.generalNotes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Owned vehicles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="w-4 h-4 text-muted-foreground" />
            Owned Vehicles
            <Badge variant="secondary" className="ml-auto text-xs">{ownedVehicles.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ownedVehicles.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No vehicles assigned to this partner yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 bg-muted/20">
                    <TableHead>Plate</TableHead>
                    <TableHead>Brand / Model</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownedVehicles.map((v) => (
                    <TableRow key={v.id} className="border-border/30 hover:bg-muted/20 transition-colors">
                      <TableCell className="font-mono font-semibold text-sm">{v.licensePlate ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {[v.brandName, v.modelName].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.year ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.color ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            v.status === "AVAILABLE"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs"
                              : v.status === "RENTED"
                              ? "bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs"
                              : v.status === "MAINTENANCE"
                              ? "bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs"
                              : "bg-slate-500/10 text-slate-500 border-slate-500/20 text-xs"
                          }
                        >
                          {v.status ?? "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PartnerFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        partner={partner}
        onSuccess={invalidate}
      />
    </div>
  );
}
