import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminRates,
  useCreateAdminRate,
  useUpdateAdminRate,
  useDeleteAdminRate,
  useCreateAdminRateTier,
  useUpdateAdminRateTier,
  useDeleteAdminRateTier,
  useListFleetModels
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Plus, MoreHorizontal, Edit, Trash2, BadgeDollarSign, ChevronDown, ChevronRight, ListPlus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatBookingAmount } from "@/lib/utils";

function RateTiers({ rateId, tiers }: { rateId: number, tiers: any[] }) {
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<any>(null);
  const [tierData, setTierData] = useState({ vehicleModelId: "", fromDays: 1, toDays: 0, pricePerDay: 0, currency: "EUR" });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reqOpts = { request: { credentials: "include" as const } };
  
  const { data: models } = useListFleetModels(reqOpts);
  
  const createTierMutation = useCreateAdminRateTier(reqOpts);
  const updateTierMutation = useUpdateAdminRateTier(reqOpts);
  const deleteTierMutation = useDeleteAdminRateTier(reqOpts);

  const handleOpenTierModal = (tier: any = null) => {
    if (tier) {
      setEditingTier(tier);
      setTierData({
        vehicleModelId: tier.vehicleModelId?.toString() || "",
        fromDays: tier.fromDays || 1,
        toDays: tier.toDays || 0,
        pricePerDay: Number(tier.pricePerDay) || 0,
        currency: tier.currency || "EUR"
      });
    } else {
      setEditingTier(null);
      setTierData({ vehicleModelId: "", fromDays: 1, toDays: 0, pricePerDay: 0, currency: "EUR" });
    }
    setIsTierModalOpen(true);
  };

  const handleSaveTier = () => {
    if (!tierData.vehicleModelId) {
      toast({ title: "Error", description: "Vehicle model is required", variant: "destructive" });
      return;
    }
    
    const payload = {
      ...tierData,
      vehicleModelId: parseInt(tierData.vehicleModelId),
      pricePerDay: tierData.pricePerDay.toString() as any,
    };
    
    if (editingTier) {
      updateTierMutation.mutate(
        { id: rateId, tierId: editingTier.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Tier updated" });
            queryClient.invalidateQueries();
            setIsTierModalOpen(false);
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to update tier", variant: "destructive" });
          }
        }
      );
    } else {
      createTierMutation.mutate(
        { id: rateId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Tier created" });
            queryClient.invalidateQueries();
            setIsTierModalOpen(false);
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to create tier", variant: "destructive" });
          }
        }
      );
    }
  };

  const handleDeleteTier = (tierId: number) => {
    if (confirm("Are you sure you want to delete this tier?")) {
      deleteTierMutation.mutate(
        { id: rateId, tierId },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Tier deleted" });
            queryClient.invalidateQueries();
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to delete tier", variant: "destructive" });
          }
        }
      );
    }
  };

  return (
    <div className="p-4 bg-muted/10 border-t border-border/40">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold font-display">Pricing Tiers</h4>
        <Button size="sm" variant="outline" onClick={() => handleOpenTierModal()} className="h-8">
          <ListPlus className="w-3 h-3 mr-2" /> Add Tier
        </Button>
      </div>
      
      {tiers && tiers.length > 0 ? (
        <div className="rounded-md border border-border/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent text-xs">
                <TableHead>Vehicle Model</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Price / Day</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier) => (
                <TableRow key={tier.id} className="border-border/20 hover:bg-muted/30 transition-colors text-sm">
                  <TableCell className="font-medium">
                    {models?.find(m => m.id === tier.vehicleModelId)?.name || `Model #${tier.vehicleModelId}`}
                  </TableCell>
                  <TableCell>
                    {tier.toDays ? `${tier.fromDays} - ${tier.toDays} days` : `${tier.fromDays}+ days`}
                  </TableCell>
                  <TableCell className="font-mono">
                    {formatBookingAmount(tier.pricePerDay, "EUR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenTierModal(tier)} className="h-6 w-6">
                      <Edit className="w-3 h-3 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteTier(tier.id)} className="h-6 w-6">
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md border-border/50">
          No tiers configured for this rate.
        </div>
      )}

      <Dialog open={isTierModalOpen} onOpenChange={setIsTierModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingTier ? "Edit Tier" : "Add Tier"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Vehicle Model</Label>
              <Select value={tierData.vehicleModelId} onValueChange={(val) => setTierData({...tierData, vehicleModelId: val})}>
                <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                <SelectContent>
                  {models?.map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.brand?.name} {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>From Days</Label>
                <Input type="number" min="1" value={tierData.fromDays} onChange={e => setTierData({...tierData, fromDays: parseInt(e.target.value) || 1})} />
              </div>
              <div className="grid gap-2">
                <Label>To Days (0 = unlimited)</Label>
                <Input type="number" min="0" value={tierData.toDays} onChange={e => setTierData({...tierData, toDays: parseInt(e.target.value) || 0})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Price per day (€)</Label>
                <Input type="number" step="0.01" value={tierData.pricePerDay} onChange={e => setTierData({...tierData, pricePerDay: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                  EUR (€) — fixed
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTierModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTier} disabled={createTierMutation.isPending || updateTierMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RatesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<any>(null);
  const [expandedRateId, setExpandedRateId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", description: "", validFrom: "", validUntil: "", 
    minDays: 1, maxDays: 0, isActive: true 
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const reqOpts = { request: { credentials: "include" as const } };
  const { data: rates, isLoading } = useListAdminRates(reqOpts);
  
  const createMutation = useCreateAdminRate(reqOpts);
  const updateMutation = useUpdateAdminRate(reqOpts);
  const deleteMutation = useDeleteAdminRate(reqOpts);

  const handleOpenModal = (rate: any = null) => {
    if (rate) {
      setEditingRate(rate);
      setFormData({
        name: rate.name || "",
        description: rate.description || "",
        validFrom: rate.validFrom ? new Date(rate.validFrom).toISOString().split('T')[0] : "",
        validUntil: rate.validUntil ? new Date(rate.validUntil).toISOString().split('T')[0] : "",
        minDays: rate.minDays || 1,
        maxDays: rate.maxDays || 0,
        isActive: rate.isActive ?? true,
      });
    } else {
      setEditingRate(null);
      setFormData({ 
        name: "", description: "", validFrom: "", validUntil: "", 
        minDays: 1, maxDays: 0, isActive: true 
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const payload = {
      ...formData,
      validFrom: formData.validFrom || new Date().toISOString().split("T")[0],
      validUntil: formData.validUntil || new Date().toISOString().split("T")[0],
    };
    
    if (editingRate) {
      updateMutation.mutate(
        { id: editingRate.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Rate updated" });
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
            toast({ title: "Success", description: "Rate created" });
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
    if (confirm("Are you sure you want to delete this rate plan?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Rate deleted" });
            queryClient.invalidateQueries();
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
          }
        }
      );
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedRateId(expandedRateId === id ? null : id);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <BadgeDollarSign className="w-6 h-6 text-primary" /> Rate Plans
          </h2>
          <p className="text-muted-foreground">Manage dynamic pricing and seasonal rates</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="shadow-sm hover-elevate">
          <Plus className="w-4 h-4 mr-2" /> Add Rate Plan
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="w-10"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Duration Constraints</TableHead>
                <TableHead>Validity Period</TableHead>
                <TableHead>Tiers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-8 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : rates?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <BadgeDollarSign className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No rates found
                  </TableCell>
                </TableRow>
              ) : (
                rates?.map((rate: any) => (
                  <React.Fragment key={rate.id}>
                    <TableRow className="border-border/20 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toggleExpand(rate.id)}>
                      <TableCell>
                        {expandedRateId === rate.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-foreground">{rate.name}</div>
                        {rate.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{rate.description}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {rate.minDays} - {rate.maxDays ? rate.maxDays : 'Unlimited'} days
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rate.validFrom ? new Date(rate.validFrom).toLocaleDateString() : 'Always'} 
                        {' → '} 
                        {rate.validUntil ? new Date(rate.validUntil).toLocaleDateString() : 'Always'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-primary/10 text-primary">{rate.tiers?.length || 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch checked={rate.isActive} disabled className="data-[state=checked]:bg-emerald-500" />
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenModal(rate)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit Plan
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(rate.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete Plan
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {expandedRateId === rate.id && (
                      <TableRow className="bg-muted/5 hover:bg-muted/5 border-border/20">
                        <TableCell colSpan={7} className="p-0">
                          <RateTiers rateId={rate.id} tiers={rate.tiers || []} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingRate ? "Edit Rate Plan" : "Add Rate Plan"}</DialogTitle>
            <DialogDescription>Create seasonal rates, standard pricing, or special conditions.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Summer High Season 2024" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Optional description..." />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Minimum Days</Label>
                <Input type="number" min="1" value={formData.minDays} onChange={e => setFormData({...formData, minDays: parseInt(e.target.value) || 1})} />
              </div>
              <div className="grid gap-2">
                <Label>Maximum Days (0 = unlimited)</Label>
                <Input type="number" min="0" value={formData.maxDays} onChange={e => setFormData({...formData, maxDays: parseInt(e.target.value) || 0})} />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg mt-2 bg-muted/30">
              <div>
                <Label className="text-base">Active Status</Label>
                <p className="text-sm text-muted-foreground">Is this rate currently applicable?</p>
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
