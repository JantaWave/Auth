import { db } from "../config/db.js";

class UserModel {
  /* ---------------- HELPERS ---------------- */

  static async _single(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  static async _many(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  static sanitizeUser(user) {
    if (!user) return null;
    const clean = { ...user };
    delete clean.hashed_mpin;
    return clean;
  }

  static baseUserSelect() {
    return `
      SELECT 
        u.*,
        v.village_name AS village_normalized,
        b.block_id,
        b.block_name AS block_normalized,
        d.district_id,
        d.district_name AS district_normalized,
        s.state_id,
        s.state_name AS state_normalized
      FROM users u
      LEFT JOIN villages v ON u.village_id = v.village_id
      LEFT JOIN blocks b ON v.block_id = b.block_id
      LEFT JOIN districts d ON b.district_id = d.district_id
      LEFT JOIN states s ON d.state_id = s.state_id
    `;
  }

  /* ---------------- FINDERS ---------------- */

  static async findById(id) {
    const user = await this._single(
      this.baseUserSelect() + ` WHERE u.id = $1`,
      [id],
    );
    return this.sanitizeUser(user);
  }

  static async findByMobile(contact) {
    const user = await this._single(
      this.baseUserSelect() + ` WHERE u.contact = $1`,
      [contact],
    );
    return this.sanitizeUser(user);
  }

  static async findByMobileRaw(contact) {
    return await this._single(this.baseUserSelect() + ` WHERE u.contact = $1`, [
      contact,
    ]);
  }

  static async existsByMobile(contact) {
    const { rowCount } = await db.query(
      `SELECT 1 FROM users WHERE contact = $1`,
      [contact],
    );
    return rowCount > 0;
  }

  /* ---------------- CREATE ---------------- */

  static async create(payload, hashed_mpin) {
    const user = await this._single(
      `
      INSERT INTO users
        (first_name, last_name, hashed_mpin, contact, date_of_birth, village_id, gender)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        payload.first_name.trim().toLowerCase(),
        payload.last_name.trim().toLowerCase(),
        hashed_mpin,
        payload.contact,
        payload.date_of_birth || null,
        payload.village_id,
        payload.gender,
      ],
    );

    return this.sanitizeUser(user);
  }

  /* ---------------- UPDATE ---------------- */

  static async update(id, updates = {}) {
    const allowed = [
      "first_name",
      "last_name",
      "avatar_url",
      "bio",
      "village_id",
      "gender",
      "is_online",
      "last_seen",
      "login_attempts",
      "lock_until",
    ];

    const columns = [];
    const values = [];
    let index = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (!allowed.includes(key)) continue;
      columns.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }

    if (!columns.length) return this.findById(id);

    values.push(id);

    const user = await this._single(
      `
      UPDATE users
      SET ${columns.join(", ")}, updated_at = NOW()
      WHERE id = $${index}
      RETURNING *
      `,
      values,
    );

    return this.sanitizeUser(user);
  }

  /* ---------------- AUTH / STATUS ---------------- */

  static async verifyContact(contact) {
    const user = await this._single(
      `
      UPDATE users
      SET is_contact_verified = true, updated_at = NOW()
      WHERE contact = $1 AND is_contact_verified = false
      RETURNING *
      `,
      [contact],
    );
    return this.sanitizeUser(user);
  }

  static async updateLastLogin(userId) {
    return this.update(userId, {
      last_seen: new Date(),
      is_online: true,
    });
  }

  static async setOnlineStatus(userId, isOnline) {
    return this.update(userId, {
      is_online: isOnline,
      last_seen: new Date(),
    });
  }

  static async incrementLoginAttempts(id, attempts, lockUntil) {
    return this.update(id, {
      login_attempts: attempts,
      lock_until: lockUntil,
    });
  }

  static async resetLoginAttempts(id) {
    return this.update(id, {
      login_attempts: 0,
      lock_until: null,
    });
  }

  /* ---------------- SEARCH ---------------- */

  static async getAllUsers(search = "", role = "", limit = 50, offset = 0) {
    let query = this.baseUserSelect() + ` WHERE 1=1 `;
    const params = [];

    if (search.trim()) {
      params.push(`%${search}%`);
      query += `
        AND (
          u.first_name ILIKE $${params.length}
          OR u.last_name ILIKE $${params.length}
          OR u.contact ILIKE $${params.length}
        )
      `;
    }

    if (role.trim()) {
      params.push(role);
      query += ` AND u.role = $${params.length}`;
    }

    params.push(limit, offset);
    query += ` ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const rows = await this._many(query, params);
    return rows.map((u) => this.sanitizeUser(u));
  }

  /* ---------------- LEADERS ---------------- */

  static async getLeaders(searchQuery, currentUserId) {
    // We use %$1% for partial matching.
    // We also concatenate first and last name to allow searching full names.
    return this._many(
      `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.avatar_url,
      COALESCE(lps.followers_count, 0) AS followers_count,
      COALESCE(lps.following_count, 0) AS following_count,
      COALESCE(lps.posts_count, 0) AS posts_count,
      COALESCE(lps.streams_count, 0) AS streams_count
    FROM users u
    LEFT JOIN leader_profile_stats lps ON lps.user_id = u.id
    WHERE u.role = 'leader'
      AND u.id != $2
      AND (
        u.first_name || ' ' || u.last_name ILIKE $1
        OR u.first_name ILIKE $1
        OR u.last_name ILIKE $1
      )
    ORDER BY followers_count DESC, u.first_name ASC
    LIMIT 20
    `,
      [`%${searchQuery}%`, currentUserId],
    );
  }

  static async getProfileWithStats(targetUserId, currentViewerId) {
    return this._single(
      `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.avatar_url,
        u.bio,
        v.village_name,
        b.block_name,
        d.district_name,
        s.state_name,

        COALESCE(lps.followers_count,0) AS followers_count,
        COALESCE(lps.following_count,0) AS following_count,
        COALESCE(lps.posts_count,0) AS posts_count,
        COALESCE(lps.streams_count,0) AS streams_count,

        EXISTS (
          SELECT 1 FROM follows
          WHERE follower_id = $2 AND following_id = u.id
        ) AS is_following

      FROM users u
      LEFT JOIN villages v ON u.village_id = v.village_id
      LEFT JOIN blocks b ON v.block_id = b.block_id
      LEFT JOIN districts d ON b.district_id = d.district_id
      LEFT JOIN states s ON d.state_id = s.state_id
      LEFT JOIN leader_profile_stats lps ON lps.user_id = u.id
      WHERE u.id = $1 AND u.role = 'leader'
      `,
      [targetUserId, currentViewerId],
    );
  }

  /* ---------------- FOLLOW ---------------- */

  static async follow(followerId, targetUserId) {
    return this._single(
      `
      INSERT INTO follows (follower_id, following_id)
      VALUES ($1,$2)
      ON CONFLICT DO NOTHING
      RETURNING id
      `,
      [followerId, targetUserId],
    );
  }

  static async unfollow(followerId, targetUserId) {
    return this._single(
      `
      DELETE FROM follows
      WHERE follower_id = $1 AND following_id = $2
      RETURNING id
      `,
      [followerId, targetUserId],
    );
  }
}

export default UserModel;
