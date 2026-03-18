import { Router, type IRouter } from "express";
import {
  ListAdminLocationsResponse,
  GetAdminLocationParams,
  GetAdminLocationResponse,
  ListAdminOneWayFeesResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAllLocations,
  getAdminLocation,
  listOneWayFees,
} from "../services/admin-locations.service.js";

const router: IRouter = Router();

router.get("/admin/locations", requireAdmin, async (_req, res) => {
  const data = await listAllLocations();
  res.json(ListAdminLocationsResponse.parse(data));
});

router.get("/admin/locations/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminLocationParams.parse({ id: req.params.id });
  const location = await getAdminLocation(id);
  res.json(GetAdminLocationResponse.parse(location));
});

router.get("/admin/one-way-fees", requireAdmin, async (_req, res) => {
  const data = await listOneWayFees();
  res.json(ListAdminOneWayFeesResponse.parse(data));
});

export default router;
