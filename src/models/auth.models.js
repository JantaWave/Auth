import { db } from "../config/db.js";

class UserModel {
  // Internal helper to fetch a single row
  static async _single(query, params) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  // Sanitize user object before returning
  static sanitizeUser(user) {
    if (!user) return null;
    const sanitized = { ...user };
    delete sanitized.hashed_mpin;
    return sanitized;
  }

  // Fetch user by ID
  static async findById(id) {
    const user = await this._single("SELECT * FROM users WHERE id = $1", [id]);
    return this.sanitizeUser(user);
  }

  // Fetch user by mobile number
  static async findByMobile(contact) {
    const user = await this._single("SELECT * FROM users WHERE contact = $1", [
      contact,
    ]);
    return this.sanitizeUser(user);
  }

  // Check if a user exists by mobile
  static async existsByMobile(contact) {
    const { rows } = await db.query(
      "SELECT 1 FROM users WHERE contact = $1 LIMIT 1",
      [contact],
    );
    return rows.length > 0;
  }

  // Create a new user
  static async create(payload, hashed_mpin) {
    const query = `
      INSERT INTO users 
        (first_name, last_name, hashed_mpin, contact, date_of_birth, state, district, block, village)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      payload.first_name.trim().toLowerCase(),
      payload.last_name.trim().toLowerCase(),
      hashed_mpin,
      payload.contact,
      payload.date_of_birth || null,
      payload.state.trim(),
      payload.district.trim(),
      payload.block.trim(),
      payload.village.trim(),
    ];

    const user = await this._single(query, values);
    return this.sanitizeUser(user);
  }

  // Update user fields
  static async update(id, updates = {}) {
    if (Object.keys(updates).length === 0) return await this.findById(id);

    const cols = [];
    const values = [];
    let i = 1;

    for (const [key, value] of Object.entries(updates)) {
      cols.push(`${key} = $${i}`);
      values.push(value);
      i++;
    }

    values.push(id);

    const query = `
      UPDATE users 
      SET ${cols.join(", ")}, updated_at = NOW()
      WHERE id = $${i}
      RETURNING *
    `;

    const updatedUser = await this._single(query, values);
    return this.sanitizeUser(updatedUser);
  }

  // Update last login timestamp and set online
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

  // Set online/offline status
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

  // Increment login attempts and set lockUntil
  static async incrementLoginAttempts(userId, attempts, lockUntil) {
    return this.update(userId, {
      login_attempts: attempts,
      lock_until: lockUntil,
    });
  }

  // Reset login attempts after successful login
  static async resetLoginAttempts(userId) {
    return this.update(userId, { login_attempts: 0, lock_until: null });
  }
}

export default UserModel;
