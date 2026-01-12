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
    console.log("Activity Created", activity);

    // Invalidate both leader and actor activity caches
    await Promise.all([
      invalidate(`activity:${targetUserId}:*`),
      invalidate(`myactivity:${actorId}:*`),
    ]);

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

  /* ---------------- GET MY ACTIVITY ---------------- */
  static async getMyActivity(userId, limit = 20, cursor = null) {
    const cacheKey = `myactivity:${userId}:l${limit}:c${cursor || "first"}`;
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
          ae.target_user_id,
          u.id AS target_id,
          u.first_name AS target_first_name,
          u.last_name AS target_last_name,
          u.avatar_url AS target_avatar_url
        FROM activity_events ae
        JOIN users u ON u.id = ae.target_user_id
        WHERE ae.actor_id = $1
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

  /* ---------------- GET COMBINED ACTIVITY FEED ---------------- */
  static async getCombinedActivity(userId, limit = 20, cursor = null) {
    const cacheKey = `combined:${userId}:l${limit}:c${cursor || "first"}`;
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
          ae.actor_id,
          ae.target_user_id,
          CASE 
            WHEN ae.actor_id = $1 THEN 'outgoing'
            ELSE 'incoming'
          END AS activity_direction,
          actor.first_name AS actor_first_name,
          actor.last_name AS actor_last_name,
          actor.avatar_url AS actor_avatar_url,
          target.first_name AS target_first_name,
          target.last_name AS target_last_name,
          target.avatar_url AS target_avatar_url
        FROM activity_events ae
        JOIN users actor ON actor.id = ae.actor_id
        JOIN users target ON target.id = ae.target_user_id
        WHERE (ae.actor_id = $1 OR ae.target_user_id = $1)
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

  /* ---------------- GET ACTIVITY STATS ---------------- */
  static async getActivityStats(userId) {
    const cacheKey = `activity:stats:${userId}`;
    return getOrSetCache(cacheKey, 60, async () => {
      const stats = await this._single(
        `
        SELECT
          COUNT(*) FILTER (WHERE actor_id = $1) AS my_activities_count,
          COUNT(*) FILTER (WHERE target_user_id = $1) AS received_activities_count,
          COUNT(DISTINCT entity_type) FILTER (WHERE actor_id = $1) AS unique_entity_types,
          MAX(created_at) FILTER (WHERE actor_id = $1) AS last_activity_at
        FROM activity_events
        WHERE actor_id = $1 OR target_user_id = $1
        `,
        [userId],
      );

      return {
        myActivitiesCount: parseInt(stats?.my_activities_count || 0),
        receivedActivitiesCount: parseInt(
          stats?.received_activities_count || 0,
        ),
        uniqueEntityTypes: parseInt(stats?.unique_entity_types || 0),
        lastActivityAt: stats?.last_activity_at || null,
      };
    });
  }

  /* ---------------- DELETE ACTIVITY ---------------- */
  static async delete(activityId, actorId) {
    const activity = await this._single(
      `
      DELETE FROM activity_events
      WHERE id = $1 AND actor_id = $2
      RETURNING *
      `,
      [activityId, actorId],
    );

    if (activity) {
      await Promise.all([
        invalidate(`activity:${activity.target_user_id}:*`),
        invalidate(`myactivity:${actorId}:*`),
        invalidate(`combined:${actorId}:*`),
        invalidate(`combined:${activity.target_user_id}:*`),
        invalidate(`activity:stats:${actorId}`),
      ]);
    }

    return activity;
  }
}

export default ActivityModel;
