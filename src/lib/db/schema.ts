import {
  mysqlTable,
  int,
  varchar,
  text,
  datetime,
  decimal,
  date,
  mysqlEnum,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

// ── Multi-tenant core ─────────────────────────────────────────────────────────
export const schools = mysqlTable("schools", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  logoUrl: varchar("logo_url", { length: 500 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  pincode: varchar("pincode", { length: 20 }),
  country: varchar("country", { length: 100 }).default("India"),
  currency: varchar("currency", { length: 10 }).default("INR"),
  plan: varchar("plan", { length: 50 }).default("free"),
  board: varchar("board", { length: 20 }).default("generic"), // CBSE, ICSE, IB, STATE, etc.
  razorpayKeyId: varchar("razorpay_key_id", { length: 255 }),
  razorpayKeySecret: varchar("razorpay_key_secret", { length: 255 }),
  maxLocations: int("max_locations").default(1),
  maxStudents:  int("max_students").default(50),
  maxStaff:     int("max_staff").default(3),
  feeCutoffDay: int("fee_cutoff_day").notNull().default(20),
  status: mysqlEnum("status", ["active", "suspended", "pending", "archived"]).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const locations = mysqlTable("locations", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  pincode: varchar("pincode", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  capacity: int("capacity"),
  facilityType: mysqlEnum("facility_type", ["school", "daycare", "both"]).default("school"),
  status: mysqlEnum("status", ["active", "inactive"]).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueBranchName: uniqueIndex("locations_school_name").on(t.schoolId, t.name),
}));

export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").references(() => locations.id),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  role: mysqlEnum("role", [
    "super_admin",
    "school_admin",
    "location_admin",
    "teacher",
    "staff",
    "receptionist",
    "parent",
    "accountant",
  ]).default("staff"),
  status: mysqlEnum("status", ["active", "inactive", "invited", "suspended"]).default("invited"),
  emailConfirmed: int("email_confirmed").default(0).notNull(),
  lastLogin: datetime("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// ── OTPs / confirmation tokens ────────────────────────────────────────────────
export const otps = mysqlTable("otps", {
  id:         int("id").primaryKey().autoincrement(),
  email:      varchar("email", { length: 255 }).notNull(),
  code:       varchar("code", { length: 128 }).notNull(),
  type:       mysqlEnum("type", ["email_confirm", "password_reset"]).default("email_confirm").notNull(),
  expiresAt:  datetime("expires_at").notNull(),
  used:       int("used").default(0).notNull(),
  createdAt:  timestamp("created_at").defaultNow(),
});

// ── Classes & Rooms ─────────────────────────────────────────────────────────
export const classes = mysqlTable("classes", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  name: varchar("name", { length: 255 }).notNull(),
  ageGroup: varchar("age_group", { length: 100 }).notNull(),
  roomName: varchar("room_name", { length: 255 }),
  capacity: int("capacity").notNull(),
  startTime: varchar("start_time", { length: 10 }),
  endTime: varchar("end_time", { length: 10 }),
  status: mysqlEnum("status", ["active", "inactive"]).default("active"),
  academicYear: varchar("academic_year", { length: 20 }),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueClassName: uniqueIndex("classes_school_location_name").on(t.schoolId, t.locationId, t.name),
}));

// ── Admissions & Enrollment ─────────────────────────────────────────────────
export const inquiries = mysqlTable("inquiries", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  parentName: varchar("parent_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  childName: varchar("child_name", { length: 255 }).notNull(),
  childDob: date("child_dob"),
  programInterest: varchar("program_interest", { length: 100 }),
  source: varchar("source", { length: 100 }),
  status: mysqlEnum("status", ["new", "contacted", "tour_scheduled", "applied", "waitlisted", "rejected", "enrolled"]).default("new"),
  studentId: int("student_id").references(() => students.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const waitlist = mysqlTable("waitlist", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  inquiryId: int("inquiry_id").notNull().references(() => inquiries.id),
  priority: int("priority").default(0),
  position: int("position").default(0),
  status: mysqlEnum("status", ["active", "offered", "joined", "declined", "expired"]).default("active"),
  addedAt: timestamp("added_at").defaultNow(),
}, (t) => ({
  uniqueInquiryWaitlist: uniqueIndex("waitlist_inquiry").on(t.inquiryId),
}));

// ── Students / Children ─────────────────────────────────────────────────────
export const students = mysqlTable("students", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  admissionNumber: varchar("admission_number", { length: 50 }),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  nickName: varchar("nick_name", { length: 100 }),
  dateOfBirth: date("date_of_birth"),
  gender: mysqlEnum("gender", ["male", "female", "other", "prefer_not_to_say"]),
  bloodGroup: varchar("blood_group", { length: 10 }),
  nationality: varchar("nationality", { length: 100 }),
  religion: varchar("religion", { length: 100 }),
  category: mysqlEnum("category", ["general", "obc", "sc", "st", "ews", "other"]),
  aadharNumber: varchar("aadhar_number", { length: 20 }),
  birthCertificateNumber: varchar("birth_certificate_number", { length: 100 }),
  // Academic
  academicYear: varchar("academic_year", { length: 20 }),
  previousSchoolName: varchar("previous_school_name", { length: 255 }),
  previousSchoolTC: varchar("previous_school_tc", { length: 100 }),
  medium: mysqlEnum("medium", ["english", "hindi", "regional", "other"]),
  // Daycare-specific
  daycareType: mysqlEnum("daycare_type", ["full_day", "half_day", "extended_hour", "not_enrolled"]).default("not_enrolled"),
  daycareDays: varchar("daycare_days", { length: 200 }), // comma-separated e.g. "Mon,Tue,Wed"
  authorizedPickupPersons: text("authorized_pickup_persons"), // JSON array of {name, relation, phone}
  mealPreference: mysqlEnum("meal_preference", ["veg", "non_veg", "jain", "vegan", "no_preference"]).default("no_preference"),
  // Transport
  transportRequired: int("transport_required").default(0),
  transportRoute: varchar("transport_route", { length: 255 }),
  // Sibling
  siblingStudentId: int("sibling_student_id"),
  // Consents
  photoVideoConsent: int("photo_video_consent").default(0),
  medicalTreatmentConsent: int("medical_treatment_consent").default(0),
  dataPrivacyConsent: int("data_privacy_consent").default(0),
  // Misc
  photoUrl: varchar("photo_url", { length: 500 }),
  status: mysqlEnum("status", ["inquiry", "applied", "waitlisted", "enrolled", "graduated", "withdrawn"]).default("inquiry"),
  currentClassId: int("current_class_id").references(() => classes.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => ({
  uniqueAdmissionNumber: uniqueIndex("students_school_admission_number").on(t.schoolId, t.admissionNumber),
}));

export const parents = mysqlTable("parents", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  studentId: int("student_id").notNull().references(() => students.id),
  relation: mysqlEnum("relation", ["mother", "father", "guardian", "other"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  alternatePhone: varchar("alternate_phone", { length: 50 }),
  address: text("address"),
  // Professional details (from daycare form)
  qualification: varchar("qualification", { length: 255 }),
  occupation: varchar("occupation", { length: 255 }),
  organisation: varchar("organisation", { length: 255 }),
  designation: varchar("designation", { length: 255 }),
  officeAddress: text("office_address"),
  officePhone: varchar("office_phone", { length: 50 }),
  workTimings: varchar("work_timings", { length: 100 }),
  aadharNumber: varchar("aadhar_number", { length: 20 }),
  annualIncome: varchar("annual_income", { length: 50 }),
  isPrimary: int("is_primary").default(0),
  isEmergency: int("is_emergency").default(0),
  userId: int("user_id").references(() => users.id),
}, (t) => ({
  uniqueParentStudent: uniqueIndex("parents_student_email").on(t.studentId, t.email),
}));

export const emergencyContacts = mysqlTable("emergency_contacts", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  studentId: int("student_id").notNull().references(() => students.id),
  name: varchar("name", { length: 255 }).notNull(),
  relation: varchar("relation", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
}, (t) => ({
  uniqueEmergencyContact: uniqueIndex("emergency_contacts_student_phone").on(t.studentId, t.phone),
}));

export const medicalNotes = mysqlTable("medical_notes", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  studentId: int("student_id").notNull().references(() => students.id),
  allergies: text("allergies"),         // food, medicine, other
  conditions: text("conditions"),       // chronic/recurring illnesses
  medications: text("medications"),     // daily medications
  specialNeeds: text("special_needs"),  // physical, learning, speech disabilities
  immunizationRecord: text("immunization_record"), // free-text or JSON summary
  doctorName: varchar("doctor_name", { length: 255 }),
  doctorPhone: varchar("doctor_phone", { length: 50 }),
  doctorAddress: text("doctor_address"),
  notes: text("notes"),
});

// ── Fee Management ──────────────────────────────────────────────────────────
export const feeStructures = mysqlTable("fee_structures", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  classId: int("class_id").references(() => classes.id),
  feeType: mysqlEnum("fee_type", ["school", "daycare_hourly", "daycare_monthly"]).default("school"),
  name: varchar("name", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  frequency: mysqlEnum("frequency", ["monthly", "quarterly", "annually", "one_time", "hourly"]).default("monthly"),
  dueDay: int("due_day").default(1),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueFeeName: uniqueIndex("fee_structures_school_location_class_name").on(t.schoolId, t.locationId, t.classId, t.name),
}));

export const invoices = mysqlTable("invoices", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  studentId: int("student_id").notNull().references(() => students.id),
  feeStructureId: int("fee_structure_id").references(() => feeStructures.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: date("due_date"),
  status: mysqlEnum("status", ["draft", "sent", "paid", "overdue", "cancelled", "refunded"]).default("draft"),
  paidAt: datetime("paid_at"),
  paidMethod: mysqlEnum("paid_method", ["cash", "razorpay", "bank_transfer", "cheque", "other"]),
  paidNotes: text("paid_notes"),
  razorpayOrderId: varchar("razorpay_order_id", { length: 255 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 255 }),
  generatedMonth: varchar("generated_month", { length: 7 }), // "YYYY-MM" for dedup of auto-generated invoices
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueAutoInvoice: uniqueIndex("invoices_school_student_fee_month").on(t.schoolId, t.studentId, t.feeStructureId, t.generatedMonth),
}));

export const payments = mysqlTable("payments", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  invoiceId: int("invoice_id").notNull().references(() => invoices.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  method: mysqlEnum("method", ["cash", "bank_transfer", "razorpay", "cheque", "other"]),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 255 }),
  paidAt: timestamp("paid_at").defaultNow(),
}, (t) => ({
  uniqueRazorpayPayment: uniqueIndex("payments_razorpay_id").on(t.razorpayPaymentId),
}));

// ── Daycare Sessions ──────────────────────────────────────────────────────────
export const daycareSessions = mysqlTable("daycare_sessions", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  studentId: int("student_id").notNull().references(() => students.id),
  sessionDate: date("session_date").notNull(),
  inTime: varchar("in_time", { length: 10 }),
  outTime: varchar("out_time", { length: 10 }),
  recordedBy: int("recorded_by").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => ({
  uniqueDaycareSession: uniqueIndex("daycare_sessions_school_location_student_date").on(t.schoolId, t.locationId, t.studentId, t.sessionDate),
}));

// ── Staff / Teachers ────────────────────────────────────────────────────────
export const staff = mysqlTable("staff", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  role: mysqlEnum("role", ["teacher", "assistant", "admin", "principal", "support"]).default("teacher"),
  joinDate: date("join_date"),
  salary: decimal("salary", { precision: 12, scale: 2 }),
  status: mysqlEnum("status", ["active", "inactive", "terminated", "on_leave"]).default("active"),
  backgroundCheckStatus: mysqlEnum("background_check_status", ["pending", "in_progress", "verified", "rejected", "expired"]).default("pending"),
  backgroundCheckDocUrl: varchar("background_check_doc_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueStaffEmail: uniqueIndex("staff_school_email").on(t.schoolId, t.email),
}));

export const staffAttendance = mysqlTable("staff_attendance", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  staffId: int("staff_id").notNull().references(() => staff.id),
  date: date("date").notNull(),
  status: mysqlEnum("status", ["present", "absent", "half_day", "leave"]).notNull(),
  notes: text("notes"),
}, (t) => ({
  uniqueStaffAttendance: uniqueIndex("staff_attendance_staff_date").on(t.staffId, t.date),
}));

export const studentAttendance = mysqlTable("student_attendance", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  classId: int("class_id").notNull().references(() => classes.id),
  studentId: int("student_id").notNull().references(() => students.id),
  date: date("date").notNull(),
  status: mysqlEnum("status", ["present", "absent", "half_day", "leave"]).notNull().default("present"),
  markedBy: int("marked_by").references(() => staff.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueStudentAttendance: uniqueIndex("student_attendance_student_date").on(t.studentId, t.date),
}));

// ── Attendance Sessions ───────────────────────────────────────────────────────
// One row per class+date where attendance was actually taken.
// If this row exists but a student has no record → they are Present.
// If this row doesn't exist → attendance was never taken (show "Not marked").
export const attendanceSessions = mysqlTable("attendance_sessions", {
  id:         int("id").primaryKey().autoincrement(),
  schoolId:   int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  classId:    int("class_id").notNull().references(() => classes.id),
  date:       date("date").notNull(),
  markedBy:   int("marked_by").references(() => staff.id),
  createdAt:  timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueAttendanceSession: uniqueIndex("attendance_sessions_class_date").on(t.classId, t.date),
}));

export const staffClassAssignments = mysqlTable("staff_class_assignments", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  staffId: int("staff_id").notNull().references(() => staff.id),
  classId: int("class_id").notNull().references(() => classes.id),
  academicYear: varchar("academic_year", { length: 20 }),
}, (t) => ({
  uniqueStaffClass: uniqueIndex("staff_class_assignments_staff_class").on(t.staffId, t.classId, t.academicYear),
}));

// ── Staff Payroll ────────────────────────────────────────────────────────────
export const staffPayroll = mysqlTable("staff_payroll", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  staffId: int("staff_id").notNull().references(() => staff.id),
  month: varchar("month", { length: 7 }).notNull(), // "YYYY-MM"
  basicSalary: decimal("basic_salary", { precision: 12, scale: 2 }).notNull(),
  deductions: decimal("deductions", { precision: 12, scale: 2 }).default("0"),
  bonus: decimal("bonus", { precision: 12, scale: 2 }).default("0"),
  netSalary: decimal("net_salary", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid"]).default("pending"),
  paidAt: datetime("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniquePayroll: uniqueIndex("staff_payroll_staff_month").on(t.staffId, t.month),
}));

// ── Class Enrollments ───────────────────────────────────────────────────────
export const classEnrollments = mysqlTable("class_enrollments", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  studentId: int("student_id").notNull().references(() => students.id),
  classId: int("class_id").notNull().references(() => classes.id),
  academicYear: varchar("academic_year", { length: 20 }),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  status: mysqlEnum("status", ["active", "promoted", "withdrawn"]).default("active"),
}, (t) => ({
  uniqueEnrollment: uniqueIndex("class_enrollments_student_class_year").on(t.studentId, t.classId, t.academicYear),
}));

// ── Report Cards ──────────────────────────────────────────────────────────────
export const reportCards = mysqlTable("report_cards", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  studentId: int("student_id").notNull().references(() => students.id),
  academicYear: varchar("academic_year", { length: 20 }).notNull(), // e.g. "2025-26"
  classId: int("class_id").references(() => classes.id),
  term: varchar("term", { length: 100 }).notNull(), // e.g. "Term 1", "Q1", "Annual"
  r2Key: varchar("r2_key", { length: 500 }),
  publicUrl: varchar("public_url", { length: 500 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (t) => ({
  uniqueReportCard: uniqueIndex("report_cards_student_year_term").on(t.studentId, t.academicYear, t.term),
}));

// ── Subjects ──────────────────────────────────────────────────────────────────
export const subjects = mysqlTable("subjects", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  name: varchar("name", { length: 100 }).notNull(), // e.g. "Mathematics"
  code: varchar("code", { length: 20 }),             // e.g. "MATH"
  status: mysqlEnum("status", ["active", "inactive"]).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueSubjectName: uniqueIndex("subjects_school_name").on(t.schoolId, t.name),
}));

// ── Class-Subject assignments ────────────────────────────────────────────────
export const classSubjects = mysqlTable("class_subjects", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  classId: int("class_id").notNull().references(() => classes.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueClassSubject: uniqueIndex("class_subjects_class_subject").on(t.classId, t.subjectId),
}));

// ── Timetable (periods per class/day) ─────────────────────────────────────────
export const timetable = mysqlTable("timetable", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  classId: int("class_id").notNull().references(() => classes.id),
  dayOfWeek: int("day_of_week").notNull(), // 1 = Monday ... 7 = Sunday
  periodNumber: int("period_number").notNull(),
  startTime: varchar("start_time", { length: 10 }),   // "09:00"
  endTime: varchar("end_time", { length: 10 }),       // "09:45"
  subjectId: int("subject_id").references(() => subjects.id),
  teacherId: int("teacher_id").references(() => staff.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueClassDayPeriod: uniqueIndex("timetable_class_day_period").on(t.classId, t.dayOfWeek, t.periodNumber),
}));

// ── Exams / Assessments ───────────────────────────────────────────────────────
export const exams = mysqlTable("exams", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  classId: int("class_id").notNull().references(() => classes.id),
  academicYear: varchar("academic_year", { length: 20 }).notNull(),
  term: varchar("term", { length: 100 }).notNull(), // e.g. "Term 1", "Half-Yearly", "Final"
  examType: varchar("exam_type", { length: 50 }).default("regular"), // "unit", "term", "final", "assignment"
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Exam-Subject mapping (subjects in an exam with max marks) ─────────────────
export const examSubjects = mysqlTable("exam_subjects", {
  id: int("id").primaryKey().autoincrement(),
  examId: int("exam_id").notNull().references(() => exams.id),
  subjectId: int("subject_id").notNull().references(() => subjects.id),
  maxMarks: decimal("max_marks", { precision: 6, scale: 2 }).notNull(),
  examDate: date("exam_date"),
  status: mysqlEnum("status", ["active", "cancelled"]).default("active"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueExamSubject: uniqueIndex("exam_subjects_exam_subject").on(t.examId, t.subjectId),
}));

// ── Student Marks ─────────────────────────────────────────────────────────────
export const studentMarks = mysqlTable("student_marks", {
  id: int("id").primaryKey().autoincrement(),
  studentId: int("student_id").notNull().references(() => students.id),
  examSubjectId: int("exam_subject_id").notNull().references(() => examSubjects.id),
  marks: decimal("marks", { precision: 6, scale: 2 }),
  grade: varchar("grade", { length: 10 }),
  notes: text("notes"),
  markedBy: int("marked_by").references(() => staff.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => ({
  uniqueStudentExamSubject: uniqueIndex("student_marks_student_exam").on(t.studentId, t.examSubjectId),
}));

// ── Expenses ─────────────────────────────────────────────────────────────────
export const expenses = mysqlTable("expenses", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  category: varchar("category", { length: 100 }).notNull(), // salary, electricity, rent, supplies, other
  description: text("description"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  expenseDate: date("expense_date"),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Grading Scales (per board + school) ───────────────────────────────────────
export const gradingScales = mysqlTable("grading_scales", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  board: varchar("board", { length: 20 }).notNull(), // CBSE, ICSE, generic
  name: varchar("name", { length: 50 }).notNull(),   // e.g. "A1", "A+", "First"
  minPercentage: decimal("min_percentage", { precision: 5, scale: 2 }).notNull(),
  maxPercentage: decimal("max_percentage", { precision: 5, scale: 2 }).notNull(),
  gradePoint: decimal("grade_point", { precision: 4, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqueGradeScale: uniqueIndex("grading_scales_school_board_name").on(t.schoolId, t.board, t.name),
}));

// ── School Announcements (school / branch notices) ─────────────────────────────
export const schoolAnnouncements = mysqlTable("school_announcements", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message"),
  target: mysqlEnum("target", ["all", "parents", "staff", "location_admin", "teacher"]).default("all"),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tracks which users have dismissed a school announcement
export const schoolAnnouncementDismissals = mysqlTable("school_announcement_dismissals", {
  id: int("id").primaryKey().autoincrement(),
  schoolAnnouncementId: int("school_announcement_id").notNull().references(() => schoolAnnouncements.id, { onDelete: "cascade" }),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at").defaultNow(),
}, (t) => ({
  uniqueDismissal: uniqueIndex("school_announcement_dismissals_sa_user").on(t.schoolAnnouncementId, t.userId),
}));

// ── Documents (birth certificate, immunization, photos) ─────────────────────
export const documents = mysqlTable("documents", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  locationId: int("location_id").notNull().references(() => locations.id),
  studentId: int("student_id").references(() => students.id),
  staffId: int("staff_id").references(() => staff.id),
  type: mysqlEnum("type", ["birth_certificate", "immunization_record", "aadhar_card", "photo", "background_check", "other"]).notNull(),
  r2Key: varchar("r2_key", { length: 500 }),
  publicUrl: varchar("public_url", { length: 500 }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// ── EduPulse SaaS Subscriptions (per school billing) ─────────────────────────
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  plan: varchar("plan", { length: 50 }).notNull().default("free"),
  planId: int("plan_id").notNull().default(1).references(() => plans.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: varchar("currency", { length: 10 }).default("INR"),
  billingCycle: mysqlEnum("billing_cycle", ["monthly", "yearly", "lifetime"]).default("monthly"),
  status: mysqlEnum("status", ["trialing", "active", "past_due", "canceled", "paused"]).default("trialing"),
  razorpayCustomerId: varchar("razorpay_customer_id", { length: 255 }),
  razorpaySubscriptionId: varchar("razorpay_subscription_id", { length: 255 }),
  currentPeriodStart: datetime("current_period_start"),
  currentPeriodEnd: datetime("current_period_end"),
  trialEndsAt: datetime("trial_ends_at"),
  cancelAtPeriodEnd: int("cancel_at_period_end").default(0),
  daycareEnabled: int("daycare_enabled").default(0), // per-school daycare add-on toggle
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: datetime("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const subscriptionPayments = mysqlTable("subscription_payments", {
  id: int("id").primaryKey().autoincrement(),
  schoolId: int("school_id").notNull().references(() => schools.id),
  subscriptionId: int("subscription_id").notNull().references(() => subscriptions.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("INR"),
  status: mysqlEnum("status", ["pending", "captured", "failed", "refunded"]).default("pending"),
  razorpayOrderId: varchar("razorpay_order_id", { length: 255 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 255 }),
  paidAt: datetime("paid_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── EduPulse SaaS Plan Catalog ─────────────────────────────────────────────
export const plans = mysqlTable("plans", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  price: varchar("price", { length: 50 }).notNull().default("₹0"),
  period: varchar("period", { length: 50 }).notNull().default("forever"),
  currency: varchar("currency", { length: 10 }).default("INR"),
  description: text("description"),
  features: varchar("features", { length: 2000 }).default("[]"),
  featured: int("featured").default(0),
  displayOrder: int("display_order").default(0),
  status: mysqlEnum("status", ["active", "inactive"]).default("active"),
  cta: varchar("cta", { length: 100 }).default("Get started"),
  ctaHref: varchar("cta_href", { length: 255 }).default("/signup"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// ── Platform Announcements ───────────────────────────────────────────────────
export const announcements = mysqlTable("announcements", {
  id:        int("id").primaryKey().autoincrement(),
  title:     varchar("title", { length: 255 }).notNull(),
  body:      text("body").notNull(),
  type:      mysqlEnum("type", ["info", "warning", "success", "critical"]).notNull().default("info"),
  targetRole: mysqlEnum("target_role", ["all", "school_admin", "location_admin", "teacher", "accountant"]).notNull().default("all"),
  isActive:  int("is_active").notNull().default(1),
  expiresAt: datetime("expires_at"),
  createdBy: int("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Tracks which users have dismissed a specific announcement
export const announcementDismissals = mysqlTable("announcement_dismissals", {
  id:             int("id").primaryKey().autoincrement(),
  announcementId: int("announcement_id").notNull().references(() => announcements.id),
  userId:         int("user_id").notNull().references(() => users.id),
  dismissedAt:    timestamp("dismissed_at").defaultNow(),
}, (t) => ({
  uniqueDismissal: uniqueIndex("announcement_dismissals_user_announcement").on(t.userId, t.announcementId),
}));

// ── School Holidays / Events ─────────────────────────────────────────────────
export const holidays = mysqlTable("holidays", {
  id:          int("id").primaryKey().autoincrement(),
  schoolId:    int("school_id").notNull().references(() => schools.id),
  locationId:  int("location_id").notNull().references(() => locations.id),
  classId:     int("class_id").references(() => classes.id),
  name:        varchar("name", { length: 255 }).notNull(),
  date:        date("date").notNull(),
  type:        mysqlEnum("type", ["holiday", "event", "exam", "other"]).default("holiday"),
  description: text("description"),
  isRecurring: int("is_recurring").default(0), // 1 = repeats annually
  createdBy:   int("created_by").references(() => users.id),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow().onUpdateNow(),
}, (t) => ({
  uniqueHoliday: uniqueIndex("holidays_school_location_class_date").on(t.schoolId, t.locationId, t.classId, t.date, t.name),
}));

// ── Relations ───────────────────────────────────────────────────────────────
export const schoolsRelations = relations(schools, ({ many }) => ({
  locations: many(locations),
  users: many(users),
  classes: many(classes),
  inquiries: many(inquiries),
  students: many(students),
  staff: many(staff),
  subscriptions: many(subscriptions),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  school: one(schools, { fields: [locations.schoolId], references: [schools.id] }),
  users: many(users),
  classes: many(classes),
  students: many(students),
  staff: many(staff),
}));

export const studentsRelations = relations(students, ({ many, one }) => ({
  parents: many(parents),
  emergencyContacts: many(emergencyContacts),
  medicalNotes: one(medicalNotes),
  invoices: many(invoices),
  classEnrollments: many(classEnrollments),
  currentClass: one(classes, { fields: [students.currentClassId], references: [classes.id] }),
  documents: many(documents),
}));

export const classesRelations = relations(classes, ({ many }) => ({
  enrollments: many(classEnrollments),
  feeStructures: many(feeStructures),
  staffAssignments: many(staffClassAssignments),
}));

// ── Curriculum Activities ─────────────────────────────────────────────────────
export const curriculumActivities = mysqlTable("curriculum_activities", {
  id:          int("id").primaryKey().autoincrement(),
  schoolId:    int("school_id").notNull().references(() => schools.id),
  locationId:  int("location_id").notNull().references(() => locations.id),
  classId:     int("class_id").notNull().references(() => classes.id),
  uploadedBy:     int("uploaded_by").references(() => staff.id),
  uploadedByName: varchar("uploaded_by_name", { length: 255 }),
  title:          varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  activityDate: date("activity_date").notNull(),
  photoUrl:    varchar("photo_url", { length: 500 }),
  r2Key:       varchar("r2_key", { length: 500 }),
  createdAt:   timestamp("created_at").defaultNow(),
});

// ── Push notification subscriptions ───────────────────────────────────────────
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id:        int("id").primaryKey().autoincrement(),
  userId:    int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint:  varchar("endpoint", { length: 500 }).notNull().unique(),
  p256dh:    varchar("p256dh", { length: 255 }).notNull(),
  auth:      varchar("auth", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
