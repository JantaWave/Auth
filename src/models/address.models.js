import { db } from "../config/db.js";

class AddressModel {
  static async _single(query, params) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  // STATE
  static async getOrCreateState(name) {
    const state = await this._single(
      `SELECT state_id FROM states WHERE state_name = $1`,
      [name.trim()],
    );
    if (state) return state.state_id;

    const created = await this._single(
      `INSERT INTO states (state_name) VALUES ($1) RETURNING state_id`,
      [name.trim()],
    );
    return created.state_id;
  }

  // DISTRICT
  static async getOrCreateDistrict(name, stateId) {
    const district = await this._single(
      `SELECT district_id FROM districts WHERE district_name = $1 AND state_id = $2`,
      [name.trim(), stateId],
    );
    if (district) return district.district_id;

    const created = await this._single(
      `INSERT INTO districts (district_name, state_id) VALUES ($1, $2) RETURNING district_id`,
      [name.trim(), stateId],
    );
    return created.district_id;
  }

  // BLOCK
  static async getOrCreateBlock(name, districtId) {
    const block = await this._single(
      `SELECT block_id FROM blocks WHERE block_name = $1 AND district_id = $2`,
      [name.trim(), districtId],
    );
    if (block) return block.block_id;

    const created = await this._single(
      `INSERT INTO blocks (block_name, district_id) VALUES ($1, $2) RETURNING block_id`,
      [name.trim(), districtId],
    );
    return created.block_id;
  }

  // VILLAGE
  static async getOrCreateVillage(name, blockId) {
    const village = await this._single(
      `SELECT village_id FROM villages WHERE village_name = $1 AND block_id = $2`,
      [name.trim(), blockId],
    );
    if (village) return village.village_id;

    const created = await this._single(
      `INSERT INTO villages (village_name, block_id) VALUES ($1, $2) RETURNING village_id`,
      [name.trim(), blockId],
    );
    return created.village_id;
  }

  // Resolve full address hierarchy
  static async resolveAddress(state, district, block, village) {
    const stateId = await this.getOrCreateState(state);
    const districtId = await this.getOrCreateDistrict(district, stateId);
    const blockId = await this.getOrCreateBlock(block, districtId);
    const villageId = await this.getOrCreateVillage(village, blockId);
    return villageId;
  }

  // Get address by village ID
  static async getAddressByVillageId(villageId) {
    const query = `
      SELECT 
        v.village_id,
        v.village_name,
        b.block_id,
        b.block_name,
        d.district_id,
        d.district_name,
        s.state_id,
        s.state_name
      FROM villages v
      JOIN blocks b ON v.block_id = b.block_id
      JOIN districts d ON b.district_id = d.district_id
      JOIN states s ON d.state_id = s.state_id
      WHERE v.village_id = $1
    `;
    return await this._single(query, [villageId]);
  }

  // Search villages
  static async searchVillages(term, limit = 10) {
    const query = `
      SELECT 
        v.village_id,
        v.village_name,
        b.block_name,
        d.district_name,
        s.state_name
      FROM villages v
      JOIN blocks b ON v.block_id = b.block_id
      JOIN districts d ON b.district_id = d.district_id
      JOIN states s ON d.state_id = s.state_id
      WHERE v.village_name ILIKE $1
      LIMIT $2
    `;
    const { rows } = await db.query(query, [`%${term}%`, limit]);
    return rows;
  }

  static async getVillagesByBlock(blockId) {
    const { rows } = await db.query(
      `SELECT village_id, village_name FROM villages WHERE block_id = $1 ORDER BY village_name`,
      [blockId],
    );
    return rows;
  }

  static async getBlocksByDistrict(districtId) {
    const { rows } = await db.query(
      `SELECT block_id, block_name FROM blocks WHERE district_id = $1 ORDER BY block_name`,
      [districtId],
    );
    return rows;
  }

  static async getDistrictsByState(stateId) {
    const { rows } = await db.query(
      `SELECT district_id, district_name FROM districts WHERE state_id = $1 ORDER BY district_name`,
      [stateId],
    );
    return rows;
  }

  static async getAllStates() {
    const { rows } = await db.query(
      `SELECT state_id, state_name, created_at FROM states ORDER BY state_name;`,
    );
    return rows;
  }

  static async getAllDistricts() {
    const { rows } = await db.query(`
      SELECT 
        d.district_id AS id,
        d.district_name AS name,
        d.created_at,
        s.state_id,
        s.state_name
      FROM districts d
      LEFT JOIN states s ON d.state_id = s.state_id
      ORDER BY s.state_name, d.district_name;
    `);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      state: { id: r.state_id, name: r.state_name },
    }));
  }

  static async getAllBlocks() {
    const { rows } = await db.query(`
      SELECT 
        b.block_id AS id,
        b.block_name AS name,
        b.created_at,
        d.district_id,
        d.district_name,
        s.state_id,
        s.state_name
      FROM blocks b
      LEFT JOIN districts d ON d.district_id = b.district_id
      LEFT JOIN states s ON s.state_id = d.state_id
      ORDER BY s.state_name, d.district_name, b.block_name;
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      district: {
        id: r.district_id,
        name: r.district_name,
        state: { id: r.state_id, name: r.state_name },
      },
    }));
  }

  static async getAllVillages() {
    const { rows } = await db.query(`
      SELECT 
        v.village_id AS id,
        v.village_name AS name,
        v.created_at,
        b.block_id,
        b.block_name,
        d.district_id,
        d.district_name,
        s.state_id,
        s.state_name
      FROM villages v
      LEFT JOIN blocks b ON b.block_id = v.block_id
      LEFT JOIN districts d ON d.district_id = b.district_id
      LEFT JOIN states s ON s.state_id = d.state_id
      ORDER BY s.state_name, d.district_name, b.block_name, v.village_name;
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      block: {
        id: r.block_id,
        name: r.block_name,
        district: {
          id: r.district_id,
          name: r.district_name,
          state: { id: r.state_id, name: r.state_name },
        },
      },
    }));
  }

  static async getAllVillagesCount() {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS village_count FROM villages`,
    );
    return rows[0];
  }
}

export default AddressModel;
