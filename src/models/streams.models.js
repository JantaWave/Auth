// import { db } from "../config/db.js";
// import { nanoid } from "nanoid";
//
// class StreamModel {
//   static async _single(query, params) {
//     const { rows } = await db.query(query, params);
//     return rows[0] || null;
//   }
//   static async _many(query, params) {
//     const { rows } = await db.query(query, params);
//     return rows;
//   }
//
//   static async addStreams(
//     sessionId,
//     userId,
//     title,
//     description,
//     thumbnailUrl,
//     scheduledStartTime,
//     youtubeStreamKey,
//     facebookKey,
//     instagramKey,
//     overlays,
//     shareUrls,
//   ) {
//     const token = nanoid(7);
//     await db.query(
//       `INSERT INTO streams
//         (id, user_id, title, description, thumbnail_url, scheduled_start_time, youtube_key, facebook_key, instagram_key, overlays,share_urls, status,token)
//         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11, 'scheduled',$12)`,
//       [
//         sessionId,
//         userId,
//         title,
//         description,
//         thumbnailUrl,
//         scheduledStartTime,
//         youtubeStreamKey,
//         facebookKey,
//         instagramKey,
//         JSON.stringify(overlays || {}),
//         JSON.stringify(shareUrls),
//         token,
//       ],
//     );
//   }
//
//   static async getStreams(sessionId) {
//     const result = await this._single(
//       `SELECT * FROM streams WHERE id = $1 LIMIT 1`,
//       [sessionId],
//     );
//     return result;
//   }
//
//   static async getStreamsFromToken(token) {
//     const result = await this._single(
//       `SELECT * FROM streams WHERE token = $1 LIMIT 1`,
//       [token],
//     );
//     return result;
//   }
//
//   static async getAllUserStreams(userId) {
//     const result = await this._many(
//       `SELECT * FROM streams WHERE user_id = $1`,
//       [userId],
//     );
//     return result;
//   }
// }
//
// export default StreamModel;

// src/models/stream.model.js
import { db } from "../config/db.js";

class StreamModel {
  static async add(session) {
    await db.query(
      `INSERT INTO streams
       (id, user_id, title, description, thumbnail_url, scheduled_start_time,
        youtube_key, facebook_key, instagram_key, overlays, share_urls, status, token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scheduled',$12)`,
      [
        session.id,
        session.userId,
        session.title,
        session.description,
        session.thumbnailUrl,
        session.scheduledStartTime,
        session.youtubeKey,
        session.facebookKey,
        session.instagramKey,
        JSON.stringify(session.overlays),
        JSON.stringify(session.shareUrls),
        session.token,
      ],
    );
  }

  static async getAllUserStreams(userId) {
    const { rows } = await db.query(
      `SELECT * FROM streams WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  static async get(sessionId) {
    const { rows } = await db.query(
      `SELECT * FROM streams WHERE id = $1 LIMIT 1`,
      [sessionId],
    );
    return rows[0] || null;
  }

  static async updateStatus(sessionId, status) {
    await db.query(
      `UPDATE streams SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, sessionId],
    );
  }
}

export default StreamModel;
