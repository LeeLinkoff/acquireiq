-- AcquireIQ demonstration data
-- 39 rows total across the six required domain tables.
-- Includes parallel approvers at the same stage_sequence and an open protest.

BEGIN;

TRUNCATE TABLE protests, contracts, approvals, acquisition_requests, vendors, users
    RESTART IDENTITY CASCADE;

INSERT INTO users (name, email, role) VALUES
    ('Maya Chen', 'maya.chen@example.gov', 'requestor'),
    ('Daniel Brooks', 'daniel.brooks@example.gov', 'requestor'),
    ('Priya Shah', 'priya.shah@example.gov', 'requestor'),
    ('Elena Torres', 'elena.torres@example.gov', 'approver'),
    ('Marcus Reed', 'marcus.reed@example.gov', 'approver'),
    ('Nina Patel', 'nina.patel@example.gov', 'approver'),
    ('James Walker', 'james.walker@example.gov', 'contracting_officer'),
    ('Alicia Grant', 'alicia.grant@example.gov', 'contracting_officer');

INSERT INTO vendors (name, cage_code, contact_email, active) VALUES
    ('Northstar Systems LLC', '1A2B3', 'contracts@northstar.example', TRUE),
    ('Civic Data Partners', '4C5D6', 'federal@civicdata.example', TRUE),
    ('Blue Ridge Cyber Solutions', '7E8F9', 'contracts@blueridge.example', TRUE),
    ('Atlas Infrastructure Group', '2G3H4', 'gov@atlasinfra.example', TRUE),
    ('Legacy Office Technologies', '5J6K7', 'sales@legacyoffice.example', FALSE);

INSERT INTO acquisition_requests
    (title, description, requestor_id, status, priority, budget_ceiling, fiscal_year, created_at)
VALUES
    ('Zero Trust Network Modernization', 'Modernize agency network access controls and segmentation.', 1, 'in_review', 'critical', 2500000.00, 2027, NOW() - INTERVAL '28 days'),
    ('Records Search Platform', 'Replace the legacy records search application with a modern web platform.', 2, 'submitted', 'high', 850000.00, 2027, NOW() - INTERVAL '20 days'),
    ('Endpoint Security Refresh', 'Refresh endpoint detection and response tooling for managed workstations.', 3, 'approved', 'high', 1200000.00, 2027, NOW() - INTERVAL '45 days'),
    ('Cloud Cost Analytics', 'Provide cloud usage reporting and cost optimization dashboards.', 1, 'awarded', 'medium', 475000.00, 2026, NOW() - INTERVAL '90 days'),
    ('Accessibility Testing Services', 'Independent accessibility testing for public digital services.', 2, 'draft', 'medium', 300000.00, 2027, NOW() - INTERVAL '4 days'),
    ('Data Center Power Upgrade', 'Upgrade power distribution and monitoring in the primary data center.', 3, 'rejected', 'high', 1800000.00, 2026, NOW() - INTERVAL '75 days'),
    ('Secure Collaboration Pilot', 'Pilot a secure collaboration platform for distributed program teams.', 1, 'in_review', 'medium', 225000.00, 2027, NOW() - INTERVAL '14 days'),
    ('Laptop Lifecycle Replacement', 'Replace end-of-life laptops for field personnel.', 2, 'awarded', 'low', 650000.00, 2026, NOW() - INTERVAL '120 days');

-- Request 1 demonstrates a parallel stage: Elena and Marcus both belong to
-- stage_sequence 1. The request cannot advance based on only one decision.
INSERT INTO approvals
    (acquisition_request_id, approver_id, stage_name, stage_sequence, decision, decided_at, notes)
VALUES
    (1, 4, 'Technical Review', 1, 'approved', NOW() - INTERVAL '2 days', 'Architecture is supportable.'),
    (1, 5, 'Technical Review', 1, 'pending', NULL, NULL),
    (1, 6, 'Contracting Review', 2, 'pending', NULL, NULL),
    (2, 4, 'Technical Review', 1, 'pending', NULL, NULL),
    (2, 5, 'Technical Review', 1, 'pending', NULL, NULL),
    (3, 4, 'Technical Review', 1, 'approved', NOW() - INTERVAL '18 days', 'Security requirements addressed.'),
    (3, 5, 'Technical Review', 1, 'approved', NOW() - INTERVAL '17 days', 'Operations review complete.'),
    (3, 6, 'Contracting Review', 2, 'approved', NOW() - INTERVAL '12 days', 'Ready for award action.'),
    (4, 4, 'Technical Review', 1, 'approved', NOW() - INTERVAL '70 days', 'Approved.'),
    (4, 6, 'Contracting Review', 2, 'approved', NOW() - INTERVAL '65 days', 'Approved for award.'),
    (6, 4, 'Technical Review', 1, 'rejected', NOW() - INTERVAL '60 days', 'Scope requires substantial revision.'),
    (7, 5, 'Technical Review', 1, 'pending', NULL, NULL);

INSERT INTO contracts
    (acquisition_request_id, vendor_id, award_date, contract_value, period_of_performance_end, status)
VALUES
    (4, 2, CURRENT_DATE - 55, 440000.00, CURRENT_DATE + 310, 'active'),
    (8, 1, CURRENT_DATE - 95, 610000.00, CURRENT_DATE + 270, 'active'),
    (3, 3, CURRENT_DATE - 8, 1150000.00, CURRENT_DATE + 357, 'active');

-- Request 2 has an unresolved protest. The other examples demonstrate resolved history.
INSERT INTO protests
    (acquisition_request_id, filed_at, resolved_at, resolution, reason)
VALUES
    (2, NOW() - INTERVAL '6 days', NULL, NULL, 'Vendor challenges the evaluation criteria.'),
    (4, NOW() - INTERVAL '80 days', NOW() - INTERVAL '72 days', 'Denied', 'Challenge to solicitation terms.'),
    (8, NOW() - INTERVAL '110 days', NOW() - INTERVAL '100 days', 'Withdrawn', 'Vendor withdrew after agency clarification.');

COMMIT;
