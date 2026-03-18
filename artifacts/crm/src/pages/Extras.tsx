import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminExtras,
  useCreateAdminExtra,
  useUpdateAdminExtra,
  useDeleteAdminExtra,
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
import { Plus, MoreHorizontal, Edit, Trash2, PackageOpen } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/utils";

export default function ExtrasPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExtra, setEditingExtra] = useState<any>(null);
  const [formData, setFormData] = useState({ 
    name: "", description: "", price: 0, currency: "GEL", 
    pricingType: "per_day" as any, maxDays: 0, isActive: true 
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const reqOpts = { request: { credentials: "include" as const } };
  const { data: extras, isLoading } = useListAdminExtras(reqOpts);
  
  const createMutation = useCreateAdminExtra(reqOpts);
  const updateMutation = useUpdateAdminExtra(reqOpts);
  const deleteMutation = useDeleteAdminExtra(reqOpts);

  const handleOpenModal = (extra: any = null) => {
    if (extra) {
      setEditingExtra(extra);
      setFormData({
        name: extra.name || "",
        description: extra.description || "",
        price: Number(extra.price) || 0,
        currency: extra.currency || "GEL",
        pricingType: extra.pricingType || "per_day",
        maxDays: extra.maxDays || 0,
        isActive: extra.isActive ?? true,
      });
    } else {
      setEditingExtra(null);
      setFormData({ 
        name: "", description: "", price: 0, currency: "GEL", 
        pricingType: "per_day", maxDays: 0, isActive: true 
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const payload = {
      ...formData,
      price: formData.price.toString() as any,
    };
    
    if (editingExtra) {
      updateMutation.mutate(
        { id: editingExtra.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Extra updated" });
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
            toast({ title: "Success", description: "Extra created" });
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
    if (confirm("Are you sure you want to delete this extra?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Extra deleted" });
            queryClient.invalidateQueries();
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
          }
        }
      );
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <PackageOpen className="w-6 h-6 text-primary" /> Extras & Add-ons
          </h2>
          <p className="text-muted-foreground">Manage additional equipment and services</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="shadow-sm hover-elevate">
          <Plus className="w-4 h-4 mr-2" /> Add Extra
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Max Charge Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : extras?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <PackageOpen className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No extras found
                  </TableCell>
                </TableRow>
              ) : (
                extras?.map((extra: any) => (
                  <TableRow key={extra.id} className="border-border/20 hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="font-medium text-foreground">{extra.name}</div>
                      {extra.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{extra.description}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">
                      {formatMoney(extra.price)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                        {extra.pricingType.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {extra.maxDays ? extra.maxDays : 'Unlimited'}
                    </TableCell>
                    <TableCell>
                      <Switch checked={extra.isActive} disabled className="data-[state=checked]:bg-emerald-500" />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenModal(extra)}>
                            <Edit className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(extra.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
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

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editingExtra ? "Edit Extra" : "Add Extra"}</DialogTitle>
            <DialogDescription>Configure additional items like child seats or insurance.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Baby Seat" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Brief description..." />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Price</Label>
                <Input type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <Select value={formData.currency} onValueChange={(val) => setFormData({...formData, currency: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GEL">GEL (₾)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Pricing Type</Label>
                <Select value={formData.pricingType} onValueChange={(val: any) => setFormData({...formData, pricingType: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_day">Per Day</SelectItem>
                    <SelectItem value="per_rental">Per Rental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Max Charge Days (0 = unlimited)</Label>
                <Input type="number" value={formData.maxDays} onChange={e => setFormData({...formData, maxDays: parseInt(e.target.value) || 0})} />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg mt-2 bg-muted/30">
              <div>
                <Label className="text-base">Active Status</Label>
                <p className="text-sm text-muted-foreground">Available for new bookings</p>
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
