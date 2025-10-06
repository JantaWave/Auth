import { db } from "../config/db.js";
import AddressModel from "./AddressModel.js";

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

  // Fetch user by ID with complete address details
  static async findById(id) {
    const query = `
      SELECT 
        u.*,
        v.village_name AS village_normalized,
        b.block_name AS block_normalized,
        d.district_name AS district_normalized,
        s.state_name AS state_normalized
      FROM users u
      LEFT JOIN villages v ON u.village_id = v.village_id
      LEFT JOIN blocks b ON v.block_id = b.block_id
      LEFT JOIN districts d ON b.district_id = d.district_id
      LEFT JOIN states s ON d.state_id = s.state_id
      WHERE u.id = $1
    `;
    const user = await this._single(query, [id]);
    return this.sanitizeUser(user);
  }

  // Fetch user by mobile number with complete address details
  static async findByMobile(contact) {
    const query = `
      SELECT 
        u.*,
        v.village_name AS village_normalized,
        b.block_name AS block_normalized,
        d.district_name AS district_normalized,
        s.state_name AS state_normalized
      FROM users u
      LEFT JOIN villages v ON u.village_id = v.village_id
      LEFT JOIN blocks b ON v.block_id = b.block_id
      LEFT JOIN districts d ON b.district_id = d.district_id
      LEFT JOIN states s ON d.state_id = s.state_id
      WHERE u.contact = $1
    `;
    const user = await this._single(query, [contact]);
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

  // Create a new user (with normalized address)
  static async create(payload, hashed_mpin) {
    // Resolve address hierarchy using AddressModel
    const villageId = await AddressModel.resolveAddress(
      payload.state,
      payload.district,
      payload.block,
      payload.village,
    );

    const query = `
      INSERT INTO users 
        (first_name, last_name, hashed_mpin, contact, date_of_birth, 
         state, district, block, village, village_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      villageId,
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

  // Update user address (if they move to a new village)
  static async updateAddress(userId, state, district, block, village) {
    // Resolve new address
    const villageId = await AddressModel.resolveAddress(
      state,
      district,
      block,
      village,
    );

    // Update both old columns and new village_id
    return await this.update(userId, {
      state: state.trim(),
      district: district.trim(),
      block: block.trim(),
      village: village.trim(),
      village_id: villageId,
    });
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

  // Get all users from the same village
  static async findByVillage(villageId) {
    const query = `
      SELECT 
        u.*,
        v.village_name AS village_normalized,
        b.block_name AS block_normalized,
        d.district_name AS district_normalized,
        s.state_name AS state_normalized
      FROM users u
      LEFT JOIN villages v ON u.village_id = v.village_id
      LEFT JOIN blocks b ON v.block_id = b.block_id
      LEFT JOIN districts d ON b.district_id = d.district_id
      LEFT JOIN states s ON d.state_id = s.state_id
      WHERE u.village_id = $1
    `;
    const { rows } = await db.query(query, [villageId]);
    return rows.map((user) => this.sanitizeUser(user));
  }

  // Get all users from same village by village name
  static async findByVillageName(villageName) {
    const query = `
      SELECT 
        u.*,
        v.village_name AS village_normalized,
        b.block_name AS block_normalized,
        d.district_name AS district_normalized,
        s.state_name AS state_normalized
      FROM users u
      JOIN villages v ON u.village_id = v.village_id
      JOIN blocks b ON v.block_id = b.block_id
      JOIN districts d ON b.district_id = d.district_id
      JOIN states s ON d.state_id = s.state_id
      WHERE v.village_name = $1
    `;
    const { rows } = await db.query(query, [villageName]);
    return rows.map((user) => this.sanitizeUser(user));
  }
}

export default UserModel;
