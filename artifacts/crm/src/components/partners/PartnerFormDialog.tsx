import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

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

interface PartnerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner?: any;
  onSuccess: () => void;
}

const EMPTY_FORM = {
  name: "",
  type: "Individual" as "Individual" | "Company",
  contactNumber: "",
  contactEmail: "",
  personalIdOrCompanyId: "",
  bankName: "",
  bankAccount: "",
  iban: "",
  accountHolderName: "",
  agreementNotes: "",
  generalNotes: "",
  isActive: true,
};

export function PartnerFormDialog({
  open,
  onOpenChange,
  partner,
  onSuccess,
}: PartnerFormDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const isEdit = !!partner;

  useEffect(() => {
    if (open) {
      if (partner) {
        setFormData({
          name: partner.name ?? "",
          type: partner.type === "Company" ? "Company" : "Individual",
          contactNumber: partner.contactNumber ?? "",
          contactEmail: partner.contactEmail ?? "",
          personalIdOrCompanyId: partner.personalIdOrCompanyId ?? "",
          bankName: partner.bankName ?? "",
          bankAccount: partner.bankAccount ?? "",
          iban: partner.iban ?? "",
          accountHolderName: partner.accountHolderName ?? "",
          agreementNotes: partner.agreementNotes ?? "",
          generalNotes: partner.generalNotes ?? "",
          isActive: partner.isActive ?? true,
        });
      } else {
        setFormData(EMPTY_FORM);
      }
    }
  }, [open, partner]);

  const set = (field: keyof typeof EMPTY_FORM, value: string | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Validation", description: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formData.name.trim(),
        type: formData.type,
        contactNumber: formData.contactNumber || null,
        contactEmail: formData.contactEmail || null,
        personalIdOrCompanyId: formData.personalIdOrCompanyId || null,
        bankName: formData.bankName || null,
        bankAccount: formData.bankAccount || null,
        iban: formData.iban || null,
        accountHolderName: formData.accountHolderName || null,
        agreementNotes: formData.agreementNotes || null,
        generalNotes: formData.generalNotes || null,
      };

      if (!isEdit) {
        body.partnerRole = "VEHICLE_OWNER";
      } else {
        body.isActive = formData.isActive;
      }

      if (isEdit) {
        await apiFetch(`/api/admin/partners/${partner.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast({ title: "Partner updated" });
      } else {
        await apiFetch("/api/admin/partners", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast({ title: "Partner created" });
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Partner" : "Add Partner"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this vehicle owner partner's details." : "Register a new vehicle owner partner."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name + Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                value={formData.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Full name or company name"
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input
                value={formData.contactNumber}
                onChange={(e) => set("contactNumber", e.target.value)}
                placeholder="+995 5xx xxx xxx"
              />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
                placeholder="partner@example.com"
              />
            </div>
          </div>

          {/* Personal / Company ID */}
          <div className="grid gap-2">
            <Label>Personal ID or Company ID</Label>
            <Input
              value={formData.personalIdOrCompanyId}
              onChange={(e) => set("personalIdOrCompanyId", e.target.value)}
              placeholder="ID number"
              className="font-mono"
            />
          </div>

          {/* Banking details */}
          <div className="border border-border/40 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Banking Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Bank Name</Label>
                <Input
                  value={formData.bankName}
                  onChange={(e) => set("bankName", e.target.value)}
                  placeholder="e.g. TBC Bank"
                />
              </div>
              <div className="grid gap-2">
                <Label>Bank Account</Label>
                <Input
                  value={formData.bankAccount}
                  onChange={(e) => set("bankAccount", e.target.value)}
                  placeholder="Account number"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>IBAN</Label>
                <Input
                  value={formData.iban}
                  onChange={(e) => set("iban", e.target.value.toUpperCase())}
                  placeholder="GE00 TB00 0000 0000 0000 00"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label>Account Holder Name</Label>
                <Input
                  value={formData.accountHolderName}
                  onChange={(e) => set("accountHolderName", e.target.value)}
                  placeholder="Name on bank account"
                />
              </div>
            </div>
          </div>

          {/* Agreement Notes */}
          <div className="grid gap-2">
            <Label>Agreement Notes</Label>
            <Textarea
              value={formData.agreementNotes}
              onChange={(e) => set("agreementNotes", e.target.value)}
              placeholder="Describe the revenue-sharing arrangement, contract terms, etc."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Informational only — not used for automatic calculation.
            </p>
          </div>

          {/* General Notes */}
          <div className="grid gap-2">
            <Label>General Notes</Label>
            <Textarea
              value={formData.generalNotes}
              onChange={(e) => set("generalNotes", e.target.value)}
              placeholder="Any other internal notes about this partner."
              rows={2}
            />
          </div>

          {/* Active toggle — edit mode only */}
          {isEdit && (
            <div className="flex items-center justify-between border border-border/40 rounded-lg px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Inactive partners won't appear in vehicle owner selectors.</p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(v) => set("isActive", v)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
