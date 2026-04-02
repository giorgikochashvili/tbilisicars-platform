import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListLocations,
  useCreateAdminLocation,
  useUpdateAdminLocation,
  useDeleteAdminLocation,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Plus, MoreHorizontal, Edit, Trash2, MapPin } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function LocationsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [formData, setFormData] = useState({ 
    name: "", address: "", city: "", country: "", 
    latitude: 0, longitude: 0, locationType: "rental_office" as any, isActive: true 
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const reqOpts = { request: { credentials: "include" as const } };
  const { data: locations, isLoading } = useListLocations(reqOpts);
  
  const createMutation = useCreateAdminLocation(reqOpts);
  const updateMutation = useUpdateAdminLocation(reqOpts);
  const deleteMutation = useDeleteAdminLocation(reqOpts);

  const handleOpenModal = (loc: any = null) => {
    if (loc) {
      setEditingLocation(loc);
      setFormData({
        name: loc.name || "",
        address: loc.address || "",
        city: loc.city || "",
        country: loc.country || "",
        latitude: loc.latitude ? Number(loc.latitude) : 0,
        longitude: loc.longitude ? Number(loc.longitude) : 0,
        locationType: loc.locationType || "rental_office",
        isActive: loc.isActive ?? true,
      });
    } else {
      setEditingLocation(null);
      setFormData({ 
        name: "", address: "", city: "", country: "", 
        latitude: 0, longitude: 0, locationType: "rental_office", isActive: true 
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const payload = {
      ...formData,
      latitude: formData.latitude.toString() as any,
      longitude: formData.longitude.toString() as any,
    };
    
    if (editingLocation) {
      updateMutation.mutate(
        { id: editingLocation.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Location updated" });
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
            toast({ title: "Success", description: "Location created" });
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
    if (confirm("Are you sure you want to delete this location?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Location deleted" });
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
            <MapPin className="w-6 h-6 text-primary" /> Locations
          </h2>
          <p className="text-muted-foreground">Manage offices and meet-and-greet spots</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="shadow-sm hover-elevate">
          <Plus className="w-4 h-4 mr-2" /> Add Location
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-12 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : locations?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <MapPin className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No locations found
                  </TableCell>
                </TableRow>
              ) : (
                locations?.map((loc: any) => (
                  <TableRow key={loc.id} className="border-border/20 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-foreground">{loc.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        loc.locationType === 'rental_office' 
                          ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
                          : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                      }>
                        {loc.locationType.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{loc.city}</TableCell>
                    <TableCell className="text-muted-foreground">{loc.country}</TableCell>
                    <TableCell>
                      {loc.isActive ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-500/10 text-slate-500 border-slate-500/20">Inactive</Badge>
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
                          <DropdownMenuItem onClick={() => handleOpenModal(loc)}>
                            <Edit className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(loc.id)} className="text-destructive focus:text-destructive">
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
            <DialogTitle className="font-display text-xl">{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>
            <DialogDescription>Manage location details and coordinates.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={formData.locationType} onValueChange={(val: any) => setFormData({...formData, locationType: val})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rental_office">Rental Office</SelectItem>
                    <SelectItem value="meet_and_greet">Meet & Greet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <div className="flex items-center h-10 space-x-2">
                  <Switch checked={formData.isActive} onCheckedChange={(val) => setFormData({...formData, isActive: val})} />
                  <span className="text-sm font-medium">{formData.isActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Address</Label>
              <Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>City</Label>
                <Input value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Country</Label>
                <Input value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Latitude</Label>
                <Input type="number" step="any" value={formData.latitude} onChange={e => setFormData({...formData, latitude: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="grid gap-2">
                <Label>Longitude</Label>
                <Input type="number" step="any" value={formData.longitude} onChange={e => setFormData({...formData, longitude: parseFloat(e.target.value) || 0})} />
              </div>
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
