import { db } from "../config/db.js";

class UserModel {
  static async _single(query, params) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  static async findById(id) {
    return this._single("SELECT * FROM users WHERE id = $1", [id]);
  }

  static async findByMobile(contact) {
    return this._single("SELECT * FROM users WHERE contact = $1", [contact]);
  }

  static async existsByMobile(contact) {
    const { rows } = await db.query(
      "SELECT 1 FROM users WHERE contact = $1 LIMIT 1",
      [contact],
    );
    return rows.length > 0;
  }

  static async create(payload, hashed_mpin) {
    const q = `
      INSERT INTO users (first_name, last_name, hashed_mpin, contact, date_of_birth, state, district, block, village)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `;

    const vals = [
      payload.first_name.toLowerCase(),
      payload.last_name.toLowerCase(),
      hashed_mpin,
      payload.contact,
      payload.date_of_birth || null,
      payload.state,
      payload.district,
      payload.block,
      payload.village,
    ];

    const user = await this._single(q, vals);
    return this.sanitizeUser(user);
    9962910000;
  }

  static async update(id, updates = {}) {
    if (Object.keys(updates).length === 0) return this.findById(id);

    const cols = [];
    const vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      cols.push(`${k} = $${i}`);
      vals.push(v);
      i++;
    }

    vals.push(id);
    const q = `UPDATE users SET ${cols.join(", ")}, updated_at = NOW() WHERE id = $${i} RETURNING *`;
    return this._single(q, vals);
  }

  // Lightweight helpers used by services
  static async updateLastLogin(userId) {
    const query = `
      UPDATE users 
      SET last_seen = NOW(), is_online = true, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async setOnlineStatus(id, isOnline) {
    return this.update(id, { is_online: isOnline, last_seen: new Date() });
  }

  static async incrementLoginAttempts(id, attempts, lockUntil) {
    return this.update(id, { login_attempts: attempts, lock_until: lockUntil });
  }

  static async resetLoginAttempts(id) {
    return this.update(id, { login_attempts: 0, lock_until: null });
  }
  static sanitizeUser(user) {
    if (!user) return null;

    const sanitized = { ...user };
    delete sanitized.hashed_mpin;

    return sanitized;
  }
}

export default UserModel;
