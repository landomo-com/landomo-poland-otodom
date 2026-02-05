-- Landomo Brazil QuintoAndar - Scraper Database (Tier 1)
-- Stores raw data, change history, and monitoring metadata

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Property snapshots - stores raw data at each scrape
CREATE TABLE property_snapshots (
  id BIGSERIAL PRIMARY KEY,
  portal_id TEXT NOT NULL,
  scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),
  raw_data JSONB NOT NULL,
  checksum TEXT NOT NULL,
  price NUMERIC,
  status TEXT,
  transaction_type TEXT,

  -- Indexes
  CONSTRAINT property_snapshots_portal_id_scraped_at_key UNIQUE (portal_id, scraped_at)
);

CREATE INDEX idx_property_snapshots_portal_id ON property_snapshots(portal_id);
CREATE INDEX idx_property_snapshots_scraped_at ON property_snapshots(scraped_at);
CREATE INDEX idx_property_snapshots_checksum ON property_snapshots(checksum);
CREATE INDEX idx_property_snapshots_price ON property_snapshots(price) WHERE price IS NOT NULL;

-- Property changes - detailed change tracking
CREATE TABLE property_changes (
  id BIGSERIAL PRIMARY KEY,
  portal_id TEXT NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  change_type TEXT NOT NULL, -- 'price', 'description', 'status', 'images', 'details'
  field_name TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,

  -- Reference to snapshots
  snapshot_id BIGINT REFERENCES property_snapshots(id)
);

CREATE INDEX idx_property_changes_portal_id ON property_changes(portal_id);
CREATE INDEX idx_property_changes_changed_at ON property_changes(changed_at);
CREATE INDEX idx_property_changes_change_type ON property_changes(change_type);

-- Property metadata - aggregated info per property
CREATE TABLE property_metadata (
  portal_id TEXT PRIMARY KEY,
  first_seen TIMESTAMP NOT NULL,
  last_seen TIMESTAMP NOT NULL,
  last_changed TIMESTAMP,
  scrape_count INTEGER DEFAULT 1,
  change_count INTEGER DEFAULT 0,
  current_status TEXT,
  current_price NUMERIC,
  price_changes_count INTEGER DEFAULT 0,
  avg_days_between_changes NUMERIC,

  -- Change rate (for adaptive scheduling)
  change_rate NUMERIC DEFAULT 0.0,

  -- Updated timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_metadata_last_seen ON property_metadata(last_seen);
CREATE INDEX idx_property_metadata_change_rate ON property_metadata(change_rate);
CREATE INDEX idx_property_metadata_current_status ON property_metadata(current_status);

-- Scrape runs - track each discovery/scraping session
CREATE TABLE scrape_runs (
  id BIGSERIAL PRIMARY KEY,
  run_type TEXT NOT NULL, -- 'city', 'geo'
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'

  -- Stats
  properties_discovered INTEGER DEFAULT 0,
  properties_changed INTEGER DEFAULT 0,
  properties_unchanged INTEGER DEFAULT 0,
  properties_new INTEGER DEFAULT 0,
  properties_inactive INTEGER DEFAULT 0,

  -- Errors
  errors_count INTEGER DEFAULT 0,
  error_details JSONB,

  -- Performance
  duration_seconds INTEGER,
  avg_processing_time_ms NUMERIC
);

CREATE INDEX idx_scrape_runs_started_at ON scrape_runs(started_at);
CREATE INDEX idx_scrape_runs_status ON scrape_runs(status);

-- Worker stats - track worker performance
CREATE TABLE worker_stats (
  id BIGSERIAL PRIMARY KEY,
  worker_id TEXT NOT NULL,
  scrape_run_id BIGINT REFERENCES scrape_runs(id),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMP,

  -- Counters
  processed_count INTEGER DEFAULT 0,
  changed_count INTEGER DEFAULT 0,
  unchanged_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,

  -- Performance
  avg_processing_time_ms NUMERIC,
  properties_per_minute NUMERIC
);

CREATE INDEX idx_worker_stats_worker_id ON worker_stats(worker_id);
CREATE INDEX idx_worker_stats_scrape_run_id ON worker_stats(scrape_run_id);

-- Geographic areas - for adaptive scheduling
CREATE TABLE geographic_areas (
  id SERIAL PRIMARY KEY,
  area_name TEXT UNIQUE NOT NULL,
  area_type TEXT NOT NULL, -- 'city', 'region', 'grid_cell'

  -- Coordinates (for grid cells)
  lat NUMERIC,
  lng NUMERIC,

  -- Scheduling
  change_rate NUMERIC DEFAULT 0.0,
  scrape_interval_hours INTEGER DEFAULT 6,
  last_scraped TIMESTAMP,
  next_scrape TIMESTAMP,

  -- Stats
  total_properties INTEGER DEFAULT 0,
  active_properties INTEGER DEFAULT 0,
  avg_changes_per_scrape NUMERIC DEFAULT 0.0,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geographic_areas_area_name ON geographic_areas(area_name);
CREATE INDEX idx_geographic_areas_next_scrape ON geographic_areas(next_scrape);
CREATE INDEX idx_geographic_areas_change_rate ON geographic_areas(change_rate);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER property_metadata_updated_at
  BEFORE UPDATE ON property_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER geographic_areas_updated_at
  BEFORE UPDATE ON geographic_areas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Views for analytics

-- Recent changes
CREATE VIEW recent_changes AS
SELECT
  pc.portal_id,
  pc.changed_at,
  pc.change_type,
  pc.field_name,
  pc.old_value,
  pc.new_value,
  pm.current_price,
  pm.current_status
FROM property_changes pc
JOIN property_metadata pm ON pc.portal_id = pm.portal_id
WHERE pc.changed_at > NOW() - INTERVAL '7 days'
ORDER BY pc.changed_at DESC;

-- Property change summary
CREATE VIEW property_change_summary AS
SELECT
  portal_id,
  first_seen,
  last_seen,
  last_changed,
  scrape_count,
  change_count,
  CASE
    WHEN scrape_count > 0 THEN (change_count::NUMERIC / scrape_count::NUMERIC)
    ELSE 0
  END as change_rate_calc,
  price_changes_count,
  EXTRACT(EPOCH FROM (last_seen - first_seen)) / 86400 as days_active,
  current_status,
  current_price
FROM property_metadata
ORDER BY change_count DESC;

-- High-change properties (for priority scheduling)
CREATE VIEW high_change_properties AS
SELECT
  portal_id,
  change_rate,
  change_count,
  scrape_count,
  last_changed,
  current_price,
  current_status
FROM property_metadata
WHERE change_rate > 0.15  -- More than 15% change rate
ORDER BY change_rate DESC;

-- Area scheduling priorities
CREATE VIEW area_scheduling_priorities AS
SELECT
  area_name,
  area_type,
  change_rate,
  scrape_interval_hours,
  last_scraped,
  next_scrape,
  total_properties,
  active_properties,
  CASE
    WHEN next_scrape < NOW() THEN 'OVERDUE'
    WHEN next_scrape < NOW() + INTERVAL '1 hour' THEN 'DUE_SOON'
    ELSE 'SCHEDULED'
  END as scheduling_status
FROM geographic_areas
ORDER BY next_scrape ASC;

-- Comments for documentation
COMMENT ON TABLE property_snapshots IS 'Stores full raw data snapshot at each scrape';
COMMENT ON TABLE property_changes IS 'Detailed change tracking for each field modification';
COMMENT ON TABLE property_metadata IS 'Aggregated metadata and statistics per property';
COMMENT ON TABLE scrape_runs IS 'Tracks each scraping session with stats and errors';
COMMENT ON TABLE worker_stats IS 'Performance tracking for individual workers';
COMMENT ON TABLE geographic_areas IS 'Area-based scheduling with adaptive intervals';
