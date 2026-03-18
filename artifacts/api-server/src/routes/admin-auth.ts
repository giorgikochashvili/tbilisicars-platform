import { Router, type IRouter } from "express";
import {
  AdminLoginBody,
  AdminLoginResponse,
  AdminLogoutResponse,
  GetAdminMeResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  loginAdmin,
  logoutAdmin,
  getAdminById,
} from "../services/admin-auth.service.js";

const router: IRouter = Router();

router.post("/auth/admin/login", async (req, res) => {
  const { email, password } = AdminLoginBody.parse(req.body);
  const admin = await loginAdmin(email, password);
  req.session.adminId = admin.id;
  res.json(AdminLoginResponse.parse(admin));
});

router.post("/auth/admin/logout", async (req, res) => {
  await logoutAdmin(req.session);
  res.json(AdminLogoutResponse.parse({ message: "Logged out" }));
});

router.get("/auth/admin/me", requireAdmin, async (req, res) => {
  const admin = await getAdminById(req.session.adminId!);
  res.json(GetAdminMeResponse.parse(admin));
});

export default router;
