import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";
import * as jose from "jose";
import { z } from "zod";
import { eq, and, count, desc, asc, inArray, notInArray, gte, lte, or, sql, gt, lt, ne, isNull, isNotNull } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { fmtDate, todayIST } from "@/lib/utils";
import { broadcastPush } from "@/lib/push-core";

function randomHex(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

const SESSION_COOKIE = "bb_session";
const BCRYPT_ROUNDS = 10;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");

// Roles that can access any location within their school
const SCHOOL_WIDE_ROLES = new Set(["super_admin", "school_admin", "accountant"]);

// ── Uniform admission number: SCHOOL_CODE/YY/NNN ───────────────────────────────
// Derives a 2-3 letter school code from the school name and appends the
// last two digits of the current year plus the auto-incremented student id.
function schoolCodeFromName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z\s]/g, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SCH";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
}

function generateAdmissionNumber(schoolName: string, studentId: number): string {
  const code = schoolCodeFromName(schoolName);
  const year = new Date().getFullYear() % 100;
  const seq = String(studentId).padStart(3, "0");
  return `${code}/${year}/${seq}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN LIMITS — single source of truth
// These are defaults; per-school overrides live in schools.max_students etc.
// ─────────────────────────────────────────────────────────────────────────────
export const PLAN_LIMITS: Record<string, { maxStudents: number; maxStaff: number; maxLocations: number }> = {
  free:       { maxStudents: 50,        maxStaff: 3,         maxLocations: 1  },
  growth:     { maxStudents: Infinity,  maxStaff: Infinity,  maxLocations: 5  },
  enterprise: { maxStudents: Infinity,  maxStaff: Infinity,  maxLocations: Infinity },
};

// Error class that carries a machine-readable code the UI can act on
export class PlanLimitError extends Error {
  code = "PLAN_LIMIT_EXCEEDED";
  resource: string;
  current: number;
  limit: number;
  plan: string;
  constructor(resource: string, current: number, limit: number, plan: string) {
    super(`PLAN_LIMIT_EXCEEDED:${resource}:${current}:${limit}:${plan}`);
    this.resource = resource;
    this.current  = current;
    this.limit    = limit;
    this.plan     = plan;
  }
}

// Call this before inserting a new resource. Throws PlanLimitError if over limit.
async function checkPlanLimit(schoolId: number, resource: "students" | "staff" | "locations") {
  const { db } = await import("@/lib/db");
  const { schools, students, staff, locations } = await import("@/lib/db/schema");

  const [school] = await db
    .select({ plan: schools.plan, maxStudents: schools.maxStudents, maxStaff: schools.maxStaff, maxLocations: schools.maxLocations })
    .from(schools).where(eq(schools.id, schoolId)).limit(1);
  if (!school) throw new Error("School not found");

  const planDefaults = PLAN_LIMITS[school.plan ?? "free"] ?? PLAN_LIMITS.free;

  let limit: number;
  let current: number;

  if (resource === "students") {
    limit = school.maxStudents ?? planDefaults.maxStudents;
    const [{ cnt }] = await db.select({ cnt: count() }).from(students)
      .where(and(eq(students.schoolId, schoolId)));
    current = Number(cnt);
  } else if (resource === "staff") {
    limit = school.maxStaff ?? planDefaults.maxStaff;
    const [{ cnt }] = await db.select({ cnt: count() }).from(staff)
      .where(and(eq(staff.schoolId, schoolId), eq(staff.status, "active")));
    current = Number(cnt);
  } else {
    limit = school.maxLocations ?? planDefaults.maxLocations;
    const [{ cnt }] = await db.select({ cnt: count() }).from(locations)
      .where(and(eq(locations.schoolId, schoolId), eq(locations.status, "active")));
    current = Number(cnt);
  }

  if (limit !== Infinity && current >= limit) {
    throw new PlanLimitError(resource, current, limit, school.plan ?? "free");
  }
}

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

async function createSessionToken(payload: jose.JWTPayload) {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

async function verifySessionToken(token: string) {
  return await jose.jwtVerify(token, JWT_SECRET);
}


const signupSchema = z.object({
  schoolName: z.string().trim().min(2).max(255),
  schoolEmail: z.string().trim().email().max(255),
  schoolPhone: z.string().trim().max(50),
  schoolAddress: z.string().trim().min(1).max(1000),
  schoolCity: z.string().trim().min(1).max(100),
  schoolState: z.string().trim().min(1).max(100),
  schoolPincode: z.string().trim().min(1).max(20),
  schoolCountry: z.string().trim().max(100).default("India"),
  facilityType: z.enum(["school", "daycare", "both"]).default("school"),
  fullName: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(100),
});

export const signup = createServerFn({ method: "POST" })
  .validator((input: unknown) => signupSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { schools, locations, users, subscriptions, plans, otps } = await import("@/lib/db/schema");

    const email = normalizeEmail(data.email);

    // Check duplicate email
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw new Error("This email is already registered. Try signing in instead.");

    const skipConfirmation = process.env.SKIP_EMAIL_CONFIRMATION === "true";
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const appUrl = process.env.VITE_APP_URL ?? "http://localhost:3000";
    const { sendConfirmationEmail } = await import("@/lib/email");

    return await db.transaction(async (tx) => {
      const [schoolResult] = await tx.insert(schools).values({
        name: data.schoolName,
        email: data.schoolEmail ? normalizeEmail(data.schoolEmail) : null,
        phone: data.schoolPhone,
        address: data.schoolAddress,
        city: data.schoolCity,
        state: data.schoolState,
        pincode: data.schoolPincode,
        country: data.schoolCountry,
        status: "active",
        plan: "free",
        maxLocations: 1,
      });
      const schoolId = Number((schoolResult as any).insertId);

      const [locationResult] = await tx.insert(locations).values({
        schoolId,
        name: "Main Branch",
        address: data.schoolAddress,
        city: data.schoolCity,
        state: data.schoolState,
        pincode: data.schoolPincode,
        phone: data.schoolPhone,
        facilityType: data.facilityType,
        status: "active",
      });
      const locationId = Number((locationResult as any).insertId);

      const [freePlan] = await tx.select({ id: plans.id, name: plans.name }).from(plans).where(eq(plans.name, "Free")).limit(1);
      if (!freePlan) throw new Error("Free plan not found. Please seed plans.");

      await tx.insert(subscriptions).values({
        schoolId,
        plan: freePlan.name.toLowerCase(),
        planId: freePlan.id,
        amount: "0",
        currency: "INR",
        billingCycle: "monthly",
        status: "active",
      });

      const [userResult] = await tx.insert(users).values({
        schoolId,
        locationId,
        email,
        passwordHash,
        firstName: data.fullName,
        lastName: "",
        role: "school_admin",
        status: "active",
        emailConfirmed: skipConfirmation ? 1 : 0,
      });
      const userId = Number((userResult as any).insertId);

      if (skipConfirmation) {
        const token = await createSessionToken({ userId, schoolId, locationId, role: "school_admin", email });
        return { confirmed: true, token };
      }

      const now = new Date();
      const confirmToken = randomHex(32);
      await tx.insert(otps).values({
        email,
        code: confirmToken,
        type: "email_confirm",
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        used: 0,
      });

      await sendConfirmationEmail(email, confirmToken, appUrl);

      return { confirmed: false, token: null };
    });
  });

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(100),
});

export const login = createServerFn({ method: "POST" })
  .validator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");

    const email = normalizeEmail(data.email);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash) {
      throw new Error("Invalid email or password");
    }

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) throw new Error("Invalid email or password");

    const skipConfirmation = process.env.SKIP_EMAIL_CONFIRMATION === "true";
    if (!user.emailConfirmed && !skipConfirmation) {
      throw new Error("Please confirm your email before signing in. Check your inbox for the confirmation link.");
    }

    // Check school suspension — block school/location admins, teachers, staff
    // but allow parents to still log in (they only see their child's data)
    if (user.schoolId && user.role !== "parent" && user.role !== "super_admin") {
      const { schools: schoolsTable } = await import("@/lib/db/schema");
      const [schoolRow] = await db
        .select({ status: schoolsTable.status })
        .from(schoolsTable)
        .where(eq(schoolsTable.id, user.schoolId))
        .limit(1);
      if (schoolRow?.status === "suspended") {
        throw new Error("Your school account has been suspended. Please contact EduPulse support.");
      }
    }

    await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

    const token = await createSessionToken({
      userId: user.id,
      schoolId: user.schoolId,
      locationId: user.locationId,
      role: user.role,
      email,
    });

    // Fetch school + location names so client can hydrate tenant immediately
    const { schools, locations } = await import("@/lib/db/schema");
    const [school] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, user.schoolId)).limit(1);
    const [location] = user.locationId
      ? await db.select({ name: locations.name }).from(locations).where(eq(locations.id, user.locationId as number)).limit(1)
      : [null];

    return {
      userId: user.id,
      schoolId: user.schoolId,
      locationId: user.locationId,
      schoolName: school?.name ?? "School",
      locationName: location?.name ?? "Main Branch",
      role: user.role,
      token,
    };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  return { ok: true };
});

// ── confirmEmail — verify token from the confirmation email link ──────────────
export const confirmEmail = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { otps, users } = await import("@/lib/db/schema");

    const now = new Date();
    const [otp] = await db
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.code, data.token),
          eq(otps.type, "email_confirm"),
          eq(otps.used, 0),
          gt(otps.expiresAt, now),
        ),
      )
      .limit(1);

    if (!otp) throw new Error("This confirmation link is invalid or has expired.");

    // Mark token used
    await db.update(otps).set({ used: 1 }).where(eq(otps.id, otp.id));

    // Mark user confirmed + active
    await db
      .update(users)
      .set({ emailConfirmed: 1, status: "active" })
      .where(eq(users.email, otp.email));

    // Auto-login: create session token
    const [user] = await db
      .select({ id: users.id, schoolId: users.schoolId, locationId: users.locationId, role: users.role })
      .from(users)
      .where(eq(users.email, otp.email))
      .limit(1);

    if (!user) throw new Error("User not found.");

    const token = await createSessionToken({
      userId: user.id,
      schoolId: user.schoolId,
      locationId: user.locationId,
      role: user.role,
      email: otp.email,
    });

    return { token };
  });

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) return null;

  try {
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) return null;

    const { db } = await import("@/lib/db");
    const { users, schools, locations } = await import("@/lib/db/schema");
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        schoolId: users.schoolId,
        locationId: users.locationId,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    // If the school is suspended, invalidate sessions for all non-parent roles
    if (user.schoolId && user.role !== "parent" && user.role !== "super_admin") {
      const [schoolRow] = await db
        .select({ status: schools.status })
        .from(schools)
        .where(eq(schools.id, user.schoolId))
        .limit(1);
      if (schoolRow?.status === "suspended") return null;
    }

    // Fetch facilityType for the user's location so the UI can hide daycare for school-only branches
    let facilityType: string = "school";
    if (user.locationId) {
      const [loc] = await db
        .select({ facilityType: locations.facilityType })
        .from(locations)
        .where(eq(locations.id, user.locationId))
        .limit(1);
      facilityType = loc?.facilityType ?? "school";
    }

    // Fetch daycareEnabled from the school's subscription (per-school add-on toggle)
    let daycareEnabled = false;
    if (user.schoolId) {
      const { subscriptions } = await import("@/lib/db/schema");
      const [sub] = await db
        .select({ daycareEnabled: subscriptions.daycareEnabled })
        .from(subscriptions)
        .where(and(eq(subscriptions.schoolId, user.schoolId), inArray(subscriptions.status, ["active", "trialing"])))
        .orderBy(subscriptions.id)
        .limit(1);
      daycareEnabled = !!(sub?.daycareEnabled);
    }

    return { ...user, facilityType, daycareEnabled };
  } catch {
    return null;
  }
});

const forgotSchema = z.object({
  email: z.string().trim().email().max(255),
});

export const forgotPassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => forgotSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { users, otps } = await import("@/lib/db/schema");

    const email = normalizeEmail(data.email);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    // Always return ok to avoid email enumeration
    if (!user) return { ok: true };

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = new Date();
    const expires = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

    const [insertResult] = await db.insert(otps).values({
      email,
      code,
      type: "password_reset",
      expiresAt: expires,
      used: 0,
    });
    const otpId = Number((insertResult as any).insertId);

    const { sendOtpEmail } = await import("@/lib/email");
    try {
      await sendOtpEmail(email, code);
    } catch (e) {
      console.error("Failed to send OTP email:", e);
      await db.delete(otps).where(eq(otps.id, otpId));
      throw new Error("Could not send password reset email. Please check the SMTP configuration.");
    }

    return { ok: true };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string; code: string }) => d)
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { otps } = await import("@/lib/db/schema");

    const email = normalizeEmail(data.email);
    const now = new Date();

    const [otp] = await db
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.email, email),
          eq(otps.code, data.code),
          eq(otps.type, "password_reset"),
          eq(otps.used, 0),
          gt(otps.expiresAt, now),
        ),
      )
      .limit(1);

    if (!otp) throw new Error("Invalid or expired OTP. Please try again.");

    // Mark OTP used
    await db.update(otps).set({ used: 1 }).where(eq(otps.id, otp.id));

    // Issue a short-lived reset token stored in otps table
    const resetToken = randomHex(24);
    const resetExpires = new Date(now.getTime() + 10 * 60 * 1000); // 10 min

    await db.insert(otps).values({
      email,
      code: resetToken,
      type: "password_reset",
      expiresAt: resetExpires,
      used: 0,
    });

    return { resetToken };
  });

const resetSchema = z.object({
  email: z.string().trim().email().max(255),
  resetToken: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export const resetPassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => resetSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { users, otps } = await import("@/lib/db/schema");

    const email = normalizeEmail(data.email);
    const now = new Date();

    const [tokenRow] = await db
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.email, email),
          eq(otps.code, data.resetToken),
          eq(otps.type, "password_reset"),
          eq(otps.used, 0),
          gt(otps.expiresAt, now),
        ),
      )
      .limit(1);

    if (!tokenRow) throw new Error("Reset session expired. Please start over.");

    await db.update(otps).set({ used: 1 }).where(eq(otps.id, tokenRow.id));

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    await db.update(users).set({ passwordHash }).where(eq(users.email, email));

    return { ok: true };
  });

const updateProfileSchema = z.object({
  firstName: z.string().max(255).optional(),
  lastName: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
});

export const updateProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateProfileSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");

    await db
      .update(users)
      .set({
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        phone: data.phone || null,
      })
      .where(eq(users.id, userId));

    return { ok: true };
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().max(100).optional().default(""),
  newPassword: z.string().min(8).max(100),
});

export const changePassword = createServerFn({ method: "POST" })
  .validator((input: unknown) => changePasswordSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");

    // Only verify current password when explicitly provided (e.g. unauthenticated reset flow)
    if (data.currentPassword) {
      const [user] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user || !user.passwordHash) throw new Error("User not found");

      const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!ok) throw new Error("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

    return { ok: true };
  });

const getTenantOptionsSchema = z.object({
  schoolId: z.number().optional(),
});

export const getTenantOptions = createServerFn({ method: "GET" })
  .validator((input: unknown) => getTenantOptionsSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const { db } = await import("@/lib/db");
    const { users, schools, locations } = await import("@/lib/db/schema");

    const [user] = await db
      .select({
        id: users.id,
        role: users.role,
        schoolId: users.schoolId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");

    if (user.role === "super_admin") {
      const allSchools = await db
        .select({ id: schools.id, name: schools.name })
        .from(schools)
        .where(eq(schools.status, "active"));
      const selectedSchoolId = data.schoolId ?? allSchools[0]?.id;
      const locs = selectedSchoolId
        ? await db
            .select({ id: locations.id, name: locations.name, facilityType: locations.facilityType })
            .from(locations)
            .where(eq(locations.schoolId, selectedSchoolId))
        : [];
      return { role: user.role, schools: allSchools, locations: locs };
    }

    const selectedSchoolId = user.schoolId;
    const userSchool = await db
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(eq(schools.id, selectedSchoolId))
      .limit(1);
    const locs = await db
      .select({ id: locations.id, name: locations.name, facilityType: locations.facilityType })
      .from(locations)
      .where(eq(locations.schoolId, selectedSchoolId));

    return { role: user.role, schools: userSchool, locations: locs };
  });

const getDashboardStatsSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
});

export const getDashboardStats = createServerFn({ method: "GET" })
  .validator((input: unknown) => getDashboardStatsSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const { db } = await import("@/lib/db");
    const { users, inquiries, students, classes, staff, invoices } = await import("@/lib/db/schema");

    const [user] = await db
      .select({
        id: users.id,
        role: users.role,
        schoolId: users.schoolId,
        locationId: users.locationId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "super_admin") {
      if (user.schoolId !== data.schoolId) throw new Error("Not authorized");
      if (!SCHOOL_WIDE_ROLES.has(user.role ?? "") && user.locationId !== data.locationId) throw new Error("Not authorized");
    }

    const base = and(
      eq(inquiries.schoolId, data.schoolId),
      eq(inquiries.locationId, data.locationId)
    );

    const [inquiriesCount] = await db.select({ count: count() }).from(inquiries).where(base);
    const [studentsCount] = await db
      .select({ count: count() })
      .from(students)
      .where(and(eq(students.schoolId, data.schoolId), eq(students.locationId, data.locationId)));
    const [classesCount] = await db
      .select({ count: count() })
      .from(classes)
      .where(and(eq(classes.schoolId, data.schoolId), eq(classes.locationId, data.locationId)));
    const [staffCount] = await db
      .select({ count: count() })
      .from(staff)
      .where(and(eq(staff.schoolId, data.schoolId), eq(staff.locationId, data.locationId)));
    const [pendingFeesCount] = await db
      .select({ count: count() })
      .from(invoices)
      .where(
        and(
          eq(invoices.schoolId, data.schoolId),
          eq(invoices.locationId, data.locationId),
          inArray(invoices.status, ["sent", "overdue"])
        )
      );

    const recentInquiries = await db
      .select({
        parentName: inquiries.parentName,
        childName: inquiries.childName,
        programInterest: inquiries.programInterest,
        status: inquiries.status,
      })
      .from(inquiries)
      .where(base)
      .orderBy(desc(inquiries.createdAt))
      .limit(3);

    // "Upcoming" = sent invoices with a future (or today) due date, soonest first.
    // "Overdue"  = sent/overdue invoices whose due date has already passed.
    // We show upcoming first; if fewer than 5, backfill with overdue (most recent first).
    const today = todayIST();

    const upcomingRows = await db
      .select({
        amount: invoices.amount,
        dueDate: invoices.dueDate,
        status: invoices.status,
        firstName: students.firstName,
        lastName: students.lastName,
      })
      .from(invoices)
      .leftJoin(students, eq(invoices.studentId, students.id))
      .where(
        and(
          eq(invoices.schoolId, data.schoolId),
          eq(invoices.locationId, data.locationId),
          eq(invoices.status, "sent"),
          gte(invoices.dueDate, today)
        )
      )
      .orderBy(asc(invoices.dueDate))
      .limit(5);

    const overdueRows = await db
      .select({
        amount: invoices.amount,
        dueDate: invoices.dueDate,
        status: invoices.status,
        firstName: students.firstName,
        lastName: students.lastName,
      })
      .from(invoices)
      .leftJoin(students, eq(invoices.studentId, students.id))
      .where(
        and(
          eq(invoices.schoolId, data.schoolId),
          eq(invoices.locationId, data.locationId),
          or(
            eq(invoices.status, "overdue"),
            // also catch sent invoices whose due date has passed (not yet flipped to overdue)
            and(eq(invoices.status, "sent"), sql`${invoices.dueDate} < ${today}`)
          )
        )
      )
      .orderBy(asc(invoices.dueDate))
      .limit(5);

    const combined = [...upcomingRows, ...overdueRows].slice(0, 5);
    const upcomingDues = combined;

    return {
      stats: {
        inquiries: Number(inquiriesCount.count),
        students: Number(studentsCount.count),
        classes: Number(classesCount.count),
        staff: Number(staffCount.count),
        pendingFees: Number(pendingFeesCount.count),
      },
      recentInquiries,
      upcomingDues: upcomingDues.map((due) => ({
        ...due,
        dueDate: due.dueDate ? fmtDate(due.dueDate) : null,
      })),
    };
  });

// ── Upcoming birthdays (next 30 days) ─────────────────────────────────────────
// Visible to all school staff + respective parents.
const getUpcomingBirthdaysSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
});

export const getUpcomingBirthdays = createServerFn({ method: "GET" })
  .validator((input: unknown) => getUpcomingBirthdaysSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const { db } = await import("@/lib/db");
    const { users, students, parents, classes } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "super_admin" && user.schoolId !== data.schoolId) {
      throw new Error("Not authorized");
    }

    // Build base scope based on role
    let scope: any = eq(students.schoolId, data.schoolId);
    if (user.role === "super_admin" || user.role === "school_admin") {
      // all locations in school
    } else if (user.role === "parent") {
      // parent sees only their children
      scope = and(
        eq(students.schoolId, data.schoolId),
        eq(parents.email, user.email ?? ""),
      );
    } else {
      // teacher, staff, location_admin, accountant: current location
      scope = and(eq(students.schoolId, data.schoolId), eq(students.locationId, data.locationId));
    }

    const baseCols = {
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      dateOfBirth: students.dateOfBirth,
      currentClassId: students.currentClassId,
    };

    const rows = user.role === "parent"
      ? await db
          .select(baseCols)
          .from(students)
          .innerJoin(parents, eq(parents.studentId, students.id))
          .where(and(scope, isNotNull(students.dateOfBirth)))
      : await db
          .select(baseCols)
          .from(students)
          .where(and(scope, isNotNull(students.dateOfBirth)));

    const classMap = new Map<number, string>();
    if (rows.length > 0) {
      const classIds = [...new Set(rows.map((r) => r.currentClassId).filter(Boolean) as number[])];
      if (classIds.length) {
        const classRows = await db.select({ id: classes.id, name: classes.name }).from(classes).where(inArray(classes.id, classIds));
        for (const c of classRows) classMap.set(c.id, c.name);
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = rows
      .map((s) => {
        const dob = new Date(s.dateOfBirth!);
        let bday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (bday < today) bday = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
        const daysUntil = Math.floor((bday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: s.id,
          name: `${s.firstName} ${s.lastName}`.trim(),
          dateOfBirth: fmtDate(s.dateOfBirth!),
          birthdayThisYear: fmtDate(bday),
          daysUntil,
          ageTurning: today.getFullYear() - dob.getFullYear() + (bday.getFullYear() > today.getFullYear() ? 1 : 0),
          className: s.currentClassId ? classMap.get(s.currentClassId) ?? null : null,
        };
      })
      .filter((b) => b.daysUntil <= 30 && b.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return { birthdays: upcoming };
  });

// ─────────────────────────────────────────────────────────────────────────────
// INVITE FLOW
// ─────────────────────────────────────────────────────────────────────────────

const sendInviteSchema = z.object({
  email: z.string().trim().email().max(255),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().max(255).optional().default(""),
  staffRole: z.enum(["teacher", "staff", "accountant", "location_admin", "parent"]),
  locationId: z.number(),
});

export const sendInvite = createServerFn({ method: "POST" })
  .validator((input: unknown) => sendInviteSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const callerId = Number(payload.userId);
    if (!callerId) throw new Error("Not authenticated");

    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");

    const [caller] = await db
      .select({ role: users.role, schoolId: users.schoolId })
      .from(users)
      .where(eq(users.id, callerId))
      .limit(1);
    if (!caller) throw new Error("Not authenticated");
    if (!["super_admin", "school_admin", "location_admin"].includes(caller.role ?? ""))
      throw new Error("Not authorized to send invites");

    const email = normalizeEmail(data.email);

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    let inviteeId: number;
    if (existing) {
      inviteeId = existing.id;
      await db.update(users).set({ status: "invited", role: data.staffRole }).where(eq(users.id, inviteeId));
    } else {
      const [res] = await db.insert(users).values({
        schoolId: caller.schoolId,
        locationId: data.locationId,
        email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.staffRole,
        status: "invited",
      });
      inviteeId = Number((res as any).insertId);
    }

    const inviteToken = await new jose.SignJWT({ userId: inviteeId, purpose: "invite" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    return { ok: true, inviteToken };
  });

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
});

export const acceptInvite = createServerFn({ method: "POST" })
  .validator((input: unknown) => acceptInviteSchema.parse(input))
  .handler(async ({ data }) => {
    const { payload } = await jose.jwtVerify(data.token, JWT_SECRET).catch(() => {
      throw new Error("Invalid or expired invite link");
    });
    if (payload.purpose !== "invite") throw new Error("Invalid invite token");

    const userId = Number(payload.userId);
    if (!userId) throw new Error("Invalid invite token");

    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    await db.update(users).set({ passwordHash, status: "active", emailConfirmed: 1 }).where(eq(users.id, userId));

    const [user] = await db
      .select({ id: users.id, schoolId: users.schoolId, locationId: users.locationId, role: users.role, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("User not found");

    const sessionToken = await createSessionToken({
      userId: user.id,
      schoolId: user.schoolId,
      locationId: user.locationId,
      role: user.role,
      email: user.email,
    });

    return { ok: true, token: sessionToken, role: user.role };
  });

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getTeacherDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) throw new Error("Not authenticated");

  const { payload } = await verifySessionToken(token);
  const userId = Number(payload.userId);
  if (!userId) throw new Error("Not authenticated");

  const { db } = await import("@/lib/db");
  const { users, staff, staffClassAssignments, classes, classEnrollments, staffAttendance, students } = await import("@/lib/db/schema");

  const [user] = await db
    .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.locationId) throw new Error("Not authorized");

  const [staffRecord] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.schoolId, user.schoolId), or(eq(staff.userId, user.id), eq(staff.email, user.email ?? ""))))
    .limit(1);
  if (!staffRecord) throw new Error("Not authorized");

  let myClasses: { classId: number; className: string; ageGroup: string; roomName: string | null; startTime: string | null; endTime: string | null; studentCount: number }[] = [];

  if (staffRecord) {
    const assignments = await db
      .select({
        classId: staffClassAssignments.classId,
        className: classes.name,
        ageGroup: classes.ageGroup,
        roomName: classes.roomName,
        startTime: classes.startTime,
        endTime: classes.endTime,
      })
      .from(staffClassAssignments)
      .innerJoin(classes, eq(staffClassAssignments.classId, classes.id))
      .where(
        and(
          eq(staffClassAssignments.staffId, staffRecord.id),
          eq(classes.locationId, user.locationId),
          eq(staffClassAssignments.locationId, user.locationId),
        )
      );

    myClasses = await Promise.all(
      assignments.map(async (a) => {
        // Count from class_enrollments (preferred) OR fall back to students.current_class_id
        const [{ cnt }] = await db
          .select({ cnt: count() })
          .from(classEnrollments)
          .where(and(eq(classEnrollments.classId, a.classId), eq(classEnrollments.status, "active")));
        let studentCount = Number(cnt);
        if (studentCount === 0) {
          const [{ cnt: cnt2 }] = await db
            .select({ cnt: count() })
            .from(students)
            .where(and(eq(students.currentClassId, a.classId), eq(students.status, "enrolled")));
          studentCount = Number(cnt2);
        }
        return { ...a, studentCount };
      })
    );
  }

  const todayDate = new Date(todayIST());
  const attendanceToday = staffRecord
    ? await db
        .select({ status: staffAttendance.status })
        .from(staffAttendance)
        .where(and(eq(staffAttendance.staffId, staffRecord.id), eq(staffAttendance.date, todayDate)))
        .limit(1)
    : [];

  return {
    user: { firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
    myClasses,
    attendanceMarkedToday: attendanceToday.length > 0,
    staffId: staffRecord?.id ?? null,
    schoolId: user.schoolId,
    locationId: user.locationId,
  };
});

const getClassStudentsSchema = z.object({ classId: z.number() });

export const getClassStudents = createServerFn({ method: "GET" })
  .validator((input: unknown) => getClassStudentsSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const { db } = await import("@/lib/db");
    const { users, staff, staffClassAssignments, classes, classEnrollments, students } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ id: users.id, schoolId: users.schoolId, locationId: users.locationId, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || !user.locationId) throw new Error("Not authorized");

    const [staffRecord] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.schoolId, user.schoolId), or(eq(staff.userId, user.id), eq(staff.email, user.email ?? ""))))
      .limit(1);
    if (!staffRecord) throw new Error("Not authorized");

    const [allowed] = await db
      .select({ id: staffClassAssignments.id })
      .from(staffClassAssignments)
      .innerJoin(classes, eq(staffClassAssignments.classId, classes.id))
      .where(
        and(
          eq(staffClassAssignments.staffId, staffRecord.id),
          eq(staffClassAssignments.classId, data.classId),
          eq(classes.schoolId, user.schoolId),
          eq(classes.locationId, user.locationId),
        )
      )
      .limit(1);
    if (!allowed) throw new Error("Not authorized");

    // Get students via class_enrollments
    const enrolled = await db
      .select({
        id: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        dateOfBirth: students.dateOfBirth,
        gender: students.gender,
        status: students.status,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .where(and(eq(classEnrollments.classId, data.classId), eq(classEnrollments.status, "active")));

    // Also get students assigned via current_class_id but missing a class_enrollments row
    const enrolledIds = enrolled.map((s) => s.id);
    const byCurrentClass = await db
      .select({
        id: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        dateOfBirth: students.dateOfBirth,
        gender: students.gender,
        status: students.status,
      })
      .from(students)
      .where(and(
        eq(students.currentClassId, data.classId),
        eq(students.status, "enrolled"),
        enrolledIds.length ? notInArray(students.id, enrolledIds) : sql`1=1`,
      ));

    return [...enrolled, ...byCurrentClass];
  });

// ─────────────────────────────────────────────────────────────────────────────
// PARENT FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getParentPortal = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) throw new Error("Not authenticated");

  const { payload } = await verifySessionToken(token);
  const userId = Number(payload.userId);
  if (!userId) throw new Error("Not authenticated");

  const { db } = await import("@/lib/db");
  const { users, parents, students, invoices, emergencyContacts, medicalNotes, classes } = await import("@/lib/db/schema");

  const [user] = await db
    .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("Not authenticated");
  if (user.role !== "parent") throw new Error("Not authorized");

  const parentRecords = await db
    .select({ id: parents.id, studentId: parents.studentId, name: parents.name, relation: parents.relation, phone: parents.phone, address: parents.address })
    .from(parents)
    .where(and(eq(parents.schoolId, user.schoolId), eq(parents.email, user.email ?? "")));

  const childIds = parentRecords.map((p) => p.studentId);

  const children = childIds.length
    ? await db
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          dateOfBirth: students.dateOfBirth,
          gender: students.gender,
          bloodGroup: students.bloodGroup,
          status: students.status,
          currentClassId: students.currentClassId,
          className: classes.name,
          classAcademicYear: classes.academicYear,
        })
        .from(students)
        .leftJoin(classes, eq(students.currentClassId, classes.id))
        .where(inArray(students.id, childIds))
    : [];

  const { feeStructures } = await import("@/lib/db/schema");
  const fees = childIds.length
    ? await db
        .select({
          id: invoices.id,
          studentId: invoices.studentId,
          amount: invoices.amount,
          dueDate: invoices.dueDate,
          status: invoices.status,
          razorpayOrderId: invoices.razorpayOrderId,
          paidAt: invoices.paidAt,
          paidMethod: invoices.paidMethod,
          feeName: feeStructures.name,
          feeFrequency: feeStructures.frequency,
        })
        .from(invoices)
        .leftJoin(feeStructures, eq(invoices.feeStructureId, feeStructures.id))
        .where(and(
          inArray(invoices.studentId, childIds),
          inArray(invoices.status, ["sent", "overdue", "draft", "paid"])
        ))
        .orderBy(asc(invoices.dueDate))
    : [];

  const emergency = childIds.length
    ? await db
        .select({
          id: emergencyContacts.id,
          studentId: emergencyContacts.studentId,
          name: emergencyContacts.name,
          relation: emergencyContacts.relation,
          phone: emergencyContacts.phone,
        })
        .from(emergencyContacts)
        .where(inArray(emergencyContacts.studentId, childIds))
    : [];

  const medical = childIds.length
    ? await db
        .select({
          studentId: medicalNotes.studentId,
          allergies: medicalNotes.allergies,
          conditions: medicalNotes.conditions,
          medications: medicalNotes.medications,
          notes: medicalNotes.notes,
        })
        .from(medicalNotes)
        .where(inArray(medicalNotes.studentId, childIds))
    : [];

  return {
    user: { firstName: user.firstName, lastName: user.lastName, email: user.email },
    children: children.map((c) => ({
      ...c,
      dateOfBirth: c.dateOfBirth
        ? (typeof c.dateOfBirth === "string"
            ? c.dateOfBirth.slice(0, 10)
            : (c.dateOfBirth as Date).toISOString().slice(0, 10))
        : null,
    })),
    parentContacts: parentRecords,
    emergencyContacts: emergency,
    medicalNotes: medical,
    fees: fees.map((f) => ({
      ...f,
      dueDate: f.dueDate ? fmtDate(f.dueDate) : null,
      paidAt: f.paidAt ? f.paidAt.toISOString() : null,
      paidMethod: f.paidMethod ?? null,
      feeName: f.feeName ?? null,
      feeFrequency: f.feeFrequency ?? null,
    })),
  };
});

const updateChildPersonalSchema = z.object({
  studentId: z.number(),
  bloodGroup: z.string().max(10).optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateChildPersonal = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateChildPersonalSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, parents, students } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ id: users.id, role: users.role, schoolId: users.schoolId, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.role !== "parent") throw new Error("Not authorized");

    const [link] = await db
      .select({ studentId: parents.studentId })
      .from(parents)
      .where(and(eq(parents.schoolId, user.schoolId), eq(parents.email, user.email ?? ""), eq(parents.studentId, data.studentId)))
      .limit(1);
    if (!link) throw new Error("Not authorized");

    await db.update(students)
      .set({
        bloodGroup: data.bloodGroup,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth as any,
      })
      .where(eq(students.id, data.studentId));
    return { ok: true };
  });

const updateParentContactSchema = z.object({
  parentId: z.number(),
  phone: z.string().max(50).optional(),
  address: z.string().max(65535).optional(),
});

export const updateParentContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateParentContactSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, parents } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ id: users.id, schoolId: users.schoolId, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.role !== "parent") throw new Error("Not authorized");

    const [parent] = await db
      .select({ id: parents.id, email: parents.email })
      .from(parents)
      .where(and(eq(parents.id, data.parentId), eq(parents.schoolId, user.schoolId)))
      .limit(1);
    if (!parent || parent.email !== user.email) throw new Error("Not authorized");

    await db.update(parents)
      .set({
        phone: data.phone,
        address: data.address,
      })
      .where(eq(parents.id, data.parentId));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// PLANS / PRICING
// ─────────────────────────────────────────────────────────────────────────────

export const getPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("@/lib/db");
  const { plans } = await import("@/lib/db/schema");

  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      price: plans.price,
      period: plans.period,
      description: plans.description,
      features: plans.features,
      featured: plans.featured,
      cta: plans.cta,
      ctaHref: plans.ctaHref,
      status: plans.status,
    })
    .from(plans)
    .where(eq(plans.status, "active"))
    .orderBy(asc(plans.displayOrder));

  return rows.map((r) => ({
    ...r,
    featured: Boolean(r.featured),
    features: (() => {
      if (!r.features) return [];
      try {
        const parsed = JSON.parse(r.features);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
  }));
});

const updatePlanSchema = z.object({
  planId: z.number(),
  price: z.string().trim().min(1).max(50).optional(),
  period: z.string().trim().max(50).optional(),
  description: z.string().trim().max(1000).optional(),
  features: z.array(z.string().trim().min(1)).optional(),
  cta: z.string().trim().max(100).optional(),
  ctaHref: z.string().trim().max(255).optional(),
  featured: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const updatePlan = createServerFn({ method: "POST" })
  .validator((input: unknown) => updatePlanSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const { db } = await import("@/lib/db");
    const { users, plans } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.role !== "super_admin") throw new Error("Not authorized");

    const update: Record<string, any> = {};
    if (data.price !== undefined) update.price = data.price;
    if (data.period !== undefined) update.period = data.period;
    if (data.description !== undefined) update.description = data.description;
    if (data.features !== undefined) update.features = JSON.stringify(data.features);
    if (data.cta !== undefined) update.cta = data.cta;
    if (data.ctaHref !== undefined) update.ctaHref = data.ctaHref;
    if (data.featured !== undefined) update.featured = data.featured ? 1 : 0;
    if (data.status !== undefined) update.status = data.status;

    if (Object.keys(update).length === 0) return { ok: true };

    await db.update(plans).set(update).where(eq(plans.id, data.planId));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getSuperAdminDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) throw new Error("Not authenticated");

  const { payload } = await verifySessionToken(token);
  const userId = Number(payload.userId);
  if (!userId) throw new Error("Not authenticated");

  const { db } = await import("@/lib/db");
  const { users, schools, students, subscriptions } = await import("@/lib/db/schema");
  const { sql: sqlRaw, gte: gte2 } = await import("drizzle-orm");

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "super_admin") throw new Error("Not authorized");

  // Single query: schools left-joined with their latest subscription + student count
  const rows = await db
    .select({
      id: schools.id,
      name: schools.name,
      email: schools.email,
      city: schools.city,
      state: schools.state,
      plan: schools.plan,
      status: schools.status,
      createdAt: schools.createdAt,
      subPlan:   subscriptions.plan,
      subStatus: subscriptions.status,
      subAmount: subscriptions.amount,
      subCycle:  subscriptions.billingCycle,
      studentCount: sqlRaw<number>`(SELECT COUNT(*) FROM students WHERE students.school_id = ${schools.id})`,
    })
    .from(schools)
    .leftJoin(subscriptions, eq(subscriptions.schoolId, schools.id))
    .orderBy(desc(schools.createdAt));

  // Deduplicate (left join can produce multiple rows if a school has multiple subs)
  const seen = new Set<number>();
  const allSchools = rows.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .map((r) => ({
      id: r.id, name: r.name, email: r.email, city: r.city, state: r.state,
      plan: r.plan, status: r.status, createdAt: r.createdAt,
      studentCount: Number(r.studentCount ?? 0),
      subscription: r.subPlan ? { plan: r.subPlan, status: r.subStatus, amount: Number(r.subAmount ?? 0), billingCycle: r.subCycle } : null,
    }));

  const [{ totalStudents }] = await db.select({ totalStudents: count() }).from(students);
  const [{ totalUsers }]    = await db.select({ totalUsers: count() }).from(users);

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return {
    schools: allSchools,
    stats: {
      totalSchools:   allSchools.length,
      activeSchools:  allSchools.filter((s) => s.status === "active").length,
      totalStudents:  Number(totalStudents),
      totalUsers:     Number(totalUsers),
      newSchools30d:  allSchools.filter((s) => s.createdAt && new Date(s.createdAt) >= thirtyDaysAgo).length,
    },
  };
});

// ── Platform Revenue & Metrics ─────────────────────────────────────────────
export const getPlatformRevenue = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) throw new Error("Not authenticated");

  const { payload } = await verifySessionToken(token);
  const userId = Number(payload.userId);
  if (!userId) throw new Error("Not authenticated");

  const { db } = await import("@/lib/db");
  const { users, subscriptions, subscriptionPayments } = await import("@/lib/db/schema");
  const { sql: sqlRaw, gte: gte2 } = await import("drizzle-orm");

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "super_admin") throw new Error("Not authorized");

  // All subscriptions
  const allSubs = await db
    .select({
      plan:         subscriptions.plan,
      status:       subscriptions.status,
      amount:       subscriptions.amount,
      billingCycle: subscriptions.billingCycle,
      trialEndsAt:  subscriptions.trialEndsAt,
      endedAt:      subscriptions.endedAt,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    })
    .from(subscriptions);

  // Compute MRR: active subscriptions normalised to monthly
  let mrr = 0;
  for (const s of allSubs) {
    if (s.status !== "active") continue;
    const amt = Number(s.amount ?? 0);
    if (s.billingCycle === "monthly")  mrr += amt;
    if (s.billingCycle === "yearly")   mrr += amt / 12;
    if (s.billingCycle === "lifetime") mrr += 0; // one-time, excluded from MRR
  }
  const arr = mrr * 12;

  // Subscription status breakdown
  const statusCount: Record<string, number> = {};
  for (const s of allSubs) {
    statusCount[s.status ?? "unknown"] = (statusCount[s.status ?? "unknown"] ?? 0) + 1;
  }

  // Plan breakdown (active subs only)
  const planCount: Record<string, number> = {};
  for (const s of allSubs) {
    if (s.status === "active" || s.status === "trialing") {
      planCount[s.plan ?? "free"] = (planCount[s.plan ?? "free"] ?? 0) + 1;
    }
  }

  // Total revenue from captured payments
  const [{ totalRevenue }] = await db
    .select({ totalRevenue: sqlRaw<number>`COALESCE(SUM(amount), 0)` })
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.status, "captured"));

  // Revenue last 30 days
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [{ revenue30d }] = await db
    .select({ revenue30d: sqlRaw<number>`COALESCE(SUM(amount), 0)` })
    .from(subscriptionPayments)
    .where(
      and(
        eq(subscriptionPayments.status, "captured"),
        gte2(subscriptionPayments.paidAt, thirtyDaysAgo),
      )
    );

  // Churn: cancelled or ended this month
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
  const churnedThisMonth = allSubs.filter(
    (s) => (s.status === "canceled") && s.endedAt && new Date(s.endedAt) >= startOfMonth
  ).length;

  // Trials expiring within 7 days
  const in7Days = new Date(); in7Days.setDate(in7Days.getDate() + 7);
  const trialsExpiringSoon = allSubs.filter(
    (s) => s.status === "trialing" && s.trialEndsAt && new Date(s.trialEndsAt) <= in7Days
  ).length;

  return {
    mrr:              Math.round(mrr * 100) / 100,
    arr:              Math.round(arr * 100) / 100,
    totalRevenue:     Number(totalRevenue ?? 0),
    revenue30d:       Number(revenue30d ?? 0),
    churnedThisMonth,
    trialsExpiringSoon,
    activeCount:      statusCount["active"]   ?? 0,
    trialingCount:    statusCount["trialing"] ?? 0,
    canceledCount:    statusCount["canceled"] ?? 0,
    pastDueCount:     statusCount["past_due"] ?? 0,
    planBreakdown:    planCount,
  };
});

// ── All subscriptions list (for super-admin subscriptions page) ──────────────
export const getAllSubscriptions = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) throw new Error("Not authenticated");
  const { payload } = await verifySessionToken(token);
  const userId = Number(payload.userId);
  const { db } = await import("@/lib/db");
  const { users, subscriptions, schools } = await import("@/lib/db/schema");
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "super_admin") throw new Error("Not authorized");

  const rows = await db
    .select({
      id:                  subscriptions.id,
      plan:                subscriptions.plan,
      status:              subscriptions.status,
      amount:              subscriptions.amount,
      currency:            subscriptions.currency,
      billingCycle:        subscriptions.billingCycle,
      currentPeriodStart:  subscriptions.currentPeriodStart,
      currentPeriodEnd:    subscriptions.currentPeriodEnd,
      trialEndsAt:         subscriptions.trialEndsAt,
      cancelAtPeriodEnd:   subscriptions.cancelAtPeriodEnd,
      startedAt:           subscriptions.startedAt,
      endedAt:             subscriptions.endedAt,
      schoolId:            subscriptions.schoolId,
      schoolName:          schools.name,
      schoolEmail:         schools.email,
    })
    .from(subscriptions)
    .leftJoin(schools, eq(subscriptions.schoolId, schools.id))
    .orderBy(desc(subscriptions.startedAt));

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount ?? 0),
  }));
});

// ── All payments list (for super-admin payments page) ────────────────────────
export const getAllPayments = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) throw new Error("Not authenticated");
  const { payload } = await verifySessionToken(token);
  const userId = Number(payload.userId);
  const { db } = await import("@/lib/db");
  const { users, subscriptionPayments, schools } = await import("@/lib/db/schema");
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "super_admin") throw new Error("Not authorized");

  const rows = await db
    .select({
      id:                    subscriptionPayments.id,
      amount:                subscriptionPayments.amount,
      currency:              subscriptionPayments.currency,
      status:                subscriptionPayments.status,
      razorpayOrderId:       subscriptionPayments.razorpayOrderId,
      razorpayPaymentId:     subscriptionPayments.razorpayPaymentId,
      paidAt:                subscriptionPayments.paidAt,
      failureReason:         subscriptionPayments.failureReason,
      createdAt:             subscriptionPayments.createdAt,
      schoolId:              subscriptionPayments.schoolId,
      schoolName:            schools.name,
      schoolEmail:           schools.email,
    })
    .from(subscriptionPayments)
    .leftJoin(schools, eq(subscriptionPayments.schoolId, schools.id))
    .orderBy(desc(subscriptionPayments.createdAt));

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount ?? 0),
  }));
});

const toggleSchoolStatusSchema = z.object({
  schoolId: z.number(),
  status: z.enum(["active", "suspended"]),
});

export const toggleSchoolStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => toggleSchoolStatusSchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);

    const { db } = await import("@/lib/db");
    const { users, schools } = await import("@/lib/db/schema");

    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.role !== "super_admin") throw new Error("Not authorized");

    await db.update(schools).set({ status: data.status }).where(eq(schools.id, data.schoolId));
    return { ok: true };
  });

// ── Super Admin: get full detail for one school ───────────────────────────────
export const getSuperAdminSchoolDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ schoolId: z.number() }).parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    const { db } = await import("@/lib/db");
    const { users, schools, locations, subscriptions, subscriptionPayments, staff, students } = await import("@/lib/db/schema");

    const [me] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me || me.role !== "super_admin") throw new Error("Not authorized");

    const [school] = await db.select().from(schools).where(eq(schools.id, data.schoolId)).limit(1);
    if (!school) throw new Error("School not found");

    const locs = await db.select().from(locations).where(eq(locations.schoolId, data.schoolId)).orderBy(asc(locations.name));

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.schoolId, data.schoolId)).orderBy(desc(subscriptions.startedAt)).limit(1);

    const payments = sub
      ? await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.subscriptionId, sub.id)).orderBy(desc(subscriptionPayments.paidAt))
      : [];

    const [{ staffCount }] = await db.select({ staffCount: count() }).from(staff).where(eq(staff.schoolId, data.schoolId));
    const [{ studentCount }] = await db.select({ studentCount: count() }).from(students).where(eq(students.schoolId, data.schoolId));

    return {
      school: { ...school, logoUrl: school.logoUrl ?? null },
      locations: locs,
      subscription: sub ?? null,
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      stats: { staffCount: Number(staffCount), studentCount: Number(studentCount) },
    };
  });

const updateLocationSchema = z.object({
  locationId: z.number(),
  facilityType: z.enum(["school", "daycare", "both"]).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const updateLocation = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateLocationSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireAuth();
    if (!["super_admin", "school_admin"].includes(user.role ?? "")) throw new Error("Not authorized");
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { locations } = await import("@/lib/db/schema");

    const [loc] = await db.select({ schoolId: locations.schoolId }).from(locations).where(eq(locations.id, data.locationId)).limit(1);
    if (!loc || loc.schoolId !== user.schoolId) throw new Error("Not authorized");

    const setObj: any = {};
    if (data.facilityType) setObj.facilityType = data.facilityType;
    if (data.name) setObj.name = data.name;
    if (data.phone !== undefined) setObj.phone = data.phone;
    if (data.status) setObj.status = data.status;

    await db.update(locations).set(setObj).where(eq(locations.id, data.locationId));
    return { ok: true };
  });

// ── Super Admin: update school subscription (plan, amount, status) ────────────
const updateSchoolSubscriptionSchema = z.object({
  schoolId: z.number(),
  planId: z.number(),
  amount: z.number(),
  billingCycle: z.enum(["monthly", "yearly", "lifetime"]),
  status: z.enum(["trialing", "active", "past_due", "canceled", "paused"]),
  periodStart: z.string().optional(), // ISO date string e.g. "2026-09-16"
  periodEnd: z.string().optional(),
  maxStudents: z.number().optional(),
  maxStaff: z.number().optional(),
  maxLocations: z.number().optional(),
});

export const updateSchoolSubscription = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateSchoolSubscriptionSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, schools, subscriptions, plans } = await import("@/lib/db/schema");

    const [me] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me || me.role !== "super_admin") throw new Error("Not authorized");

    // Update or insert subscription
    const [existing] = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.schoolId, data.schoolId)).limit(1);
    const [plan] = await db.select({ id: plans.id, name: plans.name }).from(plans).where(eq(plans.id, data.planId)).limit(1);
    const planName = plan?.name.toLowerCase() ?? "free";
    const periodStart = data.periodStart ? new Date(data.periodStart) : null;
    const periodEnd   = data.periodEnd   ? new Date(data.periodEnd)   : null;

    if (existing) {
      await db.update(subscriptions).set({
        plan: planName,
        planId: data.planId,
        amount: String(data.amount),
        billingCycle: data.billingCycle,
        status: data.status,
        ...(periodStart !== null ? { currentPeriodStart: periodStart } : {}),
        ...(periodEnd   !== null ? { currentPeriodEnd:   periodEnd   } : {}),
      }).where(eq(subscriptions.id, existing.id));
    } else {
      await db.insert(subscriptions).values({
        schoolId: data.schoolId,
        plan: planName,
        planId: data.planId,
        amount: String(data.amount),
        billingCycle: data.billingCycle,
        status: data.status,
        ...(periodStart !== null ? { currentPeriodStart: periodStart } : {}),
        ...(periodEnd   !== null ? { currentPeriodEnd:   periodEnd   } : {}),
      });
    }

    // Update school plan + limits
    await db.update(schools).set({
      plan: planName,
      ...(data.maxStudents  !== undefined && { maxStudents:  data.maxStudents  }),
      ...(data.maxStaff     !== undefined && { maxStaff:     data.maxStaff     }),
      ...(data.maxLocations !== undefined && { maxLocations: data.maxLocations }),
    }).where(eq(schools.id, data.schoolId));

    return { ok: true };
  });

// ── Super Admin: toggle daycare add-on for a school ──────────────────────────
export const toggleSchoolDaycare = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ schoolId: z.number(), enabled: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    const { db } = await import("@/lib/db");
    const { users, subscriptions } = await import("@/lib/db/schema");
    const [me] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me || me.role !== "super_admin") throw new Error("Not authorized");
    const [sub] = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.schoolId, data.schoolId)).limit(1);
    if (!sub) throw new Error("No subscription found for this school");
    await db.update(subscriptions).set({ daycareEnabled: data.enabled ? 1 : 0 }).where(eq(subscriptions.id, sub.id));
    return { ok: true, daycareEnabled: data.enabled };
  });

// ── Super Admin: record a manual subscription payment ─────────────────────────
const recordSubscriptionPaymentSchema = z.object({
  schoolId: z.number(),
  subscriptionId: z.number(),
  amount: z.number(),
  notes: z.string().optional(),
  paidAt: z.string(), // ISO date string
});

export const recordSubscriptionPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => recordSubscriptionPaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, subscriptions, subscriptionPayments } = await import("@/lib/db/schema");

    const [me] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me || me.role !== "super_admin") throw new Error("Not authorized");

    // Record the payment
    await db.insert(subscriptionPayments).values({
      schoolId: data.schoolId,
      subscriptionId: data.subscriptionId,
      amount: String(data.amount),
      currency: "INR",
      status: "captured",
      paidAt: new Date(data.paidAt),
    });

    // Advance the current period by one billing cycle
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, data.subscriptionId)).limit(1);
    if (sub) {
      const periodStart = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : new Date(data.paidAt);
      const periodEnd   = new Date(periodStart);
      if (sub.billingCycle === "yearly")   periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      else if (sub.billingCycle === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
      await db.update(subscriptions).set({
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd:   periodEnd,
      }).where(eq(subscriptions.id, data.subscriptionId));
    }

    return { ok: true };
  });

const viewAsSchoolAdminSchema = z.object({
  schoolId: z.number(),
});

export const viewAsSchoolAdmin = createServerFn({ method: "POST" })
  .validator((input: unknown) => viewAsSchoolAdminSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, schools, locations } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.role !== "super_admin") throw new Error("Not authorized");

    const [school] = await db
      .select({ name: schools.name })
      .from(schools)
      .where(eq(schools.id, data.schoolId))
      .limit(1);
    if (!school) throw new Error("School not found");

    const [firstLocation] = await db
      .select({ id: locations.id, name: locations.name, facilityType: locations.facilityType })
      .from(locations)
      .where(and(eq(locations.schoolId, data.schoolId), eq(locations.status, "active")))
      .orderBy(asc(locations.name))
      .limit(1);
    if (!firstLocation) throw new Error("No active location for this school");

    // Fetch daycareEnabled from the school's subscription
    const { subscriptions } = await import("@/lib/db/schema");
    const [sub] = await db
      .select({ daycareEnabled: subscriptions.daycareEnabled })
      .from(subscriptions)
      .where(and(eq(subscriptions.schoolId, data.schoolId), inArray(subscriptions.status, ["active", "trialing"])))
      .orderBy(subscriptions.id)
      .limit(1);

    return {
      schoolId: data.schoolId,
      schoolName: school.name,
      locationId: firstLocation.id,
      locationName: firstLocation.name,
      facilityType: firstLocation.facilityType ?? "school",
      daycareEnabled: !!(sub?.daycareEnabled),
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function requireSession() {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) throw new Error("Not authenticated");
  const { payload } = await verifySessionToken(token);
  const userId = Number(payload.userId);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

async function requireNotReceptionist(userId: number) {
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const [me] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (me?.role === "receptionist") throw new Error("You have view-only access");
}

/**
 * Authorization matrix:
 *   super_admin      → any school, any location
 *   school_admin     → any location within their school
 *   accountant       → any location within their school
 *   location_admin   → only their own location
 *   teacher/staff    → only their own location
 *   parent           → only their own location
 */
async function assertCanOperate(schoolId: number) {
  if (!schoolId) return;
  const { db } = await import("@/lib/db");
  const { schools, subscriptions } = await import("@/lib/db/schema");
  const [school] = await db.select({ status: schools.status }).from(schools).where(eq(schools.id, schoolId)).limit(1);
  if (school?.status === "suspended") throw new Error("School account is suspended.");

  const [sub] = await db.select({
    id: subscriptions.id,
    status: subscriptions.status,
    currentPeriodEnd: subscriptions.currentPeriodEnd,
    amount: subscriptions.amount,
    billingCycle: subscriptions.billingCycle,
  }).from(subscriptions).where(eq(subscriptions.schoolId, schoolId)).limit(1);

  const isFreePlan = !sub || Number(sub.amount ?? 0) <= 0;
  if (isFreePlan) return; // free schools can always operate

  // Trialing and active subscriptions with no period end set are never blocked
  if (sub.status === "trialing" || sub.status === "active") {
    if (!sub.currentPeriodEnd) return; // no end date set — treat as open-ended
  }

  const now = new Date();
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const isExpired = periodEnd !== null && periodEnd < now;
  if (isExpired) {
    throw new Error("Subscription expired. Please renew your plan to continue.");
  }
}

async function assertCanOperateForUser() {
  const userId = await requireSession();
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const [user] = await db.select({ role: users.role, schoolId: users.schoolId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role === "super_admin" || user.role === "parent") return; // super admin and parents are never blocked
  await assertCanOperate(Number(user.schoolId ?? 0));
}

// Throws if the school's subscription does not have the daycare add-on enabled.
async function assertDaycareEnabled(schoolId: number) {
  const { db } = await import("@/lib/db");
  const { subscriptions } = await import("@/lib/db/schema");
  const [row] = await db
    .select({ daycareEnabled: subscriptions.daycareEnabled })
    .from(subscriptions)
    .where(and(eq(subscriptions.schoolId, schoolId), inArray(subscriptions.status, ["active", "trialing"])))
    .orderBy(subscriptions.id)
    .limit(1);
  if (!row || !row.daycareEnabled) {
    throw new Error("Daycare add-on is not enabled for your school. Please contact support to upgrade.");
  }
}

async function requireAuth(requestedSchoolId?: number, requestedLocationId?: number) {
  const userId = await requireSession();
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const [user] = await db
    .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Not authenticated");

  if (user.role === "super_admin") return user; // unrestricted
  if (requestedSchoolId != null && user.schoolId !== requestedSchoolId) throw new Error("Not authorized");
  if (requestedLocationId != null) {
    // School-wide roles can switch between any location in their school
    if (SCHOOL_WIDE_ROLES.has(user.role ?? "")) return user;
    // Location-scoped roles must match exactly
    if (user.locationId !== requestedLocationId) throw new Error("Not authorized");
  }
  return { ...user, userId: user.id };
}

const listStudentsSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
});

export const listStudents = createServerFn({ method: "GET" })
  .validator((input: unknown) => listStudentsSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { students, parents, classes, classEnrollments, medicalNotes } = await import("@/lib/db/schema");

    const rows = await db
      .select({
        id: students.id,
        admissionNumber: students.admissionNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        dateOfBirth: students.dateOfBirth,
        gender: students.gender,
        status: students.status,
        currentClassId: students.currentClassId,
      })
      .from(students)
      .where(and(eq(students.schoolId, data.schoolId), eq(students.locationId, data.locationId)))
      .orderBy(asc(students.firstName));

    // Attach primary parent and current class name for list view
    const enriched = await Promise.all(
      rows.map(async (s) => {
        const [primaryParent] = await db
          .select({ name: parents.name, phone: parents.phone, relation: parents.relation })
          .from(parents)
          .where(and(eq(parents.studentId, s.id), eq(parents.isPrimary, 1)))
          .limit(1);

        const [anyParent] = primaryParent
          ? [primaryParent]
          : await db
              .select({ name: parents.name, phone: parents.phone, relation: parents.relation })
              .from(parents)
              .where(eq(parents.studentId, s.id))
              .limit(1);

        const [medical] = await db
          .select({ allergies: medicalNotes.allergies })
          .from(medicalNotes)
          .where(eq(medicalNotes.studentId, s.id))
          .limit(1);

        let className: string | null = null;
        let currentClassId = s.currentClassId;
        if (currentClassId) {
          const [cls] = await db
            .select({ name: classes.name })
            .from(classes)
            .where(eq(classes.id, currentClassId))
            .limit(1);
          className = cls?.name ?? null;
        } else {
          // Fall back to class_enrollments if currentClassId is not set
          const [enrollment] = await db
            .select({ classId: classEnrollments.classId, className: classes.name })
            .from(classEnrollments)
            .innerJoin(classes, eq(classEnrollments.classId, classes.id))
            .where(and(eq(classEnrollments.studentId, s.id), eq(classEnrollments.status, "active")))
            .limit(1);
          if (enrollment) {
            currentClassId = enrollment.classId;
            className = enrollment.className;
          }
        }

        return {
          ...s,
          currentClassId,
          parentName: anyParent?.name ?? null,
          parentPhone: anyParent?.phone ?? null,
          className,
          allergies: medical?.allergies ?? null,
        };
      })
    );

    return enriched;
  });

const getStudentSchema = z.object({ studentId: z.number() });

export const getStudent = createServerFn({ method: "GET" })
  .validator((input: unknown) => getStudentSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { students, parents, emergencyContacts, medicalNotes, classes, classEnrollments } = await import("@/lib/db/schema");

    const [student] = await db
      .select({
        id: students.id,
        admissionNumber: students.admissionNumber,
        firstName: students.firstName,
        lastName: students.lastName,
        dateOfBirth: students.dateOfBirth,
        gender: students.gender,
        bloodGroup: students.bloodGroup,
        status: students.status,
        currentClassId: students.currentClassId,
        photoUrl: students.photoUrl,
      })
      .from(students)
      .where(eq(students.id, data.studentId))
      .limit(1);
    if (!student) throw new Error("Student not found");

    const studentParents = await db
      .select({
        id: parents.id,
        name: parents.name,
        email: parents.email,
        phone: parents.phone,
        relation: parents.relation,
        isPrimary: parents.isPrimary,
        isEmergency: parents.isEmergency,
        userId: parents.userId,
      })
      .from(parents)
      .where(eq(parents.studentId, data.studentId));

    const emergency = await db
      .select({
        id: emergencyContacts.id,
        name: emergencyContacts.name,
        phone: emergencyContacts.phone,
        relation: emergencyContacts.relation,
      })
      .from(emergencyContacts)
      .where(eq(emergencyContacts.studentId, data.studentId));

    const [medical] = await db
      .select({
        id: medicalNotes.id,
        allergies: medicalNotes.allergies,
        conditions: medicalNotes.conditions,
        medications: medicalNotes.medications,
        notes: medicalNotes.notes,
      })
      .from(medicalNotes)
      .where(eq(medicalNotes.studentId, data.studentId))
      .limit(1);

    const enrollments = await db
      .select({
        classId: classEnrollments.classId,
        className: classes.name,
        ageGroup: classes.ageGroup,
        academicYear: classEnrollments.academicYear,
        status: classEnrollments.status,
        enrolledAt: classEnrollments.enrolledAt,
        sortOrder: classes.sortOrder,
      })
      .from(classEnrollments)
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(eq(classEnrollments.studentId, data.studentId))
      .orderBy(asc(classes.sortOrder), asc(classEnrollments.enrolledAt));

    let currentClassName: string | null = null;
    if (student.currentClassId) {
      const [cls] = await db
        .select({ name: classes.name })
        .from(classes)
        .where(eq(classes.id, student.currentClassId))
        .limit(1);
      currentClassName = cls?.name ?? null;
    }

    return {
      student: {
        ...student,
        dateOfBirth: student.dateOfBirth
          ? (typeof student.dateOfBirth === "string"
              ? student.dateOfBirth.slice(0, 10)
              : (student.dateOfBirth as Date).toISOString().slice(0, 10))
          : null,
      },
      parents: studentParents,
      emergency,
      medical: medical ?? null,
      enrollments,
      currentClassName,
    };
  });

// ── Promote student to a new class ───────────────────────────────────────────

const promoteStudentSchema = z.object({
  studentId: z.number(),
  newClassId: z.number(),
  academicYear: z.string().max(20).optional(),
});

export const promoteStudent = createServerFn({ method: "POST" })
  .validator((i: unknown) => promoteStudentSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { students, classes, classEnrollments } = await import("@/lib/db/schema");

    // Load student
    const [student] = await db
      .select({ id: students.id, schoolId: students.schoolId, locationId: students.locationId, currentClassId: students.currentClassId })
      .from(students)
      .where(eq(students.id, data.studentId))
      .limit(1);
    if (!student) throw new Error("Student not found");
    if (student.currentClassId === data.newClassId) throw new Error("Student is already in that class");

    // Capacity check on new class
    const [cls] = await db.select({ capacity: classes.capacity }).from(classes).where(eq(classes.id, data.newClassId)).limit(1);
    if (!cls) throw new Error("Class not found");
    const [{ cnt }] = await db.select({ cnt: count() }).from(classEnrollments)
      .where(and(eq(classEnrollments.classId, data.newClassId), eq(classEnrollments.status, "active")));
    if (Number(cnt) >= cls.capacity) throw new Error(`Class is at full capacity (${cls.capacity} students)`);

    // Mark current enrollment as promoted
    if (student.currentClassId) {
      await db.update(classEnrollments)
        .set({ status: "promoted" })
        .where(and(
          eq(classEnrollments.studentId, data.studentId),
          eq(classEnrollments.classId, student.currentClassId),
          eq(classEnrollments.status, "active"),
        ));
    }

    // Create new active enrollment (or reactivate if exists)
    const [existing] = await db.select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(and(eq(classEnrollments.studentId, data.studentId), eq(classEnrollments.classId, data.newClassId)))
      .limit(1);
    if (existing) {
      await db.update(classEnrollments)
        .set({ status: "active", enrolledAt: new Date(), academicYear: data.academicYear ?? null })
        .where(eq(classEnrollments.id, existing.id));
    } else {
      await db.insert(classEnrollments).values({
        schoolId: student.schoolId,
        locationId: student.locationId,
        studentId: data.studentId,
        classId: data.newClassId,
        academicYear: data.academicYear ?? null,
        enrolledAt: new Date(),
        status: "active",
      });
    }

    // Update student's current class
    await db.update(students).set({ currentClassId: data.newClassId }).where(eq(students.id, data.studentId));

    return { ok: true };
  });

const addStudentSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().max(255).default(""),
  nickName: z.string().trim().max(100).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  bloodGroup: z.string().trim().max(10).optional(),
  nationality: z.string().trim().max(100).optional(),
  religion: z.string().trim().max(100).optional(),
  category: z.enum(["general", "obc", "sc", "st", "ews", "other"]).optional(),
  aadharNumber: z.string().trim().max(20).optional(),
  birthCertificateNumber: z.string().trim().max(100).optional(),
  currentClassId: z.number().optional(),
  // Academic
  academicYear: z.string().trim().max(20).optional(),
  previousSchoolName: z.string().trim().max(255).optional(),
  previousSchoolTC: z.string().trim().max(100).optional(),
  medium: z.enum(["english", "hindi", "regional", "other"]).optional(),
  // Daycare
  daycareType: z.enum(["full_day", "half_day", "extended_hour", "not_enrolled"]).optional(),
  daycareDays: z.string().trim().max(200).optional(),
  authorizedPickupPersons: z.string().max(2000).optional(), // JSON string
  mealPreference: z.enum(["veg", "non_veg", "jain", "vegan", "no_preference"]).optional(),
  // Transport
  transportRequired: z.boolean().optional(),
  transportRoute: z.string().trim().max(255).optional(),
  // Sibling
  siblingStudentId: z.number().optional(),
  // Consents
  photoVideoConsent: z.boolean().optional(),
  medicalTreatmentConsent: z.boolean().optional(),
  dataPrivacyConsent: z.boolean().optional(),
  // Primary parent
  parentName: z.string().trim().min(1).max(255),
  parentEmail: z.string().trim().email().max(255).optional().or(z.literal("")),
  parentPhone: z.string().trim().max(50).optional(),
  parentAlternatePhone: z.string().trim().max(50).optional(),
  parentRelation: z.enum(["mother", "father", "guardian", "other"]).default("guardian"),
  parentAddress: z.string().trim().max(1000).optional(),
  parentQualification: z.string().trim().max(255).optional(),
  parentOccupation: z.string().trim().max(255).optional(),
  parentOrganisation: z.string().trim().max(255).optional(),
  parentDesignation: z.string().trim().max(255).optional(),
  parentOfficeAddress: z.string().trim().max(1000).optional(),
  parentOfficePhone: z.string().trim().max(50).optional(),
  parentWorkTimings: z.string().trim().max(100).optional(),
  parentAadhar: z.string().trim().max(20).optional(),
  // Second parent (optional)
  parent2Name: z.string().trim().max(255).optional(),
  parent2Email: z.string().trim().email().max(255).optional().or(z.literal("")),
  parent2Phone: z.string().trim().max(50).optional(),
  parent2AlternatePhone: z.string().trim().max(50).optional(),
  parent2Relation: z.enum(["mother", "father", "guardian", "other"]).optional(),
  parent2Qualification: z.string().trim().max(255).optional(),
  parent2Occupation: z.string().trim().max(255).optional(),
  parent2Organisation: z.string().trim().max(255).optional(),
  parent2Designation: z.string().trim().max(255).optional(),
  parent2OfficeAddress: z.string().trim().max(1000).optional(),
  parent2OfficePhone: z.string().trim().max(50).optional(),
  parent2WorkTimings: z.string().trim().max(100).optional(),
  parent2Aadhar: z.string().trim().max(20).optional(),
  // Medical
  allergies: z.string().max(1000).optional(),
  conditions: z.string().max(1000).optional(),
  medications: z.string().max(1000).optional(),
  specialNeeds: z.string().max(1000).optional(),
  immunizationRecord: z.string().max(2000).optional(),
  doctorName: z.string().trim().max(255).optional(),
  doctorPhone: z.string().trim().max(50).optional(),
  doctorAddress: z.string().trim().max(500).optional(),
  medicalNotes: z.string().max(2000).optional(),
  // Emergency contact
  emergencyName: z.string().trim().max(255).optional(),
  emergencyPhone: z.string().trim().max(50).optional(),
  emergencyRelation: z.string().trim().max(100).optional(),
});

export const addStudent = createServerFn({ method: "POST" })
  .validator((input: unknown) => addStudentSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { students, parents, emergencyContacts, medicalNotes } = await import("@/lib/db/schema");

    // Plan limit guard
    await checkPlanLimit(data.schoolId, "students");

    // Class capacity guard
    if (data.currentClassId) {
      const { classes, classEnrollments } = await import("@/lib/db/schema");
      const [cls] = await db.select({ capacity: classes.capacity }).from(classes).where(eq(classes.id, data.currentClassId)).limit(1);
      if (cls) {
        const [{ cnt }] = await db.select({ cnt: count() }).from(classEnrollments)
          .where(and(eq(classEnrollments.classId, data.currentClassId), eq(classEnrollments.status, "active")));
        if (Number(cnt) >= cls.capacity) throw new Error(`Class is at full capacity (${cls.capacity} students)`);
      }
    }

    const dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;

    // Duplicate guard: a student with the same name + DOB at this school/branch already exists
    const [duplicate] = await db.select({ id: students.id })
      .from(students)
      .where(
        and(
          eq(students.schoolId, data.schoolId),
          eq(students.locationId, data.locationId),
          eq(students.firstName, data.firstName),
          eq(students.lastName, data.lastName),
          dateOfBirth ? eq(students.dateOfBirth, dateOfBirth) : isNull(students.dateOfBirth)
        )
      )
      .limit(1);
    if (duplicate) throw new Error("A student with this name and date of birth already exists.");

    const [studentRes] = await db.insert(students).values({
      schoolId: data.schoolId,
      locationId: data.locationId,
      firstName: data.firstName,
      lastName: data.lastName,
      nickName: data.nickName || null,
      dateOfBirth,
      gender: data.gender ?? null,
      bloodGroup: data.bloodGroup || null,
      nationality: data.nationality || null,
      religion: data.religion || null,
      category: data.category ?? null,
      aadharNumber: data.aadharNumber || null,
      birthCertificateNumber: data.birthCertificateNumber || null,
      academicYear: data.academicYear || null,
      previousSchoolName: data.previousSchoolName || null,
      previousSchoolTC: data.previousSchoolTC || null,
      medium: data.medium ?? null,
      daycareType: data.daycareType ?? "not_enrolled",
      daycareDays: data.daycareDays || null,
      authorizedPickupPersons: data.authorizedPickupPersons || null,
      mealPreference: data.mealPreference ?? "no_preference",
      transportRequired: data.transportRequired ? 1 : 0,
      transportRoute: data.transportRoute || null,
      siblingStudentId: data.siblingStudentId ?? null,
      photoVideoConsent: data.photoVideoConsent ? 1 : 0,
      medicalTreatmentConsent: data.medicalTreatmentConsent ? 1 : 0,
      dataPrivacyConsent: data.dataPrivacyConsent ? 1 : 0,
      currentClassId: data.currentClassId ?? null,
      status: "enrolled",
    });
    const studentId = Number((studentRes as any).insertId);

    // Generate and save the unique admission number
    const [schoolRow] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, data.schoolId)).limit(1);
    const admissionNumber = generateAdmissionNumber(schoolRow?.name ?? "School", studentId);
    await db.update(students).set({ admissionNumber }).where(eq(students.id, studentId));

    // Primary parent
    await db.insert(parents).values({
      schoolId: data.schoolId,
      locationId: data.locationId,
      studentId,
      name: data.parentName,
      email: data.parentEmail ? normalizeEmail(data.parentEmail) : null,
      phone: data.parentPhone || null,
      alternatePhone: data.parentAlternatePhone || null,
      address: data.parentAddress || null,
      relation: data.parentRelation,
      qualification: data.parentQualification || null,
      occupation: data.parentOccupation || null,
      organisation: data.parentOrganisation || null,
      designation: data.parentDesignation || null,
      officeAddress: data.parentOfficeAddress || null,
      officePhone: data.parentOfficePhone || null,
      workTimings: data.parentWorkTimings || null,
      aadharNumber: data.parentAadhar || null,
      isPrimary: 1,
      isEmergency: 0,
    });

    // Second parent (optional)
    if (data.parent2Name) {
      await db.insert(parents).values({
        schoolId: data.schoolId,
        locationId: data.locationId,
        studentId,
        name: data.parent2Name,
        email: data.parent2Email ? normalizeEmail(data.parent2Email) : null,
        phone: data.parent2Phone || null,
        alternatePhone: data.parent2AlternatePhone || null,
        relation: data.parent2Relation ?? "other",
        qualification: data.parent2Qualification || null,
        occupation: data.parent2Occupation || null,
        organisation: data.parent2Organisation || null,
        designation: data.parent2Designation || null,
        officeAddress: data.parent2OfficeAddress || null,
        officePhone: data.parent2OfficePhone || null,
        workTimings: data.parent2WorkTimings || null,
        aadharNumber: data.parent2Aadhar || null,
        isPrimary: 0,
        isEmergency: 0,
      });
    }

    if (data.allergies || data.conditions || data.medications || data.medicalNotes ||
        data.specialNeeds || data.immunizationRecord || data.doctorName) {
      await db.insert(medicalNotes).values({
        schoolId: data.schoolId,
        locationId: data.locationId,
        studentId,
        allergies: data.allergies || null,
        conditions: data.conditions || null,
        medications: data.medications || null,
        specialNeeds: data.specialNeeds || null,
        immunizationRecord: data.immunizationRecord || null,
        doctorName: data.doctorName || null,
        doctorPhone: data.doctorPhone || null,
        doctorAddress: data.doctorAddress || null,
        notes: data.medicalNotes || null,
      });
    }

    if (data.emergencyName && data.emergencyPhone) {
      await db.insert(emergencyContacts).values({
        schoolId: data.schoolId,
        locationId: data.locationId,
        studentId,
        name: data.emergencyName,
        phone: data.emergencyPhone,
        relation: data.emergencyRelation || "guardian",
      });
    }

    // Always create a class_enrollments row when class is assigned
    if (data.currentClassId) {
      const { classEnrollments } = await import("@/lib/db/schema");
      const [existing] = await db.select({ id: classEnrollments.id })
        .from(classEnrollments)
        .where(and(eq(classEnrollments.studentId, studentId), eq(classEnrollments.classId, data.currentClassId)))
        .limit(1);
      if (!existing) {
        await db.insert(classEnrollments).values({
          schoolId: data.schoolId,
          locationId: data.locationId,
          studentId,
          classId: data.currentClassId,
          academicYear: "",
          enrolledAt: new Date(),
          status: "active",
        });
      }
    }

    // ── Auto-generate initial fee invoices at admission ───────────────────────
    if (data.currentClassId) {
      const { feeStructures, invoices, schools } = await import("@/lib/db/schema");

      const [admissionYear, admissionMonth, admissionDay] = todayIST().split("-").map(Number);
      const currentMonth = `${admissionYear}-${String(admissionMonth).padStart(2, "0")}`;

      const [school] = await db
        .select({ feeCutoffDay: schools.feeCutoffDay })
        .from(schools)
        .where(eq(schools.id, data.schoolId))
        .limit(1);
      const feeCutoffDay = school?.feeCutoffDay ?? 20;

      const structures = await db
        .select({
          id: feeStructures.id,
          name: feeStructures.name,
          amount: feeStructures.amount,
          dueDay: feeStructures.dueDay,
          frequency: feeStructures.frequency,
        })
        .from(feeStructures)
        .where(and(
          eq(feeStructures.schoolId, data.schoolId),
          eq(feeStructures.locationId, data.locationId),
          or(
            eq(feeStructures.classId, data.currentClassId),
            isNull(feeStructures.classId),
          ),
        ));

      const toInsert: {
        schoolId: number; locationId: number; studentId: number;
        feeStructureId: number; amount: string; dueDate: Date;
        status: "draft" | "sent"; generatedMonth: string;
      }[] = [];

      for (const fs of structures) {
        if (fs.frequency === "monthly" && admissionDay > feeCutoffDay) continue;

        const dueDay = fs.dueDay ?? 1;
        const dueDate = new Date(Date.UTC(admissionYear, admissionMonth - 1, dueDay));

        toInsert.push({
          schoolId: data.schoolId,
          locationId: data.locationId,
          studentId,
          feeStructureId: fs.id,
          amount: String(fs.amount),
          dueDate,
          status: fs.frequency === "monthly" ? "sent" : "draft",
          generatedMonth: currentMonth,
        });
      }

      if (toInsert.length) {
        await db.insert(invoices).values(toInsert);
      }
    }

    return { ok: true, studentId };
  });

// ── CSV Bulk Import ────────────────────────────────────────────────────────────
const csvImportRowSchema = z.object({
  firstName:         z.string().trim().min(1).max(255),
  lastName:          z.string().trim().max(255).default(""),
  dateOfBirth:       z.string().optional(),
  gender:            z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  bloodGroup:        z.string().trim().max(10).optional(),
  className:         z.string().trim().optional(),
  parentName:        z.string().trim().min(1).max(255),
  parentPhone:       z.string().trim().max(50).optional(),
  parentEmail:       z.string().trim().max(255).optional(),
  parentRelation:    z.enum(["mother", "father", "guardian", "other"]).default("guardian"),
  emergencyName:     z.string().trim().max(255).optional(),
  emergencyPhone:    z.string().trim().max(50).optional(),
  allergies:         z.string().max(1000).optional(),
});

const importStudentsCSVSchema = z.object({
  schoolId:   z.number(),
  locationId: z.number(),
  rows:       z.array(csvImportRowSchema).min(1).max(500),
});

export const importStudentsFromCSV = createServerFn({ method: "POST" })
  .validator((input: unknown) => importStudentsCSVSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();

    const { db } = await import("@/lib/db");
    const { students, parents, emergencyContacts, medicalNotes, classes, classEnrollments, schools } = await import("@/lib/db/schema");

    // Fetch all active classes for this school+location to resolve class names
    const classRows = await db.select({ id: classes.id, name: classes.name })
      .from(classes)
      .where(and(eq(classes.schoolId, data.schoolId), eq(classes.locationId, data.locationId), eq(classes.status, "active")));
    const classMap = new Map(classRows.map((c) => [c.name.trim().toLowerCase(), c.id]));

    // Fetch school name once for uniform admission numbers
    const [schoolRow] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, data.schoolId)).limit(1);

    const imported: number[] = [];
    const skipped: { row: number; name: string; reason: string }[] = [];

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      const rowNum = i + 1;
      const displayName = `${row.firstName} ${row.lastName}`.trim();

      try {
        // Resolve class
        const classId = row.className ? classMap.get(row.className.trim().toLowerCase()) ?? null : null;
        if (row.className && !classId) {
          skipped.push({ row: rowNum, name: displayName, reason: `Class "${row.className}" not found` });
          continue;
        }

        // Duplicate guard
        const dob = row.dateOfBirth ? new Date(row.dateOfBirth) : null;
        const [dup] = await db.select({ id: students.id }).from(students)
          .where(and(
            eq(students.schoolId, data.schoolId),
            eq(students.locationId, data.locationId),
            eq(students.firstName, row.firstName),
            eq(students.lastName, row.lastName),
            dob ? eq(students.dateOfBirth, dob) : isNull(students.dateOfBirth),
          )).limit(1);
        if (dup) {
          skipped.push({ row: rowNum, name: displayName, reason: "Duplicate — student already exists" });
          continue;
        }

        // Insert student
        const [res] = await db.insert(students).values({
          schoolId: data.schoolId,
          locationId: data.locationId,
          firstName: row.firstName,
          lastName: row.lastName,
          dateOfBirth: dob,
          gender: row.gender ?? null,
          bloodGroup: row.bloodGroup || null,
          currentClassId: classId,
          status: "enrolled",
        });
        const studentId = Number((res as any).insertId);
        const admissionNumber = generateAdmissionNumber(schoolRow?.name ?? "School", studentId);
        await db.update(students).set({ admissionNumber }).where(eq(students.id, studentId));

        // Parent
        await db.insert(parents).values({
          schoolId: data.schoolId,
          locationId: data.locationId,
          studentId,
          name: row.parentName,
          email: row.parentEmail ? normalizeEmail(row.parentEmail) : null,
          phone: row.parentPhone || null,
          relation: row.parentRelation,
          isPrimary: 1,
          isEmergency: 0,
        });

        // Medical
        if (row.allergies) {
          await db.insert(medicalNotes).values({
            schoolId: data.schoolId,
            locationId: data.locationId,
            studentId,
            allergies: row.allergies || null,
            conditions: null,
            medications: null,
            notes: null,
          });
        }

        // Emergency contact
        if (row.emergencyName && row.emergencyPhone) {
          await db.insert(emergencyContacts).values({
            schoolId: data.schoolId,
            locationId: data.locationId,
            studentId,
            name: row.emergencyName,
            phone: row.emergencyPhone,
            relation: "guardian",
          });
        }

        // Class enrollment
        if (classId) {
          await db.insert(classEnrollments).values({
            schoolId: data.schoolId,
            locationId: data.locationId,
            studentId,
            classId,
            academicYear: "",
            status: "active",
          });
        }

        imported.push(studentId);
      } catch (err: any) {
        skipped.push({ row: rowNum, name: displayName, reason: err?.message ?? "Unknown error" });
      }
    }

    return { imported: imported.length, skipped };
  });

// ── Update student ─────────────────────────────────────────────────────────────
const updateStudentSchema = z.object({
  studentId: z.number(),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().max(255).optional().default(""),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  bloodGroup: z.string().trim().max(10).optional(),
  currentClassId: z.number().optional(),
  status: z.enum(["inquiry", "applied", "waitlisted", "enrolled", "graduated", "withdrawn"]).optional(),
  // Parent (first parent update)
  parentId: z.number().optional(),
  parentName: z.string().trim().max(255).optional(),
  parentEmail: z.string().trim().max(255).optional().or(z.literal("")),
  parentPhone: z.string().trim().max(50).optional(),
  parentRelation: z.enum(["mother", "father", "guardian", "other"]).optional(),
  // Medical
  medicalId: z.number().optional(),
  allergies: z.string().max(1000).optional(),
  conditions: z.string().max(1000).optional(),
  medications: z.string().max(1000).optional(),
  medicalNotesText: z.string().max(2000).optional(),
});

export const updateStudent = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateStudentSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { students, parents, medicalNotes, users } = await import("@/lib/db/schema");

    // Capacity guard when changing class
    if (data.currentClassId) {
      const { classes, classEnrollments } = await import("@/lib/db/schema");
      const [cls] = await db.select({ capacity: classes.capacity }).from(classes).where(eq(classes.id, data.currentClassId)).limit(1);
      if (cls) {
        const [{ cnt }] = await db.select({ cnt: count() }).from(classEnrollments)
          .where(and(eq(classEnrollments.classId, data.currentClassId), eq(classEnrollments.status, "active")));
        if (Number(cnt) >= cls.capacity) throw new Error(`Class is at full capacity (${cls.capacity} students)`);
      }
    }

    // Get old student before updating
    const [oldStudent] = await db.select({ schoolId: students.schoolId, locationId: students.locationId, currentClassId: students.currentClassId, status: students.status })
      .from(students).where(eq(students.id, data.studentId)).limit(1);

    // Prevent backwards status transitions (e.g. enrolled -> applied)
    const statusOrder = ["inquiry", "applied", "waitlisted", "enrolled", "graduated", "withdrawn"];
    const oldIndex = oldStudent ? statusOrder.indexOf(oldStudent.status ?? "inquiry") : -1;
    const newIndex = data.status ? statusOrder.indexOf(data.status) : -1;
    if (oldStudent && data.status && newIndex < oldIndex) {
      throw new Error(`Cannot move student status from ${oldStudent.status} to ${data.status}.`);
    }

    await db.update(students).set({
      firstName: data.firstName,
      lastName: data.lastName ?? "",
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender ?? null,
      bloodGroup: data.bloodGroup || null,
      currentClassId: data.currentClassId ?? null,
      status: data.status ?? undefined,
    }).where(eq(students.id, data.studentId));

    // Sync class_enrollments when class changes
    if (data.currentClassId && oldStudent) {
      const { classEnrollments } = await import("@/lib/db/schema");
      // Deactivate old enrollment if class changed
      if (oldStudent.currentClassId && oldStudent.currentClassId !== data.currentClassId) {
        await db.update(classEnrollments).set({ status: "inactive" })
          .where(and(eq(classEnrollments.studentId, data.studentId), eq(classEnrollments.classId, oldStudent.currentClassId)));
      }
      // Upsert new enrollment
      const [existing] = await db.select({ id: classEnrollments.id })
        .from(classEnrollments)
        .where(and(eq(classEnrollments.studentId, data.studentId), eq(classEnrollments.classId, data.currentClassId)))
        .limit(1);
      if (existing) {
        await db.update(classEnrollments).set({ status: "active" }).where(eq(classEnrollments.id, existing.id));
      } else {
        await db.insert(classEnrollments).values({
          schoolId: oldStudent.schoolId,
          locationId: oldStudent.locationId,
          studentId: data.studentId,
          classId: data.currentClassId,
          academicYear: "",
          enrolledAt: new Date(),
          status: "active",
        });
      }
    }

    if (data.parentId && data.parentName) {
      const [oldParent] = await db
        .select({ email: parents.email, schoolId: parents.schoolId })
        .from(parents)
        .where(eq(parents.id, data.parentId))
        .limit(1);

      await db.update(parents).set({
        name: data.parentName,
        email: data.parentEmail ? normalizeEmail(data.parentEmail) : null,
        phone: data.parentPhone || null,
        relation: data.parentRelation ?? undefined,
      }).where(eq(parents.id, data.parentId));

      // Keep the parent user login email in sync
      if (oldParent?.email && data.parentEmail && normalizeEmail(data.parentEmail) !== normalizeEmail(oldParent.email)) {
        await db.update(users)
          .set({ email: normalizeEmail(data.parentEmail) })
          .where(eq(users.email, normalizeEmail(oldParent.email)));
      }
    }

    if (data.medicalId) {
      await db.update(medicalNotes).set({
        allergies: data.allergies || null,
        conditions: data.conditions || null,
        medications: data.medications || null,
        notes: data.medicalNotesText || null,
      }).where(eq(medicalNotes.id, data.medicalId));
    } else if (data.allergies || data.conditions || data.medications || data.medicalNotesText) {
      // Need schoolId/locationId for insert — fetch from student
      const [s] = await db.select({ schoolId: students.schoolId, locationId: students.locationId }).from(students).where(eq(students.id, data.studentId)).limit(1);
      if (s) {
        await db.insert(medicalNotes).values({
          schoolId: s.schoolId,
          locationId: s.locationId,
          studentId: data.studentId,
          allergies: data.allergies || null,
          conditions: data.conditions || null,
          medications: data.medications || null,
          notes: data.medicalNotesText || null,
        });
      }
    }

    return { ok: true };
  });

const listClassesForSchoolSchema = z.object({ schoolId: z.number(), locationId: z.number() });

export const listClassesForSchool = createServerFn({ method: "GET" })
  .validator((input: unknown) => listClassesForSchoolSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { classes } = await import("@/lib/db/schema");
    return db
      .select({ id: classes.id, name: classes.name, ageGroup: classes.ageGroup, sortOrder: classes.sortOrder })
      .from(classes)
      .where(and(eq(classes.schoolId, data.schoolId), eq(classes.locationId, data.locationId), eq(classes.status, "active")))
      .orderBy(asc(classes.sortOrder), asc(classes.name));
  });

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOLS & LOCATIONS MANAGEMENT (school_admin view)
// ─────────────────────────────────────────────────────────────────────────────

const getSchoolWithLocationsSchema = z.object({
  schoolId: z.number().optional(),
});

export const getSchoolWithLocations = createServerFn({ method: "GET" })
  .validator((input: unknown) => getSchoolWithLocationsSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    const { db } = await import("@/lib/db");
    const { users, schools, locations, students, staff } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ schoolId: users.schoolId, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");

    const targetSchoolId = data.schoolId ? (user.role === "super_admin" ? data.schoolId : user.schoolId) : user.schoolId;

    const [school] = await db
      .select()
      .from(schools)
      .where(eq(schools.id, targetSchoolId))
      .limit(1);
    if (!school) throw new Error("School not found");

    const locs = await db
      .select()
      .from(locations)
      .where(eq(locations.schoolId, targetSchoolId))
      .orderBy(asc(locations.name));

    // Attach student + staff counts per branch
    const locsWithCounts = await Promise.all(
      locs.map(async (l) => {
        const [{ cnt: studentCnt }] = await db
          .select({ cnt: count() })
          .from(students)
          .where(and(eq(students.schoolId, targetSchoolId), eq(students.locationId, l.id)));
        const [{ cnt: staffCnt }] = await db
          .select({ cnt: count() })
          .from(staff)
          .where(and(eq(staff.schoolId, targetSchoolId), eq(staff.locationId, l.id)));
        return { ...l, studentCount: Number(studentCnt), staffCount: Number(staffCnt) };
      })
    );

    return { school, locations: locsWithCounts, role: user.role };
  });

const addBranchSchema = z.object({
  schoolId: z.number(),
  name: z.string().trim().min(1).max(255),
  address: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(50).optional(),
  capacity: z.number().int().optional(),
  facilityType: z.enum(["school", "daycare", "both"]).default("school"),
});

export const addBranch = createServerFn({ method: "POST" })
  .validator((input: unknown) => addBranchSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, locations } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ schoolId: users.schoolId, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");
    if (!["school_admin", "super_admin"].includes(user.role ?? "")) throw new Error("Not authorized");

    const targetSchoolId = user.role === "super_admin" ? data.schoolId : user.schoolId;

    // Plan limit guard
    if (targetSchoolId) await checkPlanLimit(targetSchoolId, "locations");

    if (targetSchoolId) {
      const [existing] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.schoolId, targetSchoolId), eq(locations.name, data.name)))
        .limit(1);
      if (existing) throw new Error(`A branch named "${data.name}" already exists`);
    }

    const [res] = await db.insert(locations).values({
      schoolId: targetSchoolId,
      name: data.name,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      pincode: data.pincode || null,
      phone: data.phone || null,
      capacity: data.capacity || null,
      facilityType: data.facilityType,
      status: "active",
    });

    return { ok: true, locationId: Number((res as any).insertId) };
  });

const updateSchoolSchema = z.object({
  schoolId: z.number(),
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
});

export const updateSchool = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateSchoolSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, schools } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ schoolId: users.schoolId, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");
    if (!["school_admin", "super_admin"].includes(user.role ?? "")) throw new Error("Not authorized");

    const targetSchoolId = user.role === "super_admin" ? data.schoolId : user.schoolId;

    await db.update(schools).set({
      name: data.name,
      email: data.email ? normalizeEmail(data.email) : null,
      phone: data.phone || null,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      pincode: data.pincode || null,
    }).where(eq(schools.id, targetSchoolId));

    return { ok: true };
  });

const updateSchoolLogoSchema = z.object({
  schoolId: z.number(),
  logo: z.string().trim().min(1),
});

export const updateSchoolLogo = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateSchoolLogoSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, schools } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ schoolId: users.schoolId, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");
    if (!["school_admin", "super_admin"].includes(user.role ?? "")) throw new Error("Not authorized");

    const targetSchoolId = user.role === "super_admin" ? data.schoolId : user.schoolId;

    const match = data.logo.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
    if (!match) throw new Error("Invalid image data");

    const mimeExt = match[1].toLowerCase();
    const extMap: Record<string, string> = {
      png: "png",
      jpeg: "jpg",
      jpg: "jpg",
      webp: "webp",
      gif: "gif",
      "svg+xml": "svg",
    };
    const ext = extMap[mimeExt];
    if (!ext) throw new Error("Unsupported image format");

    const base64 = data.logo.slice(match[0].length);
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 5 * 1024 * 1024) throw new Error("Image must be under 5MB");

    const mimeType = `image/${mimeExt === "svg" ? "svg+xml" : mimeExt}`;
    const fileName = `schools/${targetSchoolId}/logo/logo-${Date.now()}.${ext}`;

    let logoUrl: string;

    const r2AccountId = process.env.R2_ACCOUNT_ID;
    const r2KeyId     = process.env.R2_ACCESS_KEY_ID;
    const r2Secret    = process.env.R2_SECRET_ACCESS_KEY;
    const r2Bucket    = process.env.R2_BUCKET_NAME;
    const r2PublicUrl = process.env.R2_PUBLIC_URL;

    const hasR2 =
      r2AccountId && !r2AccountId.startsWith("your-") &&
      r2KeyId     && !r2KeyId.startsWith("your-") &&
      r2Secret    && !r2Secret.startsWith("your-") &&
      r2Bucket    && r2PublicUrl;

    if (hasR2) {
      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: r2KeyId!, secretAccessKey: r2Secret! },
      });
      await s3.send(new PutObjectCommand({
        Bucket: r2Bucket!,
        Key: fileName,
        Body: buffer,
        ContentType: mimeType,
      }));
      logoUrl = `${r2PublicUrl!.replace(/\/$/, "")}/${fileName}`;
    } else {
      // Fallback: local disk (dev only)
      const uploadDir = path.join(process.cwd(), "public", "uploads", "schools", String(targetSchoolId), "logo");
      await mkdir(uploadDir, { recursive: true });
      const localName = `logo-${Date.now()}.${ext}`;
      await writeFile(path.join(uploadDir, localName), buffer);
      logoUrl = `/uploads/schools/${targetSchoolId}/logo/${localName}`;
    }

    await db.update(schools).set({ logoUrl }).where(eq(schools.id, targetSchoolId));
    return { ok: true, logoUrl };
  });

// ─────────────────────────────────────────────────────────────────────────────
// ADMISSIONS / INQUIRY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const listInquiriesSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
});

export const listInquiries = createServerFn({ method: "GET" })
  .validator((input: unknown) => listInquiriesSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { inquiries, students, parents } = await import("@/lib/db/schema");

    return db
      .select({
        id: inquiries.id,
        parentName: sql<string | null>`COALESCE(${parents.name}, ${inquiries.parentName})`,
        email: sql<string | null>`COALESCE(${parents.email}, ${inquiries.email})`,
        phone: sql<string | null>`COALESCE(${parents.phone}, ${inquiries.phone})`,
        childName: inquiries.childName,
        childDob: inquiries.childDob,
        programInterest: inquiries.programInterest,
        source: inquiries.source,
        status: inquiries.status,
        notes: inquiries.notes,
        createdAt: inquiries.createdAt,
        updatedAt: inquiries.updatedAt,
      })
      .from(inquiries)
      .leftJoin(students, eq(inquiries.studentId, students.id))
      .leftJoin(parents, and(eq(parents.studentId, students.id), eq(parents.isPrimary, 1)))
      .where(and(eq(inquiries.schoolId, data.schoolId), eq(inquiries.locationId, data.locationId)))
      .orderBy(desc(inquiries.createdAt));
  });

const addInquirySchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  parentName: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  childName: z.string().trim().min(1).max(255),
  childDob: z.string().optional(),
  programInterest: z.string().trim().max(100).optional(),
  source: z.string().trim().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const addInquiry = createServerFn({ method: "POST" })
  .validator((input: unknown) => addInquirySchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { inquiries } = await import("@/lib/db/schema");

    const [res] = await db.insert(inquiries).values({
      schoolId: data.schoolId,
      locationId: data.locationId,
      parentName: data.parentName,
      email: data.email ? normalizeEmail(data.email) : null,
      phone: data.phone || null,
      childName: data.childName,
      childDob: data.childDob ? new Date(data.childDob) : null,
      programInterest: data.programInterest || null,
      source: data.source || null,
      notes: data.notes || null,
      status: "new",
    });

    return { ok: true, inquiryId: Number((res as any).insertId) };
  });

const updateInquirySchema = z.object({
  inquiryId: z.number(),
  parentName: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  childName: z.string().trim().max(255).optional(),
  childDob: z.string().optional(),
  programInterest: z.string().trim().max(100).optional(),
  source: z.string().trim().max(100).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(["new", "contacted", "tour_scheduled", "applied", "waitlisted", "rejected", "enrolled"]).optional(),
});

export const updateInquiry = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateInquirySchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { inquiries } = await import("@/lib/db/schema");

    const [oldInquiry] = await db.select({ status: inquiries.status }).from(inquiries).where(eq(inquiries.id, data.inquiryId)).limit(1);

    // Prevent backwards status transitions (e.g. enrolled -> applied)
    const inquiryStatusOrder = ["new", "contacted", "tour_scheduled", "applied", "waitlisted", "rejected", "enrolled"];
    const oldIndex = oldInquiry ? inquiryStatusOrder.indexOf(oldInquiry.status ?? "new") : -1;
    const newIndex = data.status ? inquiryStatusOrder.indexOf(data.status) : -1;
    if (oldInquiry && data.status && newIndex < oldIndex) {
      throw new Error(`Cannot move inquiry status from ${oldInquiry.status} to ${data.status}.`);
    }

    await db.update(inquiries).set({
      parentName: data.parentName,
      email: data.email ? normalizeEmail(data.email) : null,
      phone: data.phone || null,
      childName: data.childName,
      childDob: data.childDob ? new Date(data.childDob) : undefined,
      programInterest: data.programInterest || null,
      source: data.source || null,
      notes: data.notes || null,
      status: data.status,
    }).where(eq(inquiries.id, data.inquiryId));

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// ENROLL FROM ADMISSION (one-shot: update inquiry + create student)
// ─────────────────────────────────────────────────────────────────────────────

const enrollFromAdmissionSchema = z.object({
  inquiryId: z.number(),
  schoolId: z.number(),
  locationId: z.number(),
  classId: z.number().optional(),
  startDate: z.string().optional(),
  // Child details (prefilled from inquiry but editable)
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().max(255).default(""),
  childDob: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  // Parent details
  parentName: z.string().trim().min(1).max(255),
  parentEmail: z.string().trim().max(255).optional(),
  parentPhone: z.string().trim().max(50).optional(),
});

export const enrollFromAdmission = createServerFn({ method: "POST" })
  .validator((input: unknown) => enrollFromAdmissionSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { inquiries, students, parents, classEnrollments, users, schools } = await import("@/lib/db/schema");

    await checkPlanLimit(data.schoolId, "students");

    // Class capacity guard
    if (data.classId) {
      const { classes } = await import("@/lib/db/schema");
      const [cls] = await db.select({ capacity: classes.capacity }).from(classes).where(eq(classes.id, data.classId)).limit(1);
      if (cls) {
        const [{ cnt }] = await db.select({ cnt: count() }).from(classEnrollments)
          .where(and(eq(classEnrollments.classId, data.classId), eq(classEnrollments.status, "active")));
        if (Number(cnt) >= cls.capacity) throw new Error(`Class is at full capacity (${cls.capacity} students)`);
      }
    }

    // Split name
    const nameParts = data.firstName.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = data.lastName || nameParts.slice(1).join(" ") || "";
    const dateOfBirth = data.childDob ? new Date(data.childDob) : null;

    // Idempotent: re-enrolling the same inquiry must not create a duplicate student
    let [existingStudent] = await db.select({ id: students.id, admissionNumber: students.admissionNumber })
      .from(students)
      .where(
        and(
          eq(students.schoolId, data.schoolId),
          eq(students.locationId, data.locationId),
          eq(students.firstName, firstName),
          eq(students.lastName, lastName),
          dateOfBirth ? eq(students.dateOfBirth, dateOfBirth) : isNull(students.dateOfBirth)
        )
      )
      .limit(1);

    let studentId: number;
    if (existingStudent) {
      studentId = existingStudent.id;
      await db.update(students).set({
        firstName,
        lastName,
        dateOfBirth,
        gender: data.gender ?? null,
        currentClassId: data.classId ?? null,
        status: "enrolled",
      }).where(eq(students.id, studentId));

      // Update or create the primary parent record
      const [existingParent] = await db
        .select({ id: parents.id, email: parents.email })
        .from(parents)
        .where(eq(parents.studentId, studentId))
        .limit(1);
      if (existingParent) {
        await db.update(parents).set({
          name: data.parentName,
          email: data.parentEmail ? normalizeEmail(data.parentEmail) : null,
          phone: data.parentPhone || null,
        }).where(eq(parents.id, existingParent.id));

        // Keep the parent user login email in sync
        if (existingParent.email && data.parentEmail && normalizeEmail(data.parentEmail) !== normalizeEmail(existingParent.email)) {
          await db.update(users)
            .set({ email: normalizeEmail(data.parentEmail) })
            .where(eq(users.email, normalizeEmail(existingParent.email)));
        }
      } else {
        await db.insert(parents).values({
          schoolId: data.schoolId,
          locationId: data.locationId,
          studentId,
          name: data.parentName,
          email: data.parentEmail ? normalizeEmail(data.parentEmail) : null,
          phone: data.parentPhone || null,
          relation: "guardian",
          isPrimary: 1,
          isEmergency: 0,
        });
      }
    } else {
      const [studentRes] = await db.insert(students).values({
        schoolId: data.schoolId,
        locationId: data.locationId,
        firstName,
        lastName,
        dateOfBirth,
        gender: data.gender ?? null,
        currentClassId: data.classId ?? null,
        status: "enrolled",
      });
      studentId = Number((studentRes as any).insertId);

      await db.insert(parents).values({
        schoolId: data.schoolId,
        locationId: data.locationId,
        studentId,
        name: data.parentName,
        email: data.parentEmail ? normalizeEmail(data.parentEmail) : null,
        phone: data.parentPhone || null,
        relation: "guardian",
        isPrimary: 1,
        isEmergency: 0,
      });
    }

    // Ensure admission number is generated (for new or pre-existing students without one)
    if (!existingStudent?.admissionNumber) {
      const [schoolRow] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, data.schoolId)).limit(1);
      const admissionNumber = generateAdmissionNumber(schoolRow?.name ?? "School", studentId);
      await db.update(students).set({ admissionNumber }).where(eq(students.id, studentId));
    }

    // Upsert class enrollment to avoid duplicates
    if (data.classId) {
      const [existingEnrollment] = await db.select({ id: classEnrollments.id })
        .from(classEnrollments)
        .where(and(eq(classEnrollments.studentId, studentId), eq(classEnrollments.classId, data.classId)))
        .limit(1);
      if (existingEnrollment) {
        await db.update(classEnrollments).set({ status: "active" }).where(eq(classEnrollments.id, existingEnrollment.id));
      } else {
        await db.insert(classEnrollments).values({
          schoolId: data.schoolId,
          locationId: data.locationId,
          studentId,
          classId: data.classId,
          academicYear: "",
          enrolledAt: data.startDate ? new Date(data.startDate) : new Date(),
          status: "active",
        });
      }
    }

    // Mark inquiry as enrolled and copy final details from the enrollment form
    await db.update(inquiries).set({
      status: "enrolled",
      studentId,
      parentName: data.parentName,
      email: data.parentEmail ? normalizeEmail(data.parentEmail) : null,
      phone: data.parentPhone || null,
      childName: `${firstName} ${lastName}`.trim(),
      childDob: dateOfBirth,
    }).where(eq(inquiries.id, data.inquiryId));

    return { ok: true, studentId };
  });

// ─────────────────────────────────────────────────────────────────────────────
// CLASSES CRUD
// ─────────────────────────────────────────────────────────────────────────────

const listClassesSchema = z.object({ schoolId: z.number(), locationId: z.number() });

export const listClasses = createServerFn({ method: "GET" })
  .validator((input: unknown) => listClassesSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { classes, classEnrollments, staff, staffClassAssignments } = await import("@/lib/db/schema");

    const isAdmin = user.role === "super_admin" || user.role === "school_admin" || user.role === "location_admin";

    let query: any = db
      .select({
        id: classes.id,
        name: classes.name,
        ageGroup: classes.ageGroup,
        roomName: classes.roomName,
        capacity: classes.capacity,
        startTime: classes.startTime,
        endTime: classes.endTime,
        academicYear: classes.academicYear,
        status: classes.status,
        sortOrder: classes.sortOrder,
      })
      .from(classes)
      .where(and(eq(classes.schoolId, data.schoolId), eq(classes.locationId, data.locationId)))
      .orderBy(asc(classes.sortOrder), asc(classes.name));

    if (!isAdmin && (user.role === "teacher" || user.role === "staff")) {
      const [staffRecord] = await db
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.schoolId, user.schoolId), or(eq(staff.userId, user.id), eq(staff.email, user.email ?? ""))))
        .limit(1);

      if (staffRecord) {
        query = db
          .select({
            id: classes.id,
            name: classes.name,
            ageGroup: classes.ageGroup,
            roomName: classes.roomName,
            capacity: classes.capacity,
            startTime: classes.startTime,
            endTime: classes.endTime,
            academicYear: classes.academicYear,
            status: classes.status,
            sortOrder: classes.sortOrder,
          })
          .from(classes)
          .innerJoin(staffClassAssignments, eq(staffClassAssignments.classId, classes.id))
          .where(and(
            eq(classes.schoolId, data.schoolId),
            eq(classes.locationId, data.locationId),
            eq(staffClassAssignments.staffId, staffRecord.id),
          ))
          .orderBy(asc(classes.sortOrder), asc(classes.name));
      } else {
        return [];
      }
    }

    const rows = await query;

    // Attach enrolled count per class
    return Promise.all(rows.map(async (c) => {
      const [{ cnt }] = await db
        .select({ cnt: count() })
        .from(classEnrollments)
        .where(and(eq(classEnrollments.classId, c.id), eq(classEnrollments.status, "active")));
      return { ...c, enrolledCount: Number(cnt) };
    }));
  });

const addClassSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  name: z.string().trim().min(1).max(255),
  ageGroup: z.string().trim().min(1).max(100),
  roomName: z.string().trim().max(255).optional(),
  capacity: z.number().int().min(1),
  startTime: z.string().max(10).optional(),
  endTime: z.string().max(10).optional(),
  academicYear: z.string().max(20).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const addClass = createServerFn({ method: "POST" })
  .validator((input: unknown) => addClassSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    if (!["super_admin", "school_admin", "location_admin"].includes(user.role ?? "")) {
      throw new Error("Only admins can add classes");
    }
    const { db } = await import("@/lib/db");
    const { classes } = await import("@/lib/db/schema");

    const [existing] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(
        eq(classes.schoolId, data.schoolId),
        eq(classes.locationId, data.locationId),
        eq(classes.name, data.name),
        data.academicYear ? eq(classes.academicYear, data.academicYear) : isNull(classes.academicYear)
      ))
      .limit(1);
    if (existing) throw new Error(`A class named "${data.name}" already exists at this branch`);

    const [res] = await db.insert(classes).values({
      schoolId: data.schoolId, locationId: data.locationId,
      name: data.name, ageGroup: data.ageGroup,
      roomName: data.roomName || null, capacity: data.capacity,
      startTime: data.startTime || null, endTime: data.endTime || null,
      academicYear: data.academicYear || null, status: "active",
      sortOrder: data.sortOrder ?? 0,
    });
    return { ok: true, classId: Number((res as any).insertId) };
  });

const updateClassSchema = z.object({
  classId: z.number(),
  name: z.string().trim().min(1).max(255),
  ageGroup: z.string().trim().min(1).max(100),
  roomName: z.string().trim().max(255).optional(),
  capacity: z.number().int().min(1),
  startTime: z.string().max(10).optional(),
  endTime: z.string().max(10).optional(),
  academicYear: z.string().max(20).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateClass = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateClassSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { classes } = await import("@/lib/db/schema");

    const [cls] = await db
      .select({ id: classes.id, schoolId: classes.schoolId, locationId: classes.locationId })
      .from(classes)
      .where(eq(classes.id, data.classId))
      .limit(1);
    if (!cls) throw new Error("Class not found");

    const user = await requireAuth(cls.schoolId, cls.locationId);
    await assertCanOperateForUser();
    if (!["super_admin", "school_admin", "location_admin"].includes(user.role ?? "")) {
      throw new Error("Only admins can update classes");
    }

    const [existing] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(
        eq(classes.schoolId, cls.schoolId),
        eq(classes.locationId, cls.locationId),
        eq(classes.name, data.name),
        data.academicYear ? eq(classes.academicYear, data.academicYear) : isNull(classes.academicYear),
        ne(classes.id, data.classId)
      ))
      .limit(1);
    if (existing) throw new Error(`A class named "${data.name}" already exists at this branch`);

    await db.update(classes).set({
      name: data.name, ageGroup: data.ageGroup,
      roomName: data.roomName || null, capacity: data.capacity,
      startTime: data.startTime || null, endTime: data.endTime || null,
      academicYear: data.academicYear || null,
      status: data.status ?? undefined,
      sortOrder: data.sortOrder ?? undefined,
    }).where(eq(classes.id, data.classId));
    return { ok: true };
  });

const archiveClassSchema = z.object({ classId: z.number() });

export const archiveClass = createServerFn({ method: "POST" })
  .validator((input: unknown) => archiveClassSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { classes } = await import("@/lib/db/schema");

    const [cls] = await db
      .select({ id: classes.id, schoolId: classes.schoolId, locationId: classes.locationId })
      .from(classes)
      .where(eq(classes.id, data.classId))
      .limit(1);
    if (!cls) throw new Error("Class not found");

    const user = await requireAuth(cls.schoolId, cls.locationId);
    await assertCanOperateForUser();
    if (!["super_admin", "school_admin", "location_admin"].includes(user.role ?? "")) {
      throw new Error("Only admins can archive classes");
    }

    await db.update(classes).set({ status: "inactive" }).where(eq(classes.id, data.classId));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// STAFF CRUD
// ─────────────────────────────────────────────────────────────────────────────

const listStaffSchema = z.object({ schoolId: z.number(), locationId: z.number() });

export const listStaff = createServerFn({ method: "GET" })
  .validator((input: unknown) => listStaffSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { staff, staffClassAssignments, classes, users } = await import("@/lib/db/schema");

    const rows = await db
      .select({
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        phone: staff.phone,
        role: staff.role,
        joinDate: staff.joinDate,
        salary: staff.salary,
        status: staff.status,
        backgroundCheckStatus: staff.backgroundCheckStatus,
        backgroundCheckDocUrl: staff.backgroundCheckDocUrl,
        userId: staff.userId,
        loginStatus: users.status,
        loginRole: users.role,
      })
      .from(staff)
      .leftJoin(users, eq(staff.userId, users.id))
      .where(and(
        eq(staff.schoolId, data.schoolId),
        eq(staff.locationId, data.locationId),
      ))
      .orderBy(asc(staff.firstName));

    return Promise.all(rows.map(async (s) => {
      const assignments = await db
        .select({ className: classes.name })
        .from(staffClassAssignments)
        .innerJoin(classes, eq(staffClassAssignments.classId, classes.id))
        .where(eq(staffClassAssignments.staffId, s.id));
      return {
        ...s,
        joinDate: s.joinDate instanceof Date ? s.joinDate.toISOString().slice(0, 10) : (s.joinDate ?? null),
        classes: assignments.map((a) => a.className),
        loginStatus: s.userId ? (s.loginStatus ?? "invited") : "none",
        loginRole: s.loginRole ?? null,
      };
    }));
  });

const addStaffSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().max(255).default(""),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  role: z.enum(["teacher", "assistant", "admin", "principal", "support"]).default("teacher"),
  joinDate: z.string().optional(),
  salary: z.string().optional(),
  sendInvite: z.boolean().optional().default(false),
  appRole: z.enum(["teacher", "staff", "accountant", "location_admin"]).optional().default("teacher"),
});

export const addStaffMember = createServerFn({ method: "POST" })
  .validator((input: unknown) => addStaffSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();

    // Plan limit guard
    await checkPlanLimit(data.schoolId, "staff");

    const { db } = await import("@/lib/db");
    const { staff, users, schools } = await import("@/lib/db/schema");

    // Create staff record first
    const [res] = await db.insert(staff).values({
      schoolId: data.schoolId, locationId: data.locationId,
      firstName: data.firstName, lastName: data.lastName,
      email: data.email ? normalizeEmail(data.email) : null, phone: data.phone || null,
      role: data.role,
      joinDate: data.joinDate ? new Date(data.joinDate) : null,
      salary: data.salary || null,
      status: "active", backgroundCheckStatus: "pending",
    });
    const staffId = Number((res as any).insertId);

    // Optionally create invite + link userId
    let inviteToken: string | null = null;
    if (data.sendInvite && data.email) {
      const email = normalizeEmail(data.email);
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      let userId: number;
      if (existing) {
        userId = existing.id;
        await db.update(users).set({ status: "invited", role: data.appRole }).where(eq(users.id, userId));
      } else {
        const [uRes] = await db.insert(users).values({
          schoolId: data.schoolId, locationId: data.locationId,
          email, firstName: data.firstName, lastName: data.lastName,
          role: data.appRole, status: "invited",
        });
        userId = Number((uRes as any).insertId);
      }
      // Link user to staff record
      await db.update(staff).set({ userId }).where(eq(staff.id, staffId));

      inviteToken = await new jose.SignJWT({ userId, purpose: "invite" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(JWT_SECRET);

      // Send invite email unless disabled
      if (process.env.SKIP_INVITE_EMAIL !== "true") {
        const appUrl = process.env.APP_URL ?? process.env.VITE_APP_URL ?? "https://edupulse.vercel.app";
        const inviteUrl = `${appUrl}/invite?token=${inviteToken}`;
        const [schoolRow] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, data.schoolId)).limit(1);
        const schoolName = schoolRow?.name ?? "Your School";
        try {
          const { sendStaffInviteEmail } = await import("@/lib/email");
          await sendStaffInviteEmail(email, inviteUrl, schoolName);
        } catch (emailErr) {
          console.error("Failed to send staff invite email:", emailErr);
        }
      }
    }

    return { ok: true, staffId, inviteToken };
  });

const updateStaffSchema = z.object({
  staffId: z.number(),
  firstName: z.string().trim().min(1).max(255),
  lastName: z.string().trim().max(255).optional().default(""),
  email: z.string().trim().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  role: z.enum(["teacher", "assistant", "admin", "principal", "support"]).optional(),
  joinDate: z.string().optional(),
  salary: z.string().optional(),
  status: z.enum(["active", "inactive", "terminated", "on_leave"]).optional(),
  backgroundCheckStatus: z.enum(["pending", "in_progress", "verified", "rejected", "expired"]).optional(),
});

export const updateStaffMember = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateStaffSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { staff, users } = await import("@/lib/db/schema");
    const [row] = await db.select({ userId: staff.userId, email: staff.email }).from(staff).where(eq(staff.id, data.staffId)).limit(1);
    await db.update(staff).set({
      firstName: data.firstName, lastName: data.lastName ?? "",
      email: data.email ? normalizeEmail(data.email) : null, phone: data.phone || null,
      role: data.role ?? undefined,
      joinDate: data.joinDate ? new Date(data.joinDate) : undefined,
      salary: data.salary || null,
      status: data.status ?? undefined,
      backgroundCheckStatus: data.backgroundCheckStatus ?? undefined,
    }).where(eq(staff.id, data.staffId));
    // Keep the linked user record in sync so login still works after a staff email change.
    if (row?.userId) {
      await db.update(users).set({
        email: data.email ? normalizeEmail(data.email) : null,
        firstName: data.firstName,
        lastName: data.lastName ?? "",
      }).where(eq(users.id, row.userId));
    }
    return { ok: true };
  });

const archiveStaffSchema = z.object({ staffId: z.number() });

export const archiveStaff = createServerFn({ method: "POST" })
  .validator((input: unknown) => archiveStaffSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { staff } = await import("@/lib/db/schema");
    await db.update(staff).set({ status: "terminated" }).where(eq(staff.id, data.staffId));
    return { ok: true };
  });

// ── Send parent portal invite for an inquiry ─────────────────────────────────
const sendParentInviteSchema = z.object({
  inquiryId: z.number(),
});

export const sendParentInvite = createServerFn({ method: "POST" })
  .validator((input: unknown) => sendParentInviteSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { inquiries, users, schools } = await import("@/lib/db/schema");

    const [inquiry] = await db.select().from(inquiries).where(eq(inquiries.id, data.inquiryId)).limit(1);
    if (!inquiry) throw new Error("Inquiry not found");
    if (!inquiry.email) throw new Error("No email on this inquiry");

    const email = normalizeEmail(inquiry.email);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    let userId: number;
    if (existing) {
      userId = existing.id;
      await db.update(users).set({ status: "invited", role: "parent" }).where(eq(users.id, userId));
    } else {
      const nameParts = inquiry.parentName.trim().split(" ");
      const [uRes] = await db.insert(users).values({
        schoolId: inquiry.schoolId,
        locationId: inquiry.locationId,
        email,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" ") || "",
        role: "parent",
        status: "invited",
      });
      userId = Number((uRes as any).insertId);
    }

    const inviteToken = await new jose.SignJWT({ userId, purpose: "invite" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    // Send invite email unless disabled
    if (process.env.SKIP_INVITE_EMAIL !== "true") {
      const appUrl = process.env.APP_URL ?? process.env.VITE_APP_URL ?? "https://edupulse.vercel.app";
      const inviteUrl = `${appUrl}/invite?token=${inviteToken}`;
      const [schoolRow] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, inquiry.schoolId)).limit(1);
      const schoolName = schoolRow?.name ?? "Your School";
      try {
        const { sendParentInviteEmail } = await import("@/lib/email");
        await sendParentInviteEmail(email, inviteUrl, schoolName, inquiry.childName ?? "your child");
      } catch (emailErr) {
        console.error("Failed to send parent invite email:", emailErr);
      }
    }

    return { ok: true, inviteToken };
  });

// ── Admin update a parent record (name, phone, email, relation) ──────────────
const updateParentSchema = z.object({
  parentId: z.number(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  relation: z.string().optional(),
});

export const updateParent = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateParentSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { parents } = await import("@/lib/db/schema");
    await db.update(parents).set({
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      relation: data.relation ?? null,
    } as any).where(eq(parents.id, data.parentId));
    return { ok: true };
  });

// ── Send / resend portal invite for a parent by parentId ─────────────────────
const sendParentPortalInviteSchema = z.object({ parentId: z.number() });

export const sendParentPortalInvite = createServerFn({ method: "POST" })
  .validator((input: unknown) => sendParentPortalInviteSchema.parse(input))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { db } = await import("@/lib/db");
    const { parents, users, students, schools } = await import("@/lib/db/schema");

    const [parent] = await db
      .select({ id: parents.id, name: parents.name, email: parents.email, userId: parents.userId, studentId: parents.studentId })
      .from(parents).where(eq(parents.id, data.parentId)).limit(1);
    if (!parent) throw new Error("Parent not found");
    if (!parent.email) throw new Error("Parent has no email address — add one first");

    // If already has a userId they've already set up their account
    if (parent.userId) throw new Error("This parent has already activated their account");

    const email = normalizeEmail(parent.email);

    // Look up the student to get schoolId (needed for user row)
    const [studentRow] = await db.select({ firstName: students.firstName, schoolId: students.schoolId }).from(students).where(eq(students.id, parent.studentId!)).limit(1);
    const schoolId = studentRow?.schoolId ?? session.schoolId;

    // Find or create user account
    let userId: number;
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const [r] = await db.insert(users).values({ email, schoolId, role: "parent", status: "invited" } as any);
      userId = Number((r as any).insertId);
    }

    // Link parent → user
    await db.update(parents).set({ userId } as any).where(eq(parents.id, parent.id));

    const inviteToken = await new jose.SignJWT({ userId, purpose: "invite" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    if (process.env.SKIP_INVITE_EMAIL !== "true") {
      const appUrl = process.env.APP_URL ?? process.env.VITE_APP_URL ?? "https://edupulse.vercel.app";
      const inviteUrl = `${appUrl}/invite?token=${inviteToken}`;
      const [schoolRow] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, schoolId)).limit(1);
      const schoolName = schoolRow?.name ?? "Your School";
      try {
        await sendParentInviteEmail(email, inviteUrl, schoolName, studentRow?.firstName ?? "your child");
      } catch (emailErr) {
        console.error("Failed to send parent portal invite email:", emailErr);
      }
    }

    return { ok: true, inviteToken };
  });

// ── Resend / send invite for an existing staff member ────────────────────────
const resendStaffInviteSchema = z.object({
  staffId: z.number(),
  appRole: z.enum(["teacher", "staff", "accountant", "location_admin"]).default("teacher"),
});

export const resendStaffInvite = createServerFn({ method: "POST" })
  .validator((input: unknown) => resendStaffInviteSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { staff, users, schools } = await import("@/lib/db/schema");

    const [member] = await db.select().from(staff).where(eq(staff.id, data.staffId)).limit(1);
    if (!member) throw new Error("Staff not found");
    if (!member.email) throw new Error("Staff has no email address");

    const email = normalizeEmail(member.email);
    let userId: number;

    if (member.userId) {
      userId = member.userId;
      await db.update(users).set({ status: "invited", role: data.appRole }).where(eq(users.id, userId));
    } else {
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) {
        userId = existing.id;
        await db.update(users).set({ status: "invited", role: data.appRole }).where(eq(users.id, userId));
      } else {
        const [uRes] = await db.insert(users).values({
          schoolId: member.schoolId, locationId: member.locationId,
          email, firstName: member.firstName, lastName: member.lastName,
          role: data.appRole, status: "invited",
        });
        userId = Number((uRes as any).insertId);
      }
      await db.update(staff).set({ userId }).where(eq(staff.id, data.staffId));
    }

    const inviteToken = await new jose.SignJWT({ userId, purpose: "invite" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(JWT_SECRET);

    // Send invite email unless disabled
    if (process.env.SKIP_INVITE_EMAIL !== "true") {
      const appUrl = process.env.APP_URL ?? process.env.VITE_APP_URL ?? "https://edupulse.vercel.app";
      const inviteUrl = `${appUrl}/invite?token=${inviteToken}`;
      const [schoolRow] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, member.schoolId)).limit(1);
      const schoolName = schoolRow?.name ?? "Your School";
      try {
        const { sendStaffInviteEmail } = await import("@/lib/email");
        await sendStaffInviteEmail(email, inviteUrl, schoolName);
      } catch (emailErr) {
        console.error("Failed to send staff invite email:", emailErr);
      }
    }

    return { ok: true, inviteToken };
  });

// ─────────────────────────────────────────────────────────────────────────────
// FEES / INVOICES CRUD
// ─────────────────────────────────────────────────────────────────────────────

const listInvoicesSchema = z.object({ schoolId: z.number(), locationId: z.number(), classId: z.number().optional() });

export const listInvoices = createServerFn({ method: "GET" })
  .validator((input: unknown) => listInvoicesSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { invoices, students, classes } = await import("@/lib/db/schema");

    const filters: any[] = [eq(invoices.schoolId, data.schoolId), eq(invoices.locationId, data.locationId)];
    if (data.classId) filters.push(eq(students.currentClassId, data.classId));

    const rows = await db
      .select({
        id: invoices.id,
        studentId: invoices.studentId,
        amount: invoices.amount,
        dueDate: invoices.dueDate,
        status: invoices.status,
        paidAt: invoices.paidAt,
        createdAt: invoices.createdAt,
        feeStructureId: invoices.feeStructureId,
        studentFirstName: students.firstName,
        studentLastName: students.lastName,
        className: classes.name,
      })
      .from(invoices)
      .innerJoin(students, eq(invoices.studentId, students.id))
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .where(and(...filters))
      .orderBy(desc(invoices.createdAt));

    return rows.map((r) => ({
      ...r,
      dueDate: r.dueDate ? r.dueDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : null,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      studentName: `${r.studentFirstName} ${r.studentLastName}`.trim(),
    }));
  });

const addInvoiceSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  studentId: z.number(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
  dueDate: z.string().optional(),
  feeStructureId: z.number().optional(),
});

export const addInvoice = createServerFn({ method: "POST" })
  .validator((input: unknown) => addInvoiceSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { invoices } = await import("@/lib/db/schema");
    const [res] = await db.insert(invoices).values({
      schoolId: data.schoolId, locationId: data.locationId,
      studentId: data.studentId,
      amount: data.amount,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      feeStructureId: data.feeStructureId ?? null,
      status: "draft",
    });
    return { ok: true, invoiceId: Number((res as any).insertId) };
  });

const updateInvoiceSchema = z.object({
  invoiceId: z.number(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  dueDate: z.string().optional(),
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled", "refunded"]).optional(),
  paidAt: z.string().optional(),
});

export const updateInvoice = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateInvoiceSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { invoices } = await import("@/lib/db/schema");
    await db.update(invoices).set({
      amount: data.amount ?? undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      status: data.status ?? undefined,
      paidAt: data.paidAt ? new Date(data.paidAt) : (data.status === "paid" ? new Date() : undefined),
    }).where(eq(invoices.id, data.invoiceId));
    return { ok: true };
  });

// ── INVOICE GENERATION ───────────────────────────────────────────────────────

const generateStudentInvoiceSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  studentId: z.number(),
  month: z.string().regex(/^\d{4}-\d{2}$/), // "2025-04"
  // Optional: override date range for partial-month billing (e.g. mid-month exit)
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function isFeeApplicableForMonth(frequency: string, month: string, skipOneTime: boolean) {
  if (frequency === "one_time") return !skipOneTime;
  if (frequency === "monthly" || frequency === "hourly") return true;
  const m = Number(month.split("-")[1]);
  if (frequency === "quarterly") {
    const quarterStart = [1, 1, 1, 4, 4, 4, 7, 7, 7, 10, 10, 10][m - 1];
    return m === quarterStart;
  }
  if (frequency === "annually") return m === 1;
  return false;
}

async function generateStudentInvoiceCore(
  data: z.infer<typeof generateStudentInvoiceSchema>,
  opts: { status?: "draft" | "sent"; skipOneTime?: boolean } = {}
) {
  const status = opts.status ?? "draft";
  const skipOneTime = opts.skipOneTime ?? false;
  const { db } = await import("@/lib/db");
  const { invoices, feeStructures, students, daycareSessions, classes, locations } = await import("@/lib/db/schema");

  // Idempotency: if an invoice already exists for this student+month, return it unchanged.
  const [existing] = await db.select({ id: invoices.id })
    .from(invoices)
    .where(and(
      eq(invoices.studentId, data.studentId),
      eq(invoices.generatedMonth, data.month),
      notInArray(invoices.status, ["cancelled", "refunded"]),
    ))
    .limit(1);
  if (existing) return { invoiceId: existing.id, isExisting: true };

  const [student] = await db
    .select({ currentClassId: students.currentClassId })
    .from(students)
    .where(eq(students.id, data.studentId))
    .limit(1);

  const fees = await db
    .select({
      id: feeStructures.id,
      amount: feeStructures.amount,
      dueDay: feeStructures.dueDay,
      name: feeStructures.name,
      feeType: feeStructures.feeType,
      frequency: feeStructures.frequency,
    })
    .from(feeStructures)
    .where(and(
      eq(feeStructures.schoolId, data.schoolId),
      eq(feeStructures.locationId, data.locationId),
      or(
        eq(feeStructures.classId, student?.currentClassId ?? 0),
        isNull(feeStructures.classId),
      ),
    ));

  const applicableFees = fees.filter((f) => isFeeApplicableForMonth(f.frequency ?? "monthly", data.month, skipOneTime));

  // One-time fees should only ever be billed once per student, even manually.
  const oneTimeFeeIds = applicableFees
    .filter((f) => f.frequency === "one_time")
    .map((f) => f.id);

  if (oneTimeFeeIds.length) {
    const alreadyBilledOneTime = await db
      .select({ details: invoices.details })
      .from(invoices)
      .where(eq(invoices.studentId, data.studentId));
    const billedSet = new Set<number>();
    for (const inv of alreadyBilledOneTime) {
      if (!inv.details) continue;
      for (const id of oneTimeFeeIds) {
        if (inv.details.includes(`"feeStructureId":${id}`)) billedSet.add(id);
      }
    }
    for (let i = applicableFees.length - 1; i >= 0; i--) {
      if (billedSet.has(applicableFees[i].id)) applicableFees.splice(i, 1);
    }
  }

  if (!applicableFees.length) return { invoiceId: 0, isExisting: false };

  const [location] = await db
    .select({ facilityType: locations.facilityType })
    .from(locations)
    .where(eq(locations.id, data.locationId))
    .limit(1);
  const facilityType = location?.facilityType ?? "school";

  const [classRow] = await db
    .select({ endTime: classes.endTime })
    .from(students)
    .leftJoin(classes, eq(students.currentClassId, classes.id))
    .where(eq(students.id, data.studentId))
    .limit(1);
  const classEndTime = classRow?.endTime ?? null;

  const [y, m] = data.month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  // Allow partial-month range (e.g. mid-month exit): fromDate/toDate override the full month
  const startDate = data.fromDate ?? `${data.month}-01`;
  const endDate = data.toDate ?? `${data.month}-${String(lastDay).padStart(2, "0")}`;
  const isPartialMonth = !!(data.fromDate || data.toDate);

  const sessions = await db
    .select({
      sessionDate: daycareSessions.sessionDate,
      inTime: daycareSessions.inTime,
      outTime: daycareSessions.outTime,
      notes: daycareSessions.notes,
    })
    .from(daycareSessions)
    .where(and(
      eq(daycareSessions.schoolId, data.schoolId),
      eq(daycareSessions.locationId, data.locationId),
      eq(daycareSessions.studentId, data.studentId),
      gte(daycareSessions.sessionDate, new Date(startDate)),
      lte(daycareSessions.sessionDate, new Date(endDate)),
    ))
    .orderBy(daycareSessions.sessionDate);

  function timeToMin(t: string | null) {
    if (!t || !t.includes(":")) return null;
    const [h, mn] = t.split(":").map(Number);
    return h * 60 + mn;
  }

  function daycareHoursFor(inT: string | null, outT: string | null) {
    const inM = timeToMin(inT);
    const outM = timeToMin(outT);
    if (inM == null || outM == null || outM <= inM) return 0;
    if (facilityType === "daycare") return (outM - inM) / 60;
    const endM = timeToMin(classEndTime);
    if (endM == null) return 0;
    const startM = Math.max(inM, endM);
    if (outM <= startM) return 0;
    return (outM - startM) / 60;
  }

  const sessionDetails = sessions.map((s) => {
    const hrs = daycareHoursFor(s.inTime, s.outTime);
    return {
      date: s.sessionDate ? s.sessionDate.toISOString().slice(0, 10) : null,
      inTime: s.inTime,
      outTime: s.outTime,
      hours: +hrs.toFixed(2),
      notes: s.notes,
    };
  });
  const totalHours = sessionDetails.reduce((sum, s) => sum + s.hours, 0);

  // For partial-month billing, pro-rate flat (non-hourly) fees by days covered
  const totalDaysInMonth = new Date(y, m, 0).getDate();
  const fromD = new Date(startDate);
  const toD = new Date(endDate);
  const daysCovered = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1;
  const proRateFactor = isPartialMonth ? +(daysCovered / totalDaysInMonth).toFixed(4) : 1;

  const items: any[] = [];
  let total = 0;
  for (const f of applicableFees) {
    const rate = parseFloat(f.amount as any);
    if (f.feeType === "daycare_hourly") {
      const amount = +(totalHours * rate).toFixed(2);
      items.push({ feeStructureId: f.id, name: f.name, feeType: f.feeType, hours: +totalHours.toFixed(2), rate, amount });
      total += amount;
    } else {
      // Pro-rate flat fees for partial months
      const amount = +(rate * proRateFactor).toFixed(2);
      const label = isPartialMonth ? `${f.name} (${startDate} to ${endDate}, ${daysCovered}/${totalDaysInMonth} days)` : f.name;
      items.push({ feeStructureId: f.id, name: label, feeType: f.feeType, amount });
      total += amount;
    }
  }

  const dueDay = applicableFees[0]?.dueDay ?? 1;
  const dueDate = isPartialMonth ? endDate : `${data.month}-${String(dueDay).padStart(2, "0")}`;

  const [res] = await db.insert(invoices).values({
    schoolId: data.schoolId,
    locationId: data.locationId,
    studentId: data.studentId,
    amount: String(total.toFixed(2)),
    dueDate: new Date(dueDate) as any,
    status,
    generatedMonth: data.month,
    details: JSON.stringify({ items, daycareSessions: sessionDetails, fromDate: startDate, toDate: endDate, isPartialMonth }),
  });
  return { invoiceId: Number((res as any).insertId), isExisting: false };
}

export const generateStudentInvoice = createServerFn({ method: "POST" })
  .validator((i: unknown) => generateStudentInvoiceSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    return generateStudentInvoiceCore(data, { status: "draft" });
  });

const getInvoicePrintDataSchema = z.object({ invoiceId: z.number() });
export const getInvoicePrintData = createServerFn({ method: "GET" })
  .validator((i: unknown) => getInvoicePrintDataSchema.parse(i))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { invoices, students, parents, schools, locations, payments, classes } = await import("@/lib/db/schema");

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    if (!inv) throw new Error("Invoice not found");

    await requireAuth(inv.schoolId, inv.locationId);

    const [student] = await db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      className: classes.name,
    })
      .from(students)
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .where(eq(students.id, inv.studentId))
      .limit(1);

    const parentRows = await db.select({ name: parents.name, phone: parents.phone })
      .from(parents)
      .where(eq(parents.studentId, inv.studentId))
      .orderBy(parents.isPrimary);

    const [school] = await db.select({
      name: schools.name,
      email: schools.email,
      phone: schools.phone,
      logoUrl: schools.logoUrl,
      address: schools.address,
      city: schools.city,
      state: schools.state,
      pincode: schools.pincode,
    })
      .from(schools)
      .where(eq(schools.id, inv.schoolId))
      .limit(1);

    const [location] = await db.select({
      name: locations.name,
      address: locations.address,
      city: locations.city,
      state: locations.state,
      pincode: locations.pincode,
      phone: locations.phone,
    })
      .from(locations)
      .where(eq(locations.id, inv.locationId))
      .limit(1);

    const [paidRow] = await db.select({ total: sql`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.invoiceId, inv.id));

    const paid = parseFloat((paidRow.total as any) ?? "0");
    const due = parseFloat(inv.amount as any) - paid;

    let details = { items: [] as any[], daycareSessions: [] as any[] };
    try {
      if (inv.details) details = JSON.parse(inv.details as any);
    } catch {
      // ignore
    }

    return {
      invoice: {
        id: inv.id,
        month: inv.generatedMonth,
        amount: parseFloat(inv.amount as any),
        dueDate: inv.dueDate ? inv.dueDate.toLocaleDateString("en-IN") : null,
        status: inv.status,
        paid,
        due,
        createdAt: inv.createdAt ? inv.createdAt.toISOString() : null,
        details,
      },
      student,
      parents: parentRows,
      school,
      location,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// BRANCH EDIT
// ─────────────────────────────────────────────────────────────────────────────

const updateBranchSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  name: z.string().trim().min(1).max(255),
  address: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(50).optional(),
  capacity: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  facilityType: z.enum(["school", "daycare", "both"]).optional(),
});

export const updateBranch = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateBranchSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { users, locations } = await import("@/lib/db/schema");
    const [user] = await db.select({ role: users.role, schoolId: users.schoolId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!["school_admin", "super_admin"].includes(user?.role ?? "")) throw new Error("Not authorized");

    const targetSchoolId = user.role === "super_admin" ? data.schoolId : user.schoolId;

    const [existing] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.schoolId, targetSchoolId), eq(locations.name, data.name), ne(locations.id, data.locationId)))
      .limit(1);
    if (existing) throw new Error(`A branch named "${data.name}" already exists`);

    await db.update(locations).set({
      name: data.name,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      pincode: data.pincode || null,
      phone: data.phone || null,
      capacity: data.capacity ?? null,
      status: data.status ?? undefined,
      facilityType: data.facilityType ?? undefined,
    }).where(and(eq(locations.id, data.locationId), eq(locations.schoolId, targetSchoolId)));
    return { ok: true };
  });

// Soft-delete helpers
const archiveStudentSchema = z.object({ studentId: z.number() });
export const archiveStudent = createServerFn({ method: "POST" })
  .validator((input: unknown) => archiveStudentSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { students } = await import("@/lib/db/schema");
    await db.update(students).set({ status: "withdrawn" }).where(eq(students.id, data.studentId));
    return { ok: true };
  });

const archiveInquirySchema = z.object({ inquiryId: z.number() });
export const archiveInquiry = createServerFn({ method: "POST" })
  .validator((input: unknown) => archiveInquirySchema.parse(input))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { inquiries } = await import("@/lib/db/schema");
    await db.update(inquiries).set({ status: "rejected" }).where(eq(inquiries.id, data.inquiryId));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// FEE STRUCTURES CRUD
// ─────────────────────────────────────────────────────────────────────────────

const listFeeStructuresSchema = z.object({ schoolId: z.number(), locationId: z.number() });
export const listFeeStructures = createServerFn({ method: "GET" })
  .validator((i: unknown) => listFeeStructuresSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { feeStructures, classes } = await import("@/lib/db/schema");
    return db
      .select({
        id: feeStructures.id, name: feeStructures.name,
        amount: feeStructures.amount, frequency: feeStructures.frequency,
        feeType: feeStructures.feeType,
        dueDay: feeStructures.dueDay, description: feeStructures.description,
        classId: feeStructures.classId, className: classes.name,
        createdAt: feeStructures.createdAt,
      })
      .from(feeStructures)
      .leftJoin(classes, eq(feeStructures.classId, classes.id))
      .where(and(eq(feeStructures.schoolId, data.schoolId), eq(feeStructures.locationId, data.locationId)))
      .orderBy(asc(feeStructures.name));
  });

const addFeeStructureSchema = z.object({
  schoolId: z.number(), locationId: z.number(),
  name: z.string().trim().min(1).max(255),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  frequency: z.enum(["monthly", "quarterly", "annually", "one_time", "hourly"]),
  feeType: z.enum(["school", "daycare_hourly", "daycare_monthly"]).default("school"),
  dueDay: z.number().int().min(1).max(31).optional(),
  classId: z.number().optional(),
  description: z.string().max(1000).optional(),
});
export const addFeeStructure = createServerFn({ method: "POST" })
  .validator((i: unknown) => addFeeStructureSchema.parse(i))
  .handler(async ({ data }) => {
    const user = await requireAuth(data.schoolId, data.locationId);
    if (user.role !== "super_admin" && (data.feeType === "daycare_hourly" || data.feeType === "daycare_monthly")) {
      await assertDaycareEnabled(data.schoolId);
    }
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { feeStructures } = await import("@/lib/db/schema");

    const [dup] = await db
      .select({ id: feeStructures.id })
      .from(feeStructures)
      .where(and(
        eq(feeStructures.schoolId, data.schoolId),
        eq(feeStructures.locationId, data.locationId),
        eq(feeStructures.name, data.name),
        data.classId ? eq(feeStructures.classId, data.classId) : isNull(feeStructures.classId)
      ))
      .limit(1);
    if (dup) throw new Error(`A fee structure named "${data.name}" already exists`);

    const [r] = await db.insert(feeStructures).values({
      schoolId: data.schoolId, locationId: data.locationId,
      name: data.name, amount: data.amount, frequency: data.frequency,
      feeType: data.feeType,
      dueDay: data.dueDay ?? 1, classId: data.classId ?? null,
      description: data.description || null,
    });
    return { ok: true, feeStructureId: Number((r as any).insertId) };
  });

const updateFeeStructureSchema = z.object({
  feeStructureId: z.number(),
  name: z.string().trim().min(1).max(255),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  frequency: z.enum(["monthly", "quarterly", "annually", "one_time", "hourly"]),
  feeType: z.enum(["school", "daycare_hourly", "daycare_monthly"]).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  classId: z.number().optional(),
  description: z.string().max(1000).optional(),
});
export const updateFeeStructure = createServerFn({ method: "POST" })
  .validator((i: unknown) => updateFeeStructureSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { feeStructures } = await import("@/lib/db/schema");

    const [fs] = await db.select({ id: feeStructures.id, schoolId: feeStructures.schoolId, locationId: feeStructures.locationId }).from(feeStructures).where(eq(feeStructures.id, data.feeStructureId)).limit(1);
    if (!fs) throw new Error("Fee structure not found");

    const [dup] = await db
      .select({ id: feeStructures.id })
      .from(feeStructures)
      .where(and(
        eq(feeStructures.schoolId, fs.schoolId),
        eq(feeStructures.locationId, fs.locationId),
        eq(feeStructures.name, data.name),
        data.classId ? eq(feeStructures.classId, data.classId) : isNull(feeStructures.classId),
        ne(feeStructures.id, data.feeStructureId)
      ))
      .limit(1);
    if (dup) throw new Error(`A fee structure named "${data.name}" already exists`);

    await db.update(feeStructures).set({
      name: data.name, amount: data.amount, frequency: data.frequency,
      feeType: data.feeType ?? undefined,
      dueDay: data.dueDay ?? 1, classId: data.classId ?? null,
      description: data.description || null,
    }).where(eq(feeStructures.id, data.feeStructureId));
    return { ok: true };
  });

const archiveFeeStructureSchema = z.object({ feeStructureId: z.number() });
export const archiveFeeStructure = createServerFn({ method: "POST" })
  .validator((i: unknown) => archiveFeeStructureSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { feeStructures } = await import("@/lib/db/schema");
    await db.delete(feeStructures).where(eq(feeStructures.id, data.feeStructureId));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// STAFF ATTENDANCE — MARK
// ─────────────────────────────────────────────────────────────────────────────

const markAttendanceSchema = z.object({
  staffId: z.number(),
  schoolId: z.number(),
  locationId: z.number(),
  date: z.string(), // YYYY-MM-DD
  status: z.enum(["present", "absent", "half_day", "leave"]),
  notes: z.string().max(500).optional(),
});
export const markStaffAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => markAttendanceSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { staffAttendance } = await import("@/lib/db/schema");
    // Upsert: delete existing record for same staffId+date, then insert
    await db.delete(staffAttendance).where(
      and(eq(staffAttendance.staffId, data.staffId), eq(staffAttendance.date, new Date(data.date)))
    );
    await db.insert(staffAttendance).values({
      schoolId: data.schoolId, locationId: data.locationId,
      staffId: data.staffId,
      date: new Date(data.date),
      status: data.status,
      notes: data.notes || null,
    });
    return { ok: true };
  });

const getAttendanceForDateSchema = z.object({
  schoolId: z.number(), locationId: z.number(), date: z.string(),
});
export const getAttendanceForDate = createServerFn({ method: "GET" })
  .validator((i: unknown) => getAttendanceForDateSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { staffAttendance, staff } = await import("@/lib/db/schema");
    return db
      .select({
        staffId: staffAttendance.staffId,
        status: staffAttendance.status,
        notes: staffAttendance.notes,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role,
      })
      .from(staffAttendance)
      .innerJoin(staff, eq(staffAttendance.staffId, staff.id))
      .where(
        and(
          eq(staffAttendance.schoolId, data.schoolId),
          eq(staffAttendance.locationId, data.locationId),
          eq(staffAttendance.date, new Date(data.date))
        )
      );
  });

// ─────────────────────────────────────────────────────────────────────────────
// STAFF ↔ CLASS ASSIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

const assignStaffToClassSchema = z.object({
  schoolId: z.number(), locationId: z.number(),
  staffId: z.number(), classId: z.number(),
  academicYear: z.string().max(20).optional(),
});
export const assignStaffToClass = createServerFn({ method: "POST" })
  .validator((i: unknown) => assignStaffToClassSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { staffClassAssignments, classes } = await import("@/lib/db/schema");

    // Prevent duplicate assignment
    const existing = await db
      .select({ id: staffClassAssignments.id })
      .from(staffClassAssignments)
      .where(and(eq(staffClassAssignments.staffId, data.staffId), eq(staffClassAssignments.classId, data.classId)))
      .limit(1);
    if (existing.length > 0) return { ok: true, alreadyAssigned: true };

    // ── Time-clash check ────────────────────────────────────────────────────
    // Fetch the timing of the class being assigned
    const [newClass] = await db
      .select({ startTime: classes.startTime, endTime: classes.endTime, name: classes.name })
      .from(classes)
      .where(eq(classes.id, data.classId))
      .limit(1);
    if (!newClass) throw new Error("Class not found");

    if (newClass.startTime && newClass.endTime) {
      // Fetch all current assignments for this staff member with their class timings
      const currentAssignments = await db
        .select({ startTime: classes.startTime, endTime: classes.endTime, name: classes.name })
        .from(staffClassAssignments)
        .innerJoin(classes, eq(staffClassAssignments.classId, classes.id))
        .where(eq(staffClassAssignments.staffId, data.staffId));

      // Convert HH:MM to minutes for easy comparison
      const toMin = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      };

      const newStart = toMin(newClass.startTime);
      const newEnd   = toMin(newClass.endTime);

      for (const ca of currentAssignments) {
        if (!ca.startTime || !ca.endTime) continue;
        const existStart = toMin(ca.startTime);
        const existEnd   = toMin(ca.endTime);
        // Overlap: new starts before existing ends AND new ends after existing starts
        if (newStart < existEnd && newEnd > existStart) {
          throw new Error(
            `Schedule clash: "${newClass.name}" (${newClass.startTime}–${newClass.endTime}) overlaps with "${ca.name}" (${ca.startTime}–${ca.endTime}) already assigned to this staff member.`
          );
        }
      }
    }
    // ── End time-clash check ────────────────────────────────────────────────

    await db.insert(staffClassAssignments).values({
      schoolId: data.schoolId, locationId: data.locationId,
      staffId: data.staffId, classId: data.classId,
      academicYear: data.academicYear ?? null,
    });
    return { ok: true, alreadyAssigned: false };
  });

const removeStaffFromClassSchema = z.object({ staffId: z.number(), classId: z.number() });
export const removeStaffFromClass = createServerFn({ method: "POST" })
  .validator((i: unknown) => removeStaffFromClassSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { staffClassAssignments } = await import("@/lib/db/schema");
    await db.delete(staffClassAssignments).where(
      and(eq(staffClassAssignments.staffId, data.staffId), eq(staffClassAssignments.classId, data.classId))
    );
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY CONTACT — STANDALONE UPDATE
// ─────────────────────────────────────────────────────────────────────────────

const updateEmergencyContactSchema = z.object({
  contactId: z.number(),
  name: z.string().trim().min(1).max(255),
  phone: z.string().trim().min(1).max(50),
  relation: z.string().trim().max(100),
});
export const updateEmergencyContact = createServerFn({ method: "POST" })
  .validator((i: unknown) => updateEmergencyContactSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { emergencyContacts } = await import("@/lib/db/schema");
    await db.update(emergencyContacts).set({
      name: data.name, phone: data.phone, relation: data.relation,
    }).where(eq(emergencyContacts.id, data.contactId));
    return { ok: true };
  });

const addEmergencyContactSchema = z.object({
  schoolId: z.number(), locationId: z.number(), studentId: z.number(),
  name: z.string().trim().min(1).max(255),
  phone: z.string().trim().min(1).max(50),
  relation: z.string().trim().max(100),
});
export const addEmergencyContact = createServerFn({ method: "POST" })
  .validator((i: unknown) => addEmergencyContactSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { emergencyContacts } = await import("@/lib/db/schema");
    const [r] = await db.insert(emergencyContacts).values({
      schoolId: data.schoolId, locationId: data.locationId,
      studentId: data.studentId,
      name: data.name, phone: data.phone, relation: data.relation,
    });
    return { ok: true, contactId: Number((r as any).insertId) };
  });

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ATTENDANCE
// ─────────────────────────────────────────────────────────────────────────────

// ── Mark bulk attendance for a class+date ────────────────────────────────────
const markStudentAttendanceSchema = z.object({
  schoolId:   z.number(),
  locationId: z.number(),
  classId:    z.number(),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  markedBy:   z.number().optional(),
  withDaycare: z.boolean().optional(), // true for school+daycare / daycare branches
  records: z.array(z.object({
    studentId: z.number(),
    status:    z.enum(["present", "absent", "half_day", "leave"]),
    notes:     z.string().max(500).optional(),
    inTime:    z.string().optional(),  // e.g. "08:00"
    outTime:   z.string().optional(),  // e.g. "15:30"
  })).min(1),
});

export const markStudentAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => markStudentAttendanceSchema.parse(i))
  .handler(async ({ data }) => {
    const session = await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { studentAttendance, attendanceSessions } = await import("@/lib/db/schema");

    const dateObj = new Date(data.date);

    // 1. Upsert attendance session — marks that attendance WAS taken for this class+date
    await db.delete(attendanceSessions).where(
      and(
        eq(attendanceSessions.classId, data.classId),
        eq(attendanceSessions.date, dateObj),
      )
    );
    await db.insert(attendanceSessions).values({
      schoolId:   data.schoolId,
      locationId: data.locationId,
      classId:    data.classId,
      date:       dateObj,
      markedBy:   data.markedBy ?? null,
    });

    // 2. Delete existing individual records for this class+date
    await db.delete(studentAttendance).where(
      and(
        eq(studentAttendance.classId, data.classId),
        eq(studentAttendance.date, dateObj),
      )
    );

    // 3. Save one row per student (present + non-present) so the dashboard can count correctly
    await db.insert(studentAttendance).values(
      data.records.map((r) => ({
        schoolId:   data.schoolId,
        locationId: data.locationId,
        classId:    data.classId,
        studentId:  r.studentId,
        date:       dateObj,
        status:     r.status,
        markedBy:   data.markedBy ?? null,
        notes:      r.notes ?? null,
      }))
    );

    // 4. If this is a daycare-enabled branch, upsert daycare_sessions alongside attendance
    if (data.withDaycare) {
      const { daycareSessions } = await import("@/lib/db/schema");
      for (const r of data.records) {
        const isPresent = r.status === "present" || r.status === "half_day";
        // Delete existing session for this student+date first (clean upsert)
        await db.delete(daycareSessions).where(
          and(
            eq(daycareSessions.schoolId, data.schoolId),
            eq(daycareSessions.locationId, data.locationId),
            eq(daycareSessions.studentId, r.studentId),
            eq(daycareSessions.sessionDate, dateObj),
          )
        );
        // Only create a session if present and at least one time is provided
        if (isPresent && (r.inTime || r.outTime)) {
          await db.insert(daycareSessions).values({
            schoolId:    data.schoolId,
            locationId:  data.locationId,
            studentId:   r.studentId,
            sessionDate: dateObj,
            inTime:      r.inTime ?? null,
            outTime:     r.outTime ?? null,
            recordedBy:  data.markedBy ?? null,
          });
        }
      }
    }

    return { ok: true, saved: data.records.length };
  });

// ── Get attendance for a class on a specific date ────────────────────────────
const getStudentAttendanceForDateSchema = z.object({
  schoolId:   z.number(),
  locationId: z.number(),
  classId:    z.number(),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getStudentAttendanceForDate = createServerFn({ method: "GET" })
  .validator((i: unknown) => getStudentAttendanceForDateSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { studentAttendance, attendanceSessions, students, daycareSessions, locations } = await import("@/lib/db/schema");

    const dateObj = new Date(data.date);

    // Check if attendance was taken at all for this class+date
    const [session] = await db
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.classId, data.classId),
          eq(attendanceSessions.date, dateObj),
        )
      )
      .limit(1);

    // Fetch all student attendance records for this class+date
    const rows = await db
      .select({
        studentId: studentAttendance.studentId,
        status:    studentAttendance.status,
        notes:     studentAttendance.notes,
        firstName: students.firstName,
        lastName:  students.lastName,
      })
      .from(studentAttendance)
      .innerJoin(students, eq(studentAttendance.studentId, students.id))
      .where(
        and(
          eq(studentAttendance.classId, data.classId),
          eq(studentAttendance.date, dateObj),
        )
      );

    // Fetch existing daycare sessions for this location+date so in/out times repopulate
    const daycareRows = await db
      .select({ studentId: daycareSessions.studentId, inTime: daycareSessions.inTime, outTime: daycareSessions.outTime })
      .from(daycareSessions)
      .where(
        and(
          eq(daycareSessions.schoolId, data.schoolId),
          eq(daycareSessions.locationId, data.locationId),
          eq(daycareSessions.sessionDate, dateObj),
        )
      );
    const daycareMap = new Map(daycareRows.map((r) => [r.studentId, { inTime: r.inTime, outTime: r.outTime }]));

    // Fetch facility type for this location
    const [loc] = await db.select({ facilityType: locations.facilityType }).from(locations).where(eq(locations.id, data.locationId)).limit(1);
    const facilityType = loc?.facilityType ?? "school";

    // sessionTaken = true means attendance was marked for this class+date
    return {
      sessionTaken: !!session || rows.length > 0,
      records: rows.map((r) => ({ ...r, ...daycareMap.get(r.studentId) })),
      facilityType,
    };
  });

// ── Get attendance history (filterable by class, student, date range) ─────────
const getAttendanceHistorySchema = z.object({
  schoolId:   z.number(),
  locationId: z.number(),
  classId:    z.number().optional(),
  studentId:  z.number().optional(),
  fromDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getAttendanceHistory = createServerFn({ method: "GET" })
  .validator((i: unknown) => getAttendanceHistorySchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { studentAttendance, students, classes, attendanceSessions } = await import("@/lib/db/schema");

    const toISODate = (value: any) => {
      if (!value) return "";
      if (typeof value === "string") return value.slice(0, 10);
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return String(value).slice(0, 10);
    };

    // Resolve which classes to report for
    let targetClassIds: number[] = [];
    if (data.studentId) {
      const [student] = await db.select({ currentClassId: students.currentClassId })
        .from(students).where(eq(students.id, data.studentId)).limit(1);
      if (student?.currentClassId) targetClassIds = [student.currentClassId];
    } else if (data.classId) {
      targetClassIds = [data.classId];
    }

    // 1. Get attendance sessions that were actually taken (this is the source of "Present" days)
    const sessionConditions: any[] = [
      eq(attendanceSessions.schoolId, data.schoolId),
      eq(attendanceSessions.locationId, data.locationId),
    ];
    if (targetClassIds.length) sessionConditions.push(inArray(attendanceSessions.classId, targetClassIds));
    if (data.fromDate) sessionConditions.push(gte(attendanceSessions.date, data.fromDate as any));
    if (data.toDate)   sessionConditions.push(lte(attendanceSessions.date, data.toDate as any));
    const sessions = await db.select({ id: attendanceSessions.id, date: attendanceSessions.date, classId: attendanceSessions.classId })
      .from(attendanceSessions)
      .where(and(...sessionConditions))
      .orderBy(desc(attendanceSessions.date));

    if (sessions.length === 0) return [];

    // If no class/student filter was supplied, derive class list from the sessions
    if (targetClassIds.length === 0) {
      targetClassIds = [...new Set(sessions.map((s) => s.classId))];
    }

    // 2. Get all enrolled students for the relevant classes
    const studentConditions: any[] = [
      eq(students.schoolId, data.schoolId),
      eq(students.locationId, data.locationId),
      eq(students.status, "enrolled"),
      inArray(students.currentClassId, targetClassIds),
    ];
    if (data.studentId) studentConditions.push(eq(students.id, data.studentId));
    const classStudents = await db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      classId: students.currentClassId,
      className: classes.name,
    })
      .from(students)
      .innerJoin(classes, eq(students.currentClassId, classes.id))
      .where(and(...studentConditions));

    const studentsByClass = classStudents.reduce<Record<number, typeof classStudents[number][]>>((acc, s) => {
      (acc[s.classId] = acc[s.classId] ?? []).push(s);
      return acc;
    }, {});

    // 3. Get non-present records for the same range
    const recordConditions: any[] = [
      eq(studentAttendance.schoolId, data.schoolId),
      eq(studentAttendance.locationId, data.locationId),
      inArray(studentAttendance.classId, targetClassIds),
    ];
    if (data.fromDate) recordConditions.push(gte(studentAttendance.date, data.fromDate as any));
    if (data.toDate)   recordConditions.push(lte(studentAttendance.date, data.toDate as any));
    if (data.studentId) recordConditions.push(eq(studentAttendance.studentId, data.studentId));
    const records = await db.select({
      id: studentAttendance.id,
      date: studentAttendance.date,
      status: studentAttendance.status,
      notes: studentAttendance.notes,
      studentId: studentAttendance.studentId,
    })
      .from(studentAttendance)
      .where(and(...recordConditions));

    const recordByDateAndStudent = new Map<string, Map<number, typeof records[number]>>();
    for (const r of records) {
      const date = toISODate(r.date);
      if (!recordByDateAndStudent.has(date)) recordByDateAndStudent.set(date, new Map());
      recordByDateAndStudent.get(date)!.set(r.studentId, r);
    }

    // 4. Build one history row per student per session, defaulting to Present
    const out: any[] = [];
    for (const s of sessions) {
      const date = toISODate(s.date);
      const studs = studentsByClass[s.classId] ?? [];
      for (const stud of studs) {
        const rec = recordByDateAndStudent.get(date)?.get(stud.id);
        out.push({
          id: rec?.id ?? (s.id * 100000 + stud.id),
          date,
          status: rec?.status ?? "present",
          notes: rec?.notes ?? null,
          studentId: stud.id,
          firstName: stud.firstName,
          lastName: stud.lastName,
          classId: s.classId,
          className: stud.className,
        });
      }
    }

    return out;
  });

// ── Attendance summary stats (for dashboard widget) ───────────────────────────
const getAttendanceSummarySchema = z.object({
  schoolId:   z.number(),
  locationId: z.number(),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getAttendanceSummary = createServerFn({ method: "GET" })
  .validator((i: unknown) => getAttendanceSummarySchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    const { db } = await import("@/lib/db");
    const { studentAttendance, staffAttendance, students, staff } = await import("@/lib/db/schema");
    const { sql: sqlRaw } = await import("drizzle-orm");

    const today = data.date ?? todayIST();
    const dateObj = new Date(today);

    // Student counts
    const [studentStats] = await db
      .select({
        present:  sqlRaw<number>`SUM(CASE WHEN ${studentAttendance.status} = 'present' THEN 1 ELSE 0 END)`,
        absent:   sqlRaw<number>`SUM(CASE WHEN ${studentAttendance.status} = 'absent'  THEN 1 ELSE 0 END)`,
        halfDay:  sqlRaw<number>`SUM(CASE WHEN ${studentAttendance.status} = 'half_day' THEN 1 ELSE 0 END)`,
        total:    sqlRaw<number>`COUNT(*)`,
      })
      .from(studentAttendance)
      .where(
        and(
          eq(studentAttendance.schoolId, data.schoolId),
          eq(studentAttendance.locationId, data.locationId),
          eq(studentAttendance.date, dateObj),
        )
      );

    // Total enrolled students (for calculating % absent even if not marked)
    const [{ enrolledCount }] = await db
      .select({ enrolledCount: count(students.id) })
      .from(students)
      .where(
        and(
          eq(students.schoolId, data.schoolId),
          eq(students.locationId, data.locationId),
          eq(students.status, "enrolled"),
        )
      );

    // Staff attendance for today
    const [staffStats] = await db
      .select({
        present: sqlRaw<number>`SUM(CASE WHEN ${staffAttendance.status} = 'present' THEN 1 ELSE 0 END)`,
        total:   sqlRaw<number>`COUNT(*)`,
      })
      .from(staffAttendance)
      .where(
        and(
          eq(staffAttendance.schoolId, data.schoolId),
          eq(staffAttendance.locationId, data.locationId),
          eq(staffAttendance.date, dateObj),
        )
      );

    return {
      date: today,
      students: {
        present:  Number(studentStats?.present  ?? 0),
        absent:   Number(studentStats?.absent   ?? 0),
        halfDay:  Number(studentStats?.halfDay  ?? 0),
        marked:   Number(studentStats?.total    ?? 0),
        enrolled: Number(enrolledCount ?? 0),
      },
      staff: {
        present: Number(staffStats?.present ?? 0),
        marked:  Number(staffStats?.total   ?? 0),
      },
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── Super admin: create announcement ─────────────────────────────────────────
const createAnnouncementSchema = z.object({
  title:      z.string().trim().min(1).max(255),
  body:       z.string().trim().min(1),
  type:       z.enum(["info", "warning", "success", "critical"]).default("info"),
  targetRole: z.enum(["all", "school_admin", "location_admin", "teacher", "accountant"]).default("school_admin"),
  expiresAt:  z.string().datetime().optional(), // ISO string
});

export const createAnnouncement = createServerFn({ method: "POST" })
  .validator((i: unknown) => createAnnouncementSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, announcements } = await import("@/lib/db/schema");
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.role !== "super_admin") throw new Error("Not authorized");

    const [r] = await db.insert(announcements).values({
      title:      data.title,
      body:       data.body,
      type:       data.type,
      targetRole: data.targetRole,
      isActive:   1,
      expiresAt:  data.expiresAt ? new Date(data.expiresAt) : null,
      createdBy:  userId,
    });

    try {
      await broadcastPush(data.title, data.body, "/announcements", undefined, undefined, data.targetRole);
    } catch (e) {
      console.error("broadcastPush (super admin) failed:", e);
    }

    return { ok: true, id: Number((r as any).insertId) };
  });

// ── Super admin: list all announcements ──────────────────────────────────────
export const listAllAnnouncements = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const cookieHeader = req?.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  const token = match?.[1];
  if (!token) throw new Error("Not authenticated");
  const { payload } = await verifySessionToken(token);
  const userId = Number(payload.userId);
  const { db } = await import("@/lib/db");
  const { users, announcements } = await import("@/lib/db/schema");
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.role !== "super_admin") throw new Error("Not authorized");

  const rows = await db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt));
  return rows;
});

// ── Super admin: toggle active / deactivate ───────────────────────────────────
const toggleAnnouncementSchema = z.object({ id: z.number(), isActive: z.number().min(0).max(1) });
export const toggleAnnouncement = createServerFn({ method: "POST" })
  .validator((i: unknown) => toggleAnnouncementSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, announcements } = await import("@/lib/db/schema");
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.role !== "super_admin") throw new Error("Not authorized");
    await db.update(announcements).set({ isActive: data.isActive }).where(eq(announcements.id, data.id));
    return { ok: true };
  });

// ── Super admin: delete announcement ─────────────────────────────────────────
const deleteAnnouncementSchema = z.object({ id: z.number() });
export const deleteAnnouncement = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteAnnouncementSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, announcements, announcementDismissals } = await import("@/lib/db/schema");
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.role !== "super_admin") throw new Error("Not authorized");
    await db.delete(announcementDismissals).where(eq(announcementDismissals.announcementId, data.id));
    await db.delete(announcements).where(eq(announcements.id, data.id));
    return { ok: true };
  });

// ── Any user: get active announcements for their role (for banner) ────────────
export const getActiveAnnouncements = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireAuth();
  const { db } = await import("@/lib/db");
  const { schoolAnnouncements, schoolAnnouncementDismissals, announcements, announcementDismissals } = await import("@/lib/db/schema");

  const schoolTargetMatches = [eq(schoolAnnouncements.target, "all")];
  if (user.role === "parent") {
    schoolTargetMatches.push(eq(schoolAnnouncements.target, "parents"));
  } else {
    schoolTargetMatches.push(eq(schoolAnnouncements.target, "staff"));
    schoolTargetMatches.push(eq(schoolAnnouncements.target, user.role as any));
  }

  // ── School announcements ────────────────────────────────────────────────────
  const dismissedSchool = await db
    .select({ announcementId: schoolAnnouncementDismissals.schoolAnnouncementId })
    .from(schoolAnnouncementDismissals)
    .where(eq(schoolAnnouncementDismissals.userId, user.id));
  const dismissedSchoolIds = dismissedSchool.map((d) => d.announcementId);

  const schoolConditions = [
    eq(schoolAnnouncements.schoolId, user.schoolId),
    eq(schoolAnnouncements.locationId, user.locationId),
    or(...schoolTargetMatches),
  ];
  if (dismissedSchoolIds.length > 0) {
    schoolConditions.push(notInArray(schoolAnnouncements.id, dismissedSchoolIds));
  }

  const schoolRows = await db
    .select()
    .from(schoolAnnouncements)
    .where(and(...schoolConditions))
    .orderBy(desc(schoolAnnouncements.createdAt));

  // ── Global super-admin announcements ────────────────────────────────────────
  const dismissedGlobal = await db
    .select({ announcementId: announcementDismissals.announcementId })
    .from(announcementDismissals)
    .where(eq(announcementDismissals.userId, user.id));
  const dismissedGlobalIds = dismissedGlobal.map((d) => d.announcementId);

  const globalConditions = [
    eq(announcements.isActive, 1),
    or(eq(announcements.targetRole, "all"), eq(announcements.targetRole, user.role)),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, sql`now()`)),
  ];
  if (dismissedGlobalIds.length > 0) {
    globalConditions.push(notInArray(announcements.id, dismissedGlobalIds));
  }

  const globalRows = await db
    .select()
    .from(announcements)
    .where(and(...globalConditions))
    .orderBy(desc(announcements.createdAt));

  const combined = [
    ...schoolRows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.message ?? "",
      type: "info" as const,
      scope: "school" as const,
    })),
    ...globalRows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type as "info" | "warning" | "success" | "critical",
      scope: "global" as const,
    })),
  ];

  return combined.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
});

// ── Any user: dismiss an announcement ────────────────────────────────────────
const dismissAnnouncementSchema = z.object({
  announcementId: z.number(),
  scope: z.enum(["school", "global"]).default("school"),
});
export const dismissAnnouncement = createServerFn({ method: "POST" })
  .validator((i: unknown) => dismissAnnouncementSchema.parse(i))
  .handler(async ({ data }) => {
    const user = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { schoolAnnouncementDismissals, announcementDismissals } = await import("@/lib/db/schema");

    if (data.scope === "global") {
      const [existing] = await db
        .select({ id: announcementDismissals.id })
        .from(announcementDismissals)
        .where(and(
          eq(announcementDismissals.announcementId, data.announcementId),
          eq(announcementDismissals.userId, user.id),
        ))
        .limit(1);

      if (existing) {
        await db.update(announcementDismissals)
          .set({ dismissedAt: new Date() })
          .where(eq(announcementDismissals.id, existing.id));
      } else {
        await db.insert(announcementDismissals).values({
          announcementId: data.announcementId,
          userId: user.id,
        });
      }
    } else {
      const [existing] = await db
        .select({ id: schoolAnnouncementDismissals.id })
        .from(schoolAnnouncementDismissals)
        .where(and(
          eq(schoolAnnouncementDismissals.schoolAnnouncementId, data.announcementId),
          eq(schoolAnnouncementDismissals.userId, user.id),
        ))
        .limit(1);

      if (existing) {
        await db.update(schoolAnnouncementDismissals)
          .set({ dismissedAt: new Date() })
          .where(eq(schoolAnnouncementDismissals.id, existing.id));
      } else {
        await db.insert(schoolAnnouncementDismissals).values({
          schoolAnnouncementId: data.announcementId,
          userId: user.id,
        });
      }
    }
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT UPLOAD (birth certificate, immunization record, etc.)
// ─────────────────────────────────────────────────────────────────────────────

// helper — reuse R2 pattern from logo upload
async function uploadToR2orDisk(
  buffer: Buffer,
  mimeType: string,
  key: string,       // e.g. "documents/student-3-birth_certificate-1234.pdf"
): Promise<string> {
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2KeyId     = process.env.R2_ACCESS_KEY_ID;
  const r2Secret    = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket    = process.env.R2_BUCKET_NAME;
  const r2PublicUrl = process.env.R2_PUBLIC_URL;

  const hasR2 =
    r2AccountId && !r2AccountId.startsWith("your-") &&
    r2KeyId     && !r2KeyId.startsWith("your-") &&
    r2Secret    && !r2Secret.startsWith("your-") &&
    r2Bucket    && r2PublicUrl;

  if (hasR2) {
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2KeyId!, secretAccessKey: r2Secret! },
    });
    await s3.send(new PutObjectCommand({ Bucket: r2Bucket!, Key: key, Body: buffer, ContentType: mimeType }));
    return `${r2PublicUrl!.replace(/\/$/, "")}/${key}`;
  }

  throw new Error(
    "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME and R2_PUBLIC_URL."
  );
}

const uploadDocumentSchema = z.object({
  studentId: z.number(),
  type: z.enum(["birth_certificate", "immunization_record", "aadhar_card", "photo", "other"]),
  // base64 data-url: "data:<mime>;base64,<data>"
  fileDataUrl: z.string(),
  fileName: z.string().max(255),
});

export const uploadDocument = createServerFn({ method: "POST" })
  .validator((i: unknown) => uploadDocumentSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, documents } = await import("@/lib/db/schema");
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.schoolId || !user?.locationId) throw new Error("Not authorized");

    // Parse data URL
    const dataUrlMatch = data.fileDataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!dataUrlMatch) throw new Error("Invalid file data");
    const mimeType = dataUrlMatch[1];
    const buffer   = Buffer.from(dataUrlMatch[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) throw new Error("File must be under 10MB");

    // Derive extension from mime
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "application/pdf": "pdf",
    };
    const ext = extMap[mimeType] ?? "bin";

    const key = `schools/${user.schoolId}/students/${data.studentId}/documents/${data.type}-${Date.now()}.${ext}`;
    const publicUrl = await uploadToR2orDisk(buffer, mimeType, key);

    const [r] = await db.insert(documents).values({
      schoolId:   user.schoolId,
      locationId: user.locationId,
      studentId:  data.studentId,
      type:       data.type,
      r2Key:      key,
      publicUrl,
    });

    return { ok: true, id: Number((r as any).insertId), publicUrl, type: data.type };
  });

const listDocumentsSchema = z.object({ studentId: z.number() });
export const listDocuments = createServerFn({ method: "GET" })
  .validator((i: unknown) => listDocumentsSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, documents } = await import("@/lib/db/schema");
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.schoolId) throw new Error("Not authorized");

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.studentId, data.studentId), eq(documents.schoolId, user.schoolId)))
      .orderBy(desc(documents.uploadedAt));

    return rows;
  });

const deleteDocumentSchema = z.object({ documentId: z.number() });
export const deleteDocument = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteDocumentSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, documents } = await import("@/lib/db/schema");
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.schoolId) throw new Error("Not authorized");

    await db.delete(documents).where(
      and(eq(documents.id, data.documentId), eq(documents.schoolId, user.schoolId))
    );
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ACADEMIC PROFILE
// ─────────────────────────────────────────────────────────────────────────────

// ── Attendance summary: monthly breakdown for a student ───────────────────────
const getStudentAttendanceSummarySchema = z.object({ studentId: z.number() });
export const getStudentAttendanceSummary = createServerFn({ method: "GET" })
  .validator((i: unknown) => getStudentAttendanceSummarySchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const { db } = await import("@/lib/db");
    const { users, studentAttendance, attendanceSessions, students } = await import("@/lib/db/schema");

    const [user] = await db.select({ role: users.role, schoolId: users.schoolId, email: users.email })
      .from(users).where(eq(users.id, Number(payload.userId))).limit(1);
    if (!user) throw new Error("Not authenticated");

    // For parent: verify this student belongs to them
    if (user.role === "parent") {
      const { parents } = await import("@/lib/db/schema");
      const [link] = await db.select({ id: parents.id }).from(parents)
        .where(and(eq(parents.studentId, data.studentId), eq(parents.email, user.email ?? ""))).limit(1);
      if (!link) throw new Error("Not authorized");
    }

    // Get student's class and school
    const [student] = await db.select({ schoolId: students.schoolId, locationId: students.locationId, currentClassId: students.currentClassId })
      .from(students).where(eq(students.id, data.studentId)).limit(1);
    if (!student) throw new Error("Student not found");

    const toISODate = (value: any) => {
      if (!value) return "";
      if (typeof value === "string") return value.slice(0, 10);
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return String(value).slice(0, 10);
    };

    // Get all attendance records for this student
    const records = await db.select({
      date: studentAttendance.date,
      status: studentAttendance.status,
    })
      .from(studentAttendance)
      .where(eq(studentAttendance.studentId, data.studentId))
      .orderBy(asc(studentAttendance.date));

    // Count sessions taken for the student's class (to compute "school days")
    const sessions = student.currentClassId
      ? await db.select({ date: attendanceSessions.date })
          .from(attendanceSessions)
          .where(and(
            eq(attendanceSessions.schoolId, student.schoolId),
            eq(attendanceSessions.locationId, student.locationId),
            eq(attendanceSessions.classId, student.currentClassId),
          ))
      : [];

    // Group by month
    type MonthSummary = {
      monthKey: string; // "2026-09"
      label: string;    // "September 2026"
      schoolDays: number;
      present: number;
      absent: number;
      halfDay: number;
      leave: number;
      pct: number;
      days: { date: string; status: string }[];
    };

    const monthMap = new Map<string, MonthSummary>();
    const recordByDate = new Map<string, typeof records[number]["status"]>(
      records.map((r) => [toISODate(r.date), r.status])
    );

    // Seed from sessions (school days) and build day-by-day list
    for (const s of sessions) {
      const dateStr = toISODate(s.date);
      const monthKey = dateStr.slice(0, 7);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          label: new Date(`${monthKey}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
          schoolDays: 0, present: 0, absent: 0, halfDay: 0, leave: 0, pct: 0, days: [],
        });
      }
      const m = monthMap.get(monthKey)!;
      m.schoolDays++;
      m.days.push({ date: dateStr, status: recordByDate.get(dateStr) ?? "present" });
    }

    // Fill in student's attendance counts (covers records without a session, if any)
    for (const r of records) {
      const dateStr = toISODate(r.date);
      const monthKey = dateStr.slice(0, 7);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          label: new Date(`${monthKey}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
          schoolDays: 0, present: 0, absent: 0, halfDay: 0, leave: 0, pct: 0, days: [],
        });
      }
      const m = monthMap.get(monthKey)!;
      if (r.status === "present") m.present++;
      else if (r.status === "absent") m.absent++;
      else if (r.status === "half_day") m.halfDay++;
      else if (r.status === "leave") m.leave++;
    }

    // Compute attendance % and sort days newest first
    const result: MonthSummary[] = [];
    for (const m of monthMap.values()) {
      if (m.schoolDays > 0) {
        m.present = Math.max(0, m.schoolDays - m.absent - m.halfDay - m.leave);
      }
      const effectiveDays = m.schoolDays || (m.present + m.absent + m.halfDay + m.leave);
      m.pct = effectiveDays > 0 ? Math.round(((m.present + m.halfDay * 0.5) / effectiveDays) * 100) : 0;
      m.days.sort((a, b) => b.date.localeCompare(a.date));
      result.push(m);
    }

    return result.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  });

// ── Upload report card ────────────────────────────────────────────────────────
const uploadReportCardSchema = z.object({
  studentId: z.number(),
  academicYear: z.string().trim().min(1).max(20), // e.g. "2025-26"
  classId: z.number().optional(),
  term: z.string().trim().min(1).max(100), // e.g. "Term 1", "Q2", "Annual"
  fileDataUrl: z.string(),
  fileName: z.string().max(255),
});

export const uploadReportCard = createServerFn({ method: "POST" })
  .validator((i: unknown) => uploadReportCardSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const { db } = await import("@/lib/db");
    const { users, reportCards } = await import("@/lib/db/schema");
    const [user] = await db.select().from(users).where(eq(users.id, Number(payload.userId))).limit(1);
    if (!user?.schoolId || !user?.locationId) throw new Error("Not authorized");

    const dataUrlMatch = data.fileDataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!dataUrlMatch) throw new Error("Invalid file data");
    const mimeType = dataUrlMatch[1];
    if (mimeType !== "application/pdf") throw new Error("Only PDF files are accepted");
    const buffer = Buffer.from(dataUrlMatch[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) throw new Error("File must be under 10MB");

    const key = `schools/${user.schoolId}/students/${data.studentId}/report-cards/${data.academicYear}-${Date.now()}.pdf`;
    const publicUrl = await uploadToR2orDisk(buffer, mimeType, key);

    const [r] = await db.insert(reportCards).values({
      schoolId:     user.schoolId,
      locationId:   user.locationId,
      studentId:    data.studentId,
      academicYear: data.academicYear,
      classId:      data.classId ?? null,
      term:         data.term,
      r2Key:        key,
      publicUrl,
    });

    return { ok: true, id: Number((r as any).insertId), publicUrl, academicYear: data.academicYear, term: data.term };
  });

// ── Mark report card as issued (no PDF — on-screen report) ───────────────────
const markReportCardIssuedSchema = z.object({
  studentId:    z.number(),
  classId:      z.number(),
  academicYear: z.string(),
});

export const markReportCardIssued = createServerFn({ method: "POST" })
  .validator((i: unknown) => markReportCardIssuedSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { users, reportCards } = await import("@/lib/db/schema");
    const userId = await requireSession();
    const [user] = await db.select({ schoolId: users.schoolId, locationId: users.locationId, role: users.role })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.schoolId || !user?.locationId) throw new Error("Not authorized");
    if (!["super_admin","school_admin","location_admin"].includes(user.role ?? "")) throw new Error("Not authorized");

    // Upsert — one record per student+year (avoid duplicates)
    const existing = await db.select({ id: reportCards.id })
      .from(reportCards)
      .where(and(
        eq(reportCards.studentId, data.studentId),
        eq(reportCards.academicYear, data.academicYear),
        eq(reportCards.schoolId, user.schoolId),
      )).limit(1);

    if (existing.length === 0) {
      await db.insert(reportCards).values({
        schoolId:     user.schoolId,
        locationId:   user.locationId,
        studentId:    data.studentId,
        academicYear: data.academicYear,
        classId:      data.classId,
        term:         "Full Year",
        r2Key:        null,
        publicUrl:    null,
      });
    }
    return { ok: true };
  });

// ── List report cards for a student (with class name join) ────────────────────
const listReportCardsSchema = z.object({ studentId: z.number() });
export const listReportCards = createServerFn({ method: "GET" })
  .validator((i: unknown) => listReportCardsSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const { db } = await import("@/lib/db");
    const { users, reportCards, parents, classes } = await import("@/lib/db/schema");
    const [user] = await db.select({ role: users.role, schoolId: users.schoolId, email: users.email })
      .from(users).where(eq(users.id, Number(payload.userId))).limit(1);
    if (!user) throw new Error("Not authenticated");

    // Parent: verify ownership
    if (user.role === "parent") {
      const [link] = await db.select({ id: parents.id }).from(parents)
        .where(and(eq(parents.studentId, data.studentId), eq(parents.email, user.email ?? ""))).limit(1);
      if (!link) throw new Error("Not authorized");
    }

    const rows = await db
      .select({
        id:           reportCards.id,
        academicYear: reportCards.academicYear,
        term:         reportCards.term,
        publicUrl:    reportCards.publicUrl,
        uploadedAt:   reportCards.uploadedAt,
        className:    classes.name,
      })
      .from(reportCards)
      .leftJoin(classes, eq(reportCards.classId, classes.id))
      .where(and(eq(reportCards.studentId, data.studentId), eq(reportCards.schoolId, user.schoolId!)))
      .orderBy(desc(reportCards.academicYear), asc(reportCards.term));

    return rows;
  });

// ── Delete report card ────────────────────────────────────────────────────────
const deleteReportCardSchema = z.object({ id: z.number() });
export const deleteReportCard = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteReportCardSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    await verifySessionToken(token);
    const { db } = await import("@/lib/db");
    const { reportCards } = await import("@/lib/db/schema");
    await db.delete(reportCards).where(eq(reportCards.id, data.id));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// STAFF PAYROLL
// ─────────────────────────────────────────────────────────────────────────────

const listPayrollSchema = z.object({ staffId: z.number() });
export const listPayrollRecords = createServerFn({ method: "GET" })
  .validator((i: unknown) => listPayrollSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, staffPayroll } = await import("@/lib/db/schema");
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.schoolId) throw new Error("Not authorized");

    const rows = await db
      .select()
      .from(staffPayroll)
      .where(and(eq(staffPayroll.staffId, data.staffId), eq(staffPayroll.schoolId, user.schoolId)))
      .orderBy(desc(staffPayroll.month));
    return rows;
  });

const addPayrollSchema = z.object({
  staffId: z.number(),
  month: z.string().regex(/^\d{4}-\d{2}$/), // "YYYY-MM"
  basicSalary: z.string().regex(/^\d+(\.\d{1,2})?$/),
  deductions: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  bonus: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  notes: z.string().optional(),
});
export const addPayrollRecord = createServerFn({ method: "POST" })
  .validator((i: unknown) => addPayrollSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, staff, staffPayroll, expenses } = await import("@/lib/db/schema");
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.schoolId || !user?.locationId) throw new Error("Not authorized");

    const basic     = parseFloat(data.basicSalary);
    const deduct    = parseFloat(data.deductions ?? "0");
    const bon       = parseFloat(data.bonus ?? "0");
    const net       = basic - deduct + bon;

    const [staffRow] = await db
      .select({ firstName: staff.firstName, lastName: staff.lastName })
      .from(staff)
      .where(eq(staff.id, data.staffId))
      .limit(1);
    const staffName = staffRow ? `${staffRow.firstName} ${staffRow.lastName}`.trim() : `Staff ${data.staffId}`;

    const { id: payrollId } = await db.transaction(async (tx) => {
      const [r] = await tx.insert(staffPayroll).values({
        schoolId:    user.schoolId,
        locationId:  user.locationId,
        staffId:     data.staffId,
        month:       data.month,
        basicSalary: data.basicSalary,
        deductions:  data.deductions ?? "0",
        bonus:       data.bonus ?? "0",
        netSalary:   net.toFixed(2),
        notes:       data.notes ?? null,
        status:      "pending",
      });

      await tx.insert(expenses).values({
        schoolId:    user.schoolId,
        locationId:  user.locationId,
        category:    "salary",
        description: `Salary - ${staffName}`,
        amount:      net.toFixed(2),
        expenseDate: todayIST(),
      });

      return { id: Number((r as any).insertId) };
    });
    return { ok: true, id: payrollId, netSalary: net.toFixed(2) };
  });

const markPayrollPaidSchema = z.object({ payrollId: z.number() });
export const markPayrollPaid = createServerFn({ method: "POST" })
  .validator((i: unknown) => markPayrollPaidSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, staffPayroll } = await import("@/lib/db/schema");
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.schoolId) throw new Error("Not authorized");

    await db.update(staffPayroll)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(staffPayroll.id, data.payrollId), eq(staffPayroll.schoolId, user.schoolId)));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND VERIFICATION DOC UPLOAD (for staff)
// ─────────────────────────────────────────────────────────────────────────────

const uploadBgDocSchema = z.object({
  staffId: z.number(),
  fileDataUrl: z.string(),
  fileName: z.string().max(255),
});
export const uploadBgVerificationDoc = createServerFn({ method: "POST" })
  .validator((i: unknown) => uploadBgDocSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    const { db } = await import("@/lib/db");
    const { users, staff } = await import("@/lib/db/schema");
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user?.schoolId) throw new Error("Not authorized");

    const dataUrlMatch = data.fileDataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!dataUrlMatch) throw new Error("Invalid file data");
    const mimeType = dataUrlMatch[1];
    const buffer   = Buffer.from(dataUrlMatch[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) throw new Error("File must be under 10MB");

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf",
    };
    const ext = extMap[mimeType] ?? "bin";
    const key = `schools/${user.schoolId}/staff/${data.staffId}/documents/bgcheck-${Date.now()}.${ext}`;
    const publicUrl = await uploadToR2orDisk(buffer, mimeType, key);

    await db.update(staff)
      .set({ backgroundCheckDocUrl: publicUrl, backgroundCheckStatus: "in_progress" })
      .where(and(eq(staff.id, data.staffId), eq(staff.schoolId, user.schoolId)));

    return { ok: true, publicUrl };
  });

// ─────────────────────────────────────────────────────────────────────────────
// CURRICULUM ACTIVITIES
// ─────────────────────────────────────────────────────────────────────────────

const uploadFileSchema = z.object({
  fileDataUrl: z.string(),
  fileName:    z.string().max(255),
});

const uploadCurriculumActivitySchema = z.object({
  classId:      z.number(),
  title:        z.string().min(1).max(255),
  description:  z.string().max(2000).optional(),
  activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  files:        z.array(uploadFileSchema).max(20).default([]),
});

export const uploadCurriculumActivity = createServerFn({ method: "POST" })
  .validator((i: unknown) => uploadCurriculumActivitySchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);

    const { db } = await import("@/lib/db");
    const { users, staff, staffClassAssignments, classes, curriculumActivities } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email, firstName: users.firstName, lastName: users.lastName })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "teacher" && user.role !== "staff" && user.role !== "school_admin" && user.role !== "location_admin")
      throw new Error("Not authorized");

    // Resolve staff record (may not exist for school_admin users)
    const [staffRecord] = await db
      .select({ id: staff.id, firstName: staff.firstName, lastName: staff.lastName })
      .from(staff)
      .where(and(eq(staff.schoolId, user.schoolId), or(eq(staff.userId, user.id), eq(staff.email, user.email ?? ""))))
      .limit(1);

    const isAdminRole = user.role === "school_admin" || user.role === "location_admin";

    if (!staffRecord && !isAdminRole) throw new Error("Staff record not found");

    // Verify teacher is assigned to this class (skip check for admins)
    if ((user.role === "teacher" || user.role === "staff") && staffRecord) {
      const [assigned] = await db
        .select({ id: staffClassAssignments.id })
        .from(staffClassAssignments)
        .innerJoin(classes, eq(staffClassAssignments.classId, classes.id))
        .where(and(
          eq(staffClassAssignments.staffId, staffRecord.id),
          eq(staffClassAssignments.classId, data.classId),
          eq(classes.schoolId, user.schoolId),
        ))
        .limit(1);
      if (!assigned) throw new Error("Not authorized for this class");
    }

    // Build uploader name
    const uploaderName = staffRecord
      ? `${staffRecord.firstName ?? ""} ${staffRecord.lastName ?? ""}`.trim()
      : `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

    if (!user.locationId) throw new Error("Location not set for user");

    const uploads = await Promise.all(
      (data.files ?? []).map(async (f, i) => {
        const [, meta, b64] = f.fileDataUrl.match(/^data:([^;]+);base64,(.+)$/) ?? [];
        if (!meta || !b64) throw new Error("Invalid file data");
        const buffer = Buffer.from(b64, "base64");
        const ext = f.fileName.split(".").pop() ?? "jpg";
        const r2Key = `schools/${user.schoolId}/curriculum/class-${data.classId}/${Date.now()}-${i}.${ext}`;
        const photoUrl = await uploadToR2orDisk(buffer, meta, r2Key);
        return { photoUrl, r2Key };
      })
    );

    const rows = uploads.length
      ? uploads.map((u) => ({
          schoolId:       user.schoolId,
          locationId:     user.locationId,
          classId:        data.classId,
          uploadedBy:     staffRecord?.id ?? null,
          uploadedByName: uploaderName || null,
          title:          data.title,
          description:    data.description ?? null,
          activityDate:   new Date(data.activityDate),
          photoUrl:       u.photoUrl ?? null,
          r2Key:          u.r2Key ?? null,
        }))
      : [{
          schoolId:       user.schoolId,
          locationId:     user.locationId,
          classId:        data.classId,
          uploadedBy:     staffRecord?.id ?? null,
          uploadedByName: uploaderName || null,
          title:          data.title,
          description:    data.description ?? null,
          activityDate:   new Date(data.activityDate),
          photoUrl:       null,
          r2Key:          null,
        }];

    const result = await db.insert(curriculumActivities).values(rows as any);

    return { ok: true, ids: (result as any).insertId ? Array.from({ length: rows.length }, (_, i) => Number((result as any).insertId) + i) : [] };
  });

const updateCurriculumActivitySchema = z.object({
  id: z.number(),
  classId: z.number().optional(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fileDataUrl: z.string().optional(),
  fileName: z.string().max(255).optional(),
});

export const updateCurriculumActivity = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateCurriculumActivitySchema.parse(input))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);

    const { db } = await import("@/lib/db");
    const { users, staff, curriculumActivities } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "teacher" && user.role !== "staff" && user.role !== "school_admin" && user.role !== "location_admin" && user.role !== "super_admin")
      throw new Error("Not authorized");

    const [existing] = await db
      .select({ id: curriculumActivities.id, schoolId: curriculumActivities.schoolId, photoUrl: curriculumActivities.photoUrl, r2Key: curriculumActivities.r2Key })
      .from(curriculumActivities)
      .where(and(eq(curriculumActivities.id, data.id), eq(curriculumActivities.schoolId, user.schoolId)))
      .limit(1);
    if (!existing) throw new Error("Activity not found");

    const isAdmin = ["school_admin", "location_admin", "super_admin"].includes(user.role ?? "");
    if (!isAdmin && user.role !== "super_admin") {
      const [staffRecord] = await db
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.schoolId, user.schoolId), or(eq(staff.userId, user.id), eq(staff.email, user.email ?? ""))))
        .limit(1);
      const [activity] = await db
        .select({ uploadedBy: curriculumActivities.uploadedBy })
        .from(curriculumActivities)
        .where(eq(curriculumActivities.id, data.id))
        .limit(1);
      if (!staffRecord || !activity || activity.uploadedBy !== staffRecord.id) {
        throw new Error("Not authorized");
      }
    }

    let photoUrl: string | null = existing.photoUrl ?? null;
    let r2Key: string | null = existing.r2Key ?? null;

    if (data.fileDataUrl && data.fileName) {
      const [, meta, b64] = data.fileDataUrl.match(/^data:([^;]+);base64,(.+)$/) ?? [];
      if (!meta || !b64) throw new Error("Invalid file data");
      const buffer = Buffer.from(b64, "base64");
      const ext = data.fileName.split(".").pop() ?? "jpg";
      r2Key = `schools/${user.schoolId}/curriculum/class-${data.classId ?? existing.classId ?? 0}/${Date.now()}.${ext}`;
      photoUrl = await uploadToR2orDisk(buffer, meta, r2Key);
    }

    await db.update(curriculumActivities).set({
      classId: data.classId,
      title: data.title,
      description: data.description ?? null,
      activityDate: new Date(data.activityDate),
      photoUrl,
      r2Key,
    }).where(eq(curriculumActivities.id, data.id));

    return { ok: true };
  });

const getCurriculumActivitiesSchema = z.object({
  classId: z.number().optional(),
  studentId: z.number().optional(),
});

export const getCurriculumActivities = createServerFn({ method: "GET" })
  .validator((i: unknown) => getCurriculumActivitiesSchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);

    const { db } = await import("@/lib/db");
    const { users, staff, parents, students, classEnrollments, curriculumActivities } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("Not authenticated");

    // For parent: find their children's class IDs then fetch activities
    if (user.role === "parent") {
      const parentRows = await db
        .select({ studentId: parents.studentId })
        .from(parents)
        .where(and(eq(parents.schoolId, user.schoolId), eq(parents.email, user.email ?? "")));

      const childIds = parentRows.map((p) => p.studentId);
      if (!childIds.length) return [];

      // Filter by specific student if requested
      const relevantIds = data.studentId ? childIds.filter((id) => id === data.studentId) : childIds;
      if (!relevantIds.length) return [];

      // Get class IDs for these students
      const enrollments = await db
        .select({ classId: classEnrollments.classId, studentId: classEnrollments.studentId })
        .from(classEnrollments)
        .where(and(inArray(classEnrollments.studentId, relevantIds), eq(classEnrollments.status, "active")));

      const classIds = [...new Set(enrollments.map((e) => e.classId))];
      if (!classIds.length) return [];

      return db
        .select({
          id: curriculumActivities.id,
          classId: curriculumActivities.classId,
          title: curriculumActivities.title,
          description: curriculumActivities.description,
          activityDate: curriculumActivities.activityDate,
          photoUrl: curriculumActivities.photoUrl,
          createdAt: curriculumActivities.createdAt,
          uploaderName: sql<string>`COALESCE(NULLIF(CONCAT(COALESCE(${staff.firstName},''),' ',COALESCE(${staff.lastName},'')), ' '), ${curriculumActivities.uploadedByName}, 'Admin')`,
          className: sql<string>`(SELECT name FROM classes WHERE id = ${curriculumActivities.classId})`,
        })
        .from(curriculumActivities)
        .leftJoin(staff, eq(curriculumActivities.uploadedBy, staff.id))
        .where(and(
          inArray(curriculumActivities.classId, classIds),
          eq(curriculumActivities.schoolId, user.schoolId),
        ))
        .orderBy(desc(curriculumActivities.activityDate), desc(curriculumActivities.createdAt));
    }

    // For teacher/admin: fetch by classId
    const conditions = [eq(curriculumActivities.schoolId, user.schoolId)];
    if (data.classId) conditions.push(eq(curriculumActivities.classId, data.classId));

    return db
      .select({
        id: curriculumActivities.id,
        classId: curriculumActivities.classId,
        title: curriculumActivities.title,
        description: curriculumActivities.description,
        activityDate: curriculumActivities.activityDate,
        photoUrl: curriculumActivities.photoUrl,
        createdAt: curriculumActivities.createdAt,
        uploaderName: sql<string>`COALESCE(NULLIF(CONCAT(COALESCE(${staff.firstName},''),' ',COALESCE(${staff.lastName},'')), ' '), ${curriculumActivities.uploadedByName}, 'Admin')`,
        className: sql<string>`(SELECT name FROM classes WHERE id = ${curriculumActivities.classId})`,
      })
      .from(curriculumActivities)
      .leftJoin(staff, eq(curriculumActivities.uploadedBy, staff.id))
      .where(and(...conditions))
      .orderBy(desc(curriculumActivities.activityDate), desc(curriculumActivities.createdAt));
  });

const deleteCurriculumActivitySchema = z.object({ id: z.number() });
export const deleteCurriculumActivity = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteCurriculumActivitySchema.parse(i))
  .handler(async ({ data }) => {
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");
    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);

    const { db } = await import("@/lib/db");
    const { users, staff, curriculumActivities } = await import("@/lib/db/schema");

    const [user] = await db
      .select({ id: users.id, role: users.role, schoolId: users.schoolId, email: users.email })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("Not authenticated");

    const [activity] = await db
      .select({ id: curriculumActivities.id, schoolId: curriculumActivities.schoolId, uploadedBy: curriculumActivities.uploadedBy })
      .from(curriculumActivities)
      .where(and(eq(curriculumActivities.id, data.id), eq(curriculumActivities.schoolId, user.schoolId)))
      .limit(1);
    if (!activity) throw new Error("Activity not found");

    // Teachers can only delete their own uploads; admins can delete any
    if (user.role === "teacher" || user.role === "staff") {
      const [staffRecord] = await db
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.schoolId, user.schoolId), or(eq(staff.userId, user.id), eq(staff.email, user.email ?? ""))))
        .limit(1);
      if (!staffRecord || activity.uploadedBy !== staffRecord.id) throw new Error("Not authorized");
    }

    await db.delete(curriculumActivities).where(eq(curriculumActivities.id, data.id));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// FEE AUTOMATION — Auto-overdue flip + Monthly invoice generation
// ─────────────────────────────────────────────────────────────────────────────

const feeAutomationSchema = z.object({ schoolId: z.number(), locationId: z.number() });

export const runFeeAutomation = createServerFn({ method: "POST" })
  .validator((i: unknown) => feeAutomationSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    return runFeeAutomationCore(data.schoolId, data.locationId);
  });

// Core automation logic — also called by the cron endpoint
export async function runFeeAutomationCore(schoolId: number, locationId: number) {
  const { db } = await import("@/lib/db");
  const { invoices, classEnrollments } = await import("@/lib/db/schema");

  const todayStr = todayIST();
  const currentMonth = todayStr.slice(0, 7); // "YYYY-MM"

  // ── 1. Flip sent invoices past due date → overdue ─────────────────────────
  await db.update(invoices)
    .set({ status: "overdue" })
    .where(and(
      eq(invoices.schoolId, schoolId),
      eq(invoices.locationId, locationId),
      eq(invoices.status, "sent"),
      sql`${invoices.dueDate} < ${todayStr}`,
    ));

  // ── 2. Get all active students in this location ────────────────────────────
  const enrollments = await db.selectDistinct({
    studentId: classEnrollments.studentId,
  }).from(classEnrollments)
    .where(and(
      eq(classEnrollments.schoolId, schoolId),
      eq(classEnrollments.locationId, locationId),
      eq(classEnrollments.status, "active"),
    ));

  if (!enrollments.length) return { ok: true, generated: 0 };

  // ── 3. Generate one combined invoice per active student for current month ───
  // Includes school fees, daycare hourly (with sessions) and daycare monthly.
  // One-time fees are skipped by auto; they should be generated manually.

  let generated = 0;
  for (const en of enrollments) {
    const r = await generateStudentInvoiceCore(
      { schoolId, locationId, studentId: en.studentId, month: currentMonth },
      { status: "sent", skipOneTime: true }
    );
    if (!r.isExisting && r.invoiceId) generated++;
  }

  return { ok: true, generated };
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK INVOICE PAID (Cash / manual)
// ─────────────────────────────────────────────────────────────────────────────

const markInvoicePaidSchema = z.object({
  invoiceId: z.number(),
  method: z.enum(["cash", "bank_transfer", "cheque", "other"]),
  notes: z.string().max(500).optional(),
});

export const markInvoicePaid = createServerFn({ method: "POST" })
  .validator((i: unknown) => markInvoicePaidSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { invoices, payments } = await import("@/lib/db/schema");

    // Fetch invoice to get schoolId/locationId/amount for payment record
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    if (!inv) throw new Error("Invoice not found");

    await db.update(invoices).set({
      status: "paid",
      paidAt: new Date(),
      paidMethod: data.method,
      paidNotes: data.notes ?? null,
    }).where(eq(invoices.id, data.invoiceId));

    await db.insert(payments).values({
      schoolId: inv.schoolId,
      locationId: inv.locationId,
      invoiceId: data.invoiceId,
      amount: inv.amount,
      method: data.method,
    });

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// SEND INVOICE — flip draft → sent (notifies parent by email if possible)
// ─────────────────────────────────────────────────────────────────────────────

const sendInvoiceSchema = z.object({ invoiceId: z.number() });

export const sendInvoice = createServerFn({ method: "POST" })
  .validator((i: unknown) => sendInvoiceSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { invoices, students, parents, schools } = await import("@/lib/db/schema");

    const [inv] = await db.select({
      id: invoices.id, schoolId: invoices.schoolId, locationId: invoices.locationId,
      studentId: invoices.studentId, amount: invoices.amount, dueDate: invoices.dueDate,
      status: invoices.status,
    }).from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    if (!inv) throw new Error("Invoice not found");

    await db.update(invoices).set({ status: "sent" }).where(eq(invoices.id, data.invoiceId));

    // Try to email parent
    try {
      const [school] = await db.select({ name: schools.name }).from(schools).where(eq(schools.id, inv.schoolId)).limit(1);
      const [student] = await db.select({ firstName: students.firstName, lastName: students.lastName })
        .from(students).where(eq(students.id, inv.studentId)).limit(1);
      const parentRows = await db.select({ email: parents.email, name: parents.name, phone: parents.phone })
        .from(parents)
        .where(and(eq(parents.studentId, inv.studentId), eq(parents.isPrimary, 1)));

      const primaryParent = parentRows[0] ?? null;
      const studentName = `${student?.firstName ?? ""} ${student?.lastName ?? ""}`.trim();
      const schoolName = school?.name ?? "Your School";
      const dueDate = inv.dueDate ? fmtDate(inv.dueDate) : null;
      const appUrl = process.env.APP_URL ?? "https://edupulse.vercel.app";

      if (primaryParent?.email) {
        const { sendInvoiceEmail } = await import("@/lib/email");
        await sendInvoiceEmail({
          to: primaryParent.email,
          parentName: primaryParent.name,
          studentName,
          schoolName,
          amount: inv.amount,
          dueDate,
          invoiceId: inv.id,
          payUrl: `${appUrl}/parent`,
        });
      }

      if (primaryParent?.phone) {
        try {
          const { sendSMS } = await import("@/lib/sms");
          const body = `Fee of Rs.${inv.amount} for ${studentName} at ${schoolName}${dueDate ? ` due ${dueDate}` : ""}. Pay at ${appUrl}/parent`;
          await sendSMS({ to: primaryParent.phone, body });
        } catch (smsErr: any) {
          // SMS failure is non-fatal — invoice is still sent
          console.warn("Failed to send invoice SMS:", smsErr?.message ?? smsErr);
        }
      }
    } catch (_) {
      // Email/parent fetch failure is non-fatal — invoice is already marked sent
    }

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY — create order for an invoice
// ─────────────────────────────────────────────────────────────────────────────

const createRazorpayOrderSchema = z.object({ invoiceId: z.number() });

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .validator((i: unknown) => createRazorpayOrderSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { invoices, schools } = await import("@/lib/db/schema");

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "paid") throw new Error("Invoice already paid");

    const [school] = await db.select({ razorpayKeyId: schools.razorpayKeyId, razorpayKeySecret: schools.razorpayKeySecret })
      .from(schools).where(eq(schools.id, inv.schoolId)).limit(1);
    if (!school?.razorpayKeyId || !school?.razorpayKeySecret) {
      throw new Error("Razorpay is not configured for this school. Please contact the school admin.");
    }

    // Create Razorpay order via REST API (no SDK needed)
    const amountPaise = Math.round(parseFloat(inv.amount) * 100);
    const authHeader = `Basic ${Buffer.from(`${school.razorpayKeyId}:${school.razorpayKeySecret}`).toString("base64")}`;

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `inv_${inv.id}`,
        notes: { invoiceId: inv.id },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Razorpay order creation failed: ${err}`);
    }

    const order = await res.json() as { id: string };

    // Save order ID on invoice
    await db.update(invoices).set({ razorpayOrderId: order.id }).where(eq(invoices.id, inv.id));

    return { orderId: order.id, amount: amountPaise, keyId: school.razorpayKeyId };
  });

// ─────────────────────────────────────────────────────────────────────────────
// RAZORPAY — verify payment after checkout success
// ─────────────────────────────────────────────────────────────────────────────

const verifyRazorpayPaymentSchema = z.object({
  invoiceId: z.number(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .validator((i: unknown) => verifyRazorpayPaymentSchema.parse(i))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { invoices, schools, payments } = await import("@/lib/db/schema");

    const [inv] = await db.select({ id: invoices.id, schoolId: invoices.schoolId, locationId: invoices.locationId, amount: invoices.amount })
      .from(invoices).where(eq(invoices.id, data.invoiceId)).limit(1);
    if (!inv) throw new Error("Invoice not found");

    const [school] = await db.select({ razorpayKeySecret: schools.razorpayKeySecret })
      .from(schools).where(eq(schools.id, inv.schoolId)).limit(1);
    if (!school?.razorpayKeySecret) throw new Error("Razorpay not configured");

    // Verify HMAC-SHA256 signature
    const { createHmac } = await import("node:crypto");
    const expectedSig = createHmac("sha256", school.razorpayKeySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest("hex");

    if (expectedSig !== data.razorpaySignature) {
      throw new Error("Payment signature verification failed");
    }

    // Mark invoice paid
    await db.update(invoices).set({
      status: "paid",
      paidAt: new Date(),
      paidMethod: "razorpay",
      razorpayPaymentId: data.razorpayPaymentId,
    }).where(eq(invoices.id, inv.id));

    // Record payment
    await db.insert(payments).values({
      schoolId: inv.schoolId,
      locationId: inv.locationId,
      invoiceId: inv.id,
      amount: inv.amount,
      method: "razorpay",
      razorpayPaymentId: data.razorpayPaymentId,
    });

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL SETTINGS — save Razorpay keys
// ─────────────────────────────────────────────────────────────────────────────

const saveRazorpayKeysSchema = z.object({
  schoolId: z.number(),
  razorpayKeyId: z.string().trim().min(1),
  razorpayKeySecret: z.string().trim().min(1),
});

export const saveRazorpayKeys = createServerFn({ method: "POST" })
  .validator((i: unknown) => saveRazorpayKeysSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { schools } = await import("@/lib/db/schema");
    await db.update(schools).set({
      razorpayKeyId: data.razorpayKeyId,
      razorpayKeySecret: data.razorpayKeySecret,
    }).where(eq(schools.id, data.schoolId));
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET SCHOOL RAZORPAY STATUS (for settings UI — never expose secret)
// ─────────────────────────────────────────────────────────────────────────────

const getSchoolPaymentSettingsSchema = z.object({ schoolId: z.number() });

export const getSchoolPaymentSettings = createServerFn({ method: "GET" })
  .validator((i: unknown) => getSchoolPaymentSettingsSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { schools } = await import("@/lib/db/schema");
    const [school] = await db.select({ razorpayKeyId: schools.razorpayKeyId, hasSecret: schools.razorpayKeySecret })
      .from(schools).where(eq(schools.id, data.schoolId)).limit(1);
    return {
      razorpayKeyId: school?.razorpayKeyId ?? null,
      hasSecret: !!(school?.hasSecret),
    };
  });

// ── EXPENSES & P&L ──────────────────────────────────────────────────────────

const expenseCategories = ["salary", "electricity", "rent", "supplies", "transport", "maintenance", "other"] as const;

const manageExpenseSchema = z.object({
  id: z.number().optional(),
  schoolId: z.number(),
  locationId: z.number(),
  category: z.enum(expenseCategories),
  description: z.string().max(1000).optional(),
  amount: z.string().or(z.number()),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const manageExpense = createServerFn({ method: "POST" })
  .validator((i: unknown) => manageExpenseSchema.parse(i))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { expenses } = await import("@/lib/db/schema");
    const user = await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    if (!["super_admin", "school_admin", "location_admin"].includes(user.role ?? "")) throw new Error("Not authorized");

    if (data.id) {
      await db.update(expenses).set({
        category: data.category,
        description: data.description,
        amount: String(data.amount),
        expenseDate: data.expenseDate as any,
      }).where(eq(expenses.id, data.id));
      return { id: data.id };
    }

    const [r] = await db.insert(expenses).values({
      schoolId: data.schoolId,
      locationId: data.locationId,
      category: data.category,
      description: data.description,
      amount: String(data.amount),
      expenseDate: data.expenseDate as any,
      createdBy: user.userId,
    });
    return { id: Number((r as any).insertId) };
  });

const listExpensesSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const listExpenses = createServerFn({ method: "GET" })
  .validator((i: unknown) => listExpensesSchema.parse(i))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { expenses } = await import("@/lib/db/schema");
    const user = await requireAuth(data.schoolId, data.locationId);
    if (!["super_admin", "school_admin", "location_admin"].includes(user.role ?? "")) throw new Error("Not authorized");

    const conditions: any[] = [eq(expenses.schoolId, data.schoolId), eq(expenses.locationId, data.locationId)];
    if (data.from) conditions.push(gte(expenses.expenseDate, data.from as any));
    if (data.to) conditions.push(lte(expenses.expenseDate, data.to as any));

    return db.select().from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.expenseDate));
  });

const deleteExpenseSchema = z.object({ id: z.number(), schoolId: z.number(), locationId: z.number() });
export const deleteExpense = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteExpenseSchema.parse(i))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { expenses } = await import("@/lib/db/schema");
    const user = await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    if (!["super_admin", "school_admin", "location_admin"].includes(user.role ?? "")) throw new Error("Not authorized");
    await db.delete(expenses).where(and(eq(expenses.id, data.id), eq(expenses.schoolId, data.schoolId), eq(expenses.locationId, data.locationId)));
    return { ok: true };
  });

const getPnlSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getPnl = createServerFn({ method: "GET" })
  .validator((i: unknown) => getPnlSchema.parse(i))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { expenses, invoices, payments, students, feeStructures, locations, schools } = await import("@/lib/db/schema");
    const user = await requireAuth(data.schoolId, data.locationId);
    if (!["super_admin", "school_admin", "location_admin"].includes(user.role ?? "")) throw new Error("Not authorized");

    const [incomeRow] = await db.select({ total: sql`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(
        eq(payments.schoolId, data.schoolId),
        eq(payments.locationId, data.locationId),
        gte(payments.paidAt, new Date(data.from + "T00:00:00")),
        lte(payments.paidAt, new Date(data.to + "T23:59:59")),
      ));

    const [expenseRow] = await db.select({ total: sql`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(
        eq(expenses.schoolId, data.schoolId),
        eq(expenses.locationId, data.locationId),
        gte(expenses.expenseDate, data.from as any),
        lte(expenses.expenseDate, data.to as any),
      ));

    const expenseList = await db.select({
      id: expenses.id,
      category: expenses.category,
      description: expenses.description,
      amount: expenses.amount,
      expenseDate: expenses.expenseDate,
    })
      .from(expenses)
      .where(and(
        eq(expenses.schoolId, data.schoolId),
        eq(expenses.locationId, data.locationId),
        gte(expenses.expenseDate, data.from as any),
        lte(expenses.expenseDate, data.to as any),
      ))
      .orderBy(desc(expenses.expenseDate));

    const incomeList = await db.select({
      id: payments.id,
      studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
      method: payments.method,
      feeName: feeStructures.name,
      amount: payments.amount,
      paidAt: payments.paidAt,
    })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .innerJoin(students, eq(invoices.studentId, students.id))
      .leftJoin(feeStructures, eq(invoices.feeStructureId, feeStructures.id))
      .where(and(
        eq(payments.schoolId, data.schoolId),
        eq(payments.locationId, data.locationId),
        gte(payments.paidAt, new Date(data.from + "T00:00:00")),
        lte(payments.paidAt, new Date(data.to + "T23:59:59")),
      ))
      .orderBy(desc(payments.paidAt));

    const [location] = await db.select({
      name: locations.name,
      address: locations.address,
      city: locations.city,
      state: locations.state,
      pincode: locations.pincode,
    })
      .from(locations)
      .where(eq(locations.id, data.locationId))
      .limit(1);

    const [school] = await db.select({
      name: schools.name,
      logoUrl: schools.logoUrl,
    })
      .from(schools)
      .where(eq(schools.id, data.schoolId))
      .limit(1);

    const income = parseFloat((incomeRow.total as any) ?? "0");
    const expenseTotal = parseFloat((expenseRow.total as any) ?? "0");
    const net = income - expenseTotal;

    return {
      from: data.from,
      to: data.to,
      income,
      expenses: expenseTotal,
      net,
      location: location ?? { name: "", address: null, city: null, state: null, pincode: null },
      school: school ?? { name: "", logoUrl: null },
      incomeList,
      expenseList,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL ERP MODULES (Subjects, Timetable, Exams, Marks, Announcements)
// ─────────────────────────────────────────────────────────────────────────────

// ── SUBJECTS ─────────────────────────────────────────────────────────────────

const manageSubjectSchema = z.object({
  id: z.number().optional(),
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().max(20).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const manageSubject = createServerFn({ method: "POST" })
  .validator((i: unknown) => manageSubjectSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, locationId, userId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { subjects } = await import("@/lib/db/schema");

    const [dup] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(data.id
        ? and(eq(subjects.schoolId, schoolId), eq(subjects.name, data.name), ne(subjects.id, data.id))
        : and(eq(subjects.schoolId, schoolId), eq(subjects.name, data.name))
      )
      .limit(1);
    if (dup) throw new Error(`A subject named "${data.name}" already exists`);

    if (data.id) {
      const [existing] = await db.select().from(subjects).where(eq(subjects.id, data.id)).limit(1);
      if (!existing || existing.schoolId !== schoolId) throw new Error("Not authorized");
      await db.update(subjects).set({
        name: data.name,
        code: data.code,
        status: data.status as any,
      }).where(eq(subjects.id, data.id));
      return { id: data.id };
    } else {
      const [r] = await db.insert(subjects).values({
        schoolId,
        name: data.name,
        code: data.code,
        status: data.status as any ?? "active",
      });
      return { id: Number((r as any).insertId) };
    }
  });

const listSubjectsSchema = z.object({ schoolId: z.number() });
export const listSubjects = createServerFn({ method: "GET" })
  .validator((i: unknown) => listSubjectsSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId);
    const { db } = await import("@/lib/db");
    const { subjects } = await import("@/lib/db/schema");
    return db.select().from(subjects).where(eq(subjects.schoolId, data.schoolId)).orderBy(asc(subjects.name));
  });

const deleteSubjectSchema = z.object({ id: z.number() });
export const deleteSubject = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteSubjectSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, userId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { subjects } = await import("@/lib/db/schema");
    await db.delete(subjects).where(and(eq(subjects.id, data.id), eq(subjects.schoolId, schoolId)));
    return { ok: true };
  });

// ── CLASS SUBJECTS ───────────────────────────────────────────────────────────

const setClassSubjectsSchema = z.object({
  classId: z.number(),
  subjectIds: z.array(z.number()),
});

export const setClassSubjects = createServerFn({ method: "POST" })
  .validator((i: unknown) => setClassSubjectsSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, locationId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { classSubjects } = await import("@/lib/db/schema");

    // remove existing
    await db.delete(classSubjects).where(eq(classSubjects.classId, data.classId));

    // insert new
    if (data.subjectIds.length) {
      await db.insert(classSubjects).values(data.subjectIds.map((sid) => ({
        schoolId,
        locationId,
        classId: data.classId,
        subjectId: sid,
      })));
    }
    return { ok: true };
  });

const getClassSubjectsSchema = z.object({ classId: z.number() });
export const getClassSubjects = createServerFn({ method: "GET" })
  .validator((i: unknown) => getClassSubjectsSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { classSubjects, subjects } = await import("@/lib/db/schema");

    const rows = await db.select({
      id: classSubjects.id,
      classId: classSubjects.classId,
      subjectId: classSubjects.subjectId,
      name: subjects.name,
      code: subjects.code,
    })
      .from(classSubjects)
      .leftJoin(subjects, eq(classSubjects.subjectId, subjects.id))
      .where(eq(classSubjects.classId, data.classId));

    return rows;
  });

// ── TIMETABLE ────────────────────────────────────────────────────────────────

const upsertTimetableSchema = z.object({
  id: z.number().optional(),
  classId: z.number(),
  dayOfWeek: z.number().min(1).max(7),
  periodNumber: z.number().min(1),
  startTime: z.string().max(10).optional(),
  endTime: z.string().max(10).optional(),
  subjectId: z.number().optional(),
  teacherId: z.number().optional(),
});

function normalizeTime(t?: string) {
  if (!t || !t.trim()) return null;
  const [h, m] = t.split(":");
  if (h == null || m == null) return t.trim();
  const hh = Number(h);
  const mm = Number(m);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return t.trim();
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const upsertTimetable = createServerFn({ method: "POST" })
  .validator((i: unknown) => upsertTimetableSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, locationId, userId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { timetable } = await import("@/lib/db/schema");

    const startTime = normalizeTime(data.startTime);
    const endTime = normalizeTime(data.endTime);

    if (startTime && endTime) {
      if (startTime >= endTime) throw new Error("Start time must be before end time");
      const clash = await db.select({ id: timetable.id })
        .from(timetable)
        .where(and(
          eq(timetable.classId, data.classId),
          eq(timetable.dayOfWeek, data.dayOfWeek),
          ne(timetable.id, data.id ?? 0),
          lt(timetable.startTime, endTime),
          gt(timetable.endTime, startTime),
        ))
        .limit(1);
      if (clash.length) throw new Error("This time slot overlaps with an existing period");
    }

    if (data.id) {
      await db.update(timetable).set({
        dayOfWeek: data.dayOfWeek,
        periodNumber: data.periodNumber,
        startTime,
        endTime,
        subjectId: data.subjectId || null,
        teacherId: data.teacherId || null,
      }).where(eq(timetable.id, data.id));
      return { id: data.id };
    }

    const [r] = await db.insert(timetable).values({
      schoolId,
      locationId,
      classId: data.classId,
      dayOfWeek: data.dayOfWeek,
      periodNumber: data.periodNumber,
      startTime,
      endTime,
      subjectId: data.subjectId || null,
      teacherId: data.teacherId || null,
    });
    return { id: Number((r as any).insertId) };
  });

const deleteTimetableSchema = z.object({ id: z.number() });
export const deleteTimetable = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteTimetableSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { timetable } = await import("@/lib/db/schema");
    await db.delete(timetable).where(and(eq(timetable.id, data.id), eq(timetable.schoolId, schoolId)));
    return { ok: true };
  });

const getTimetableSchema = z.object({ classId: z.number() });
export const getTimetable = createServerFn({ method: "GET" })
  .validator((i: unknown) => getTimetableSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { timetable, subjects, staff } = await import("@/lib/db/schema");

    const rows = await db.select({
      id: timetable.id,
      dayOfWeek: timetable.dayOfWeek,
      periodNumber: timetable.periodNumber,
      startTime: timetable.startTime,
      endTime: timetable.endTime,
      subjectId: timetable.subjectId,
      teacherId: timetable.teacherId,
      subjectName: subjects.name,
      teacherName: staff.firstName,
    })
      .from(timetable)
      .leftJoin(subjects, eq(timetable.subjectId, subjects.id))
      .leftJoin(staff, eq(timetable.teacherId, staff.id))
      .where(eq(timetable.classId, data.classId))
      .orderBy(asc(timetable.dayOfWeek), asc(timetable.periodNumber));

    return rows;
  });

// ── EXAMS ────────────────────────────────────────────────────────────────────

const manageExamSchema = z.object({
  id: z.number().optional(),
  classId: z.number(),
  academicYear: z.string().trim().min(1).max(20),
  term: z.string().trim().min(1).max(100),
  examType: z.string().trim().max(50).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export const manageExam = createServerFn({ method: "POST" })
  .validator((i: unknown) => manageExamSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, locationId, userId } = await requireAuth();
    await assertCanOperateForUser();
    await requireNotReceptionist(userId);
    const { db } = await import("@/lib/db");
    const { exams } = await import("@/lib/db/schema");

    if (data.id) {
      await db.update(exams).set({
        classId: data.classId,
        academicYear: data.academicYear,
        term: data.term,
        examType: data.examType,
        startDate: data.startDate as any,
        endDate: data.endDate as any,
        status: data.status as any,
      }).where(eq(exams.id, data.id));
      return { id: data.id };
    }

    const [r] = await db.insert(exams).values({
      schoolId,
      locationId,
      classId: data.classId,
      academicYear: data.academicYear,
      term: data.term,
      examType: data.examType ?? "regular",
      startDate: data.startDate as any,
      endDate: data.endDate as any,
      status: data.status as any ?? "draft",
    });
    return { id: Number((r as any).insertId) };
  });

const listExamsSchema = z.object({
  classId: z.number().optional(),
  academicYear: z.string().optional(),
});

export const listExams = createServerFn({ method: "GET" })
  .validator((i: unknown) => listExamsSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { exams } = await import("@/lib/db/schema");

    const conditions = [];
    if (data.classId) conditions.push(eq(exams.classId, data.classId));
    if (data.academicYear) conditions.push(eq(exams.academicYear, data.academicYear));

    const rows = await db.select().from(exams)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(exams.createdAt));

    return rows.map((r: any) => ({
      ...r,
      startDate: r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : null,
      endDate: r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : null,
    }));
  });

const deleteExamSchema = z.object({ id: z.number() });
export const deleteExam = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteExamSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, userId } = await requireAuth();
    await assertCanOperateForUser();
    await requireNotReceptionist(userId);
    const { db } = await import("@/lib/db");
    const { exams } = await import("@/lib/db/schema");
    await db.delete(exams).where(and(eq(exams.id, data.id), eq(exams.schoolId, schoolId)));
    return { ok: true };
  });

// ── EXAM SUBJECTS ────────────────────────────────────────────────────────────

const upsertExamSubjectSchema = z.object({
  id: z.number().optional(),
  examId: z.number(),
  subjectId: z.number(),
  maxMarks: z.string().or(z.number()),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const upsertExamSubject = createServerFn({ method: "POST" })
  .validator((i: unknown) => upsertExamSubjectSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, userId } = await requireAuth();
    await assertCanOperateForUser();
    await requireNotReceptionist(userId);
    const { db } = await import("@/lib/db");
    const { examSubjects, exams } = await import("@/lib/db/schema");

    const [exam] = await db.select().from(exams).where(eq(exams.id, data.examId)).limit(1);
    if (!exam || exam.schoolId !== schoolId) throw new Error("Not authorized");

    const maxMarks = String(data.maxMarks);

    if (data.id) {
      await db.update(examSubjects).set({
        subjectId: data.subjectId,
        maxMarks,
        examDate: data.examDate as any,
      }).where(eq(examSubjects.id, data.id));
      return { id: data.id };
    }

    const [r] = await db.insert(examSubjects).values({
      examId: data.examId,
      subjectId: data.subjectId,
      maxMarks,
      examDate: data.examDate as any,
    });
    return { id: Number((r as any).insertId) };
  });

const listExamSubjectsSchema = z.object({ examId: z.number() });
export const listExamSubjects = createServerFn({ method: "GET" })
  .validator((i: unknown) => listExamSubjectsSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { examSubjects, subjects } = await import("@/lib/db/schema");

    const rows = await db.select({
      id: examSubjects.id,
      examId: examSubjects.examId,
      subjectId: examSubjects.subjectId,
      maxMarks: examSubjects.maxMarks,
      examDate: examSubjects.examDate,
      name: subjects.name,
    })
      .from(examSubjects)
      .leftJoin(subjects, eq(examSubjects.subjectId, subjects.id))
      .where(eq(examSubjects.examId, data.examId));

    return rows.map((r: any) => ({
      ...r,
      examDate: r.examDate ? new Date(r.examDate).toISOString().slice(0, 10) : null,
    }));
  });

const deleteExamSubjectSchema = z.object({ id: z.number() });
export const deleteExamSubject = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteExamSubjectSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, userId } = await requireAuth();
    await assertCanOperateForUser();
    await requireNotReceptionist(userId);
    const { db } = await import("@/lib/db");
    const { examSubjects, exams } = await import("@/lib/db/schema");
    const [es] = await db.select().from(examSubjects).where(eq(examSubjects.id, data.id)).limit(1);
    if (es) {
      const [exam] = await db.select().from(exams).where(eq(exams.id, es.examId)).limit(1);
      if (exam?.schoolId === schoolId) {
        await db.delete(examSubjects).where(eq(examSubjects.id, data.id));
      }
    }
    return { ok: true };
  });

// ── STUDENT MARKS ─────────────────────────────────────────────────────────────

const getStudentsForMarksSchema = z.object({ classId: z.number() });
export const getStudentsForMarks = createServerFn({ method: "GET" })
  .validator((i: unknown) => getStudentsForMarksSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { students } = await import("@/lib/db/schema");
    return db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
    })
      .from(students)
      .where(eq(students.currentClassId, data.classId))
      .orderBy(asc(students.firstName));
  });

const saveStudentMarksSchema = z.object({
  marks: z.array(z.object({
    studentId: z.number(),
    examSubjectId: z.number(),
    marks: z.string().or(z.number()).optional(),
    grade: z.string().max(10).optional(),
    notes: z.string().optional(),
  })),
});

export const saveStudentMarks = createServerFn({ method: "POST" })
  .validator((i: unknown) => saveStudentMarksSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, userId } = await requireAuth();
    await assertCanOperateForUser();
    await requireNotReceptionist(userId);
    const { db } = await import("@/lib/db");
    const { studentMarks, examSubjects, exams, staff } = await import("@/lib/db/schema");

    // validate all exam-subjects belong to this school
    const ids = data.marks.map((m) => m.examSubjectId);
    if (ids.length) {
      const esRows = await db.select({ examId: examSubjects.examId })
        .from(examSubjects)
        .where(inArray(examSubjects.id, ids));
      const examIds = [...new Set(esRows.map((e) => e.examId))];
      const examRows = await db.select({ id: exams.id, schoolId: exams.schoolId })
        .from(exams).where(inArray(exams.id, examIds));
      if (examRows.some((e) => e.schoolId !== schoolId)) throw new Error("Not authorized");
    }

    // markedBy is a staff FK — look up the staff row for this user (may be null for school admins)
    const [staffRow] = await db.select({ id: staff.id }).from(staff).where(eq(staff.userId, userId)).limit(1);
    const markedById = staffRow?.id ?? null;

    for (const m of data.marks) {
      const marksValue = m.marks === "" || m.marks == null ? null : String(m.marks);
      const [existing] = await db.select({ id: studentMarks.id })
        .from(studentMarks)
        .where(and(eq(studentMarks.studentId, m.studentId), eq(studentMarks.examSubjectId, m.examSubjectId)))
        .limit(1);

      if (existing) {
        await db.update(studentMarks).set({
          marks: marksValue,
          grade: m.grade,
          notes: m.notes,
          markedBy: markedById,
        }).where(eq(studentMarks.id, existing.id));
      } else {
        await db.insert(studentMarks).values({
          studentId: m.studentId,
          examSubjectId: m.examSubjectId,
          marks: marksValue,
          grade: m.grade,
          notes: m.notes,
          markedBy: markedById,
        });
      }
    }
    return { ok: true };
  });

const listStudentMarksSchema = z.object({
  classId: z.number(),
  examId: z.number(),
});

export const listStudentMarks = createServerFn({ method: "GET" })
  .validator((i: unknown) => listStudentMarksSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { studentMarks, examSubjects, students } = await import("@/lib/db/schema");

    return db.select({
      id: studentMarks.id,
      studentId: studentMarks.studentId,
      examSubjectId: studentMarks.examSubjectId,
      marks: studentMarks.marks,
      grade: studentMarks.grade,
      notes: studentMarks.notes,
      firstName: students.firstName,
      lastName: students.lastName,
    })
      .from(studentMarks)
      .innerJoin(students, eq(studentMarks.studentId, students.id))
      .innerJoin(examSubjects, eq(studentMarks.examSubjectId, examSubjects.id))
      .where(and(eq(examSubjects.examId, data.examId), eq(students.currentClassId, data.classId)))
      .orderBy(asc(students.firstName));
  });

// ── SCHOOL ANNOUNCEMENTS ───────────────────────────────────────────────────────

const manageSchoolAnnouncementSchema = z.object({
  id: z.number().optional(),
  title: z.string().trim().min(1).max(200),
  message: z.string().optional(),
  target: z.enum(["all", "parents", "staff", "location_admin", "teacher"]).default("all"),
});

const ANNOUNCEMENT_ROLES = new Set(["super_admin", "school_admin", "location_admin", "teacher"]);

export const manageSchoolAnnouncement = createServerFn({ method: "POST" })
  .validator((i: unknown) => manageSchoolAnnouncementSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId, locationId, userId, role } = await requireAuth();
    await assertCanOperateForUser();
    if (!ANNOUNCEMENT_ROLES.has(role ?? "")) throw new Error("Not authorized");
    const { db } = await import("@/lib/db");
    const { schoolAnnouncements } = await import("@/lib/db/schema");

    if (data.id) {
      await db.update(schoolAnnouncements).set({
        title: data.title,
        message: data.message,
        target: data.target,
      }).where(eq(schoolAnnouncements.id, data.id));
      return { id: data.id };
    }

    const [r] = await db.insert(schoolAnnouncements).values({
      schoolId,
      locationId,
      title: data.title,
      message: data.message,
      target: data.target,
      createdBy: userId,
    });

    try {
      const targetLocationId = SCHOOL_WIDE_ROLES.has(role ?? "") ? undefined : locationId;
      const targetRole =
        data.target === "parents"
          ? "parent"
          : data.target === "all" || data.target === "staff"
          ? undefined
          : data.target;
      await broadcastPush(data.title, data.message ?? "", "/announcements", schoolId, targetLocationId, targetRole);
    } catch (e) {
      console.error("broadcastPush (school) failed:", e);
    }

    return { id: Number((r as any).insertId) };
  });

const listSchoolAnnouncementsSchema = z.object({
  target: z.enum(["all", "parents", "staff", "location_admin", "teacher"]).optional(),
});

export const listSchoolAnnouncements = createServerFn({ method: "GET" })
  .validator((i: unknown) => listSchoolAnnouncementsSchema.parse(i))
  .handler(async ({ data }) => {
    const user = await requireAuth();
    const { db } = await import("@/lib/db");
    const { schoolAnnouncements, announcements } = await import("@/lib/db/schema");

    // ── School announcements ────────────────────────────────────────────────────
    const schoolTargetMatches = [eq(schoolAnnouncements.target, "all")];
    if (user.role === "parent") {
      schoolTargetMatches.push(eq(schoolAnnouncements.target, "parents"));
    } else {
      schoolTargetMatches.push(eq(schoolAnnouncements.target, "staff"));
      schoolTargetMatches.push(eq(schoolAnnouncements.target, user.role as any));
    }

    const schoolConditions = [
      eq(schoolAnnouncements.schoolId, user.schoolId),
      eq(schoolAnnouncements.locationId, user.locationId),
      or(or(...schoolTargetMatches), eq(schoolAnnouncements.createdBy, user.id)),
    ];
    if (data.target) {
      schoolConditions.push(or(eq(schoolAnnouncements.target, "all"), eq(schoolAnnouncements.target, data.target)));
    }

    const schoolRows = await db
      .select()
      .from(schoolAnnouncements)
      .where(and(...schoolConditions))
      .orderBy(desc(schoolAnnouncements.createdAt));

    // ── Global super-admin announcements ────────────────────────────────────────
    const globalConditions = [
      eq(announcements.isActive, 1),
      or(eq(announcements.targetRole, "all"), eq(announcements.targetRole, user.role)),
      or(isNull(announcements.expiresAt), gt(announcements.expiresAt, sql`now()`)),
    ];

    const globalRows = await db
      .select()
      .from(announcements)
      .where(and(...globalConditions))
      .orderBy(desc(announcements.createdAt));

    return [
      ...schoolRows.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        target: a.target,
        createdAt: a.createdAt,
        scope: "school" as const,
      })),
      ...globalRows.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.body,
        target: a.targetRole,
        createdAt: a.createdAt,
        scope: "global" as const,
      })),
    ].sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());
  });

const deleteSchoolAnnouncementSchema = z.object({ id: z.number() });
export const deleteSchoolAnnouncement = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteSchoolAnnouncementSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { schoolAnnouncements } = await import("@/lib/db/schema");
    await db.delete(schoolAnnouncements).where(and(eq(schoolAnnouncements.id, data.id), eq(schoolAnnouncements.schoolId, schoolId)));
    return { ok: true };
  });

// ── SCHOOL BOARD ──────────────────────────────────────────────────────────────

const setSchoolBoardSchema = z.object({ schoolId: z.number(), board: z.enum(["preschool", "generic", "CBSE", "ICSE", "State Board", "IB", "IGCSE"]) });
export const setSchoolBoard = createServerFn({ method: "POST" })
  .validator((i: unknown) => setSchoolBoardSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId: userSchoolId } = await requireAuth();
    await assertCanOperateForUser();
    if (userSchoolId !== data.schoolId) throw new Error("Not authorized");
    const { db } = await import("@/lib/db");
    const { schools } = await import("@/lib/db/schema");
    await db.update(schools).set({ board: data.board }).where(eq(schools.id, data.schoolId));
    return { ok: true };
  });

const getSchoolBoardSchema = z.object({ schoolId: z.number() });
export const getSchoolBoard = createServerFn({ method: "GET" })
  .validator((i: unknown) => getSchoolBoardSchema.parse(i))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId);
    const { db } = await import("@/lib/db");
    const { schools } = await import("@/lib/db/schema");
    const [s] = await db.select({ board: schools.board }).from(schools).where(eq(schools.id, data.schoolId)).limit(1);
    return s?.board ?? "generic";
  });

// ── GRADING SCALES ────────────────────────────────────────────────────────────

const manageGradingScaleSchema = z.object({
  id: z.number().optional(),
  board: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(50),
  minPercentage: z.number().min(0).max(100),
  maxPercentage: z.number().min(0).max(100),
  gradePoint: z.number().optional(),
});

export const manageGradingScale = createServerFn({ method: "POST" })
  .validator((i: unknown) => manageGradingScaleSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { gradingScales } = await import("@/lib/db/schema");
    if (data.id) {
      await db.update(gradingScales).set({
        board: data.board,
        name: data.name,
        minPercentage: String(data.minPercentage),
        maxPercentage: String(data.maxPercentage),
        gradePoint: data.gradePoint != null ? String(data.gradePoint) : null,
      }).where(eq(gradingScales.id, data.id));
      return { id: data.id };
    }
    const [r] = await db.insert(gradingScales).values({
      schoolId,
      board: data.board,
      name: data.name,
      minPercentage: String(data.minPercentage),
      maxPercentage: String(data.maxPercentage),
      gradePoint: data.gradePoint != null ? String(data.gradePoint) : null,
    });
    return { id: Number((r as any).insertId) };
  });

const listGradingScalesSchema = z.object({ board: z.string().optional() });
export const listGradingScales = createServerFn({ method: "GET" })
  .validator((i: unknown) => listGradingScalesSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId } = await requireAuth();
    const { db } = await import("@/lib/db");
    const { gradingScales } = await import("@/lib/db/schema");
    const conditions: any[] = [eq(gradingScales.schoolId, schoolId)];
    if (data.board) conditions.push(eq(gradingScales.board, data.board));
    return db.select().from(gradingScales)
      .where(and(...conditions))
      .orderBy(asc(gradingScales.minPercentage));
  });

const deleteGradingScaleSchema = z.object({ id: z.number() });
export const deleteGradingScale = createServerFn({ method: "POST" })
  .validator((i: unknown) => deleteGradingScaleSchema.parse(i))
  .handler(async ({ data }) => {
    const { schoolId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { gradingScales } = await import("@/lib/db/schema");
    await db.delete(gradingScales).where(and(eq(gradingScales.id, data.id), eq(gradingScales.schoolId, schoolId)));
    return { ok: true };
  });

const seedDefaultScalesSchema = z.object({ board: z.enum(["preschool", "generic", "CBSE", "ICSE", "State Board", "IB", "IGCSE"]) });

// Seed default grading scales for the selected board
export const seedDefaultGradingScales = createServerFn({ method: "POST" })
  .validator((i: unknown) => seedDefaultScalesSchema.parse(i))
  .handler(async ({ data }) => {
    if (data.board === "preschool") throw new Error("No grading scales for preschool");
    const { schoolId } = await requireAuth();
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { gradingScales } = await import("@/lib/db/schema");

    const defaults: Record<string, { name: string; min: number; max: number; gp?: number }[]> = {
      CBSE: [
        { name: "A1", min: 91, max: 100, gp: 10 },
        { name: "A2", min: 81, max: 90, gp: 9 },
        { name: "B1", min: 71, max: 80, gp: 8 },
        { name: "B2", min: 61, max: 70, gp: 7 },
        { name: "C1", min: 51, max: 60, gp: 6 },
        { name: "C2", min: 41, max: 50, gp: 5 },
        { name: "D",  min: 33, max: 40, gp: 4 },
        { name: "E",  min: 0,  max: 32, gp: 0 },
      ],
      ICSE: [
        { name: "A+", min: 90, max: 100, gp: 10 },
        { name: "A",  min: 80, max: 89,  gp: 9 },
        { name: "B+", min: 70, max: 79,  gp: 8 },
        { name: "B",  min: 60, max: 69,  gp: 7 },
        { name: "C+", min: 50, max: 59,  gp: 6 },
        { name: "C",  min: 40, max: 49,  gp: 5 },
        { name: "D",  min: 33, max: 39,  gp: 4 },
        { name: "F",  min: 0,  max: 32,  gp: 0 },
      ],
    };

    const rows = defaults[data.board];
    const existing = await db.select({ id: gradingScales.id }).from(gradingScales).where(and(eq(gradingScales.schoolId, schoolId), eq(gradingScales.board, data.board))).limit(1);
    if (existing.length) {
      // Already seeded — skip to avoid duplicates
      return { ok: true, alreadyExisted: true };
    }
    await db.insert(gradingScales).values(rows.map((r) => ({
      schoolId,
      board: data.board,
      name: r.name,
      minPercentage: String(r.min),
      maxPercentage: String(r.max),
      gradePoint: r.gp != null ? String(r.gp) : null,
    })));
    return { ok: true, alreadyExisted: false };
  });

function gradeForPercentage(pct: number, scales: { name: string; minPercentage: string | number; maxPercentage: string | number; gradePoint?: string | number | null }[]) {
  for (const s of scales) {
    const min = parseFloat(s.minPercentage as string);
    const max = parseFloat(s.maxPercentage as string);
    if (pct >= min && pct <= max) return { grade: s.name, gradePoint: s.gradePoint ? parseFloat(s.gradePoint as string) : null };
  }
  return { grade: "—", gradePoint: null };
}

// ── AUTO-GENERATED REPORT CARD (from marks, board-aware) ───────────────────────

const getReportCardDataSchema = z.object({
  studentId: z.number(),
  academicYear: z.string(),
  term: z.string(),
});

export const getReportCardData = createServerFn({ method: "GET" })
  .validator((i: unknown) => getReportCardDataSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { students, studentMarks, examSubjects, exams, subjects, classes, schools, gradingScales } = await import("@/lib/db/schema");

    const [student] = await db.select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      dateOfBirth: students.dateOfBirth,
      currentClassId: students.currentClassId,
      gender: students.gender,
      schoolId: students.schoolId,
    })
      .from(students).where(eq(students.id, data.studentId)).limit(1);

    if (!student) throw new Error("Student not found");

    const [school] = await db.select({ board: schools.board }).from(schools).where(eq(schools.id, student.schoolId)).limit(1);
    const board = school?.board ?? "generic";

    const classInfo = student.currentClassId
      ? (await db.select({ name: classes.name, ageGroup: classes.ageGroup }).from(classes).where(eq(classes.id, student.currentClassId)).limit(1))[0]
      : null;

    const scales = await db.select({
      name: gradingScales.name,
      minPercentage: gradingScales.minPercentage,
      maxPercentage: gradingScales.maxPercentage,
      gradePoint: gradingScales.gradePoint,
    }).from(gradingScales).where(and(eq(gradingScales.schoolId, student.schoolId), eq(gradingScales.board, board)));

    if (scales.length === 0 && board !== "generic") {
      // seed defaults if missing
      const defaults = {
        CBSE: [
          { name: "A1", min: 91, max: 100, gp: 10 },
          { name: "A2", min: 81, max: 90, gp: 9 },
          { name: "B1", min: 71, max: 80, gp: 8 },
          { name: "B2", min: 61, max: 70, gp: 7 },
          { name: "C1", min: 51, max: 60, gp: 6 },
          { name: "C2", min: 41, max: 50, gp: 5 },
          { name: "D",  min: 33, max: 40, gp: 4 },
          { name: "E",  min: 0,  max: 32, gp: 0 },
        ],
        ICSE: [
          { name: "A+", min: 90, max: 100, gp: 10 },
          { name: "A",  min: 80, max: 89,  gp: 9 },
          { name: "B+", min: 70, max: 79,  gp: 8 },
          { name: "B",  min: 60, max: 69,  gp: 7 },
          { name: "C+", min: 50, max: 59,  gp: 6 },
          { name: "C",  min: 40, max: 49,  gp: 5 },
          { name: "D",  min: 33, max: 39,  gp: 4 },
          { name: "F",  min: 0,  max: 32,  gp: 0 },
        ],
      }[board];
      if (defaults) {
        await db.insert(gradingScales).values(defaults.map((r) => ({
          schoolId: student.schoolId,
          board,
          name: r.name,
          minPercentage: String(r.min),
          maxPercentage: String(r.max),
          gradePoint: String(r.gp),
        })));
        scales.push(...defaults.map((r) => ({ name: r.name, minPercentage: String(r.min), maxPercentage: String(r.max), gradePoint: String(r.gp) })));
      }
    }

    // Find matching exams (any class for this year+term, in case of class changes)
    const matchingExams = await db.select({ id: exams.id })
      .from(exams)
      .where(and(
        eq(exams.schoolId, student.schoolId),
        eq(exams.academicYear, data.academicYear),
        eq(exams.term, data.term),
      ));

    const examIds = matchingExams.map((e) => e.id);
    const marksDataRaw = examIds.length
      ? await db.select({
          subjectName: subjects.name,
          maxMarks: examSubjects.maxMarks,
          marks: studentMarks.marks,
          grade: studentMarks.grade,
        })
        .from(studentMarks)
        .innerJoin(examSubjects, eq(studentMarks.examSubjectId, examSubjects.id))
        .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
        .where(and(inArray(examSubjects.examId, examIds), eq(studentMarks.studentId, data.studentId)))
      : [];

    const marksData = marksDataRaw.map((m) => {
      const max = parseFloat(m.maxMarks as string) || 0;
      const got = parseFloat(m.marks as string) || 0;
      const pct = max > 0 ? (got / max) * 100 : 0;
      const g = gradeForPercentage(pct, scales);
      return {
        subjectName: m.subjectName,
        maxMarks: m.maxMarks,
        marks: m.marks,
        percentage: Math.round(pct * 100) / 100,
        grade: m.grade ?? g.grade,
        gradePoint: g.gradePoint,
      };
    });

    const totalMax = marksData.reduce((sum, m) => sum + (parseFloat(m.maxMarks as string) || 0), 0);
    const totalGot = marksData.reduce((sum, m) => sum + (parseFloat(m.marks as string) || 0), 0);
    const percentage = totalMax > 0 ? Math.round((totalGot / totalMax) * 100) : 0;
    const overallGrade = gradeForPercentage(percentage, scales);

    return {
      student,
      board,
      className: classInfo?.name ?? null,
      ageGroup: classInfo?.ageGroup ?? null,
      academicYear: data.academicYear,
      term: data.term,
      marks: marksData,
      totalMax,
      totalGot,
      percentage,
      overallGrade: overallGrade.grade,
      overallGradePoint: overallGrade.gradePoint,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED ACADEMIC REPORT (all exams in a class+year for one student)
// ─────────────────────────────────────────────────────────────────────────────

const studentAcademicReportSchema = z.object({
  studentId: z.number(),
  classId: z.number(),
  academicYear: z.string(),
});

export const getStudentAcademicReport = createServerFn({ method: "GET" })
  .validator((i: unknown) => studentAcademicReportSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { students, studentMarks, examSubjects, exams, subjects, classes, schools, gradingScales } = await import("@/lib/db/schema");

    const [student] = await db.select({
      id: students.id, firstName: students.firstName, lastName: students.lastName,
      dateOfBirth: students.dateOfBirth, gender: students.gender, schoolId: students.schoolId,
    }).from(students).where(eq(students.id, data.studentId)).limit(1);
    if (!student) throw new Error("Student not found");

    const [school] = await db.select({
      board: schools.board, name: schools.name, logoUrl: schools.logoUrl,
      address: schools.address, city: schools.city, state: schools.state, phone: schools.phone, email: schools.email,
    }).from(schools).where(eq(schools.id, student.schoolId)).limit(1);
    const board = school?.board ?? "generic";

    const [classInfo] = await db.select({ name: classes.name, ageGroup: classes.ageGroup }).from(classes).where(eq(classes.id, data.classId)).limit(1);

    const scales = await db.select({
      name: gradingScales.name, minPercentage: gradingScales.minPercentage,
      maxPercentage: gradingScales.maxPercentage, gradePoint: gradingScales.gradePoint,
    }).from(gradingScales).where(and(eq(gradingScales.schoolId, student.schoolId), eq(gradingScales.board, board)));

    // All exams for this class+year, sorted by term
    const allExams = await db.select({
      id: exams.id, term: exams.term, examType: exams.examType,
      startDate: exams.startDate, endDate: exams.endDate,
    }).from(exams).where(and(
      eq(exams.schoolId, student.schoolId),
      eq(exams.classId, data.classId),
      eq(exams.academicYear, data.academicYear),
    )).orderBy(asc(exams.startDate));

    function assignGrade(pct: number) {
      for (const s of scales) {
        if (pct >= Number(s.minPercentage) && pct <= Number(s.maxPercentage))
          return { name: s.name, gradePoint: s.gradePoint };
      }
      return { name: "—", gradePoint: null };
    }

    let grandMax = 0, grandGot = 0;

    const examSections = await Promise.all(allExams.map(async (exam) => {
      const esRows = await db.select({
        id: examSubjects.id, subjectName: subjects.name, maxMarks: examSubjects.maxMarks,
      }).from(examSubjects)
        .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
        .where(eq(examSubjects.examId, exam.id))
        .orderBy(asc(subjects.name));

      const marksRows = esRows.length
        ? await db.select({ examSubjectId: studentMarks.examSubjectId, marks: studentMarks.marks })
          .from(studentMarks)
          .where(and(eq(studentMarks.studentId, data.studentId), inArray(studentMarks.examSubjectId, esRows.map(e => e.id))))
        : [];

      const marksMap = new Map(marksRows.map(m => [m.examSubjectId, m.marks]));

      let termMax = 0, termGot = 0;
      const subjectMarks = esRows.map(es => {
        const max = Number(es.maxMarks) || 0;
        const marksVal = marksMap.get(es.id);
        const got = marksVal !== null && marksVal !== undefined ? Number(marksVal) : null;
        const pct = got !== null && max > 0 ? Math.round((got / max) * 100) : null;
        const grade = pct !== null ? assignGrade(pct) : null;
        if (got !== null) { termMax += max; termGot += got; }
        return {
          subjectName: es.subjectName, maxMarks: es.maxMarks,
          marks: got !== null ? String(got) : null,
          percentage: pct !== null ? String(pct) : null,
          grade: grade?.name ?? null, gradePoint: grade?.gradePoint ?? null,
        };
      });

      grandMax += termMax; grandGot += termGot;
      const termPct = termMax > 0 ? Math.round((termGot / termMax) * 100) : null;
      const termGrade = termPct !== null ? assignGrade(termPct) : null;
      const hasMarks = subjectMarks.some(s => s.marks !== null);

      return {
        examId: exam.id, term: exam.term, examType: exam.examType,
        startDate: exam.startDate, endDate: exam.endDate,
        subjects: subjectMarks, hasMarks,
        termPercentage: termPct !== null ? String(termPct) : null,
        termGrade: termGrade?.name ?? null, termGradePoint: termGrade?.gradePoint ?? null,
      };
    }));

    const overallPct = grandMax > 0 ? Math.round((grandGot / grandMax) * 100) : null;
    const overallGrade = overallPct !== null ? assignGrade(overallPct) : null;

    return {
      student, board,
      schoolName: school?.name ?? null,
      schoolLogoUrl: school?.logoUrl ?? null,
      schoolAddress: school?.address ?? null,
      schoolCity: school?.city ?? null,
      schoolState: school?.state ?? null,
      schoolPhone: school?.phone ?? null,
      schoolEmail: school?.email ?? null,
      className: classInfo?.name ?? null, ageGroup: classInfo?.ageGroup ?? null,
      academicYear: data.academicYear,
      exams: examSections,
      overallPercentage: overallPct !== null ? String(overallPct) : null,
      overallGrade: overallGrade?.name ?? null, overallGradePoint: overallGrade?.gradePoint ?? null,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// ALL-YEARS ACADEMIC REPORT for a student (parent portal)
// Returns one report per academic year the student has exams in, newest first
// ─────────────────────────────────────────────────────────────────────────────

const studentAllYearsReportSchema = z.object({ studentId: z.number() });

export const getStudentAllYearsReport = createServerFn({ method: "GET" })
  .validator((i: unknown) => studentAllYearsReportSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { students, exams, classEnrollments, classes } = await import("@/lib/db/schema");

    const [student] = await db.select({ id: students.id, schoolId: students.schoolId, currentClassId: students.currentClassId })
      .from(students).where(eq(students.id, data.studentId)).limit(1);
    if (!student) throw new Error("Student not found");

    // Find all unique (classId, academicYear) combos the student has exams in
    const enrollments = await db.select({
      classId: classEnrollments.classId,
      academicYear: classEnrollments.academicYear,
      className: classes.name,
    }).from(classEnrollments)
      .innerJoin(classes, eq(classEnrollments.classId, classes.id))
      .where(eq(classEnrollments.studentId, data.studentId));

    // Also find years from exams directly (in case enrollment year is empty)
    const examYears = await db.selectDistinct({ classId: exams.classId, academicYear: exams.academicYear })
      .from(exams)
      .where(eq(exams.schoolId, student.schoolId));

    // Build unique (classId, year) set — prefer enrollment data, supplement with exam data
    const yearSet = new Map<string, { classId: number; academicYear: string; className: string }>();
    for (const en of enrollments) {
      if (!en.academicYear) continue;
      const key = `${en.classId}-${en.academicYear}`;
      yearSet.set(key, { classId: en.classId, academicYear: en.academicYear, className: en.className ?? "" });
    }
    // For current class, also check exams directly
    if (student.currentClassId) {
      for (const ey of examYears) {
        if (ey.classId !== student.currentClassId) continue;
        const key = `${ey.classId}-${ey.academicYear}`;
        if (!yearSet.has(key)) {
          const [cls] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, ey.classId)).limit(1);
          yearSet.set(key, { classId: ey.classId, academicYear: ey.academicYear, className: cls?.name ?? "" });
        }
      }
    }

    // Sort newest year first
    const sorted = [...yearSet.values()].sort((a, b) => b.academicYear.localeCompare(a.academicYear));
    if (sorted.length === 0) return [];

    // Fetch report for each year
    const reports = await Promise.all(
      sorted.map(({ classId, academicYear }) =>
        getStudentAcademicReport({ data: { studentId: data.studentId, classId, academicYear } })
          .catch(() => null)
      )
    );

    return reports.filter(Boolean);
  });

// Same but for all students in the class (admin bulk)
const consolidatedClassReportSchema = z.object({
  classId: z.number(),
  academicYear: z.string(),
});

export const getConsolidatedClassReport = createServerFn({ method: "GET" })
  .validator((i: unknown) => consolidatedClassReportSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { students, classEnrollments } = await import("@/lib/db/schema");

    const enrolled = await db.select({ id: students.id, firstName: students.firstName, lastName: students.lastName })
      .from(students)
      .innerJoin(classEnrollments, eq(classEnrollments.studentId, students.id))
      .where(and(eq(classEnrollments.classId, data.classId), eq(classEnrollments.status, "active")))
      .orderBy(asc(students.firstName));

    const results = await Promise.all(enrolled.map(async (s) => {
      try {
        // Re-use the handler logic directly
        const r = await getStudentAcademicReport({ data: { studentId: s.id, classId: data.classId, academicYear: data.academicYear } });
        return r;
      } catch {
        return { student: s, exams: [], overallPercentage: null, overallGrade: null, error: true };
      }
    }));

    return { students: results };
  });

// ─────────────────────────────────────────────────────────────────────────────
// EXAMS PAGE CONTEXT — returns role + teacher's assigned classIds
// ─────────────────────────────────────────────────────────────────────────────

export const getExamsPageContext = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireSession();
  const { db } = await import("@/lib/db");
  const { users, staff, staffClassAssignments } = await import("@/lib/db/schema");

  const [user] = await db.select({ role: users.role, schoolId: users.schoolId, locationId: users.locationId })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Not authenticated");

  const ADMIN_ROLES = ["school_admin", "location_admin", "super_admin"];
  const isAdmin = ADMIN_ROLES.includes(user.role ?? "");

  // Teachers: fetch only their assigned class IDs
  let assignedClassIds: number[] = [];
  if (!isAdmin) {
    const [staffRecord] = await db.select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.schoolId, user.schoolId), eq(staff.userId, userId)))
      .limit(1);
    if (staffRecord) {
      const rows = await db.select({ classId: staffClassAssignments.classId })
        .from(staffClassAssignments)
        .where(and(
          eq(staffClassAssignments.staffId, staffRecord.id),
          eq(staffClassAssignments.locationId, user.locationId!),
        ));
      assignedClassIds = rows.map((r) => r.classId);
    }
  }

  return { role: user.role ?? "teacher", isAdmin, assignedClassIds };
});

// ─────────────────────────────────────────────────────────────────────────────
// BULK REPORT CARD GENERATION — generates for all students in a class+exam
// ─────────────────────────────────────────────────────────────────────────────

const bulkReportCardSchema = z.object({
  classId: z.number(),
  academicYear: z.string(),
  term: z.string(),
});

export const getBulkReportCardData = createServerFn({ method: "GET" })
  .validator((i: unknown) => bulkReportCardSchema.parse(i))
  .handler(async ({ data }) => {
    await requireSession();
    const { db } = await import("@/lib/db");
    const { students, classEnrollments, studentMarks, examSubjects, exams, subjects, classes, schools, gradingScales } = await import("@/lib/db/schema");

    // All actively enrolled students in this class
    const enrolled = await db
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, schoolId: students.schoolId })
      .from(students)
      .innerJoin(classEnrollments, eq(classEnrollments.studentId, students.id))
      .where(and(
        eq(classEnrollments.classId, data.classId),
        eq(classEnrollments.status, "active"),
      ));

    if (!enrolled.length) return { students: [] };

    const firstStudent = enrolled[0];
    const [school] = await db.select({ board: schools.board }).from(schools).where(eq(schools.id, firstStudent.schoolId)).limit(1);
    const board = school?.board ?? "generic";

    const [classInfo] = await db.select({ name: classes.name, ageGroup: classes.ageGroup }).from(classes).where(eq(classes.id, data.classId)).limit(1);

    const scales = await db.select({
      name: gradingScales.name,
      minPercentage: gradingScales.minPercentage,
      maxPercentage: gradingScales.maxPercentage,
      gradePoint: gradingScales.gradePoint,
    }).from(gradingScales).where(and(eq(gradingScales.schoolId, firstStudent.schoolId), eq(gradingScales.board, board)));

    // Find matching exams for this class + year + term
    const matchingExams = await db.select({ id: exams.id })
      .from(exams)
      .where(and(
        eq(exams.schoolId, firstStudent.schoolId),
        eq(exams.classId, data.classId),
        eq(exams.academicYear, data.academicYear),
        eq(exams.term, data.term),
      ));

    const examIds = matchingExams.map((e) => e.id);

    // Fetch all exam subjects for these exams
    const allExamSubjects = examIds.length
      ? await db.select({
          id: examSubjects.id,
          subjectId: examSubjects.subjectId,
          maxMarks: examSubjects.maxMarks,
          subjectName: subjects.name,
        })
        .from(examSubjects)
        .innerJoin(subjects, eq(examSubjects.subjectId, subjects.id))
        .where(inArray(examSubjects.examId, examIds))
      : [];

    // Helper to assign grade from scale
    function assignGrade(pct: number): { name: string; gradePoint: string } | null {
      for (const s of scales) {
        if (pct >= Number(s.minPercentage) && pct <= Number(s.maxPercentage)) {
          return { name: s.name, gradePoint: s.gradePoint };
        }
      }
      return null;
    }

    const results = await Promise.all(
      enrolled.map(async (s) => {
        if (!examIds.length || !allExamSubjects.length) {
          return { student: s, className: classInfo?.name, marks: [], hasMarks: false, board, academicYear: data.academicYear, term: data.term };
        }
        const marksRows = await db.select({
          examSubjectId: studentMarks.examSubjectId,
          marks: studentMarks.marks,
          grade: studentMarks.grade,
        }).from(studentMarks).where(and(
          eq(studentMarks.studentId, s.id),
          inArray(studentMarks.examSubjectId, allExamSubjects.map((es) => es.id)),
        ));

        const marksMap = new Map(marksRows.map((m) => [m.examSubjectId, m]));

        let totalObtained = 0, totalMax = 0;
        const marksOut = allExamSubjects.map((es) => {
          const row = marksMap.get(es.id);
          const obtained = row?.marks ? Number(row.marks) : null;
          const max = Number(es.maxMarks);
          const pct = obtained !== null && max > 0 ? Math.round((obtained / max) * 100) : null;
          const g = pct !== null ? assignGrade(pct) : null;
          if (obtained !== null) { totalObtained += obtained; totalMax += max; }
          return {
            subjectName: es.subjectName,
            maxMarks: es.maxMarks,
            marks: obtained !== null ? String(obtained) : null,
            percentage: pct !== null ? String(pct) : null,
            grade: row?.grade || g?.name || null,
            gradePoint: g?.gradePoint ?? null,
          };
        });

        const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
        const overallGrade = assignGrade(percentage);

        return {
          student: s,
          className: classInfo?.name,
          marks: marksOut,
          hasMarks: marksOut.some((m) => m.marks !== null),
          board,
          academicYear: data.academicYear,
          term: data.term,
          percentage: String(percentage),
          overallGrade: overallGrade?.name ?? "—",
          overallGradePoint: overallGrade?.gradePoint ?? null,
        };
      })
    );

    return { students: results };
  });

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM RAZORPAY — school subscription billing
// ─────────────────────────────────────────────────────────────────────────────

function getPlatformRazorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Platform Razorpay is not configured");
  return { keyId, keySecret };
}

export const getSchoolSubscriptionBilling = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireSession();
  const { db } = await import("@/lib/db");
  const { users, schools, subscriptions, plans } = await import("@/lib/db/schema");

  const [me] = await db.select({ schoolId: users.schoolId, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!me) throw new Error("Not authenticated");
  if (me.role !== "school_admin" && me.role !== "super_admin") throw new Error("Not authorized");

  const [school] = await db.select({
    id: schools.id,
    name: schools.name,
    email: schools.email,
    plan: schools.plan,
    status: schools.status,
  }).from(schools).where(eq(schools.id, me.schoolId)).limit(1);
  if (!school) throw new Error("School not found");

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.schoolId, school.id)).limit(1);
  const [plan] = sub ? await db.select({ name: plans.name, price: plans.price, period: plans.period }).from(plans).where(eq(plans.id, sub.planId)).limit(1) : [null];

  return { school, subscription: sub ?? null, plan };
});

const createPlatformRazorpayOrderSchema = z.object({
  subscriptionId: z.number(),
});

export const createPlatformRazorpayOrder = createServerFn({ method: "POST" })
  .validator((input: unknown) => createPlatformRazorpayOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await requireSession();
    const { db } = await import("@/lib/db");
    const { users, subscriptions, subscriptionPayments } = await import("@/lib/db/schema");

    const [me] = await db.select({ schoolId: users.schoolId, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me) throw new Error("Not authenticated");
    if (me.role !== "school_admin" && me.role !== "super_admin") throw new Error("Not authorized");

    const [sub] = await db.select().from(subscriptions)
      .where(and(eq(subscriptions.id, data.subscriptionId), eq(subscriptions.schoolId, me.schoolId)))
      .limit(1);
    if (!sub) throw new Error("Subscription not found");

    const amount = Number(sub.amount ?? 0);
    if (amount <= 0) throw new Error("This subscription is free — no payment needed");

    const { keyId, keySecret } = getPlatformRazorpayKeys();
    const amountPaise = Math.round(amount * 100);
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

    const [paymentRow] = await db.insert(subscriptionPayments).values({
      schoolId: me.schoolId,
      subscriptionId: sub.id,
      amount: String(amount),
      currency: sub.currency ?? "INR",
      status: "pending",
    });
    const subscriptionPaymentId = Number((paymentRow as any).insertId);

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        amount: amountPaise,
        currency: sub.currency ?? "INR",
        receipt: `sub_${subscriptionPaymentId}`,
        notes: { subscriptionPaymentId: subscriptionPaymentId, subscriptionId: sub.id },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      await db.delete(subscriptionPayments).where(eq(subscriptionPayments.id, subscriptionPaymentId));
      throw new Error(`Razorpay order creation failed: ${err}`);
    }

    const order = await res.json() as { id: string };
    await db.update(subscriptionPayments).set({ razorpayOrderId: order.id }).where(eq(subscriptionPayments.id, subscriptionPaymentId));

    return { orderId: order.id, amount: amountPaise, keyId, subscriptionPaymentId };
  });

const verifyPlatformRazorpayPaymentSchema = z.object({
  subscriptionPaymentId: z.number(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

export const verifyPlatformRazorpayPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => verifyPlatformRazorpayPaymentSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { subscriptionPayments, subscriptions } = await import("@/lib/db/schema");

    const [payment] = await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.id, data.subscriptionPaymentId)).limit(1);
    if (!payment) throw new Error("Payment record not found");
    if (payment.razorpayOrderId && payment.razorpayOrderId !== data.razorpayOrderId) {
      throw new Error("Order ID mismatch");
    }

    const { keySecret } = getPlatformRazorpayKeys();
    const { createHmac } = await import("node:crypto");
    const expectedSig = createHmac("sha256", keySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest("hex");

    if (expectedSig !== data.razorpaySignature) {
      throw new Error("Payment signature verification failed");
    }

    const now = new Date();
    await db.update(subscriptionPayments).set({
      status: "captured",
      paidAt: now,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
    }).where(eq(subscriptionPayments.id, data.subscriptionPaymentId));

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, payment.subscriptionId)).limit(1);
    if (sub) {
      const periodStart = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : now;
      const periodEnd = new Date(periodStart);
      if (sub.billingCycle === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      else if (sub.billingCycle === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
      else if (sub.billingCycle === "lifetime") periodEnd.setFullYear(periodEnd.getFullYear() + 100);

      await db.update(subscriptions).set({
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      }).where(eq(subscriptions.id, sub.id));
    }

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// HOLIDAYS / EVENTS
// ─────────────────────────────────────────────────────────────────────────────

const listHolidaysSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const listHolidays = createServerFn({ method: "GET" })
  .validator((input: unknown) => listHolidaysSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { holidays, users, staffClassAssignments, parents, students } = await import("@/lib/db/schema");

    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const [user] = await db
      .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "super_admin") {
      if (user.schoolId !== data.schoolId) throw new Error("Not authorized");
      if (!SCHOOL_WIDE_ROLES.has(user.role ?? "") && user.locationId !== data.locationId) throw new Error("Not authorized");
    }

    const base = [eq(holidays.schoolId, data.schoolId), eq(holidays.locationId, data.locationId)];
    if (data.fromDate) base.push(gte(holidays.date, new Date(data.fromDate)));
    if (data.toDate) base.push(lte(holidays.date, new Date(data.toDate)));

    let rows: any[] = [];

    if (["super_admin", "school_admin", "location_admin", "accountant"].includes(user.role ?? "")) {
      rows = await db.select().from(holidays).where(and(...base)).orderBy(asc(holidays.date));
    } else if (user.role === "teacher" || user.role === "staff") {
      const assignments = await db
        .select({ classId: staffClassAssignments.classId })
        .from(staffClassAssignments)
        .where(eq(staffClassAssignments.staffId, userId));
      const classIds = assignments.map((a) => a.classId);
      const conditions: any[] = [...base, or(isNull(holidays.classId), inArray(holidays.classId, classIds))];
      rows = await db.select().from(holidays).where(and(...conditions)).orderBy(asc(holidays.date));
    } else if (user.role === "parent") {
      const children = await db
        .select({ classId: students.currentClassId })
        .from(parents)
        .innerJoin(students, eq(parents.studentId, students.id))
        .where(and(eq(parents.email, user.email ?? ""), eq(students.schoolId, data.schoolId), eq(students.locationId, data.locationId)));
      const classIds = children.map((c) => c.classId).filter(Boolean) as number[];
      const conditions: any[] = [...base, or(isNull(holidays.classId), inArray(holidays.classId, classIds))];
      rows = await db.select().from(holidays).where(and(...conditions)).orderBy(asc(holidays.date));
    } else {
      throw new Error("Not authorized");
    }

    return rows.map((h) => ({
      ...h,
      date: h.date.toISOString().slice(0, 10),
      createdAt: h.createdAt?.toISOString() ?? null,
      updatedAt: h.updatedAt?.toISOString() ?? null,
    }));
  });

const addHolidaySchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  classId: z.number().optional(),
  name: z.string().trim().min(1).max(255),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  type: z.enum(["holiday", "event", "exam", "other"]).default("holiday"),
  description: z.string().max(1000).optional(),
  isRecurring: z.boolean().default(false),
});

export const addHoliday = createServerFn({ method: "POST" })
  .validator((input: unknown) => addHolidaySchema.parse(input))
  .handler(async ({ data }) => {
    await requireAuth(data.schoolId, data.locationId);
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { holidays } = await import("@/lib/db/schema");

    const [res] = await db.insert(holidays).values({
      schoolId: data.schoolId,
      locationId: data.locationId,
      classId: data.classId ?? null,
      name: data.name,
      date: new Date(data.date),
      type: data.type,
      description: data.description || null,
      isRecurring: data.isRecurring ? 1 : 0,
    });

    return { ok: true, id: Number((res as any).insertId) };
  });

const updateHolidaySchema = z.object({
  holidayId: z.number(),
  classId: z.number().optional(),
  name: z.string().trim().min(1).max(255),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["holiday", "event", "exam", "other"]).default("holiday"),
  description: z.string().max(1000).optional(),
  isRecurring: z.boolean().default(false),
});

export const updateHoliday = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateHolidaySchema.parse(input))
  .handler(async ({ data }) => {
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { holidays } = await import("@/lib/db/schema");

    await db
      .update(holidays)
      .set({
        classId: data.classId ?? null,
        name: data.name,
        date: new Date(data.date),
        type: data.type,
        description: data.description || null,
        isRecurring: data.isRecurring ? 1 : 0,
      })
      .where(eq(holidays.id, data.holidayId));

    return { ok: true };
  });

const deleteHolidaySchema = z.object({
  holidayId: z.number(),
});

export const deleteHoliday = createServerFn({ method: "POST" })
  .validator((input: unknown) => deleteHolidaySchema.parse(input))
  .handler(async ({ data }) => {
    await assertCanOperateForUser();
    const { db } = await import("@/lib/db");
    const { holidays } = await import("@/lib/db/schema");
    await db.delete(holidays).where(eq(holidays.id, data.holidayId));
    return { ok: true };
  });

const getUpcomingHolidaysSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
});

export const getUpcomingHolidays = createServerFn({ method: "GET" })
  .validator((input: unknown) => getUpcomingHolidaysSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db");
    const { holidays, users, staffClassAssignments, parents, students } = await import("@/lib/db/schema");

    // Read user from session
    const req = getRequest();
    const cookieHeader = req?.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) throw new Error("Not authenticated");

    const { payload } = await verifySessionToken(token);
    const userId = Number(payload.userId);
    if (!userId) throw new Error("Not authenticated");

    const [user] = await db
      .select({ id: users.id, role: users.role, schoolId: users.schoolId, locationId: users.locationId, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "super_admin") {
      if (user.schoolId !== data.schoolId) throw new Error("Not authorized");
      if (!SCHOOL_WIDE_ROLES.has(user.role ?? "") && user.locationId !== data.locationId) throw new Error("Not authorized");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const base = and(
      eq(holidays.schoolId, data.schoolId),
      eq(holidays.locationId, data.locationId),
      gte(holidays.date, today),
      lte(holidays.date, nextMonth)
    );

    let rows: any[] = [];

    if (["super_admin", "school_admin", "location_admin", "accountant"].includes(user.role ?? "")) {
      // Admins see all branch holidays + class-specific ones
      rows = await db.select().from(holidays).where(base).orderBy(asc(holidays.date));
    } else if (user.role === "teacher" || user.role === "staff") {
      // Teachers see branch-wide + classes they are assigned to
      const assignments = await db
        .select({ classId: staffClassAssignments.classId })
        .from(staffClassAssignments)
        .where(eq(staffClassAssignments.staffId, userId));
      const classIds = assignments.map((a) => a.classId);
      const conditions: any[] = [base, or(isNull(holidays.classId), inArray(holidays.classId, classIds))];
      rows = await db.select().from(holidays).where(and(...conditions)).orderBy(asc(holidays.date));
    } else if (user.role === "parent") {
      // Parents see branch-wide + their children's classes
      const children = await db
        .select({ classId: students.currentClassId })
        .from(parents)
        .innerJoin(students, eq(parents.studentId, students.id))
        .where(and(eq(parents.email, user.email ?? ""), eq(students.schoolId, data.schoolId), eq(students.locationId, data.locationId)));
      const classIds = children.map((c) => c.classId).filter(Boolean) as number[];
      const conditions: any[] = [base, or(isNull(holidays.classId), inArray(holidays.classId, classIds))];
      rows = await db.select().from(holidays).where(and(...conditions)).orderBy(asc(holidays.date));
    } else {
      throw new Error("Not authorized");
    }

    return rows.map((h) => ({
      ...h,
      date: h.date.toISOString().slice(0, 10),
    }));
  });

// ─────────────────────────────────────────────────────────────────────────────
// DAYCARE SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

const listDaycareSessionsSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  classId: z.number().optional(),
});

export const listDaycareSessions = createServerFn({ method: "GET" })
  .validator((input: unknown) => listDaycareSessionsSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireAuth(data.schoolId, data.locationId);
    const allowed = ["super_admin", "school_admin", "location_admin", "teacher", "staff", "receptionist"];
    if (!allowed.includes(user.role ?? "")) throw new Error("Not authorized");
    if (user.role !== "super_admin") await assertDaycareEnabled(data.schoolId);
    await assertCanOperateForUser();

    const { db } = await import("@/lib/db");
    const { students, classes, daycareSessions } = await import("@/lib/db/schema");

    const base = and(
      eq(students.schoolId, data.schoolId),
      eq(students.locationId, data.locationId),
      eq(students.status, "enrolled")
    );

    const rows = await db
      .select({
        studentId: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        currentClassId: students.currentClassId,
        className: classes.name,
        classEndTime: classes.endTime,
        sessionId: daycareSessions.id,
        inTime: daycareSessions.inTime,
        outTime: daycareSessions.outTime,
        notes: daycareSessions.notes,
      })
      .from(students)
      .leftJoin(classes, eq(students.currentClassId, classes.id))
      .leftJoin(
        daycareSessions,
        and(
          eq(daycareSessions.studentId, students.id),
          eq(daycareSessions.sessionDate, new Date(data.sessionDate))
        )
      )
      .where(data.classId ? and(base, eq(students.currentClassId, data.classId)) : base)
      .orderBy(students.firstName, students.lastName);

    const loc = await db
      .select({ facilityType: (await import("@/lib/db/schema")).locations.facilityType })
      .from((await import("@/lib/db/schema")).locations)
      .where(and(eq((await import("@/lib/db/schema")).locations.schoolId, data.schoolId), eq((await import("@/lib/db/schema")).locations.id, data.locationId)))
      .limit(1);
    const facilityType = loc[0]?.facilityType ?? "school";

    function timeToMin(t: string | null) {
      if (!t || !t.includes(":")) return null;
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    }

    return rows.map((r) => {
      const inM = timeToMin(r.inTime);
      const outM = timeToMin(r.outTime);
      const classEndM = timeToMin(r.classEndTime);
      let daycareMinutes = 0;
      if (inM != null && outM != null && outM > inM) {
        if (facilityType === "daycare") {
          daycareMinutes = outM - inM;
        } else if (classEndM != null) {
          const startM = Math.max(inM, classEndM);
          if (outM > startM) daycareMinutes = outM - startM;
        }
      }
      return {
        ...r,
        facilityType,
        daycareMinutes,
        daycareHours: +(daycareMinutes / 60).toFixed(2),
      };
    });
  });

const saveDaycareSessionsSchema = z.object({
  schoolId: z.number(),
  locationId: z.number(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessions: z.array(z.object({
    studentId: z.number(),
    sessionId: z.number().optional(),
    inTime: z.string().max(10).optional().or(z.literal("")),
    outTime: z.string().max(10).optional().or(z.literal("")),
    notes: z.string().max(1000).optional().or(z.literal("")),
  })),
});

export const saveDaycareSessions = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveDaycareSessionsSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireAuth(data.schoolId, data.locationId);
    const allowed = ["super_admin", "school_admin", "location_admin", "teacher", "staff", "receptionist"];
    if (!allowed.includes(user.role ?? "")) throw new Error("Not authorized");
    if (user.role !== "super_admin") await assertDaycareEnabled(data.schoolId);
    await assertCanOperateForUser();

    const { db } = await import("@/lib/db");
    const { daycareSessions } = await import("@/lib/db/schema");

    function validTime(t?: string) {
      return t && /^([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(t) ? t : null;
    }

    for (const s of data.sessions) {
      const inTime = validTime(s.inTime ?? undefined);
      const outTime = validTime(s.outTime ?? undefined);
      const notes = s.notes || null;

      if (s.sessionId) {
        if (!inTime && !outTime) {
          await db.delete(daycareSessions).where(eq(daycareSessions.id, s.sessionId));
        } else {
          await db
            .update(daycareSessions)
            .set({ inTime, outTime, notes, recordedBy: user.userId })
            .where(eq(daycareSessions.id, s.sessionId));
        }
      } else if (inTime || outTime) {
        await db.insert(daycareSessions).values({
          schoolId: data.schoolId,
          locationId: data.locationId,
          studentId: s.studentId,
          sessionDate: new Date(data.sessionDate),
          inTime,
          outTime,
          notes,
          recordedBy: user.userId,
        });
      }
    }

    return { ok: true };
  });

