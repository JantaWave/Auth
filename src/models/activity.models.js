import { db } from "../config/db.js";
import { getOrSetCache, invalidate } from "../utils/cache.js";

class ActivityModel {
  /* ---------------- HELPERS ---------------- */
  static async _single(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  static async _many(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  /* ---------------- CREATE ACTIVITY ---------------- */
  static async create({
    actorId,
    targetUserId,
    entityType,
    entityId,
    action,
    metadata = {},
  }) {
    const activity = await this._single(
      `
      INSERT INTO activity_events
        (actor_id, target_user_id, entity_type, entity_id, action, metadata)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        actorId,
        targetUserId,
        entityType,
        entityId,
        action,
        JSON.stringify(metadata),
      ],
    );

    // invalidate leader activity cache
    await invalidate([`activity:${targetUserId}:*`]);

    return activity;
  }

  /* ---------------- GET LEADER ACTIVITY ---------------- */
  static async getForLeader(userId, limit = 20, cursor = null) {
    const cacheKey = `activity:${userId}:l${limit}:c${cursor || "first"}`;

    return getOrSetCache(cacheKey, 15, async () => {
      const activities = await this._many(
        `
        SELECT
          ae.id,
          ae.action,
          ae.entity_type,
          ae.entity_id,
          ae.metadata,
          ae.created_at,

          u.id AS actor_id,
          u.first_name,
          u.last_name,
          u.avatar_url

        FROM activity_events ae
        JOIN users u ON u.id = ae.actor_id
        WHERE ae.target_user_id = $1
          AND ($3::timestamp IS NULL OR ae.created_at < $3)
        ORDER BY ae.created_at DESC
        LIMIT $2
        `,
        [userId, limit, cursor],
      );

      return {
        activities,
        nextCursor: activities.length
          ? activities[activities.length - 1].created_at
          : null,
      };
    });
  }
}

export default ActivityModel;
