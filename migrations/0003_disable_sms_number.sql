-- The confirmed business phone is voice-only; never expose it as an SMS CTA.
UPDATE site_settings SET sms_number = '' WHERE id = 1;
