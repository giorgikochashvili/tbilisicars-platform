import { Router, type IRouter } from "express";
import {
  ListAdminLocationsResponse,
  GetAdminLocationParams,
  GetAdminLocationResponse,
  CreateAdminLocationBody,
  UpdateAdminLocationParams,
  UpdateAdminLocationBody,
  UpdateAdminLocationResponse,
  DeleteAdminLocationParams,
  ListAdminOneWayFeesResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAllLocations,
  getAdminLocation,
  createAdminLocation,
  updateAdminLocation,
  deleteAdminLocation,
  listOneWayFees,
} from "../services/admin-locations.service.js";

const router: IRouter = Router();

router.get("/admin/locations", requireAdmin, async (_req, res) => {
  const data = await listAllLocations();
  res.json(ListAdminLocationsResponse.parse(data));
});

router.post("/admin/locations", requireAdmin, async (req, res) => {
  const body = CreateAdminLocationBody.parse(req.body);
  const location = await createAdminLocation(body as any);
  res.status(201).json(location);
});

router.get("/admin/locations/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminLocationParams.parse({ id: req.params.id });
  const location = await getAdminLocation(id);
  res.json(GetAdminLocationResponse.parse(location));
});

router.patch("/admin/locations/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminLocationParams.parse({ id: req.params.id });
  const body = UpdateAdminLocationBody.parse(req.body);
  const location = await updateAdminLocation(id, body as any);
  res.json(UpdateAdminLocationResponse.parse(location));
});

router.delete("/admin/locations/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminLocationParams.parse({ id: req.params.id });
  const result = await deleteAdminLocation(id);
  res.json(result);
});

router.get("/admin/one-way-fees", requireAdmin, async (_req, res) => {
  const data = await listOneWayFees();
  res.json(ListAdminOneWayFeesResponse.parse(data));
});

export default router;
