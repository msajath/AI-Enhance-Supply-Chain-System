-- Disable PASSWORD_RESET_ENABLED and deploy first; then apply approved rollback.
DROP TABLE password_reset_tokens;
