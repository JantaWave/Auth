import { db } from "../config/db.js";
import { getOrSetCache } from "../utils/cache.js";

class AddressModel {
  /* ---------------- HELPERS ---------------- */
  static async _single(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  static async _many(query, params = []) {
    const { rows } = await db.query(query, params);
    return rows;
  }

  /* ---------------- WRITE (NO CACHE) ---------------- */

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

  static async getOrCreateDistrict(name, stateId) {
    const district = await this._single(
      `SELECT district_id FROM districts WHERE district_name = $1 AND state_id = $2`,
      [name.trim(), stateId],
    );
    if (district) return district.district_id;

    const created = await this._single(
      `INSERT INTO districts (district_name, state_id)
       VALUES ($1, $2) RETURNING district_id`,
      [name.trim(), stateId],
    );
    return created.district_id;
  }

  static async getOrCreateBlock(name, districtId) {
    const block = await this._single(
      `SELECT block_id FROM blocks WHERE block_name = $1 AND district_id = $2`,
      [name.trim(), districtId],
    );
    if (block) return block.block_id;

    const created = await this._single(
      `INSERT INTO blocks (block_name, district_id)
       VALUES ($1, $2) RETURNING block_id`,
      [name.trim(), districtId],
    );
    return created.block_id;
  }

  static async getOrCreateVillage(name, blockId) {
    const village = await this._single(
      `SELECT village_id FROM villages WHERE village_name = $1 AND block_id = $2`,
      [name.trim(), blockId],
    );
    if (village) return village.village_id;

    const created = await this._single(
      `INSERT INTO villages (village_name, block_id)
       VALUES ($1, $2) RETURNING village_id`,
      [name.trim(), blockId],
    );
    return created.village_id;
  }

  static async resolveAddress(state, district, block, village) {
    const stateId = await this.getOrCreateState(state);
    const districtId = await this.getOrCreateDistrict(district, stateId);
    const blockId = await this.getOrCreateBlock(block, districtId);
    return await this.getOrCreateVillage(village, blockId);
  }

  /* ---------------- READ (CACHED) ---------------- */

  static async getAddressByVillageId(villageId) {
    return getOrSetCache(
      `address:village:${villageId}`,
      86400,
      async () =>
        await this._single(
          `
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
        `,
          [villageId],
        ),
    );
  }

  static async searchVillages(term, limit = 10) {
    return getOrSetCache(
      `search:villages:${term}:${limit}`,
      60,
      async () =>
        await this._many(
          `
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
        `,
          [`%${term}%`, limit],
        ),
    );
  }

  static async getVillagesByBlock(blockId) {
    return getOrSetCache(
      `villages:block:${blockId}`,
      86400,
      async () =>
        await this._many(
          `SELECT village_id, village_name
           FROM villages
           WHERE block_id = $1
           ORDER BY village_name`,
          [blockId],
        ),
    );
  }

  static async getBlocksByDistrict(districtId) {
    return getOrSetCache(
      `blocks:district:${districtId}`,
      86400,
      async () =>
        await this._many(
          `SELECT block_id, block_name
           FROM blocks
           WHERE district_id = $1
           ORDER BY block_name`,
          [districtId],
        ),
    );
  }

  static async getDistrictsByState(stateId) {
    return getOrSetCache(
      `districts:state:${stateId}`,
      86400,
      async () =>
        await this._many(
          `SELECT district_id, district_name
           FROM districts
           WHERE state_id = $1
           ORDER BY district_name`,
          [stateId],
        ),
    );
  }

  static async getAllStates() {
    return getOrSetCache(
      `states:all`,
      86400,
      async () =>
        await this._many(
          `SELECT state_id, state_name, created_at
           FROM states
           ORDER BY state_name`,
        ),
    );
  }
  static async getAllDistricts() {
    const query = `
    SELECT 
      d.district_id AS id,
      d.district_name AS name,
      d.created_at,
      s.state_id,
      s.state_name
    FROM districts d
    LEFT JOIN states s ON s.state_id = d.state_id
    ORDER BY s.state_name, d.district_name;
  `;

    const { rows } = await db.query(query);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      state: {
        id: r.state_id,
        name: r.state_name,
      },
    }));
  }

  static async getAllBlocks() {
    const query = `
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
  `;

    const { rows } = await db.query(query);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      district: {
        id: r.district_id,
        name: r.district_name,
      },
      state: {
        id: r.state_id,
        name: r.state_name,
      },
    }));
  }

  static async getAllVillages() {
    const query = `
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
    ORDER BY 
      s.state_name,
      d.district_name,
      b.block_name,
      v.village_name;
  `;

    const { rows } = await db.query(query);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      block: {
        id: r.block_id,
        name: r.block_name,
      },
      district: {
        id: r.district_id,
        name: r.district_name,
      },
      state: {
        id: r.state_id,
        name: r.state_name,
      },
    }));
  }

  static async getAllVillagesCount() {
    return getOrSetCache(
      `villages:count`,
      300,
      async () =>
        (await db.query(`SELECT COUNT(*)::int AS village_count FROM villages`))
          .rows[0],
    );
  }
}

export default AddressModel;
