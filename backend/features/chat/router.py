from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from db import connection
from schemas import ChatMessageCreate, ChatMessageOut, ConversationSummary

router = APIRouter(prefix="/v1/chat", tags=["chat"])


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations(user_id: UUID = Query(...)):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  c.id AS conversation_id,
                  c.match_id,
                  m.listing_id,
                  CASE
                    WHEN m.user_one = %s::uuid THEN m.user_two
                    ELSE m.user_one
                  END AS other_user_id,
                  op.display_name AS other_display_name,
                  (
                    SELECT msg.created_at FROM messages msg
                    WHERE msg.conversation_id = c.id
                    ORDER BY msg.created_at DESC LIMIT 1
                  ) AS last_message_at
                FROM conversations c
                JOIN matches m ON m.id = c.match_id
                JOIN profiles op ON op.id = (
                  CASE
                    WHEN m.user_one = %s::uuid THEN m.user_two
                    ELSE m.user_one
                  END
                )
                WHERE m.user_one = %s::uuid OR m.user_two = %s::uuid
                ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
                """,
                (str(user_id), str(user_id), str(user_id), str(user_id)),
            )
            rows = cur.fetchall()
    return [
        ConversationSummary(
            conversation_id=r["conversation_id"],
            match_id=r["match_id"],
            listing_id=r["listing_id"],
            other_user_id=r["other_user_id"],
            other_display_name=r["other_display_name"],
            last_message_at=r.get("last_message_at"),
        )
        for r in rows
    ]


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageOut])
def list_messages(
    conversation_id: UUID,
    user_id: UUID = Query(...),
    limit: int = Query(100, ge=1, le=200),
):
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM conversations c
                JOIN matches m ON m.id = c.match_id
                WHERE c.id = %s
                  AND (m.user_one = %s::uuid OR m.user_two = %s::uuid)
                """,
                (str(conversation_id), str(user_id), str(user_id)),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Conversation not found")

            cur.execute(
                """
                SELECT id, conversation_id, sender_id, body, image_url, created_at
                FROM messages
                WHERE conversation_id = %s
                ORDER BY created_at ASC
                LIMIT %s
                """,
                (str(conversation_id), limit),
            )
            rows = cur.fetchall()
    return [
        ChatMessageOut(
            id=r["id"],
            conversation_id=r["conversation_id"],
            sender_id=r["sender_id"],
            body=r.get("body") or "",
            image_url=r.get("image_url"),
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.post("/conversations/{conversation_id}/messages", response_model=ChatMessageOut)
def post_message(conversation_id: UUID, body: ChatMessageCreate):
    b = (body.body or "").strip()
    img = (body.image_url or "").strip() or None
    if not b and not img:
        raise HTTPException(status_code=400, detail="body or image_url required")

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id
                FROM conversations c
                JOIN matches m ON m.id = c.match_id
                WHERE c.id = %s
                  AND (m.user_one = %s::uuid OR m.user_two = %s::uuid)
                """,
                (str(conversation_id), str(body.user_id), str(body.user_id)),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Conversation not found")

            cur.execute(
                """
                INSERT INTO messages (conversation_id, sender_id, body, image_url)
                VALUES (%s, %s, %s, %s)
                RETURNING id, conversation_id, sender_id, body, image_url, created_at
                """,
                (str(conversation_id), str(body.user_id), b or "", img),
            )
            r = cur.fetchone()
            conn.commit()

    return ChatMessageOut(
        id=r["id"],
        conversation_id=r["conversation_id"],
        sender_id=r["sender_id"],
        body=r.get("body") or "",
        image_url=r.get("image_url"),
        created_at=r["created_at"],
    )
