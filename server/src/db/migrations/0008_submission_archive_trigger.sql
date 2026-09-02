CREATE FUNCTION archive_submission_before_update() RETURNS trigger AS $$
BEGIN
  INSERT INTO submission_history (
    submission_id, form_id, form_version_id, data, legacy_data, status,
    submitted_by, migrated_from_submission_id, edited_by, active_from, active_to
  ) VALUES (
    OLD.id, OLD.form_id, OLD.form_version_id, OLD.data, OLD.legacy_data, OLD.status,
    OLD.submitted_by, OLD.migrated_from_submission_id,
    NULLIF(current_setting('app.edited_by', true), ''), OLD.updated_at, now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER submissions_archive_before_update
BEFORE UPDATE ON submissions
FOR EACH ROW
WHEN (OLD.status = 'submitted' AND (OLD.data IS DISTINCT FROM NEW.data OR OLD.legacy_data IS DISTINCT FROM NEW.legacy_data))
EXECUTE FUNCTION archive_submission_before_update();
