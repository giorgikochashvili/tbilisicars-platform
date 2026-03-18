import { Router, type IRouter } from "express";
import {
  ListAdminRatesResponse,
  GetAdminRateParams,
  GetAdminRateResponse,
  CreateAdminRateBody,
  UpdateAdminRateParams,
  UpdateAdminRateBody,
  UpdateAdminRateResponse,
  DeleteAdminRateParams,
  CreateAdminRateTierParams,
  CreateAdminRateTierBody,
  UpdateAdminRateTierParams,
  UpdateAdminRateTierBody,
  UpdateAdminRateTierResponse,
  DeleteAdminRateTierParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listAllRates,
  getAdminRate,
  createAdminRate,
  updateAdminRate,
  deleteAdminRate,
  createAdminRateTier,
  updateAdminRateTier,
  deleteAdminRateTier,
} from "../services/admin-rates.service.js";

const router: IRouter = Router();

router.get("/admin/rates", requireAdmin, async (_req, res) => {
  const data = await listAllRates();
  res.json(ListAdminRatesResponse.parse(data));
});

router.post("/admin/rates", requireAdmin, async (req, res) => {
  const body = CreateAdminRateBody.parse(req.body);
  const rate = await createAdminRate(body as any);
  res.status(201).json(rate);
});

router.get("/admin/rates/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminRateParams.parse({ id: req.params.id });
  const rate = await getAdminRate(id);
  res.json(GetAdminRateResponse.parse(rate));
});

router.patch("/admin/rates/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminRateParams.parse({ id: req.params.id });
  const body = UpdateAdminRateBody.parse(req.body);
  const rate = await updateAdminRate(id, body as any);
  res.json(UpdateAdminRateResponse.parse(rate));
});

router.delete("/admin/rates/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminRateParams.parse({ id: req.params.id });
  const result = await deleteAdminRate(id);
  res.json(result);
});

router.post("/admin/rates/:id/tiers", requireAdmin, async (req, res) => {
  const { id: rateId } = CreateAdminRateTierParams.parse({ id: req.params.id });
  const body = CreateAdminRateTierBody.parse(req.body);
  const tier = await createAdminRateTier(rateId, body as any);
  res.status(201).json(tier);
});

router.patch("/admin/rates/:id/tiers/:tierId", requireAdmin, async (req, res) => {
  const { id: rateId, tierId } = UpdateAdminRateTierParams.parse({
    id: req.params.id,
    tierId: req.params.tierId,
  });
  const body = UpdateAdminRateTierBody.parse(req.body);
  const tier = await updateAdminRateTier(rateId, tierId, body as any);
  res.json(UpdateAdminRateTierResponse.parse(tier));
});

router.delete("/admin/rates/:id/tiers/:tierId", requireAdmin, async (req, res) => {
  const { id: rateId, tierId } = DeleteAdminRateTierParams.parse({
    id: req.params.id,
    tierId: req.params.tierId,
  });
  const result = await deleteAdminRateTier(rateId, tierId);
  res.json(result);
});

export default router;
