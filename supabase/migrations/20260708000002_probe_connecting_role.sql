DO $$
BEGIN
  RAISE NOTICE 'db_push_connecting_role: current_user=%, session_user=%', current_user, session_user;
END $$;
