import { Router, type IRouter } from "express";
import {
  ListAdminBrandsResponse,
  GetAdminBrandParams,
  GetAdminBrandResponse,
  CreateAdminBrandBody,
  UpdateAdminBrandParams,
  UpdateAdminBrandBody,
  UpdateAdminBrandResponse,
  DeleteAdminBrandParams,
  ListAdminModelsResponse,
  GetAdminModelParams,
  GetAdminModelResponse,
  CreateAdminModelBody,
  UpdateAdminModelParams,
  UpdateAdminModelBody,
  UpdateAdminModelResponse,
  DeleteAdminModelParams,
  ListAdminGroupsResponse,
  GetAdminGroupParams,
  GetAdminGroupResponse,
  ListAdminVehiclesQueryParams,
  ListAdminVehiclesResponse,
  GetAdminVehicleParams,
  GetAdminVehicleResponse,
  CreateAdminVehicleBody,
  UpdateAdminVehicleParams,
  UpdateAdminVehicleBody,
  UpdateAdminVehicleResponse,
  UpdateAdminVehicleStatusParams,
  UpdateAdminVehicleStatusBody,
  UpdateAdminVehicleStatusResponse,
  DeleteAdminVehicleParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAdminBrands,
  getAdminBrand,
  createAdminBrand,
  updateAdminBrand,
  deleteAdminBrand,
  listAdminModels,
  getAdminModel,
  createAdminModel,
  updateAdminModel,
  deleteAdminModel,
  listAdminGroups,
  getAdminGroup,
  listAdminVehicles,
  getAdminVehicle,
  createAdminVehicle,
  updateAdminVehicle,
  updateAdminVehicleStatus,
  deleteAdminVehicle,
} from "../services/admin-fleet.service.js";
import { getVehicleDetail } from "../services/admin-vehicle-detail.service.js";

const router: IRouter = Router();

// ─── Brands ───────────────────────────────────────────────────────────────────

router.get("/admin/fleet/brands", requireAdmin, async (_req, res) => {
  const data = await listAdminBrands();
  res.json(ListAdminBrandsResponse.parse(data));
});

router.post("/admin/fleet/brands", requireAdmin, async (req, res) => {
  const body = CreateAdminBrandBody.parse(req.body);
  const brand = await createAdminBrand(body);
  res.status(201).json(brand);
});

router.get("/admin/fleet/brands/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminBrandParams.parse({ id: req.params.id });
  const brand = await getAdminBrand(id);
  res.json(GetAdminBrandResponse.parse(brand));
});

router.patch("/admin/fleet/brands/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminBrandParams.parse({ id: req.params.id });
  const body = UpdateAdminBrandBody.parse(req.body);
  const brand = await updateAdminBrand(id, body);
  res.json(UpdateAdminBrandResponse.parse(brand));
});

router.delete("/admin/fleet/brands/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminBrandParams.parse({ id: req.params.id });
  const result = await deleteAdminBrand(id);
  res.json(result);
});

// ─── Models ───────────────────────────────────────────────────────────────────

router.get("/admin/fleet/models", requireAdmin, async (_req, res) => {
  const data = await listAdminModels();
  res.json(ListAdminModelsResponse.parse(data));
});

router.post("/admin/fleet/models", requireAdmin, async (req, res) => {
  const body = CreateAdminModelBody.parse(req.body);
  const model = await createAdminModel(body as any);
  res.status(201).json(model);
});

router.get("/admin/fleet/models/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminModelParams.parse({ id: req.params.id });
  const vehicleModel = await getAdminModel(id);
  res.json(GetAdminModelResponse.parse(vehicleModel));
});

router.patch("/admin/fleet/models/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminModelParams.parse({ id: req.params.id });
  const body = UpdateAdminModelBody.parse(req.body);
  const model = await updateAdminModel(id, body as any);
  res.json(UpdateAdminModelResponse.parse(model));
});

router.delete("/admin/fleet/models/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminModelParams.parse({ id: req.params.id });
  const result = await deleteAdminModel(id);
  res.json(result);
});

// ─── Groups ───────────────────────────────────────────────────────────────────

router.get("/admin/fleet/groups", requireAdmin, async (_req, res) => {
  const data = await listAdminGroups();
  res.json(ListAdminGroupsResponse.parse(data));
});

router.get("/admin/fleet/groups/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminGroupParams.parse({ id: req.params.id });
  const group = await getAdminGroup(id);
  res.json(GetAdminGroupResponse.parse(group));
});

// ─── Vehicles ─────────────────────────────────────────────────────────────────

router.get("/admin/fleet/vehicles", requireAdmin, async (req, res) => {
  const q = ListAdminVehiclesQueryParams.parse(req.query);
  const data = await listAdminVehicles(
    {
      status: q.status as any,
      locationId: q.locationId,
      modelId: q.modelId,
      groupId: q.groupId,
    },
    q.page,
    q.limit,
  );
  res.json(ListAdminVehiclesResponse.parse(data));
});

router.post("/admin/fleet/vehicles", requireAdmin, async (req, res) => {
  const body = CreateAdminVehicleBody.parse(req.body);
  const vehicle = await createAdminVehicle(body as any);
  res.status(201).json(vehicle);
});

// ─── Vehicle Detail (operational hub — must be before /:id) ─────────────────
router.get("/admin/fleet/vehicles/:id/detail", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vehicle id" }); return; }
  const detail = await getVehicleDetail(id);
  if (!detail) { res.status(404).json({ error: "Vehicle not found" }); return; }
  res.json(detail);
});

router.get("/admin/fleet/vehicles/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminVehicleParams.parse({ id: req.params.id });
  const vehicle = await getAdminVehicle(id);
  res.json(GetAdminVehicleResponse.parse(vehicle));
});

router.patch("/admin/fleet/vehicles/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminVehicleParams.parse({ id: req.params.id });
  const body = UpdateAdminVehicleBody.parse(req.body);
  const vehicle = await updateAdminVehicle(id, body as any);
  res.json(UpdateAdminVehicleResponse.parse(vehicle));
});

router.patch("/admin/fleet/vehicles/:id/status", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminVehicleStatusParams.parse({ id: req.params.id });
  const { status } = UpdateAdminVehicleStatusBody.parse(req.body);
  const vehicle = await updateAdminVehicleStatus(id, status as any);
  res.json(UpdateAdminVehicleStatusResponse.parse(vehicle));
});

router.delete("/admin/fleet/vehicles/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminVehicleParams.parse({ id: req.params.id });
  const result = await deleteAdminVehicle(id);
  res.json(result);
});

export default router;
