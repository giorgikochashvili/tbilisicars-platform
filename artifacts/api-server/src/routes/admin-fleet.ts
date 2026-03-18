import { Router, type IRouter } from "express";
import {
  ListAdminBrandsResponse,
  GetAdminBrandParams,
  GetAdminBrandResponse,
  ListAdminModelsResponse,
  GetAdminModelParams,
  GetAdminModelResponse,
  ListAdminGroupsResponse,
  GetAdminGroupParams,
  GetAdminGroupResponse,
  ListAdminVehiclesQueryParams,
  ListAdminVehiclesResponse,
  GetAdminVehicleParams,
  GetAdminVehicleResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAdminBrands,
  getAdminBrand,
  listAdminModels,
  getAdminModel,
  listAdminGroups,
  getAdminGroup,
  listAdminVehicles,
  getAdminVehicle,
} from "../services/admin-fleet.service.js";

const router: IRouter = Router();

router.get("/admin/fleet/brands", requireAdmin, async (_req, res) => {
  const data = await listAdminBrands();
  res.json(ListAdminBrandsResponse.parse(data));
});

router.get("/admin/fleet/brands/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminBrandParams.parse({ id: req.params.id });
  const brand = await getAdminBrand(id);
  res.json(GetAdminBrandResponse.parse(brand));
});

router.get("/admin/fleet/models", requireAdmin, async (_req, res) => {
  const data = await listAdminModels();
  res.json(ListAdminModelsResponse.parse(data));
});

router.get("/admin/fleet/models/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminModelParams.parse({ id: req.params.id });
  const vehicleModel = await getAdminModel(id);
  res.json(GetAdminModelResponse.parse(vehicleModel));
});

router.get("/admin/fleet/groups", requireAdmin, async (_req, res) => {
  const data = await listAdminGroups();
  res.json(ListAdminGroupsResponse.parse(data));
});

router.get("/admin/fleet/groups/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminGroupParams.parse({ id: req.params.id });
  const group = await getAdminGroup(id);
  res.json(GetAdminGroupResponse.parse(group));
});

router.get("/admin/fleet/vehicles", requireAdmin, async (req, res) => {
  const { page, limit, status, locationId, modelId, groupId } =
    ListAdminVehiclesQueryParams.parse(req.query);
  const result = await listAdminVehicles(
    { status, locationId, modelId, groupId },
    page,
    limit,
  );
  res.json(ListAdminVehiclesResponse.parse(result));
});

router.get("/admin/fleet/vehicles/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminVehicleParams.parse({ id: req.params.id });
  const vehicle = await getAdminVehicle(id);
  res.json(GetAdminVehicleResponse.parse(vehicle));
});

export default router;
