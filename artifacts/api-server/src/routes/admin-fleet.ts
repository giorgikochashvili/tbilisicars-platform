import fs from "fs";
import path from "path";
import express, { Router, type IRouter } from "express";
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
  ChangeAdminVehicleLocationParams,
  ChangeAdminVehicleLocationBody,
  ChangeAdminVehicleLocationResponse,
  DeleteAdminVehicleParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
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
  changeAdminVehicleRegion,
  deleteAdminVehicle,
} from "../services/admin-fleet.service.js";
import { getVehicleDetail } from "../services/admin-vehicle-detail.service.js";
import { logAudit, vehicleRef } from "../services/audit.service.js";
import { pool } from "@workspace/db";
import { PRIMARY } from "../lib/uploads-dir.js";

const router: IRouter = Router();

// ─── Brands ───────────────────────────────────────────────────────────────────

router.get("/admin/fleet/brands", requireAdmin, async (_req, res) => {
  const data = await listAdminBrands();
  res.json(ListAdminBrandsResponse.parse(data));
});

router.post("/admin/fleet/brands", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const body = CreateAdminBrandBody.parse(req.body);
  const brand = await createAdminBrand(body);
  res.status(201).json(brand);
});

router.get("/admin/fleet/brands/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminBrandParams.parse({ id: req.params.id });
  const brand = await getAdminBrand(id);
  res.json(GetAdminBrandResponse.parse(brand));
});

router.patch("/admin/fleet/brands/:id", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const { id } = UpdateAdminBrandParams.parse({ id: req.params.id });
  const body = UpdateAdminBrandBody.parse(req.body);
  const brand = await updateAdminBrand(id, body);
  res.json(UpdateAdminBrandResponse.parse(brand));
});

router.delete("/admin/fleet/brands/:id", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const { id } = DeleteAdminBrandParams.parse({ id: req.params.id });
  const result = await deleteAdminBrand(id);
  res.json(result);
});

// ─── Models ───────────────────────────────────────────────────────────────────

router.get("/admin/fleet/models", requireAdmin, async (req, res) => {
  const city = typeof req.query.city === "string" && req.query.city ? req.query.city : undefined;
  const data = await listAdminModels({ city });
  res.json(ListAdminModelsResponse.parse(data));
});

router.post("/admin/fleet/models", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const body = CreateAdminModelBody.parse(req.body);
  const model = await createAdminModel(body);
  res.status(201).json(model);
});

router.get("/admin/fleet/models/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminModelParams.parse({ id: req.params.id });
  const vehicleModel = await getAdminModel(id);
  res.json(GetAdminModelResponse.parse(vehicleModel));
});

router.patch("/admin/fleet/models/:id", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const { id } = UpdateAdminModelParams.parse({ id: req.params.id });
  const body = UpdateAdminModelBody.parse(req.body);
  const model = await updateAdminModel(id, body);
  res.json(UpdateAdminModelResponse.parse(model));
});

router.delete("/admin/fleet/models/:id", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const { id } = DeleteAdminModelParams.parse({ id: req.params.id });
  const result = await deleteAdminModel(id);
  res.json(result);
});

router.put(
  "/admin/fleet/models/:id/image",
  requireAdmin,
  requirePermission("canManageVehicles"),
  express.raw({ type: "image/*", limit: "10mb" }),
  async (req, res) => {
    const modelId = parseInt(req.params.id, 10);
    if (isNaN(modelId) || modelId <= 0) {
      res.status(400).json({ error: "Invalid model id" });
      return;
    }
    const contentType = (req.headers["content-type"] || "image/jpeg").split(";")[0].trim();
    const extMap: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
    };
    const ext = extMap[contentType] ?? ".jpg";
    const filename = `vehicle-model-${modelId}${ext}`;
    const dest = path.join(PRIMARY, filename);
    await fs.promises.writeFile(dest, req.body as Buffer);
    const imageUrl = `/local-uploads/${filename}`;
    await pool.query(
      "UPDATE vehicle_model SET image_url = $1 WHERE id = $2",
      [imageUrl, modelId]
    );
    res.json({ imageUrl });
  }
);

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
  // Extract city before Zod parse (generated schema does not include it)
  const city = typeof req.query.city === "string" && req.query.city ? req.query.city : undefined;
  const q = ListAdminVehiclesQueryParams.parse(req.query);
  const parsedPickupDate = q.availableForPickup ? new Date(q.availableForPickup) : undefined;
  const availableForPickup = parsedPickupDate && !isNaN(parsedPickupDate.getTime()) ? parsedPickupDate : undefined;
  const data = await listAdminVehicles(
    {
      status: q.status as any,
      locationId: q.locationId,
      city,
      modelId: q.modelId,
      groupId: q.groupId,
      availableForPickup,
    },
    q.page,
    q.limit,
  );
  res.json(ListAdminVehiclesResponse.parse(data));
});

router.post("/admin/fleet/vehicles", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const body = CreateAdminVehicleBody.parse(req.body);
  const vehicle = await createAdminVehicle(body as any);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "vehicle",
    entityId: vehicle.id,
    entityRef: vehicleRef((vehicle as any).licensePlate, vehicle.id),
    action: "created",
    summary: `Admin created vehicle ${vehicleRef((vehicle as any).licensePlate, vehicle.id)}`,
    afterData: { status: (vehicle as any).status, licensePlate: (vehicle as any).licensePlate },
  });
  res.status(201).json(vehicle);
});

// ─── Vehicle Detail (operational hub — must be before /:id) ─────────────────
router.get("/admin/fleet/vehicles/:id/detail", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
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

router.patch("/admin/fleet/vehicles/:id", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const { id } = UpdateAdminVehicleParams.parse({ id: req.params.id });

  // Extract partnerId before Zod strips unknown fields
  const rawBody = req.body as Record<string, unknown>;
  const partnerIdRaw = Object.prototype.hasOwnProperty.call(rawBody, "partnerId")
    ? rawBody.partnerId
    : undefined;

  // Fetch current partner_id for audit (before any update)
  let prevPartnerId: number | null = null;
  if (partnerIdRaw !== undefined) {
    const { rows: cur } = await pool.query<{ partner_id: number | null }>(
      "SELECT partner_id FROM vehicle WHERE id = $1",
      [id],
    );
    prevPartnerId = cur[0]?.partner_id ?? null;
  }

  const body = UpdateAdminVehicleBody.parse(rawBody);
  const vehicle = await updateAdminVehicle(id, body as any);
  const plate = (vehicle as any).licensePlate ?? null;

  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "vehicle",
    entityId: id,
    entityRef: vehicleRef(plate, id),
    action: "updated",
    summary: `Admin updated vehicle ${vehicleRef(plate, id)}`,
    afterData: { status: (vehicle as any).status, licensePlate: plate },
  });

  // Handle partner link / unlink
  if (partnerIdRaw !== undefined) {
    const newPartnerId =
      partnerIdRaw === null ? null : Number(partnerIdRaw);
    if (partnerIdRaw !== null && isNaN(newPartnerId as number)) {
      res.status(400).json({ error: "Invalid partnerId" });
      return;
    }

    await pool.query(
      "UPDATE vehicle SET partner_id = $1, updated_at = now() WHERE id = $2",
      [newPartnerId, id],
    );

    if (newPartnerId !== null && newPartnerId !== prevPartnerId) {
      logAudit({
        actorId: req.session.adminId ?? null,
        entityType: "vehicle",
        entityId: id,
        entityRef: vehicleRef(plate, id),
        action: "partner_linked",
        summary: `Vehicle ${vehicleRef(plate, id)} owner partner set to partner #${newPartnerId}`,
        beforeData: prevPartnerId != null ? { partnerId: prevPartnerId } : null,
        afterData: { partnerId: newPartnerId },
      });
    } else if (newPartnerId === null && prevPartnerId !== null) {
      logAudit({
        actorId: req.session.adminId ?? null,
        entityType: "vehicle",
        entityId: id,
        entityRef: vehicleRef(plate, id),
        action: "partner_unlinked",
        summary: `Vehicle ${vehicleRef(plate, id)} owner partner removed (was partner #${prevPartnerId})`,
        beforeData: { partnerId: prevPartnerId },
        afterData: { partnerId: null },
      });
    }
  }

  res.json(UpdateAdminVehicleResponse.parse(vehicle));
});

router.patch("/admin/fleet/vehicles/:id/status", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const { id } = UpdateAdminVehicleStatusParams.parse({ id: req.params.id });
  const { status } = UpdateAdminVehicleStatusBody.parse(req.body);

  // Fetch current status + plate for before snapshot and ref
  const { rows: cur } = await pool.query<{ status: string; license_plate: string | null }>(
    "SELECT status, license_plate FROM vehicle WHERE id = $1",
    [id],
  );
  const prevStatus = cur[0]?.status ?? null;
  const plate = cur[0]?.license_plate ?? null;

  const vehicle = await updateAdminVehicleStatus(id, status as any);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "vehicle",
    entityId: id,
    entityRef: vehicleRef(plate, id),
    action: "status_changed",
    summary: prevStatus
      ? `Admin changed vehicle ${vehicleRef(plate, id)} status from ${prevStatus} to ${status}`
      : `Admin changed vehicle ${vehicleRef(plate, id)} status to ${status}`,
    beforeData: prevStatus ? { status: prevStatus } : null,
    afterData: { status },
  });
  res.json(UpdateAdminVehicleStatusResponse.parse(vehicle));
});

router.patch("/admin/fleet/vehicles/:id/location", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const { id } = ChangeAdminVehicleLocationParams.parse({ id: req.params.id });
  const { city } = ChangeAdminVehicleLocationBody.parse(req.body);
  const { rows: cur } = await pool.query<{ license_plate: string | null }>(
    "SELECT license_plate FROM vehicle WHERE id = $1",
    [id],
  );
  const plate = cur[0]?.license_plate ?? null;
  const vehicle = await changeAdminVehicleRegion(id, city);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "vehicle",
    entityId: id,
    entityRef: vehicleRef(plate, id),
    action: "updated",
    summary: `Admin changed vehicle ${vehicleRef(plate, id)} region to ${city}`,
    afterData: { city },
  });
  res.json(ChangeAdminVehicleLocationResponse.parse(vehicle));
});

router.delete("/admin/fleet/vehicles/:id", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const { id } = DeleteAdminVehicleParams.parse({ id: req.params.id });
  // Fetch plate before deletion
  const { rows: cur } = await pool.query<{ license_plate: string | null }>(
    "SELECT license_plate FROM vehicle WHERE id = $1",
    [id],
  );
  const plate = cur[0]?.license_plate ?? null;
  const result = await deleteAdminVehicle(id);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "vehicle",
    entityId: id,
    entityRef: vehicleRef(plate, id),
    action: "deleted",
    summary: `Admin deleted vehicle ${vehicleRef(plate, id)}`,
  });
  res.json(result);
});

// ─── Vehicle Photos ────────────────────────────────────────────────────────────

router.get("/admin/fleet/vehicles/:id/photos", requireAdmin, async (req, res) => {
  const vehicleId = parseInt(String(req.params.id), 10);
  if (!vehicleId || isNaN(vehicleId)) { res.status(400).json({ error: "Invalid vehicle ID" }); return; }
  const { rows } = await pool.query(
    `SELECT id, photo_url AS "photoUrl", is_primary AS "isPrimary", created_at AS "createdAt" FROM vehiclephoto WHERE vehicle_id = $1 ORDER BY created_at ASC`,
    [vehicleId],
  );
  res.json(rows);
});

router.post("/admin/fleet/vehicles/:id/photos", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const vehicleId = parseInt(String(req.params.id), 10);
  if (!vehicleId || isNaN(vehicleId)) { res.status(400).json({ error: "Invalid vehicle ID" }); return; }
  const { photoUrl } = req.body as { photoUrl?: string };
  if (!photoUrl || typeof photoUrl !== "string") { res.status(400).json({ error: "photoUrl is required" }); return; }
  const { rows } = await pool.query(
    `INSERT INTO vehiclephoto (vehicle_id, photo_url, is_primary) VALUES ($1, $2, false) RETURNING id, photo_url AS "photoUrl", is_primary AS "isPrimary", created_at AS "createdAt"`,
    [vehicleId, photoUrl],
  );
  res.status(201).json(rows[0]);
});

router.delete("/admin/fleet/vehicles/:id/photos/:photoId", requireAdmin, requirePermission("canManageVehicles"), async (req, res) => {
  const vehicleId = parseInt(String(req.params.id), 10);
  const photoId = parseInt(String(req.params.photoId), 10);
  if (!vehicleId || isNaN(vehicleId) || !photoId || isNaN(photoId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await pool.query("DELETE FROM vehiclephoto WHERE id = $1 AND vehicle_id = $2", [photoId, vehicleId]);
  res.json({ ok: true });
});

export default router;
