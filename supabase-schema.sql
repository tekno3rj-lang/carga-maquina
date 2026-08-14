-- Execute este SQL no SQL Editor do seu novo projeto Supabase.
-- As mesmas tabelas do banco antigo, mas em um projeto separado para não haver interferência.

CREATE TABLE maquinas (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE app_config (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER PUBLICATION supabase_realtime ADD TABLE maquinas;
ALTER PUBLICATION supabase_realtime ADD TABLE app_config;

-- ============================================================
-- CONTROLE DE ACESSO (Supabase Auth + RLS)
-- Roles no JWT: app_metadata.role = 'admin' | 'editor' | 'visualizador'
-- admin/editor: leitura e escrita | visualizador: somente leitura
-- ============================================================

ALTER TABLE maquinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado
CREATE POLICY "maquinas_select_autenticados" ON maquinas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "app_config_select_autenticados" ON app_config
  FOR SELECT TO authenticated
  USING (true);

-- Escrita: somente admin e editor
CREATE POLICY "maquinas_write_admin_editor" ON maquinas
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'editor'));

CREATE POLICY "maquinas_update_admin_editor" ON maquinas
  FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'editor'))
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'editor'));

CREATE POLICY "maquinas_delete_admin_editor" ON maquinas
  FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'editor'));

CREATE POLICY "app_config_write_admin_editor" ON app_config
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'editor'));

CREATE POLICY "app_config_update_admin_editor" ON app_config
  FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'editor'))
  WITH CHECK ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'editor'));

CREATE POLICY "app_config_delete_admin_editor" ON app_config
  FOR DELETE TO authenticated
  USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'editor'));

-- ============================================================
-- PRIMEIRO USUÁRIO ADMIN (executar UMA única vez):
-- 1) Crie o usuário em Authentication > Users (ou via função Netlify após deploy).
-- 2) Edite o app_metadata do usuário e adicione: { "role": "admin" }
--    (Authentication > Users > usuário > Editar > app_metadata)
-- ============================================================
