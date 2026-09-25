-- A published binding version is immutable: forms snapshot it, and its
-- rules govern every value committed under it. Enforced here, in the
-- database, so no code path -- or hand-run SQL -- can rewrite or remove one.
-- A new version is published instead.
CREATE FUNCTION forbid_published_binding_version_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'binding % version % is published and cannot be changed', OLD.key, OLD.version
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER binding_versions_published_are_immutable
  BEFORE UPDATE OR DELETE ON binding_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_published_binding_version_change();
