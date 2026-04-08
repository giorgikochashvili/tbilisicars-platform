import { Router } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listParkingByZone,
  assignVehicleToZone,
  moveVehicleToZone,
  removeFromParking,
} from "../services/admin-parking.service.js";

const router = Router();

// GET /api/admin/parking — list all zones with their active vehicles
router.get("/admin/parking", requireAdmin, async (req, res) => {
  const zones = await listParkingByZone();
  res.json(zones);
});

// POST /api/admin/parking — assign a vehicle to a zone
router.post("/admin/parking", requireAdmin, async (req, res) => {
  const { vehicleId, zone } = req.body as { vehicleId: number; zone: string };
  if (!vehicleId || typeof vehicleId !== "number" || !zone) {
    res.status(400).json({ error: "vehicleId (number) and zone (string) are required" });
    return;
  }
  const adminId = req.session.adminId ?? null;
  const assignment = await assignVehicleToZone(vehicleId, zone, adminId);
  res.status(201).json(assignment);
});

// PATCH /api/admin/parking/:id/zone — move vehicle to a different zone (atomic)
router.patch("/admin/parking/:id/zone", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid assignment ID" });
    return;
  }
  const { zone } = req.body as { zone: string };
  if (!zone) {
    res.status(400).json({ error: "zone is required" });
    return;
  }
  const adminId = req.session.adminId ?? null;
  const assignment = await moveVehicleToZone(id, zone, adminId);
  res.json(assignment);
});

// DELETE /api/admin/parking/:id — remove (soft-delete) a parking assignment
router.delete("/admin/parking/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid assignment ID" });
    return;
  }
  const result = await removeFromParking(id);
  res.json(result);
});

export default router;
