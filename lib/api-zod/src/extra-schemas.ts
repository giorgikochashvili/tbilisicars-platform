import zod from "zod";

const AdminRateDayRangeItem = zod.object({
  id: zod.number(),
  rateId: zod.number(),
  fromDays: zod.number(),
  toDays: zod.number().nullable(),
  label: zod.string().nullable().optional(),
  createdAt: zod.date(),
  updatedAt: zod.date(),
});

export const CreateRateDayRangeParams = zod.object({
  id: zod.coerce.number(),
});

export const CreateRateDayRangeBody = zod.object({
  fromDays: zod.number(),
  toDays: zod.number().optional().nullable(),
  label: zod.string().optional().nullable(),
});

export const CreateRateDayRangeResponse = AdminRateDayRangeItem;

export const BulkSetRateDayRangesParams = zod.object({
  id: zod.coerce.number(),
});

export const BulkSetRateDayRangesBody = zod.object({
  ranges: zod.array(
    zod.object({
      fromDays: zod.number(),
      toDays: zod.number().optional().nullable(),
      label: zod.string().optional().nullable(),
    }),
  ),
});

export const BulkSetRateDayRangesResponse = zod.array(AdminRateDayRangeItem);

export const DeleteRateDayRangeParams = zod.object({
  id: zod.coerce.number(),
  rangeId: zod.coerce.number(),
});

/**
 * Returns all promotions including inactive ones.
 * @summary List all promotions (admin)
 */

export const GetAdminDashboardWebsiteBookingsResponse = zod.object({
  pendingCount: zod.number(),
  confirmedCount: zod.number(),
  recent: zod.array(
    zod.object({
      id: zod.number(),
      status: zod.enum([
        "PENDING",
        "CONFIRMED",
        "DELIVERED",
        "RETURNED",
        "CANCELED",
        "NO_SHOW",
      ]),
      paymentStatus: zod.enum(["UNPAID", "HALF", "PAID", "PREPAID", "REFUNDED"]),
      contactFullName: zod.string(),
      contactEmail: zod.string().nullish(),
      contactPhone: zod.string().nullish(),
      pickupDatetime: zod.date(),
      dropoffDatetime: zod.date(),
      totalAmount: zod.string().nullish(),
      currency: zod.string().nullish(),
      source: zod.string().nullish(),
      broker: zod.string().nullish(),
      customer: zod.object({
        id: zod.number(),
        fullName: zod.string().nullish(),
        email: zod.string().nullish(),
      }),
      vehicle: zod
        .object({
          id: zod.number(),
          licensePlate: zod.string().nullish(),
          modelName: zod.string().nullish(),
          brandName: zod.string().nullish(),
        })
        .nullish(),
      vehicleModelName: zod.string().nullish(),
      vehicleModelBrandName: zod.string().nullish(),
      pickupLocation: zod.object({
        id: zod.number(),
        name: zod.string(),
      }),
      dropoffLocation: zod.object({
        id: zod.number(),
        name: zod.string(),
      }),
      partner: zod
        .object({
          id: zod.number(),
          name: zod.string(),
        })
        .nullish(),
      createdAt: zod.date(),
    }),
  ),
});

/**
 * @summary Vehicle counts by status (admin)
 */

export const TaskStatusEnum = zod.enum(["To Do", "In Progress", "Waiting", "Done", "Canceled"]);

export const TaskPriorityEnum = zod.enum(["Low", "Medium", "High", "Urgent"]);

export const TaskListItem = zod.object({
  id: zod.number(),
  title: zod.string(),
  description: zod.string().nullable(),
  status: zod.string(),
  priority: zod.string(),
  progressPercent: zod.number(),
  startDate: zod.string().nullable(),
  dueDate: zod.string().nullable(),
  completedAt: zod.string().nullable(),
  relatedType: zod.string().nullable(),
  relatedId: zod.number().nullable(),
  createdById: zod.number(),
  assignedToId: zod.number().nullable(),
  assigneeName: zod.string().nullable(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});

export const TaskComment = zod.object({
  id: zod.number(),
  taskId: zod.number(),
  authorId: zod.number(),
  authorName: zod.string().nullable(),
  body: zod.string(),
  createdAt: zod.string(),
  updatedAt: zod.string(),
});

export const TaskActivity = zod.object({
  id: zod.number(),
  taskId: zod.number(),
  actorId: zod.number(),
  actorName: zod.string().nullable(),
  action: zod.string(),
  fromValue: zod.string().nullable(),
  toValue: zod.string().nullable(),
  createdAt: zod.string(),
});

export const TaskDetail = TaskListItem.extend({
  creatorName: zod.string().nullable(),
  comments: zod.array(TaskComment),
  activity: zod.array(TaskActivity),
});

export const ListAdminTasksResponse = zod.object({
  tasks: zod.array(TaskListItem),
  total: zod.number(),
  page: zod.number(),
  limit: zod.number(),
});

export const CreateAdminTaskBody = zod.object({
  title: zod.string().min(1),
  description: zod.string().nullable().optional(),
  assignedToId: zod.number().nullable().optional(),
  priority: TaskPriorityEnum.optional().default("Medium"),
  status: TaskStatusEnum.optional().default("To Do"),
  progressPercent: zod.number().int().min(0).max(100).optional().default(0),
  startDate: zod.string().nullable().optional(),
  dueDate: zod.string().nullable().optional(),
  relatedType: zod.string().nullable().optional(),
  relatedId: zod.number().nullable().optional(),
});

export const UpdateAdminTaskBody = zod.object({
  title: zod.string().min(1).optional(),
  description: zod.string().nullable().optional(),
  assignedToId: zod.number().nullable().optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  progressPercent: zod.number().int().min(0).max(100).optional(),
  startDate: zod.string().nullable().optional(),
  dueDate: zod.string().nullable().optional(),
  relatedType: zod.string().nullable().optional(),
  relatedId: zod.number().nullable().optional(),
});

export const GetAdminTaskParams = zod.object({
  id: zod.coerce.number(),
});

export const CreateTaskCommentBody = zod.object({
  body: zod.string().min(1),
});

export const TaskSummaryResponse = zod.object({
  total: zod.number(),
  overdue: zod.number(),
  dueToday: zod.number(),
});

export const TaskAssigneeItem = zod.object({
  id: zod.number(),
  fullName: zod.string(),
  email: zod.string(),
});

// ─── Website Discount Module ──────────────────────────────────────────────────

export const WebsiteDiscountTypeEnum = zod.enum(["PERCENT", "FIXED"]);

const DiscountVehicleModelItem = zod.object({
  vehicleModelId: zod.number(),
  modelName: zod.string().nullable(),
  brandName: zod.string().nullable(),
});

export const DiscountPickupLocationItem = zod.object({
  locationId: zod.number(),
  locationName: zod.string().nullable(),
  locationCity: zod.string().nullable(),
});

export const AdminDiscountItem = zod.object({
  id: zod.number(),
  name: zod.string(),
  discountType: WebsiteDiscountTypeEnum,
  value: zod.union([zod.string(), zod.number()]),
  startDate: zod.string(),
  endDate: zod.string(),
  pickupLocationId: zod.number(),
  pickupLocationName: zod.string().nullable(),
  pickupLocationCity: zod.string().nullable(),
  isActive: zod.boolean(),
  createdAt: zod.coerce.date(),
  updatedAt: zod.coerce.date(),
  vehicleModels: zod.array(DiscountVehicleModelItem),
  pickupLocations: zod.array(DiscountPickupLocationItem),
});

export const ListAdminDiscountsResponse = zod.array(AdminDiscountItem);

export const GetAdminDiscountParams = zod.object({
  id: zod.coerce.number(),
});

export const GetAdminDiscountResponse = AdminDiscountItem;

export const CreateAdminDiscountBody = zod.object({
  name: zod.string().min(1),
  discountType: WebsiteDiscountTypeEnum,
  value: zod.number().positive(),
  startDate: zod.string().min(1),
  endDate: zod.string().min(1),
  pickupLocationIds: zod.array(zod.number().int().positive()).min(1),
  isActive: zod.boolean().optional().default(true),
  vehicleModelIds: zod.array(zod.number().int().positive()).min(1),
});

export const UpdateAdminDiscountParams = zod.object({
  id: zod.coerce.number(),
});

export const UpdateAdminDiscountBody = zod.object({
  name: zod.string().min(1).optional(),
  discountType: WebsiteDiscountTypeEnum.optional(),
  value: zod.number().positive().optional(),
  startDate: zod.string().min(1).optional(),
  endDate: zod.string().min(1).optional(),
  pickupLocationIds: zod.array(zod.number().int().positive()).min(1).optional(),
  isActive: zod.boolean().optional(),
  vehicleModelIds: zod.array(zod.number().int().positive()).min(1).optional(),
});

export const DeleteAdminDiscountParams = zod.object({
  id: zod.coerce.number(),
});

export const DeleteAdminDiscountResponse = zod.object({
  message: zod.string(),
});
