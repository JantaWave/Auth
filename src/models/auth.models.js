import { db } from "../config/db.js";

class UserModel {
  // Fetch single row helper
  static async _single(query, params) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  // Fetch many rows helper
  static async _many(query, params) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  // Remove sensitive fields
  static sanitizeUser(user) {
    if (!user) return null;
    const clean = { ...user };
    delete clean.hashed_mpin;
    return clean;
  }

  // Common SELECT for user + address
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

  // Fetch user by ID
  static async findById(id) {
    const query = this.baseUserSelect() + ` WHERE u.id = $1`;
    const user = await this._single(query, [id]);
    return this.sanitizeUser(user);
  }

  static async findByMobileRaw(contact) {
    const query = this.baseUserSelect() + ` WHERE u.contact = $1`;
    return await this._single(query, [contact]);
  }

  // Fetch user by mobile
  static async findByMobile(contact) {
    const query = this.baseUserSelect() + ` WHERE u.contact = $1`;
    const user = await this._single(query, [contact]);
    return this.sanitizeUser(user);
  }

  // Simple existence check
  static async existsByMobile(contact) {
    const { rows } = await db.query(
      `SELECT 1 FROM users WHERE contact = $1 LIMIT 1`,
      [contact],
    );
    return rows.length > 0;
  }

  // Create user
  static async create(payload, hashed_mpin) {
    const query = `
      INSERT INTO users 
        (first_name, last_name, hashed_mpin, contact, date_of_birth, village_id, gender)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      payload.first_name.trim().toLowerCase(),
      payload.last_name.trim().toLowerCase(),
      hashed_mpin,
      payload.contact,
      payload.date_of_birth || null,
      payload.village_id,
      payload.gender,
    ];

    const user = await this._single(query, values);
    return this.sanitizeUser(user);
  }

  // Update user
  static async update(id, updates = {}) {
    if (!Object.keys(updates).length) return await this.findById(id);

    const columns = [];
    const values = [];
    let index = 1;

    for (const [key, value] of Object.entries(updates)) {
      columns.push(`${key} = $${index}`);
      values.push(value);
      index++;
    }

    values.push(id);

    const query = `
      UPDATE users 
      SET ${columns.join(", ")}, updated_at = NOW()
      WHERE id = $${index}
      RETURNING *
    `;

    const updated = await this._single(query, values);
    return this.sanitizeUser(updated);
  }

  // Verify contact
  static async verifyContact(contact) {
    const query = `
      UPDATE users
      SET is_contact_verified = true, updated_at = NOW()
      WHERE contact = $1 AND is_contact_verified = false
      RETURNING *
    `;
    const user = await this._single(query, [contact]);
    return this.sanitizeUser(user);
  }

  // Update address by village_id
  static async updateAddress(userId, village_id) {
    return await this.update(userId, { village_id });
  }

  // Update last login
  static async updateLastLogin(userId) {
    const query = `
      UPDATE users 
      SET last_seen = NOW(), is_online = true, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const user = await this._single(query, [userId]);
    return this.sanitizeUser(user);
  }

  // Set online/offline
  static async setOnlineStatus(userId, isOnline) {
    const query = `
      UPDATE users 
      SET is_online = $1, last_seen = NOW(), updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const user = await this._single(query, [isOnline, userId]);
    return this.sanitizeUser(user);
  }

  // Manage login attempts
  static async incrementLoginAttempts(id, attempts, lockUntil) {
    return this.update(id, { login_attempts: attempts, lock_until: lockUntil });
  }

  static async resetLoginAttempts(id) {
    return this.update(id, { login_attempts: 0, lock_until: null });
  }

  // Users by village_id
  static async findUsersByVillage(villageId) {
    const query = this.baseUserSelect() + ` WHERE u.village_id = $1`;
    const { rows } = await db.query(query, [villageId]);
    return rows.map(this.sanitizeUser);
  }

  // Search by village name
  static async findUsersByVillageName(name) {
    const query = this.baseUserSelect() + ` WHERE v.village_name = $1`;
    const { rows } = await db.query(query, [name]);
    return rows.map(this.sanitizeUser);
  }

  // User stats
  static async getAllUserStats() {
    const query = `
      SELECT
        COUNT(*) AS total_user,
        SUM(CASE WHEN role = 'leader' THEN 1 ELSE 0 END) AS total_leader
      FROM users;
    `;
    const { rows } = await db.query(query);
    return rows[0];
  }

  // Get all users filtered
  static async getAllUsers(search = "", role = "") {
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
      params.push(role.trim());
      query += ` AND u.role = $${params.length}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const { rows } = await db.query(query, params);
    return rows.map(this.sanitizeUser);
  }

  // Get leaders
  static async getLeaders(searchQuery, currentUserId) {
    const sql = `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.avatar_url,
      lps.followers_count,
      lps.following_count,
      lps.posts_count,
      lps.streams_count

    FROM users u
    LEFT JOIN leader_profile_stats lps ON lps.user_id = u.id

    WHERE u.role = 'leader'
      AND u.id != $2
      AND (
        u.first_name ILIKE $1
        OR u.last_name ILIKE $1
      )

    ORDER BY lps.followers_count DESC
    LIMIT 20;
  `;

    return this._many(sql, [`%${searchQuery}%`, currentUserId]);
  }

  static async getProfileWithStats(targetUserId, currentViewerId) {
    const query = `
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

          -- Stats from view
          COALESCE(lps.followers_count, 0) AS followers_count,
          COALESCE(lps.following_count, 0) AS following_count,
          COALESCE(lps.posts_count, 0) AS posts_count,
          COALESCE(lps.streams_count, 0) AS streams_count,

          -- Is current viewer following this leader
          EXISTS (
            SELECT 1
            FROM follows
            WHERE follower_id = $2
              AND following_id = u.id
          ) AS is_following

        FROM users u
        LEFT JOIN villages v ON u.village_id = v.village_id
        LEFT JOIN blocks b ON v.block_id = b.block_id
        LEFT JOIN districts d ON b.block_id = d.district_id
        LEFT JOIN states s ON d.district_id = s.state_id

        -- Join leader stats view
        LEFT JOIN leader_profile_stats lps ON lps.user_id = u.id

        WHERE u.id = $1
          AND u.role = 'leader';
    `;

    return await this._single(query, [targetUserId, currentViewerId]);
  }

  static async follow(followerId, targetUserId) {
    const query = `
      INSERT INTO follows (follower_id, following_id)
      VALUES ($1, $2)
      ON CONFLICT (follower_id, following_id) DO NOTHING
      RETURNING id;
    `;
    return await this._single(query, [followerId, targetUserId]);
  }

  static async unfollow(followerId, targetUserId) {
    const query = `
      DELETE FROM follows 
      WHERE follower_id = $1 AND following_id = $2
      RETURNING id;
    `;
    return await this._single(query, [followerId, targetUserId]);
  }
}

export default UserModel;
