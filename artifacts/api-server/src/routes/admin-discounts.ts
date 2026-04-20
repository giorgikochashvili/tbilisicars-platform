import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import {
  ListAdminDiscountsResponse,
  GetAdminDiscountParams,
  GetAdminDiscountResponse,
  CreateAdminDiscountBody,
  UpdateAdminDiscountParams,
  UpdateAdminDiscountBody,
  DeleteAdminDiscountParams,
} from "@workspace/api-zod";
import {
  listAllDiscounts,
  getAdminDiscount,
  createAdminDiscount,
  updateAdminDiscount,
  deleteAdminDiscount,
} from "../services/admin-discounts.service.js";

const router: IRouter = Router();

router.get("/admin/discounts", requireAdmin, async (_req, res) => {
  const data = await listAllDiscounts();
  res.json(ListAdminDiscountsResponse.parse(data));
});

router.post(
  "/admin/discounts",
  requireAdmin,
  requirePermission("canManageRates"),
  async (req, res) => {
    let body: ReturnType<typeof CreateAdminDiscountBody.parse>;
    try {
      body = CreateAdminDiscountBody.parse(req.body);
    } catch (err: any) {
      return res.status(422).json({ error: err.message ?? "Invalid request body" });
    }

    try {
      const discount = await createAdminDiscount(body);
      return res.status(201).json(discount);
    } catch (err: any) {
      if (typeof err.message === "string" && err.message.startsWith("VALIDATION:")) {
        return res.status(422).json({ error: err.message.replace("VALIDATION: ", "") });
      }
      if (typeof err.message === "string" && err.message.startsWith("OVERLAP:")) {
        return res.status(409).json({ error: err.message.replace("OVERLAP: ", "") });
      }
      throw err;
    }
  },
);

router.get("/admin/discounts/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminDiscountParams.parse({ id: req.params.id });
  const discount = await getAdminDiscount(id);
  res.json(GetAdminDiscountResponse.parse(discount));
});

router.patch(
  "/admin/discounts/:id",
  requireAdmin,
  requirePermission("canManageRates"),
  async (req, res) => {
    const { id } = UpdateAdminDiscountParams.parse({ id: req.params.id });
    let body: ReturnType<typeof UpdateAdminDiscountBody.parse>;
    try {
      body = UpdateAdminDiscountBody.parse(req.body);
    } catch (err: any) {
      return res.status(422).json({ error: err.message ?? "Invalid request body" });
    }

    try {
      const discount = await updateAdminDiscount(id, body);
      return res.json(discount);
    } catch (err: any) {
      if (typeof err.message === "string" && err.message.startsWith("VALIDATION:")) {
        return res.status(422).json({ error: err.message.replace("VALIDATION: ", "") });
      }
      if (typeof err.message === "string" && err.message.startsWith("OVERLAP:")) {
        return res.status(409).json({ error: err.message.replace("OVERLAP: ", "") });
      }
      throw err;
    }
  },
);

router.delete(
  "/admin/discounts/:id",
  requireAdmin,
  requirePermission("canManageRates"),
  async (req, res) => {
    const { id } = DeleteAdminDiscountParams.parse({ id: req.params.id });
    const result = await deleteAdminDiscount(id);
    res.json(result);
  },
);

export default router;
