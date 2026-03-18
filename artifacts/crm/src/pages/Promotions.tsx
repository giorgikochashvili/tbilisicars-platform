import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminPromos,
  useCreateAdminPromo,
  useUpdateAdminPromo,
  useDeleteAdminPromo,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, MoreHorizontal, Edit, Trash2, Tag, Copy } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function PromotionsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any>(null);
  const [formData, setFormData] = useState({ 
    code: "", discountType: "percentage" as any, discountValue: 0, 
    validFrom: "", validUntil: "", maxUses: 0, isActive: true 
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const reqOpts = { request: { credentials: "include" as const } };
  const { data: promos, isLoading } = useListAdminPromos(reqOpts);
  
  const createMutation = useCreateAdminPromo(reqOpts);
  const updateMutation = useUpdateAdminPromo(reqOpts);
  const deleteMutation = useDeleteAdminPromo(reqOpts);

  const handleOpenModal = (promo: any = null) => {
    if (promo) {
      setEditingPromo(promo);
      setFormData({
        code: promo.code || "",
        discountType: promo.discountType || "percentage",
        discountValue: Number(promo.discountValue) || 0,
        validFrom: promo.validFrom ? new Date(promo.validFrom).toISOString().split('T')[0] : "",
        validUntil: promo.validUntil ? new Date(promo.validUntil).toISOString().split('T')[0] : "",
        maxUses: promo.maxUses || 0,
        isActive: promo.isActive ?? true,
      });
    } else {
      setEditingPromo(null);
      setFormData({ 
        code: "", discountType: "percentage", discountValue: 0, 
        validFrom: "", validUntil: "", maxUses: 0, isActive: true 
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const payload = {
      ...formData,
      discountValue: formData.discountValue.toString() as any,
      validFrom: formData.validFrom || undefined,
      validUntil: formData.validUntil || undefined,
    };
    
    if (editingPromo) {
      updateMutation.mutate(
        { id: editingPromo.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Promotion updated" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
          }
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Promotion created" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to create", variant: "destructive" });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this promotion?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Promotion deleted" });
            queryClient.invalidateQueries();
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
          }
        }
      );
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied", description: "Promo code copied to clipboard", duration: 2000 });
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" /> Promotions
          </h2>
          <p className="text-muted-foreground">Manage discount codes and campaigns</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="shadow-sm hover-elevate bg-gradient-to-r from-primary to-primary/80">
          <Plus className="w-4 h-4 mr-2" /> Create Promo Code
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-24 rounded-md" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : promos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Tag className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No promotions found
                  </TableCell>
                </TableRow>
              ) : (
                promos?.map((promo: any) => {
                  const now = new Date();
                  const isExpired = promo.validUntil && new Date(promo.validUntil) < now;
                  const isExhausted = promo.maxUses > 0 && promo.timesUsed >= promo.maxUses;
                  const active = promo.isActive && !isExpired && !isExhausted;
                  
                  return (
                    <TableRow key={promo.id} className="border-border/20 hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold tracking-wider text-base bg-muted px-2 py-1 rounded-md border border-border/50">
                            {promo.code}
                          </span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(promo.code)}>
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={promo.discountType === 'percentage' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"}>
                          {promo.discountType === 'percentage' ? `${promo.discountValue}%` : `₾${promo.discountValue}`} OFF
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {promo.validFrom ? new Date(promo.validFrom).toLocaleDateString() : 'Anytime'} 
                        {' - '} 
                        {promo.validUntil ? new Date(promo.validUntil).toLocaleDateString() : 'Forever'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{promo.timesUsed}</span>
                          <span className="text-muted-foreground text-xs">/ {promo.maxUses ? promo.maxUses : '∞'}</span>
                        </div>
                        {promo.maxUses > 0 && (
                          <div className="w-16 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.min(100, (promo.timesUsed / promo.maxUses) * 100)}%` }} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {active ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                        ) : isExpired ? (
                          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">Expired</Badge>
                        ) : isExhausted ? (
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">Exhausted</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenModal(promo)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(promo.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingPromo ? "Edit Promo Code" : "Create Promo Code"}</DialogTitle>
            <DialogDescription>Generate marketing codes for customer discounts.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Code</Label>
              <div className="flex gap-2">
                <Input className="font-mono uppercase tracking-widest" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} placeholder="SUMMER2024" />
                {!editingPromo && (
                  <Button variant="outline" onClick={() => {
                    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
                    setFormData({...formData, code: randomCode});
                  }}>Generate</Button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Discount Type</Label>
                <Select value={formData.discountType} onValueChange={(val: any) => setFormData({...formData, discountType: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Value</Label>
                <Input type="number" step="0.01" value={formData.discountValue} onChange={e => setFormData({...formData, discountValue: parseFloat(e.target.value) || 0})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valid From (Optional)</Label>
                <Input type="date" value={formData.validFrom} onChange={e => setFormData({...formData, validFrom: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Valid Until (Optional)</Label>
                <Input type="date" value={formData.validUntil} onChange={e => setFormData({...formData, validUntil: e.target.value})} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Maximum Uses (0 = unlimited)</Label>
              <Input type="number" value={formData.maxUses} onChange={e => setFormData({...formData, maxUses: parseInt(e.target.value) || 0})} />
            </div>

            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg mt-2 bg-muted/30">
              <div>
                <Label className="text-base">Active Status</Label>
                <p className="text-sm text-muted-foreground">Can this code be applied right now?</p>
              </div>
              <Switch checked={formData.isActive} onCheckedChange={val => setFormData({...formData, isActive: val})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
