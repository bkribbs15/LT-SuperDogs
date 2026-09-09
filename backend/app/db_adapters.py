"""
Database adapter for user operations (SQLite).
"""
from typing import Optional, List, Dict, Any
from datetime import datetime


def _row_to_user(row) -> Dict[str, Any]:
    return {
        'user_id': row['user_id'],
        'email': row['email'],
        'username': row['username'],
        'display_name': row['display_name'] if row['display_name'] else row['username'],
        'nickname': row['nickname'],
        'password_hash': row['password_hash'],
        'is_admin': bool(row['is_admin']),
        'is_active': bool(row['is_active']),
        'must_change_password': bool(row['must_change_password']),
        'pending_approval': bool(row['pending_approval']),
        'email_reminders': bool(row['email_reminders']) if 'email_reminders' in row.keys() and row['email_reminders'] is not None else True,
        'email_results': bool(row['email_results']) if 'email_results' in row.keys() and row['email_results'] is not None else True,
        'created_at': datetime.fromisoformat(row['created_at']) if row['created_at'] else None,
        'updated_at': datetime.fromisoformat(row['updated_at']) if row['updated_at'] else None,
    }


class UserAdapter:
    """Adapter for user-related database operations"""

    @staticmethod
    def get_by_email(session, email: str) -> Optional[Dict[str, Any]]:
        row = session.execute("SELECT * FROM users WHERE lower(email) = lower(?)", (str(email),)).fetchone()
        return _row_to_user(row) if row else None

    @staticmethod
    def get_by_id(session, user_id: str) -> Optional[Dict[str, Any]]:
        row = session.execute("SELECT * FROM users WHERE user_id = ?", (str(user_id),)).fetchone()
        return _row_to_user(row) if row else None

    @staticmethod
    def create(session, user_id: str, email: str, username: str, password_hash: str,
               is_admin: bool = False, is_active: bool = True, display_name: str = None,
               nickname: str = None, pending_approval: bool = False) -> None:
        now = datetime.utcnow()
        if not display_name:
            display_name = username
        session.execute(
            """
            INSERT INTO users (user_id, email, username, display_name, nickname, password_hash,
                               is_admin, is_active, pending_approval, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, email, username, display_name, nickname, password_hash,
                1 if is_admin else 0, 1 if is_active else 0, 1 if pending_approval else 0,
                now.isoformat(), now.isoformat()
            ),
        )
        session.commit()

    @staticmethod
    def get_all(session) -> List[Dict[str, Any]]:
        rows = session.execute("SELECT * FROM users").fetchall()
        return [_row_to_user(r) for r in rows]

    @staticmethod
    def set_flag(session, user_id: str, field: str, value: bool) -> None:
        assert field in ("is_admin", "is_active", "pending_approval", "must_change_password")
        session.execute(f"UPDATE users SET {field} = ? WHERE user_id = ?", (1 if value else 0, str(user_id)))
        session.commit()

    @staticmethod
    def set_password(session, user_id: str, password_hash: str, must_change: bool) -> None:
        session.execute(
            "UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE user_id = ?",
            (password_hash, 1 if must_change else 0, datetime.utcnow().isoformat(), str(user_id)),
        )
        session.commit()
