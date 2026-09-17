-- ============================================================
-- KinderDesk Demo Seed — wipe everything, insert realistic data
-- School: Little Stars Academy (CBSE)
-- Locations: BELLANDUR + HSR LAYOUT
-- Logins:
--   school_admin   : schooladmin@demo.com / demo1234
--   location_admin : admin@demo.com      / demo1234
--   teacher        : teacher@demo.com    / demo1234
--   parent         : parent@demo.com     / demo1234
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Ensure push_subscriptions exists (it's not part of the main migration chain)
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `endpoint` varchar(500) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_subscriptions_endpoint_unique` (`endpoint`),
  KEY `push_subscriptions_user_id_users_id_fk` (`user_id`),
  CONSTRAINT `push_subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

TRUNCATE TABLE announcement_dismissals;
TRUNCATE TABLE announcements;
TRUNCATE TABLE attendance_sessions;
TRUNCATE TABLE class_enrollments;
TRUNCATE TABLE class_subjects;
TRUNCATE TABLE classes;
TRUNCATE TABLE curriculum_activities;
TRUNCATE TABLE daycare_sessions;
TRUNCATE TABLE documents;
TRUNCATE TABLE emergency_contacts;
TRUNCATE TABLE exam_subjects;
TRUNCATE TABLE exams;
TRUNCATE TABLE expenses;
TRUNCATE TABLE fee_structures;
TRUNCATE TABLE grading_scales;
TRUNCATE TABLE inquiries;
TRUNCATE TABLE invoices;
TRUNCATE TABLE locations;
TRUNCATE TABLE medical_notes;
TRUNCATE TABLE otps;
TRUNCATE TABLE parents;
TRUNCATE TABLE payments;
TRUNCATE TABLE plans;
TRUNCATE TABLE report_cards;
TRUNCATE TABLE school_announcement_dismissals;
TRUNCATE TABLE school_announcements;
TRUNCATE TABLE schools;
TRUNCATE TABLE staff;
TRUNCATE TABLE staff_attendance;
TRUNCATE TABLE staff_class_assignments;
TRUNCATE TABLE staff_payroll;
TRUNCATE TABLE student_attendance;
TRUNCATE TABLE student_marks;
TRUNCATE TABLE students;
TRUNCATE TABLE subjects;
TRUNCATE TABLE subscription_payments;
TRUNCATE TABLE subscriptions;
TRUNCATE TABLE timetable;
TRUNCATE TABLE users;
TRUNCATE TABLE waitlist;

SET FOREIGN_KEY_CHECKS = 1;

-- ── School ────────────────────────────────────────────────────
INSERT INTO schools (id, name) VALUES (1, 'Little Stars Academy');

-- ── Plans ────────────────────────────────────────────────────
INSERT INTO plans (id, name, price, period, status) VALUES (1, 'Pro', '₹2,999', 'monthly', 'active');

-- ── Subscription ─────────────────────────────────────────────
INSERT INTO subscriptions (school_id, plan, amount, billing_cycle, status, trial_ends_at, plan_id)
VALUES (1, 'pro', 0.00, 'monthly', 'active', DATE_ADD(NOW(), INTERVAL 30 DAY), 1);

-- ── Locations ────────────────────────────────────────────────
INSERT INTO locations (id, school_id, name, address, city, state, pincode, phone, capacity, status)
VALUES
  (1, 1, 'BELLANDUR', '89, 2nd Cross Rd, Kaverappa Layout', 'Bangalore', 'Karnataka', '560103', '+918012345678', 60, 'active'),
  (2, 1, 'HSR LAYOUT', '47, 5th Sector, HSR Layout', 'Bangalore', 'Karnataka', '560102', '+918098765432', 40, 'active');

-- ── Users (bcrypt hash of "demo1234") ────────────────────────
-- Using a pre-computed bcrypt hash for "demo1234"
-- $2b$10$K7L/5GzL6JHm/nVOmcGKWubNAKwkNmXrGMaQTekCX.kLr9fFrz7Oa  (demo1234)
INSERT INTO users (id, school_id, location_id, email, password_hash, first_name, last_name, phone, role, status, email_confirmed)
VALUES
  (1, 1, 1, 'admin@demo.com',        '$2b$10$K7L/5GzL6JHm/nVOmcGKWubNAKwkNmXrGMaQTekCX.kLr9fFrz7Oa', 'Priya',  'Sharma',  '+919811111111', 'location_admin', 'active', 1),
  (2, 1, 1, 'teacher@demo.com',     '$2b$10$K7L/5GzL6JHm/nVOmcGKWubNAKwkNmXrGMaQTekCX.kLr9fFrz7Oa', 'Neha',   'Verma',   '+919822222222', 'teacher',        'active', 1),
  (3, 1, 1, 'parent@demo.com',      '$2b$10$K7L/5GzL6JHm/nVOmcGKWubNAKwkNmXrGMaQTekCX.kLr9fFrz7Oa', 'Rajesh', 'Kapoor',  '+919833333333', 'parent',         'active', 1),
  (4, 1, 2, 'admin2@demo.com',      '$2b$10$K7L/5GzL6JHm/nVOmcGKWubNAKwkNmXrGMaQTekCX.kLr9fFrz7Oa', 'Anita',  'Reddy',   '+919844444444', 'location_admin', 'active', 1),
  (5, 1, 1, 'teacher2@demo.com',    '$2b$10$K7L/5GzL6JHm/nVOmcGKWubNAKwkNmXrGMaQTekCX.kLr9fFrz7Oa', 'Suresh', 'Kumar',   '+919855555555', 'teacher',        'active', 1),
  (7, 1, NULL,'schooladmin@demo.com','$2b$10$K7L/5GzL6JHm/nVOmcGKWubNAKwkNmXrGMaQTekCX.kLr9fFrz7Oa', 'Rahul',  'Mehta',   '+919866666666', 'school_admin',   'active', 1);

-- ── Staff ─────────────────────────────────────────────────────
INSERT INTO staff (id, school_id, location_id, user_id, first_name, last_name, email, phone, role, join_date, salary, status, background_check_status)
VALUES
  (1, 1, 1, 2, 'Neha',   'Verma',      'teacher@demo.com',   '+919822222222', 'teacher',   '2024-06-01', 35000.00, 'active', 'verified'),
  (2, 1, 1, 5, 'Suresh', 'Kumar',      'teacher2@demo.com',  '+919855555555', 'teacher',   '2024-06-01', 30000.00, 'active', 'verified'),
  (3, 1, 1, NULL,        'Meena',    'Pillai',     'meena@demo.com',     '+919866666666', 'assistant', '2024-08-01', 18000.00, 'active', 'pending'),
  (4, 1, 1, NULL,        'Kiran',    'Das',        'kiran@demo.com',     '+919877777777', 'teacher',   '2025-01-15', 32000.00, 'active', 'verified'),
  (5, 1, 2, NULL,        'Divya',    'Nair',       'divya@demo.com',     '+919888888888', 'teacher',   '2024-09-01', 30000.00, 'active', 'verified'),
  (6, 1, 2, NULL,        'Arjun',    'Singh',      'arjun@demo.com',     '+919899999999', 'assistant', '2025-03-01', 17000.00, 'active', 'in_progress');

-- ── Classes ───────────────────────────────────────────────────
INSERT INTO classes (id, school_id, location_id, name, age_group, room_name, capacity, start_time, end_time, status, academic_year)
VALUES
  -- BELLANDUR
  (1, 1, 1, 'Nursery A',  '2.5-3.5 yrs', 'Sunflower Room', 15, '08:30', '12:30', 'active', '2025-26'),
  (2, 1, 1, 'LKG A',      '3.5-4.5 yrs', 'Rainbow Room',   15, '08:30', '12:30', 'active', '2025-26'),
  (3, 1, 1, 'UKG A',      '4.5-5.5 yrs', 'Butterfly Room', 15, '08:30', '12:30', 'active', '2025-26'),
  (4, 1, 1, 'Grade 1 A',  '5.5-6.5 yrs', 'Star Room',      20, '08:00', '14:00', 'active', '2025-26'),
  -- HSR LAYOUT
  (5, 1, 2, 'Nursery B',  '2.5-3.5 yrs', 'Mango Room',     12, '08:30', '12:30', 'active', '2025-26'),
  (6, 1, 2, 'LKG B',      '3.5-4.5 yrs', 'Apple Room',     12, '08:30', '12:30', 'active', '2025-26');

-- ── Staff → Class assignments ─────────────────────────────────
INSERT INTO staff_class_assignments (school_id, location_id, staff_id, class_id, academic_year)
VALUES
  (1, 1, 1, 2, '2025-26'),  -- Neha → LKG A
  (1, 1, 1, 3, '2025-26'),  -- Neha → UKG A
  (1, 1, 2, 1, '2025-26'),  -- Suresh → Nursery A
  (1, 1, 4, 4, '2025-26'),  -- Kiran → Grade 1 A
  (1, 2, 5, 5, '2025-26'),  -- Divya → Nursery B
  (1, 2, 6, 6, '2025-26');  -- Arjun → LKG B

-- ── Subjects (school-level library) ──────────────────────────
INSERT INTO subjects (id, school_id, name, code, status)
VALUES
  (1, 1, 'English',       'ENG',  'active'),
  (2, 1, 'Mathematics',   'MATH', 'active'),
  (3, 1, 'Environmental Studies', 'EVS', 'active'),
  (4, 1, 'Hindi',         'HIN',  'active'),
  (5, 1, 'Art & Craft',   'ART',  'active'),
  (6, 1, 'Physical Education', 'PE', 'active'),
  (7, 1, 'Music',         'MUS',  'active'),
  (8, 1, 'Computer Science', 'CS', 'active');

-- ── Class Subjects ────────────────────────────────────────────
-- LKG A (class 2)
INSERT INTO class_subjects (school_id, location_id, class_id, subject_id)
VALUES
  (1, 1, 2, 1), (1, 1, 2, 2), (1, 1, 2, 3), (1, 1, 2, 5);

-- UKG A (class 3)
INSERT INTO class_subjects (school_id, location_id, class_id, subject_id)
VALUES
  (1, 1, 3, 1), (1, 1, 3, 2), (1, 1, 3, 3), (1, 1, 3, 4), (1, 1, 3, 5);

-- Grade 1 A (class 4)
INSERT INTO class_subjects (school_id, location_id, class_id, subject_id)
VALUES
  (1, 1, 4, 1), (1, 1, 4, 2), (1, 1, 4, 3), (1, 1, 4, 4), (1, 1, 4, 8);

-- ── Grading Scales (CBSE) ─────────────────────────────────────
INSERT INTO grading_scales (school_id, board, name, min_percentage, max_percentage, grade_point)
VALUES
  (1, 'CBSE', 'A1', 91, 100, 9.99),
  (1, 'CBSE', 'A2', 81, 90,  9.0),
  (1, 'CBSE', 'B1', 71, 80,  8.0),
  (1, 'CBSE', 'B2', 61, 70,  7.0),
  (1, 'CBSE', 'C1', 51, 60,  6.0),
  (1, 'CBSE', 'C2', 41, 50,  5.0),
  (1, 'CBSE', 'D',  33, 40,  4.0),
  (1, 'CBSE', 'E',  0,  32,  0.0);

-- ── Students ──────────────────────────────────────────────────
INSERT INTO students (id, school_id, location_id, first_name, last_name, date_of_birth, gender, blood_group, status, current_class_id, admission_number)
VALUES
  -- LKG A (class 2) — 5 students
  (1,  1, 1, 'Aanya',   'Kapoor',   '2021-03-15', 'female', 'B+',  'enrolled', 2, 'LSA/25/001'),
  (2,  1, 1, 'Vihaan',  'Mehta',    '2021-07-22', 'male',   'A+',  'enrolled', 2, 'LSA/25/002'),
  (3,  1, 1, 'Diya',    'Sharma',   '2021-01-10', 'female', 'O+',  'enrolled', 2, 'LSA/25/003'),
  (4,  1, 1, 'Aryan',   'Singh',    '2021-05-05', 'male',   'AB+', 'enrolled', 2, 'LSA/25/004'),
  (5,  1, 1, 'Ishaan',  'Gupta',    '2021-09-18', 'male',   'B-',  'enrolled', 2, 'LSA/25/005'),
  -- UKG A (class 3) — 5 students
  (6,  1, 1, 'Meera',   'Nair',     '2020-04-12', 'female', 'A+',  'enrolled', 3, 'LSA/25/006'),
  (7,  1, 1, 'Rohan',   'Patel',    '2020-08-30', 'male',   'O-',  'enrolled', 3, 'LSA/25/007'),
  (8,  1, 1, 'Priya',   'Rao',      '2020-02-20', 'female', 'B+',  'enrolled', 3, 'LSA/25/008'),
  (9,  1, 1, 'Kabir',   'Joshi',    '2020-11-11', 'male',   'A-',  'enrolled', 3, 'LSA/25/009'),
  (10, 1, 1, 'Ananya',  'Das',      '2020-06-25', 'female', 'AB-', 'enrolled', 3, 'LSA/25/010'),
  -- Grade 1 A (class 4) — 4 students
  (11, 1, 1, 'Dev',     'Mishra',   '2019-01-08', 'male',   'O+',  'enrolled', 4, 'LSA/25/011'),
  (12, 1, 1, 'Sara',    'Verma',    '2019-05-17', 'female', 'B+',  'enrolled', 4, 'LSA/25/012'),
  (13, 1, 1, 'Aarav',   'Khanna',   '2019-09-23', 'male',   'A+',  'enrolled', 4, 'LSA/25/013'),
  (14, 1, 1, 'Riya',    'Bose',     '2019-12-01', 'female', 'O-',  'enrolled', 4, 'LSA/25/014'),
  -- Nursery A (class 1) — 3 students
  (15, 1, 1, 'Zara',    'Khan',     '2022-07-04', 'female', 'A+',  'enrolled', 1, 'LSA/25/015'),
  (16, 1, 1, 'Advit',   'Pillai',   '2022-03-11', 'male',   'B+',  'enrolled', 1, 'LSA/25/016'),
  (17, 1, 1, 'Nisha',   'Iyer',     '2022-10-27', 'female', 'O+',  'enrolled', 1, 'LSA/25/017');

-- ── Class Enrollments ─────────────────────────────────────────
INSERT INTO class_enrollments (school_id, location_id, student_id, class_id, academic_year, status)
VALUES
  (1,1,1,2,'2025-26','active'),  (1,1,2,2,'2025-26','active'),
  (1,1,3,2,'2025-26','active'),  (1,1,4,2,'2025-26','active'),
  (1,1,5,2,'2025-26','active'),
  (1,1,6,3,'2025-26','active'),  (1,1,7,3,'2025-26','active'),
  (1,1,8,3,'2025-26','active'),  (1,1,9,3,'2025-26','active'),
  (1,1,10,3,'2025-26','active'),
  (1,1,11,4,'2025-26','active'), (1,1,12,4,'2025-26','active'),
  (1,1,13,4,'2025-26','active'), (1,1,14,4,'2025-26','active'),
  (1,1,15,1,'2025-26','active'), (1,1,16,1,'2025-26','active'),
  (1,1,17,1,'2025-26','active');

-- ── Parents ───────────────────────────────────────────────────
INSERT INTO parents (school_id, location_id, student_id, relation, name, email, phone, is_primary)
VALUES
  (1, 1, 1, 'father', 'Rajesh Kapoor',  'parent@demo.com',    '+919833333333', 1),
  (1, 1, 1, 'mother', 'Sunita Kapoor',  'sunita.k@email.com', '+919833333344', 0),
  (1, 1, 2, 'father', 'Alok Mehta',     'alok@email.com',     '+919711111111', 1),
  (1, 1, 3, 'mother', 'Kavita Sharma',  'kavita@email.com',   '+919722222222', 1),
  (1, 1, 6, 'mother', 'Deepa Nair',     'deepa@email.com',    '+919733333333', 1),
  (1, 1, 11,'father', 'Ramesh Mishra',  'ramesh@email.com',   '+919744444444', 1);

-- ── Admissions (Inquiries) ────────────────────────────────────
INSERT INTO inquiries (school_id, location_id, parent_name, email, phone, child_name, child_dob, program_interest, source, status, notes)
VALUES
  (1, 1, 'Sunita Sharma',   'sunita@example.com',  '+919700000001', 'Ayaan Sharma',   '2022-04-10', 'Nursery', 'Walk-in',   'new',            'Interested in morning batch'),
  (1, 1, 'Ritu Malhotra',   'ritu@example.com',    '+919700000002', 'Kavya Malhotra', '2021-08-22', 'LKG',     'Facebook',  'contacted',      'Called on 12 Sep, follow up next week'),
  (1, 1, 'Anand Joshi',     'anand@example.com',   '+919700000003', 'Om Joshi',       '2021-02-14', 'LKG',     'Referral',  'tour_scheduled', 'Tour set for 20 Sep at 10 AM'),
  (1, 1, 'Pooja Agarwal',   'pooja@example.com',   '+919700000004', 'Tanvi Agarwal',  '2020-11-30', 'UKG',     'Google',    'applied',        'Form submitted, docs pending'),
  (1, 1, 'Vineet Saxena',   'vineet@example.com',  '+919700000005', 'Shiv Saxena',    '2020-06-05', 'UKG',     'Word of mouth', 'rejected',   'No seat available'),
  (1, 1, 'Geeta Menon',     'geeta@example.com',   '+919700000006', 'Layla Menon',    '2022-09-15', 'Nursery', 'Website',   'new',            '');

-- ── Fee Structures ────────────────────────────────────────────
INSERT INTO fee_structures (id, school_id, location_id, class_id, name, amount, frequency, due_day, description)
VALUES
  (1, 1, 1, NULL, 'Monthly Tuition',    3500.00, 'monthly',   5,  'Monthly tuition fee for all classes'),
  (2, 1, 1, NULL, 'Annual Activity Fee', 5000.00, 'annually',  15, 'Arts, sports and field trips'),
  (3, 1, 1, NULL, 'Term Exam Fee',       800.00, 'quarterly', 1,  'Per-term examination fee'),
  (4, 1, 1, 4,    'Computer Lab Fee',    600.00, 'monthly',   5,  'Grade 1 computer lab charges');

-- ── Invoices ─────────────────────────────────────────────────
INSERT INTO invoices (school_id, location_id, student_id, fee_structure_id, amount, due_date, status, paid_at, paid_method, generated_month)
VALUES
  -- Student 1 Aanya — paid Sep, overdue Aug
  (1,1,1,1,3500.00,'2025-09-05','paid',   '2025-09-03 10:00:00','cash',        '2025-09'),
  (1,1,1,1,3500.00,'2025-08-05','overdue',NULL,NULL,'2025-08'),
  (1,1,1,2,5000.00,'2025-04-15','paid',   '2025-04-12 11:00:00','bank_transfer','2025-01'),
  -- Student 2 Vihaan
  (1,1,2,1,3500.00,'2025-09-05','sent',   NULL,NULL,'2025-09'),
  (1,1,2,1,3500.00,'2025-08-05','paid',   '2025-08-04 09:30:00','cash',        '2025-08'),
  -- Student 3 Diya
  (1,1,3,1,3500.00,'2025-09-05','sent',   NULL,NULL,'2025-09'),
  -- Student 6 Meera
  (1,1,6,1,3500.00,'2025-09-05','overdue',NULL,NULL,'2025-09'),
  (1,1,6,1,3500.00,'2025-08-05','paid',   '2025-08-01 14:00:00','razorpay',    '2025-08'),
  -- Student 11 Dev (Grade 1, also has computer lab)
  (1,1,11,1,3500.00,'2025-09-05','sent',  NULL,NULL,'2025-09'),
  (1,1,11,4,600.00, '2025-09-05','sent',  NULL,NULL,'2025-09'),
  (1,1,11,1,3500.00,'2025-08-05','paid',  '2025-08-06 16:00:00','cash',        '2025-08'),
  -- Student 12 Sara
  (1,1,12,1,3500.00,'2025-09-05','draft', NULL,NULL,'2025-09');

-- ── Exams ─────────────────────────────────────────────────────
-- LKG A exams
INSERT INTO exams (id, school_id, location_id, class_id, academic_year, term, exam_type, start_date, end_date, status)
VALUES
  (1, 1, 1, 2, '2025-26', 'Term 1 – Unit Test',  'unit_test',  '2025-07-15', '2025-07-20', 'active'),
  (2, 1, 1, 2, '2025-26', 'Term 1 – Mid Term',   'mid_term',   '2025-08-18', '2025-08-22', 'active'),
  -- UKG A exams
  (3, 1, 1, 3, '2025-26', 'Term 1 – Unit Test',  'unit_test',  '2025-07-15', '2025-07-20', 'active'),
  (4, 1, 1, 3, '2025-26', 'Term 1 – Mid Term',   'mid_term',   '2025-08-18', '2025-08-22', 'active'),
  -- Grade 1 A exams
  (5, 1, 1, 4, '2025-26', 'Term 1 – Unit Test',  'unit_test',  '2025-07-15', '2025-07-20', 'active'),
  (6, 1, 1, 4, '2025-26', 'Term 1 – Mid Term',   'mid_term',   '2025-08-18', '2025-08-22', 'active');

-- ── Exam Subjects ─────────────────────────────────────────────
-- LKG A, Exam 1
INSERT INTO exam_subjects (id, exam_id, subject_id, max_marks, exam_date, status)
VALUES
  (1, 1, 1, 50.00, '2025-07-15', 'active'),  -- English
  (2, 1, 2, 50.00, '2025-07-16', 'active'),  -- Math
  (3, 1, 3, 50.00, '2025-07-17', 'active');  -- EVS

-- LKG A, Exam 2
INSERT INTO exam_subjects (id, exam_id, subject_id, max_marks, exam_date, status)
VALUES
  (4, 2, 1, 100.00, '2025-08-18', 'active'),
  (5, 2, 2, 100.00, '2025-08-19', 'active'),
  (6, 2, 3, 100.00, '2025-08-20', 'active'),
  (7, 2, 5, 50.00,  '2025-08-21', 'active');  -- Art

-- UKG A, Exam 3
INSERT INTO exam_subjects (id, exam_id, subject_id, max_marks, exam_date, status)
VALUES
  (8,  3, 1, 50.00, '2025-07-15', 'active'),
  (9,  3, 2, 50.00, '2025-07-16', 'active'),
  (10, 3, 3, 50.00, '2025-07-17', 'active'),
  (11, 3, 4, 50.00, '2025-07-18', 'active');  -- Hindi

-- UKG A, Exam 4
INSERT INTO exam_subjects (id, exam_id, subject_id, max_marks, exam_date, status)
VALUES
  (12, 4, 1, 100.00, '2025-08-18', 'active'),
  (13, 4, 2, 100.00, '2025-08-19', 'active'),
  (14, 4, 3, 100.00, '2025-08-20', 'active'),
  (15, 4, 4, 100.00, '2025-08-21', 'active');

-- Grade 1 A, Exam 5
INSERT INTO exam_subjects (id, exam_id, subject_id, max_marks, exam_date, status)
VALUES
  (16, 5, 1, 50.00, '2025-07-15', 'active'),
  (17, 5, 2, 50.00, '2025-07-16', 'active'),
  (18, 5, 3, 50.00, '2025-07-17', 'active'),
  (19, 5, 4, 50.00, '2025-07-18', 'active'),
  (20, 5, 8, 50.00, '2025-07-19', 'active');  -- CS

-- Grade 1 A, Exam 6
INSERT INTO exam_subjects (id, exam_id, subject_id, max_marks, exam_date, status)
VALUES
  (21, 6, 1, 100.00, '2025-08-18', 'active'),
  (22, 6, 2, 100.00, '2025-08-19', 'active'),
  (23, 6, 3, 100.00, '2025-08-20', 'active'),
  (24, 6, 4, 100.00, '2025-08-21', 'active'),
  (25, 6, 8, 50.00,  '2025-08-22', 'active');

-- ── Student Marks (LKG A, Exam 1) ────────────────────────────
INSERT INTO student_marks (student_id, exam_subject_id, marks, grade, marked_by)
VALUES
  -- Aanya (1)
  (1,1,44,'A2',1), (1,2,46,'A1',1), (1,3,40,'A2',1),
  -- Vihaan (2)
  (2,1,38,'B1',1), (2,2,42,'A2',1), (2,3,35,'B2',1),
  -- Diya (3)
  (3,1,47,'A1',1), (3,2,48,'A1',1), (3,3,45,'A1',1),
  -- Aryan (4)
  (4,1,36,'B1',1), (4,2,39,'B1',1), (4,3,33,'B2',1),
  -- Ishaan (5)
  (5,1,41,'A2',1), (5,2,43,'A2',1), (5,3,38,'B1',1);

-- ── Student Marks (LKG A, Exam 2 — Mid Term) ─────────────────
INSERT INTO student_marks (student_id, exam_subject_id, marks, grade, marked_by)
VALUES
  (1,4,88,'A2',1), (1,5,92,'A1',1), (1,6,84,'A2',1), (1,7,43,'A2',1),
  (2,4,75,'B1',1), (2,5,80,'A2',1), (2,6,70,'B1',1), (2,7,38,'B1',1),
  (3,4,94,'A1',1), (3,5,96,'A1',1), (3,6,90,'A1',1), (3,7,47,'A1',1),
  (4,4,72,'B1',1), (4,5,68,'B2',1), (4,6,65,'B2',1), (4,7,35,'B1',1),
  (5,4,85,'A2',1), (5,5,88,'A2',1), (5,6,79,'B1',1), (5,7,40,'A2',1);

-- ── Student Marks (UKG A, Exam 3) ────────────────────────────
INSERT INTO student_marks (student_id, exam_subject_id, marks, grade, marked_by)
VALUES
  (6, 8,46,(SELECT name FROM grading_scales WHERE board='CBSE' AND 46>=min_percentage AND 46<=max_percentage ORDER BY min_percentage DESC LIMIT 1),1),
  (6, 9,44,'A2',1), (6,10,42,'A2',1), (6,11,45,'A1',1),
  (7, 8,38,'B1',1), (7, 9,40,'A2',1), (7,10,36,'B1',1), (7,11,37,'B1',1),
  (8, 8,49,'A1',1), (8, 9,50,'A1',1), (8,10,47,'A1',1), (8,11,48,'A1',1),
  (9, 8,35,'B2',1), (9, 9,38,'B1',1), (9,10,33,'B2',1), (9,11,36,'B1',1),
  (10,8,43,'A2',1), (10,9,44,'A2',1),(10,10,41,'A2',1),(10,11,42,'A2',1);

-- ── Student Marks (Grade 1, Exam 5 — Unit Test) ───────────────
INSERT INTO student_marks (student_id, exam_subject_id, marks, grade, marked_by)
VALUES
  (11,16,44,'A2',2), (11,17,46,'A1',2), (11,18,42,'A2',2), (11,19,40,'A2',2), (11,20,47,'A1',2),
  (12,16,48,'A1',2), (12,17,50,'A1',2), (12,18,45,'A1',2), (12,19,47,'A1',2), (12,20,49,'A1',2),
  (13,16,35,'B2',2), (13,17,38,'B1',2), (13,18,33,'B2',2), (13,19,36,'B1',2), (13,20,40,'A2',2),
  (14,16,41,'A2',2), (14,17,43,'A2',2), (14,18,39,'B1',2), (14,19,42,'A2',2), (14,20,44,'A2',2);

-- ── Expenses ─────────────────────────────────────────────────
INSERT INTO expenses (school_id, location_id, category, description, amount, expense_date)
VALUES
  (1, 1, 'rent',        'September rent — BELLANDUR',            45000.00, '2025-09-01'),
  (1, 1, 'salary',      'Staff salaries August payout',          115000.00,'2025-08-31'),
  (1, 1, 'utilities',   'Electricity + water bill Aug',          8500.00,  '2025-08-28'),
  (1, 1, 'supplies',    'Craft supplies — stationery restock',   3200.00,  '2025-09-03'),
  (1, 1, 'maintenance', 'AC servicing — Butterfly Room',         2500.00,  '2025-09-05'),
  (1, 1, 'food',        'Snacks & refreshments for Events day',  1800.00,  '2025-09-06'),
  (1, 1, 'rent',        'August rent — BELLANDUR',               45000.00, '2025-08-01'),
  (1, 1, 'utilities',   'Internet & phone Jul',                  2200.00,  '2025-07-30'),
  (1, 1, 'supplies',    'Whiteboard markers & A4 paper',         850.00,   '2025-09-07'),
  (1, 1, 'other',       'Parent-teacher meet refreshments',      1200.00,  '2025-09-08');

-- ── Attendance Sessions ───────────────────────────────────────
INSERT INTO attendance_sessions (school_id, location_id, class_id, date, marked_by)
VALUES
  (1,1,2,'2025-09-08',1),(1,1,2,'2025-09-09',1),(1,1,2,'2025-09-10',1),
  (1,1,3,'2025-09-08',1),(1,1,3,'2025-09-09',1),(1,1,3,'2025-09-10',1),
  (1,1,4,'2025-09-08',2),(1,1,4,'2025-09-09',2),(1,1,4,'2025-09-10',2);

-- ── Student Attendance ────────────────────────────────────────
-- LKG A — Sep 8
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,2,1,'2025-09-08','present',1),(1,1,2,2,'2025-09-08','present',1),
  (1,1,2,3,'2025-09-08','present',1),(1,1,2,4,'2025-09-08','absent',1),
  (1,1,2,5,'2025-09-08','present',1);
-- LKG A — Sep 9
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,2,1,'2025-09-09','present',1),(1,1,2,2,'2025-09-09','half_day',1),
  (1,1,2,3,'2025-09-09','present',1),(1,1,2,4,'2025-09-09','present',1),
  (1,1,2,5,'2025-09-09','present',1);
-- LKG A — Sep 10
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,2,1,'2025-09-10','present',1),(1,1,2,2,'2025-09-10','present',1),
  (1,1,2,3,'2025-09-10','absent',1), (1,1,2,4,'2025-09-10','present',1),
  (1,1,2,5,'2025-09-10','present',1);

-- UKG A — Sep 8
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,3,6,'2025-09-08','present',1),(1,1,3,7,'2025-09-08','present',1),
  (1,1,3,8,'2025-09-08','present',1),(1,1,3,9,'2025-09-08','absent',1),
  (1,1,3,10,'2025-09-08','present',1);
-- UKG A — Sep 9
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,3,6,'2025-09-09','present',1),(1,1,3,7,'2025-09-09','present',1),
  (1,1,3,8,'2025-09-09','present',1),(1,1,3,9,'2025-09-09','present',1),
  (1,1,3,10,'2025-09-09','half_day',1);
-- UKG A — Sep 10
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,3,6,'2025-09-10','present',1),(1,1,3,7,'2025-09-10','absent',1),
  (1,1,3,8,'2025-09-10','present',1),(1,1,3,9,'2025-09-10','present',1),
  (1,1,3,10,'2025-09-10','present',1);

-- Grade 1 A — Sep 8
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,4,11,'2025-09-08','present',2),(1,1,4,12,'2025-09-08','present',2),
  (1,1,4,13,'2025-09-08','present',2),(1,1,4,14,'2025-09-08','present',2);
-- Grade 1 A — Sep 9
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,4,11,'2025-09-09','absent',2),(1,1,4,12,'2025-09-09','present',2),
  (1,1,4,13,'2025-09-09','present',2),(1,1,4,14,'2025-09-09','half_day',2);
-- Grade 1 A — Sep 10
INSERT INTO student_attendance (school_id,location_id,class_id,student_id,date,status,marked_by)
VALUES
  (1,1,4,11,'2025-09-10','present',2),(1,1,4,12,'2025-09-10','present',2),
  (1,1,4,13,'2025-09-10','present',2),(1,1,4,14,'2025-09-10','present',2);

-- ── Curriculum Activities ─────────────────────────────────────
INSERT INTO curriculum_activities (school_id, location_id, class_id, uploaded_by, uploaded_by_name, title, description, activity_date)
VALUES
  (1,1,2,1,'Neha Verma',  'Colour Mixing Fun',          'Kids explored primary colours and created orange, green and purple!','2025-09-10'),
  (1,1,2,1,'Neha Verma',  'Story Time — The Lion & Mouse','Read aloud session; kids acted out parts','2025-09-09'),
  (1,1,3,1,'Neha Verma',  'Nature Walk',                 'Collected leaves for EVS project on plants','2025-09-09'),
  (1,1,3,1,'Neha Verma',  'Number Patterns',             'UKG counting 1–100 with beads and abacus','2025-09-08'),
  (1,1,4,2,'Suresh Kumar','Computer Intro',              'Intro to mouse and keyboard, typed their names','2025-09-10'),
  (1,1,4,2,'Suresh Kumar','Hindi Writing Practice',      'Practised ka, kha, ga in notebooks','2025-09-08'),
  (1,1,1,2,'Suresh Kumar','Sensory Play',                'Sand and water play for fine motor development','2025-09-10'),
  (1,1,2,1,'Neha Verma',  'Phonics — Short Vowels',      'CVC words: cat, bat, hat, mat','2025-09-06');

-- ── Announcements ─────────────────────────────────────────────
INSERT INTO announcements (title, body, type, target_role, is_active, expires_at, created_by)
VALUES
  ('School Closed — Gandhi Jayanti', 'School will be closed on 2 October for Gandhi Jayanti. Classes resume on 3 October.', 'info', 'all', 1, '2025-10-03 00:00:00', 1),
  ('Annual Day Rehearsals Start', 'Annual Day rehearsals begin 15 September. Students in LKG & UKG should bring white uniforms.', 'info', 'all', 1, '2025-10-20 00:00:00', 1),
  ('Fee Reminder — October Due', 'October monthly tuition is due by 5th October. Kindly pay on time to avoid the late fee.', 'warning', 'all', 1, '2025-10-10 00:00:00', 1);

-- ── Timetable (LKG A — Mon to Fri) ───────────────────────────
INSERT INTO timetable (school_id, location_id, class_id, day_of_week, period_number, start_time, end_time, subject_id, teacher_id)
VALUES
  -- Monday
  (1,1,2,1,1,'08:30','09:15',1,1),  -- English
  (1,1,2,1,2,'09:15','10:00',2,1),  -- Math
  (1,1,2,1,3,'10:15','11:00',3,1),  -- EVS
  (1,1,2,1,4,'11:00','11:45',5,1),  -- Art
  -- Tuesday
  (1,1,2,2,1,'08:30','09:15',2,1),
  (1,1,2,2,2,'09:15','10:00',1,1),
  (1,1,2,2,3,'10:15','11:00',5,1),
  -- Wednesday
  (1,1,2,3,1,'08:30','09:15',1,1),
  (1,1,2,3,2,'09:15','10:00',3,1),
  (1,1,2,3,3,'10:15','11:00',2,1),
  -- Thursday
  (1,1,2,4,1,'08:30','09:15',2,1),
  (1,1,2,4,2,'09:15','10:00',1,1),
  (1,1,2,4,3,'10:15','11:00',3,1),
  (1,1,2,4,4,'11:00','11:45',5,1),
  -- Friday
  (1,1,2,5,1,'08:30','09:15',1,1),
  (1,1,2,5,2,'09:15','10:00',2,1),
  (1,1,2,5,3,'10:15','11:00',5,1);

SELECT 'Seed complete!' AS status;
SELECT COUNT(*) AS users      FROM users;
SELECT COUNT(*) AS students   FROM students;
SELECT COUNT(*) AS staff_rows FROM staff;
SELECT COUNT(*) AS classes    FROM classes;
SELECT COUNT(*) AS invoices   FROM invoices;
SELECT COUNT(*) AS exams      FROM exams;
SELECT COUNT(*) AS marks      FROM student_marks;
SELECT COUNT(*) AS expenses   FROM expenses;
SELECT COUNT(*) AS inquiries  FROM inquiries;
