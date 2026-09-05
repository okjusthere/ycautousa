-- Trade/Sell lead details and optional Chinese site copy.
ALTER TABLE leads ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE site_settings ADD COLUMN hero_title_zh TEXT;
ALTER TABLE site_settings ADD COLUMN hero_subtitle_zh TEXT;
ALTER TABLE site_settings ADD COLUMN about_text_zh TEXT;
ALTER TABLE site_settings ADD COLUMN why_choose_text_zh TEXT;
ALTER TABLE site_settings ADD COLUMN seo_title_zh TEXT;
ALTER TABLE site_settings ADD COLUMN seo_description_zh TEXT;
