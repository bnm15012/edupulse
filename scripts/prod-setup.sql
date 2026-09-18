-- =============================================================================
-- EduPulse — Production Database Setup
-- Run this on a fresh empty database:
--   mysql -h HOST -u USER -pPASS DATABASE < prod-setup.sql
--
-- What this does:
--   1. Creates all 42 tables in dependency order
--   2. Inserts the 3 pricing plans (Free / Growth / Enterprise)
--   3. Inserts one super-admin user
--
-- After running, change the super-admin password immediately via the
-- Forgot Password flow or by re-running the INSERT with a new bcrypt hash.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ---------------------------------------------------------------------------
-- DRIZZLE MIGRATIONS TRACKER (required by db:migrate)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `hash` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CORE: schools, locations, users  (no FK deps except self-refs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `schools` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pincode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'India',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',
  `plan` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'free',
  `board` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'generic',
  `razorpay_key_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `razorpay_key_secret` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `max_locations` int DEFAULT '1',
  `max_students` int DEFAULT '50',
  `max_staff` int DEFAULT '3',
  `fee_cutoff_day` int NOT NULL DEFAULT '20',
  `status` enum('active','suspended','pending','archived') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pincode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` int DEFAULT NULL,
  `facility_type` enum('school','daycare','both') COLLATE utf8mb4_unicode_ci DEFAULT 'school',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `locations_school_name` (`school_id`,`name`),
  CONSTRAINT `locations_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('super_admin','school_admin','location_admin','teacher','staff','accountant','receptionist','parent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff',
  `status` enum('active','inactive','invited','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `email_confirmed` int DEFAULT '0',
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `users_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `users_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- PLANS (no FKs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '₹0',
  `period` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'forever',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',
  `description` text COLLATE utf8mb4_unicode_ci,
  `features` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT '[]',
  `featured` int DEFAULT '0',
  `display_order` int DEFAULT '0',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `cta` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'Get started',
  `cta_href` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '/signup',
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- OTPs, push subscriptions, announcements (super-admin level)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `otps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('email_confirm','password_reset') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'email_confirm',
  `expires_at` datetime NOT NULL,
  `used` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `endpoint` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `p256dh` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_endpoint_unique` (`endpoint`),
  KEY `push_subscriptions_user_id_users_id_fk` (`user_id`),
  CONSTRAINT `push_subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('info','warning','success','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `target_role` enum('all','school_admin','location_admin','teacher','accountant') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all',
  `is_active` int NOT NULL DEFAULT '1',
  `expires_at` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `announcements_created_by_users_id_fk` (`created_by`),
  CONSTRAINT `announcements_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `announcement_dismissals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `announcement_id` int NOT NULL,
  `user_id` int NOT NULL,
  `dismissed_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `announcement_dismissals_user_announcement` (`user_id`,`announcement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `waitlist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `school_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `school_size` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','contacted','converted','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `waitlist_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `plan_id` int DEFAULT NULL,
  `plan_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','cancelled','past_due','trialing','paused') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `billing_cycle` enum('monthly','quarterly','annually') COLLATE utf8mb4_unicode_ci DEFAULT 'monthly',
  `amount` decimal(12,2) DEFAULT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',
  `current_period_start` date DEFAULT NULL,
  `current_period_end` date DEFAULT NULL,
  `trial_ends_at` date DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `razorpay_subscription_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `razorpay_plan_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `max_locations` int DEFAULT NULL,
  `max_students` int DEFAULT NULL,
  `max_staff` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `subscriptions_school_id_schools_id_fk` (`school_id`),
  KEY `subscriptions_plan_id_plans_id_fk` (`plan_id`),
  CONSTRAINT `subscriptions_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `subscriptions_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscription_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `subscription_id` int DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'INR',
  `status` enum('pending','paid','failed','refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `razorpay_payment_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `razorpay_order_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `paid_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `subscription_payments_school_id_schools_id_fk` (`school_id`),
  KEY `subscription_payments_subscription_id_subscriptions_id_fk` (`subscription_id`),
  CONSTRAINT `subscription_payments_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `subscription_payments_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- SCHOOL-LEVEL: classes, staff, students
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `classes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `age_group` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `room_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` int NOT NULL,
  `start_time` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `end_time` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `classes_school_location_name` (`school_id`,`location_id`,`name`),
  KEY `classes_location_id_locations_id_fk` (`location_id`),
  CONSTRAINT `classes_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `classes_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `user_id` int DEFAULT NULL,
  `first_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('teacher','assistant','admin','principal','support') COLLATE utf8mb4_unicode_ci DEFAULT 'teacher',
  `join_date` date DEFAULT NULL,
  `salary` decimal(12,2) DEFAULT NULL,
  `status` enum('active','inactive','terminated','on_leave') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `background_check_status` enum('pending','in_progress','verified','rejected','expired') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `background_check_doc_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_school_email` (`school_id`,`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `students` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `first_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` enum('male','female','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blood_group` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `class_id` int DEFAULT NULL,
  `enrollment_date` date DEFAULT NULL,
  `status` enum('enrolled','withdrawn','graduated','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'enrolled',
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pincode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transport_route` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bus_stop` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hostel_room` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nationality` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `religion` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aadhar_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admission_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `previous_school` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `siblings` text COLLATE utf8mb4_unicode_ci,
  `photo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `r2_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `daycare_enabled` int DEFAULT '0',
  `is_nri` int DEFAULT '0',
  `is_rte` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `students_school_id_schools_id_fk` (`school_id`),
  KEY `students_location_id_locations_id_fk` (`location_id`),
  KEY `students_class_id_classes_id_fk` (`class_id`),
  CONSTRAINT `students_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `students_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `students_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- STUDENT-RELATED
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `parents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `student_id` int NOT NULL,
  `relation` enum('mother','father','guardian','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alternate_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `qualification` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `occupation` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `organisation` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `designation` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `office_address` text COLLATE utf8mb4_unicode_ci,
  `office_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `work_timings` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aadhar_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `annual_income` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_primary` int DEFAULT '0',
  `is_emergency` int DEFAULT '0',
  `user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `parents_student_email` (`student_id`,`email`),
  KEY `parents_school_id_schools_id_fk` (`school_id`),
  KEY `parents_location_id_locations_id_fk` (`location_id`),
  KEY `parents_user_id_users_id_fk` (`user_id`),
  CONSTRAINT `parents_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `parents_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `parents_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`),
  CONSTRAINT `parents_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `emergency_contacts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `student_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relation` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `emergency_contacts_student_phone` (`student_id`,`phone`),
  KEY `emergency_contacts_school_id_schools_id_fk` (`school_id`),
  KEY `emergency_contacts_location_id_locations_id_fk` (`location_id`),
  CONSTRAINT `emergency_contacts_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `emergency_contacts_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `emergency_contacts_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `medical_notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `student_id` int NOT NULL,
  `allergies` text COLLATE utf8mb4_unicode_ci,
  `conditions` text COLLATE utf8mb4_unicode_ci,
  `medications` text COLLATE utf8mb4_unicode_ci,
  `special_needs` text COLLATE utf8mb4_unicode_ci,
  `immunization_record` text COLLATE utf8mb4_unicode_ci,
  `doctor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `doctor_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `doctor_address` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `medical_notes_school_id_schools_id_fk` (`school_id`),
  KEY `medical_notes_location_id_locations_id_fk` (`location_id`),
  KEY `medical_notes_student_id_students_id_fk` (`student_id`),
  CONSTRAINT `medical_notes_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `medical_notes_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `medical_notes_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `student_id` int DEFAULT NULL,
  `staff_id` int DEFAULT NULL,
  `type` enum('birth_certificate','immunization_record','aadhar_card','photo','background_check','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `r2_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `public_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `documents_school_id_schools_id_fk` (`school_id`),
  KEY `documents_location_id_locations_id_fk` (`location_id`),
  KEY `documents_student_id_students_id_fk` (`student_id`),
  KEY `documents_staff_id_staff_id_fk` (`staff_id`),
  CONSTRAINT `documents_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `documents_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `documents_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`),
  CONSTRAINT `documents_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `class_enrollments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `student_id` int NOT NULL,
  `class_id` int NOT NULL,
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `enrolled_at` timestamp NULL DEFAULT (now()),
  `status` enum('active','promoted','withdrawn') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `class_enrollments_student_class_year` (`student_id`,`class_id`,`academic_year`),
  KEY `class_enrollments_school_id_schools_id_fk` (`school_id`),
  KEY `class_enrollments_location_id_locations_id_fk` (`location_id`),
  KEY `class_enrollments_class_id_classes_id_fk` (`class_id`),
  CONSTRAINT `class_enrollments_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `class_enrollments_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `class_enrollments_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `class_enrollments_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- FEES & PAYMENTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `fee_structures` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `class_id` int DEFAULT NULL,
  `fee_type` enum('school','daycare_hourly','daycare_monthly') COLLATE utf8mb4_unicode_ci DEFAULT 'school',
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `frequency` enum('monthly','quarterly','annually','one_time','hourly') COLLATE utf8mb4_unicode_ci DEFAULT 'monthly',
  `due_day` int DEFAULT '1',
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `fee_structures_school_location_class_name` (`school_id`,`location_id`,`class_id`,`name`),
  KEY `fee_structures_location_id_locations_id_fk` (`location_id`),
  KEY `fee_structures_class_id_classes_id_fk` (`class_id`),
  CONSTRAINT `fee_structures_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `fee_structures_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `fee_structures_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `student_id` int NOT NULL,
  `fee_structure_id` int DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `due_date` date DEFAULT NULL,
  `status` enum('draft','sent','paid','overdue','cancelled','refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `paid_at` datetime DEFAULT NULL,
  `paid_method` enum('cash','razorpay','bank_transfer','cheque','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_notes` text COLLATE utf8mb4_unicode_ci,
  `razorpay_order_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `razorpay_payment_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `generated_month` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoices_school_student_fee_month` (`school_id`,`student_id`,`fee_structure_id`,`generated_month`),
  KEY `invoices_location_id_locations_id_fk` (`location_id`),
  KEY `invoices_student_id_students_id_fk` (`student_id`),
  KEY `invoices_fee_structure_id_fee_structures_id_fk` (`fee_structure_id`),
  CONSTRAINT `invoices_fee_structure_id_fee_structures_id_fk` FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`),
  CONSTRAINT `invoices_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `invoices_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `invoices_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `invoice_id` int NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `method` enum('cash','bank_transfer','razorpay','cheque','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `razorpay_payment_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payments_razorpay_id` (`razorpay_payment_id`),
  KEY `payments_school_id_schools_id_fk` (`school_id`),
  KEY `payments_location_id_locations_id_fk` (`location_id`),
  KEY `payments_invoice_id_invoices_id_fk` (`invoice_id`),
  CONSTRAINT `payments_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `payments_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `payments_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `expenses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `amount` decimal(12,2) NOT NULL,
  `expense_date` date DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `expenses_school_id_schools_id_fk` (`school_id`),
  KEY `expenses_location_id_locations_id_fk` (`location_id`),
  KEY `expenses_created_by_users_id_fk` (`created_by`),
  CONSTRAINT `expenses_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `expenses_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `expenses_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- ACADEMICS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `subjects_school_name` (`school_id`,`name`),
  CONSTRAINT `subjects_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `class_subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `class_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `class_subjects_class_subject` (`class_id`,`subject_id`),
  KEY `class_subjects_school_id_schools_id_fk` (`school_id`),
  KEY `class_subjects_location_id_locations_id_fk` (`location_id`),
  KEY `class_subjects_subject_id_subjects_id_fk` (`subject_id`),
  CONSTRAINT `class_subjects_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `class_subjects_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `class_subjects_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `class_subjects_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `grading_scales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `board` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `min_percentage` decimal(5,2) NOT NULL,
  `max_percentage` decimal(5,2) NOT NULL,
  `grade_point` decimal(4,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `grading_scales_school_board_name` (`school_id`,`board`,`name`),
  CONSTRAINT `grading_scales_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exams` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `class_id` int NOT NULL,
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `term` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `exam_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'regular',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `status` enum('draft','active','archived') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `exams_school_id_schools_id_fk` (`school_id`),
  KEY `exams_location_id_locations_id_fk` (`location_id`),
  KEY `exams_class_id_classes_id_fk` (`class_id`),
  CONSTRAINT `exams_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `exams_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `exams_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exam_subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `max_marks` decimal(6,2) NOT NULL,
  `exam_date` date DEFAULT NULL,
  `status` enum('active','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `exam_subjects_exam_subject` (`exam_id`,`subject_id`),
  KEY `exam_subjects_subject_id_subjects_id_fk` (`subject_id`),
  CONSTRAINT `exam_subjects_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`),
  CONSTRAINT `exam_subjects_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `student_marks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `exam_id` int NOT NULL,
  `student_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `marks_obtained` decimal(6,2) DEFAULT NULL,
  `grade` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remarks` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_marks_exam_student_subject` (`exam_id`,`student_id`,`subject_id`),
  KEY `student_marks_school_id_schools_id_fk` (`school_id`),
  KEY `student_marks_student_id_students_id_fk` (`student_id`),
  CONSTRAINT `student_marks_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams` (`id`),
  CONSTRAINT `student_marks_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `student_marks_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `report_cards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `student_id` int NOT NULL,
  `academic_year` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `class_id` int DEFAULT NULL,
  `term` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `r2_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `public_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `report_cards_student_year_term` (`student_id`,`academic_year`,`term`),
  KEY `report_cards_school_id_schools_id_fk` (`school_id`),
  KEY `report_cards_location_id_locations_id_fk` (`location_id`),
  KEY `report_cards_class_id_classes_id_fk` (`class_id`),
  CONSTRAINT `report_cards_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `report_cards_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `report_cards_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `report_cards_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `timetable` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `class_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `day_of_week` enum('monday','tuesday','wednesday','thursday','friday','saturday','sunday') COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `end_time` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `room` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `timetable_class_subject_day_time` (`class_id`,`subject_id`,`day_of_week`,`start_time`),
  KEY `timetable_school_id_schools_id_fk` (`school_id`),
  KEY `timetable_location_id_locations_id_fk` (`location_id`),
  KEY `timetable_subject_id_subjects_id_fk` (`subject_id`),
  KEY `timetable_staff_id_staff_id_fk` (`staff_id`),
  CONSTRAINT `timetable_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `timetable_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `timetable_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `timetable_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`),
  CONSTRAINT `timetable_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `attendance_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `class_id` int NOT NULL,
  `date` date NOT NULL,
  `marked_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `attendance_sessions_class_date` (`class_id`,`date`),
  KEY `attendance_sessions_school_id_schools_id_fk` (`school_id`),
  KEY `attendance_sessions_location_id_locations_id_fk` (`location_id`),
  KEY `attendance_sessions_marked_by_staff_id_fk` (`marked_by`),
  CONSTRAINT `attendance_sessions_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `attendance_sessions_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `attendance_sessions_marked_by_staff_id_fk` FOREIGN KEY (`marked_by`) REFERENCES `staff` (`id`),
  CONSTRAINT `attendance_sessions_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `student_attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `class_id` int NOT NULL,
  `student_id` int NOT NULL,
  `date` date NOT NULL,
  `status` enum('present','absent','half_day','leave') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'present',
  `marked_by` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_attendance_student_date` (`student_id`,`date`),
  KEY `student_attendance_school_id_schools_id_fk` (`school_id`),
  KEY `student_attendance_location_id_locations_id_fk` (`location_id`),
  KEY `student_attendance_class_id_classes_id_fk` (`class_id`),
  KEY `student_attendance_marked_by_staff_id_fk` (`marked_by`),
  CONSTRAINT `student_attendance_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `student_attendance_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `student_attendance_marked_by_staff_id_fk` FOREIGN KEY (`marked_by`) REFERENCES `staff` (`id`),
  CONSTRAINT `student_attendance_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `student_attendance_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `staff_id` int NOT NULL,
  `date` date NOT NULL,
  `status` enum('present','absent','half_day','leave','work_from_home') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'present',
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_attendance_staff_date` (`staff_id`,`date`),
  KEY `staff_attendance_school_id_schools_id_fk` (`school_id`),
  KEY `staff_attendance_location_id_locations_id_fk` (`location_id`),
  CONSTRAINT `staff_attendance_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `staff_attendance_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `staff_attendance_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- DAYCARE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `daycare_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `student_id` int NOT NULL,
  `session_date` date NOT NULL,
  `in_time` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `out_time` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recorded_by` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `daycare_sessions_school_location_student_date` (`school_id`,`location_id`,`student_id`,`session_date`),
  KEY `daycare_sessions_location_id_locations_id_fk` (`location_id`),
  KEY `daycare_sessions_student_id_students_id_fk` (`student_id`),
  KEY `daycare_sessions_recorded_by_users_id_fk` (`recorded_by`),
  CONSTRAINT `daycare_sessions_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `daycare_sessions_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`),
  CONSTRAINT `daycare_sessions_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `daycare_sessions_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- CURRICULUM, STAFF PAYROLL, HOLIDAYS, INQUIRIES, SCHOOL ANNOUNCEMENTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `curriculum_activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `class_id` int NOT NULL,
  `uploaded_by` int DEFAULT NULL,
  `uploaded_by_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `activity_date` date NOT NULL,
  `photo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `r2_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `curriculum_activities_school_id_schools_id_fk` (`school_id`),
  KEY `curriculum_activities_location_id_locations_id_fk` (`location_id`),
  KEY `curriculum_activities_class_id_classes_id_fk` (`class_id`),
  KEY `curriculum_activities_uploaded_by_staff_id_fk` (`uploaded_by`),
  CONSTRAINT `curriculum_activities_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `curriculum_activities_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `curriculum_activities_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `curriculum_activities_uploaded_by_staff_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `staff` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_class_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `staff_id` int NOT NULL,
  `class_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_class_assignments_staff_class` (`staff_id`,`class_id`),
  KEY `staff_class_assignments_school_id_schools_id_fk` (`school_id`),
  KEY `staff_class_assignments_location_id_locations_id_fk` (`location_id`),
  KEY `staff_class_assignments_class_id_classes_id_fk` (`class_id`),
  CONSTRAINT `staff_class_assignments_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `staff_class_assignments_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `staff_class_assignments_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `staff_class_assignments_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_payroll` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `staff_id` int NOT NULL,
  `month` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `base_salary` decimal(12,2) NOT NULL DEFAULT '0.00',
  `allowances` decimal(12,2) NOT NULL DEFAULT '0.00',
  `deductions` decimal(12,2) NOT NULL DEFAULT '0.00',
  `gross_salary` decimal(12,2) NOT NULL DEFAULT '0.00',
  `net_salary` decimal(12,2) NOT NULL DEFAULT '0.00',
  `status` enum('pending','paid') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `paid_at` datetime DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `staff_payroll_staff_month` (`staff_id`,`month`),
  KEY `staff_payroll_school_id_schools_id_fk` (`school_id`),
  KEY `staff_payroll_location_id_locations_id_fk` (`location_id`),
  CONSTRAINT `staff_payroll_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `staff_payroll_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `staff_payroll_staff_id_staff_id_fk` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `holidays` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `class_id` int DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `type` enum('holiday','event','exam','other') COLLATE utf8mb4_unicode_ci DEFAULT 'holiday',
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_recurring` int DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `holidays_school_location_class_date` (`school_id`,`location_id`,`class_id`,`date`,`name`),
  KEY `holidays_location_id_locations_id_fk` (`location_id`),
  KEY `holidays_class_id_classes_id_fk` (`class_id`),
  KEY `holidays_created_by_users_id_fk` (`created_by`),
  CONSTRAINT `holidays_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `holidays_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `holidays_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `holidays_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inquiries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `parent_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `child_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `child_dob` date DEFAULT NULL,
  `program_interest` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('new','contacted','tour_scheduled','applied','waitlisted','rejected','enrolled') COLLATE utf8mb4_unicode_ci DEFAULT 'new',
  `student_id` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `inquiries_school_id_schools_id_fk` (`school_id`),
  KEY `inquiries_location_id_locations_id_fk` (`location_id`),
  KEY `inquiries_student_id_students_id_fk` (`student_id`),
  CONSTRAINT `inquiries_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  CONSTRAINT `inquiries_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`),
  CONSTRAINT `inquiries_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `school_announcements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL,
  `location_id` int NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `target` enum('all','parents','staff','location_admin','teacher') COLLATE utf8mb4_unicode_ci DEFAULT 'all',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `school_announcement_dismissals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_announcement_id` int NOT NULL,
  `user_id` int NOT NULL,
  `dismissed_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `school_announcement_dismissals_sa_user` (`school_announcement_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Plans (Free / Growth / Enterprise)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `plans` (`id`, `name`, `price`, `period`, `description`, `features`, `featured`, `display_order`, `status`, `cta`, `cta_href`) VALUES
(1, 'Free',       '₹0',     'forever',          'Perfect for getting started',           '["1 school, 1 branch","Up to 50 students","Admissions & enrollment","Fee management","Staff & attendance","Email support"]',            0, 1, 'active', 'Get started',      '/signup'),
(2, 'Growth',     '₹1,499', 'per location/month','For growing schools with multiple branches','["Unlimited students","Multiple branches","All Free features","CSV import","Daycare module","Priority support"]',                    1, 2, 'active', 'Start free trial', '/signup'),
(3, 'Enterprise', 'Custom', 'contact us',        'For large institutions & chains',       '["Everything in Growth","Multi-school dashboard","Custom integrations","Dedicated account manager","SLA & priority support"]',          0, 3, 'active', 'Contact us',       '/contact');

-- ---------------------------------------------------------------------------
-- 2. Super-admin school & location (required by users.school_id NOT NULL)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `schools` (`id`, `name`, `email`, `country`, `currency`, `plan`, `status`, `max_locations`, `max_students`, `max_staff`)
VALUES (1, 'EduPulse Platform', 'admin@edupulse.in', 'India', 'INR', 'free', 'active', 1, 9999, 9999);

INSERT IGNORE INTO `locations` (`id`, `school_id`, `name`, `status`)
VALUES (1, 1, 'HQ', 'active');

-- ---------------------------------------------------------------------------
-- 3. Super-admin user
--    Default password: super1234  (bcrypt hash below)
--    CHANGE THIS immediately after first login via Forgot Password.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `users` (`id`, `school_id`, `location_id`, `email`, `password_hash`, `first_name`, `last_name`, `role`, `status`, `email_confirmed`)
VALUES (1, 1, 1, 'super@edupulse.in', '$2a$10$1DbDbZhbfkm2CvE79DqeeOtoQ0oj3G8qUYcCHAlc3zkYE3wrCsmcm', 'Super', 'Admin', 'super_admin', 'active', 1);
