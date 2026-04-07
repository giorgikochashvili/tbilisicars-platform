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

router.post("/auth/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("[logout] session destroy error:", err);
      return res.status(500).json({ message: "Logout failed" });
    }

    res.clearCookie("connect.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.json({ message: "Logged out" });
  });
});

router.get("/auth/admin/me", requireAdmin, async (req, res) => {
  const admin = await getAdminById(req.session.adminId!);
  res.json(GetAdminMeResponse.parse(admin));
});

export default router;
