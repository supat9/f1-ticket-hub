BEGIN;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_product_check;

UPDATE tickets SET product = CASE product
    WHEN 'dr_ease' THEN 'customer_portal'
    WHEN 'ease_pos' THEN 'checkout'
END, details_version = details_version + 1
WHERE product IN ('dr_ease', 'ease_pos');

ALTER TABLE tickets ADD CONSTRAINT tickets_product_check
    CHECK (product IN ('', 'customer_portal', 'checkout'));

COMMIT;
