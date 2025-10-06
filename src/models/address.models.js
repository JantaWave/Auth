import { db } from "../config/db.js";

class AddressModel {
  // Internal helper to fetch a single row
  static async _single(query, params) {
    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  // Find or create state
  static async getOrCreateState(stateName) {
    const state = await this._single(
      "SELECT state_id FROM states WHERE state_name = $1",
      [stateName.trim()],
    );
    if (state) return state.state_id;

    const newState = await this._single(
      "INSERT INTO states (state_name) VALUES ($1) RETURNING state_id",
      [stateName.trim()],
    );
    return newState.state_id;
  }

  // Find or create district
  static async getOrCreateDistrict(districtName, stateId) {
    const district = await this._single(
      "SELECT district_id FROM districts WHERE district_name = $1 AND state_id = $2",
      [districtName.trim(), stateId],
    );
    if (district) return district.district_id;

    const newDistrict = await this._single(
      "INSERT INTO districts (district_name, state_id) VALUES ($1, $2) RETURNING district_id",
      [districtName.trim(), stateId],
    );
    return newDistrict.district_id;
  }

  // Find or create block
  static async getOrCreateBlock(blockName, districtId) {
    const block = await this._single(
      "SELECT block_id FROM blocks WHERE block_name = $1 AND district_id = $2",
      [blockName.trim(), districtId],
    );
    if (block) return block.block_id;

    const newBlock = await this._single(
      "INSERT INTO blocks (block_name, district_id) VALUES ($1, $2) RETURNING block_id",
      [blockName.trim(), districtId],
    );
    return newBlock.block_id;
  }

  // Find or create village
  static async getOrCreateVillage(villageName, blockId) {
    const village = await this._single(
      "SELECT village_id FROM villages WHERE village_name = $1 AND block_id = $2",
      [villageName.trim(), blockId],
    );
    if (village) return village.village_id;

    const newVillage = await this._single(
      "INSERT INTO villages (village_name, block_id) VALUES ($1, $2) RETURNING village_id",
      [villageName.trim(), blockId],
    );
    return newVillage.village_id;
  }

  // Get or create complete address hierarchy and return village_id
  static async resolveAddress(state, district, block, village) {
    const stateId = await this.getOrCreateState(state);
    const districtId = await this.getOrCreateDistrict(district, stateId);
    const blockId = await this.getOrCreateBlock(block, districtId);
    const villageId = await this.getOrCreateVillage(village, blockId);
    return villageId;
  }

  // Get complete address details by village_id
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

  // Search villages by name (partial match)
  static async searchVillages(searchTerm, limit = 10) {
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
    const { rows } = await db.query(query, [`%${searchTerm}%`, limit]);
    return rows;
  }

  // Get all villages in a block
  static async getVillagesByBlock(blockId) {
    const query = `
      SELECT village_id, village_name
      FROM villages
      WHERE block_id = $1
      ORDER BY village_name
    `;
    const { rows } = await db.query(query, [blockId]);
    return rows;
  }

  // Get all blocks in a district
  static async getBlocksByDistrict(districtId) {
    const query = `
      SELECT block_id, block_name
      FROM blocks
      WHERE district_id = $1
      ORDER BY block_name
    `;
    const { rows } = await db.query(query, [districtId]);
    return rows;
  }

  // Get all districts in a state
  static async getDistrictsByState(stateId) {
    const query = `
      SELECT district_id, district_name
      FROM districts
      WHERE state_id = $1
      ORDER BY district_name
    `;
    const { rows } = await db.query(query, [stateId]);
    return rows;
  }

  // Get all states
  static async getAllStates() {
    const query = "SELECT state_id, state_name FROM states ORDER BY state_name";
    const { rows } = await db.query(query);
    return rows;
  }
}

export default AddressModel;
