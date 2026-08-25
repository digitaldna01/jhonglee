"""Social — anonymous likes and comments (planned).

Reserved slot in the skeleton. When built it follows the same shape as
the other features:

  router.py      /api/social/posts/{slug}/likes, /comments
  service.py     rules (one like per visitor per post, comment limits)
  repository.py  SQLAlchemy queries
  models.py      tables registered on core.db.Base (+ Alembic migration)
  schemas.py

Identity is the anonymous visitor id from core.deps.get_visitor_id;
post slugs are validated through content.service.exists().
"""
