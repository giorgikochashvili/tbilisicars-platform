import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listServiceTypes,
  seedServiceTypes,
  listServiceRecords,
  getServiceRecord,
  createServiceRecord,
  updateServiceRecord,
  deleteServiceRecord,
} from "../services/admin-service.service.js";

const router: IRouter = Router();

// Auto-seed categories on startup (idempotent)
seedServiceTypes().catch((e) => console.error("Failed to seed service types:", e));

// ─── Service Types (categories) ───────────────────────────────────────────────

router.get("/admin/service/types", requireAdmin, async (_req, res) => {
  const types = await listServiceTypes();
  res.json(types);
});

// ─── Service Records ──────────────────────────────────────────────────────────

router.get("/admin/service", requireAdmin, async (req, res) => {
  const {
    vehicleSearch,
    serviceTypeId,
    status,
    dateFrom,
    dateTo,
    page,
    limit,
  } = req.query as Record<string, string>;

  const result = await listServiceRecords({
    vehicleSearch: vehicleSearch || undefined,
    serviceTypeId: serviceTypeId ? parseInt(serviceTypeId) : undefined,
    status: status || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 50,
  });
  res.json(result);
});

router.post("/admin/service", requireAdmin, async (req, res) => {
  const {
    vehicleId,
    serviceTypeId,
    serviceDate,
    mileage,
    cost,
    description,
    mechanicName,
    shopName,
    status,
  } = req.body;

  if (!vehicleId || !serviceTypeId) {
    res.status(400).json({ error: "vehicleId and serviceTypeId are required" });
    return;
  }

  const record = await createServiceRecord({
    vehicleId: parseInt(vehicleId),
    serviceTypeId: parseInt(serviceTypeId),
    serviceDate: serviceDate || null,
    mileage: mileage ? parseInt(mileage) : null,
    cost: cost ? cost.toString() : null,
    description: description || null,
    mechanicName: mechanicName || null,
    shopName: shopName || null,
    status: status || "COMPLETED",
  });
  res.status(201).json(record);
});

router.get("/admin/service/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const record = await getServiceRecord(id);
  res.json(record);
});

router.patch("/admin/service/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    vehicleId,
    serviceTypeId,
    serviceDate,
    mileage,
    cost,
    description,
    mechanicName,
    shopName,
    status,
  } = req.body;

  const record = await updateServiceRecord(id, {
    ...(vehicleId !== undefined && { vehicleId: parseInt(vehicleId) }),
    ...(serviceTypeId !== undefined && { serviceTypeId: parseInt(serviceTypeId) }),
    ...(serviceDate !== undefined && { serviceDate }),
    ...(mileage !== undefined && { mileage: mileage ? parseInt(mileage) : null }),
    ...(cost !== undefined && { cost: cost ? cost.toString() : null }),
    ...(description !== undefined && { description }),
    ...(mechanicName !== undefined && { mechanicName }),
    ...(shopName !== undefined && { shopName }),
    ...(status !== undefined && { status }),
  });
  res.json(record);
});

router.delete("/admin/service/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const result = await deleteServiceRecord(id);
  res.json(result);
});

export default router;
