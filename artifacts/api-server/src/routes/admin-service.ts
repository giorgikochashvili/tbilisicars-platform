import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listServiceTypes,
  listServiceRecords,
  createServiceRecord,
  getServiceRecord,
  updateServiceRecord,
  deleteServiceRecord,
} from "../services/admin-service.service.js";
import { logAudit } from "../services/audit.service.js";

const router: IRouter = Router();

router.get("/admin/service/types", requireAdmin, async (_req, res) => {
  const types = await listServiceTypes();
  res.json(types);
});

router.get("/admin/service", requireAdmin, async (req, res) => {
  const filters: Parameters<typeof listServiceRecords>[0] = {};
  if (req.query.vehicleSearch) filters.vehicleSearch = String(req.query.vehicleSearch);
  if (req.query.serviceTypeId) filters.serviceTypeId = parseInt(req.query.serviceTypeId as string);
  if (req.query.status) filters.status = String(req.query.status);
  if (req.query.dateFrom) filters.dateFrom = String(req.query.dateFrom);
  if (req.query.dateTo) filters.dateTo = String(req.query.dateTo);
  if (req.query.page) filters.page = parseInt(req.query.page as string);
  if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
  const records = await listServiceRecords(filters);
  res.json(records);
});

function svcRef(id: number): string {
  return `SVC-${String(id).padStart(5, "0")}`;
}

router.post("/admin/service", requireAdmin, async (req, res) => {
  const {
    vehicleId,
    serviceTypeId,
    serviceCategories,
    serviceDate,
    mileage,
    cost,
    description,
    mechanicName,
    shopName,
    status,
  } = req.body;

  if (!vehicleId) {
    res.status(400).json({ error: "vehicleId is required" });
    return;
  }

  const record = await createServiceRecord({
    vehicleId: parseInt(vehicleId),
    serviceTypeId: serviceTypeId ? parseInt(serviceTypeId) : null,
    serviceCategories: serviceCategories || null,
    serviceDate: serviceDate || null,
    mileage: mileage ? parseInt(mileage) : null,
    cost: cost ? cost.toString() : null,
    description: description || null,
    mechanicName: mechanicName || null,
    shopName: shopName || null,
    status: status || "SCHEDULED",
  });

  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "service",
    entityId: record.id,
    entityRef: svcRef(record.id),
    action: "created",
    summary: `Admin created service record ${svcRef(record.id)} for vehicle ID ${vehicleId}`,
    afterData: { vehicleId: parseInt(vehicleId), status: record.status, cost: record.cost },
  });

  res.status(201).json(record);
});

router.get("/admin/service/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const record = await getServiceRecord(id);
  res.json(record);
});

router.patch("/admin/service/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const {
    vehicleId,
    serviceTypeId,
    serviceCategories,
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
    ...(serviceTypeId !== undefined && { serviceTypeId: serviceTypeId ? parseInt(serviceTypeId) : null }),
    ...(serviceCategories !== undefined && { serviceCategories: serviceCategories || null }),
    ...(serviceDate !== undefined && { serviceDate }),
    ...(mileage !== undefined && { mileage: mileage ? parseInt(mileage) : null }),
    ...(cost !== undefined && { cost: cost ? cost.toString() : null }),
    ...(description !== undefined && { description }),
    ...(mechanicName !== undefined && { mechanicName }),
    ...(shopName !== undefined && { shopName }),
    ...(status !== undefined && { status }),
  });

  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "service",
    entityId: id,
    entityRef: svcRef(id),
    action: "updated",
    summary: `Admin updated service record ${svcRef(id)}`,
    afterData: { status: record.status },
  });

  res.json(record);
});

router.delete("/admin/service/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const result = await deleteServiceRecord(id);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "service",
    entityId: id,
    entityRef: svcRef(id),
    action: "deleted",
    summary: `Admin deleted service record ${svcRef(id)}`,
  });
  res.json(result);
});

export default router;
