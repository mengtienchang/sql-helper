CREATE SEQUENCE IF NOT EXISTS financial_report_id_seq;
ALTER TABLE financial_report ALTER COLUMN id SET DEFAULT nextval('financial_report_id_seq');

CREATE SEQUENCE IF NOT EXISTS factory_id_seq;
ALTER TABLE factory ALTER COLUMN id SET DEFAULT nextval('factory_id_seq');

CREATE SEQUENCE IF NOT EXISTS metric_id_seq;
ALTER TABLE metric ALTER COLUMN id SET DEFAULT nextval('metric_id_seq');

CREATE SEQUENCE IF NOT EXISTS chart_id_seq;
ALTER TABLE chart ALTER COLUMN id SET DEFAULT nextval('chart_id_seq');

CREATE SEQUENCE IF NOT EXISTS dashboard_id_seq;
ALTER TABLE dashboard ALTER COLUMN id SET DEFAULT nextval('dashboard_id_seq');

CREATE SEQUENCE IF NOT EXISTS dashboard_item_id_seq;
ALTER TABLE dashboard_item ALTER COLUMN id SET DEFAULT nextval('dashboard_item_id_seq');

CREATE SEQUENCE IF NOT EXISTS chat_session_id_seq;
ALTER TABLE chat_session ALTER COLUMN id SET DEFAULT nextval('chat_session_id_seq');

CREATE SEQUENCE IF NOT EXISTS chat_message_id_seq;
ALTER TABLE chat_message ALTER COLUMN id SET DEFAULT nextval('chat_message_id_seq');

CREATE SEQUENCE IF NOT EXISTS export_template_id_seq;
ALTER TABLE export_template ALTER COLUMN id SET DEFAULT nextval('export_template_id_seq')
