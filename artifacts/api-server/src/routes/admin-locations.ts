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
import { requirePermission } from "../middlewares/requirePermission.js";
import {
  listAllLocations,
  getAdminLocation,
  createAdminLocation,
  updateAdminLocation,
  deleteAdminLocation,
  listOneWayFees,
  createOneWayFee,
  updateOneWayFee,
  deleteOneWayFee,
} from "../services/admin-locations.service.js";

const router: IRouter = Router();

router.get("/admin/locations", requireAdmin, async (_req, res) => {
  const data = await listAllLocations();
  res.json(ListAdminLocationsResponse.parse(data));
});

router.post("/admin/locations", requireAdmin, requirePermission("canManageLocations"), async (req, res) => {
  const body = CreateAdminLocationBody.parse(req.body);
  const location = await createAdminLocation(body as any);
  res.status(201).json(location);
});

router.get("/admin/locations/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminLocationParams.parse({ id: req.params.id });
  const location = await getAdminLocation(id);
  res.json(GetAdminLocationResponse.parse(location));
});

router.patch("/admin/locations/:id", requireAdmin, requirePermission("canManageLocations"), async (req, res) => {
  const { id } = UpdateAdminLocationParams.parse({ id: req.params.id });
  const body = UpdateAdminLocationBody.parse(req.body);
  const location = await updateAdminLocation(id, body as any);
  res.json(UpdateAdminLocationResponse.parse(location));
});

router.delete("/admin/locations/:id", requireAdmin, requirePermission("canManageLocations"), async (req, res) => {
  const { id } = DeleteAdminLocationParams.parse({ id: req.params.id });
  const result = await deleteAdminLocation(id);
  res.json(result);
});

router.get("/admin/one-way-fees", requireAdmin, async (_req, res) => {
  const data = await listOneWayFees();
  res.json(ListAdminOneWayFeesResponse.parse(data));
});

router.post("/admin/one-way-fees", requireAdmin, requirePermission("canManageLocations"), async (req, res) => {
  const { fromLocationId, toLocationId, fee, currency } = req.body as {
    fromLocationId?: number; toLocationId?: number; fee?: string; currency?: string;
  };
  if (!fromLocationId || !toLocationId || !fee) {
    return res.status(400).json({ error: "fromLocationId, toLocationId, and fee are required" });
  }
  const row = await createOneWayFee({ fromLocationId, toLocationId, fee, currency });
  res.status(201).json(row);
});

router.patch("/admin/one-way-fees/:id", requireAdmin, requirePermission("canManageLocations"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { fee, currency } = req.body as { fee?: string; currency?: string };
  const row = await updateOneWayFee(id, { ...(fee != null ? { fee } : {}), ...(currency != null ? { currency } : {}) });
  res.json(row);
});

router.delete("/admin/one-way-fees/:id", requireAdmin, requirePermission("canManageLocations"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const result = await deleteOneWayFee(id);
  res.json(result);
});

export default router;
