-- Initialize illustrative rates once. Future rate changes belong to admin settings.
ALTER TABLE site_settings ADD COLUMN financing_config_json TEXT;

UPDATE site_settings
SET financing_config_json = '{"version":1,"illustrative":true,"rates":{"excellent":{"36":5.99,"48":5.99,"60":5.99,"72":5.99},"very_good":{"36":6.99,"48":6.99,"60":6.99,"72":6.99},"good":{"36":7.99,"48":7.99,"60":7.99,"72":7.99}}}'
WHERE id = 1 AND financing_config_json IS NULL;
